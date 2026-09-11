/**
 * Host Collect Remote owner for the rxlab product collect module: the
 * `rxlabCollect` namespace over the `rxlab_collect` storage domain — the
 * shops a person registers, the product entries filed under them, and the
 * drafts the collect agent proposes. Every product field is entered by hand or
 * confirmed from a draft; the controller runs no collector and needs no model
 * key. This package mounts its own namespace on the Client side (see
 * `src/client/index.ts`) and is a rxlab-app data row; it deliberately never
 * joins the platform `api-remotes` assembly.
 * @module @deepseek-ai/dsh-rxlab-collect
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { z } from 'zod'
import {
  collectDomainSpec,
  collectDraftPayloadSchema,
  collectDraftSchema,
  collectLinkSchema,
  collectProductDraftSchema,
  collectShopDraftSchema,
  collectShopSchema,
} from './domain.ts'
import {
  csvToRecords, jdDesktopUrl, jdSkuFromUrl, platformFromUrl, readableError, taobaoIdFromUrl, taobaoItemUrl,
} from './parse.ts'
import type {
  CollectDraftCommitRequest,
  CollectDraftCommitValue,
  CollectDraftId,
  CollectDraftListRequest,
  CollectDraftListValue,
  CollectDraftPayload,
  CollectDraftRejectRequest,
  CollectDraftRejectValue,
  CollectDraftSubmission,
  CollectDraftSubmitValue,
  CollectLink,
  CollectLinkGetRequest,
  CollectLinkGetValue,
  CollectLinkId,
  CollectLinkImportRequest,
  CollectLinkImportValue,
  CollectLinkListRequest,
  CollectLinkListValue,
  CollectLinkRemoveRequest,
  CollectLinkRemoveValue,
  CollectLinkUpsertRequest,
  CollectLinkUpsertValue,
  CollectPlatform,
  CollectShopGetRequest,
  CollectShopGetValue,
  CollectShopId,
  CollectShopListRequest,
  CollectShopListValue,
  CollectShopRemoveRequest,
  CollectShopRemoveValue,
  CollectShopUpsertRequest,
  CollectShopUpsertValue,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host business API and Remote namespace owner for the rxlab collect module. */
    collectController: CollectController
  }
}

type StoredShop = z.infer<typeof collectShopSchema>
type StoredLink = z.infer<typeof collectLinkSchema>
type StoredDraft = z.infer<typeof collectDraftSchema>

const PLATFORMS: readonly CollectPlatform[] = ['jd', 'taobao', '1688', 'manual']

/** Brand one raw uuid as a shop key. */
function newShopId(): CollectShopId {
  return randomUUID() as CollectShopId
}

/** Brand one raw uuid as a product entry key. */
function newLinkId(): CollectLinkId {
  return randomUUID() as CollectLinkId
}

/** Brand one raw uuid as a draft key. */
function newDraftId(): CollectDraftId {
  return randomUUID() as CollectDraftId
}

/** Validate one wire value against a zod schema or throw the wire failure. */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, subject: string): T {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
  const first = issues[0]
  const hint = first === undefined
    ? ''
    : ` (${first.path === '' ? 'root' : first.path}: ${first.message})`
  throw new RemoteError('gateway/bad-request', `rxlab collect ${subject} failed validation${hint}`, { issues })
}

/** Compact one-line description of a zod failure, for a rejection receipt. */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map(issue => `${issue.path.join('.') || 'row'}: ${issue.message}`)
    .join('; ')
}

/** Platform for one CSV record: the column value (validated), else a host guess. */
function platformOf(recordPlatform: string, url: string): CollectPlatform | undefined {
  if (recordPlatform !== '') {
    return (PLATFORMS as readonly string[]).includes(recordPlatform) ? recordPlatform as CollectPlatform : undefined
  }
  return platformFromUrl(url)
}

/**
 * Canonical address for one product draft: the platform's stable product URL
 * when the entered url carries an id, so the same product entered twice
 * merges. Platforms without a derivable id keep the entered url trimmed.
 */
