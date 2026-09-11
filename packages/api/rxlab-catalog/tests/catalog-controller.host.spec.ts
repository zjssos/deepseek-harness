import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility as DomainFacilityClass } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import CatalogController from '../src/index.ts'
import type { CatalogImportRequest } from '../src/types.ts'

/** Boot the catalog controller over an in-memory storage backend. */
async function boot(pool?: MemoryMediaPool): Promise<{ ctx: Context; controller: CatalogController }> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(pool)
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const DomainPlugin = await import('@deepseek-ai/dsh-storage-domain')
  await ctx.plugin(DomainPlugin, { backend: 'memory' })
  await vi.waitFor(() => { expect(ctx.storageDomain).toBeInstanceOf(DomainFacilityClass) })
  await ctx.plugin(CatalogController)
  await vi.waitFor(() => { expect(ctx.catalogController).toBeInstanceOf(CatalogController) })
  return { ctx, controller: ctx.catalogController }
}

/** One JD frame import request matching the real captured listing shape. */
function frameImport(overrides: Partial<CatalogImportRequest> = {}): CatalogImportRequest {
  return {
    source: {
      platform: 'jd',
      url: 'https://item.jd.com/100132809415.html',
      linkId: 'link-1',
      shopName: 'BOLON暴龙京东自营旗舰店',
      sku: '100132809415',
    },
    listing: {
      title: 'BOLON暴龙近视眼镜钛框男复古休闲镜框可配度数BA7009 B15',
      selectedSku: 'BA7009B15-哑黑银',
      price: 899,
      priceRaw: '¥899',
    },
    ...overrides,
  }
}

describe('importCollected', () => {
  it('extracts a frame record with attributes, price reading, and lineage', async () => {
    const { controller } = await boot()
    const { item, created } = await controller.importCollected(frameImport())
    expect(created).toBe(true)
    expect(item.kind).toBe('frame')
    if (item.kind !== 'frame') return
    expect(item.brand).toBe('BOLON')
    expect(item.model).toBe('BA7009B15')
    expect(item.material).toBe('titanium')
    expect(item.gender).toBe('male')
    expect(item.style).toBe('retro')
    expect(item.color).toBe('哑黑银')
    expect(item.origin).toBe('collected')
    expect(item.source?.linkId).toBe('link-1')
    expect(item.priceHistory).toHaveLength(1)
    expect(item.priceHistory?.[0]).toMatchObject({ value: 899, source: 'collected', note: '¥899' })
  })

  it('merges a repeat import of the same link instead of minting a duplicate', async () => {
    const { controller } = await boot()
    const first = await controller.importCollected(frameImport())
    const second = await controller.importCollected(frameImport({
      listing: {
        title: 'BOLON暴龙近视眼镜钛框男复古休闲镜框可配度数BA7009 B15',
        selectedSku: 'BA7009B15-哑黑银',
        price: 799,
      },
    }))
    expect(second.created).toBe(false)
    expect(second.item.id).toBe(first.item.id)
    expect(second.item.kind).toBe('frame')
    if (second.item.kind !== 'frame') return
    expect(second.item.priceHistory?.map(entry => entry.value)).toEqual([899, 799])
  })

  it('does not append a price reading that repeats the latest value', async () => {
    const { controller } = await boot()
    const first = await controller.importCollected(frameImport())
    const second = await controller.importCollected(frameImport({
      listing: { title: 'BOLON暴龙近视眼镜钛框 BA7009', price: 899 },
    }))
    expect(second.item.id).toBe(first.item.id)
    expect(second.item.priceHistory?.length).toBe(1)
    expect(second.item.priceHistory?.[0]?.value).toBe(899)
  })

  it('classifies a lens-only listing into a lens record', async () => {
    const { controller } = await boot()
    const { item } = await controller.importCollected(frameImport({
      listing: { title: '蔡司镜片1.67非球面防蓝光 近视眼镜片', price: 600 },
    }))
    expect(item.kind).toBe('lens')
    if (item.kind !== 'lens') return
    expect(item.refractiveIndex).toBe('1.67')
    expect(item.lensDesign).toBe('aspheric')
    expect(item.lensFunctions).toContain('blue-light')
  })

  it('rejects a request whose listing fails validation', async () => {
    const { controller } = await boot()
    await expect(controller.importCollected(frameImport({
      listing: { title: '' },
    }))).rejects.toMatchObject({ code: 'gateway/bad-request' })
  })
})

describe('list facets', () => {
  it('projects summaries with the latest price and family tags', async () => {
    const { controller } = await boot()
    await controller.importCollected(frameImport())
    const { items } = await controller.list({})
    expect(items.length).toBe(1)
    expect(items[0]?.price).toBe(899)
    expect(items[0]?.material).toBe('titanium')
    expect(items[0]?.refractiveIndex).toBeUndefined()
  })

  it('filters by kind, query, material, and price range', async () => {
    const { controller } = await boot()
    await controller.importCollected(frameImport())
    await controller.importCollected(frameImport({
      source: { ...frameImport().source, linkId: 'link-2', sku: '100062547398', url: 'https://item.jd.com/100062547398.html' },
      listing: { title: '蔡司镜片1.67非球面 近视眼镜片', price: 600 },
    }))

    expect((await controller.list({ kind: 'lens' })).items.length).toBe(1)
    expect((await controller.list({ query: 'bolon' })).items.length).toBe(1)
    expect((await controller.list({ material: 'acetate' })).items.length).toBe(0)
    expect((await controller.list({ material: 'titanium' })).items.length).toBe(1)
    expect((await controller.list({ refractiveIndex: '1.67' })).items.length).toBe(1)
    expect((await controller.list({ minPrice: 800 })).items.length).toBe(1)
    expect((await controller.list({ maxPrice: 500 })).items.length).toBe(0)
  })
})

describe('version-1 record compatibility', () => {
  it('accepts a v1-shaped frame record under the v2 schema', async () => {
    const { wikiItemSchema } = await import('../src/domain.ts')
    const v1Record = {
      id: 'v1-row',
      updatedAt: '2026-09-05T00:00:00.000Z',
      kind: 'frame',
      name: '手工镜架',
      origin: 'manual',
      frameMaterial: '板材',
    }
    const parsed = wikiItemSchema.safeParse(v1Record)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.kind).toBe('frame')
    if (parsed.data.kind !== 'frame') return
    expect(parsed.data.frameMaterial).toBe('板材')
    expect(parsed.data.material).toBeUndefined()
  })
})
