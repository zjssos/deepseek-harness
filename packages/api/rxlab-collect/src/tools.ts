/**
 * Model-facing tools for the rxlab collect agent. The agent reads material a
 * person hands it — pasted text, or a page it fetches with the web tools — and
 * records what it derived as pending drafts: `collect_draft_submit` writes
 * only to the draft table, and `collect_list_shops` / `collect_list_links`
 * read what the workbench already holds so the agent can avoid proposing a
 * duplicate. Nothing the model does reaches the shop or product tables; a
 * person accepts or rejects each draft in the workbench. This module owns
 * schemas, argument validation, result bounds, and model guidance; the data
 * lives in `CollectController`.
 * @module @deepseek-ai/dsh-rxlab-collect/src/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { platformFromUrl } from './parse.ts'
import type {
  CollectDraftPayload,
  CollectDraftSubmission,
  CollectLink,
  CollectPlatform,
  CollectShop,
  CollectShopId,
} from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'rxlab-collect-tools'

/** Services required by the collect agent tool suite. */
export const inject = ['tools', 'systemPrompt', 'collectController']

/** Default cooperative timeout budget (ms) for one collect tool call. */
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000

/** Default cap on drafts accepted by one `collect_draft_submit` call. */
export const DEFAULT_MAX_SUBMIT_DRAFTS = 100

/** Default cap on rows returned by one list call. */
export const DEFAULT_LIST_LIMIT = 100

