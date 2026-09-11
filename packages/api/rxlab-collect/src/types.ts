/**
 * Public wire vocabulary of the rxlab collect Remote namespace: the durable
 * `rxlab_collect` record model — the shops a person registers, the product
 * entries filed under them, and the drafts the collect agent proposes for a
 * person's confirmation — plus the list/get/upsert/remove/import requests and
 * the collect failure codes. Types only — the zod schemas that validate this
 * model live in `domain.ts`, and the durable rows themselves are browser-safe
 * JSON.
 *
 * Optional record fields are declared `T | undefined` (not bare `T`): the
 * domain schemas model them the same way, so a parsed stored record is
 * directly assignable to its wire interface under `exactOptionalPropertyTypes`.
 * @module @deepseek-ai/dsh-rxlab-collect/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** E-commerce platform a shop or product entry belongs to. */
export type CollectPlatform = 'jd' | 'taobao' | '1688' | 'manual'

/** Identifies one registered shop (a generated uuid at create). */
export type CollectShopId = Branded<'CollectShopId'>

/** Identifies one product entry (a generated uuid at create). */
export type CollectLinkId = Branded<'CollectLinkId'>

/** Identifies one agent-proposed draft (a generated uuid at write). */
export type CollectDraftId = Branded<'CollectDraftId'>

/** Where one draft stands in the person's review. */
export type CollectDraftStatus = 'pending' | 'accepted' | 'rejected'

/** Which table one draft fills when accepted. */
export type CollectDraftTarget = 'shop' | 'product'

/** One price reading as a person entered it, keeping the raw text. */
export interface CollectPrice {
  /** Parsed numeric value of {@link CollectPrice.raw}. */
  readonly value: number
  /** The price text exactly as it was entered. */
  readonly raw: string
  /** Readability context for the raw text (e.g. promo drift). */
  readonly note?: string | undefined
}

/** One spec-parameter name/value pair of a product entry. */
export interface CollectParam {
  readonly name: string
  readonly value: string
}

/**
 * One registered shop. Shops are the module's organizing unit: every product
 * entry is filed under one, and the panel browses platform → shop → entries.
 */
export interface CollectShop {
  /** Stable record key, minted host-side on create. */
  readonly id: CollectShopId
  /** Platform the shop trades on. */
  readonly platform: CollectPlatform
  /** Shop display name a person entered. */
  readonly name: string
  /** Platform-side shop identifier when the person recorded one. */
  readonly shopKey?: string | undefined
  /** Shop home page URL. */
  readonly homeUrl?: string | undefined
  /** Free-form note about the shop. */
  readonly note?: string | undefined
  /** ISO-8601 instant of the last durable write. */
  readonly updatedAt: string
}

/** A shop before the controller mints id and updatedAt. */
export interface CollectShopDraft {
  readonly platform: CollectPlatform
  readonly name: string
  readonly shopKey?: string | undefined
  readonly homeUrl?: string | undefined
  readonly note?: string | undefined
  /** Present to replace an existing shop; absent mints a new one. */
  readonly id?: CollectShopId | undefined
}

/**
 * One product entry filed under a shop. Every product field is entered by
 * hand or confirmed from an agent draft; nothing here is captured
 * automatically.
 */
export interface CollectLink {
  /** Stable record key, minted host-side on create. */
  readonly id: CollectLinkId
  /** Platform the product page lives on. */
  readonly platform: CollectPlatform
  /** Owning shop; absent while the entry is not yet filed. */
  readonly shopRef?: CollectShopId | undefined
  /** Product page URL. */
  readonly url: string
  /** Platform product id when the person recorded one (e.g. JD sku). */
  readonly sku?: string | undefined
  /** Product title. */
  readonly title?: string | undefined
  /** Displayed price with its raw text. */
  readonly price?: CollectPrice | undefined
  /** The variant/SKU label the person recorded. */
  readonly selectedSku?: string | undefined
  /** Spec-parameter name/value pairs. */
  readonly params?: readonly CollectParam[] | undefined
  /** Main image URL. */
  readonly mainImageUrl?: string | undefined
  /** Purchase link the person recorded. */
  readonly buyUrl?: string | undefined
  /** Free-form note about the entry. */
  readonly note?: string | undefined
  /** Legacy domain-version-1/2 shop identifier; read-only. */
  readonly shopId?: string | undefined
  /** Legacy domain-version-1/2 shop name text; read-only. */
  readonly shopName?: string | undefined
  /** Legacy title recorded before the title field existed; read-only. */
  readonly titleAtAdd?: string | undefined
  /** ISO-8601 instant of the last durable write. */
  readonly updatedAt: string
}

