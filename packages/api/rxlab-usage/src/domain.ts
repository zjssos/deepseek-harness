/**
 * The `rxlab_usage` storage domain: zod row schemas and the `defineDomain`
 * spec the UsageController opens. Two per-record tables — `sessions` (one row
 * per tracked session carrying its latest total) and `modules` (derived
 * aggregates, one row per module) — validated at the durable boundary; the
 * inferred row types mirror the browser-safe wire types in `types.ts`.
 * @module @deepseek-ai/dsh-rxlab-usage/src/domain
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

/** Four token buckets; nonnegative integers, matching the projection schema. */
const usageTotalsSchema = z.object({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
}).strict()

/** Plain session key (the session log's id string); branding lives in dsh-session. */
const sessionIdSchema = z.string().min(1).max(128)

/** One session's latest durable usage row. */
const sessionUsageRowSchema = z.object({
  sessionId: sessionIdSchema,
  module: z.string().min(1).max(64),
  totals: usageTotalsSchema,
  /** Projection watermark (log seq) the totals reflect when last written. */
  updatedSeq: z.number().int().nonnegative(),
  updatedAt: z.string(),
}).strict()

/** One module's aggregate row, derived from its session rows at each write. */
const moduleUsageRowSchema = z.object({
  moduleId: z.string().min(1).max(64),
  totals: usageTotalsSchema,
  sessionCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
}).strict()

/**
 * The rxlab usage domain spec: `sessions` and `modules` tables in a
 * per-record layout so each row is its own disposable document. Version 1 is
 * the first shipped shape of the token-accounting model.
 */
export const rxlabUsageDomainSpec = defineDomain({
  name: 'rxlab_usage',
  version: 1,
  layout: 'per-record',
  tables: {
    sessions: domainTable<string, z.infer<typeof sessionUsageRowSchema>>(sessionUsageRowSchema),
    modules: domainTable<string, z.infer<typeof moduleUsageRowSchema>>(moduleUsageRowSchema),
  },
})

export type StoredSessionUsageRow = z.infer<typeof sessionUsageRowSchema>
export type StoredModuleUsageRow = z.infer<typeof moduleUsageRowSchema>
