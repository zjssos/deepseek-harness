/**
 * The `rxlab_job` storage domain: zod record schemas for the work-order model
 * (`jobs`/`stages`/`guides`) and the `defineDomain` spec the JobController
 * opens. The zod schemas validate at the durable read boundary (per-record
 * layout, version 1) and double as the controller's create/update validator;
 * the inferred record types mirror the browser-safe wire types in `types.ts`.
 * @module @deepseek-ai/dsh-rxlab-job/src/domain
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { JobId, StageRecordId } from './types.ts'

/** Job record key; branding has no runtime representation. */
export const jobId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as JobId)

/** Stage row key (`${jobId}:${stage}`); branding has no runtime representation. */
export const stageRecordId = z
  .string()
  .min(1)
  .max(160)
  .transform(value => value as StageRecordId)

/** ISO-8601 write instant stamped by the controller, never by callers. */
const instant = z.string()

/** The closed stage vocabulary that drives every stage switch. */
export const stageIdSchema = z.enum(['exam', 'frame', 'lens', 'fabrication', 'pickup', 'aftercare'])

/** Job lifecycle. */
const jobStatusSchema = z.enum(['draft', 'in-progress', 'complete', 'archived'])

/** Stage-row lifecycle. */
const stageStatusSchema = z.enum(['pending', 'in-progress', 'done', 'skipped'])

/** One deterministic check verdict. */
const checkStatusSchema = z.enum(['OK', 'WARN', 'FAIL'])

/** Money amount plus its currency. */
const moneySchema = z.object({
  amount: z.number(),
  currency: z.string().min(1).max(16),
})

/**
 * Any JSON value, recursively. Stage inputs/outputs and chapter params are
 * opaque workbench data: the domain validates their JSON-ness, not a schema
 * that would freeze per-stage payloads the tools own.
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]))

/** The deterministic compatibility report a stage carries. */
export const compatibilityReportSchema = z.object({
  overall: checkStatusSchema,
  checks: z.array(z.object({
    name: z.string().min(1).max(120),
    status: checkStatusSchema,
    detail: z.string().max(2000),
  })),
  summary: z.string().max(2000),
})

/** The consumer profile one job is opened for. */
export const consumerProfileSchema = z.object({
  name: z.string().trim().max(100).optional(),
  age: z.number().int().min(0).max(130).optional(),
  faceWidthMm: z.number().positive().max(300).optional(),
  usage: z.enum(['far', 'near', 'computer', 'outdoor', 'all']).optional(),
  budget: moneySchema.optional(),
  style: z.object({
    shapePref: z.string().trim().max(60).optional(),
    rimTypePref: z.string().trim().max(60).optional(),
    colorPref: z.string().trim().max(60).optional(),
  }).optional(),
  oldRx: jsonValueSchema.optional(),
})

/** Validates every stored job record at the durable boundary. */
export const jobRecordSchema = z.object({
  id: jobId,
  consumer: consumerProfileSchema,
  status: jobStatusSchema,
  stageIds: z.array(stageIdSchema).max(6),
  sessionId: z.string().min(1).max(128).optional(),
  pricing: moneySchema.optional(),
  createdAt: instant,
  updatedAt: instant,
})

/** Validates every stored stage row at the durable boundary. */
export const stageRecordSchema = z.object({
  id: stageRecordId,
  jobId,
  stage: stageIdSchema,
  status: stageStatusSchema,
  inputs: jsonValueSchema,
  outputs: jsonValueSchema,
  checks: compatibilityReportSchema.optional(),
  updatedAt: instant,
})

/** One assembled guide chapter. */
export const guideChapterSchema = z.object({
  stage: stageIdSchema,
  title: z.string().min(1).max(200),
  params: z.record(z.string(), jsonValueSchema).optional(),
  strategy: z.array(z.string()).optional(),
  checklist: z.array(z.string()).optional(),
  scripts: z.array(z.string()).optional(),
  checks: compatibilityReportSchema.optional(),
})

/** The structured guide document the workbench renders. */
export const guideDocumentSchema = z.object({
  jobId,
  consumer: consumerProfileSchema,
  chapters: z.array(guideChapterSchema),
  pricing: moneySchema.optional(),
  generatedAt: instant,
})

/** Validates every stored guide row at the durable boundary. */
export const guideRecordSchema = z.object({
  jobId,
  document: guideDocumentSchema,
  generatedAt: instant,
})

/**
 * The job domain spec: `jobs` keyed by {@link JobId}, `stages` keyed by
 * `${jobId}:${stage}`, and `guides` keyed by {@link JobId}, all in a
 * per-record layout so each row is its own disposable document. Version 1 is
 * the first shipped shape of the work-order model.
 */
export const jobDomainSpec = defineDomain({
  name: 'rxlab_job',
  version: 1,
  layout: 'per-record',
  tables: {
    jobs: domainTable<JobId, z.infer<typeof jobRecordSchema>>(jobRecordSchema),
    stages: domainTable<StageRecordId, z.infer<typeof stageRecordSchema>>(stageRecordSchema),
    guides: domainTable<JobId, z.infer<typeof guideRecordSchema>>(guideRecordSchema),
  },
})
