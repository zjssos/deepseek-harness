/**
 * The `rxlab_catalog` storage domain: zod record/draft schemas for the
 * frame / lens / product master-data union and the `defineDomain` spec the
 * CatalogController opens. The zod schemas validate at the durable read
 * boundary (per-record layout, version 1) and double as the controller's
 * create/update validator; the inferred record types mirror the browser-safe
 * wire types in `types.ts`.
 * @module @deepseek-ai/dsh-rxlab-catalog/src/domain
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { CatalogItemId } from './types.ts'

/** Catalog record key; branding has no runtime representation. */
export const catalogItemId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as CatalogItemId)

/** ISO-8601 write instant stamped by the controller, never by callers. */
const updatedAt = z.string()

/** Fields every row family shares; blanks stay absent so JSON stays clean. */
const itemFields = {
  brand: z.string().trim().max(200).optional(),
  model: z.string().trim().max(200).optional(),
  name: z.string().trim().min(1).max(300),
  origin: z.enum(['manual', 'collected']),
  rawUrl: z.string().trim().max(2000).optional(),
  notes: z.string().max(4000).optional(),
}

/** Frame-specific fields; the geometry is what later fitting rules consume. */
const frameFields = {
  kind: z.literal('frame'),
  frameMaterial: z.string().trim().min(1).max(200),
  lensWidth: z.number().positive().optional(),
  lensHeight: z.number().positive().optional(),
  bridgeWidth: z.number().positive().optional(),
  templeLength: z.number().positive().optional(),
  weightG: z.number().positive().optional(),
  color: z.string().trim().max(100).optional(),
}

/** Lens-specific fields; stock refractive-index and lens-type vocabulary. */
const lensFields = {
  kind: z.literal('lens'),
  refractiveIndex: z.enum(['1.56', '1.60', '1.67', '1.74']),
  abbe: z.number().positive().optional(),
  lensType: z.enum([
    'single-vision', 'progressive', 'blue-light', 'photochromic', 'occupational', 'other',
  ]),
  coating: z.string().trim().max(200).optional(),
  sphereRange: z.string().trim().max(100).optional(),
}

/** Product-specific fields; a collected listing kept whole until structured. */
const productFields = {
  kind: z.literal('product'),
  title: z.string().trim().max(500).optional(),
  sku: z.string().trim().max(200).optional(),
  price: z.number().nonnegative().optional(),
  images: z.array(z.string().trim().min(1).max(2000)).max(30).optional(),
}

/** One stored frame record (id and updatedAt required). */
const frameRecord = z.object({ id: catalogItemId, updatedAt, ...itemFields, ...frameFields })
/** One stored lens record (id and updatedAt required). */
const lensRecord = z.object({ id: catalogItemId, updatedAt, ...itemFields, ...lensFields })
/** One stored product record (id and updatedAt required). */
const productRecord = z.object({ id: catalogItemId, updatedAt, ...itemFields, ...productFields })

/** Validates every stored record at the durable boundary. */
export const wikiItemSchema = z.discriminatedUnion('kind', [frameRecord, lensRecord, productRecord])

/** One stored frame record before the controller mints id and updatedAt. */
const frameDraft = z.object({ id: catalogItemId.optional(), ...itemFields, ...frameFields })
/** One stored lens record before the controller mints id and updatedAt. */
const lensDraft = z.object({ id: catalogItemId.optional(), ...itemFields, ...lensFields })
/** One stored product record before the controller mints id and updatedAt. */
const productDraft = z.object({ id: catalogItemId.optional(), ...itemFields, ...productFields })

/** Validates a create/replace payload; absent id means mint, present id replaces. */
export const wikiItemDraftSchema = z.discriminatedUnion('kind', [frameDraft, lensDraft, productDraft])

/**
 * The catalog domain spec: one `items` table keyed by {@link CatalogItemId},
 * per-record layout so each record is its own disposable document. The
 * CatalogController opens this through `ctx.storageDomain`; version 1 is the
 * first shipped shape of the glasses master-data model.
 */
export const catalogDomainSpec = defineDomain({
  name: 'rxlab_catalog',
  version: 1,
  layout: 'per-record',
  tables: { items: domainTable<CatalogItemId, z.infer<typeof wikiItemSchema>>(wikiItemSchema) },
})
