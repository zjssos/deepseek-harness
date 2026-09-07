/**
 * JD deterministic collector: anonymous headless capture of one item.m.jd.com
 * product page — title, selected variant, share-produced purchase link — plus
 * a desktop-page price read. Ported from the rxlab collect feasibility probe
 * (see the gpw/probes evidence in the module Agent Note); the share/copy flow
 * is the mechanism the merchant uses to obtain a buyable link.
 * @module @deepseek-ai/dsh-rxlab-collect/src/executor/jd
 */

import type { Browser } from 'playwright'
import type { CollectPrice } from '../types.ts'
import { cleanJdTitle, jdDesktopUrl, jdMobileUrl, jdSkuFromUrl } from './parse.ts'
import type { Collector, CollectorResult } from './types.ts'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Leaf element with exactly one visible text; mirrors the probe's finder. */
async function clickLeaf(page: import('playwright').Page, text: string): Promise<boolean> {
  const locator = page.getByText(text, { exact: true }).first()
  if ((await locator.count()) === 0) return false
  try {
    await locator.click({ timeout: 8000 })
    return true
  } catch {
    return false
  }
}

/** The page title minus JD's decoration, or null when the page is a gate. */
async function readJdState(page: import('playwright').Page): Promise<{ title: string; selectedSku?: string; gate: boolean }> {
  const state = await page.evaluate(() => {
    const head = document.body.innerText.slice(0, 800)
    const gate = /请登录|扫码登录|验证|访问频繁/.test(head)
    const selectedMatch = document.body.innerText.match(/已选\s*(.*?)(?:，|$)/)
    return { gate, selected: selectedMatch?.[1]?.trim() ?? '' }
  })
  const title = cleanJdTitle(await page.title())
  return {
    title,
    ...(state.selected === '' ? {} : { selectedSku: state.selected.slice(0, 300) }),
    gate: state.gate,
  }
}

/** Desktop page's first displayed ¥ price; raw text kept for the record. */
async function readJdPrice(browser: Browser, url: string): Promise<CollectPrice> {
  const context = await browser.newContext({ userAgent: DESKTOP_UA, locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await wait(2400)
    const raw = await page.evaluate(() => {
      const match = document.body.innerText.match(/¥\s*\d+(?:\.\d+)?/)
      return match ? match[0].replace(/\s/g, '') : ''
    })
    if (raw === '') throw new Error('JD 桌面页未显示价格')
    const value = Number(raw.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(value)) throw new Error(`价格文本无法解析: ${raw}`)
    return { value, raw, note: '页面显示价(可能为活动价)' }
  } finally {
    await context.close().catch(() => undefined)
  }
}

/**
 * Build the JD collector over a controller-owned browser handle.
 * @param browser - lazily resolved shared browser (never closed here).
 */
export function createJdCollector(browser: () => Promise<Browser>): Collector {
  return {
    async collect(input): Promise<CollectorResult> {
      const sku = input.sku ?? jdSkuFromUrl(input.url)
      if (sku === null) throw new Error('不是 JD 商品详情链接(缺少 sku)')
      const mobileUrl = input.mobileUrl ?? jdMobileUrl(sku)
      const shared = await browser()
      const context = await shared.newContext({
        userAgent: MOBILE_UA,
        locale: 'zh-CN',
        viewport: { width: 414, height: 896 },
      })
      const page = await context.newPage()
      try {
        const response = await page.goto(mobileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const httpOk = response !== null && response.status() < 400
        await wait(2600)
        const state = await readJdState(page)
        if (state.gate) throw new Error('页面要求登录或触发风控,无法采集')
        if (state.title === '') throw new Error('商品页标题为空')
        let buyUrl: string | undefined
        if (await clickLeaf(page, '分享')) {
          await wait(1500)
          if (await clickLeaf(page, '复制链接')) {
            await wait(1200)
            buyUrl = (await page.evaluate(() => String(document.getSelection() ?? '').trim())) || undefined
          }
        }
        // Price is best-effort: JD serves an anonymous headless desktop session
        // a risk page without price text under some networks, so the field is
        // omitted instead of failing the whole capture.
        let price: CollectPrice | undefined
        try {
          price = await readJdPrice(shared, jdDesktopUrl(sku))
        } catch {
          price = undefined
        }
        return {
          httpOk,
          fields: {
            title: state.title.slice(0, 500),
            ...(price === undefined ? {} : { price }),
            ...(state.selectedSku === undefined ? {} : { selectedSku: state.selectedSku }),
            ...(buyUrl === undefined ? {} : { buyUrl: buyUrl.slice(0, 2000) }),
          },
        }
      } finally {
        await context.close().catch(() => undefined)
      }
    },
  }
}
