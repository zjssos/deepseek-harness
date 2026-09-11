/**
 * The `rxlab_collect` storage domain: zod record schemas for the shop /
 * product-link / draft tables and the `defineDomain` spec the
 * CollectController opens. The zod schemas validate at the durable read
 * boundary (per-record layout, version 3) and double as the controller's
 * create/update validator; the inferred record types mirror the browser-safe
 * wire types in `types.ts`.
 *
 * Version 3 retires the capture and batch tables with the deterministic
 * collector, moving the product fields a person now enters by hand onto the
 * link record itself. `compatibleVersions` lists 1 and 2 because the current
 * link schema still accepts their stored records: every field this version
 * dropped is absent from the schema, so a stored record keeps its identity,
 * platform, url, shop text, and title while its capture bookkeeping keys fall
 * away at validation.
 * @module @deepseek-ai/dsh-rxlab-collect/src/domain
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { CollectDraftId, CollectLinkId, CollectShopId } from './types.ts'

/** Shop record key; branding has no runtime representation. */
export const collectShopId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as CollectShopId)

/** Product-link record key; branding has no runtime representation. */
export const collectLinkId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as CollectLinkId)

/** Draft record key; branding has no runtime representation. */
export const collectDraftId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as CollectDraftId)

/** ISO-8601 write instant stamped by the controller, never by callers. */
const instant = z.string()

/** The platform vocabulary shops and products are grouped by. */
const platform = z.enum(['jd', 'taobao', '1688', 'manual'])

/** URL that must be absolute http(s). */
const httpUrl = z.string().trim().min(1).max(2000).refine(
  value => /^https?:\/\/.+/.test(value),
  { message: 'url must be an absolute http(s) URL' })

/** One price reading as a person entered it, keeping the raw text. */
const priceSchema = z.object({
  value: z.number().nonnegative(),
  raw: z.string().min(1).max(200),
  note: z.string().max(200).optional(),
})

/** Spec-parameter name/value pairs entered for one product. */
const paramsSchema = z.array(z.object({
  name: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(300),
})).max(60)

/** Shop fields shared by the stored record and the draft payload. */
const shopFields = {
  platform,
  name: z.string().trim().min(1).max(200),
  shopKey: z.string().trim().max(200).optional(),
  homeUrl: httpUrl.optional(),
  note: z.string().trim().max(2000).optional(),
}

/** Product fields shared by the stored record and the draft payload. */
const productFields = {
  platform,
  url: httpUrl,
  shopRef: collectShopId.optional(),
  sku: z.string().trim().max(120).optional(),
  title: z.string().trim().max(500).optional(),
  price: priceSchema.optional(),
  selectedSku: z.string().trim().max(300).optional(),
  params: paramsSchema.optional(),
  mainImageUrl: httpUrl.optional(),
  buyUrl: httpUrl.optional(),
  note: z.string().trim().max(2000).optional(),
}

/** One stored shop record. */
const shopRecord = z.object({
  id: collectShopId,
  updatedAt: instant,
  ...shopFields,
})

/**
 * One stored product-link record. The legacy fields stay declared so records
 * written by domain version 1 and 2 keep validating; the controller never
 * writes them again, and readers fall back to `titleAtAdd` when `title` is
 * absent.
 */
const linkRecord = z.object({
  id: collectLinkId,
  updatedAt: instant,
  ...productFields,
  shopId: z.string().trim().max(200).optional(),
  shopName: z.string().trim().max(200).optional(),
  titleAtAdd: z.string().trim().max(300).optional(),
})

/** What one draft proposes; the discriminant names the table it would fill. */
const draftPayload = z.discriminatedUnion('target', [
  z.object({ target: z.literal('shop'), ...shopFields }),
  z.object({ target: z.literal('product'), ...productFields }),
])

/** One stored draft awaiting a person's decision. */
const draftRecord = z.object({
  id: collectDraftId,
  status: z.enum(['pending', 'accepted', 'rejected']),
  payload: draftPayload,
  sourceText: z.string().trim().max(4000).optional(),
  createdAt: instant,
  resolvedAt: instant.optional(),
  resolvedId: z.string().max(64).optional(),
})

/**
 * The collect domain spec: one table per entity family, per-record layout so
 * each document is independently disposable. The CollectController opens this
 * through `ctx.storageDomain`. Version 3 adds `shops` and `drafts` and drops
 * `captures` and `batches`; version 1 and 2 link records stay readable
 * through `compatibleVersions`, and their capture/batch documents remain on
 * the medium unread.
 */
export const collectDomainSpec = defineDomain({
  name: 'rxlab_collect',
  version: 3,
  compatibleVersions: [1, 2],
  layout: 'per-record',
  tables: {
    shops: domainTable<CollectShopId, z.infer<typeof shopRecord>>(shopRecord),
    links: domainTable<CollectLinkId, z.infer<typeof linkRecord>>(linkRecord),
    drafts: domainTable<CollectDraftId, z.infer<typeof draftRecord>>(draftRecord),
  },
})

/** Validates a shop create/replace payload before the controller mints fields. */
export const collectShopDraftSchema = z.object({
  ...shopFields,
  id: collectShopId.optional(),
})

/** Validates a product create/replace payload before the controller mints fields. */
export const collectProductDraftSchema = z.object({
  ...productFields,
  id: collectLinkId.optional(),
})

/** Validates every stored shop record at the durable boundary. */
export const collectShopSchema = shopRecord

/** Validates every stored product-link record at the durable boundary. */
export const collectLinkSchema = linkRecord

/** Validates every stored draft record at the durable boundary. */
export const collectDraftSchema = draftRecord

/** Validates one draft payload before the controller mints id and createdAt. */
export const collectDraftPayloadSchema = draftPayload
