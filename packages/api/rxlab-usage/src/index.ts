/**
 * Host Usage Remote owner for the rxlab workbench: the `rxlabUsage` namespace
 * over the `rxlab_usage` storage domain. This package listens to the
 * session-projection change feed for the client-visible `tokenUsage` unit
 * (composed by the token-meter row of the base bundle), attributes each
 * changed session to a workbench module from its cwd under the workspace root,
 * and durably records the session total plus the recomputed module aggregate —
 * the accounting foundation for later per-workflow billing. Like the other
 * rxlab business rows, it mounts its own namespace on the Client side (see
 * `src/client/index.ts`) and never joins the platform `api-remotes` assembly.
 * @module @deepseek-ai/dsh-rxlab-usage
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { addTotals, moduleOfCwd, totalsEqual } from './aggregate.ts'
import {
  rxlabUsageDomainSpec,
  type StoredModuleUsageRow,
  type StoredSessionUsageRow,
} from './domain.ts'
import type {
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

/** One module's agent composition entry (subdir only; preset is not needed here). */
interface ModuleAgentEntry {
  readonly preset: string
  readonly subdir: string
}

/**
 * Structural view of the ctx service members this row needs; the real
 * augmentations live in their owning packages (session-projection and
 * rxlab-app), which this package must not import back.
 */
interface UsageProjectionFeed {
  onChanged(listener: (session: { id: string; header: { cwd?: string } }, key: string, value: unknown, seq: number) => void): () => void
}

interface UsagePaths {
  readonly workspaceRoot: string
  readonly moduleAgents: Readonly<Record<string, ModuleAgentEntry>>
}

/** Wire-shaped snapshot of a projection change; invalid values are ignored. */
function totalsOf(value: unknown): UsageTotals | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const read = (key: string): number | null =>
    typeof record[key] === 'number' && Number.isFinite(record[key] as number) && (record[key] as number) >= 0
      ? record[key] as number
      : null
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
 * feed; every `tokenUsage` change durably upserts the session row and the
 * recomputed module aggregate. Reads answer from the durable tables, so a
 * restart keeps the accounting of sessions the row already observed.
 */
export class UsageController extends TypertRemoteService {
  static inject = ['storageDomain', 'sessionProjections', 'rxlabPaths']

  private sessionsTable?: KvTable<string, StoredSessionUsageRow>
  private modulesTable?: KvTable<string, StoredModuleUsageRow>
  private readonly paths: UsagePaths | undefined

  /**
   * Register the usage namespace on the Typert Gateway.
   * @param ctx - Host context carrying the storage-domain and projection facilities.
   */
  constructor(ctx: Context) {
    super(ctx, 'usageController', { namespace: 'rxlabUsage' })
    const paths = ctx.get('rxlabPaths') as UsagePaths | undefined
    this.paths = paths
  }

  /** Open the usage domain and subscribe the projection feed for this row's life. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(rxlabUsageDomainSpec)
    this.ctx.effect(() => () => { void domain.close() }, 'rxlab_usage.domainClose')
    this.sessionsTable = domain.table('sessions')
    this.modulesTable = domain.table('modules')
    const feed = this.ctx.get('sessionProjections') as UsageProjectionFeed
    this.ctx.effect(() => {
      const dispose = feed.onChanged((session, key, value, seq) => {
        if (key !== TOKEN_USAGE_KEY || this.paths === undefined) return
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
  async summary(): Promise<UsageSummaryValue> {
    const rows = [...this.requireModules().entries()].map(([, row]) => row)
    rows.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || left.moduleId.localeCompare(right.moduleId))
    return { modules: rows.map(toSummary) }
  }

  /**
   * Read durable usage rows for a specific session-id set.
   * @param request - the ids to look up; absent ids yield no entry.
   * @returns rows keyed by session id for every id the row has observed.
   */
  @Remote('sessionUsage')
  async sessionUsage(request: SessionUsageRequest): Promise<SessionUsageValue> {
    const sessions: Record<string, SessionUsageRow> = {}
    const table = this.requireSessions()
    for (const id of request.ids) {
      const row = table.get(id)
      if (row !== undefined) {
        sessions[id] = { sessionId: row.sessionId, module: row.module, totals: row.totals, updatedAt: row.updatedAt }
      }
    }
    return { sessions }
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
}

/** Project one durable module row onto the wire summary type. */
function toSummary(row: StoredModuleUsageRow): ModuleUsageSummary {
  return { moduleId: row.moduleId, totals: row.totals, sessionCount: row.sessionCount, updatedAt: row.updatedAt }
}

export default UsageController
