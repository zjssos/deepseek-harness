/**
 * The `rxlab_usage` storage domain: zod row schemas and the `defineDomain`
 * spec the UsageController opens. Four per-record tables — `sessions` (one row
 * per tracked session carrying its latest total), `modules` (derived
 * aggregates, one row per module), `jobs` (one row per work order's attributed
 * total), and `stage_usage` (one row per `${jobId}:${stage}`) — validated at the
 * durable boundary; the inferred row types mirror the browser-safe wire types
 * in `types.ts`. Version 2 adds the job/stage tables; version-1 records keep
 * reading through `compatibleVersions`.
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

/** The six workbench stages, mirroring `types.ts` and `rxlab_job`. */
const stageIdValues = ['exam', 'frame', 'lens', 'fabrication', 'pickup', 'aftercare'] as const

/** One work order's latest attributed usage total. */
const jobUsageRowSchema = z.object({
  jobId: z.string().min(1).max(128),
  totals: usageTotalsSchema,
  cost: z.number().nonnegative().optional(),
  currency: z.string().min(1).max(16).optional(),
  updatedAt: z.string(),
}).strict()

/** One work order stage's latest attributed usage total. */
const stageUsageRowSchema = z.object({
  jobId: z.string().min(1).max(128),
  stage: z.enum(stageIdValues),
  totals: usageTotalsSchema,
  cost: z.number().nonnegative().optional(),
  updatedAt: z.string(),
}).strict()

/**
 * The rxlab usage domain spec: `sessions`, `modules`, `jobs`, and `stage_usage`
 * tables in a per-record layout so each row is its own disposable document.
 * Version 2 adds the work-order job/stage tables; version-1 records remain
 * readable through `compatibleVersions` because the original two tables keep
 * their version-1 shape. The stage table is `stage_usage` rather than
 * `stageUsage` because storage-domain table names must be lowercase
 * snake_case.
 */
export const rxlabUsageDomainSpec = defineDomain({
  name: 'rxlab_usage',
  version: 2,
  compatibleVersions: [1],
  layout: 'per-record',
  tables: {
    sessions: domainTable<string, z.infer<typeof sessionUsageRowSchema>>(sessionUsageRowSchema),
    modules: domainTable<string, z.infer<typeof moduleUsageRowSchema>>(moduleUsageRowSchema),
    jobs: domainTable<string, z.infer<typeof jobUsageRowSchema>>(jobUsageRowSchema),
    stage_usage: domainTable<string, z.infer<typeof stageUsageRowSchema>>(stageUsageRowSchema),
  },
})

export type StoredSessionUsageRow = z.infer<typeof sessionUsageRowSchema>
export type StoredModuleUsageRow = z.infer<typeof moduleUsageRowSchema>
export type StoredJobUsageRow = z.infer<typeof jobUsageRowSchema>
export type StoredStageUsageRow = z.infer<typeof stageUsageRowSchema>
