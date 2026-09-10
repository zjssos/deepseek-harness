/**
 * Host Usage Remote owner for the rxlab workbench: the `rxlabUsage` namespace
 * over the `rxlab_usage` storage domain. This package listens to the
 * session-projection change feed for the client-visible `tokenUsage` unit
 * (composed by the token-meter row of the base bundle), attributes each
 * changed session to a workbench module from its cwd under the workspace root,
 * and durably records the session total plus the recomputed module aggregate.
 * It also attributes each work order session's completed turns to the stage
 * named by the latest `job_write_stage` call, exposing the job and per-stage
 * token totals with route-priced cost through `jobUsage`. Like the other rxlab
 * business rows, it mounts its own namespace on the Client side (see
 * `src/client/index.ts`) and never joins the platform `api-remotes` assembly.
 * @module @deepseek-ai/dsh-rxlab-usage
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { addTotals, moduleOfCwd, totalsEqual } from './aggregate.ts'
import { attributeJobUsage, type JobUsageAttribution } from './attribution.ts'
import {
  rxlabUsageDomainSpec,
  type StoredJobUsageRow,
  type StoredModuleUsageRow,
  type StoredSessionUsageRow,
  type StoredStageUsageRow,
} from './domain.ts'
import type { PricingTable, RouteRate } from './pricing.ts'
import type {
  JobId,
  JobUsageRequest,
  JobUsageValue,
  ModuleUsageSummary,
  SessionUsageRequest,
  SessionUsageRow,
  SessionUsageValue,
  UsageSummaryValue,
  UsageTotals,
} from './types.ts'

export type * from './types.ts'

/** The token-meter client-visible projection unit this row accounts for. */
const TOKEN_USAGE_KEY = 'tokenUsage'

/** Module id attributed to workspace-root and unmatched sessions. */
const DEFAULT_MODULE = 'agent'

/** The stage row key within one workbench job. */
function stageUsageKey(jobId: JobId, stage: string): string {
  return `${jobId}:${stage}`
}

/** One module's agent composition entry (subdir only; preset is not needed here). */
interface ModuleAgentEntry {
  readonly preset: string
  readonly subdir: string
}

/**
 * Structural view of the ctx service members this row needs; the real
 * augmentations live in their owning packages (session-projection, session
 * storage, session-persistence, and rxlab-job), which this package must not
 * import back at runtime. Type-only imports of the session event vocabulary are
 * safe: they erase and never reach a bundle.
 */
interface UsageProjectionFeed {
  onChanged(listener: (session: { id: string; header: { cwd?: string } }, key: string, value: unknown, seq: number) => void): () => void
}

interface UsagePaths {
  readonly workspaceRoot: string
  readonly moduleAgents: Readonly<Record<string, ModuleAgentEntry>>
}

/** The live in-memory session store's read face. */
interface LiveSessions {
  get(id: string): { snapshotEvents(): readonly SessionEvent[] } | undefined
}

/** One open read handle onto a durable session log. */
interface DurableReadHandle {
  read(): Promise<{ readonly events: readonly SessionEvent[] }>
  close(): Promise<void>
}

/** The durable session-persistence read face. */
interface DurableSessions {
  stat(id: string): Promise<unknown>
  open(id: string, access: 'read'): Promise<DurableReadHandle>
}

/** One job summary's identity and bound session, as much as this row reads. */
interface JobSessionRow {
  readonly id: JobId
  readonly sessionId?: string | undefined
}

/** The job Remote/controller read face this row resolves a job's session through. */
interface JobReader {
  getJob(request: { readonly id: JobId }): Promise<{ readonly job: { readonly sessionId?: string | undefined } }>
  listJobs(request: { readonly query?: string | undefined }): Promise<{ readonly items: readonly JobSessionRow[] }>
}

