/**
 * Model-facing work-order tools for the rxlab guide workbench: `job_read`
 * projects jobs and their stages, `job_write_stage` creates or updates one
 * stage row, and `guide_generate` assembles the guide. This module owns
 * schemas, argument validation, model guidance, and the model-facing text;
 * the work-order data lives in the JobController and the assembly rules in
 * `guide.ts`. `job_write_stage` carries the `stage` argument that later
 * attributes a session round to a stage.
 * @module @deepseek-ai/dsh-rxlab-job/src/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { STAGE_ORDER } from './guide.ts'
import type { JobId, JobRecord, JobSummary, StageId, StageRecord } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'rxlab-job-tools'

/** Services required by the work-order tool suite. */
export const inject = ['tools', 'jobController']

/** Canonical tool output for one job list row (unbranded, JSON-safe). */
interface JobSummaryValue {
  id: string
  name?: string
  status: string
  stageIds: string[]
  sessionId?: string
  pricing?: JsonValue
  updatedAt: string
}

/** Canonical tool output for one full job. */
interface JobValue {
  id: string
  consumer: JsonValue
  status: string
  stageIds: string[]
  sessionId?: string
  pricing?: JsonValue
  createdAt: string
  updatedAt: string
}

/** Canonical tool output for one stage row. */
interface StageValue {
  id: string
  jobId: string
  stage: string
  status: string
  inputs: JsonValue
  outputs: JsonValue
  checks?: JsonValue
  updatedAt: string
}

/** Canonical tool output for one guide chapter. */
interface GuideChapterValue {
  stage: string
  title: string
  params?: JsonValue
  strategy?: string[]
  checklist?: string[]
  scripts?: string[]
  checks?: JsonValue
}

/** Canonical tool output for one guide document. */
interface GuideValue {
  jobId: string
  consumer: JsonValue
  chapters: GuideChapterValue[]
  pricing?: JsonValue
  generatedAt: string
}

/** Canonical `job_read` output: a list, or one job with its stages and guide. */
interface JobReadValue {
  jobs: JobSummaryValue[]
  job?: JobValue
  stages?: StageValue[]
  guide?: GuideValue
}

/** The author-facing JSON value node shared by opaque payload fields. */
const JSON_VALUE = { type: 'json' } as const

/** Output spec of one job list row. */
const JOB_SUMMARY_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    name: { type: 'string' },
    status: { type: 'string', required: true },
    stageIds: { type: 'array', required: true, items: { type: 'string' } },
    sessionId: { type: 'string' },
    pricing: JSON_VALUE,
    updatedAt: { type: 'string', required: true },
  },
} as const

/** Output spec of one full job. */
const JOB_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    consumer: { type: 'json', required: true },
    status: { type: 'string', required: true },
    stageIds: { type: 'array', required: true, items: { type: 'string' } },
    sessionId: { type: 'string' },
    pricing: JSON_VALUE,
    createdAt: { type: 'string', required: true },
    updatedAt: { type: 'string', required: true },
  },
} as const

/** Output spec of one stage row. */
const STAGE_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    jobId: { type: 'string', required: true },
    stage: { type: 'string', required: true },
    status: { type: 'string', required: true },
    inputs: { type: 'json', required: true },
    outputs: { type: 'json', required: true },
    checks: JSON_VALUE,
    updatedAt: { type: 'string', required: true },
  },
} as const

/** Output spec of one guide chapter. */
const GUIDE_CHAPTER_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stage: { type: 'string', required: true },
    title: { type: 'string', required: true },
    params: JSON_VALUE,
    strategy: { type: 'array', items: { type: 'string' } },
    checklist: { type: 'array', items: { type: 'string' } },
    scripts: { type: 'array', items: { type: 'string' } },
    checks: JSON_VALUE,
  },
} as const

/** Output spec of one guide document. */
const GUIDE_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    jobId: { type: 'string', required: true },
    consumer: { type: 'json', required: true },
    chapters: { type: 'array', required: true, items: GUIDE_CHAPTER_VALUE },
    pricing: JSON_VALUE,
    generatedAt: { type: 'string', required: true },
  },
} as const

