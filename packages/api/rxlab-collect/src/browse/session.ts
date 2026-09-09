/**
 * Persistent logged-in chromium session behind the rxlab collect agent browse
 * tools. Two launch modes share one service:
 * - `persistent` (default): this package's own chromium over a user-data
 *   directory, so a platform login survives process restarts; the manual
 *   login flow relaunches headed, waits for the person, then restores the
 *   headless context.
 * - `cdp`: connects over Chrome DevTools Protocol to an already-running real
 *   browser (a dedicated profile launched with `--remote-debugging-port`),
 *   reusing its real logins and fingerprint; login is "sign in over there,
 *   then poll the cookie", and teardown only disconnects. CDP attaches lazily
 *   on first browse use and fails fast with launch guidance when the endpoint
 *   is down, so a closed browser never blocks app startup.
 * @module @deepseek-ai/dsh-rxlab-collect/src/browse/session
 */

import { mkdir } from 'node:fs/promises'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { Context, Service } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import type { BrowserStatusInfo } from '../types.ts'

/** Settings namespace carrying the user-facing collect-browser knobs. */
export const COLLECT_BROWSER_SETTINGS_NAMESPACE = 'rxlab-collect-browser'

/** Plugin config: which browser to drive and how it presents. */
export interface Config {
  /** `persistent` launches this package's own chromium over a user-data dir; `cdp` connects to a running real browser. */
  launchMode?: 'persistent' | 'cdp'
  /** Persistent mode: chromium user-data directory holding the platform login state. */
  profileDir?: string
  /** Persistent mode: whether agent browsing runs headless. Headed windows serve the manual login flow only. */
  headless?: boolean
  /** CDP mode: the remote-debugging endpoint (e.g. `http://127.0.0.1:9222`). */
  cdpEndpoint?: string
  /** How long {@link CollectBrowserSession.login} waits for the person to complete the login (ms). */
  loginTimeoutMs?: number
  /** Politeness pause the browse tools insert after each page load (ms). */
  navigateDelayMs?: number
  /** Persistent mode: chromium executable path; defaults to Playwright's bundled build when absent. */
  executablePath?: string
}

export const Config: z<Config> = z.object({
  launchMode: z.union([z.const('persistent'), z.const('cdp')]).default('persistent'),
  profileDir: z.string().default(dshHomePath('rxlab-browser')),
  headless: z.boolean().default(true),
  cdpEndpoint: z.string().default('http://127.0.0.1:9222'),
  loginTimeoutMs: z.number().default(300_000),
  navigateDelayMs: z.number().default(1_000),
  executablePath: z.string(),
})

/** Complete config after schemastery applies every field default. */
interface ResolvedSpec {
  launchMode: 'persistent' | 'cdp'
  profileDir: string
  headless: boolean
  cdpEndpoint: string
  loginTimeoutMs: number
  navigateDelayMs: number
  executablePath?: string
}

/** Resolve programmatic construction config through the same defaults. */
function resolveSpec(config: Config): ResolvedSpec {
  return {
    launchMode: config.launchMode ?? 'persistent',
    profileDir: config.profileDir ?? dshHomePath('rxlab-browser'),
    headless: config.headless ?? true,
    cdpEndpoint: config.cdpEndpoint ?? 'http://127.0.0.1:9222',
    loginTimeoutMs: config.loginTimeoutMs ?? 300_000,
    navigateDelayMs: config.navigateDelayMs ?? 1_000,
    ...config.executablePath === undefined || config.executablePath === ''
      ? {}
      : { executablePath: config.executablePath },
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Persistent (login-capable) chromium session behind the rxlab collect agent browse tools. */
    collectBrowser: CollectBrowserSession
  }
}

/** Outcome of one manual login attempt. */
export interface LoginOutcome {
  /** True when the login check passed. */
  ok: boolean
  /** Human-readable result: what passed, or why the wait gave up. */
  detail: string
}

/**
 * Owns the chromium context for the agent browse tools. The context is one
 * async operation: launches are chained on one pending promise, relaunches
 * (login mode switch, persistent mode) tear the old context down through the
 * same chain, and disposal waits for the chain before disconnecting.
 */
export class CollectBrowserSession extends Service {
  static inject = ['settings']

  static Config: z<Config> = Config

