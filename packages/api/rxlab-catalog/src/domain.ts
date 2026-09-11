/**
 * The `rxlab_catalog` storage domain: zod record/draft schemas for the
 * frame / lens / product master-data union and the `defineDomain` spec the
 * CatalogController opens. The zod schemas validate at the durable read
 * boundary (per-record layout, version 2) and double as the controller's
 * create/update validator; the inferred record types mirror the browser-safe
 * wire types in `types.ts`.
 *
 * Version 2 adds the structured attribute vocabularies (frame material /
 * shape / type / style / gender, lens design / functions / extended
 * refractive indexes), the price-history dimension, and the collection
 * lineage (`source`). Version-1 records remain readable: every field they
 * carried stays declared, the previously required `frameMaterial` free-text
 * became optional, and `compatibleVersions` admits the stamp.
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

/**
 * The platform vocabulary copied from the collect domain. Duplicated instead
 * of imported so the catalog package keeps no dependency on the collector;
 * the collector owns the authoritative list.
 */
export const collectPlatform = z.enum(['jd', 'taobao', '1688', 'manual'])

/** Frame material vocabulary; the glasses-industry stock categories. */
export const frameMaterialValues = [
  'pure-titanium', 'beta-titanium', 'titanium', 'metal-alloy', 'stainless-steel',
  'tr90', 'plastic-steel', 'acetate', 'pc', 'other',
] as const

/** Frame front-shape vocabulary. */
export const frameShapeValues = [
  'square', 'round', 'oval', 'square-round', 'cat-eye', 'pilot', 'browline', 'polygon', 'other',
] as const

/** Rim construction; constrains which lens materials fit. */
export const frameTypeValues = ['full-rim', 'semi-rimless', 'rimless'] as const

/** Style vocabulary a recommendation can filter on. */
export const frameStyleValues = ['business', 'retro', 'casual', 'fashion', 'sport', 'other'] as const

/** Intended-wearer vocabulary. */
export const genderValues = ['male', 'female', 'unisex'] as const

/** Nose-pad construction; separate pads adjust for lower bridges. */
export const nosePadValues = ['separate', 'integrated'] as const

/** Stock refractive-index vocabulary, including the 1.59 PC and 1.61 MR-8 values. */
export const refractiveIndexValues = [
  '1.50', '1.56', '1.59', '1.60', '1.61', '1.67', '1.71', '1.74',
] as const

/** Lens surface-design vocabulary. */
export const lensDesignValues = ['spherical', 'aspheric', 'double-aspheric'] as const

/** Lens function vocabulary; orthogonal to the v1 `lensType` family field. */
export const lensFunctionValues = ['blue-light', 'photochromic', 'polarized', 'tinted', 'driving'] as const

/** One price reading: value plus when and where it was observed. */
const priceEntry = z.object({
  value: z.number().nonnegative(),
  /** ISO-8601 instant of the observation, from a capture or a manual entry. */
  capturedAt: z.string().min(1),
  /** Entry route of this reading. */
  source: z.enum(['collected', 'manual']),
  /** Foreign `rxlab_collect` capture id when the reading came from a capture. */
  captureId: z.string().min(1).max(64).optional(),
  /** Free-text context such as "活动价". */
  note: z.string().max(200).optional(),
})

/** Collection lineage: which collected link produced (and last updated) this row. */
const sourceInfo = z.object({
  platform: collectPlatform,
  /** Canonical collected page url. */
  url: z.string().min(1).max(2000),
  /** Foreign `rxlab_collect` link id; the import idempotency key. */
  linkId: z.string().min(1).max(64),
  /** Shop display name at import time. */
  shopName: z.string().max(200).optional(),
  /** Seller sku or listing id. */
  sku: z.string().max(200).optional(),
  /** Foreign capture id of the most recent import. */
  captureId: z.string().min(1).max(64).optional(),
  /** ISO-8601 instant of the most recent import. */
  capturedAt: z.string().optional(),
})

