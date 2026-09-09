/**
 * Wire types for the `rxlabUsage` Remote namespace: per-session token-usage
 * rows and per-module aggregates over the workbench's token-meter projection.
 * Types only — no runtime code. The four token buckets mirror the token-meter
 * `TokenUsageProjection` totals (uncached input, output, cache read, cache
 * write) and the durable rows in `domain.ts`, so the SPA and the host agree on
 * the wire without importing a Host package.
 * @module @deepseek-ai/dsh-rxlab-usage/src/types
 */

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
