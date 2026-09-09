/**
 * Model-facing agent browse and discovery tools for the rxlab collector
 * (browser use): `browser_*` tools drive the persistent logged-in chromium
 * session, `collect_discover_submit`/`collect_list_links` read and write the
 * link-asset domain. This module owns schemas, argument validation, result
 * bounds, and model guidance; the browser lives in `CollectBrowserSession`
 * and the data in `CollectController`.
 * @module @deepseek-ai/dsh-rxlab-collect/src/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import type { CollectDiscoveredLink, CollectLink, CollectPlatform } from './types.ts'
import { captureSnapshot, formatSnapshot, type PageSnapshot, type SnapshotCaps } from './browse/snapshot.ts'
import { loginFlowOf } from './browse/login.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'rxlab-collect-tools'

/** Services required by the collect agent tool suite. */
export const inject = ['tools', 'systemPrompt', 'collectBrowser', 'collectController']

/** Default cooperative timeout budget (ms) for one browse tool call. */
export const DEFAULT_BROWSE_TIMEOUT_MS = 120_000

/** Default cap on interactive elements listed in one snapshot. */
export const DEFAULT_SNAPSHOT_MAX_ELEMENTS = 150

/** Default cap on body-text characters in one snapshot. */
export const DEFAULT_SNAPSHOT_MAX_TEXT_CHARS = 8000

/** Default cap on links accepted by one discovery submission. */
export const DEFAULT_MAX_SUBMIT_LINKS = 200

/** Plugin config: call timeout, snapshot bounds, and the submission bound. */
export interface Config {
  /** Cooperative timeout budget (ms) for each browse tool call. Defaults to 120000. */
  timeoutMs?: number
  /** Cap on interactive elements listed in one snapshot. Defaults to 150. */
  snapshotMaxElements?: number
  /** Cap on body-text characters in one snapshot. Defaults to 8000. */
  snapshotMaxTextChars?: number
  /** Cap on links accepted by one `collect_discover_submit` call. Defaults to 200. */
  maxSubmitLinks?: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().default(DEFAULT_BROWSE_TIMEOUT_MS),
  snapshotMaxElements: z.number().default(DEFAULT_SNAPSHOT_MAX_ELEMENTS),
  snapshotMaxTextChars: z.number().default(DEFAULT_SNAPSHOT_MAX_TEXT_CHARS),
  maxSubmitLinks: z.number().default(DEFAULT_MAX_SUBMIT_LINKS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** Configured counts and caps must be positive integers. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`rxlab-collect-tools: ${name} must be a positive integer`)
  }
}

/** Canonical tool input for one discovered link (unbranded, schema-shaped). */
export interface DiscoveredLinkValue {
  url: string
  platform?: string
  shopId?: string
  shopName?: string
  sku?: string
  titleAtAdd?: string
}

/** Validate the discovery submission list and bounds before the controller sees it. */
function parseSubmitLinks(
  links: readonly DiscoveredLinkValue[],
  maxSubmitLinks: number,
): readonly CollectDiscoveredLink[] {
  if (links.length === 0) throw new Error('links must contain at least one entry')
  if (links.length > maxSubmitLinks) {
    throw new Error(`links must contain at most ${maxSubmitLinks} entries; split the submission`)
  }
  return links.map((link) => {
    if (typeof link.url !== 'string' || !/^https?:\/\/.+/.test(link.url)) {
      throw new Error(`each link needs an absolute http(s) url, got: ${link.url}`)
    }
    return {
      url: link.url,
      ...(link.platform === undefined ? {} : { platform: link.platform as CollectPlatform }),
      ...(link.shopId === undefined ? {} : { shopId: link.shopId }),
      ...(link.shopName === undefined ? {} : { shopName: link.shopName }),
      ...(link.sku === undefined ? {} : { sku: link.sku }),
      ...(link.titleAtAdd === undefined ? {} : { titleAtAdd: link.titleAtAdd }),
    }
  })
}