/** Plugin config: call timeout and the submission bound. */
export interface Config {
  /** Cooperative timeout budget (ms) for each collect tool call. Defaults to 30000. */
  timeoutMs?: number
  /** Cap on drafts accepted by one `collect_draft_submit` call. Defaults to 100. */
  maxSubmitDrafts?: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().default(DEFAULT_TOOL_TIMEOUT_MS),
  maxSubmitDrafts: z.number().default(DEFAULT_MAX_SUBMIT_DRAFTS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** The platform vocabulary a draft entry may name. */
const PLATFORMS: readonly CollectPlatform[] = ['jd', 'taobao', '1688', 'manual']

/** Configured counts and caps must be positive integers. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`rxlab-collect-tools: ${name} must be a positive integer`)
  }
}

/** One draft entry as the model supplies it (unbranded, schema-shaped). */
export interface DraftEntryValue {
  target: string
  platform?: string
  name?: string
  shopKey?: string
  homeUrl?: string
  url?: string
  shopRef?: string
  sku?: string
  title?: string
  price?: string
  selectedSku?: string
  mainImageUrl?: string
  buyUrl?: string
  note?: string
  params?: readonly { readonly name: string; readonly value: string }[]
  sourceText?: string
}

/** Canonical output projection of one stored shop (unbranded, schema-shaped). */
export interface ShopValue {
  id: string
  platform: string
  name: string
  updatedAt: string
  shopKey?: string
  homeUrl?: string
  note?: string
}

/** Canonical output projection of one stored product entry (unbranded, schema-shaped). */
export interface LinkValue {
  id: string
  platform: string
  url: string
  updatedAt: string
  shopRef?: string
  sku?: string
  title?: string
  price?: number
  priceRaw?: string
  selectedSku?: string
  mainImageUrl?: string
  buyUrl?: string
  note?: string
}

/** Canonical output projection of one stored draft (unbranded, schema-shaped). */
export interface DraftValue {
  id: string
  target: string
  status: string
  /** One-line description of what the draft would write. */
  summary: string
  createdAt: string
}

/** The draft submission receipt as the tool's canonical output value. */
export interface DraftSubmitReceipt {
  created: DraftValue[]
  rejected: { target: string; reason: string }[]
}

/** Brand one raw shop key read from model input; the controller rejects an unknown one. */
function asShopId(value: string): CollectShopId {
  return value as CollectShopId
}

/** Resolve the platform a draft names, falling back to the one its url implies. */
function resolvePlatform(named: string | undefined, url: string | undefined): CollectPlatform {
  const value = named?.trim()
  if (value !== undefined && value.length > 0) {
    if (!(PLATFORMS as readonly string[]).includes(value)) {
      throw new Error(`platform must be one of ${PLATFORMS.join('/')}, got: ${value}`)
    }
    return value as CollectPlatform
  }
  const guessed = url === undefined ? undefined : platformFromUrl(url)
  if (guessed === undefined) {
    throw new Error('platform is required when the url does not reveal one')
  }
  return guessed
}

/**
 * Parse a displayed price text into its numeric value. Returns null when the
 * text holds no digits, so an unreadable price leaves the field absent rather
 * than storing a wrong number.
 */
export function parsePriceText(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, '')
  if (cleaned === '' || cleaned === '.') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** Project one entry the model submitted onto the controller's draft payload. */
function toDraftPayload(entry: DraftEntryValue): CollectDraftPayload {
  if (entry.target !== 'shop' && entry.target !== 'product') {
    throw new Error(`target must be 'shop' or 'product', got: ${entry.target}`)
  }
  if (entry.target === 'shop') {
    const name = entry.name?.trim()
    if (name === undefined || name.length === 0) throw new Error('a shop entry needs a name')
    return {
      target: 'shop',
      platform: resolvePlatform(entry.platform, entry.homeUrl),
      name,
      ...(entry.shopKey === undefined ? {} : { shopKey: entry.shopKey }),
      ...(entry.homeUrl === undefined ? {} : { homeUrl: entry.homeUrl }),
      ...(entry.note === undefined ? {} : { note: entry.note }),
    }
  }
  const url = entry.url?.trim()
  if (url === undefined || url.length === 0) throw new Error('a product entry needs a url')
  const priceText = entry.price?.trim()
  const priceValue = priceText === undefined || priceText.length === 0 ? null : parsePriceText(priceText)
  return {
    target: 'product',
    platform: resolvePlatform(entry.platform, url),
    url,
    ...(entry.shopRef === undefined ? {} : { shopRef: asShopId(entry.shopRef) }),
    ...(entry.sku === undefined ? {} : { sku: entry.sku }),
    ...(entry.title === undefined ? {} : { title: entry.title }),
    ...(priceText === undefined || priceText.length === 0 || priceValue === null
      ? {}
      : { price: { value: priceValue, raw: priceText } }),
    ...(entry.selectedSku === undefined ? {} : { selectedSku: entry.selectedSku }),
    ...(entry.params === undefined ? {} : { params: entry.params }),
    ...(entry.mainImageUrl === undefined ? {} : { mainImageUrl: entry.mainImageUrl }),
    ...(entry.buyUrl === undefined ? {} : { buyUrl: entry.buyUrl }),
    ...(entry.note === undefined ? {} : { note: entry.note }),
  }
}

/** Validate the submitted entries and their bound before the controller sees them. */
function parseSubmitDrafts(
  entries: readonly DraftEntryValue[],
  maxSubmitDrafts: number,
): readonly CollectDraftSubmission[] {
  if (entries.length === 0) throw new Error('drafts must contain at least one entry')
  if (entries.length > maxSubmitDrafts) {
    throw new Error(`drafts must contain at most ${maxSubmitDrafts} entries; split the submission`)
  }
  return entries.map(entry => ({
    payload: toDraftPayload(entry),
    ...(entry.sourceText === undefined ? {} : { sourceText: entry.sourceText }),
  }))
}

/** One-line description of what one draft payload would write. */
export function describeDraftPayload(payload: CollectDraftPayload): string {
  if (payload.target === 'shop') return `店铺 ${payload.platform} ${payload.name}`
  const label = payload.title === undefined ? payload.url : payload.title
  return `商品 ${payload.platform} ${label}${payload.price === undefined ? '' : ` ${payload.price.raw}`}`
}

/** Render one draft submission receipt as the model-facing text block. */
export function formatDraftSubmit(value: DraftSubmitReceipt): string {
  const lines = [
    `已提交待确认草稿 ${value.created.length} 条，拒绝 ${value.rejected.length} 条。`,
  ]
  for (const draft of value.created) lines.push(`- ${draft.summary}（草稿 ${draft.id}，待人工确认）`)
  for (const rejection of value.rejected) lines.push(`- 拒绝 ${rejection.target}: ${rejection.reason}`)
  if (value.created.length > 0) {
    lines.push('这些草稿不会自动入库：需要用户在采集模块逐条确认后才写入。请勿重复提交同一批信息。')
  }
  return lines.join('\n')
}

/** Render one shop list as the model-facing text block. */
export function formatShopList(items: readonly ShopValue[]): string {
  if (items.length === 0) return '当前没有已登记的店铺。'
  return [
    `共 ${items.length} 个已登记店铺：`,
    ...items.map(shop =>
      `- ${shop.platform} ${shop.name}（id=${shop.id}${shop.homeUrl === undefined ? '' : ` ${shop.homeUrl}`}）`),
  ].join('\n')
}

/** Render one product list as the model-facing text block. */
export function formatLinkList(items: readonly LinkValue[]): string {
  if (items.length === 0) return '当前没有已登记的商品条目。'
  return [
    `共 ${items.length} 条已登记商品条目：`,
    ...items.map(link =>
      `- ${link.platform} ${link.url}${link.title === undefined ? '' : ` ${link.title}`}`
      + (link.shopRef === undefined ? '' : `（店铺 ${link.shopRef}）`)),
  ].join('\n')
}

/**
 * Project one stored shop onto the unbranded schema value shape. Branded ids
 * and `T | undefined` optional fields collapse to plain JSON field presence.
 */
function projectShop(shop: CollectShop): ShopValue {
  return {
    id: String(shop.id),
    platform: shop.platform,
    name: shop.name,
    updatedAt: shop.updatedAt,
    ...(shop.shopKey === undefined ? {} : { shopKey: shop.shopKey }),
    ...(shop.homeUrl === undefined ? {} : { homeUrl: shop.homeUrl }),
    ...(shop.note === undefined ? {} : { note: shop.note }),
  }
}

/** Project one stored product entry onto the unbranded schema value shape. */
function projectLink(link: CollectLink): LinkValue {
  return {
    id: String(link.id),
    platform: link.platform,
    url: link.url,
    updatedAt: link.updatedAt,
    ...(link.shopRef === undefined ? {} : { shopRef: String(link.shopRef) }),
    ...(link.sku === undefined ? {} : { sku: link.sku }),
    ...(link.title === undefined ? {} : { title: link.title }),
    ...(link.price === undefined ? {} : { price: link.price.value, priceRaw: link.price.raw }),
    ...(link.selectedSku === undefined ? {} : { selectedSku: link.selectedSku }),
    ...(link.mainImageUrl === undefined ? {} : { mainImageUrl: link.mainImageUrl }),
    ...(link.buyUrl === undefined ? {} : { buyUrl: link.buyUrl }),
    ...(link.note === undefined ? {} : { note: link.note }),
  }
}

/** Output spec of one registered shop (the {@link ShopValue} fields). */
const SHOP_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    platform: { type: 'string', required: true },
    name: { type: 'string', required: true },
    updatedAt: { type: 'string', required: true },
    shopKey: { type: 'string' },
    homeUrl: { type: 'string' },
    note: { type: 'string' },
  },
} as const

