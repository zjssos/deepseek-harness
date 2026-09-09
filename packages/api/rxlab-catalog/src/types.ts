/**
 * Public wire vocabulary of the rxlab catalog Remote namespace: the durable
 * `rxlab_catalog` record model (a discriminated union of frame / lens / product
 * master-data rows with structured attributes, price history, and collection
 * lineage), the list/get/upsert/remove/import requests and results, and the
 * catalog failure codes. Types only — the zod schemas that validate this model
 * live in `domain.ts`, and the durable rows themselves are browser-safe JSON.
 *
 * Optional record fields are declared `T | undefined` (not bare `T`): the
 * domain schemas model them the same way, so a parsed stored record is
 * directly assignable to its wire interface under `exactOptionalPropertyTypes`.
 * @module @deepseek-ai/dsh-rxlab-catalog/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Identifies one catalog record (a generated uuid at create). */
export type CatalogItemId = Branded<'CatalogItemId'>

/** Master-data row family; the model's closed discriminant. */
export type WikiKind = 'frame' | 'lens' | 'product'

/** Where the row entered the catalog: hand-curated or collected from a source. */
export type WikiOrigin = 'manual' | 'collected'

/**
 * The collected-platform vocabulary, mirrored from the collect domain; the
 * collector owns the authoritative list.
 */
export type CollectPlatform = 'jd' | 'taobao' | '1688' | 'manual'

/** Stable lens-type vocabulary a fitting rule can switch on. */
export type LensType =
  | 'single-vision'
  | 'progressive'
  | 'blue-light'
  | 'photochromic'
  | 'occupational'
  | 'other'

/** Lens refractive-index vocabulary, the stock values incl. 1.59 PC and 1.61. */
export type RefractiveIndex =
  | '1.50'
  | '1.56'
  | '1.59'
  | '1.60'
  | '1.61'
  | '1.67'
  | '1.71'
  | '1.74'

/** Frame material vocabulary; the glasses-industry stock categories. */
export type FrameMaterial =
  | 'pure-titanium'
  | 'beta-titanium'
  | 'titanium'
  | 'metal-alloy'
  | 'stainless-steel'
  | 'tr90'
  | 'plastic-steel'
  | 'acetate'
  | 'pc'
  | 'other'

/** Frame front-shape vocabulary. */
export type FrameShape =
  | 'square'
  | 'round'
  | 'oval'
  | 'square-round'
  | 'cat-eye'
  | 'pilot'
  | 'browline'
  | 'polygon'
  | 'other'

/** Rim construction; constrains which lens materials fit. */
export type FrameType = 'full-rim' | 'semi-rimless' | 'rimless'

/** Style vocabulary a recommendation can filter on. */
export type FrameStyle = 'business' | 'retro' | 'casual' | 'fashion' | 'sport' | 'other'

/** Intended-wearer vocabulary. */
export type Gender = 'male' | 'female' | 'unisex'

/** Nose-pad construction; separate pads adjust for lower bridges. */
export type NosePad = 'separate' | 'integrated'

/** Lens surface-design vocabulary. */
export type LensDesign = 'spherical' | 'aspheric' | 'double-aspheric'

/** Lens function vocabulary; orthogonal to the v1 `lensType` family field. */
export type LensFunction = 'blue-light' | 'photochromic' | 'polarized' | 'tinted' | 'driving'

/** One observed price reading: value plus when and where it was observed. */
export interface PriceEntry {
  /** Observed price value in the listing currency. */
  readonly value: number
  /** ISO-8601 instant of the observation, from a capture or a manual entry. */
  readonly capturedAt: string
  /** Entry route of this reading. */
  readonly source: 'collected' | 'manual'
  /** Foreign `rxlab_collect` capture id when the reading came from a capture. */
  readonly captureId?: string | undefined
  /** Free-text context such as "活动价". */
  readonly note?: string | undefined
}

/** Collection lineage: which collected link produced (and last updated) this row. */
export interface ItemSource {
  /** Collected platform. */
  readonly platform: CollectPlatform
  /** Canonical collected page url. */
  readonly url: string
  /** Foreign `rxlab_collect` link id; the import idempotency key. */
  readonly linkId: string
  /** Shop display name at import time. */
  readonly shopName?: string | undefined
  /** Seller sku or listing id. */
  readonly sku?: string | undefined
  /** Foreign capture id of the most recent import. */
  readonly captureId?: string | undefined
  /** ISO-8601 instant of the most recent import. */
  readonly capturedAt?: string | undefined
}

