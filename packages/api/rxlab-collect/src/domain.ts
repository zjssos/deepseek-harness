/**
 * The `rxlab_collect` storage domain: zod record schemas for the link /
 * capture / batch tables and the `defineDomain` spec the CollectController
 * opens. The zod schemas validate at the durable read boundary (per-record
 * layout, version 2) and double as the controller's create/update validator;
 * the inferred record types mirror the browser-safe wire types in `types.ts`.
 * @module @deepseek-ai/dsh-rxlab-collect/src/domain
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { CollectBatchId, CollectCaptureId, CollectLinkId } from './types.ts'

/** Link record key; branding has no runtime representation. */
export const collectLinkId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as CollectLinkId)

/** Capture record key; branding has no runtime representation. */
export const collectCaptureId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as CollectCaptureId)

/** Batch record key; branding has no runtime representation. */
export const collectBatchId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as CollectBatchId)

/** ISO-8601 write instant stamped by the controller, never by callers. */
const instant = z.string()

/** The platform vocabulary the executor registry switches on. */
const platform = z.enum(['jd', 'taobao', '1688', 'manual'])

/** URL that must be absolute http(s); the link asset's canonical address. */
const httpUrl = z.string().trim().min(1).max(2000).refine(
  value => /^https?:\/\/.+/.test(value),
  { message: 'url must be an absolute http(s) URL' })

/** Link lifecycle fields; shared by stored rows and drafts. */
const linkFields = {
  platform,
  shopId: z.string().trim().max(200).optional(),
  shopName: z.string().trim().max(200).optional(),
  sku: z.string().trim().max(120).optional(),
  url: httpUrl,
  mobileUrl: httpUrl.optional(),
  titleAtAdd: z.string().trim().max(300).optional(),
  status: z.enum(['idle', 'running', 'ok', 'error']),
  lastCaptureAt: instant.optional(),
  lastCaptureId: collectCaptureId.optional(),
  lastPrice: z.number().nonnegative().optional(),
  lastError: z.string().max(2000).optional(),
  rescan: z.boolean().optional(),
}

/** One price reading at capture time. */
const priceSchema = z.object({
  value: z.number().nonnegative(),
  raw: z.string().min(1).max(200),
  note: z.string().max(200).optional(),
})

/** Deterministic capture fields; absent stays absent so JSON stays clean. */
const captureFields = {
  title: z.string().trim().max(500).optional(),
  price: priceSchema.optional(),
  selectedSku: z.string().trim().max(300).optional(),
  buyUrl: httpUrl.optional(),
  mainImageUrl: httpUrl.optional(),
  detailImageUrls: z.array(httpUrl).max(30).optional(),
  /** Spec-parameter name/value pairs from the detail page's parameter table. */
  params: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(300),
  })).max(60).optional(),
}

/** One stored link record. */
const linkRecord = z.object({ id: collectLinkId, updatedAt: instant, ...linkFields })

/** Per-link outcome inside one batch. */
const batchItem = z.object({
  linkId: collectLinkId,
  status: z.enum(['pending', 'ok', 'error']),
  captureId: collectCaptureId.optional(),
  error: z.string().max(2000).optional(),
})

/** One stored capture record. */
const captureRecord = z.object({
  id: collectCaptureId,
  linkId: collectLinkId,
  capturedAt: instant,
  fields: z.object(captureFields),
  httpOk: z.boolean().optional(),
  error: z.string().max(2000).optional(),
})

/** One stored run batch. */
const batchRecord = z.object({
  id: collectBatchId,
  createdAt: instant,
  updatedAt: instant,
  status: z.enum(['queued', 'running', 'done', 'partial']),
  counts: z.object({
    total: z.number().int().nonnegative(),
    ok: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
  }),
  items: z.array(batchItem).max(5000),
})

/** Draft-side link fields; the controller mints id, status, and updatedAt. */
const linkDraftFields = {
  platform,
  shopId: z.string().trim().max(200).optional(),
  shopName: z.string().trim().max(200).optional(),
  sku: z.string().trim().max(120).optional(),
  url: httpUrl,
  titleAtAdd: z.string().trim().max(300).optional(),
  rescan: z.boolean().optional(),
  id: collectLinkId.optional(),
}

/**
 * The collect domain spec: one table per entity family, per-record layout so
 * each document is independently disposable. The CollectController opens this
 * through `ctx.storageDomain`; version 2 adds the optional capture `params`
 * (spec-parameter pairs feeding the catalog import), and version-1 captures
 * stay readable through `compatibleVersions`.
 */
export const collectDomainSpec = defineDomain({
  name: 'rxlab_collect',
  version: 2,
  compatibleVersions: [1],
  layout: 'per-record',
  tables: {
    links: domainTable<CollectLinkId, z.infer<typeof linkRecord>>(linkRecord),
    captures: domainTable<CollectCaptureId, z.infer<typeof captureRecord>>(captureRecord),
    batches: domainTable<CollectBatchId, z.infer<typeof batchRecord>>(batchRecord),
  },
})

/** Validates a link create/replace payload before the controller mints fields. */
export const collectLinkDraftSchema = z.object(linkDraftFields)

/** Validates every stored link record at the durable boundary. */
export const collectLinkSchema = linkRecord

/** Validates every stored capture record at the durable boundary. */
export const collectCaptureSchema = captureRecord

/** Validates every stored batch record at the durable boundary. */
export const collectBatchSchema = batchRecord

/** Validates a capture before write; the controller mints id and capturedAt. */
export const collectCaptureDraftSchema = z.object({
  linkId: collectLinkId,
  capturedAt: instant,
  fields: z.object(captureFields),
  httpOk: z.boolean().optional(),
  error: z.string().max(2000).optional(),
})