/** A product entry before the controller mints id and updatedAt. */
export interface CollectLinkDraft {
  readonly platform: CollectPlatform
  readonly shopRef?: CollectShopId | undefined
  readonly url: string
  readonly sku?: string | undefined
  readonly title?: string | undefined
  readonly price?: CollectPrice | undefined
  readonly selectedSku?: string | undefined
  readonly params?: readonly CollectParam[] | undefined
  readonly mainImageUrl?: string | undefined
  readonly buyUrl?: string | undefined
  readonly note?: string | undefined
  /** Present to replace an existing entry; absent mints a new one. */
  readonly id?: CollectLinkId | undefined
}

/**
 * What one agent draft proposes. The discriminant names the table an
 * acceptance fills; the remaining fields are exactly that table's entry
 * fields, so confirming a draft is an ordinary upsert.
 */
export type CollectDraftPayload =
  | { readonly target: 'shop' } & Omit<CollectShopDraft, 'id'>
  | { readonly target: 'product' } & Omit<CollectLinkDraft, 'id'>

/**
 * One draft the collect agent proposed from material a person handed it.
 * A draft never reaches the shop or product tables on its own: the person
 * accepts or rejects each one, and only an acceptance writes.
 */
export interface CollectDraft {
  readonly id: CollectDraftId
  readonly status: CollectDraftStatus
  readonly payload: CollectDraftPayload
  /** The material the person handed the agent, kept for review. */
  readonly sourceText?: string | undefined
  /** ISO-8601 instant the agent proposed the draft. */
  readonly createdAt: string
  /** ISO-8601 instant the person resolved it; absent while pending. */
  readonly resolvedAt?: string | undefined
  /** Id of the shop or product entry an acceptance produced. */
  readonly resolvedId?: string | undefined
}

/** List registered shops, newest write first. */
export interface CollectShopListRequest {
  /** Restrict to one platform; absent lists every platform. */
  readonly platform?: CollectPlatform | undefined
  /** Case-insensitive substring matched against shop name, key, and home url. */
  readonly query?: string | undefined
}

/** Ordered shop rows for one {@link CollectShopListRequest}. */
export interface CollectShopListValue {
  readonly shops: readonly CollectShop[]
}

/** Open one registered shop by id. */
export interface CollectShopGetRequest {
  readonly id: CollectShopId
}

/** The full stored shop for one {@link CollectShopGetRequest}. */
export interface CollectShopGetValue {
  readonly shop: CollectShop
}

/** Register or replace one shop. */
export interface CollectShopUpsertRequest {
  /** Draft to store; an absent id mints a new row, a present id replaces it. */
  readonly shop: CollectShopDraft
}

/** The stored shop after one {@link CollectShopUpsertRequest}. */
export interface CollectShopUpsertValue {
  readonly shop: CollectShop
}

/** Remove one registered shop. */
export interface CollectShopRemoveRequest {
  readonly id: CollectShopId
}

/** Receipt after one {@link CollectShopRemoveRequest}. */
export interface CollectShopRemoveValue {
  /** Whether a shop existed under the id (false never writes). */
  readonly removed: boolean
  /** How many product entries were released back to unfiled. */
  readonly unfiled: number
}

/** List product entries, newest write first. */
export interface CollectLinkListRequest {
  /** Restrict to one platform; absent lists every platform. */
  readonly platform?: CollectPlatform | undefined
  /** Restrict to one owning shop. */
  readonly shopRef?: CollectShopId | undefined
  /** Restrict to entries that belong to no shop. */
  readonly unfiled?: boolean | undefined
  /** Case-insensitive substring matched against title, sku, shop text, and url. */
  readonly query?: string | undefined
}

/** Ordered product rows for one {@link CollectLinkListRequest}. */
export interface CollectLinkListValue {
  readonly items: readonly CollectLink[]
}