/** Output spec of one product entry (the {@link LinkValue} fields). */
const LINK_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    platform: { type: 'string', required: true },
    url: { type: 'string', required: true },
    updatedAt: { type: 'string', required: true },
    shopRef: { type: 'string' },
    sku: { type: 'string' },
    title: { type: 'string' },
    price: { type: 'number' },
    priceRaw: { type: 'string' },
    selectedSku: { type: 'string' },
    mainImageUrl: { type: 'string' },
    buyUrl: { type: 'string' },
    note: { type: 'string' },
  },
} as const

/** Input spec of one draft entry the model submits. */
const DRAFT_ENTRY_PARAM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    target: { type: 'string', required: true, description: "'shop' or 'product'." },
    platform: { type: 'string', description: 'jd / taobao / 1688 / manual; inferred from the url when omitted.' },
    name: { type: 'string', description: 'Shop name (target=shop).' },
    shopKey: { type: 'string', description: 'Platform-side shop id (target=shop).' },
    homeUrl: { type: 'string', description: 'Shop home page url (target=shop).' },
    url: { type: 'string', description: 'Product page url (target=product).' },
    shopRef: { type: 'string', description: 'Id of a registered shop to file the product under.' },
    sku: { type: 'string', description: 'Platform product id (target=product).' },
    title: { type: 'string', description: 'Product title (target=product).' },
    price: { type: 'string', description: 'Displayed price text exactly as the material showed it (target=product).' },
    selectedSku: { type: 'string', description: 'Selected variant label (target=product).' },
    mainImageUrl: { type: 'string', description: 'Main image url (target=product).' },
    buyUrl: { type: 'string', description: 'Purchase link (target=product).' },
    note: { type: 'string', description: 'Free-form note.' },
    params: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          value: { type: 'string', required: true },
        },
      },
      description: 'Spec name/value pairs such as 材质/尺寸 (target=product).',
    },
    sourceText: { type: 'string', description: 'The material this entry was derived from, kept for the review step.' },
  },
} as const

