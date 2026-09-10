import { describe, expect, it } from 'vitest'
import type { FittingRecommendation, Prescription } from '@deepseek-ai/dsh-rxlab-fitting/types'
import {
  frameBandFor,
  maxAbsCyl,
  maxAbsPower,
  requiredIndexFor,
  suggestCandidates,
  validateFrameReport,
  validateLensReport,
} from '../src/engine.ts'
import { DEFAULT_RECOMMEND_RULES, assertRecommendRules, type RecommendRules } from '../src/rules.ts'
import type { FrameCandidate, LensCandidate } from '../src/types.ts'

const rules = DEFAULT_RECOMMEND_RULES

const prescription: Prescription = {
  age: 32,
  usage: 'all',
  pd: 64,
  pdL: 32,
  pdR: 32,
  eyeL: { sph: -3.25, cyl: -0.75, axis: 180, va: '1.0' },
  eyeR: { sph: -3.0, cyl: -0.5, axis: 175, va: '1.0' },
}

const advice: FittingRecommendation = {
  recommendedIndex: '1.60',
  lensTypes: ['single-vision'],
  frameBand: { fpdMin: 64, fpdMax: 80, maxDecentrationPerEye: 3, targetFpd: 72 },
  rimlessOk: true,
  warnings: [],
  summary: '建议 1.60 折射率',
}

/** One full frame at a given FPD, with sensible defaults for the rest. */
function frame(fpd: number, overrides: Partial<FrameCandidate> = {}): FrameCandidate {
  return { frameType: 'full', lensWidthA: fpd - 16, bridgeDbl: 16, ...overrides }
}

describe('maxAbsPower / maxAbsCyl', () => {
  it('reads the worst meridional power and the worst cylinder', () => {
    expect(maxAbsPower(prescription)).toBeCloseTo(4.0)
    expect(maxAbsCyl(prescription)).toBeCloseTo(0.75)
  })

  it('uses the spherical-plus-cylinder meridian for high cylinder', () => {
    const high: Prescription = { ...prescription, eyeL: { sph: -1, cyl: -2.5 } }
    expect(maxAbsPower(high)).toBeCloseTo(3.5)
    expect(maxAbsCyl(high)).toBeCloseTo(2.5)
  })

  it('reads eyes that carry no cylinder', () => {
    const noCyl: Prescription = { ...prescription, eyeL: { sph: -2 }, eyeR: { sph: -1 } }
    expect(maxAbsPower(noCyl)).toBeCloseTo(2)
    expect(maxAbsCyl(noCyl)).toBeCloseTo(0)
  })
})

describe('frameBandFor', () => {
  it('derives the band from the monocular-PD sum', () => {
    expect(frameBandFor(prescription, rules)).toEqual({ fpdMin: 64, fpdMax: 80, targetFpd: 72 })
  })

  it('falls back to the binocular PD', () => {
    const rx: Prescription = { ...prescription, pdL: undefined, pdR: undefined, pd: 60 }
    expect(frameBandFor(rx, rules)).toEqual({ fpdMin: 60, fpdMax: 76, targetFpd: 68 })
  })

  it('returns undefined without any PD', () => {
    const rx: Prescription = { ...prescription, pd: undefined, pdL: undefined, pdR: undefined }
    expect(frameBandFor(rx, rules)).toBeUndefined()
  })

  it('honors a custom size band', () => {
    const custom: RecommendRules = { ...rules, sizeBand: { minExtraMm: 2, maxExtraMm: 10, targetExtraMm: 6 } }
    expect(frameBandFor(prescription, custom)).toEqual({ fpdMin: 66, fpdMax: 74, targetFpd: 70 })
  })
})

describe('requiredIndexFor', () => {
  it('picks the ladder rung by worst power', () => {
    expect(requiredIndexFor(prescription, rules)).toBe(1.6)
  })

  it('steps up one rung for a high-power eye', () => {
    const rx: Prescription = { ...prescription, eyeL: { sph: -7, cyl: 0 } }
    expect(requiredIndexFor(rx, rules)).toBe(1.74)
  })

  it('steps up one rung once the cylinder reaches the threshold', () => {
    const rx: Prescription = { ...prescription, eyeL: { sph: -3, cyl: -2.25 } }
    expect(requiredIndexFor(rx, rules)).toBe(1.74)
  })

  it('does not step past the ceiling', () => {
    const rx: Prescription = { ...prescription, eyeL: { sph: -9, cyl: -3 } }
    expect(requiredIndexFor(rx, rules)).toBe(1.74)
  })

  it('clamps to the last rung above the ladder ceiling', () => {
    const rx: Prescription = { ...prescription, eyeL: { sph: -50, cyl: 0 } }
    expect(requiredIndexFor(rx, rules)).toBe(1.74)
  })

  it('throws on an empty ladder', () => {
    expect(() => requiredIndexFor(prescription, { ...rules, indexLadder: [] })).toThrow(/empty/)
  })
})