/** Cost per token for one configured route's four buckets, in the table currency. */
export interface RouteRateConfig {
  readonly uncachedInput: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

/** Plugin configuration: the optional route rates that turn token totals into cost. */
export interface Config {
  /** Currency shared by every configured route rate; absent leaves `cost` omitted. */
  readonly pricingCurrency?: string
  /** Route key `${provider}/${model}` → per-token rates; absent leaves `cost` omitted. */
  readonly routeRates?: Record<string, RouteRateConfig>
}

/** Config schema; both fields stay optional so a profile that prices nothing loads unchanged. */
export const Config: z<Config> = z.object({
  pricingCurrency: z.string(),
  routeRates: z.dict(z.object({
    uncachedInput: z.number().min(0).required(),
    output: z.number().min(0).required(),
    cacheRead: z.number().min(0).required(),
    cacheWrite: z.number().min(0).required(),
  })),
})

/** Resolve the configured routes into the pure pricing table, or undefined when unpriced. */
function resolvePricing(config: Config): PricingTable | undefined {
  const currency = config.pricingCurrency
  const configured = config.routeRates
  if (currency === undefined || currency.length === 0) return undefined
  if (configured === undefined || Object.keys(configured).length === 0) return undefined
  const routes: Record<string, RouteRate> = {}
  for (const [key, rate] of Object.entries(configured)) {
    routes[key] = {
      uncachedInput: rate.uncachedInput,
      output: rate.output,
      cacheRead: rate.cacheRead,
      cacheWrite: rate.cacheWrite,
    }
  }
  return { currency, routes }
}

/** Wire-shaped snapshot of a projection change; invalid values are ignored. */
function totalsOf(value: unknown): UsageTotals | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const read = (key: string): number | null => {
    const candidate = record[key]
    return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : null
  }
  const uncachedInputTokens = read('uncachedInputTokens')
  const outputTokens = read('outputTokens')
  const cacheReadTokens = read('cacheReadTokens')
  const cacheWriteTokens = read('cacheWriteTokens')
  if (
    uncachedInputTokens === null || outputTokens === null
    || cacheReadTokens === null || cacheWriteTokens === null
  ) return null
  return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

/**
 * Host service backing the generated `ctx.remote.rxlabUsage` namespace.
 * Activation opens the usage domain and subscribes to the projection change
 * feed; every `tokenUsage` change durably upserts the session row, the
 * recomputed module aggregate, and (best effort) the usage of any job bound to
 * that session. Reads answer from the durable tables, so a restart keeps the
 * accounting of sessions the row already observed.
 */
export class UsageController extends TypertRemoteService {
  static inject = ['storageDomain', 'sessionProjections', 'rxlabPaths']

  static Config: z<Config> = Config

  private sessionsTable?: KvTable<string, StoredSessionUsageRow>
  private modulesTable?: KvTable<string, StoredModuleUsageRow>
  private jobsTable?: KvTable<string, StoredJobUsageRow>
  private stageUsageTable?: KvTable<string, StoredStageUsageRow>
  private readonly paths: UsagePaths | undefined
  private readonly pricing: PricingTable | undefined
  private readonly pendingJobSessions = new Set<string>()
  private drainingJobs = false

  /**
   * Register the usage namespace on the Typert Gateway.
   * @param ctx - Host context carrying the storage-domain and projection facilities.
   * @param config - optional per-route pricing rates for job-usage cost.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'usageController', { namespace: 'rxlabUsage' })
    this.paths = ctx.get('rxlabPaths') as UsagePaths | undefined
    this.pricing = resolvePricing(config)
  }

  /** Open the usage domain and subscribe the projection feed for this row's life. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(rxlabUsageDomainSpec)
    this.ctx.effect(() => () => { void domain.close() }, 'rxlab_usage.domainClose')
    this.sessionsTable = domain.table('sessions')
    this.modulesTable = domain.table('modules')
    this.jobsTable = domain.table('jobs')
    this.stageUsageTable = domain.table('stage_usage')
    const feed = this.ctx.get('sessionProjections') as UsageProjectionFeed
    this.ctx.effect(() => {
      const dispose = feed.onChanged((session, key, value, seq) => {
        if (key !== TOKEN_USAGE_KEY) return
        this.scheduleJobRecompute(session.id)
        if (this.paths === undefined) return
        const totals = totalsOf(value)
        if (totals === null) return
        const subdirs: Record<string, string> = {}
        for (const [moduleId, entry] of Object.entries(this.paths.moduleAgents)) {
          subdirs[moduleId] = entry.subdir
        }
        const module = moduleOfCwd(
          session.header.cwd,
          this.paths.workspaceRoot,
          subdirs,
          DEFAULT_MODULE,
        )
        void this.recordUsage(session.id, module, totals, seq)
          .catch((cause: unknown) => {
            this.ctx.logger.warn(`rxlab usage: failed to record session usage (${cause instanceof Error ? cause.message : String(cause)})`)
          })
      })
      return dispose
    }, 'rxlab_usage.projectionFeed')
  }

  /**
   * Durable aggregate set across every module the row has observed.
   * @returns module rows, newest write first.
   */
  @Remote('summary')
  summary(): Promise<UsageSummaryValue> {
    const rows = [...this.requireModules().entries()].map(([, row]) => row)
    rows.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || left.moduleId.localeCompare(right.moduleId))
    return Promise.resolve({ modules: rows.map(toSummary) })
  }

