import { describe, expect, it } from 'vitest'
import { examRecordToRx, recommendFor, runDerive, validateExamRecord } from '../src/prescription.ts'
import type { ExamRecordDraft, ExamStageEntry, Prescription } from '../src/types.ts'

/** Deep-mutable mirror of the readonly wire types, for test mutations only. */
type Writable<T> = T extends readonly (infer item)[]
  ? Writable<item>[]
  : T extends object
    ? { -readonly [K in keyof T]: Writable<T[K]> }
    : T

const sample: ExamRecordDraft = {
  patient: '演示用户',
  date: '2026-09-09',
  stages: [
    {
      id: 'anamnesis',
      data: { age: 32, firstExam: false, usage: 'all', oldGlassesAgeYears: 3 },
    },
    {
      id: 'baseline',
      data: {
        oldGlasses: {
          measured: true,
          sphL: -3.0,
          sphR: -2.75,
          cylL: -0.75,
          cylR: -0.5,
          axisL: 180,
          axisR: 175,
        },
        nakedVa: { farL: '0.3', farR: '0.4' },
        withOldVa: { farL: '0.8', farR: '0.8' },
      },
    },
    {
      id: 'objective',
      data: {
        method: 'autorefractor',
        eyeL: { sph: -3.5, cyl: -0.75, axis: 178 },
        eyeR: { sph: -3.25, cyl: -0.5, axis: 175 },
      },
    },
    { id: 'cycloplegia', data: { method: 'none', reason: '32 岁非首验，调节状态稳定' } },
    {
      id: 'subjective',
      data: {
        eyeL: {
          mpmvaSph: -3.25,
          mpmvaCyl: -0.75,
          duochrome: 'balanced',
          jccAxisDelta: 2,
          jccCylDelta: 0,
          finalSph: -3.25,
          finalCyl: -0.75,
          finalAxis: 180,
          va: '1.0',
        },
        eyeR: {
          mpmvaSph: -3.0,
          mpmvaCyl: -0.5,
          duochrome: 'balanced',
          jccAxisDelta: 0,
          jccCylDelta: 0,
          finalSph: -3.0,
          finalCyl: -0.5,
          finalAxis: 175,
          va: '1.0',
        },
      },
    },
    {
      id: 'binocular',
      data: { balanceDeltaL: 0, balanceDeltaR: 0, finalSphL: -3.25, finalSphR: -3.0, duochrome: 'balanced' },
    },
    { id: 'trial', data: { performed: true, tolerated: true, rollbackDiopters: 0, notes: '试戴走动 10 分钟无不适' } },
    { id: 'pdMeasure', data: { pdL: 32, pdR: 32, instrument: 'pupillometer' } },
  ],
}

/** Clone the sample and rewrite its stages through one mutator. */
function withStages(modify: (stages: Writable<ExamStageEntry>[]) => Writable<ExamStageEntry>[] | undefined): ExamRecordDraft {
  const stages = structuredClone(sample.stages) as Writable<ExamStageEntry>[]
  return { ...sample, stages: modify(stages) ?? stages }
}

