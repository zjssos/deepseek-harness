/**
 * Host Collect Remote owner for the rxlab product collector: the
 * `rxlabCollect` namespace over the `rxlab_collect` storage domain (link
 * assets, capture history, run batches). Link runs are executed by the
 * deterministic platform collectors over a controller-owned headless
 * chromium; the whole run loop is token-free by design, so the module never
 * needs a model key. This package mounts its own namespace on the Client side
 * (see `src/client/index.ts`) and is a rxlab-app data row; it deliberately
 * never joins the platform `api-remotes` assembly.
 * @module @deepseek-ai/dsh-rxlab-collect
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { Context, Service } from '@deepseek-ai/cordis'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { z } from 'zod'
import {
  collectBatchSchema,
  collectCaptureSchema,
  collectDomainSpec,
  collectLinkDraftSchema,
  collectLinkSchema,
} from './domain.ts'
import { createCollectorRegistry } from './executor/index.ts'
import {
  csvToRecords, jdDesktopUrl, jdMobileUrl, jdSkuFromUrl, platformFromUrl, readableError,
  taobaoIdFromUrl, taobaoItemUrl,
} from './executor/parse.ts'
import type { Collector, CollectorResult } from './executor/types.ts'
import type {
  CollectBatchCreateRequest,
  CollectBatchCreateValue,
  CollectBatchGetRequest,
  CollectBatchGetValue,
  CollectBatchId,
  CollectBatchListRequest,
  CollectBatchListValue,
  CollectBatchSummary,
  CollectCaptureId,
  CollectCaptureListRequest,
  CollectCaptureListValue,
  CollectDiscoveredLink,
  CollectDiscoveredSubmitValue,
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
  BrowserLaunchRequest,
  BrowserLaunchValue,
  BrowserStatusInfo,
  BrowserStatusValue,
  BrowserStopValue,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host business API and Remote namespace owner for the rxlab collector. */
    collectController: CollectController
  }
}

type StoredLink = z.infer<typeof collectLinkSchema>
type StoredCapture = z.infer<typeof collectCaptureSchema>
type StoredBatch = z.infer<typeof collectBatchSchema>

const PLATFORMS: readonly CollectPlatform[] = ['jd', 'taobao', '1688', 'manual']

/** Brand one raw uuid as a link key. */
function newLinkId(): CollectLinkId {
  return randomUUID() as CollectLinkId
}

/** Brand one raw uuid as a capture key. */
function newCaptureId(): CollectCaptureId {
  return randomUUID() as CollectCaptureId
}

