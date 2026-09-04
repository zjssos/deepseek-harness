/**
 * Public wire vocabulary of the rxlab catalog Remote namespace: the durable
 * `rxlab_catalog` record model (a discriminated union of frame / lens / product
 * master-data rows), the list/get/upsert/remove requests and results, and the
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

/** Stable lens-type vocabulary a fitting rule can switch on. */
export type LensType =
  | 'single-vision'
  | 'progressive'
  | 'blue-light'
  | 'photochromic'
  | 'occupational'
  | 'other'

/** Lens refractive-index vocabulary, the popular stock values. */
export type RefractiveIndex = '1.56' | '1.60' | '1.67' | '1.74'

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
  /** ISO-8601 instant of the last durable write. */
  readonly updatedAt: string
}

/** One collected-or-manual eyeglass frame with its fitting geometry. */
export interface FrameItem extends WikiItemBase {
  readonly kind: 'frame'
  /** Frame material display text (metal, acetate, titanium, ...). */
  readonly frameMaterial: string
  /** Horizontal lens size in millimetres. */
  readonly lensWidth?: number | undefined
  /** Vertical lens size in millimetres. */
  readonly lensHeight?: number | undefined
  /** Bridge width in millimetres. */
  readonly bridgeWidth?: number | undefined
  /** Temple length in millimetres. */
  readonly templeLength?: number | undefined
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
  /** Lens design family. */
  readonly lensType: LensType
  /** Coating stack display text (anti-reflective, hard, ...). */
  readonly coating?: string | undefined
  /** Sphere range the lens can correct, free text such as "-8.00 ~ +6.00". */
  readonly sphereRange?: string | undefined
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
}

/** Draft of one frame record (id and updatedAt are server-minted). */
export interface FrameItemDraft extends WikiItemDraftBase {
  readonly kind: 'frame'
  /** Present to replace an existing record; absent mints a new one. */
  readonly id?: CatalogItemId | undefined
  readonly frameMaterial: string
  readonly lensWidth?: number | undefined
  readonly lensHeight?: number | undefined
  readonly bridgeWidth?: number | undefined
  readonly templeLength?: number | undefined
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
  readonly lensType: LensType
  readonly coating?: string | undefined
  readonly sphereRange?: string | undefined
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
  readonly updatedAt: string
}

/** List one catalog slice: optional kind filter plus a free-text brand/model/name match. */
export interface CatalogListRequest {
  /** Restrict to one record family; absent lists every family. */
  readonly kind?: WikiKind | undefined
  /** Case-insensitive substring matched against brand, model, and name. */
  readonly query?: string | undefined
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

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No catalog record carries that identity. */
    'catalog/not-found': { readonly id: CatalogItemId }
  }
}