/** Output spec of `job_read`. */
const JOB_READ_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    jobs: { type: 'array', required: true, items: JOB_SUMMARY_VALUE },
    job: JOB_VALUE,
    stages: { type: 'array', items: STAGE_VALUE },
    guide: GUIDE_VALUE,
  },
} as const

/** Cast a JSON-safe wire value to the opaque payload type. */
function asJson(value: unknown): JsonValue {
  return value as JsonValue
}

/** Parse one model-supplied stage string into the closed stage vocabulary. */
function parseStage(value: string): StageId {
  const found = STAGE_ORDER.find(stage => stage === value)
  if (found === undefined) {
    throw new Error(`unsupported stage '${value}'; expected one of ${STAGE_ORDER.join(', ')}`)
  }
  return found
}

/** Cast one model-supplied id string to a job id. */
function parseJobId(value: string): JobId {
  return value as JobId
}

/** Project one job summary onto the tool value. */
function projectSummary(summary: JobSummary): JobSummaryValue {
  return {
    id: String(summary.id),
    ...(summary.name === undefined ? {} : { name: summary.name }),
    status: summary.status,
    stageIds: [...summary.stageIds],
    ...(summary.sessionId === undefined ? {} : { sessionId: summary.sessionId }),
    ...(summary.pricing === undefined ? {} : { pricing: asJson(summary.pricing) }),
    updatedAt: summary.updatedAt,
  }
}

