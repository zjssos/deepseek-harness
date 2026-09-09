/**
 * JD deterministic collector: anonymous headless capture of one item.m.jd.com
 * product page — title, selected variant, share-produced purchase link — plus
 * a desktop-page price read, spec-parameter pairs, and a mobile-page
 * price/main-image fallback. Under CDP mode the same reads run in the real
 * browser's default context so the platform login cookies apply and pages open
 * as tabs rather than fresh windows. Ported from the rxlab collect feasibility
 * probe (see the gpw/probes evidence in the module Agent Note); the share/copy
 * flow is the mechanism the merchant uses to obtain a buyable link.
 * @module @deepseek-ai/dsh-rxlab-collect/src/executor/jd
 */

import type { Browser } from 'playwright'
import type { CollectPrice } from '../types.ts'
import { cleanJdTitle, jdDesktopUrl, jdMobileUrl, jdSkuFromUrl } from './parse.ts'
import { openCaptureSession, type CaptureContextMode } from './context.ts'
import type { Collector, CollectorResult } from './types.ts'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** One spec-parameter name/value pair as the capture stores it. */
interface JdParamPair {
  name: string
  value: string
}

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
async function readJdState(page: import('playwright').Page): Promise<{
  title: string
  selectedSku?: string
  mobilePrice?: string
  mainImageUrl?: string
  gate: boolean
}> {
  const state = await page.evaluate(() => {
    const body = document.body
    const head = body.innerText.slice(0, 800)
    const gate = /请登录|扫码登录|验证|访问频繁/.test(head)
    const selectedMatch = body.innerText.match(/已选\s*(.*?)(?:，|$)/)
    const priceMatch = body.innerText.match(/[¥￥]\s*\d+(?:\.\d+)?/)
    const mainImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? ''
    return {
      gate,
      selected: selectedMatch?.[1]?.trim() ?? '',
      price: priceMatch?.[0].replace(/\s/g, '') ?? '',
      mainImage,
    }
  })
  const title = cleanJdTitle(await page.title())
  return {
    title,
    ...(state.selected === '' ? {} : { selectedSku: state.selected.slice(0, 300) }),
    ...(state.price === '' ? {} : { mobilePrice: state.price }),
    ...(state.mainImage === '' || !/^https?:\/\//.test(state.mainImage)
      ? {}
      : { mainImageUrl: state.mainImage.slice(0, 2000) }),
    gate: state.gate,
  }
}

/** The numeric value of a JD price text, or undefined when unparseable. */
function priceFrom(raw: string, note: string): CollectPrice | undefined {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(value) || value < 0) return undefined
  return { value, raw: trimmed, note }
}

/**
 * Desktop page read: the first displayed ¥ price plus the spec-parameter
 * table (品牌/材质/尺寸...), both absent when the anonymous session hits a
 * risk page instead of the product page.
 */
async function readJdDesktop(
  browser: Browser,
  resolveMode: () => CaptureContextMode,
  url: string,
): Promise<{ price?: CollectPrice; params?: JdParamPair[] }> {
  const session = await openCaptureSession(browser, resolveMode(), {
    userAgent: DESKTOP_UA,
    locale: 'zh-CN',
    viewport: { width: 1440, height: 900 },
  })
  const page = session.page
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await wait(2400)
    const raw = await page.evaluate(() => {
      const match = document.body.innerText.match(/[¥￥]\s*\d+(?:\.\d+)?/)
      const pairs: { name: string; value: string }[] = []
      const push = (text: string | null | undefined): void => {
        const normalized = (text ?? '').replace(/\s+/g, ' ').trim()
        const split = normalized.split(/[:：]/)
        if (split.length < 2) return
        const name = split[0]?.trim() ?? ''
        const value = split.slice(1).join('：').trim()
        if (name === '' || value === '' || name.length > 50) return
        pairs.push({ name: name.slice(0, 100), value: value.slice(0, 300) })
      }
      for (const li of document.querySelectorAll('.parameter li, .p-parameter li, .item-parameter li')) {
        push(li.textContent)
      }
      for (const row of document.querySelectorAll('.spec-table tr, .parameter-table tr')) {
        push([...row.querySelectorAll('th,td')].map(cell => cell.textContent).join('：'))
      }
      return { price: match ? match[0].replace(/\s/g, '') : '', params: pairs.slice(0, 60) }
    })
    const desktopPrice = priceFrom(raw.price, '页面显示价(可能为活动价)')
    return {
      ...(desktopPrice === undefined ? {} : { price: desktopPrice }),
      ...(raw.params.length === 0 ? {} : { params: raw.params }),
    }
  } finally {
    await session.close()
  }
}

/**
 * Build the JD collector over a controller-owned browser handle.
 * @param browser - lazily resolved shared browser (never closed here).
 * @param resolveMode - context mode resolved per capture (isolated headless, or the CDP default context).
 */
export function createJdCollector(
  browser: () => Promise<Browser>,
  resolveMode: () => CaptureContextMode,
): Collector {
  return {
    async collect(input): Promise<CollectorResult> {
      const sku = input.sku ?? jdSkuFromUrl(input.url)
      if (sku === null) throw new Error('不是 JD 商品详情链接(缺少 sku)')
      const mobileUrl = input.mobileUrl ?? jdMobileUrl(sku)
      const shared = await browser()
      const session = await openCaptureSession(shared, resolveMode(), {
        userAgent: MOBILE_UA,
        locale: 'zh-CN',
        viewport: { width: 414, height: 896 },
      })
      const page = session.page
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
        // Desktop read is best-effort: JD serves an anonymous headless session
        // a risk page without price or parameter text under some networks, so
        // both fields fall back to the mobile page's own price and stay absent
        // rather than failing the whole capture.
        let desktop: { price?: CollectPrice; params?: JdParamPair[] } = {}
        try {
          desktop = await readJdDesktop(shared, resolveMode, jdDesktopUrl(sku))
        } catch {
          desktop = {}
        }
        const price = desktop.price
          ?? (state.mobilePrice === undefined ? undefined : priceFrom(state.mobilePrice, '移动端页面显示价(可能为活动价)'))
        return {
          httpOk,
          fields: {
            title: state.title.slice(0, 500),
            ...(price === undefined ? {} : { price }),
            ...(state.selectedSku === undefined ? {} : { selectedSku: state.selectedSku }),
            ...(buyUrl === undefined ? {} : { buyUrl: buyUrl.slice(0, 2000) }),
            ...(state.mainImageUrl === undefined ? {} : { mainImageUrl: state.mainImageUrl }),
            ...(desktop.params === undefined ? {} : { params: desktop.params }),
          },
        }
      } finally {
        await session.close()
      }
    },
  }
}