function canonicalize(platform: CollectPlatform, url: string, sku: string | undefined): {
  url: string
  sku?: string | undefined
} {
  if (platform === 'jd') {
    const derived = sku ?? jdSkuFromUrl(url)
    if (derived === null) {
      throw new RemoteError('gateway/bad-request', '京东链接需要是含 sku 的商品详情页(item.jd.com)', {})
    }
    return { url: jdDesktopUrl(derived), sku: derived }
  }
  if (platform === 'taobao') {
    const derived = sku ?? taobaoIdFromUrl(url)
    if (derived === null) {
      throw new RemoteError('gateway/bad-request', '淘宝/天猫链接需要是含 id 的商品详情页', {})
    }
    return { url: taobaoItemUrl(derived), sku: derived }
  }
  return { url: url.trim(), ...(sku === undefined ? {} : { sku }) }
}

/**
 * Host service backing the generated `ctx.remote.rxlabCollect` namespace.
 * Shops, product entries, and drafts live in the `rxlab_collect` domain;
 * writes queue on the domain's write chain and emit `domain/changed` after
 * durability. Only a hand-entry call and an accepted draft write records;
 * a pending draft never reaches the shop or product tables.
 */
export class CollectController extends TypertRemoteService {
  static inject = ['storageDomain']

  private shops?: KvTable<CollectShopId, StoredShop>
  private links?: KvTable<CollectLinkId, StoredLink>
  private drafts?: KvTable<CollectDraftId, StoredDraft>

  /**
   * Register the collect namespace on the Typert Gateway.
   * @param ctx - Host context carrying the storage-domain facility.
   */
  constructor(ctx: Context) {
    super(ctx, 'collectController', { namespace: 'rxlabCollect' })
  }

  /** Open the collect domain for the controller's lifetime. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(collectDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'rxlab_collect.domainClose')
    this.shops = domain.table('shops')
    this.links = domain.table('links')
    this.drafts = domain.table('drafts')
  }

  private requireShops(): KvTable<CollectShopId, StoredShop> {
    if (this.shops === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab collect domain is not open; the storage-domain row must be active before the collect row', {})
    }
    return this.shops
  }

  private requireLinks(): KvTable<CollectLinkId, StoredLink> {
    if (this.links === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab collect domain is not open; the storage-domain row must be active before the collect row', {})
    }
    return this.links
  }

  private requireDrafts(): KvTable<CollectDraftId, StoredDraft> {
    if (this.drafts === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab collect domain is not open; the storage-domain row must be active before the collect row', {})
    }
    return this.drafts
  }

  /**
   * List registered shops, newest write first, with a platform filter and a
   * case-insensitive name/key/home-url substring match.
   * @param request - filters; absent fields match everything.
   * @returns matching shops in list order.
   */
  @Remote('listShops')
  // oxlint-disable-next-line typescript/require-await -- synchronous memory reads keep the Remote surface's async signature
  async listShops(request: CollectShopListRequest): Promise<CollectShopListValue> {
    const query = request.query?.trim().toLocaleLowerCase()
    const rows = [...this.requireShops().entries()]
      .filter(([, shop]) =>
        (request.platform === undefined || shop.platform === request.platform)
        && (query === undefined || query.length === 0 || matchesShopQuery(shop, query)))
    rows.sort(([, left], [, right]) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || String(left.id).localeCompare(String(right.id)))
    return { shops: rows.map(([, shop]) => shop) }
  }

  /**
   * Read one registered shop.
   * @param request - target shop identity.
   * @returns the full stored shop.
   * @throws RemoteError `collect/shop-not-found` when no shop carries the id.
   */
  @Remote('getShop')
  // oxlint-disable-next-line typescript/require-await -- synchronous memory reads keep the Remote surface's async signature
  async getShop(request: CollectShopGetRequest): Promise<CollectShopGetValue> {
    const shop = this.requireShops().get(request.id)
    if (shop === undefined) {
      throw new RemoteError('collect/shop-not-found', `rxlab collect has no shop '${String(request.id)}'`, {
        id: request.id,
      })
    }
    return { shop }
  }

