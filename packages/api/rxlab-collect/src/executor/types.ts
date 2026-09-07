/**
 * The deterministic collector contract: one adapter per platform turns one
 * product link into the capture fields of {@link CollectCapture}. Adapters run
 * sequentially inside a batch and share the controller-owned browser handle,
 * so they must be polite (single page at a time, small waits) and must never
 * leave the browser or page open on failure.
 * @module @deepseek-ai/dsh-rxlab-collect/src/executor/types
 */

import type { CollectCaptureFields, CollectPlatform } from '../types.ts'

/** The link slice a collector needs; never the whole stored row. */
export interface CollectorInput {
  readonly platform: CollectPlatform
  /** Canonical desktop product URL. */
  readonly url: string
  /** Canonical mobile product URL when the platform has one. */
  readonly mobileUrl?: string | undefined
  /** Platform product id when known (e.g. the JD sku). */
  readonly sku?: string | undefined
}

/** What one successful run produced: capture fields plus the HTTP verdict. */
export interface CollectorResult {
  readonly fields: CollectCaptureFields
  /** Whether the product page answered with HTTP success. */
  readonly httpOk: boolean
}

/**
 * One platform's deterministic link collector. Implementations are pure page
 * drivers: they throw a readable error on failure and return fields on
 * success; they never write durable state themselves.
 */
export interface Collector {
  /** Capture one product link; throws a readable error when it fails. */
  readonly collect: (input: CollectorInput) => Promise<CollectorResult>
}