  /**
   * Read durable usage rows for a specific session-id set.
   * @param request - the ids to look up; absent ids yield no entry.
   * @returns rows keyed by session id for every id the row has observed.
   */
  @Remote('sessionUsage')
  sessionUsage(request: SessionUsageRequest): Promise<SessionUsageValue> {
    const sessions: Record<string, SessionUsageRow> = {}
    const table = this.requireSessions()
    for (const id of request.ids) {
      const row = table.get(id)
      if (row !== undefined) {
        sessions[id] = { sessionId: row.sessionId, module: row.module, totals: row.totals, updatedAt: row.updatedAt }
      }
    }
    return Promise.resolve({ sessions })
  }

  /**
   * Aggregated usage of one work order: the job total across every completed
   * session turn, the exact route-priced cost when the configured rates price
   * every turn, and per-stage totals attributed by the newest `job_write_stage`
   * call at or before each turn. Recomputes from the session's authoritative
   * log and upserts the durable `jobs` / `stageUsage` rows.
   * @param request - the work order to read.
   * @returns the job's totals, optional cost, and per-stage usage.
   * @throws RemoteError `job/not-found` when no job carries the id.
   * @throws RemoteError `gateway/internal` when the job controller is unavailable.
   */
  @Remote('jobUsage')
  async jobUsage(request: JobUsageRequest): Promise<JobUsageValue> {
    return this.recomputeJob(request.jobId)
  }

  private async recordUsage(sessionId: string, module: string, totals: UsageTotals, seq = 0): Promise<void> {
    const table = this.requireSessions()
    const previous = table.get(sessionId)
    if (previous !== undefined && previous.module === module && totalsEqual(previous.totals, totals)) {
      return
    }
    const now = new Date().toISOString()
    const stored: StoredSessionUsageRow = {
      sessionId,
      module,
      totals,
      updatedSeq: seq,
      updatedAt: now,
    }
    await table.put(sessionId, stored)
    await this.recomputeModule(module)
  }

  private async recomputeModule(module: string): Promise<void> {
    const modules = this.requireModules()
    let totals = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    let sessionCount = 0
    let updatedAt = ''
    for (const [, row] of this.requireSessions().entries()) {
      if (row.module !== module) continue
      totals = addTotals(totals, row.totals)
      sessionCount += 1
      if (row.updatedAt > updatedAt) updatedAt = row.updatedAt
    }
    await modules.put(module, {
      moduleId: module,
      totals,
      sessionCount,
      updatedAt: updatedAt === '' ? new Date().toISOString() : updatedAt,
    })
  }

  /** Queue one session's job recompute, collapsing a burst into one drained pass. */
  private scheduleJobRecompute(sessionId: string): void {
    this.pendingJobSessions.add(sessionId)
    if (this.drainingJobs) return
    this.drainingJobs = true
    void this.drainJobRecomputes().catch((cause: unknown) => {
      this.ctx.logger.warn(`rxlab usage: failed to recompute job usage (${cause instanceof Error ? cause.message : String(cause)})`)
    })
  }

