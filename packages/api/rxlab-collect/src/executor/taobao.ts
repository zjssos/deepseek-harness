/**
 * Taobao/Tmall deterministic collector: anonymous headless capture of one
 * item.taobao.com (or tmall item) product page — title, main image, and the
 * first displayed price — intended as a working alternative when a platform
 * (e.g. JD) risk-blocks the anonymous session. Capture is deliberately leaner
 * than JD's (no share-link or spec table): Taobao's anonymous page exposes
 * title/price/image reliably, while login-gated or risk pages fail fast with a
 * readable error.
 * @module @deepseek-ai/dsh-rxlab-collect/src/executor/taobao
 */

import type { Browser } from 'playwright'
import type { CollectPrice } from '../types.ts'
import { cleanTaobaoTitle, taobaoItemUrl } from './parse.ts'
import type { Collector, CollectorResult } from './types.ts'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** The numeric value of a Taobao price text, or undefined when unparseable. */
function priceFrom(raw: string, note: string): CollectPrice | undefined {
  const value = Number(raw.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(value)) return undefined
  return { value, raw, note }
}

/**
 * Build the Taobao/Tmall collector over a controller-owned browser handle.
 * @param browser - lazily resolved shared browser (never closed here).
 */
export function createTaobaoCollector(browser: () => Promise<Browser>): Collector {
  return {
    async collect(input): Promise<CollectorResult> {
      const url = input.url.includes('item.htm') ? input.url : taobaoItemUrl(input.sku ?? '')
      if (!url.includes('item.htm')) {
        throw new Error('不是淘宝/天猫商品详情链接(缺少 item id)')
      }
      const shared = await browser()
      const context = await shared.newContext({
        userAgent: MOBILE_UA,
        locale: 'zh-CN',
        viewport: { width: 414, height: 896 },
      })
      const page = await context.newPage()
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const httpOk = response !== null && response.status() < 400
        await wait(2600)
        const state = await page.evaluate(() => {
          const head = document.body.innerText.slice(0, 800)
          const gate = /请登录|扫码登录|验证|滑块|访问频繁|操作频繁|安全校验/.test(head)
          const priceMatch = document.body.innerText.match(/¥\s*\d{1,8}(?:\.\d{1,2})?/)
          const mainImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? ''
          return {
            gate,
            price: priceMatch?.[0].replace(/\s/g, '') ?? '',
            mainImage,
          }
        })
        if (state.gate) throw new Error('页面要求登录或触发风控,无法采集')
        const title = cleanTaobaoTitle(await page.title())
        if (title === '') throw new Error('商品页标题为空')
        const price = priceFrom(state.price, '页面显示价(可能为活动价/区间价)')
        return {
          httpOk,
          fields: {
            title: title.slice(0, 500),
            ...(price === undefined ? {} : { price }),
            ...(state.mainImage === '' || !/^https?:\/\//.test(state.mainImage)
              ? {}
              : { mainImageUrl: state.mainImage.slice(0, 2000) }),
          },
        }
      } finally {
        await context.close().catch(() => undefined)
      }
    },
  }
}