/** Brand one raw uuid as a batch key. */
function newBatchId(): CollectBatchId {
  return randomUUID() as CollectBatchId
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

/** Platform for one CSV record: the column value (validated), else a host guess. */
function platformOf(recordPlatform: string, url: string): CollectPlatform | undefined {
  if (recordPlatform !== '') {
    return (PLATFORMS as readonly string[]).includes(recordPlatform) ? recordPlatform as CollectPlatform : undefined
  }
  return platformFromUrl(url)
}

/** Effective (canonicalized) link fields for a validated draft. */
function canonicalize(platform: CollectPlatform, url: string, sku: string | undefined): {
  url: string
  mobileUrl?: string | undefined
  sku?: string | undefined
} {
  if (platform === 'jd') {
    const derived = sku ?? jdSkuFromUrl(url)
    if (derived === null) {
      throw new RemoteError('gateway/bad-request', 'JD 链接需要是 item.jd.com 商品详情页(含 sku)', {})
    }
    return { url: jdDesktopUrl(derived), mobileUrl: jdMobileUrl(derived), sku: derived }
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
 * Link assets, captures, and batches live in the `rxlab_collect` domain;
 * writes queue on the domain's write chain and emit `domain/changed` after
 * durability. Batches run serially in-process over the platform collectors
 * and update durable state only at each item's commit point.
 */
export class CollectController extends TypertRemoteService {
  static inject = ['storageDomain', 'settings']

  private links?: KvTable<CollectLinkId, StoredLink>
  private captures?: KvTable<CollectCaptureId, StoredCapture>
  private batches?: KvTable<CollectBatchId, StoredBatch>
  private registry = new Map<CollectPlatform, Collector>()
  private browserPromise: Promise<Browser> | undefined
  private tail: Promise<void> = Promise.resolve()

  /**
   * Register the collect namespace on the Typert Gateway.
   * @param ctx - Host context carrying the storage-domain facility.
   */
  constructor(ctx: Context) {
    super(ctx, 'collectController', { namespace: 'rxlabCollect' })
  }

  /** Open the collect domain and arm the browser/registry for its lifetime. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(collectDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'rxlab_collect.domainClose')
    this.links = domain.table('links')
    this.captures = domain.table('captures')
    this.batches = domain.table('batches')
    this.registry = createCollectorRegistry(() => this.getBrowser())
    this.ctx.effect(() => () => {
      const pending = this.browserPromise
      if (pending !== undefined) void pending.then(browser => browser.close()).catch(() => undefined)
    }, 'rxlab_collect.browserClose')
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browserPromise !== undefined) {
      const existing = await this.browserPromise.catch(() => undefined)
      if (existing !== undefined && existing.isConnected()) return existing
      // The shared browser died (closed/crashed/stopped between items); relaunch
      // so the rest of the batch does not fail on a dead handle.
      this.browserPromise = undefined
    }
    const created = this.launchChromium()
    this.browserPromise = created
    created.catch(() => { if (this.browserPromise === created) this.browserPromise = undefined })
    return created
  }

  /** Launch headless chromium, or attach to a CDP browser when the namespace is in cdp mode. */
  private async launchChromium(): Promise<Browser> {
    let browserSettings: { launchMode?: string; cdpEndpoint?: string } | undefined
    try {
      browserSettings = this.ctx.settings.get('rxlab-collect-browser') as
        | { launchMode?: string; cdpEndpoint?: string }
        | undefined
    } catch {
      browserSettings = undefined
    }
    // Capture stays on its own anonymous headless chromium (no window) unless
    // the person explicitly set cdp mode. Opening the CDP browser from the
    // settings is for agent/manual browsing; silently hijacking every capture
    // onto it made each item open a new window over CDP.
    if (browserSettings?.launchMode === 'cdp') {
      const endpoint = browserSettings.cdpEndpoint ?? 'http://127.0.0.1:9222'
      try {
        return await chromium.connectOverCDP(endpoint)
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        throw new Error(
          `CDP 捕获浏览器未就绪:${endpoint} 无响应(${detail})。请先启动 --remote-debugging-port 的真实浏览器并确认端点可达,再运行采集批次。`,
        )
      }
    }
    try {
      return await chromium.launch({ headless: true })
    } catch (cause) {
      const missing = cause instanceof Error && /Executable doesn't exist/.test(cause.message)
      const executable = missing ? cachedChromiumExecutable() : undefined
      if (executable === undefined) throw cause
      return chromium.launch({ headless: true, executablePath: executable })
    }
  }

  private requireLinks(): KvTable<CollectLinkId, StoredLink> {
    if (this.links === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab collect domain is not open; the storage-domain row must be active before the collect row', {})
    }
    return this.links
  }

  private requireCaptures(): KvTable<CollectCaptureId, StoredCapture> {
    if (this.captures === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab collect domain is not open; the storage-domain row must be active before the collect row', {})
    }
    return this.captures
  }

  private requireBatches(): KvTable<CollectBatchId, StoredBatch> {
    if (this.batches === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab collect domain is not open; the storage-domain row must be active before the collect row', {})
    }
    return this.batches
  }

  /**
   * List link assets, newest write first, with platform/shop/status filters
   * and a case-insensitive shop/sku/url substring match.
   * @param request - filters; absent fields match everything.
   * @returns matching links in list order.
   */
  @Remote('listLinks')
  async listLinks(request: CollectLinkListRequest): Promise<CollectLinkListValue> {
    const table = this.requireLinks()
    const query = request.query?.trim().toLocaleLowerCase()
    const rows = [...table.entries()]
      .filter(([, link]) =>
        (request.platform === undefined || link.platform === request.platform)
        && (request.shopId === undefined || link.shopId === request.shopId)
        && (request.status === undefined || link.status === request.status)
        && (query === undefined || query.length === 0 || matchesQuery(link, query)))
    rows.sort(([, left], [, right]) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || String(left.id).localeCompare(String(right.id)))
    return { items: rows.map(([, link]) => link) }
  }

  /**
   * Read one complete link asset.
   * @param request - target link identity.
   * @returns the full stored link.
   * @throws RemoteError `collect/link-not-found` when no link carries the id.
   */
  @Remote('getLink')
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
   * Create or replace one link asset. A present id replaces that row; an
   * absent id mints a row unless another link already holds the same
   * platform+canonical-url, which merges into that row instead.
   * @param request - full draft for the new or replaced link.
   * @returns the stored link and whether it merged into an existing row.
   * @throws RemoteError `gateway/bad-request` when the draft fails its zod
   * schema or a JD url carries no sku.
   */
  @Remote('upsertLink')
  async upsertLink(request: CollectLinkUpsertRequest): Promise<CollectLinkUpsertValue> {
    const draft = parseOrThrow(collectLinkDraftSchema, request.link, 'link draft')
    const stored = await this.upsertOne(draft)
    return { link: stored.link, merged: stored.merged }
  }

  /**
   * Remove one link asset; its capture history stays.
   * @param request - target link identity.
   * @returns whether a row existed under the id (false never writes).
   */
  @Remote('removeLink')
  async removeLink(request: CollectLinkRemoveRequest): Promise<CollectLinkRemoveValue> {
    return { removed: await this.requireLinks().delete(request.id) }
  }

  /**
   * Bulk-create links from CSV text (header: platform,url + optional
   * shopId/shopName/sku/title). Rows are validated independently; invalid
   * rows come back as rejections while valid rows upsert as usual.
   * @param request - the raw CSV text blob.
   * @returns created/merged links and row-level rejections.
   */
  @Remote('importLinks')
  async importLinks(request: CollectLinkImportRequest): Promise<CollectLinkImportValue> {
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
      const parsed = collectLinkDraftSchema.safeParse({
        platform,
        url: record.url,
        ...(record.shopId === undefined ? {} : { shopId: record.shopId }),
        ...(record.shopName === undefined ? {} : { shopName: record.shopName }),
        ...(record.sku === undefined ? {} : { sku: record.sku }),
        ...(record.titleAtAdd === undefined ? {} : { titleAtAdd: record.titleAtAdd }),
      })
      if (!parsed.success) {
        rejected.push({
          row,
          reason: parsed.error.issues
            .map(issue => `${issue.path.join('.') || 'row'}: ${issue.message}`)
            .join('; ')
            .slice(0, 400),
        })
        continue
      }
      try {
        const stored = await this.upsertOne(parsed.data)
        ;(stored.merged ? updated : created).push(stored.link)
      } catch (cause) {
        rejected.push({ row, reason: readableError(cause).slice(0, 400) })
      }
    }
    return { created, updated, rejected }
  }

  /**
   * Submit links the collect agent discovered by browsing (browser use):
   * every entry is validated independently like CSV import, the platform is
   * guessed from the url when absent, and accepted entries upsert with the
   * usual platform+canonical-url merge. Host-internal: the agent tools call
   * this directly; it registers no Remote method.
   * @param links - discovered link drafts in submission order.
   * @returns created/merged links and per-entry rejections.
   */
  async submitDiscovered(links: readonly CollectDiscoveredLink[]): Promise<CollectDiscoveredSubmitValue> {
    const created: CollectLink[] = []
    const merged: CollectLink[] = []
    const rejected: { link: CollectDiscoveredLink; reason: string }[] = []
    for (const link of links) {
      const platform = link.platform ?? platformFromUrl(link.url)
      if (platform === undefined) {
        rejected.push({ link, reason: `无法推断平台: ${link.url}` })
        continue
      }
      const parsed = collectLinkDraftSchema.safeParse({
        ...link,
        platform,
      })
      if (!parsed.success) {
        rejected.push({
          link,
          reason: parsed.error.issues
            .map(issue => `${issue.path.join('.') || 'link'}: ${issue.message}`)
            .join('; ')
            .slice(0, 400),
        })
        continue
      }
      try {
        const stored = await this.upsertOne(parsed.data)
        ;(stored.merged ? merged : created).push(stored.link)
      } catch (cause) {
        rejected.push({ link, reason: readableError(cause).slice(0, 400) })
      }
    }
    return { created, merged, rejected }
  }

  /**
   * Create a run batch over the given links and start its serial queue. The
   * returned batch is the queued snapshot; progress lands on the same record
   * as items commit, so the UI polls `getBatch`.
   * @param request - link ids to capture, in run order.
   * @returns the queued batch.
   * @throws RemoteError `collect/link-not-found` when any id is unknown.
   */
  @Remote('createBatch')
  async createBatch(request: CollectBatchCreateRequest): Promise<CollectBatchCreateValue> {
    const table = this.requireLinks()
    const linkIds = [...new Set(request.linkIds)]
    if (linkIds.length === 0) {
      throw new RemoteError('gateway/bad-request', 'batch needs at least one link id', {})
    }
    for (const id of linkIds) {
      if (table.get(id) === undefined) {
        throw new RemoteError('collect/link-not-found', `rxlab collect has no link '${String(id)}'`, { id })
      }
    }
    const now = new Date().toISOString()
    const id = newBatchId()
    const batch = parseOrThrow(collectBatchSchema, {
      id,
      createdAt: now,
      updatedAt: now,
      status: 'queued',
      counts: { total: linkIds.length, ok: 0, error: 0 },
      items: linkIds.map(linkId => ({ linkId, status: 'pending' as const })),
    }, 'batch')
    await this.requireBatches().put(id, batch)
    this.tail = this.tail.then(() => this.runBatch(id)).catch(() => undefined)
    return { batch }
  }

  /**
   * List run batches, newest write first, counts only.
   * @param request - optional status filter.
   * @returns batch summaries in list order.
   */
  @Remote('listBatches')
  async listBatches(request: CollectBatchListRequest): Promise<CollectBatchListValue> {
    const rows = [...this.requireBatches().entries()]
      .filter(([, batch]) => request.status === undefined || batch.status === request.status)
    rows.sort(([, left], [, right]) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || String(left.id).localeCompare(String(right.id)))
    return { batches: rows.map(([, batch]) => summarizeBatch(batch)) }
  }

  /**
   * Open one full run batch (with per-link items).
   * @param request - target batch identity.
   * @returns the full stored batch.
   * @throws RemoteError `collect/batch-not-found` when no batch carries the id.
   */
  @Remote('getBatch')
  async getBatch(request: CollectBatchGetRequest): Promise<CollectBatchGetValue> {
    const batch = this.requireBatches().get(request.id)
    if (batch === undefined) {
      throw new RemoteError('collect/batch-not-found', `rxlab collect has no batch '${String(request.id)}'`, {
        id: request.id,
      })
    }
    return { batch }
  }

  /**
   * List capture history of one link, newest first.
   * @param request - target link and optional row cap.
   * @returns capture records in reverse-chronological order.
   */
  @Remote('listCaptures')
  async listCaptures(request: CollectCaptureListRequest): Promise<CollectCaptureListValue> {
    const limit = Math.min(Math.max(request.limit ?? 50, 1), 200)
    const rows = [...this.requireCaptures().entries()]
      .filter(([, capture]) => capture.linkId === request.linkId)
    rows.sort(([, left], [, right]) => right.capturedAt.localeCompare(left.capturedAt))
    return { captures: rows.slice(0, limit).map(([, capture]) => capture) }
  }

  /**
   * Readable browser + launcher state for the SPA CDP status row.
   * @returns the collect browse session state and launcher process state, each null when its row is not composed.
   */
  @Remote('browserStatus')
  async browserStatus(): Promise<BrowserStatusValue> {
    const session = this.ctx.get('collectBrowser') as { status(): Promise<BrowserStatusInfo> } | undefined
    const launcher = this.ctx.get('collectCdpLauncher') as { status(): Promise<{ running: boolean; endpointUp: boolean }> } | undefined
    return {
      browser: session === undefined ? null : await session.status(),
      launcher: launcher === undefined ? null : await launcher.status(),
    }
  }

  /**
   * Spawn a CDP-mode browser for the capture flow.
   * @param request - executable path/port/profile overrides for this launch.
   * @returns whether the endpoint came up after the launch wait, with a readable detail line.
   * @throws RemoteError `gateway/internal` when the launcher row is not composed.
   */
  @Remote('browserLaunch')
  async browserLaunch(request: BrowserLaunchRequest): Promise<BrowserLaunchValue> {
    const launcher = this.ctx.get('collectCdpLauncher') as { launch(opts: BrowserLaunchRequest): Promise<BrowserLaunchValue> } | undefined
    if (launcher === undefined) {
      throw new RemoteError('gateway/internal', 'rxlab collect CDP 启动行未装配', {})
    }
    return launcher.launch(request)
  }

  /**
   * Stop the launcher-owned CDP browser (an externally started browser is untouched).
   * @returns whether a process this row spawned was stopped.
   */
  @Remote('browserStop')
  async browserStop(): Promise<BrowserStopValue> {
    const launcher = this.ctx.get('collectCdpLauncher') as { stop(): Promise<boolean> } | undefined
    return { stopped: launcher === undefined ? false : await launcher.stop() }
  }

  /** Shared single-link upsert used by `upsertLink` and `importLinks`. */
  private async upsertOne(draft: z.infer<typeof collectLinkDraftSchema>): Promise<{ link: StoredLink; merged: boolean }> {
    const table = this.requireLinks()
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
      ...(canonical.mobileUrl === undefined ? {} : { mobileUrl: canonical.mobileUrl }),
      ...(draft.shopId === undefined ? {} : { shopId: draft.shopId }),
      ...(draft.shopName === undefined ? {} : { shopName: draft.shopName }),
      ...(canonical.sku === undefined ? {} : { sku: canonical.sku }),
      ...(draft.titleAtAdd === undefined ? {} : { titleAtAdd: draft.titleAtAdd }),
      ...(draft.rescan === undefined ? {} : { rescan: draft.rescan }),
      status: existing?.status ?? 'idle',
      ...(existing?.lastCaptureAt === undefined ? {} : { lastCaptureAt: existing.lastCaptureAt }),
      ...(existing?.lastCaptureId === undefined ? {} : { lastCaptureId: existing.lastCaptureId }),
      ...(existing?.lastPrice === undefined ? {} : { lastPrice: existing.lastPrice }),
      ...(existing?.lastError === undefined ? {} : { lastError: existing.lastError }),
    }, 'link')
    await table.put(id, stored)
    return { link: stored, merged }
  }

  /** Run one batch serially, committing each item at its own commit point. */
  private async runBatch(id: CollectBatchId): Promise<void> {
    const links = this.requireLinks()
    const captures = this.requireCaptures()
    let batch = this.requireBatches().get(id)
    if (batch === undefined || batch.status === 'done' || batch.status === 'partial') return
    batch = await this.patchBatch(id, { ...batch, status: 'running', updatedAt: new Date().toISOString() })
    for (const [index, item] of batch.items.entries()) {
      if (item.status !== 'pending') continue
      const link = links.get(item.linkId)
      if (link === undefined) {
        batch = await this.commitItem(id, batch, index, { status: 'error', error: '链接不存在(可能已删除)' })
        continue
      }
      await links.put(link.id, { ...link, status: 'running', updatedAt: new Date().toISOString() })
      try {
        const collector = this.registry.get(link.platform)
        if (collector === undefined) {
          throw new RemoteError('collect/adapter-unavailable', `平台 ${link.platform} 暂无采集适配器`, { platform: link.platform })
        }
        const result: CollectorResult = await collector.collect({
          platform: link.platform,
          url: link.url,
          ...(link.mobileUrl === undefined ? {} : { mobileUrl: link.mobileUrl }),
          ...(link.sku === undefined ? {} : { sku: link.sku }),
        })
        const captureId = newCaptureId()
        const now = new Date().toISOString()
        const capture = parseOrThrow(collectCaptureSchema, {
          id: captureId,
          linkId: link.id,
          capturedAt: now,
          fields: result.fields,
          httpOk: result.httpOk,
        }, 'capture')
        await captures.put(captureId, capture)
        await links.put(link.id, {
          ...link,
          status: 'ok',
          lastCaptureAt: now,
          lastCaptureId: captureId,
          lastPrice: result.fields.price?.value,
          lastError: undefined,
          updatedAt: now,
        })
        batch = await this.commitItem(id, batch, index, { status: 'ok', captureId })
      } catch (cause) {
        const message = readableError(cause).slice(0, 2000)
        const now = new Date().toISOString()
        await links.put(link.id, { ...link, status: 'error', lastError: message, updatedAt: now })
        batch = await this.commitItem(id, batch, index, { status: 'error', error: message })
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  /**
   * Persist one item outcome plus recomputed counts. The batch stays
   * `running` while any item is still pending and settles to `done` (all ok)
   * or `partial` (some failed) once every item committed.
   */
  private async commitItem(
    id: CollectBatchId,
    batch: StoredBatch,
    index: number,
    outcome: { status: 'ok' | 'error'; captureId?: CollectCaptureId; error?: string },
  ): Promise<StoredBatch> {
    const items = batch.items.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      return {
        ...item,
        status: outcome.status,
        ...(outcome.captureId === undefined ? {} : { captureId: outcome.captureId }),
        ...(outcome.error === undefined ? {} : { error: outcome.error }),
      }
    })
    const pending = items.filter(item => item.status === 'pending').length
    const errorCount = items.filter(item => item.status === 'error').length
    const status = pending > 0 ? 'running' : errorCount > 0 ? 'partial' : 'done'
    return this.patchBatch(id, {
      ...batch,
      items,
      counts: {
        total: items.length,
        ok: items.length - pending - errorCount,
        error: errorCount,
      },
      status,
      updatedAt: new Date().toISOString(),
    })
  }

  /** Replace one batch row after validating it at the durable boundary. */
  private async patchBatch(id: CollectBatchId, batch: StoredBatch): Promise<StoredBatch> {
    const stored = parseOrThrow(collectBatchSchema, batch, 'batch')
    await this.requireBatches().put(id, stored)
    return stored
  }
}

function matchesQuery(link: StoredLink, query: string): boolean {
  const candidates = [link.shopName, link.sku, link.url, link.titleAtAdd]
  return candidates.some(candidate =>
    candidate !== undefined && candidate.toLocaleLowerCase().includes(query))
}

/** Newest full chromium build in the shared playwright cache, when present. */
function cachedChromiumExecutable(): string | undefined {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  if (!existsSync(root)) return undefined
  const dirs = readdirSync(root).filter(dir => dir.startsWith('chromium-')).sort()
  for (const dir of dirs.reverse()) {
    const candidate = join(root, dir, 'chrome-win', 'chrome.exe')
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** Project one stored batch onto its list-row summary. */
function summarizeBatch(batch: StoredBatch): CollectBatchSummary {
  return {
    id: batch.id,
    status: batch.status,
    counts: batch.counts,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  }
}

export default CollectController
