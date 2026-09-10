/**
 * Wire types for the `rxlabUsage` Remote namespace: per-session token-usage
 * rows and per-module aggregates over the workbench's token-meter projection.
 * Types only — no runtime code. The four token buckets mirror the token-meter
 * `TokenUsageProjection` totals (uncached input, output, cache read, cache
 * write) and the durable rows in `domain.ts`, so the SPA and the host agree on
 * the wire without importing a Host package.
 * @module @deepseek-ai/dsh-rxlab-usage/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Provider-reported token buckets summed per session. */
export interface UsageTotals {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

/** One workbench module's aggregate usage row (derived from its sessions). */
export interface ModuleUsageSummary {
  readonly moduleId: string
  readonly totals: UsageTotals
  readonly sessionCount: number
  readonly updatedAt: string
}

/** The whole-module aggregate set the SPA usage view renders. */
export interface UsageSummaryValue {
  readonly modules: readonly ModuleUsageSummary[]
}

/** Read usage rows for a specific set of session ids. */
export interface SessionUsageRequest {
  readonly ids: readonly string[]
}

/** Per-session usage as durably recorded by the host; only known ids appear. */
export interface SessionUsageRow {
  readonly sessionId: string
  /** Workbench module the session belongs to (agent default). */
  readonly module: string
  readonly totals: UsageTotals
  readonly updatedAt: string
}

/** Result of a {@link SessionUsageRequest}; absent ids have no entry. */
export interface SessionUsageValue {
  readonly sessions: Readonly<Record<string, SessionUsageRow>>
}

/**
 * The six workbench stages, mirroring `@deepseek-ai/dsh-rxlab-job`'s StageId.
 * Declared here rather than imported so this browser-safe module stays free of
 * the work-order package's Host program; both are the same `Branded`/union
 * vocabulary and values pass either way.
 */
export type StageId = 'exam' | 'frame' | 'lens' | 'fabrication' | 'pickup' | 'aftercare'

/**
 * Identifies one work order, mirroring `@deepseek-ai/dsh-rxlab-job`'s JobId.
 * `Branded<'JobId'>` resolves to the same object type through the shared
 * `@deepseek-ai/dsh-brand` symbol, so rxlabJob and rxlabUsage accept each
 * other's ids.
 */
export type JobId = Branded<'JobId'>

/** One stage's aggregated provider usage within a job. */
export interface StageUsage {
  readonly stage: StageId
  readonly totals: UsageTotals
  /** Exact cost under the configured route rates; absent when it cannot be proven. */
  readonly cost?: number | undefined
}

/** Read the aggregated usage of one work order. */
export interface JobUsageRequest {
  readonly jobId: JobId
}

/** One work order's aggregated usage and exact route-priced cost. */
export interface JobUsageValue {
  readonly totals: UsageTotals
  /** Exact total cost; present only when every attributed turn priced exactly. */
  readonly cost?: number | undefined
  /** The configured pricing currency; present exactly when `cost` is. */
  readonly currency?: string | undefined
  /** Stages that received usage, in first-appearance order. */
  readonly stages: readonly StageUsage[]
}