describe('validateFrameReport', () => {
  it('passes a well-fitted full frame', () => {
    const report = validateFrameReport(prescription, advice, frame(64), rules)
    expect(report.overall).toBe('OK')
    expect(report.checks.map(check => check.name)).toEqual(['decentration', 'frame-band', 'mounting'])
    expect(report.summary).toContain('全部通过')
  })

  it('fails a large frame on decentration and warns on the band', () => {
    const report = validateFrameReport(prescription, advice, frame(84), rules)
    expect(report.overall).toBe('FAIL')
    expect(report.checks.find(check => check.name === 'decentration')?.status).toBe('FAIL')
    expect(report.checks.find(check => check.name === 'frame-band')?.status).toBe('WARN')
  })

  it('fails a frame offset from a monocular PD', () => {
    const rx: Prescription = { ...prescription, pd: 64, pdL: 30, pdR: 34 }
    const report = validateFrameReport(rx, advice, frame(68), rules)
    expect(report.overall).toBe('FAIL')
    expect(report.checks[0]?.detail).toContain('超出')
  })

  it('fails decentration and warns the band when the PD is missing', () => {
    const rx: Prescription = { ...prescription, pd: undefined, pdL: undefined, pdR: undefined }
    const report = validateFrameReport(rx, advice, frame(64), rules)
    expect(report.overall).toBe('FAIL')
    expect(report.checks.find(check => check.name === 'decentration')?.detail).toContain('缺少瞳距')
    expect(report.checks.find(check => check.name === 'frame-band')?.status).toBe('WARN')
  })

  it('falls back to the binocular half when only the binocular PD is present', () => {
    const rx: Prescription = { ...prescription, pd: 64, pdL: undefined, pdR: undefined }
    const report = validateFrameReport(rx, advice, frame(64), rules)
    expect(report.overall).toBe('OK')
  })

  it('fails a rimless mount at high power', () => {
    const rx: Prescription = { ...prescription, eyeL: { sph: -7, cyl: 0 } }
    const report = validateFrameReport(rx, { ...advice, rimlessOk: false }, frame(64, { frameType: 'rimless' }), rules)
    expect(report.overall).toBe('FAIL')
    expect(report.checks.find(check => check.name === 'mounting')?.detail).toContain('全框')
  })

  it('fails a half mount when the advice already vetoes rimless', () => {
    const report = validateFrameReport(prescription, { ...advice, rimlessOk: false }, frame(64, { frameType: 'half' }), rules)
    expect(report.overall).toBe('FAIL')
  })

  it('allows a non-full mount at low power when the advice permits it', () => {
    const report = validateFrameReport(prescription, advice, frame(64, { frameType: 'half' }), rules)
    expect(report.overall).toBe('OK')
    expect(report.checks.find(check => check.name === 'mounting')?.status).toBe('OK')
  })
})

describe('validateLensReport', () => {
  const lens = (overrides: Partial<LensCandidate> = {}): LensCandidate =>
    ({ index: 1.6, lensType: 'single', features: [], ...overrides })

  it('passes a lens meeting index, form, and features', () => {
    const report = validateLensReport(prescription, advice, lens(), rules)
    expect(report.overall).toBe('OK')
  })

  it('fails a lens below the required index', () => {
    const report = validateLensReport(prescription, advice, lens({ index: 1.56 }), rules)
    expect(report.overall).toBe('FAIL')
    expect(report.checks.find(check => check.name === 'index')?.detail).toContain('低于要求')
  })

  it('warns a lens form outside the advice', () => {
    const report = validateLensReport(prescription, advice, lens({ lensType: 'progressive' }), rules)
    expect(report.overall).toBe('WARN')
    expect(report.checks.find(check => check.name === 'lens-type')?.status).toBe('WARN')
  })

  it('warns a missing usage feature for a computer prescription', () => {
    const rx: Prescription = { ...prescription, usage: 'computer' }
    const report = validateLensReport(rx, advice, lens(), rules)
    expect(report.checks.find(check => check.name === 'features')?.detail).toContain('blue-light')
  })

  it('passes when the usage feature is present', () => {
    const rx: Prescription = { ...prescription, usage: 'outdoor' }
    const report = validateLensReport(rx, advice, lens({ features: ['UV'] }), rules)
    expect(report.checks.find(check => check.name === 'features')?.status).toBe('OK')
  })
})