/**
 * Register the collect draft and lookup tools plus their system-prompt
 * guidance. All registrations are effect-scoped and unregister on plugin
 * dispose. The lookup tools are read-only and opt into concurrency; the
 * submission tool writes pending drafts only.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive
 *   the registrations, resolved with the collect controller.
 * @param config - schemastery-resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  assertPositiveInteger('maxSubmitDrafts', resolved.maxSubmitDrafts)

  const controller = ctx.collectController

  ctx.systemPrompt.section({
    name: 'tool:collect',
    order: ctx.systemPrompt.getSectionOrder('TOOL_COLLECT'),
    text: [
      'The collect_* tools serve the rxlab 商品采集 module, which a person drives by hand.',
      'collect_draft_submit records structured entries you derived from material the person gave you; it never writes a shop or a product entry directly.',
      'A person reviews every draft in the workbench and accepts or rejects it, so submit only what the material actually supports.',
      'Call collect_list_shops and collect_list_links first so you never propose a shop or product the workbench already holds.',
    ].join(' '),
  })

  ctx.tools.register(defineTool({
    name: 'collect_draft_submit',
    description: 'Record shop and product entries derived from material the person provided as pending drafts for their review. Nothing reaches the shop or product tables until a person accepts a draft.',
    parameters: {
      drafts: {
        type: 'array',
        required: true,
        items: DRAFT_ENTRY_PARAM,
        description: `Draft entries to propose; 1–${resolved.maxSubmitDrafts} per call. Every entry needs a target and either a name (shop) or a url (product).`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          created: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                target: { type: 'string', required: true },
                status: { type: 'string', required: true },
                summary: { type: 'string', required: true },
                createdAt: { type: 'string', required: true },
              },
            },
          },
          rejected: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                target: { type: 'string', required: true },
                reason: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatDraftSubmit(value) }],
    },
    timeoutMs: resolved.timeoutMs,
    async execute(args) {
      const submissions = parseSubmitDrafts(args.drafts, resolved.maxSubmitDrafts)
      const result = await controller.submitDrafts(submissions)
      return {
        created: result.created.map(draft => ({
          id: String(draft.id),
          target: draft.payload.target,
          status: draft.status,
          summary: describeDraftPayload(draft.payload),
          createdAt: draft.createdAt,
        })),
        rejected: result.rejected.map(rejection => ({
          target: rejection.payload.target,
          reason: rejection.reason,
        })),
      }
    },
    presentCall: args => ({ card: 'generic', title: `提交 ${args.drafts.length} 条待确认草稿` }),
  }))

  ctx.tools.register(defineTool({
    name: 'collect_list_shops',
    description: 'List the shops the workbench already holds, so a proposed shop is never a duplicate.',
    parameters: {
      platform: { type: 'string', description: 'Restrict to one platform.' },
      query: { type: 'string', description: 'Case-insensitive substring matched against shop name, key, and home url.' },
      limit: { type: 'number', description: `Maximum rows to return; defaults to ${DEFAULT_LIST_LIMIT}.` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          items: { type: 'array', required: true, items: SHOP_VALUE },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatShopList(value.items) }],
    },
    timeoutMs: resolved.timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args) {
      const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIST_LIMIT, 1), 500)
      const { shops } = await controller.listShops({
        ...(args.platform === undefined ? {} : { platform: args.platform as CollectPlatform }),
        ...(args.query === undefined ? {} : { query: args.query }),
      })
      return { items: shops.slice(0, limit).map(projectShop) }
    },
    presentCall: args => ({ card: 'generic', title: `查询店铺${args.query === undefined ? '' : `「${args.query}」`}` }),
  }))

  ctx.tools.register(defineTool({
    name: 'collect_list_links',
    description: 'List the product entries the workbench already holds, so a proposed product is never a duplicate.',
    parameters: {
      platform: { type: 'string', description: 'Restrict to one platform.' },
      shopRef: { type: 'string', description: 'Restrict to one registered shop id.' },
      query: { type: 'string', description: 'Case-insensitive substring matched against title, sku, and url.' },
      limit: { type: 'number', description: `Maximum rows to return; defaults to ${DEFAULT_LIST_LIMIT}.` },
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
      const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIST_LIMIT, 1), 500)
      const { items } = await controller.listLinks({
        ...(args.platform === undefined ? {} : { platform: args.platform as CollectPlatform }),
        ...(args.shopRef === undefined ? {} : { shopRef: asShopId(args.shopRef) }),
        ...(args.query === undefined ? {} : { query: args.query }),
      })
      return { items: items.slice(0, limit).map(projectLink) }
    },
    presentCall: args => ({ card: 'generic', title: `查询商品条目${args.query === undefined ? '' : `「${args.query}」`}` }),
  }))
}