describe('validateExamRecord', () => {
  it('accepts the complete sample without findings', () => {
    expect(validateExamRecord(sample)).toEqual([])
  })

  it('fails a duplicated stage', () => {
    const record = withStages((stages) => {
      const pd = stages.find(stage => stage.id === 'pdMeasure')
      if (pd !== undefined) stages.push(structuredClone(pd))
    })
    expect(validateExamRecord(record).some(issue => issue.level === 'FAIL' && issue.message.includes('重复'))).toBe(true)
  })

  it('fails a missing required stage', () => {
    const record = withStages(stages => stages.filter(stage => stage.id !== 'pdMeasure'))
    const issues = validateExamRecord(record)
    expect(issues.some(issue => issue.level === 'FAIL' && issue.stage === 'pdMeasure')).toBe(true)
  })

  it('fails a missing axis on a present cylinder', () => {
    const record = withStages((stages) => {
      const subjective = stages.find(stage => stage.id === 'subjective')
      if (subjective?.id === 'subjective') {
        subjective.data.eyeL.finalAxis = undefined
        subjective.data.eyeL.jccAxisDelta = undefined
      }
    })
    expect(validateExamRecord(record).some(issue => issue.level === 'FAIL' && issue.stage === 'subjective')).toBe(true)
  })

  it('fails an under-16 first exam recorded as none', () => {
    const record = withStages((stages) => {
      const anamnesis = stages.find(stage => stage.id === 'anamnesis')
      const cycloplegia = stages.find(stage => stage.id === 'cycloplegia')
      if (anamnesis?.id === 'anamnesis') {
        anamnesis.data.age = 15
        anamnesis.data.firstExam = true
      }
      if (cycloplegia?.id === 'cycloplegia') cycloplegia.data.method = 'none'
    })
    expect(validateExamRecord(record).some(issue => issue.level === 'FAIL' && issue.stage === 'cycloplegia')).toBe(true)
  })

  it('passes an under-16 first exam with cycloplegia recorded', () => {
    const record = withStages((stages) => {
      const anamnesis = stages.find(stage => stage.id === 'anamnesis')
      const cycloplegia = stages.find(stage => stage.id === 'cycloplegia')
      if (anamnesis?.id === 'anamnesis') {
        anamnesis.data.age = 15
        anamnesis.data.firstExam = true
      }
      if (cycloplegia?.id === 'cycloplegia') {
        cycloplegia.data.method = 'cycloplegia'
        cycloplegia.data.reason = '快散（托吡卡胺）'
      }
    })
    expect(validateExamRecord(record).filter(issue => issue.level === 'FAIL')).toEqual([])
  })

  it('warns when the subjective endpoint is more minus than objective by over 0.5D', () => {
    const record = withStages((stages) => {
      const subjective = stages.find(stage => stage.id === 'subjective')
      const binocular = stages.find(stage => stage.id === 'binocular')
      if (subjective?.id === 'subjective') {
        subjective.data.eyeL.mpmvaSph = -3.75
        subjective.data.eyeL.finalSph = -4.0
      }
      if (binocular?.id === 'binocular') binocular.data.finalSphL = -4.0
    })
    expect(validateExamRecord(record).some(issue => issue.level === 'WARN' && issue.message.includes('过矫'))).toBe(true)
  })

  it('warns when binocular finals diverge from single-eye finals by over 0.25D', () => {
    const record = withStages((stages) => {
      const binocular = stages.find(stage => stage.id === 'binocular')
      if (binocular?.id === 'binocular') binocular.data.finalSphL = -4.0
    })
    expect(validateExamRecord(record).some(issue => issue.level === 'WARN' && issue.stage === 'binocular')).toBe(true)
  })

  it('warns when a cylinder reduction skips the spherical-equivalent sphere compensation', () => {
    const record = withStages((stages) => {
      const subjective = stages.find(stage => stage.id === 'subjective')
      if (subjective?.id === 'subjective') {
        subjective.data.eyeL.mpmvaCyl = -1.75
        subjective.data.eyeL.jccCylDelta = 1.0
        subjective.data.eyeL.finalCyl = -0.75
      }
    })
    expect(validateExamRecord(record).some(issue => issue.level === 'WARN' && issue.message.includes('等效球镜'))).toBe(true)
  })

  it('warns on a missing trial record', () => {
    const record = withStages(stages => stages.filter(stage => stage.id !== 'trial'))
    expect(validateExamRecord(record).some(issue => issue.level === 'WARN' && issue.stage === 'trial')).toBe(true)
  })

  it('fails a rollback that is not a multiple of 0.25D', () => {
    const record = withStages((stages) => {
      const trial = stages.find(stage => stage.id === 'trial')
      if (trial?.id === 'trial') trial.data.rollbackDiopters = 0.3
    })
    expect(validateExamRecord(record).some(issue => issue.level === 'FAIL' && issue.stage === 'trial')).toBe(true)
  })

  it('warns when age 45+ lacks an ADD measurement', () => {
    const record = withStages((stages) => {
      const anamnesis = stages.find(stage => stage.id === 'anamnesis')
      if (anamnesis?.id === 'anamnesis') anamnesis.data.age = 50
    })
    expect(validateExamRecord(record).some(issue => issue.level === 'WARN' && issue.stage === 'add')).toBe(true)
  })
})