  /**
   * Register or replace one shop. Shops are not de-duplicated: a present id
   * replaces that row, an absent id always mints a new one.
   * @param request - full draft for the new or replaced shop.
   * @returns the stored shop.
   * @throws RemoteError `gateway/bad-request` when the draft fails its zod schema.
   */
  @Remote('upsertShop')
  async upsertShop(request: CollectShopUpsertRequest): Promise<CollectShopUpsertValue> {
    const draft = parseOrThrow(collectShopDraftSchema, request.shop, 'shop draft')
    return { shop: await this.upsertShopOne(draft) }
  }

  /**
   * Remove one shop. Its product entries are never deleted: each one loses
   * its shop link and returns to the unfiled list.
   * @param request - target shop identity.
   * @returns whether a shop existed under the id, and how many entries were unfiled.
   */
  @Remote('removeShop')
  async removeShop(request: CollectShopRemoveRequest): Promise<CollectShopRemoveValue> {
    const removed = await this.requireShops().delete(request.id)
    if (!removed) return { removed: false, unfiled: 0 }
    const links = this.requireLinks()
    const now = new Date().toISOString()
    let unfiled = 0
    for (const [id, link] of links.entries()) {
      if (link.shopRef !== request.id) continue
      await links.put(id, parseOrThrow(collectLinkSchema, { ...link, shopRef: undefined, updatedAt: now }, 'link'))
      unfiled += 1
    }
    return { removed: true, unfiled }
  }

  /**
   * List product entries, newest write first, with platform/shop/unfiled
   * filters and a case-insensitive title/sku/shop/url substring match.
   * @param request - filters; absent fields match everything.
   * @returns matching entries in list order.
   */
  @Remote('listLinks')
  // oxlint-disable-next-line typescript/require-await -- synchronous memory reads keep the Remote surface's async signature
  async listLinks(request: CollectLinkListRequest): Promise<CollectLinkListValue> {
    const query = request.query?.trim().toLocaleLowerCase()
    const rows = [...this.requireLinks().entries()]
      .filter(([, link]) =>
        (request.platform === undefined || link.platform === request.platform)
        && (request.shopRef === undefined || link.shopRef === request.shopRef)
        && (request.unfiled !== true || link.shopRef === undefined)
        && (query === undefined || query.length === 0 || matchesLinkQuery(link, query)))
    rows.sort(([, left], [, right]) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || String(left.id).localeCompare(String(right.id)))
    return { items: rows.map(([, link]) => link) }
  }

  /**
   * Read one complete product entry.
   * @param request - target entry identity.
   * @returns the full stored entry.
   * @throws RemoteError `collect/link-not-found` when no entry carries the id.
   */
  @Remote('getLink')
  // oxlint-disable-next-line typescript/require-await -- synchronous memory reads keep the Remote surface's async signature
  async getLink(request: CollectLinkGetRequest): Promise<CollectLinkGetValue> {
    const link = this.requireLinks().get(request.id)
    if (link === undefined) {
      throw new RemoteError('collect/link-not-found', `rxlab collect has no link '${String(request.id)}'`, {
        id: request.id,
      })
    }
    return { link }
  }

  /**
   * Create or replace one product entry. A present id replaces that row; an
   * absent id mints a row unless another entry already holds the same
   * platform+canonical-url, which merges into that row instead.
   * @param request - full draft for the new or replaced entry.
   * @returns the stored entry and whether it merged into an existing row.
   * @throws RemoteError `gateway/bad-request` when the draft fails its zod
   * schema or a JD/Taobao url carries no id.
   * @throws RemoteError `collect/shop-not-found` when the draft names an unknown shop.
   */
  @Remote('upsertLink')
  async upsertLink(request: CollectLinkUpsertRequest): Promise<CollectLinkUpsertValue> {
    const draft = parseOrThrow(collectProductDraftSchema, request.link, 'link draft')
    const stored = await this.upsertLinkOne(draft)
    return { link: stored.link, merged: stored.merged }
  }

