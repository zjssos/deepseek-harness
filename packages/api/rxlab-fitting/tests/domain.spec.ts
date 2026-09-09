import { describe, expect, it } from 'vitest'
import { examRecordDraftSchema, examStageEntrySchema, fittingDomainSpec, fittingRecordSchema } from '../src/domain.ts'
import type { ExamRecordDraft } from '../src/types.ts'

const draft: ExamRecordDraft = {
  patient: '演示用户',
  stages: [
    { id: 'anamnesis', data: { age: 32, firstExam: false, usage: 'all' } },
    {
      id: 'subjective',
      data: {
        eyeL: { mpmvaSph: -3.25, finalSph: -3.25, finalCyl: -0.75, finalAxis: 180, va: '1.0' },
        eyeR: { mpmvaSph: -3.0, finalSph: -3.0, finalCyl: -0.5, finalAxis: 175 },
      },
    },
    { id: 'pdMeasure', data: { pdL: 32, pdR: 32 } },
  ],
}

describe('examStageEntrySchema', () => {
  it('rejects an unknown stage id', () => {
    const result = examStageEntrySchema.safeParse([{ id: 'telepathy', data: {} }])
    expect(result.success).toBe(false)
  })

  it('rejects an axis outside 0-180', () => {
    const result = examStageEntrySchema.safeParse([
      { id: 'objective', data: { method: 'autorefractor', eyeL: { sph: -3, axis: 181 }, eyeR: { sph: -2 } } },
    ])
    expect(result.success).toBe(false)
  })
})

describe('examRecordDraftSchema', () => {
  it('accepts the sample draft and drops nothing', () => {
    const result = examRecordDraftSchema.parse(draft)
    expect(result.stages).toHaveLength(3)
    expect(result.patient).toBe('演示用户')
  })

  it('requires at least one stage', () => {
    const result = examRecordDraftSchema.safeParse({ stages: [] })
    expect(result.success).toBe(false)
  })
})

describe('fittingRecordSchema', () => {
  it('round-trips a stored record with minted id and updatedAt', () => {
    const stored = fittingRecordSchema.parse({
      ...examRecordDraftSchema.parse(draft),
      id: 'test-record-1',
      updatedAt: '2026-09-09T00:00:00.000Z',
    })
    expect(stored.id).toBe('test-record-1')
    expect(stored.updatedAt).toBe('2026-09-09T00:00:00.000Z')
  })
})

describe('fittingDomainSpec', () => {
  it('declares the per-record rxlab_fitting domain at version 1', () => {
    expect(fittingDomainSpec.name).toBe('rxlab_fitting')
    expect(fittingDomainSpec.version).toBe(1)
    expect(fittingDomainSpec.layout).toBe('per-record')
    expect(Object.keys(fittingDomainSpec.tables)).toEqual(['records'])
  })
})
