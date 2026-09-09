/**
 * Public wire vocabulary of the rxlab collect Remote namespace: the durable
 * `rxlab_collect` record model — product-link assets, one capture per run, and
 * run batches with per-link results — plus the list/get/upsert/remove/import
 * requests and the collect failure codes. Types only — the zod schemas that
 * validate this model live in `domain.ts`, and the durable rows themselves are
 * browser-safe JSON.
 *
 * Optional record fields are declared `T | undefined` (not bare `T`): the
 * domain schemas model them the same way, so a parsed stored record is
 * directly assignable to its wire interface under `exactOptionalPropertyTypes`.
 * @module @deepseek-ai/dsh-rxlab-collect/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** E-commerce platform a link belongs to; the model's open discriminant. */
export type CollectPlatform = 'jd' | 'taobao' | '1688' | 'manual'

/** Identifies one product link asset (a generated uuid at create). */
export type CollectLinkId = Branded<'CollectLinkId'>

/** Identifies one capture record (a generated uuid at write). */
export type CollectCaptureId = Branded<'CollectCaptureId'>

/** Identifies one run batch (a generated uuid at create). */
export type CollectBatchId = Branded<'CollectBatchId'>

/** Lifecycle of one link asset. */
export type CollectLinkStatus = 'idle' | 'running' | 'ok' | 'error'

/** Lifecycle of one run batch. */
export type CollectBatchStatus = 'queued' | 'running' | 'done' | 'partial'

/** Per-link outcome inside one batch. */
export type CollectBatchItemStatus = 'pending' | 'ok' | 'error'

/** One product link asset the deterministic L1 collector runs against. */
export interface CollectLink {
  /** Stable record key, minted host-side on create. */
  readonly id: CollectLinkId
  /** Platform the link lives on; decides which collector adapter runs. */
  readonly platform: CollectPlatform
  /** Shop id on the platform when the source page exposes one. */
  readonly shopId?: string | undefined
  /** Shop display name. */
  readonly shopName?: string | undefined
  /** Platform product id when the page structure exposes one (e.g. JD sku). */
  readonly sku?: string | undefined
  /** Canonical desktop product URL the link resolves to. */
  readonly url: string
  /** Canonical mobile product URL when the platform splits surfaces. */
  readonly mobileUrl?: string | undefined
  /** Optional human title recorded at add time (never used for capture). */
  readonly titleAtAdd?: string | undefined
  /** Last run outcome; 'running' only while a batch item is in flight. */
  readonly status: CollectLinkStatus
  /** ISO-8601 instant of the last successful capture. */
  readonly lastCaptureAt?: string | undefined
  /** Last successful capture id (the record under `rxlabCollect.getCapture`). */
  readonly lastCaptureId?: CollectCaptureId | undefined
  /** Numeric price of the last successful capture. */
  readonly lastPrice?: number | undefined
  /** Readable failure of the last run, when it failed. */
  readonly lastError?: string | undefined
  /** Whether scheduled rescans may pick this link (M2). */
  readonly rescan?: boolean | undefined
  /** ISO-8601 instant of the last durable write. */
  readonly updatedAt: string
}

/** A link asset before the controller mints id and updatedAt. */
export interface CollectLinkDraft {
  readonly platform: CollectPlatform
  readonly shopId?: string | undefined
  readonly shopName?: string | undefined
  readonly sku?: string | undefined
  readonly url: string
  readonly titleAtAdd?: string | undefined
  readonly rescan?: boolean | undefined
  /** Present to replace an existing link; absent mints a new one. */
  readonly id?: CollectLinkId | undefined
}

/**
 * One link found by the collect agent's browser discovery. The platform may
 * be omitted: the host guesses it from the url and rejects what it cannot
 * place.
 */
export interface CollectDiscoveredLink {
  readonly url: string
  readonly platform?: CollectPlatform | undefined
  readonly shopId?: string | undefined
  readonly shopName?: string | undefined
  readonly sku?: string | undefined
  readonly titleAtAdd?: string | undefined
}

/** Result of one agent discovery submission (same receipt shape as CSV import). */
export interface CollectDiscoveredSubmitValue {
  readonly created: readonly CollectLink[]
  readonly merged: readonly CollectLink[]
  readonly rejected: readonly { readonly link: CollectDiscoveredLink; readonly reason: string }[]
}