  /**
   * Remove one product entry.
   * @param request - target entry identity.
   * @returns whether a row existed under the id (false never writes).
   */
  @Remote('removeLink')
  async removeLink(request: CollectLinkRemoveRequest): Promise<CollectLinkRemoveValue> {
    return { removed: await this.requireLinks().delete(request.id) }
  }

  /**
   * Bulk-create product entries from CSV text (header: url + optional
   * platform/sku/title). Rows are validated independently; invalid rows come
   * back as rejections while valid rows upsert as usual.
   * @param request - the raw CSV text blob and the shop the rows are filed under.
   * @returns created/merged entries and row-level rejections.
   * @throws RemoteError `collect/shop-not-found` when the request names an unknown shop.
   */
  @Remote('importLinks')
  async importLinks(request: CollectLinkImportRequest): Promise<CollectLinkImportValue> {
    if (request.shopRef !== undefined) this.requireShopRef(request.shopRef)
    const { records, errors } = csvToRecords(request.text)
    const created: CollectLink[] = []
    const updated: CollectLink[] = []
    const rejected: { row: number; reason: string }[] = [...errors]
    for (const [index, record] of records.entries()) {
      const row = index + 2
      const platform = platformOf(record.platform, record.url)
      if (platform === undefined) {
        rejected.push({ row, reason: `无法推断平台: ${record.platform || record.url}` })
        continue
      }
      const parsed = collectProductDraftSchema.safeParse({
        platform,
        url: record.url,
        ...(record.sku === undefined ? {} : { sku: record.sku }),
        ...(record.title === undefined ? {} : { title: record.title }),
        ...(request.shopRef === undefined ? {} : { shopRef: request.shopRef }),
      })
      if (!parsed.success) {
        rejected.push({ row, reason: formatIssues(parsed.error).slice(0, 400) })
        continue
      }
      try {
        const stored = await this.upsertLinkOne(parsed.data)
        ;(stored.merged ? updated : created).push(stored.link)
      } catch (cause) {
        rejected.push({ row, reason: readableError(cause).slice(0, 400) })
      }
    }
    return { created, updated, rejected }
  }

  /**
   * List drafts, newest first.
   * @param request - optional status and target filters.
   * @returns draft rows in list order.
   */
  @Remote('listDrafts')
  // oxlint-disable-next-line typescript/require-await -- synchronous memory reads keep the Remote surface's async signature
  async listDrafts(request: CollectDraftListRequest): Promise<CollectDraftListValue> {
    const rows = [...this.requireDrafts().entries()]
      .filter(([, draft]) =>
        (request.status === undefined || draft.status === request.status)
        && (request.target === undefined || draft.payload.target === request.target))
    rows.sort(([, left], [, right]) =>
      right.createdAt.localeCompare(left.createdAt)
      || String(left.id).localeCompare(String(right.id)))
    return { drafts: rows.map(([, draft]) => draft) }
  }

  /**
   * Accept one pending draft, writing the shop or product entry it proposes
   * and marking the draft accepted in the same call.
   * @param request - target draft identity and an optional owning shop override.
   * @returns the accepted draft plus the record it produced.
   * @throws RemoteError `collect/draft-not-found` when no draft carries the id.
   * @throws RemoteError `collect/draft-not-pending` when the draft is already resolved.
   * @throws RemoteError `collect/shop-not-found` when the entry names an unknown shop.
   */
  @Remote('commitDraft')
  async commitDraft(request: CollectDraftCommitRequest): Promise<CollectDraftCommitValue> {
    const table = this.requireDrafts()
    const draft = table.get(request.id)
    if (draft === undefined) {
      throw new RemoteError('collect/draft-not-found', `rxlab collect has no draft '${String(request.id)}'`, {
        id: request.id,
      })
    }
    if (draft.status !== 'pending') {
      throw new RemoteError('collect/draft-not-pending', `draft '${String(request.id)}' is already ${draft.status}`, {
        id: request.id,
        status: draft.status,
      })
    }
    const now = new Date().toISOString()
    let shop: StoredShop | undefined
    let link: StoredLink | undefined
    if (draft.payload.target === 'shop') {
      shop = await this.upsertShopOne(parseOrThrow(collectShopDraftSchema, draft.payload, 'shop draft'))
    } else {
      const productDraft = parseOrThrow(collectProductDraftSchema, draft.payload, 'link draft')
      link = (await this.upsertLinkOne({
        ...productDraft,
        ...(request.shopRef === undefined ? {} : { shopRef: request.shopRef }),
      })).link
    }
    const resolved = parseOrThrow(collectDraftSchema, {
      ...draft,
      status: 'accepted',
      resolvedAt: now,
      resolvedId: String(shop?.id ?? link?.id ?? ''),
    }, 'draft')
    await table.put(draft.id, resolved)
    return {
      draft: resolved,
      ...(shop === undefined ? {} : { shop }),
      ...(link === undefined ? {} : { link }),
    }
  }