describe('suggestCandidates', () => {
  const near: FrameCandidate = frame(72)
  const far: FrameCandidate = frame(84, { shape: '方框' })
  const lensOk: LensCandidate = { index: 1.6, lensType: 'single', features: [] }
  const lensLow: LensCandidate = { index: 1.56, lensType: 'single', features: [] }

  it('ranks the closer frame first', () => {
    const value = suggestCandidates(prescription, advice, { frames: [far, near] }, undefined, rules)
    expect((value.frames[0]?.candidate as FrameCandidate).lensWidthA).toBe(near.lensWidthA)
    expect(value.frames[0]?.score).toBeGreaterThan(value.frames[1]?.score ?? 0)
    expect(value.reasons.length).toBeGreaterThan(0)
  })

  it('reports empty candidate sides explicitly', () => {
    const value = suggestCandidates(prescription, advice, {}, undefined, rules)
    expect(value.frames).toEqual([])
    expect(value.lenses).toEqual([])
    expect(value.reasons).toContain('未提供镜架候选')
    expect(value.reasons).toContain('未提供镜片候选')
  })

  it('scores a style preference match above a mismatch', () => {
    const styled: FrameCandidate = frame(72, { shape: '圆框' })
    const base = suggestCandidates(prescription, advice, { frames: [frame(72), styled] }, undefined, rules)
    const preferred = suggestCandidates(
      prescription,
      advice,
      { frames: [frame(72), styled] },
      { shapePref: '圆框' },
      rules,
    )
    expect(preferred.frames[0]?.score).toBe((base.frames[0]?.score ?? 0) + 10)
    expect(preferred.reasons).toContain('已按偏好形状「圆框」加权')
  })

  it('weighted preference also credits the mount type and records it', () => {
    const half = frame(72, { frameType: 'half' })
    const value = suggestCandidates(
      prescription,
      advice,
      { frames: [half] },
      { rimTypePref: 'half' },
      rules,
    )
    expect(value.reasons).toContain('已按偏好框型「half」加权')
  })

  it('ranks lenses and keeps the failing candidate below the passing one', () => {
    const value = suggestCandidates(prescription, advice, { lenses: [lensLow, lensOk] }, undefined, rules)
    expect(value.lenses[0]?.candidate).toEqual(lensOk)
    expect(value.lenses[0]?.score).toBeGreaterThan(value.lenses[1]?.score ?? 0)
    expect(value.lenses[1]?.report.overall).toBe('FAIL')
  })
})

describe('suggestCandidates scoring paths', () => {
  it('scores a WARN lens and credits the usage feature', () => {
    const rx: Prescription = { ...prescription, usage: 'computer' }
    const lens: LensCandidate = { index: 1.6, lensType: 'progressive', features: ['blue-light'] }
    const value = suggestCandidates(rx, advice, { lenses: [lens] }, undefined, rules)
    expect(value.lenses[0]?.report.overall).toBe('WARN')
    expect(value.lenses[0]?.score).toBeGreaterThan(60)
  })

  it('scores without a band when the PD is missing', () => {
    const rx: Prescription = { ...prescription, pd: undefined, pdL: undefined, pdR: undefined }
    const value = suggestCandidates(rx, advice, { frames: [frame(64)] }, undefined, rules)
    expect(value.frames[0]?.score).toBe(0)
    expect(value.reasons.some(reason => reason.includes('未提供镜片候选'))).toBe(true)
  })

  it('does not credit a mismatched shape or mount preference', () => {
    const square = frame(64, { shape: '方框' })
    const value = suggestCandidates(
      prescription,
      advice,
      { frames: [square] },
      { shapePref: '圆框', rimTypePref: 'rimless' },
      rules,
    )
    expect(value.frames[0]?.score).toBe(112)
  })
})

describe('assertRecommendRules', () => {
  it('accepts the shipped defaults', () => {
    expect(() => { assertRecommendRules(rules) }).not.toThrow()
  })

  it('rejects an empty ladder', () => {
    expect(() => { assertRecommendRules({ ...rules, indexLadder: [] }) }).toThrow(/empty/)
  })

  it('rejects a non-ascending ladder', () => {
    expect(() => {
      assertRecommendRules({ ...rules, indexLadder: [{ maxPowerD: 4, index: 1.6 }, { maxPowerD: 4, index: 1.67 }] })
    }).toThrow(/ascend/)
  })

  it('rejects a non-positive ladder index', () => {
    expect(() => {
      assertRecommendRules({ ...rules, indexLadder: [{ maxPowerD: 2, index: 0 }] })
    }).toThrow(/positive/)
  })

  it('rejects an inverted size band', () => {
    expect(() => {
      assertRecommendRules({ ...rules, sizeBand: { minExtraMm: 12, maxExtraMm: 4, targetExtraMm: 8 } })
    }).toThrow(/sizeBand/)
  })

  it('rejects a non-positive cap or step', () => {
    expect(() => { assertRecommendRules({ ...rules, decentrationCapMm: 0 }) }).toThrow(/decentrationCapMm/)
    expect(() => { assertRecommendRules({ ...rules, cylinderStepD: 0 }) }).toThrow(/cylinderStepD/)
  })
})