/** Fields every row family shares; blanks stay absent so JSON stays clean. */
const itemFields = {
  brand: z.string().trim().max(200).optional(),
  model: z.string().trim().max(200).optional(),
  name: z.string().trim().min(1).max(300),
  origin: z.enum(['manual', 'collected']),
  rawUrl: z.string().trim().max(2000).optional(),
  notes: z.string().max(4000).optional(),
  /** Observed price readings, oldest first; consumers read the last entry. */
  priceHistory: z.array(priceEntry).max(200).optional(),
  /** Collection lineage; absent for manual rows. */
  source: sourceInfo.optional(),
}

/** Frame-specific fields; geometry feeds the fitting rules. */
const frameFields = {
  kind: z.literal('frame'),
  /** Legacy v1 free-text material; kept optional for v1-record compatibility. */
  frameMaterial: z.string().trim().max(200).optional(),
  /** Structured material vocabulary; the value fitting rules switch on. */
  material: z.enum(frameMaterialValues).optional(),
  frameShape: z.enum(frameShapeValues).optional(),
  frameType: z.enum(frameTypeValues).optional(),
  style: z.enum(frameStyleValues).optional(),
  gender: z.enum(genderValues).optional(),
  nosePad: z.enum(nosePadValues).optional(),
  lensWidth: z.number().positive().optional(),
  lensHeight: z.number().positive().optional(),
  bridgeWidth: z.number().positive().optional(),
  templeLength: z.number().positive().optional(),
  /** Overall front width in millimetres. */
  totalWidth: z.number().positive().optional(),
  weightG: z.number().positive().optional(),
  color: z.string().trim().max(100).optional(),
}

/** Lens-specific fields; the optics vocabulary a fitting rule consumes. */
const lensFields = {
  kind: z.literal('lens'),
  refractiveIndex: z.enum(refractiveIndexValues),
  abbe: z.number().positive().optional(),
  lensDesign: z.enum(lensDesignValues).optional(),
  lensType: z.enum([
    'single-vision', 'progressive', 'blue-light', 'photochromic', 'occupational', 'other',
  ]),
  /** Structured function tags; `lensType` stays the v1 family vocabulary. */
  lensFunctions: z.array(z.enum(lensFunctionValues)).max(5).optional(),
  coating: z.string().trim().max(200).optional(),
  sphereRange: z.string().trim().max(100).optional(),
  /** Blank lens diameter in millimetres; bounds the frame it can cut for. */
  diameterMm: z.number().positive().optional(),
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

/** One collected listing the importer receives from the collect Remote. */
export const collectedListingSchema = z.object({
  /** Captured listing title. */
  title: z.string().trim().min(1).max(500),
  /** Selected variant text, e.g. "BA7009B15-哑黑银". */
  selectedSku: z.string().trim().max(300).optional(),
  /** Captured price value when the capture read one. */
  price: z.number().nonnegative().optional(),
  /** Raw price text as displayed, kept for reference. */
  priceRaw: z.string().trim().max(200).optional(),
  /** Spec-parameter name/value pairs captured from the detail page. */
  params: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(300),
  })).max(60).optional(),
  /** Main image url captured from the listing. */
  mainImageUrl: z.string().trim().min(1).max(2000).optional(),
})

/** The import request: collection lineage plus the captured listing fields. */
export const catalogImportRequestSchema = z.object({
  source: z.object({
    platform: collectPlatform,
    url: z.string().trim().min(1).max(2000),
    /** Foreign `rxlab_collect` link id; imports merge on this key. */
    linkId: z.string().trim().min(1).max(64),
    shopName: z.string().trim().max(200).optional(),
    sku: z.string().trim().max(200).optional(),
  }),
  listing: collectedListingSchema,
})

/**
 * The catalog domain spec: one `items` table keyed by {@link CatalogItemId},
 * per-record layout so each record is its own disposable document. The
 * CatalogController opens this through `ctx.storageDomain`; version 2 is the
 * structured-attribute shape, and version-1 records stay readable through
 * `compatibleVersions`.
 */
export const catalogDomainSpec = defineDomain({
  name: 'rxlab_catalog',
  version: 2,
  compatibleVersions: [1],
  layout: 'per-record',
  tables: { items: domainTable<CatalogItemId, z.infer<typeof wikiItemSchema>>(wikiItemSchema) },
})
