import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility as DomainFacilityClass } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import ContentController from '../src/index.ts'
import type { ContentItemDraft } from '../src/types.ts'

/** Boot the content controller over an in-memory storage backend. */
async function boot(pool?: MemoryMediaPool): Promise<{ ctx: Context; controller: ContentController }> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(pool)
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const DomainPlugin = await import('@deepseek-ai/dsh-storage-domain')
  await ctx.plugin(DomainPlugin, { backend: 'memory' })
  await vi.waitFor(() => { expect(ctx.storageDomain).toBeInstanceOf(DomainFacilityClass) })
  await ctx.plugin(ContentController)
  await vi.waitFor(() => { expect(ctx.contentController).toBeInstanceOf(ContentController) })
  return { ctx, controller: ctx.contentController }
}

/** One knowledge draft with every field a caller may set. */
function knowledge(overrides: Partial<ContentItemDraft> = {}): ContentItemDraft {
  return {
    kind: 'knowledge',
    stage: 'lens',
    title: '高折射率镜片的适用场景',
    tags: ['镜片', '折射率'],
    body: '高屈光不正、对大框边缘厚度敏感时选择更高折射率。',
    ...overrides,
  }
}

describe('upsert and get', () => {
  it('mints an id and write timestamp and returns the stored item', async () => {
    const { controller } = await boot()
    const { item } = await controller.upsert({ item: knowledge() })
    expect(String(item.id).length).toBeGreaterThan(0)
    expect(item.kind).toBe('knowledge')
    expect(item.stage).toBe('lens')
    expect(item.updatedAt).toBeTruthy()
    const fetched = await controller.get({ id: item.id })
    expect(fetched.item).toEqual(item)
  })

  it('replaces the record under a supplied id', async () => {
    const { controller } = await boot()
    const first = await controller.upsert({ item: knowledge() })
    const second = await controller.upsert({
      item: knowledge({ title: '改写的标题', tags: ['镜片'] }),
      id: first.item.id,
    })
    expect(second.item.id).toBe(first.item.id)
    expect(second.item.title).toBe('改写的标题')
    expect((await controller.list({})).items.length).toBe(1)
  })

  it('rejects a draft that fails the domain schema', async () => {
    const { controller } = await boot()
    await expect(controller.upsert({ item: knowledge({ title: '' }) }))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
  })

  it('throws content/not-found for an unknown id', async () => {
    const { controller } = await boot()
    await expect(controller.get({ id: 'missing' as never }))
      .rejects.toMatchObject({ code: 'content/not-found' })
  })
})

describe('list', () => {
  it('summarizes without the body and sorts newest write first', async () => {
    const { controller } = await boot()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const first = await controller.upsert({ item: knowledge() })
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    const second = await controller.upsert({ item: knowledge({ kind: 'script', title: '取镜话术' }) })
    vi.useRealTimers()
    const { items } = await controller.list({})
    expect(items.length).toBe(2)
    expect(items[0]?.id).toBe(second.item.id)
    expect(items[1]?.id).toBe(first.item.id)
    expect(items[0]).not.toHaveProperty('body')
  })

  it('filters by kind, stage, and a title/tags query', async () => {
    const { controller } = await boot()
    await controller.upsert({ item: knowledge() })
    await controller.upsert({
      item: knowledge({ kind: 'script', stage: 'pickup', title: '取镜话术', tags: ['取镜'] }),
    })

    expect((await controller.list({ kind: 'script' })).items.length).toBe(1)
    expect((await controller.list({ stage: 'pickup' })).items.length).toBe(1)
    expect((await controller.list({ stage: 'exam' })).items.length).toBe(0)
    expect((await controller.list({ query: '高折射率' })).items.length).toBe(1)
    expect((await controller.list({ query: '取镜' })).items.length).toBe(1)
    expect((await controller.list({ query: '不存在' })).items.length).toBe(0)
  })
})

describe('delete', () => {
  it('removes an existing record', async () => {
    const { controller } = await boot()
    const { item } = await controller.upsert({ item: knowledge() })
    await expect(controller.delete({ id: item.id })).resolves.toEqual({ removed: true })
    await expect(controller.get({ id: item.id })).rejects.toMatchObject({ code: 'content/not-found' })
  })

  it('reports false when no record carries the id', async () => {
    const { controller } = await boot()
    await expect(controller.delete({ id: 'missing' as never })).resolves.toEqual({ removed: false })
  })
})