/** Open one complete product entry by id. */
export interface CollectLinkGetRequest {
  readonly id: CollectLinkId
}

/** The full stored entry for one {@link CollectLinkGetRequest}. */
export interface CollectLinkGetValue {
  readonly link: CollectLink
}

/** Create or replace one product entry; duplicate urls merge into one row. */
export interface CollectLinkUpsertRequest {
  /** Draft to store; an absent id mints a new row, a present id replaces it. */
  readonly link: CollectLinkDraft
}

/** The stored entry after one {@link CollectLinkUpsertRequest}. */
export interface CollectLinkUpsertValue {
  readonly link: CollectLink
  /** Whether a row already existed under the same url and was merged. */
  readonly merged: boolean
}

/** Remove one product entry. */
export interface CollectLinkRemoveRequest {
  readonly id: CollectLinkId
}

/** Receipt after one {@link CollectLinkRemoveRequest}. */
export interface CollectLinkRemoveValue {
  /** Whether a row existed under the id (false never writes). */
  readonly removed: boolean
}

/** Bulk-create product entries from a CSV text blob (columns listed in the README). */
export interface CollectLinkImportRequest {
  /** Raw CSV text; the server parses and validates every row. */
  readonly text: string
  /** Shop the imported rows are filed under; absent leaves them unfiled. */
  readonly shopRef?: CollectShopId | undefined
}

/** Result of one {@link CollectLinkImportRequest}. */
export interface CollectLinkImportValue {
  /** Entries created by this import. */
  readonly created: readonly CollectLink[]
  /** Existing entries merged by this import (same normalized url). */
  readonly updated: readonly CollectLink[]
  /** Row numbers rejected with the readable reason, for the UI to show. */
  readonly rejected: readonly { readonly row: number; readonly reason: string }[]
}

/** List drafts, newest first. */
export interface CollectDraftListRequest {
  /** Restrict to one review status; absent lists every status. */
  readonly status?: CollectDraftStatus | undefined
  /** Restrict to one target table. */
  readonly target?: CollectDraftTarget | undefined
}

/** Ordered draft rows for one {@link CollectDraftListRequest}. */
export interface CollectDraftListValue {
  readonly drafts: readonly CollectDraft[]
}

/** Accept one pending draft, writing the entry it proposes. */
export interface CollectDraftCommitRequest {
  readonly id: CollectDraftId
  /** Shop to file an accepted product entry under; overrides the draft's own. */
  readonly shopRef?: CollectShopId | undefined
}

/** Receipt after one {@link CollectDraftCommitRequest}. */
export interface CollectDraftCommitValue {
  readonly draft: CollectDraft
  /** The shop an accepted shop draft produced. */
  readonly shop?: CollectShop | undefined
  /** The entry an accepted product draft produced. */
  readonly link?: CollectLink | undefined
}

/** Reject one pending draft; nothing is written. */
export interface CollectDraftRejectRequest {
  readonly id: CollectDraftId
}

/** Receipt after one {@link CollectDraftRejectRequest}. */
export interface CollectDraftRejectValue {
  readonly draft: CollectDraft
}

/** One draft the agent proposes: what it would write, plus the material it read. */
export interface CollectDraftSubmission {
  readonly payload: CollectDraftPayload
  /** The material the person handed the agent, kept for review. */
  readonly sourceText?: string | undefined
}

/** Result of one agent draft submission. Host-internal: the tools call the controller directly. */
export interface CollectDraftSubmitValue {
  readonly created: readonly CollectDraft[]
  readonly rejected: readonly { readonly payload: CollectDraftPayload; readonly reason: string }[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No product entry carries that identity. */
    'collect/link-not-found': { readonly id: CollectLinkId }
    /** No registered shop carries that identity. */
    'collect/shop-not-found': { readonly id: CollectShopId }
    /** No draft carries that identity. */
    'collect/draft-not-found': { readonly id: CollectDraftId }
    /** The draft was already accepted or rejected. */
    'collect/draft-not-pending': { readonly id: CollectDraftId; readonly status: CollectDraftStatus }
    /** The CSV import text has rows the parser could not read. */
    'collect/bad-csv': { readonly row?: number; readonly reason: string }
  }
}
