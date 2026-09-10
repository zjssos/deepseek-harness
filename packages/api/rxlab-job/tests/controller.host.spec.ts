import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility as DomainFacilityClass } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import JobController from '../src/index.ts'
import type { ConsumerProfile } from '../src/types.ts'

/** Boot the job controller over an in-memory storage backend. */
async function boot(pool?: MemoryMediaPool): Promise<{ ctx: Context; controller: JobController }> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(pool)
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const DomainPlugin = await import('@deepseek-ai/dsh-storage-domain')
  await ctx.plugin(DomainPlugin, { backend: 'memory' })
  await vi.waitFor(() => { expect(ctx.storageDomain).toBeInstanceOf(DomainFacilityClass) })
  await ctx.plugin(JobController)
  await vi.waitFor(() => { expect(ctx.jobController).toBeInstanceOf(JobController) })
  return { ctx, controller: ctx.jobController }
}

const consumer: ConsumerProfile = {
  name: '演示用户',
  age: 32,
  usage: 'computer',
  budget: { amount: 2000, currency: 'CNY' },
}

describe('createJob / getJob', () => {
  it('mints an id, defaults the tracked stages, and reads the job back', async () => {
    const { controller } = await boot()
    const { job } = await controller.createJob({ consumer })
    expect(job.status).toBe('draft')
    expect(job.stageIds).toEqual(['exam', 'frame', 'lens', 'fabrication', 'pickup', 'aftercare'])

    const { job: read, stages, guide } = await controller.getJob({ id: job.id })
    expect(read.id).toBe(job.id)
    expect(read.consumer.name).toBe('演示用户')
    expect(stages).toEqual([])
    expect(guide).toBeUndefined()
  })

  it('rejects a consumer profile that fails its schema', async () => {
    const { controller } = await boot()
    await expect(controller.createJob({
      consumer: { usage: 'telepathy' } as unknown as ConsumerProfile,
    })).rejects.toMatchObject({ code: 'gateway/bad-request' })
  })

  it('throws job/not-found for an unknown id', async () => {
    const { controller } = await boot()
    await expect(controller.getJob({ id: 'missing' as never }))
      .rejects.toMatchObject({ code: 'job/not-found' })
  })
})

describe('updateJob / bindSession', () => {
  it('patches consumer, pricing, and status and mints a new write instant', async () => {
    const { controller } = await boot()
    const { job } = await controller.createJob({ consumer })
    const { job: updated } = await controller.updateJob({
      id: job.id,
      patch: {
        consumer: { ...consumer, name: '新客户' },
        pricing: { amount: 1800, currency: 'CNY' },
        status: 'in-progress',
      },
    })
    expect(updated.consumer.name).toBe('新客户')
    expect(updated.pricing).toEqual({ amount: 1800, currency: 'CNY' })
    expect(updated.status).toBe('in-progress')
    expect(updated.createdAt).toBe(job.createdAt)
  })

  it('binds a session id and rejects an empty one', async () => {
    const { controller } = await boot()
    const { job } = await controller.createJob({ consumer })
    const { job: bound } = await controller.bindSession({ id: job.id, sessionId: 'session-1' })
    expect(bound.sessionId).toBe('session-1')
    await expect(controller.bindSession({ id: job.id, sessionId: '  ' }))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
  })
})

describe('upsertStage', () => {
  it('creates a pending row, then updates only the supplied fields', async () => {
    const { controller } = await boot()
    const { job } = await controller.createJob({ consumer })

    const { stage: created } = await controller.upsertStage({
      jobId: job.id,
      stage: 'exam',
      patch: {},
    })
    expect(created.status).toBe('pending')
    expect(created.inputs).toEqual({})
    expect(created.id).toBe(`${String(job.id)}:exam`)

    const { stage: updated } = await controller.upsertStage({
      jobId: job.id,
      stage: 'exam',
      patch: { status: 'done', outputs: { pdMm: 64 } },
    })
    expect(updated.status).toBe('done')
    expect(updated.outputs).toEqual({ pdMm: 64 })
    expect(updated.inputs).toEqual({})
  })

  it('returns stages in canonical order regardless of write order', async () => {
    const { controller } = await boot()
    const { job } = await controller.createJob({ consumer })
    await controller.upsertStage({ jobId: job.id, stage: 'lens', patch: {} })
    await controller.upsertStage({ jobId: job.id, stage: 'exam', patch: {} })
    const { stages } = await controller.getJob({ id: job.id })
    expect(stages.map(stage => stage.stage)).toEqual(['exam', 'lens'])
  })

  it('refuses a stage for an unknown job', async () => {
    const { controller } = await boot()
    await expect(controller.upsertStage({
      jobId: 'missing' as never,
      stage: 'exam',
      patch: {},
    })).rejects.toMatchObject({ code: 'job/not-found' })
  })
})

describe('generateGuide / deleteJob', () => {
  it('assembles and persists a guide from the stored stage artifacts', async () => {
    const { controller } = await boot()
    const { job } = await controller.createJob({ consumer })
    await controller.upsertStage({ jobId: job.id, stage: 'exam', patch: { outputs: { pdMm: 64 } } })
    await controller.upsertStage({ jobId: job.id, stage: 'frame', patch: { outputs: { frameName: 'BA7009' } } })

    const { document } = await controller.generateGuide({ jobId: job.id })
    expect(document.chapters).toHaveLength(6)
    expect(document.chapters[0]?.params).toEqual({ pdMm: 64 })
    expect(document.consumer.name).toBe('演示用户')

    const { guide } = await controller.getJob({ id: job.id })
    expect(guide?.generatedAt).toBe(document.generatedAt)
  })

  it('deletes the job with its stage rows and guide, and reports a repeat delete', async () => {
    const { controller } = await boot()
    const { job } = await controller.createJob({ consumer })
    await controller.upsertStage({ jobId: job.id, stage: 'exam', patch: {} })
    await controller.generateGuide({ jobId: job.id })

    expect(await controller.deleteJob({ id: job.id })).toEqual({ removed: true })
    await expect(controller.getJob({ id: job.id })).rejects.toMatchObject({ code: 'job/not-found' })

    const { job: other } = await controller.createJob({ consumer })
    await controller.upsertStage({ jobId: other.id, stage: 'exam', patch: {} })
    expect((await controller.getJob({ id: other.id })).stages).toHaveLength(1)
    expect(await controller.deleteJob({ id: other.id })).toEqual({ removed: true })
  })

  it('rejects a repeat delete of the same job', async () => {
    const { controller } = await boot()
    const { job } = await controller.createJob({ consumer })
    expect(await controller.deleteJob({ id: job.id })).toEqual({ removed: true })
    expect(await controller.deleteJob({ id: job.id })).toEqual({ removed: false })
  })
})