  private spec: ResolvedSpec
  private context: BrowserContext | undefined
  /** Dedicated agent tab in CDP mode, so browsing never hijacks the user's own tabs. */
  private agentPage: Page | undefined
  private chain: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'collectBrowser')
    // Programmatic construction may bypass schemastery normalization; resolve
    // the same defaults in one explicit step either way.
    this.spec = resolveSpec(config)
  }

  /** Politeness pause (ms) browse tools insert after each page load. */
  get navigateDelayMs(): number {
    return this.spec.navigateDelayMs
  }

  /**
   * The active page of the browser, launching/connecting on first use and
   * serializing with login relaunches on the session chain. CDP mode keeps a
   * dedicated tab so the agent never drives the person's own tabs.
   * @returns the page to browse with.
   */
  async page(): Promise<Page> {
    const context = await this.ensure('headless')
    if (this.spec.launchMode === 'cdp') {
      if (this.agentPage !== undefined && !this.agentPage.isClosed()) return this.agentPage
      const page = await context.newPage()
      this.agentPage = page
      return page
    }
    const existing = context.pages()[0]
    return existing ?? await context.newPage()
  }

  /**
   * Run the manual login flow for one platform entry page.
   * Persistent mode opens a headed window, lets the person sign in, then
   * restores the headless context and confirms the login state survived.
   * CDP mode just opens the page in the real browser and polls the check —
   * the person signs in over there, and the cookie is the proof.
   * @param url - the login or entry page to open.
   * @param loggedIn - platform login check; true means signed in.
   * @returns the login outcome with a readable detail line.
   */
  async login(url: string, loggedIn: (page: Page) => Promise<boolean>): Promise<LoginOutcome> {
    if (this.spec.launchMode === 'cdp') {
      return this.loginViaCdp(url, loggedIn)
    }
    const headed = await this.ensure('headed', true)
    let page: Page
    try {
      page = headed.pages()[0] ?? await headed.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    } catch (cause) {
      await this.ensure('headless', true).catch(() => undefined)
      return { ok: false, detail: `登录页打开失败: ${readable(cause)}` }
    }
    const waited = await this.waitForLogin(page, loggedIn, this.spec.loginTimeoutMs)
    if (!waited) {
      await this.ensure('headless', true).catch(() => undefined)
      return { ok: false, detail: `等待登录超时(${Math.round(this.spec.loginTimeoutMs / 1000)}s)，未检测到登录态` }
    }
    // The profile dir persisted the cookies during the headed window; restore
    // the headless context and confirm the platform still reports signed in.
    // The cookie-backed check is the truth — a risk-blocked navigation must
    // not mask a login that actually landed.
    const headless = await this.ensure('headless', true)
    const restored = headless.pages()[0] ?? await headless.newPage()
    try {
      await restored.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await restored.waitForTimeout(2_000)
    } catch {
      // The platform may risk-block this warm-up visit; the cookie check below
      // reads the persisted profile state and needs no navigation.
    }
    if (await loggedIn(restored)) {
      return { ok: true, detail: '登录态已保存并恢复' }
    }
    return { ok: false, detail: '登录窗口内检测到登录，但恢复无头模式后登录态未保留' }
  }

  /** CDP login: open the entry page in the real browser and poll the check. */
  private async loginViaCdp(url: string, loggedIn: (page: Page) => Promise<boolean>): Promise<LoginOutcome> {
    const context = await this.ensure('headless')
    const page = this.agentPage !== undefined && !this.agentPage.isClosed()
      ? this.agentPage
      : await context.newPage()
    this.agentPage = page
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    } catch (cause) {
      return { ok: false, detail: `登录页打开失败: ${readable(cause)}` }
    }
    const waited = await this.waitForLogin(page, loggedIn, this.spec.loginTimeoutMs)
    if (!waited) {
      return { ok: false, detail: `等待登录超时(${Math.round(this.spec.loginTimeoutMs / 1000)}s)，未检测到登录态` }
    }
    return { ok: true, detail: '登录态已确认(真实浏览器 cookie)' }
  }

  /** Arm the lifetime disposer: chain steps settle, then the browser disconnects. */
  protected [Service.init](): void {
    const settings = this.ctx.settings as {
      installSection?: (ctx: unknown, ns: string, schema: unknown, base: unknown, opts: unknown) => void
      get?: (ns: string) => unknown
    } | undefined
    settings?.installSection?.(this.ctx, COLLECT_BROWSER_SETTINGS_NAMESPACE, Config, { ...this.spec }, {
      setSource: () => {},
      onChange: () => {},
      applies: 'restart',
    })
    const merged = settings?.get?.(COLLECT_BROWSER_SETTINGS_NAMESPACE) as Config | undefined
    if (merged !== undefined) this.spec = resolveSpec(merged)
    this.ctx.effect(() => () => {
      this.disposed = true
      return this.chain.then(() => this.teardown())
    }, 'rxlab_collect.browserSessionClose')
  }

  /**
   * Readable browser state for the SPA CDP surface.
   * @returns current mode, resolved locations, and whether the CDP endpoint (or the owned context) is live.
   */
  async status(): Promise<BrowserStatusInfo> {
    const endpointUp = this.spec.launchMode === 'cdp' ? await this.cdpEndpointUp() : this.context !== undefined
    return {
      launchMode: this.spec.launchMode,
      profileDir: this.spec.profileDir,
      cdpEndpoint: this.spec.cdpEndpoint,
      ...this.spec.executablePath === undefined ? {} : { executablePath: this.spec.executablePath },
      endpointUp,
      contextOpen: this.context !== undefined,
    }
  }

  /** One serialized launch/relaunch settle point on the session chain. */
  private ensure(mode: 'headless' | 'headed', force = false): Promise<BrowserContext> {
    const run = async (): Promise<BrowserContext> => {
      if (force) await this.teardown()
      if (this.context !== undefined) return this.context
      if (this.disposed) {
        throw new Error('rxlab collect browser session is disposed')
      }
      const created = await this.launch(mode)
      this.context = created
      return created
    }
    const next = this.chain.then(run, run)
    this.chain = next.then(() => undefined, () => undefined)
    return next
  }

  /** Launch the persistent context or connect over CDP, per the configured mode. */
  private async launch(mode: 'headless' | 'headed'): Promise<BrowserContext> {
    if (this.spec.launchMode === 'cdp') {
      return this.connectCdp()
    }
    await mkdir(this.spec.profileDir, { recursive: true })
    return chromium.launchPersistentContext(this.spec.profileDir, {
      headless: mode === 'headless',
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
      timeout: 60_000,
      ...this.spec.executablePath === undefined ? {} : { executablePath: this.spec.executablePath },
    })
  }

  /**
   * Attach to the already-running real browser, failing fast with launch
   * guidance when its debugging endpoint is not serving. CDP attaches only on
   * first browse use, so a closed browser never blocks app startup.
   */
  private async connectCdp(): Promise<BrowserContext> {
    if (!(await this.cdpEndpointUp())) {
      throw new Error(cdpUnreachableMessage(this.spec.cdpEndpoint))
    }
    try {
      const browser = await chromium.connectOverCDP(this.spec.cdpEndpoint)
      const context = browser.contexts()[0]
      if (context === undefined) {
        throw new Error('CDP 浏览器没有可用的默认 context')
      }
      return context
    } catch (cause) {
      if (cause instanceof Error && /没有可用的默认 context/.test(cause.message)) throw cause
      const detail = readable(cause)
      throw new Error(
        detail.length > 0
          ? `${cdpUnreachableMessage(this.spec.cdpEndpoint)} 连接失败: ${detail}`
          : cdpUnreachableMessage(this.spec.cdpEndpoint),
      )
    }
  }

  /** Whether the browser behind `--remote-debugging-port` answers its version endpoint. */
  private async cdpEndpointUp(): Promise<boolean> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1_500)
    try {
      const response = await fetch(`${this.spec.cdpEndpoint.replace(/\/+$/, '')}/json/version`, {
        signal: controller.signal,
      })
      return response.ok
    } catch {
      // A closed endpoint, refused connection, or timeout means no browser yet;
      // the caller turns that into the launch guidance message.
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  /** Close the owned context, or disconnect only (CDP never kills the real browser). */
  private async teardown(): Promise<void> {
    const context = this.context
    this.context = undefined
    this.agentPage = undefined
    if (context === undefined) return
    if (this.spec.launchMode === 'cdp') {
      await context.browser()?.close().catch(() => undefined)
      return
    }
    await context.close().catch(() => undefined)
  }

  /** Poll the login check until it passes or the deadline passes. */
  private async waitForLogin(
    page: Page,
    loggedIn: (page: Page) => Promise<boolean>,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.disposed) return false
      try {
        if (await loggedIn(page)) return true
      } catch {
        // A navigation or render race can fail one probe; keep polling.
      }
      await page.waitForTimeout(2_000)
    }
    return false
  }
}

/** Read one thrown value into a single-line message. */
function readable(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  return message.replace(/\s+/g, ' ').slice(0, 400)
}

/** Launch guidance for one CDP connection failure; the CLI help owns the launch word. */
function cdpUnreachableMessage(endpoint: string): string {
  return `CDP 浏览器未就绪:${endpoint} 无响应。请先用专用 profile 启动真实浏览器`
    + '(--remote-debugging-port=9222 的 Edge/Chrome,启动词见 `dsh rxlab --help` 的 CDP 示例)'
    + ',再让 agent 重试;连接后 agent 使用独立 tab,退出只断连、不关你的浏览器。'
}

export default CollectBrowserSession