/** Project one stored job onto the tool value. */
function projectJob(job: JobRecord): JobValue {
  return {
    id: String(job.id),
    consumer: asJson(job.consumer),
    status: job.status,
    stageIds: [...job.stageIds],
    ...(job.sessionId === undefined ? {} : { sessionId: job.sessionId }),
    ...(job.pricing === undefined ? {} : { pricing: asJson(job.pricing) }),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

/** Project one stage row onto the tool value. */
function projectStage(stage: StageRecord): StageValue {
  return {
    id: String(stage.id),
    jobId: String(stage.jobId),
    stage: stage.stage,
    status: stage.status,
    inputs: stage.inputs,
    outputs: stage.outputs,
    ...(stage.checks === undefined ? {} : { checks: asJson(stage.checks) }),
    updatedAt: stage.updatedAt,
  }
}

/** Format one JSON payload for a model-facing line. */
function formatJson(value: JsonValue): string {
  return JSON.stringify(value)
}

/**
 * Register the work-order tools. All registrations are effect-scoped and
 * unregister on plugin dispose. `job_read` is read-only and concurrency-safe;
 * the write tools stay exclusive.
 * @param ctx - context whose `tools` registry receives the registrations,
 *   resolved with the JobController.
 */
export function apply(ctx: Context): void {
  const controller = ctx.jobController

  ctx.tools.register(defineTool({
    name: 'job_read',
    description: 'Read rxlab work orders: list them with an optional consumer-name query, or open one job with its stage rows and assembled guide.',
    parameters: {
      jobId: { type: 'string', description: 'Open this job id; omit to list jobs.' },
      query: { type: 'string', description: 'Case-insensitive consumer-name substring when listing.' },
    },
    output: {
      schema: JOB_READ_VALUE,
      render: (_args, value) => [{ type: 'text', text: formatJobRead(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      if (args.jobId !== undefined) {
        const { job, stages, guide } = await controller.getJob({ id: parseJobId(args.jobId) })
        return {
          jobs: [],
          job: projectJob(job),
          stages: stages.map(projectStage),
          ...(guide === undefined ? {} : { guide: guide as unknown as GuideValue }),
        }
      }
      const { items } = await controller.listJobs(
        args.query === undefined ? {} : { query: args.query },
      )
      return { jobs: items.map(projectSummary) }
    },
    presentCall: args => ({ card: 'generic', title: args.jobId === undefined ? '查询工单' : `读取工单 ${args.jobId}` }),
  }))

  ctx.tools.register(defineTool({
    name: 'job_write_stage',
    description: 'Create or update one stage row of a work order. The stage is the anchor the accounting attributes this session round to; pass only the fields that changed.',
    parameters: {
      jobId: { type: 'string', required: true, description: 'Work order id.' },
      stage: { type: 'string', required: true, enum: [...STAGE_ORDER], description: 'Stage the change belongs to.' },
      status: { type: 'string', enum: ['pending', 'in-progress', 'done', 'skipped'], description: 'New stage status; omit to keep the stored one.' },
      inputs: { type: 'json', description: 'Replacement stage 投入 payload; omit to keep the stored one.' },
      outputs: { type: 'json', description: 'Replacement stage 产出 payload; omit to keep the stored one.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { stage: { ...STAGE_VALUE, required: true } },
      } as const,
      render: (_args, value) => [{ type: 'text', text: formatStage(value.stage) }],
    },
    async execute(args) {
      const { stage } = await controller.upsertStage({
        jobId: parseJobId(args.jobId),
        stage: parseStage(args.stage),
        patch: {
          ...(args.status === undefined ? {} : { status: args.status }),
          ...(args.inputs === undefined ? {} : { inputs: args.inputs }),
          ...(args.outputs === undefined ? {} : { outputs: args.outputs }),
        },
      })
      return { stage: projectStage(stage) }
    },
    presentCall: args => ({ card: 'generic', title: `写入阶段 ${args.stage}` }),
  }))

  ctx.tools.register(defineTool({
    name: 'guide_generate',
    description: 'Assemble the consumer guide for a work order from its stored stage artifacts and return the chapter list.',
    parameters: {
      jobId: { type: 'string', required: true, description: 'Work order id to assemble a guide for.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { document: { ...GUIDE_VALUE, required: true } },
      } as const,
      render: (_args, value) => [{ type: 'text', text: formatGuide(value.document) }],
    },
    async execute(args) {
      const { document } = await controller.generateGuide({ jobId: parseJobId(args.jobId) })
      return { document: document as unknown as GuideValue }
    },
    presentCall: args => ({ card: 'generic', title: `生成指南 ${args.jobId}` }),
  }))
}

/** Render one `job_read` result as the model-facing text block. */
export function formatJobRead(value: JobReadValue): string {
  if (value.job !== undefined) {
    const lines = [`工单 ${value.job.id} [${value.job.status}] 阶段：${value.job.stageIds.join(' / ')}`]
    for (const stage of value.stages ?? []) {
      lines.push(`- ${stage.stage} [${stage.status}] 产出：${formatJson(stage.outputs)}`)
    }
    if (value.guide !== undefined) {
      lines.push(`指南章节：${value.guide.chapters.map(chapter => chapter.title).join(' / ')}`)
    }
    return lines.join('\n')
  }
  if (value.jobs.length === 0) return '当前没有匹配的工单。'
  return [
    `共 ${value.jobs.length} 个工单：`,
    ...value.jobs.map(job => `- ${job.id} [${job.status}]${job.name === undefined ? '' : ` ${job.name}`}`),
  ].join('\n')
}

/** Render one written stage row as the model-facing text block. */
export function formatStage(stage: StageValue): string {
  return `已更新阶段 ${stage.stage} [${stage.status}]，产出：${formatJson(stage.outputs)}`
}

/** Render one assembled guide as the model-facing text block. */
export function formatGuide(document: GuideValue): string {
  return [
    `指南 ${document.jobId}（${document.generatedAt}）`,
    ...document.chapters.map((chapter) => {
      const parts = [`## ${chapter.title}`]
      if (chapter.params !== undefined) parts.push(`参数：${formatJson(chapter.params)}`)
      if (chapter.strategy !== undefined) parts.push(`策略：${chapter.strategy.join('；')}`)
      if (chapter.checklist !== undefined) parts.push(`清单：${chapter.checklist.join('；')}`)
      if (chapter.scripts !== undefined) parts.push(`话术：${chapter.scripts.join('；')}`)
      return parts.join('\n')
    }),
  ].join('\n')
}
