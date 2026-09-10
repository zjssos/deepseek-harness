/**
 * Public wire vocabulary of the rxlab content Remote namespace: the durable
 * `rxlab_content` knowledge/script model, its list/get/upsert/delete requests
 * and results, and the content failure code. Types only — the zod schemas that
 * validate this model live in `domain.ts`, and the durable rows are
 * browser-safe JSON.
 *
 * Optional fields are declared `T | undefined` (not bare `T`): the domain
 * schema models them the same way, so a parsed stored record is directly
 * assignable to its wire interfaces under `exactOptionalPropertyTypes`.
 * @module @deepseek-ai/dsh-rxlab-content/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Identifies one content item (a generated uuid at create). */
export type ContentItemId = Branded<'ContentItemId'>

/** Content family: durable knowledge entries or reusable talk scripts. */
export type ContentKind = 'knowledge' | 'script'

/**
 * The six workbench stages a content item may be tagged to. Duplicated from
 * the job domain rather than imported so this package keeps no dependency on
 * `rxlab-job`; the job package owns the authoritative stage list.
 */
export type StageId = 'exam' | 'frame' | 'lens' | 'fabrication' | 'pickup' | 'aftercare'

/** One durable knowledge or script entry. */
export interface ContentItem {
  readonly id: ContentItemId
  readonly kind: ContentKind
  /** Workbench stage the entry is tagged to; absent means stage-agnostic. */
  readonly stage?: StageId | undefined
  readonly title: string
  readonly tags: readonly string[]
  readonly body: string
  /** ISO-8601 instant of the last durable write. */
  readonly updatedAt: string
}

/** A content item before create: id and write timestamp are server-minted. */
export interface ContentItemDraft {
  readonly kind: ContentKind
  readonly stage?: StageId | undefined
  readonly title: string
  readonly tags: readonly string[]
  readonly body: string
}

/** List-row projection: enough to browse and open one entry. */
export interface ContentItemSummary {
  readonly id: ContentItemId
  readonly kind: ContentKind
  readonly stage?: StageId | undefined
  readonly title: string
  readonly tags: readonly string[]
  readonly updatedAt: string
}

/** List content items with optional facet and free-text filters. */
export interface ContentListRequest {
  /** Restrict to one content family; absent lists both. */
  readonly kind?: ContentKind | undefined
  /** Restrict to one workbench stage; absent lists every stage. */
  readonly stage?: StageId | undefined
  /** Case-insensitive substring matched against the title and tags. */
  readonly query?: string | undefined
}

/** Ordered summaries for one {@link ContentListRequest}, newest write first. */
export interface ContentListValue {
  readonly items: readonly ContentItemSummary[]
}

/** Open one full content item by id. */
export interface ContentGetRequest {
  readonly id: ContentItemId
}

/** The full stored item for one {@link ContentGetRequest}. */
export interface ContentGetValue {
  readonly item: ContentItem
}

/** Create or replace one content item by its (optional) id. */
export interface ContentUpsertRequest {
  /** Draft to store. */
  readonly item: ContentItemDraft
  /** Present to replace an existing item; absent mints a new one. */
  readonly id?: ContentItemId | undefined
}

/** The stored item after one {@link ContentUpsertRequest}. */
export interface ContentUpsertValue {
  readonly item: ContentItem
}

/** Remove one content item by id. */
export interface ContentDeleteRequest {
  readonly id: ContentItemId
}

/** Receipt after one {@link ContentDeleteRequest}. */
export interface ContentDeleteValue {
  /** Whether an item existed under the id (false never writes). */
  readonly removed: boolean
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No content item carries that identity. */
    'content/not-found': { readonly id: ContentItemId }
  }
}