/** Render one submission receipt as the model-facing text block. */
export function formatSubmitValue(value: SubmitReceipt): string {
  const lines = [
    `入库完成：新增 ${value.created.length}，合并 ${value.merged.length}，拒绝 ${value.rejected.length}。`,
  ]
  for (const link of [...value.created, ...value.merged]) {
    lines.push(`- ${link.platform} ${link.url}${link.shopName === undefined ? '' : ` （${link.shopName}）`}`)
  }
  for (const rejection of value.rejected) {
    lines.push(`- 拒绝 ${rejection.link.url}: ${rejection.reason}`)
  }
  return lines.join('\n')
}

/** Canonical output projection of one stored link asset (unbranded, schema-shaped). */
export interface LinkValue {
  id: string
  platform: string
  url: string
  updatedAt: string
  status: string
  shopId?: string
  shopName?: string
  sku?: string
  mobileUrl?: string
  titleAtAdd?: string
  lastCaptureAt?: string
  lastCaptureId?: string
  lastPrice?: number
  lastError?: string
  rescan?: boolean
}

/** The discovery receipt as the tool's canonical output value. */
export interface SubmitReceipt {
  created: LinkValue[]
  merged: LinkValue[]
  rejected: { link: DiscoveredLinkValue; reason: string }[]
}

/** Project one discovered link onto the unbranded schema value shape. */
function projectDiscovered(link: CollectDiscoveredLink): DiscoveredLinkValue {
  return {
    url: link.url,
    ...(link.platform === undefined ? {} : { platform: link.platform }),
    ...(link.shopId === undefined ? {} : { shopId: link.shopId }),
    ...(link.shopName === undefined ? {} : { shopName: link.shopName }),
    ...(link.sku === undefined ? {} : { sku: link.sku }),
    ...(link.titleAtAdd === undefined ? {} : { titleAtAdd: link.titleAtAdd }),
  }
}

/**
 * Project one stored link onto the unbranded schema value shape. Branded ids
 * and `T | undefined` optional fields collapse to plain JSON field presence.
 */
function projectLink(link: CollectLink): LinkValue {
  return {
    id: String(link.id),
    platform: link.platform,
    url: link.url,
    updatedAt: link.updatedAt,
    status: link.status,
    ...(link.shopId === undefined ? {} : { shopId: link.shopId }),
    ...(link.shopName === undefined ? {} : { shopName: link.shopName }),
    ...(link.sku === undefined ? {} : { sku: link.sku }),
    ...(link.mobileUrl === undefined ? {} : { mobileUrl: link.mobileUrl }),
    ...(link.titleAtAdd === undefined ? {} : { titleAtAdd: link.titleAtAdd }),
    ...(link.lastCaptureAt === undefined ? {} : { lastCaptureAt: link.lastCaptureAt }),
    ...(link.lastCaptureId === undefined ? {} : { lastCaptureId: String(link.lastCaptureId) }),
    ...(link.lastPrice === undefined ? {} : { lastPrice: link.lastPrice }),
    ...(link.lastError === undefined ? {} : { lastError: link.lastError }),
    ...(link.rescan === undefined ? {} : { rescan: link.rescan }),
  }
}

/** Render one link list as the model-facing text block. */
export function formatLinkList(items: readonly LinkValue[]): string {
  if (items.length === 0) return '当前没有匹配的链接资产。'
  return [
    `共 ${items.length} 条链接资产：`,
    ...items.map(link =>
      `- ${link.platform} ${link.url} [${link.status}]${
        link.shopName === undefined ? '' : ` ${link.shopName}`
      }${link.sku === undefined ? '' : ` sku=${link.sku}`}`),
  ].join('\n')
}

/** Stale-ref error telling the model exactly how to recover. */
function staleRefError(ref: number, lastElements: number): Error {
  return new Error(
    `ref ${ref} 不在最近一次 browser_snapshot 的元素范围(1–${lastElements})内；`
    + '页面可能已经变化，请重新调用 browser_snapshot 后再引用新的 ref。',
  )
}