/** Fields every catalog row shares; all values are JSON primitives. */
export interface WikiItemBase {
  /** Stable record key, minted host-side on create. */
  readonly id: CatalogItemId
  /** Brand or maker display text; blank until a source provides one. */
  readonly brand?: string | undefined
  /** Model or maker part display text; blank until a source provides one. */
  readonly model?: string | undefined
  /** Primary display name. */
  readonly name: string
  /** Entry route: manual curation or collection. */
  readonly origin: WikiOrigin
  /** Optional source page the row was collected from. */
  readonly rawUrl?: string | undefined
  /** Free-form operator notes. */
  readonly notes?: string | undefined
  /** Observed price readings, oldest first; consumers read the last entry. */
  readonly priceHistory?: readonly PriceEntry[] | undefined
  /** Collection lineage; absent for manual rows. */
  readonly source?: ItemSource | undefined
  /** ISO-8601 instant of the last durable write. */
  readonly updatedAt: string
}

/** One collected-or-manual eyeglass frame with its fitting attributes. */
export interface FrameItem extends WikiItemBase {
  readonly kind: 'frame'
  /** Legacy v1 free-text material; kept optional for v1-record compatibility. */
  readonly frameMaterial?: string | undefined
  /** Structured material vocabulary; the value fitting rules switch on. */
  readonly material?: FrameMaterial | undefined
  /** Front shape. */
  readonly frameShape?: FrameShape | undefined
  /** Rim construction. */
  readonly frameType?: FrameType | undefined
  /** Style family. */
  readonly style?: FrameStyle | undefined
  /** Intended wearer. */
  readonly gender?: Gender | undefined
  /** Nose-pad construction. */
  readonly nosePad?: NosePad | undefined
  /** Horizontal lens size in millimetres. */
  readonly lensWidth?: number | undefined
  /** Vertical lens size in millimetres. */
  readonly lensHeight?: number | undefined
  /** Bridge width in millimetres. */
  readonly bridgeWidth?: number | undefined
  /** Temple length in millimetres. */
  readonly templeLength?: number | undefined
  /** Overall front width in millimetres. */
  readonly totalWidth?: number | undefined
  /** Frame weight in grams. */
  readonly weightG?: number | undefined
  /** Frame colour display text. */
  readonly color?: string | undefined
}

/** One lens blank or lens product with its optics parameters. */
export interface LensItem extends WikiItemBase {
  readonly kind: 'lens'
  /** Refractive index of the lens material. */
  readonly refractiveIndex: RefractiveIndex
  /** Abbe number when the supplier publishes one. */
  readonly abbe?: number | undefined
  /** Surface design family. */
  readonly lensDesign?: LensDesign | undefined
  /** Lens design family (the v1 vocabulary, kept for record compatibility). */
  readonly lensType: LensType
  /** Structured function tags. */
  readonly lensFunctions?: readonly LensFunction[] | undefined
  /** Coating stack display text (anti-reflective, hard, ...). */
  readonly coating?: string | undefined
  /** Sphere range the lens can correct, free text such as "-8.00 ~ +6.00". */
  readonly sphereRange?: string | undefined
  /** Blank lens diameter in millimetres. */
  readonly diameterMm?: number | undefined
}

/** One collected e-commerce product placeholder awaiting structured mapping. */
export interface ProductItem extends WikiItemBase {
  readonly kind: 'product'
  /** Original listing title when it differs from {@link WikiItemBase.name}. */
  readonly title?: string | undefined
  /** Seller SKU or listing id. */
  readonly sku?: string | undefined
  /** Listing price in the listing currency. */
  readonly price?: number | undefined
  /** Listing image URLs. */
  readonly images?: readonly string[] | undefined
}

/** One durable catalog record. */
export type WikiItem = FrameItem | LensItem | ProductItem

/** A catalog record before create: no server-minted id or write timestamp. */
export interface WikiItemDraftBase {
  readonly brand?: string | undefined
  readonly model?: string | undefined
  readonly name: string
  readonly origin: WikiOrigin
  readonly rawUrl?: string | undefined
  readonly notes?: string | undefined
  readonly priceHistory?: readonly PriceEntry[] | undefined
  readonly source?: ItemSource | undefined
}

/** Draft of one frame record (id and updatedAt are server-minted). */
export interface FrameItemDraft extends WikiItemDraftBase {
  readonly kind: 'frame'
  /** Present to replace an existing record; absent mints a new one. */
  readonly id?: CatalogItemId | undefined
  readonly frameMaterial?: string | undefined
  readonly material?: FrameMaterial | undefined
  readonly frameShape?: FrameShape | undefined
  readonly frameType?: FrameType | undefined
  readonly style?: FrameStyle | undefined
  readonly gender?: Gender | undefined
  readonly nosePad?: NosePad | undefined
  readonly lensWidth?: number | undefined
  readonly lensHeight?: number | undefined
  readonly bridgeWidth?: number | undefined
  readonly templeLength?: number | undefined
  readonly totalWidth?: number | undefined
  readonly weightG?: number | undefined
  readonly color?: string | undefined
}

/** Draft of one lens record (id and updatedAt are server-minted). */
export interface LensItemDraft extends WikiItemDraftBase {
  readonly kind: 'lens'
  /** Present to replace an existing record; absent mints a new one. */
  readonly id?: CatalogItemId | undefined
  readonly refractiveIndex: RefractiveIndex
  readonly abbe?: number | undefined
  readonly lensDesign?: LensDesign | undefined
  readonly lensType: LensType
  readonly lensFunctions?: readonly LensFunction[] | undefined
  readonly coating?: string | undefined
  readonly sphereRange?: string | undefined
  readonly diameterMm?: number | undefined
}

