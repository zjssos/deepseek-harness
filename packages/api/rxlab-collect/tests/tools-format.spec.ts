import { describe, expect, it } from 'vitest'
import {
  describeDraftPayload,
  formatDraftSubmit,
  formatLinkList,
  formatShopList,
  parsePriceText,
} from '../src/tools.ts'

describe('parsePriceText', () => {
  it('reads a numeric value out of a displayed price text', () => {
    expect(parsePriceText('¥899')).toBe(899)
    expect(parsePriceText('1,280.00 元')).toBe(1280)
    expect(parsePriceText('1280 起')).toBe(1280)
  })

  it('returns null when the text holds no usable number', () => {
    expect(parsePriceText('暂无报价')).toBeNull()
    expect(parsePriceText('¥')).toBeNull()
    expect(parsePriceText('.')).toBeNull()
  })
})

describe('describeDraftPayload', () => {
  it('names the shop a shop draft would register', () => {
    expect(describeDraftPayload({
      target: 'shop',
      platform: 'jd',
      name: 'BOLON官方旗舰店',
    })).toBe('店铺 jd BOLON官方旗舰店')
  })

  it('names the product and its price text when the draft carries one', () => {
    expect(describeDraftPayload({
      target: 'product',
      platform: 'jd',
      url: 'https://item.jd.com/1.html',
      title: '暴龙 BA7009',
      price: { value: 899, raw: '¥899' },
    })).toBe('商品 jd 暴龙 BA7009 ¥899')
  })

  it('falls back to the url when the product draft has no title', () => {
    expect(describeDraftPayload({
      target: 'product',
      platform: 'taobao',
      url: 'https://item.taobao.com/item.htm?id=1',
    })).toBe('商品 taobao https://item.taobao.com/item.htm?id=1')
  })
})

describe('formatDraftSubmit', () => {
  it('reports the counts, each draft, and the review requirement', () => {
    expect(formatDraftSubmit({
      created: [{
        id: 'draft-1',
        target: 'shop',
        status: 'pending',
        summary: '店铺 jd BOLON官方旗舰店',
        createdAt: '2026-09-11T00:00:00.000Z',
      }],
      rejected: [{ target: 'product', reason: 'a product entry needs a url' }],
    })).toBe([
      '已提交待确认草稿 1 条，拒绝 1 条。',
      '- 店铺 jd BOLON官方旗舰店（草稿 draft-1，待人工确认）',
      '- 拒绝 product: a product entry needs a url',
      '这些草稿不会自动入库：需要用户在采集模块逐条确认后才写入。请勿重复提交同一批信息。',
    ].join('\n'))
  })

  it('omits the review reminder when nothing was created', () => {
    expect(formatDraftSubmit({
      created: [],
      rejected: [{ target: 'shop', reason: 'a shop entry needs a name' }],
    })).toBe([
      '已提交待确认草稿 0 条，拒绝 1 条。',
      '- 拒绝 shop: a shop entry needs a name',
    ].join('\n'))
  })
})

describe('formatShopList', () => {
  it('renders the empty case', () => {
    expect(formatShopList([])).toBe('当前没有已登记的店铺。')
  })

  it('renders the platform, name, id, and home url', () => {
    expect(formatShopList([
      { id: 's1', platform: 'jd', name: 'BOLON官方旗舰店', updatedAt: '', homeUrl: 'https://mall.jd.com/1.html' },
    ])).toBe('共 1 个已登记店铺：\n- jd BOLON官方旗舰店（id=s1 https://mall.jd.com/1.html）')
  })
})

describe('formatLinkList', () => {
  it('renders the empty case', () => {
    expect(formatLinkList([])).toBe('当前没有已登记的商品条目。')
  })

  it('renders the platform, url, title, and owning shop', () => {
    expect(formatLinkList([
      { id: 'l1', platform: 'jd', url: 'https://item.jd.com/3.html', updatedAt: '', title: '暴龙 BA7009', shopRef: 's1' },
    ])).toBe('共 1 条已登记商品条目：\n- jd https://item.jd.com/3.html 暴龙 BA7009（店铺 s1）')
  })
})