describe('examRecordToRx', () => {
  it('derives the sample prescription: binocular spheres, subjective cylinders, summed PD', () => {
    const rx = examRecordToRx(sample)
    expect(rx.eyeL).toMatchObject({ sph: -3.25, cyl: -0.75, axis: 180, va: '1.0' })
    expect(rx.eyeR.sph).toBe(-3.0)
    expect(rx.pd).toBe(64)
    expect(rx.pdL).toBe(32)
    expect(rx.pdR).toBe(32)
    expect(rx.usage).toBe('all')
    expect(rx.age).toBe(32)
    expect(rx.eyeL.add).toBeUndefined()
  })

  it('adds trial rollback back as plus sphere on both eyes', () => {
    const record = withStages((stages) => {
      const trial = stages.find(stage => stage.id === 'trial')
      if (trial?.id === 'trial') {
        trial.data.rollbackDiopters = 0.25
        trial.data.notes = '地面倾斜感，回退 -0.25D'
      }
    })
    const rx = examRecordToRx(record)
    expect(rx.eyeL.sph).toBe(-3.0)
    expect(rx.eyeR.sph).toBe(-2.75)
  })

  it('carries per-eye ADD and the near-acuity note', () => {
    const record = withStages((stages) => {
      stages.push({ id: 'add', data: { addL: 1.0, addR: 1.0, nearVa: '1.0' } })
      const anamnesis = stages.find(stage => stage.id === 'anamnesis')
      if (anamnesis?.id === 'anamnesis') anamnesis.data.age = 52
    })
    const rx = examRecordToRx(record)
    expect(rx.eyeL.add).toBe(1.0)
    expect(rx.eyeR.add).toBe(1.0)
    expect(rx.notes).toBe('近视力 1.0')
  })

  it('throws on a missing required stage', () => {
    const record = withStages(stages => stages.filter(stage => stage.id !== 'binocular'))
    expect(() => examRecordToRx(record)).toThrow('binocular')
  })
})

describe('recommendFor', () => {
  it('picks the index by worst power and the band from PD', () => {
    const rx: Prescription = examRecordToRx(sample)
    const advice = recommendFor(rx)
    expect(advice.recommendedIndex).toBe('1.60')
    expect(advice.lensTypes).toEqual(['single-vision'])
    expect(advice.frameBand).toMatchObject({ fpdMin: 64, fpdMax: 80, targetFpd: 72 })
    expect(advice.rimlessOk).toBe(true)
    expect(advice.warnings).toEqual([])
  })

  it('steps the index up once for cylinder ≥ 2D and advises against rimless', () => {
    const record = withStages((stages) => {
      const subjective = stages.find(stage => stage.id === 'subjective')
      if (subjective?.id === 'subjective') {
        subjective.data.eyeL.finalCyl = -2.25
        subjective.data.eyeL.mpmvaCyl = -2.25
      }
    })
    const advice = recommendFor(examRecordToRx(record))
    expect(advice.recommendedIndex).toBe('1.74')
    expect(advice.rimlessOk).toBe(false)
    expect(advice.warnings.some(warning => warning.includes('无框'))).toBe(true)
  })

  it('suggests progressive for a presbyopic far user', () => {
    const record = withStages((stages) => {
      stages.push({ id: 'add', data: { addL: 1.0, addR: 1.0 } })
      const anamnesis = stages.find(stage => stage.id === 'anamnesis')
      if (anamnesis?.id === 'anamnesis') anamnesis.data.age = 52
    })
    const advice = recommendFor(examRecordToRx(record))
    expect(advice.lensTypes).toContain('progressive')
  })
})

describe('runDerive', () => {
  it('returns prescription plus advice for a clean record', () => {
    const outcome = runDerive(sample)
    expect(outcome.prescription).not.toBeNull()
    expect(outcome.recommendation?.recommendedIndex).toBe('1.60')
    expect(outcome.issues).toEqual([])
    expect(outcome.summary).toContain('处方已生成')
  })

  it('suppresses the prescription when validation fails', () => {
    const record = withStages(stages => stages.filter(stage => stage.id !== 'pdMeasure'))
    const outcome = runDerive(record)
    expect(outcome.prescription).toBeNull()
    expect(outcome.recommendation).toBeNull()
    expect(outcome.summary).toContain('验光记录不可用')
  })

  it('keeps the prescription with WARN notes attached', () => {
    const record = withStages(stages => stages.filter(stage => stage.id !== 'trial'))
    const outcome = runDerive(record)
    expect(outcome.prescription).not.toBeNull()
    expect(outcome.issues.some(issue => issue.level === 'WARN')).toBe(true)
    expect(outcome.summary).toContain('条提示')
  })
})
