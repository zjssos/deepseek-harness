import { describe, expect, it } from 'vitest'
import {
  cleanJdTitle,
  cleanTaobaoTitle,
  csvToRecords,
  jdDesktopUrl,
  jdMobileUrl,
  jdSkuFromUrl,
  platformFromUrl,
  splitCsvLines,
  taobaoIdFromUrl,
  taobaoItemUrl,
} from '../src/executor/parse.ts'

describe('platformFromUrl', () => {
  it('guesses jd from desktop and mobile item urls', () => {
    expect(platformFromUrl('https://item.jd.com/10120538639231.html')).toBe('jd')
    expect(platformFromUrl('https://item.m.jd.com/product/10120538639231.html')).toBe('jd')
  })

  it('guesses taobao/1688 from their hosts', () => {
    expect(platformFromUrl('https://item.taobao.com/item.htm?id=1')).toBe('taobao')
    expect(platformFromUrl('https://detail.1688.com/offer/1.html')).toBe('1688')
  })

  it('returns undefined for unknown hosts', () => {
    expect(platformFromUrl('https://example.com/x')).toBeUndefined()
  })
})

describe('jd url helpers', () => {
  it('extracts the sku from desktop and mobile item urls', () => {
    expect(jdSkuFromUrl('https://item.jd.com/10120538639231.html')).toBe('10120538639231')
    expect(jdSkuFromUrl('https://item.m.jd.com/product/10120538639231.html')).toBe('10120538639231')
    expect(jdSkuFromUrl('https://mall.jd.com/index-57589.html')).toBeNull()
  })

  it('builds canonical mobile and desktop urls', () => {
    expect(jdMobileUrl('123')).toBe('https://item.m.jd.com/product/123.html')
    expect(jdDesktopUrl('123')).toBe('https://item.jd.com/123.html')
  })

  it('cleans JD document-title decoration', () => {
    expect(cleanJdTitle('BOLON 太阳镜 BX8005 奶茶色【图片 价格 品牌 评论】-京东'))
      .toBe('BOLON 太阳镜 BX8005 奶茶色')
    expect(cleanJdTitle('BOLON 太阳镜 BX8005【行情 报价 价格 评测】-京东'))
      .toBe('BOLON 太阳镜 BX8005')
    expect(cleanJdTitle('普通标题')).toBe('普通标题')
  })
})

describe('taobao url helpers', () => {
  it('extracts the item id from taobao and tmall item urls', () => {
    expect(taobaoIdFromUrl('https://item.taobao.com/item.htm?id=123456789&spm=a21n57')).toBe('123456789')
    expect(taobaoIdFromUrl('https://detail.tmall.com/item.htm?id=987654321')).toBe('987654321')
    expect(taobaoIdFromUrl('https://item.jd.com/1.html')).toBeNull()
    expect(taobaoIdFromUrl('https://item.taobao.com/item.htm')).toBeNull()
  })

  it('builds the canonical item url and cleans document-title decoration', () => {
    expect(taobaoItemUrl('123')).toBe('https://item.taobao.com/item.htm?id=123')
    expect(cleanTaobaoTitle('夏日冰丝防晒袖套男-淘宝网')).toBe('夏日冰丝防晒袖套男')
    expect(cleanTaobaoTitle('普通标题')).toBe('普通标题')
  })
})

describe('splitCsvLines', () => {
  it('handles quoted commas and quoted newlines', () => {
    const { rows, errors } = splitCsvLines('a,b\n"x,y",z\n"multi\nline",w\n')
    expect(errors).toEqual([])
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,y', 'z'],
      ['multi\nline', 'w'],
    ])
  })

  it('reports an unclosed quote on its row', () => {
    const { rows, errors } = splitCsvLines('a,b\n"open\n')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]!.row).toBe(2)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('drops fully blank rows', () => {
    const { rows } = splitCsvLines('a,b\n\n1,2\n')
    expect(rows).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('csvToRecords', () => {
  it('maps the header columns to canonical keys', () => {
    const { records, errors } = csvToRecords(
      'platform,url,shopName,title\njd,https://item.jd.com/1.html,BOLON官方旗舰店,太阳镜\n,https://item.m.jd.com/product/2.html,,',
    )
    expect(errors).toEqual([])
    expect(records).toEqual([
      {
        platform: 'jd',
        url: 'https://item.jd.com/1.html',
        shopName: 'BOLON官方旗舰店',
        titleAtAdd: '太阳镜',
      },
      { platform: '', url: 'https://item.m.jd.com/product/2.html' },
    ])
  })

  it('rejects rows without a url', () => {
    const { records, errors } = csvToRecords('platform,url\njd,\njd,https://item.jd.com/1.html\n')
    expect(records).toHaveLength(1)
    expect(errors.map(error => error.row)).toContain(2)
  })

  it('rejects a missing url header', () => {
    const { records, errors } = csvToRecords('platform,title\njd,x\n')
    expect(records).toEqual([])
    expect(errors[0]!.reason).toContain('url 列')
  })

  it('rejects empty csv text', () => {
    const { records, errors } = csvToRecords('\n')
    expect(records).toEqual([])
    expect(errors[0]!.reason).toContain('CSV 为空')
  })
})