  /**
   * Reject one pending draft; nothing is written to the shop or product tables.
   * @param request - target draft identity.
   * @returns the rejected draft.
   * @throws RemoteError `collect/draft-not-found` when no draft carries the id.
   * @throws RemoteError `collect/draft-not-pending` when the draft is already resolved.
   */
  @Remote('rejectDraft')
  async rejectDraft(request: CollectDraftRejectRequest): Promise<CollectDraftRejectValue> {
    const table = this.requireDrafts()
    const draft = table.get(request.id)
    if (draft === undefined) {
      throw new RemoteError('collect/draft-not-found', `rxlab collect has no draft '${String(request.id)}'`, {
        id: request.id,
      })
    }
    if (draft.status !== 'pending') {
      throw new RemoteError('collect/draft-not-pending', `draft '${String(request.id)}' is already ${draft.status}`, {
        id: request.id,
        status: draft.status,
      })
    }
    const resolved = parseOrThrow(collectDraftSchema, {
      ...draft,
      status: 'rejected',
      resolvedAt: new Date().toISOString(),
    }, 'draft')
    await table.put(draft.id, resolved)
    return { draft: resolved }
  }

  /**
   * Record drafts the collect agent proposed from material a person handed
   * it. Every entry is validated independently and stored as pending; nothing
   * reaches the shop or product tables until a person accepts it. Host-internal:
   * the agent tools call this directly; it registers no Remote method.
   * @param entries - proposed payloads with the material each came from.
   * @returns created drafts and per-entry rejections.
   */
  async submitDrafts(entries: readonly CollectDraftSubmission[]): Promise<CollectDraftSubmitValue> {
    const created: StoredDraft[] = []
    const rejected: { payload: CollectDraftPayload; reason: string }[] = []
    for (const entry of entries) {
      const parsed = collectDraftPayloadSchema.safeParse(entry.payload)
      if (!parsed.success) {
        rejected.push({ payload: entry.payload, reason: formatIssues(parsed.error).slice(0, 400) })
        continue
      }
      try {
        created.push(await this.putDraft(parsed.data, entry.sourceText))
      } catch (cause) {
        rejected.push({ payload: entry.payload, reason: readableError(cause).slice(0, 400) })
      }
    }
    return { created, rejected }
  }

  /** Shared single-shop upsert used by `upsertShop` and an accepted shop draft. */
  private async upsertShopOne(draft: z.infer<typeof collectShopDraftSchema>): Promise<StoredShop> {
    const table = this.requireShops()
    const id = draft.id ?? newShopId()
    const stored = parseOrThrow(collectShopSchema, {
      id,
      updatedAt: new Date().toISOString(),
      platform: draft.platform,
      name: draft.name,
      ...(draft.shopKey === undefined ? {} : { shopKey: draft.shopKey }),
      ...(draft.homeUrl === undefined ? {} : { homeUrl: draft.homeUrl }),
      ...(draft.note === undefined ? {} : { note: draft.note }),
    }, 'shop')
    await table.put(id, stored)
    return stored
  }

