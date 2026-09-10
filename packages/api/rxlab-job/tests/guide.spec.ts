import { describe, expect, it } from 'vitest'
import { assembleGuide, guideStageTitle, STAGE_ORDER, type GuideChapterContent } from '../src/guide.ts'
import type { JobRecord, StageRecord } from '../src/types.ts'

const job: JobRecord = {
  id: 'job-1' as JobRecord['id'],
  consumer: { name: '演示用户', usage: 'computer' },
  status: 'in-progress',
  stageIds: ['exam', 'frame', 'lens', 'fabrication', 'pickup', 'aftercare'],
  pricing: { amount: 1500, currency: 'CNY' },
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
}

function stage(stageId: StageRecord['stage'], outputs: StageRecord['outputs'], checks?: StageRecord['checks']): StageRecord {
  return {
    id: `${String(job.id)}:${stageId}` as StageRecord['id'],
    jobId: job.id,
    stage: stageId,
    status: 'done',
    inputs: {},
    outputs,
    ...(checks === undefined ? {} : { checks }),
    updatedAt: '2026-09-10T00:00:00.000Z',
  }
}

const stages: StageRecord[] = [
  stage('exam', { pdMm: 64, prescriptionSummary: '-3.00 DS' }, {
    overall: 'WARN',
    checks: [{ name: 'pd', status: 'WARN', detail: '瞳距偏窄' }],
    summary: '需复核',
  }),
  stage('frame', { frameName: 'BA7009', fpdMm: 70 }),
]

const content: Readonly<Partial<Record<StageRecord['stage'], GuideChapterContent>>> = {
  exam: { title: '验光解读', strategy: ['以最终主觉值为准'], checklist: ['确认瞳距'], scripts: ['请复述处方'] },
  frame: { params: { note: '镜架贴合' } },
}

describe('assembleGuide', () => {
  it('builds one chapter per tracked stage in canonical order', () => {
    const document = assembleGuide({ job, stages, content, generatedAt: '2026-09-10T01:00:00.000Z' })
    expect(document.chapters.map(chapter => chapter.stage)).toEqual([...STAGE_ORDER])
    expect(document.chapters[0]?.title).toBe('验光解读')
    expect(document.chapters[1]?.title).toBe(guideStageTitle('frame'))
  })

  it('derives params from the stage artifact and merges content overrides', () => {
    const document = assembleGuide({ job, stages, content, generatedAt: 'now' })
    expect(document.chapters[0]?.params).toEqual({ pdMm: 64, prescriptionSummary: '-3.00 DS' })
    expect(document.chapters[1]?.params).toEqual({ frameName: 'BA7009', fpdMm: 70, note: '镜架贴合' })
  })

  it('carries stage checks and injected copy into the chapter', () => {
    const chapter = assembleGuide({ job, stages, content, generatedAt: 'now' }).chapters[0]
    expect(chapter?.checks?.overall).toBe('WARN')
    expect(chapter?.strategy).toEqual(['以最终主觉值为准'])
    expect(chapter?.checklist).toEqual(['确认瞳距'])
    expect(chapter?.scripts).toEqual(['请复述处方'])
  })

  it('copies the job consumer and pricing and omits pricing when absent', () => {
    const withPricing = assembleGuide({ job, stages, generatedAt: 'now' })
    expect(withPricing.consumer.name).toBe('演示用户')
    expect(withPricing.pricing).toEqual({ amount: 1500, currency: 'CNY' })
    const { pricing: _pricing, ...bare } = job
    expect(assembleGuide({ job: bare, stages, generatedAt: 'now' }).pricing).toBeUndefined()
  })

  it('covers all six stages when the job tracks none', () => {
    const document = assembleGuide({ job: { ...job, stageIds: [] }, stages, generatedAt: 'now' })
    expect(document.chapters).toHaveLength(6)
  })

  it('is deterministic for identical input', () => {
    const input = { job, stages, content, generatedAt: 'now' }
    expect(assembleGuide(input)).toEqual(assembleGuide(input))
  })
})