/** Output spec of one captured page (the {@link PageSnapshot} fields). */
const SNAPSHOT_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    url: { type: 'string', required: true },
    title: { type: 'string', required: true },
    text: { type: 'string', required: true },
    elements: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ref: { type: 'number', required: true },
          tag: { type: 'string', required: true },
          label: { type: 'string', required: true },
        },
      },
    },
    textTruncated: { type: 'boolean', required: true },
    elementsTruncated: { type: 'boolean', required: true },
  },
} as const

/** Output spec of one stored link asset (the {@link CollectLink} fields). */
const LINK_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    platform: { type: 'string', required: true },
    url: { type: 'string', required: true },
    updatedAt: { type: 'string', required: true },
    status: { type: 'string', required: true },
    shopId: { type: 'string' },
    shopName: { type: 'string' },
    sku: { type: 'string' },
    mobileUrl: { type: 'string' },
    titleAtAdd: { type: 'string' },
    lastCaptureAt: { type: 'string' },
    lastCaptureId: { type: 'string' },
    lastPrice: { type: 'number' },
    lastError: { type: 'string' },
    rescan: { type: 'boolean' },
  },
} as const

/** Output spec of one rejected discovery entry. */
const REJECTED_LINK_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    link: {
      type: 'object',
      required: true,
      additionalProperties: false,
      properties: {
        url: { type: 'string', required: true },
        platform: { type: 'string' },
        shopId: { type: 'string' },
        shopName: { type: 'string' },
        sku: { type: 'string' },
        titleAtAdd: { type: 'string' },
      },
    },
    reason: { type: 'string', required: true },
  },
} as const

/** Output spec of one discovery submission receipt. */
const SUBMIT_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    created: { type: 'array', required: true, items: LINK_VALUE },
    merged: { type: 'array', required: true, items: LINK_VALUE },
    rejected: { type: 'array', required: true, items: REJECTED_LINK_VALUE },
  },
} as const