  /** Shared single-entry upsert used by `upsertLink`, `importLinks`, and an accepted draft. */
  private async upsertLinkOne(draft: z.infer<typeof collectProductDraftSchema>): Promise<{ link: StoredLink; merged: boolean }> {
    const table = this.requireLinks()
    if (draft.shopRef !== undefined) this.requireShopRef(draft.shopRef)
    const canonical = canonicalize(draft.platform, draft.url, draft.sku)
    let existing: StoredLink | undefined
    let merged = false
    if (draft.id !== undefined) {
      existing = table.get(draft.id)
      merged = existing !== undefined
    } else {
      for (const [, link] of table.entries()) {
        if (link.platform === draft.platform && link.url === canonical.url) {
          existing = link
          merged = true
          break
        }
      }
    }
    const id = existing?.id ?? draft.id ?? newLinkId()
    const stored = parseOrThrow(collectLinkSchema, {
      id,
      updatedAt: new Date().toISOString(),
      platform: draft.platform,
      url: canonical.url,
      ...(canonical.sku === undefined ? {} : { sku: canonical.sku }),
      ...(draft.shopRef === undefined ? {} : { shopRef: draft.shopRef }),
      ...(draft.title === undefined ? {} : { title: draft.title }),
      ...(draft.price === undefined ? {} : { price: draft.price }),
      ...(draft.selectedSku === undefined ? {} : { selectedSku: draft.selectedSku }),
      ...(draft.params === undefined ? {} : { params: draft.params }),
      ...(draft.mainImageUrl === undefined ? {} : { mainImageUrl: draft.mainImageUrl }),
      ...(draft.buyUrl === undefined ? {} : { buyUrl: draft.buyUrl }),
      ...(draft.note === undefined ? {} : { note: draft.note }),
      ...legacyFields(existing),
    }, 'link')
    await table.put(id, stored)
    return { link: stored, merged }
  }

  /** Fail loud when a caller names a shop that is not registered. */
  private requireShopRef(id: CollectShopId): void {
    if (this.requireShops().get(id) === undefined) {
      throw new RemoteError('collect/shop-not-found', `rxlab collect has no shop '${String(id)}'`, { id })
    }
  }

  /** Store one pending draft; the id and createdAt are minted here. */
  private async putDraft(payload: StoredDraft['payload'], sourceText: string | undefined): Promise<StoredDraft> {
    const table = this.requireDrafts()
    const id = newDraftId()
    const trimmed = sourceText?.trim()
    const draft = parseOrThrow(collectDraftSchema, {
      id,
      status: 'pending',
      payload,
      ...(trimmed === undefined || trimmed.length === 0 ? {} : { sourceText: trimmed }),
      createdAt: new Date().toISOString(),
    }, 'draft')
    await table.put(id, draft)
    return draft
  }
}

/**
 * The legacy fields a stored entry keeps. Records written before the
 * hand-entry model carry a platform-side shop id, a shop name text, and a
 * title field named `titleAtAdd`; the controller preserves whatever it found
 * so re-saving an old entry never destroys it.
 */
function legacyFields(existing: StoredLink | undefined): {
  shopId?: string | undefined
  shopName?: string | undefined
  titleAtAdd?: string | undefined
} {
  return {
    ...(existing?.shopId === undefined ? {} : { shopId: existing.shopId }),
    ...(existing?.shopName === undefined ? {} : { shopName: existing.shopName }),
    ...(existing?.titleAtAdd === undefined ? {} : { titleAtAdd: existing.titleAtAdd }),
  }
}

/** Case-insensitive shop match over name, platform-side key, and home url. */
function matchesShopQuery(shop: StoredShop, query: string): boolean {
  const candidates = [shop.name, shop.shopKey, shop.homeUrl]
  return candidates.some(candidate =>
    candidate !== undefined && candidate.toLocaleLowerCase().includes(query))
}

/** Case-insensitive entry match over title, sku, legacy shop text, and url. */
function matchesLinkQuery(link: StoredLink, query: string): boolean {
  const candidates = [link.title, link.titleAtAdd, link.sku, link.shopName, link.url]
  return candidates.some(candidate =>
    candidate !== undefined && candidate.toLocaleLowerCase().includes(query))
}

export default CollectController
