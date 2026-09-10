import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility as DomainFacilityClass } from '@deepseek-ai/dsh-storage-domain'
import JobController from '@deepseek-ai/dsh-rxlab-job'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import UsageController, { type Config } from '../src/index.ts'
import { rxlabUsageDomainSpec } from '../src/domain.ts'

function event(seq: number, type: string, data: unknown): SessionEvent {
  return { seq, time: seq, type, data } as unknown as SessionEvent
}

function usage(): TokenUsage {
  return { inputTokens: 100, outputTokens: 20, totalTokens: 170, cacheReadTokens: 50 }
}

function sessionLog(turnNumber: number): SessionEvent[] {
  const start = (turnNumber - 1) * 10
  return [
    event(start, 'turn/start', { turn: turnNumber }),
    event(start, 'step/start', { turn: turnNumber, step: 0 }),
    event(start, 'assistant/message', {
      turn: turnNumber,
      step: 0,
      stream: [{ type: 'chunk', time: start, chunk: { type: 'usage', usage: usage() } }],
      message: {
        id: `message-${start}`,
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
        source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },
      },
      usage: usage(),
    }),
    event(start, 'tool/call', {
      turn: turnNumber,
      step: 0,
      callId: `call-${start}`,
      name: 'job_write_stage',
      arguments: JSON.stringify({ jobId: 'job-placeholder', stage: turnNumber === 1 ? 'exam' : 'lens' }),
    }),
    event(start, 'step/end', { turn: turnNumber, step: 0 }),
    event(start, 'turn/end', { turn: turnNumber, reason: { kind: 'completed' } }),
  ]
}

interface BootOptions {
  readonly config?: Config
  readonly sessionId?: string
  readonly events?: readonly SessionEvent[]
  readonly persistence?: {
    stat(id: string): Promise<unknown>
    open(id: string, access: 'read'): Promise<{ read(): Promise<{ events: readonly SessionEvent[] }>; close(): Promise<void> }>
  }
}

async function boot(options: BootOptions = {}): Promise<{ ctx: Context }> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(new MemoryMediaPool())
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const DomainPlugin = await import('@deepseek-ai/dsh-storage-domain')
  await ctx.plugin(DomainPlugin, { backend: 'memory' })
  await vi.waitFor(() => { expect(ctx.storageDomain).toBeInstanceOf(DomainFacilityClass) })
  ctx.provide('rxlabPaths', { workspaceRoot: '/work/rxlab', moduleAgents: {} })
  ctx.provide('sessionProjections', { onChanged: () => () => {} })
  ctx.provide('sessions', {
    get: (id: string) => id === options.sessionId && options.events !== undefined
      ? { snapshotEvents: () => options.events ?? [] }
      : undefined,
  })
  if (options.persistence !== undefined) ctx.provide('sessionPersistence', options.persistence)
  await ctx.plugin(JobController)
  await ctx.plugin(UsageController, options.config ?? {})
  await vi.waitFor(() => { expect(ctx.usageController).toBeInstanceOf(UsageController) })
  return { ctx }
}

const PRICING: Config = {
  pricingCurrency: 'CNY',
  routeRates: {
    'deepseek/deepseek-chat': { uncachedInput: 1, output: 2, cacheRead: 0.5, cacheWrite: 0 },
  },
}

describe('UsageController.jobUsage', () => {
  it('attributes turns to stages and returns the job total from the live session log', async () => {
    const events = [...sessionLog(1), ...sessionLog(2)]
    const { ctx } = await boot({ sessionId: 's1', events })
    const { job } = await ctx.jobController.createJob({ consumer: { name: '演示' } })
    await ctx.jobController.bindSession({ id: job.id, sessionId: 's1' })

    const value = await ctx.usageController.jobUsage({ jobId: job.id })
    expect(value.totals).toEqual({
      uncachedInputTokens: 200, outputTokens: 40, cacheReadTokens: 100, cacheWriteTokens: 0,
    })
    expect(value.stages.map(stage => stage.stage)).toEqual(['exam', 'lens'])
    expect(value.stages[0]?.totals.uncachedInputTokens).toBe(100)
    expect(value.cost).toBeUndefined()
  })

  it('computes exact cost when every turn is priced and persists job and stage rows', async () => {
    const { ctx } = await boot({ sessionId: 's1', events: sessionLog(1), config: PRICING })
    const { job } = await ctx.jobController.createJob({ consumer: { name: '演示' } })
    await ctx.jobController.bindSession({ id: job.id, sessionId: 's1' })

    const value = await ctx.usageController.jobUsage({ jobId: job.id })
    // 100 * 1 + 20 * 2 + 50 * 0.5
    expect(value.cost).toBe(165)
    expect(value.currency).toBe('CNY')
    expect(value.stages[0]?.cost).toBe(165)

    const jobRow = ctx.storageDomain.get(rxlabUsageDomainSpec.name)?.table('jobs').get(String(job.id)) as
      { totals: { uncachedInputTokens: number } } | undefined
    expect(jobRow?.totals.uncachedInputTokens).toBe(100)
    const stageRow = ctx.storageDomain.get(rxlabUsageDomainSpec.name)?.table('stage_usage').get(`${String(job.id)}:exam`) as
      { stage: string } | undefined
    expect(stageRow?.stage).toBe('exam')
  })

  it('reads a session that is no longer live from the durable log', async () => {
    const handle = {
      read: () => Promise.resolve({ events: sessionLog(1) }),
      close: () => Promise.resolve(),
    }
    const connectivity = vi.fn()
    const { ctx } = await boot({
      sessionId: 'gone',
      persistence: {
        stat: (id) => { connectivity(id); return Promise.resolve({}) },
        open: () => Promise.resolve(handle),
      },
    })
    const { job } = await ctx.jobController.createJob({ consumer: {} })
    await ctx.jobController.bindSession({ id: job.id, sessionId: 'gone' })

    const value = await ctx.usageController.jobUsage({ jobId: job.id })
    expect(value.totals.uncachedInputTokens).toBe(100)
    expect(connectivity).toHaveBeenCalledWith('gone')
  })

  it('returns zero totals for a job with no bound session', async () => {
    const { ctx } = await boot()
    const { job } = await ctx.jobController.createJob({ consumer: {} })
    const value = await ctx.usageController.jobUsage({ jobId: job.id })
    expect(value.totals.uncachedInputTokens).toBe(0)
    expect(value.stages).toEqual([])
  })

  it('propagates job/not-found for an unknown job', async () => {
    const { ctx } = await boot()
    await expect(ctx.usageController.jobUsage({ jobId: 'missing' as never }))
      .rejects.toMatchObject({ code: 'job/not-found' })
  })

  it('does not double-count a repeated read', async () => {
    const { ctx } = await boot({ sessionId: 's1', events: sessionLog(1) })
    const { job } = await ctx.jobController.createJob({ consumer: {} })
    await ctx.jobController.bindSession({ id: job.id, sessionId: 's1' })
    const first = await ctx.usageController.jobUsage({ jobId: job.id })
    const second = await ctx.usageController.jobUsage({ jobId: job.id })
    expect(second).toEqual(first)
  })
})
