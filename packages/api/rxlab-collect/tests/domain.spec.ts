import { describe, expect, it } from 'vitest'
import {
  collectDomainSpec,
  collectDraftSchema,
  collectLinkSchema,
  collectShopSchema,
} from '../src/domain.ts'

describe('collect domain spec', () => {
  it('is version 3 with the retired capture and batch tables gone', () => {
    expect(collectDomainSpec.version).toBe(3)
    expect(collectDomainSpec.compatibleVersions).toEqual([1, 2])
    expect(Object.keys(collectDomainSpec.tables).sort()).toEqual(['drafts', 'links', 'shops'])
  })
})

/** A link record as domain version 2 stored it. */
const LEGACY_LINK = {
  id: 'link-1',
  platform: 'jd',
  shopId: 'jd-57589',
  shopName: 'BOLON官方旗舰店',
  sku: '100012345678',
  url: 'https://item.jd.com/100012345678.html',
  mobileUrl: 'https://item.m.jd.com/product/100012345678.html',
  titleAtAdd: '暴龙 BA7009',
  status: 'ok',
  lastCaptureAt: '2026-09-08T13:15:18.828Z',
  lastCaptureId: 'capture-1',
  lastPrice: 899,
  updatedAt: '2026-09-08T13:15:18.828Z',
}

describe('legacy link records stay readable', () => {
  it('accepts a version-2 record and keeps its identity, shop text, and title', () => {
    const parsed = collectLinkSchema.safeParse(LEGACY_LINK)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.id).toBe('link-1')
    expect(parsed.data.shopId).toBe('jd-57589')
    expect(parsed.data.titleAtAdd).toBe('暴龙 BA7009')
    expect(parsed.data.shopRef).toBeUndefined()
  })

  it('drops the capture bookkeeping version 3 no longer declares', () => {
    const parsed = collectLinkSchema.safeParse(LEGACY_LINK)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect('status' in parsed.data).toBe(false)
    expect('lastCaptureAt' in parsed.data).toBe(false)
    expect('lastPrice' in parsed.data).toBe(false)
    expect('mobileUrl' in parsed.data).toBe(false)
  })
})

describe('record validation', () => {
  it('requires a shop name', () => {
    expect(collectShopSchema.safeParse({ id: 's1', platform: 'jd', name: ' ', updatedAt: '' }).success).toBe(false)
    expect(collectShopSchema.safeParse({ id: 's1', platform: 'jd', name: '暴龙旗舰店', updatedAt: '' }).success).toBe(true)
  })

  it('requires a draft to name a target it can fill', () => {
    expect(collectDraftSchema.safeParse({
      id: 'd1',
      status: 'pending',
      payload: { target: 'product', platform: 'jd', url: 'https://item.jd.com/1.html' },
      createdAt: '',
    }).success).toBe(true)
    expect(collectDraftSchema.safeParse({
      id: 'd1',
      status: 'pending',
      payload: { target: 'nope', platform: 'jd' },
      createdAt: '',
    }).success).toBe(false)
  })
})
