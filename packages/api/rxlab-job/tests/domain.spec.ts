import { describe, expect, it } from 'vitest'
import {
  consumerProfileSchema,
  guideDocumentSchema,
  jobDomainSpec,
  jobRecordSchema,
  jsonValueSchema,
  stageRecordSchema,
} from '../src/domain.ts'
import type { ConsumerProfile, GuideDocument, JobRecord, StageRecord } from '../src/types.ts'

const consumer: ConsumerProfile = {
  name: '演示用户',
  age: 32,
  usage: 'computer',
  budget: { amount: 2000, currency: 'CNY' },
  style: { rimTypePref: '全框' },
  oldRx: { sphereL: -3, sphereR: -2.75 },
}

const job: JobRecord = {
  id: 'job-1' as JobRecord['id'],
  consumer,
  status: 'draft',
  stageIds: ['exam', 'frame', 'lens', 'fabrication', 'pickup', 'aftercare'],
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
}

const stage: StageRecord = {
  id: 'job-1:exam' as StageRecord['id'],
  jobId: 'job-1' as StageRecord['jobId'],
  stage: 'exam',
  status: 'done',
  inputs: { fittingRecordId: 'fit-1' },
  outputs: { pdMm: 64, sphereL: -3 },
  checks: { overall: 'WARN', checks: [{ name: 'pd', status: 'WARN', detail: '偏窄' }], summary: '需复核' },
  updatedAt: '2026-09-10T00:00:00.000Z',
}

const document: GuideDocument = {
  jobId: 'job-1' as GuideDocument['jobId'],
  consumer,
  chapters: [{ stage: 'exam', title: '验光', params: { pdMm: 64 }, checks: stage.checks }],
  generatedAt: '2026-09-10T00:00:00.000Z',
}

describe('jsonValueSchema', () => {
  it('round-trips a nested JSON value', () => {
    const value = { a: [1, 'two', null], b: { c: false } }
    expect(jsonValueSchema.parse(value)).toEqual(value)
  })

  it('rejects a non-JSON value', () => {
    expect(jsonValueSchema.safeParse(() => 1).success).toBe(false)
  })
})

describe('consumerProfileSchema', () => {
  it('accepts the sample profile', () => {
    expect(consumerProfileSchema.parse(consumer).usage).toBe('computer')
  })

  it('rejects an unknown usage', () => {
    expect(consumerProfileSchema.safeParse({ usage: 'telepathy' }).success).toBe(false)
  })
})

describe('jobRecordSchema', () => {
  it('accepts a stored job with all six stages', () => {
    const parsed = jobRecordSchema.parse(job)
    expect(parsed.id).toBe('job-1')
    expect(parsed.stageIds).toHaveLength(6)
  })

  it('rejects an unknown stage id', () => {
    expect(jobRecordSchema.safeParse({ ...job, stageIds: ['telepathy'] }).success).toBe(false)
  })

  it('rejects an unknown status', () => {
    expect(jobRecordSchema.safeParse({ ...job, status: 'paused' }).success).toBe(false)
  })
})

describe('stageRecordSchema', () => {
  it('accepts a stage row with inputs, outputs, and checks', () => {
    const parsed = stageRecordSchema.parse(stage)
    expect(parsed.stage).toBe('exam')
    expect(parsed.checks?.overall).toBe('WARN')
  })

  it('requires inputs and outputs to be JSON values', () => {
    expect(stageRecordSchema.safeParse({ ...stage, inputs: undefined }).success).toBe(false)
  })

  it('rejects a check outside the OK/WARN/FAIL vocabulary', () => {
    const bad = { ...stage, checks: { overall: 'MAYBE', checks: [], summary: '' } }
    expect(stageRecordSchema.safeParse(bad).success).toBe(false)
  })
})

describe('guideDocumentSchema', () => {
  it('accepts the sample document', () => {
    expect(guideDocumentSchema.parse(document).chapters).toHaveLength(1)
  })
})

describe('jobDomainSpec', () => {
  it('declares the per-record rxlab_job domain at version 1', () => {
    expect(jobDomainSpec.name).toBe('rxlab_job')
    expect(jobDomainSpec.version).toBe(1)
    expect(jobDomainSpec.layout).toBe('per-record')
    expect(Object.keys(jobDomainSpec.tables).sort()).toEqual(['guides', 'jobs', 'stages'])
  })
})