/** The deterministic fields one collector run can capture. */
export interface CollectCaptureFields {
  /** Cleaned listing title read from the product page. */
  readonly title?: string | undefined
  /** Displayed price with its raw text and a readability note. */
  readonly price?: CollectPrice | undefined
  /** The variant/SKU label the page defaulted to at capture time. */
  readonly selectedSku?: string | undefined
  /** Share-produced purchase link (the link a buyer opens). */
  readonly buyUrl?: string | undefined
  /** Best-effort main image; absent when the page does not expose one. */
  readonly mainImageUrl?: string | undefined
  /** Detail-gallery image URLs; may stay empty when images are lazy. */
  readonly detailImageUrls?: readonly string[] | undefined
  /** Spec-parameter name/value pairs from the detail page's parameter table. */
  readonly params?: readonly { readonly name: string; readonly value: string }[] | undefined
}

/** One price reading at capture time. */
export interface CollectPrice {
  /** Parsed numeric value of {@link CollectPrice.raw}. */
  readonly value: number
  /** The price text exactly as the page displayed it. */
  readonly raw: string
  /** Readability context for the raw text (e.g. promo drift). */
  readonly note?: string | undefined
}

/** One deterministic capture of one link at one instant. */
export interface CollectCapture {
  readonly id: CollectCaptureId
  /** The link asset this capture belongs to. */
  readonly linkId: CollectLinkId
  /** ISO-8601 instant the capture ran. */
  readonly capturedAt: string
  /** Captured fields; a failed run stores only {@link CollectCapture.error}. */
  readonly fields: CollectCaptureFields
  /** Whether the product page answered with HTTP success. */
  readonly httpOk?: boolean | undefined
  /** Readable failure when the run did not complete. */
  readonly error?: string | undefined
}

/** One run batch: the links selected, and the per-link outcome so far. */
export interface CollectBatch {
  readonly id: CollectBatchId
  /** ISO-8601 instant the batch was created. */
  readonly createdAt: string
  /** ISO-8601 instant of the last durable item update. */
  readonly updatedAt: string
  readonly status: CollectBatchStatus
  readonly counts: { readonly total: number; readonly ok: number; readonly error: number }
  readonly items: readonly CollectBatchItem[]
}

/** One link's outcome inside a batch. */
export interface CollectBatchItem {
  readonly linkId: CollectLinkId
  readonly status: CollectBatchItemStatus
  /** Capture id when the item succeeded. */
  readonly captureId?: CollectCaptureId | undefined
  /** Readable failure when the item failed. */
  readonly error?: string | undefined
}

/** List one slice of link assets. */
export interface CollectLinkListRequest {
  /** Restrict to one platform; absent lists every platform. */
  readonly platform?: CollectPlatform | undefined
  /** Restrict to one shop id. */
  readonly shopId?: string | undefined
  /** Restrict to one lifecycle status. */
  readonly status?: CollectLinkStatus | undefined
  /** Case-insensitive substring matched against shop, sku, and url. */
  readonly query?: string | undefined
}

/** Ordered link rows for one {@link CollectLinkListRequest}, newest write first. */
export interface CollectLinkListValue {
  readonly items: readonly CollectLink[]
}

/** Open one complete link asset by id. */
export interface CollectLinkGetRequest {
  readonly id: CollectLinkId
}

/** The full stored link for one {@link CollectLinkGetRequest}. */
export interface CollectLinkGetValue {
  readonly link: CollectLink
}

/** Create or replace one link asset; duplicate urls merge into one row. */
export interface CollectLinkUpsertRequest {
  /** Draft to store; an absent id mints a new row, a present id replaces it. */
  readonly link: CollectLinkDraft
}

/** The stored link after one {@link CollectLinkUpsertRequest}. */
export interface CollectLinkUpsertValue {
  readonly link: CollectLink
  /** Whether a row already existed under the same url and was merged. */
  readonly merged: boolean
}

/** Remove one link asset (its captures stay; they are history). */
export interface CollectLinkRemoveRequest {
  readonly id: CollectLinkId
}

/** Receipt after one {@link CollectLinkRemoveRequest}. */
export interface CollectLinkRemoveValue {
  /** Whether a row existed under the id (false never writes). */
  readonly removed: boolean
}