  private async drainJobRecomputes(): Promise<void> {
    try {
      while (this.pendingJobSessions.size > 0) {
        const wanted = new Set(this.pendingJobSessions)
        this.pendingJobSessions.clear()
        const reader = this.ctx.get('jobController') as JobReader | undefined
        if (reader === undefined) return
        const { items } = await reader.listJobs({})
        for (const item of items) {
          if (item.sessionId === undefined || !wanted.has(item.sessionId)) continue
          await this.recomputeJob(item.id)
        }
      }
    } finally {
      this.drainingJobs = false
    }
  }

  /** Recompute one job's usage from its session log, persist it, and return the wire value. */
  private async recomputeJob(jobId: JobId): Promise<JobUsageValue> {
    const reader = this.ctx.get('jobController') as JobReader | undefined
    if (reader === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab usage cannot resolve work orders without the job controller', {})
    }
    const { job } = await reader.getJob({ id: jobId })
    const events = await this.readSessionEvents(job.sessionId)
    const attribution = attributeJobUsage(events, this.pricing)
    await this.persistJobUsage(jobId, attribution)
    return attribution
  }

  /** Read a job session's events from the live store, else the durable log. */
  private async readSessionEvents(sessionId: string | undefined): Promise<readonly SessionEvent[]> {
    if (sessionId === undefined || sessionId.length === 0) return []
    const sessions = this.ctx.get('sessions') as LiveSessions | undefined
    const live = sessions?.get(sessionId)
    if (live !== undefined) return live.snapshotEvents()
    const persistence = this.ctx.get('sessionPersistence') as DurableSessions | undefined
    if (persistence === undefined) return []
    if (await persistence.stat(sessionId) === undefined) return []
    const handle = await persistence.open(sessionId, 'read')
    try {
      return (await handle.read()).events
    } finally {
      await handle.close()
    }
  }

  /** Upsert one job's totals and its stage rows, removing stages it no longer has. */
  private async persistJobUsage(jobId: JobId, attribution: JobUsageAttribution): Promise<void> {
    const now = new Date().toISOString()
    await this.requireJobs().put(jobId, {
      jobId,
      totals: attribution.totals,
      ...(attribution.cost === undefined ? {} : { cost: attribution.cost }),
      ...(attribution.currency === undefined ? {} : { currency: attribution.currency }),
      updatedAt: now,
    })
    const stages = this.requireStageUsage()
    const written = new Set<string>()
    for (const stage of attribution.stages) {
      const key = stageUsageKey(jobId, stage.stage)
      written.add(key)
      await stages.put(key, {
        jobId,
        stage: stage.stage,
        totals: stage.totals,
        ...(stage.cost === undefined ? {} : { cost: stage.cost }),
        updatedAt: now,
      })
    }
    for (const [key, row] of stages.entries()) {
      if (row.jobId === jobId && !written.has(key)) await stages.delete(key)
    }
  }

  private requireSessions(): KvTable<string, StoredSessionUsageRow> {
    if (this.sessionsTable === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab usage sessions table is not open', {})
    }
    return this.sessionsTable
  }

  private requireModules(): KvTable<string, StoredModuleUsageRow> {
    if (this.modulesTable === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab usage modules table is not open', {})
    }
    return this.modulesTable
  }

  private requireJobs(): KvTable<string, StoredJobUsageRow> {
    if (this.jobsTable === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab usage jobs table is not open', {})
    }
    return this.jobsTable
  }

  private requireStageUsage(): KvTable<string, StoredStageUsageRow> {
    if (this.stageUsageTable === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab usage stageUsage table is not open', {})
    }
    return this.stageUsageTable
  }
}

/** Project one durable module row onto the wire summary type. */
function toSummary(row: StoredModuleUsageRow): ModuleUsageSummary {
  return { moduleId: row.moduleId, totals: row.totals, sessionCount: row.sessionCount, updatedAt: row.updatedAt }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host business API and Remote namespace owner for rxlab usage. */
    usageController: UsageController
  }
}

export default UsageController