/** Draft of one product record (id and updatedAt are server-minted). */
export interface ProductItemDraft extends WikiItemDraftBase {
  readonly kind: 'product'
  /** Present to replace an existing record; absent mints a new one. */
  readonly id?: CatalogItemId | undefined
  readonly title?: string | undefined
  readonly sku?: string | undefined
  readonly price?: number | undefined
  readonly images?: readonly string[] | undefined
}

/** One catalog record to create (the UI sends the full kind-specific draft). */
export type WikiItemDraft = FrameItemDraft | LensItemDraft | ProductItemDraft

/** List-row projection: enough to browse and open one record. */
export interface CatalogItemSummary {
  readonly id: CatalogItemId
  readonly kind: WikiKind
  readonly brand?: string | undefined
  readonly model?: string | undefined
  readonly name: string
  readonly origin: WikiOrigin
  /** Latest observed price; absent when no reading is recorded. */
  readonly price?: number | undefined
  /** Frame material tag, for frame rows carrying one. */
  readonly material?: FrameMaterial | undefined
  /** Refractive index, for lens rows. */
  readonly refractiveIndex?: RefractiveIndex | undefined
  /** Lens family tag, for lens rows. */
  readonly lensType?: LensType | undefined
  readonly updatedAt: string
}

/** List one catalog slice with free-text and facet filters. */
export interface CatalogListRequest {
  /** Restrict to one record family; absent lists every family. */
  readonly kind?: WikiKind | undefined
  /** Case-insensitive substring matched against brand, model, and name. */
  readonly query?: string | undefined
  /** Frame material tag; frame rows only. */
  readonly material?: FrameMaterial | undefined
  /** Rim construction; frame rows only. */
  readonly frameType?: FrameType | undefined
  /** Refractive index; lens rows only. */
  readonly refractiveIndex?: RefractiveIndex | undefined
  /** Inclusive lower bound on the latest observed price. */
  readonly minPrice?: number | undefined
  /** Inclusive upper bound on the latest observed price. */
  readonly maxPrice?: number | undefined
}

/** Ordered catalog rows for one {@link CatalogListRequest}, newest write first. */
export interface CatalogListValue {
  readonly items: readonly CatalogItemSummary[]
}

/** Open one full catalog record by id. */
export interface CatalogGetRequest {
  readonly id: CatalogItemId
}

/** The full stored record for one {@link CatalogGetRequest}. */
export interface CatalogGetValue {
  readonly item: WikiItem
}

/** Create or replace one catalog record by its (optional) id. */
export interface CatalogUpsertRequest {
  /** Draft to store; an absent id mints a new record, a present id replaces it. */
  readonly item: WikiItemDraft
}

/** The stored record after one {@link CatalogUpsertRequest}. */
export interface CatalogUpsertValue {
  readonly item: WikiItem
}

/** Remove one catalog record by id. */
export interface CatalogRemoveRequest {
  readonly id: CatalogItemId
}

/** Receipt after one {@link CatalogRemoveRequest}. */
export interface CatalogRemoveValue {
  /** Whether a record existed under the id (false never writes). */
  readonly removed: boolean
}

/** One collected listing the importer receives from the collect Remote. */
export interface CollectedListing {
  /** Captured listing title. */
  readonly title: string
  /** Selected variant text, e.g. "BA7009B15-哑黑银". */
  readonly selectedSku?: string | undefined
  /** Captured price value when the capture read one. */
  readonly price?: number | undefined
  /** Raw price text as displayed, kept for reference. */
  readonly priceRaw?: string | undefined
  /** Spec-parameter name/value pairs captured from the detail page. */
  readonly params?: readonly { readonly name: string; readonly value: string }[] | undefined
  /** Main image url captured from the listing. */
  readonly mainImageUrl?: string | undefined
}

/** Import one collected listing into the catalog under its link lineage. */
export interface CatalogImportRequest {
  /** Collection lineage; imports merge on `source.linkId`. */
  readonly source: {
    readonly platform: CollectPlatform
    readonly url: string
    readonly linkId: string
    readonly shopName?: string | undefined
    readonly sku?: string | undefined
    readonly captureId?: string | undefined
    readonly capturedAt?: string | undefined
  }
  /** Captured listing fields to extract attributes from. */
  readonly listing: CollectedListing
}

/** The stored record after one {@link CatalogImportRequest}. */
export interface CatalogImportValue {
  /** The stored record after the merge-or-create. */
  readonly item: WikiItem
  /** Whether this import minted a new record (false merges an existing one). */
  readonly created: boolean
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No catalog record carries that identity. */
    'catalog/not-found': { readonly id: CatalogItemId }
  }
}
