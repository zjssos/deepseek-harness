/**
 * Capture page sessions for the deterministic collectors. Two context modes:
 * - `isolated`: an anonymous throwaway context (own-headless chromium runs) —
 *   the collector owns it and closes it after the read.
 * - `default`: the CDP-attached real browser's default context — pages share
 *   the profile's login cookies and open as tabs in the existing window, and
 *   closing the session only closes the page, never the context or browser.
 * @module @deepseek-ai/dsh-rxlab-collect/src/executor/context
 */

import type { Browser, BrowserContext, Page } from 'playwright'

/** One page to read plus how to release it. */
export interface CaptureSession {
  readonly page: Page
  /** Close what this session owns: the page (default mode) or the context (isolated). */
  close(): Promise<void>
}

export type CaptureContextMode = 'isolated' | 'default'

/** Options that apply to isolated contexts only (a real profile keeps its own UA/viewport). */
export interface CaptureSessionOptions {
  readonly userAgent?: string
  readonly locale?: string
  readonly viewport?: { readonly width: number; readonly height: number }
}

/** Open a page for one product read in the requested context mode. */
export async function openCaptureSession(
  browser: Browser,
  mode: CaptureContextMode,
  options: CaptureSessionOptions = {},
): Promise<CaptureSession> {
  if (mode === 'default') {
    const context = browser.contexts()[0]
    if (context === undefined) {
      throw new Error('CDP 浏览器没有可用的默认 context(登录态 context)')
    }
    const page = await context.newPage()
    return { page, close: async () => { await page.close().catch(() => undefined) } }
  }
  const context: BrowserContext = await browser.newContext({
    ...options.userAgent === undefined ? {} : { userAgent: options.userAgent },
    ...options.locale === undefined ? {} : { locale: options.locale },
    ...options.viewport === undefined ? {} : { viewport: { width: options.viewport.width, height: options.viewport.height } },
  })
  const page = await context.newPage()
  return {
    page,
    close: async () => { await context.close().catch(() => undefined) },
  }
}