/** Bulk-create links from a CSV text blob (columns listed in the README). */
export interface CollectLinkImportRequest {
  /** Raw CSV text; the server parses and validates every row. */
  readonly text: string
}

/** Result of one {@link CollectLinkImportRequest}. */
export interface CollectLinkImportValue {
  /** Links created by this import. */
  readonly created: readonly CollectLink[]
  /** Existing links merged by this import (same normalized url). */
  readonly updated: readonly CollectLink[]
  /** Row numbers rejected with the readable reason, for the UI to show. */
  readonly rejected: readonly { readonly row: number; readonly reason: string }[]
}

/** Create a run batch over the given link ids and start its queue. */
export interface CollectBatchCreateRequest {
  /** Links to capture, in run order (deduplicated). */
  readonly linkIds: readonly CollectLinkId[]
}

/** The batch after {@link CollectBatchCreateRequest} enqueued it. */
export interface CollectBatchCreateValue {
  readonly batch: CollectBatch
}

/** List run batches, newest first, with counts only (items stay in get). */
export interface CollectBatchListRequest {
  /** Restrict to one batch status; absent lists every status. */
  readonly status?: CollectBatchStatus | undefined
}

/** Ordered batch rows for one {@link CollectBatchListRequest}. */
export interface CollectBatchListValue {
  readonly batches: readonly CollectBatchSummary[]
}

/** Open one full batch (with per-link items) by id. */
export interface CollectBatchGetRequest {
  readonly id: CollectBatchId
}

/** The full stored batch for one {@link CollectBatchGetRequest}. */
export interface CollectBatchGetValue {
  readonly batch: CollectBatch
}

/** List capture history of one link, newest first. */
export interface CollectCaptureListRequest {
  readonly linkId: CollectLinkId
  /** Maximum rows to return; defaults to a bounded window. */
  readonly limit?: number | undefined
}

/** Ordered capture records for one {@link CollectCaptureListRequest}. */
export interface CollectCaptureListValue {
  readonly captures: readonly CollectCapture[]
}

/** Batch list-row projection: enough to browse and open one batch. */
export interface CollectBatchSummary {
  readonly id: CollectBatchId
  readonly status: CollectBatchStatus
  readonly counts: { readonly total: number; readonly ok: number; readonly error: number }
  readonly createdAt: string
  readonly updatedAt: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No link asset carries that identity. */
    'collect/link-not-found': { readonly id: CollectLinkId }
    /** No run batch carries that identity. */
    'collect/batch-not-found': { readonly id: CollectBatchId }
    /** The CSV import text has rows the parser could not read. */
    'collect/bad-csv': { readonly row?: number; readonly reason: string }
    /** The platform has no deterministic collector adapter yet. */
    'collect/adapter-unavailable': { readonly platform: CollectPlatform }
  }
}

/** Readable collect-browser state served by the `browserStatus` RPC. */
export interface BrowserStatusInfo {
  readonly launchMode: 'persistent' | 'cdp'
  readonly profileDir: string
  readonly cdpEndpoint: string
  /** Resolved chromium executable when one is configured. */
  readonly executablePath?: string
  /** Whether the CDP endpoint answers (or the owned persistent context is open). */
  readonly endpointUp: boolean
  /** Whether the owned browser context is currently open. */
  readonly contextOpen: boolean
}

/** Spawn a CDP-mode browser; values override the configured defaults for this call. */
export interface BrowserLaunchRequest {
  readonly executablePath?: string
  readonly port?: number
  readonly profileDir?: string
  readonly headless?: boolean
}

/** Outcome of one launch attempt. */
export interface BrowserLaunchValue {
  readonly launched: boolean
  readonly detail: string
}

/** Browser + launcher state for the SPA CDP status row. */
export interface BrowserStatusValue {
  /** The collect browse session state, or null when that service is not composed. */
  readonly browser: BrowserStatusInfo | null
  /** The CDP launcher process state (absent when the launcher row is not composed). */
  readonly launcher: { readonly running: boolean; readonly endpointUp: boolean } | null
}

/** Outcome of stopping the launcher-owned CDP browser. */
export interface BrowserStopValue {
  readonly stopped: boolean
}
