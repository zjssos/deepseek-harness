import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility as DomainFacilityClass } from '@deepseek-ai/dsh-storage-domain'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import CollectController from '../src/index.ts'
import type { CollectShopId } from '../src/types.ts'

/** Boot the collect controller over an in-memory storage backend. */
async function boot(): Promise<{ ctx: Context; controller: CollectController }> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend()
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const DomainPlugin = await import('@deepseek-ai/dsh-storage-domain')
  await ctx.plugin(DomainPlugin, { backend: 'memory' })
  await vi.waitFor(() => { expect(ctx.storageDomain).toBeInstanceOf(DomainFacilityClass) })
  await ctx.plugin(CollectController)
  await vi.waitFor(() => { expect(ctx.collectController).toBeInstanceOf(CollectController) })
  return { ctx, controller: ctx.collectController }
}

/** Register one shop and return its stored record. */
async function registerShop(controller: CollectController, name = 'BOLON官方旗舰店') {
  const { shop } = await controller.upsertShop({ shop: { platform: 'jd', name } })
  return shop
}

describe('shop registry', () => {
  it('registers a shop and lists it by platform', async () => {
    const { controller } = await boot()
    const shop = await registerShop(controller)
    expect(shop.name).toBe('BOLON官方旗舰店')

    const { shops } = await controller.listShops({ platform: 'jd' })
    expect(shops.map(entry => entry.id)).toEqual([shop.id])
    expect((await controller.listShops({ platform: 'taobao' })).shops).toEqual([])
  })

  it('matches the query against name, key, and home url', async () => {
    const { controller } = await boot()
    await controller.upsertShop({
      shop: { platform: 'jd', name: '暴龙官方旗舰店', shopKey: 'jd-57589', homeUrl: 'https://mall.jd.com/index-57589.html' },
    })
    expect((await controller.listShops({ query: '暴龙' })).shops).toHaveLength(1)
    expect((await controller.listShops({ query: '57589' })).shops).toHaveLength(1)
    expect((await controller.listShops({ query: '陌陌' })).shops).toEqual([])
  })

  it('replaces a shop by id instead of minting a second row', async () => {
    const { controller } = await boot()
    const shop = await registerShop(controller)
    const { shop: updated } = await controller.upsertShop({
      shop: { id: shop.id, platform: 'jd', name: '暴龙官方旗舰店(改名)' },
    })
    expect(updated.id).toBe(shop.id)
    expect((await controller.listShops({})).shops).toHaveLength(1)
  })
})

describe('product entries', () => {
  it('files an entry under a shop and canonicalizes a JD url to its sku page', async () => {
    const { controller } = await boot()
    const shop = await registerShop(controller)
    const { link } = await controller.upsertLink({
      link: { platform: 'jd', url: 'https://item.m.jd.com/product/100012345678.html', shopRef: shop.id, title: '暴龙 BA7009' },
    })
    expect(link.url).toBe('https://item.jd.com/100012345678.html')
    expect(link.sku).toBe('100012345678')
    expect(link.shopRef).toBe(shop.id)

    expect((await controller.listLinks({ shopRef: shop.id })).items).toHaveLength(1)
    expect((await controller.listLinks({ unfiled: true })).items).toEqual([])
  })

  it('rejects an entry that names an unregistered shop', async () => {
    const { controller } = await boot()
    await expect(controller.upsertLink({
      link: { platform: 'jd', url: 'https://item.jd.com/1.html', shopRef: 'missing' as CollectShopId },
    })).rejects.toThrow(/shop/)
  })

  it('unfiles a shop\'s entries when the shop is removed', async () => {
    const { controller } = await boot()
    const shop = await registerShop(controller)
    await controller.upsertLink({ link: { platform: 'jd', url: 'https://item.jd.com/1.html', shopRef: shop.id } })
    await controller.upsertLink({ link: { platform: 'jd', url: 'https://item.jd.com/2.html', shopRef: shop.id } })

    const receipt = await controller.removeShop({ id: shop.id })
    expect(receipt).toEqual({ removed: true, unfiled: 2 })
    expect((await controller.listShops({})).shops).toEqual([])
    expect((await controller.listLinks({ unfiled: true })).items).toHaveLength(2)
  })

  it('imports CSV rows into the named shop and reports row rejections', async () => {
    const { controller } = await boot()
    const shop = await registerShop(controller)
    const { created, rejected } = await controller.importLinks({
      text: 'url,title\nhttps://item.jd.com/9.html,眼镜\nnot-a-url,坏行\n',
      shopRef: shop.id,
    })
    expect(created).toHaveLength(1)
    expect(created[0]!.shopRef).toBe(shop.id)
    expect(`${rejected[0]?.reason}`).toMatch(/url/)
  })
})

describe('agent drafts', () => {
  it('stores a submitted draft as pending without writing the shop table', async () => {
    const { controller } = await boot()
    const { created, rejected } = await controller.submitDrafts([{
      payload: { target: 'shop', platform: 'jd', name: '暴龙官方旗舰店' },
      sourceText: '店铺:暴龙官方旗舰店',
    }])
    expect(rejected).toEqual([])
    expect(created[0]!.status).toBe('pending')
    expect((await controller.listShops({})).shops).toEqual([])
    expect((await controller.listDrafts({ status: 'pending' })).drafts).toHaveLength(1)
  })

  it('rejects a malformed entry without writing a draft', async () => {
    const { controller } = await boot()
    const { created, rejected } = await controller.submitDrafts([{
      payload: { target: 'product', platform: 'jd', url: 'not-a-url' },
    }])
    expect(created).toEqual([])
    expect(rejected).toHaveLength(1)
    expect((await controller.listDrafts({})).drafts).toEqual([])
  })

  it('writes the shop only when a person accepts the draft, and only once', async () => {
    const { controller } = await boot()
    const { created } = await controller.submitDrafts([{
      payload: { target: 'shop', platform: 'jd', name: '暴龙官方旗舰店' },
    }])
    const draftId = created[0]!.id

    const committed = await controller.commitDraft({ id: draftId })
    expect(committed.draft.status).toBe('accepted')
    expect(committed.shop?.name).toBe('暴龙官方旗舰店')
    expect((await controller.listShops({})).shops).toHaveLength(1)

    await expect(controller.commitDraft({ id: draftId })).rejects.toThrow(/accepted/)
  })

  it('files an accepted product draft under the shop the person picked', async () => {
    const { controller } = await boot()
    const shop = await registerShop(controller)
    const { created } = await controller.submitDrafts([{
      payload: { target: 'product', platform: 'jd', url: 'https://item.jd.com/7.html', title: '暴龙 BA7009' },
      sourceText: '标题:暴龙 BA7009',
    }])

    const committed = await controller.commitDraft({ id: created[0]!.id, shopRef: shop.id })
    expect(committed.link?.shopRef).toBe(shop.id)
    expect((await controller.listLinks({ shopRef: shop.id })).items).toHaveLength(1)
  })

  it('writes nothing when a person rejects the draft', async () => {
    const { controller } = await boot()
    const { created } = await controller.submitDrafts([{
      payload: { target: 'product', platform: 'jd', url: 'https://item.jd.com/8.html' },
    }])

    const { draft } = await controller.rejectDraft({ id: created[0]!.id })
    expect(draft.status).toBe('rejected')
    expect((await controller.listLinks({})).items).toEqual([])
  })
})
