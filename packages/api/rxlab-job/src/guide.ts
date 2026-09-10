/**
 * The deterministic guide assembler: folds a job's stage artifacts and an
 * injected content-domain script map into one structured {@link GuideDocument}.
 * Pure functions over the wire vocabulary — no storage, no transport, no LLM,
 * no zod. The controller supplies the job, its stage rows, the assembly
 * instant, and (until the content domain lands) an empty content map.
 * @module @deepseek-ai/dsh-rxlab-job/src/guide
 */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { GuideChapter, GuideDocument, JobRecord, StageId, StageRecord } from './types.ts'

/** The six stages in canonical guide order. */
export const STAGE_ORDER = ['exam', 'frame', 'lens', 'fabrication', 'pickup', 'aftercare'] as const

/** Default chapter titles the product shows when content supplies none. */
const STAGE_TITLES: Readonly<Record<StageId, string>> = {
  exam: '验光',
  frame: '选框',
  lens: '选片',
  fabrication: '加工',
  pickup: '取镜',
  aftercare: '售后',
}

/** Content-domain copy for one stage, injected by the caller. */
export interface GuideChapterContent {
  /** Overrides the default chapter title. */
  readonly title?: string | undefined
  /** Extra params merged over the stage artifact's object fields. */
  readonly params?: Readonly<Record<string, JsonValue>> | undefined
  readonly strategy?: readonly string[] | undefined
  readonly checklist?: readonly string[] | undefined
  readonly scripts?: readonly string[] | undefined
}

/** One assembler call: the job, its stage rows, injected copy, and the instant. */
export interface AssembleGuideInput {
  readonly job: JobRecord
  readonly stages: readonly StageRecord[]
  /** Stage copy keyed by stage; absent stages fall back to defaults. */
  readonly content?: Readonly<Partial<Record<StageId, GuideChapterContent>>> | undefined
  /** ISO-8601 assembly instant, minted by the caller for a pure assembler. */
  readonly generatedAt: string
}

/** The default chapter title for one stage. */
export function guideStageTitle(stage: StageId): string {
  return STAGE_TITLES[stage]
}

/** Whether a JSON value is a plain object usable as chapter params. */
function isJsonObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The stages a job's guide covers, in canonical order. */
function requestedStages(job: JobRecord): readonly StageId[] {
  if (job.stageIds.length === 0) return STAGE_ORDER
  const tracked = new Set(job.stageIds)
  return STAGE_ORDER.filter(stage => tracked.has(stage))
}

/** Merge one stage's artifact object with the injected param overrides. */
function chapterParams(
  record: StageRecord | undefined,
  content: GuideChapterContent | undefined,
): { readonly params?: Readonly<Record<string, JsonValue>> } {
  const merged: Record<string, JsonValue> = {}
  if (record !== undefined && isJsonObject(record.outputs)) Object.assign(merged, record.outputs)
  if (content?.params !== undefined) Object.assign(merged, content.params)
  return Object.keys(merged).length === 0 ? {} : { params: merged }
}

/**
 * Assemble one guide from a job's stage artifacts and injected content copy.
 * Chapters follow {@link STAGE_ORDER}, filtered to the job's tracked stages
 * (all six when the job tracks none). The result is a pure function of its
 * input: the same input always yields the same document.
 * @param input - job, stage rows, injected content, and the assembly instant.
 * @returns the structured guide document.
 */
export function assembleGuide(input: AssembleGuideInput): GuideDocument {
  const byStage = new Map<StageId, StageRecord>()
  for (const record of input.stages) byStage.set(record.stage, record)
  const chapters: GuideChapter[] = requestedStages(input.job).map((stage) => {
    const record = byStage.get(stage)
    const content = input.content?.[stage]
    return {
      stage,
      title: content?.title ?? STAGE_TITLES[stage],
      ...chapterParams(record, content),
      ...(content?.strategy === undefined ? {} : { strategy: [...content.strategy] }),
      ...(content?.checklist === undefined ? {} : { checklist: [...content.checklist] }),
      ...(content?.scripts === undefined ? {} : { scripts: [...content.scripts] }),
      ...(record?.checks === undefined ? {} : { checks: record.checks }),
    }
  })
  return {
    jobId: input.job.id,
    consumer: input.job.consumer,
    chapters,
    ...(input.job.pricing === undefined ? {} : { pricing: input.job.pricing }),
    generatedAt: input.generatedAt,
  }
}