/**
 * Register the collect agent browse and discovery tools plus their
 * system-prompt guidance. All registrations are effect-scoped and unregister
 * on plugin dispose. Browse tools stay exclusive (they share one browser
 * session); `collect_list_links` is the only read-only concurrency opt-in.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive
 *   the registrations, resolved with the browser session and the collector.
 * @param config - schemastery-resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  assertPositiveInteger('snapshotMaxElements', resolved.snapshotMaxElements)
  assertPositiveInteger('snapshotMaxTextChars', resolved.snapshotMaxTextChars)
  assertPositiveInteger('maxSubmitLinks', resolved.maxSubmitLinks)

  const browser = ctx.collectBrowser
  const controller = ctx.collectController
  const caps: SnapshotCaps = {
    maxElements: resolved.snapshotMaxElements,
    maxTextChars: resolved.snapshotMaxTextChars,
  }
  // Element count of the most recent snapshot; click/type validate refs against it.
  let lastElements = 0

  ctx.systemPrompt.section({
    name: 'tool:browser',
    order: ctx.systemPrompt.getSectionOrder('TOOL_BROWSER'),
    text: [
      'The browser_* tools drive one persistent logged-in chromium for rxlab product-link discovery.',
      'Each page action returns a fresh snapshot; act only on refs from the most recent snapshot, and re-snapshot after the page changes.',
      'The tools keep a politeness delay between page loads; never bulk-crawl and respect the platform.',
      'When a page reports a login wall, call browser_login with the platform and ask the person to complete the sign-in in the opened window.',
      'Collect shop and product links as you browse, then persist them with collect_discover_submit; check existing assets with collect_list_links first to avoid duplicates.',
    ].join(' '),
  })

  /** Shared execute body: run one page action, then return a fresh snapshot. */
  const snapshotAfter = async (
    action: (page: import('playwright').Page) => Promise<void>,
    signal: AbortSignal,
  ): Promise<PageSnapshot> => {
    const page = await browser.page()
    await action(page)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, browser.navigateDelayMs)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('操作已取消', { cause: signal.reason }))
      }, { once: true })
    })
    const snapshot = await captureSnapshot(page, caps)
    lastElements = snapshot.elements.length
    return snapshot
  }

  ctx.tools.register(defineTool({
    name: 'browser_navigate',
    description: 'Open a URL in the persistent collect browser and return a readable page snapshot with clickable element refs.',
    parameters: {
      url: { type: 'string', required: true, description: 'Absolute http(s) URL to open.' },
    },
    output: {
      schema: SNAPSHOT_VALUE,
      render: (_args, value) => [{ type: 'text', text: formatSnapshot(value) }],
    },
    timeoutMs: resolved.timeoutMs,
    async execute(args, exec) {
      return snapshotAfter(
        page => page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).then(() => undefined),
        exec.signal,
      )
    },
    presentCall: args => ({ card: 'generic', title: `浏览 ${args.url}` }),
  }))

  ctx.tools.register(defineTool({
    name: 'browser_snapshot',
    description: 'Re-read the current page as a readable snapshot with clickable element refs.',
    parameters: {},
    output: {
      schema: SNAPSHOT_VALUE,
      render: (_args, value) => [{ type: 'text', text: formatSnapshot(value) }],
    },
    timeoutMs: resolved.timeoutMs,
    isConcurrencySafe: () => false,
    async execute(_args, exec) {
      return snapshotAfter(() => Promise.resolve(), exec.signal)
    },
    presentCall: () => ({ card: 'generic', title: '读取当前页面' }),
  }))

  ctx.tools.register(defineTool({
    name: 'browser_click',
    description: 'Click one element from the latest snapshot by its ref, then return the refreshed snapshot.',
    parameters: {
      ref: { type: 'number', required: true, description: 'Element ref from the latest browser_snapshot.' },
    },
    output: {
      schema: SNAPSHOT_VALUE,
      render: (_args, value) => [{ type: 'text', text: formatSnapshot(value) }],
    },
    timeoutMs: resolved.timeoutMs,
    async execute(args, exec) {
      if (!Number.isInteger(args.ref) || args.ref < 1 || args.ref > lastElements) {
        throw staleRefError(args.ref, lastElements)
      }
      return snapshotAfter(
        page => page.click(`[data-dsh-ref="${args.ref}"]`, { timeout: 15_000 }).then(() => undefined),
        exec.signal,
      )
    },
    presentCall: args => ({ card: 'generic', title: `点击元素 #${args.ref}` }),
  }))

  ctx.tools.register(defineTool({
    name: 'browser_type',
    description: 'Fill one input element from the latest snapshot by its ref, optionally pressing Enter, then return the refreshed snapshot.',
    parameters: {
      ref: { type: 'number', required: true, description: 'Input element ref from the latest browser_snapshot.' },
      text: { type: 'string', required: true, description: 'Text to fill in.' },
      submit: { type: 'boolean', description: 'Press Enter after filling (for search boxes). Defaults to false.' },
    },
    output: {
      schema: SNAPSHOT_VALUE,
      render: (_args, value) => [{ type: 'text', text: formatSnapshot(value) }],
    },
    timeoutMs: resolved.timeoutMs,
    async execute(args, exec) {
      if (!Number.isInteger(args.ref) || args.ref < 1 || args.ref > lastElements) {
        throw staleRefError(args.ref, lastElements)
      }
      return snapshotAfter(async (page) => {
        await page.fill(`[data-dsh-ref="${args.ref}"]`, args.text, { timeout: 15_000 })
        if (args.submit === true) await page.keyboard.press('Enter')
      }, exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: `输入「${args.text.slice(0, 40)}」` }),
  }))

  ctx.tools.register(defineTool({
    name: 'browser_scroll',
    description: 'Scroll the current page and return the refreshed snapshot.',
    parameters: {
      amount: { type: 'number', description: 'Pixels to scroll; positive scrolls down, negative scrolls up. Defaults to 800.' },
    },
    output: {
      schema: SNAPSHOT_VALUE,
      render: (_args, value) => [{ type: 'text', text: formatSnapshot(value) }],
    },
    timeoutMs: resolved.timeoutMs,
    async execute(args, exec) {
      const amount = args.amount ?? 800
      return snapshotAfter(page => page.mouse.wheel(0, amount).then(() => undefined), exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: `滚动页面 ${args.amount ?? 800}px` }),
  }))

  ctx.tools.register(defineTool({
    name: 'browser_back',
    description: 'Go back one page in the persistent collect browser and return the refreshed snapshot.',
    parameters: {},
    output: {
      schema: SNAPSHOT_VALUE,
      render: (_args, value) => [{ type: 'text', text: formatSnapshot(value) }],
    },
    timeoutMs: resolved.timeoutMs,
    async execute(_args, exec) {
      return snapshotAfter(
        page => page.goBack({ waitUntil: 'domcontentloaded', timeout: 60_000 }).then(() => undefined),
        exec.signal,
      )
    },
    presentCall: () => ({ card: 'generic', title: '返回上一页' }),
  }))

  ctx.tools.register(defineTool({
    name: 'browser_login',
    description: 'Open a headed login window for one platform; the person completes the sign-in there, and the saved login state is verified before this returns.',
    parameters: {
      platform: { type: 'string', required: true, description: 'Platform to log into (e.g. jd).' },
      url: { type: 'string', description: 'Login entry URL; defaults to the platform login page.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          detail: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok ? `登录成功：${value.detail}` : `登录未完成：${value.detail}`,
      }],
    },
    timeoutMs: resolved.timeoutMs,
    async execute(args) {
      const flow = loginFlowOf(args.platform as CollectPlatform)
      if (flow === undefined) {
        throw new Error(`平台 ${args.platform} 暂未提供登录流程；请告知用户手动登录后重试`)
      }
      return browser.login(args.url ?? flow.entryUrl, flow.loggedIn)
    },
    presentCall: args => ({ card: 'generic', title: `打开 ${args.platform} 登录窗口` }),
  }))

  ctx.tools.register(defineTool({
    name: 'collect_discover_submit',
    description: 'Persist shop and product links discovered by browsing into the rxlab_collect domain. Each entry is validated independently; duplicates merge.',
    parameters: {
      links: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', required: true },
            platform: { type: 'string' },
            shopId: { type: 'string' },
            shopName: { type: 'string' },
            sku: { type: 'string' },
            titleAtAdd: { type: 'string' },
          },
        },
        description: `Discovered link entries; 1–${resolved.maxSubmitLinks} per call. platform may be omitted to let the host guess from the url.`,
      },
    },
    output: {
      schema: SUBMIT_VALUE,
      render: (_args, value) => [{ type: 'text', text: formatSubmitValue(value) }],
    },
    timeoutMs: resolved.timeoutMs,
    async execute(args) {
      const links = parseSubmitLinks(args.links, resolved.maxSubmitLinks)
      const result = await controller.submitDiscovered(links)
      // Project the controller receipt onto the unbranded canonical output value.
      return {
        created: result.created.map(projectLink),
        merged: result.merged.map(projectLink),
        rejected: result.rejected.map(rejection => ({ link: projectDiscovered(rejection.link), reason: rejection.reason })),
      }
    },
    presentCall: args => ({ card: 'generic', title: `入库 ${args.links.length} 条链接` }),
  }))

  ctx.tools.register(defineTool({
    name: 'collect_list_links',
    description: 'List stored link assets so discovery can skip urls already collected.',
    parameters: {
      platform: { type: 'string', description: 'Restrict to one platform.' },
      query: { type: 'string', description: 'Case-insensitive substring matched against shop, sku, and url.' },
      limit: { type: 'number', description: 'Maximum rows to return; defaults to 100.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          items: { type: 'array', required: true, items: LINK_VALUE },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatLinkList(value.items) }],
    },
    timeoutMs: resolved.timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args) {
      const limit = Math.min(Math.max(args.limit ?? 100, 1), 500)
      const { items } = await controller.listLinks({
        ...(args.platform === undefined ? {} : { platform: args.platform as CollectPlatform }),
        ...(args.query === undefined ? {} : { query: args.query }),
      })
      return { items: items.slice(0, limit).map(projectLink) }
    },
    presentCall: args => ({ card: 'generic', title: `查询链接资产${args.query === undefined ? '' : `「${args.query}」`}` }),
  }))
}
