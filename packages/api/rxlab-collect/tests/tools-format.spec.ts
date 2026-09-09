import { describe, expect, it } from 'vitest'
import { formatLinkList, formatSubmitValue } from '../src/tools.ts'
import { formatSnapshot, type PageSnapshot } from '../src/browse/snapshot.ts'

const SNAPSHOT: PageSnapshot = {
  url: 'https://search.jd.com/Search?keyword=眼镜',
  title: '眼镜 - 商品搜索',
  text: '搜索结果第一页\n共 60 件商品',
  elements: [
    { ref: 1, tag: 'input', label: '搜索' },
    { ref: 2, tag: 'a', label: '某眼镜旗舰店' },
    { ref: 3, tag: 'a', label: '钛合金光学镜架 商品详情' },
  ],
  textTruncated: false,
  elementsTruncated: false,
}

describe('formatSnapshot', () => {
  it('renders url, title, body text, and ref lines in order', () => {
    expect(formatSnapshot(SNAPSHOT)).toBe([
      'URL: https://search.jd.com/Search?keyword=眼镜',
      '标题: 眼镜 - 商品搜索',
      '',
      '页面文本:',
      '搜索结果第一页',
      '共 60 件商品',
      '',
      '可交互元素(3 个，用 ref 引用):',
      '[1] <input> 搜索',
      '[2] <a> 某眼镜旗舰店',
      '[3] <a> 钛合金光学镜架 商品详情',
    ].join('\n'))
  })

  it('appends a truncation note per truncated dimension', () => {
    const truncated: PageSnapshot = {
      ...SNAPSHOT,
      textTruncated: true,
      elementsTruncated: true,
    }
    const text = formatSnapshot(truncated)
    expect(text).toContain('(页面文本被截断，可用 browser_scroll 或翻页查看更多)')
    expect(text).toContain('(可交互元素超过上限，仅列出前面的部分)')
  })
})

describe('formatSubmitValue', () => {
  it('summarizes created, merged, and rejected entries', () => {
    expect(formatSubmitValue({
      created: [{ id: 'a', platform: 'jd', url: 'https://item.jd.com/1.html', updatedAt: '', status: 'idle' }],
      merged: [],
      rejected: [{ link: { url: 'https://example.com/x' }, reason: '无法推断平台: https://example.com/x' }],
    })).toBe([
      '入库完成：新增 1，合并 0，拒绝 1。',
      '- jd https://item.jd.com/1.html',
      '- 拒绝 https://example.com/x: 无法推断平台: https://example.com/x',
    ].join('\n'))
  })

  it('appends the shop name when the link carries one', () => {
    expect(formatSubmitValue({
      created: [{ id: 'a', platform: 'jd', url: 'https://item.jd.com/2.html', updatedAt: '', status: 'idle', shopName: '某旗舰店' }],
      merged: [],
      rejected: [],
    })).toContain('- jd https://item.jd.com/2.html （某旗舰店）')
  })
})

describe('formatLinkList', () => {
  it('renders the empty case', () => {
    expect(formatLinkList([])).toBe('当前没有匹配的链接资产。')
  })

  it('renders status, shop, and sku columns', () => {
    expect(formatLinkList([
      { id: 'a', platform: 'jd', url: 'https://item.jd.com/3.html', updatedAt: '', status: 'ok', shopName: '某旗舰店', sku: '123' },
    ])).toBe('共 1 条链接资产：\n- jd https://item.jd.com/3.html [ok] 某旗舰店 sku=123')
  })
})
