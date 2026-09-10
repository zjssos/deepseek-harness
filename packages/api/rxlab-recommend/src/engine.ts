/**
 * The deterministic recommend engine: pure functions over the wire vocabulary
 * of `types.ts` and the resolved rules of `rules.ts`. It validates one frame or
 * lens candidate against a prescription and its fitting advice — frame
 * geometry (band + per-eye decentration), the non-full mount edge risk, the
 * index floor, the lens form, and feature coverage — and ranks candidate sets.
 * No storage, transport, or settings lookup; the controller resolves the rules
 * and calls in, so every rule is testable without a Cordis context.
 *
 * Recommend consumes the fitting engine's already-derived target
 * (`FittingRecommendation`); the index floor is the stricter of that advice and
 * the ladder position the rules recompute, so a stale or weaker advice cannot
 * lower the bar.
 * @module @deepseek-ai/dsh-rxlab-recommend/src/engine
 */

import type {
  FittingRecommendation,
  Prescription,
  PrescriptionEye,
  PrescriptionLensKind,
} from '@deepseek-ai/dsh-rxlab-fitting/types'
import type { RecommendRules } from './rules.ts'
import type {
  CandidateLensType,
  CompatibilityCheck,
  CompatibilityReport,
  FrameCandidate,
  FrameMountType,
  FrameSizeBand,
  LensCandidate,
  RankedCandidate,
  SuggestCandidates,
  SuggestValue,
  ConsumerStylePreference,
} from './types.ts'

/** Tolerance below which two millimetre or dioptre values count as equal. */
const EPS = 1e-6

/**
 * Worst absolute meridional power (dioptres) across both eyes.
 * @param prescription - derived prescription.
 * @returns the largest absolute sphere or spherical-equivalent power.
 */
export function maxAbsPower(prescription: Prescription): number {
  const meridional = (eye: PrescriptionEye): number => {
    const effective = eye.cyl !== undefined ? eye.sph + eye.cyl : eye.sph
    return Math.max(Math.abs(eye.sph), Math.abs(effective))
  }
  return Math.max(meridional(prescription.eyeL), meridional(prescription.eyeR))
}

/**
 * Worst absolute cylinder (dioptres) across both eyes.
 * @param prescription - derived prescription.
 * @returns the largest absolute cylinder, 0 when neither eye records one.
 */
export function maxAbsCyl(prescription: Prescription): number {
  return Math.max(Math.abs(prescription.eyeL.cyl ?? 0), Math.abs(prescription.eyeR.cyl ?? 0))
}

/** Binocular PD, from the monocular sum or the reported binocular value. */
function binocularPd(prescription: Prescription): number | undefined {
  if (prescription.pdL !== undefined && prescription.pdR !== undefined) {
    return prescription.pdL + prescription.pdR
  }
  return prescription.pd
}

/** Per-eye PDs, from the monocular values or the binocular half, when known. */
function monocularPds(prescription: Prescription): { readonly left: number; readonly right: number } | undefined {
  if (prescription.pdL !== undefined && prescription.pdR !== undefined) {
    return { left: prescription.pdL, right: prescription.pdR }
  }
  const pd = prescription.pd
  return pd === undefined ? undefined : { left: pd / 2, right: pd / 2 }
}

/**
 * Advised FPD window from the prescription's binocular PD and the size-band
 * rule; undefined when the prescription records no PD.
 * @param prescription - derived prescription.
 * @param rules - resolved recommend rules.
 * @returns the FPD band, or undefined without a PD.
 */
export function frameBandFor(prescription: Prescription, rules: RecommendRules): FrameSizeBand | undefined {
  const pd = binocularPd(prescription)
  if (pd === undefined) return undefined
  const { minExtraMm, maxExtraMm, targetExtraMm } = rules.sizeBand
  return { fpdMin: pd + minExtraMm, fpdMax: pd + maxExtraMm, targetFpd: pd + targetExtraMm }
}

/**
 * Index rung the worst power lands on, stepped up one rung when the cylinder
 * reaches the configured threshold. The last ladder entry is the ceiling.
 * @param prescription - derived prescription.
 * @param rules - resolved recommend rules.
 * @returns the required nominal index.
 * @throws {Error} when the resolved ladder is empty (registration rejects it).
 */
export function requiredIndexFor(prescription: Prescription, rules: RecommendRules): number {
  const ladder = rules.indexLadder
  const power = maxAbsPower(prescription)
  let at = ladder.findIndex(entry => power <= entry.maxPowerD)
  if (at < 0) at = ladder.length - 1
  if (maxAbsCyl(prescription) >= rules.cylinderStepD && at < ladder.length - 1) at += 1
  const entry = ladder[at] ?? ladder[ladder.length - 1]
  if (entry === undefined) throw new Error('rxlab-recommend-rules: indexLadder is empty')
  return entry.index
}

/** Whether high power or cylinder makes a non-full mount optically risky. */
function rimlessRisk(prescription: Prescription): boolean {
  return maxAbsPower(prescription) >= 6 || maxAbsCyl(prescription) >= 2
}

/** Chinese mount label for report details. */
function mountLabel(type: FrameMountType): string {
  switch (type) {
    case 'full': return '全框'
    case 'half': return '半框'
    case 'rimless': return '无框'
  }
}

/** Map a candidate lens form onto the fitting engine's lens-kind vocabulary. */
function toFittingLensType(type: CandidateLensType): PrescriptionLensKind {
  return type === 'single' ? 'single-vision' : type
}

/** Feature tokens the prescription's usage calls for, lowercase. */
function recommendedFeatures(prescription: Prescription): string[] {
  const features: string[] = []
  if (prescription.usage === 'outdoor') features.push('uv')
  if (prescription.usage === 'computer') features.push('blue-light')
  return features
}

/** Aggregate a check list into the report, naming the non-OK details. */
function reportOf(checks: CompatibilityCheck[], subject: string): CompatibilityReport {
  const overall = checks.some(check => check.status === 'FAIL')
    ? 'FAIL'
    : checks.some(check => check.status === 'WARN')
      ? 'WARN'
      : 'OK'
  const details = checks.filter(check => check.status !== 'OK').map(check => check.detail)
  return {
    overall,
    checks,
    summary: details.length === 0 ? `${subject}：全部通过` : `${subject}：${overall} — ${details.join('；')}`,
  }
}

/** FPD (lens width + bridge) of one frame candidate. */
function fpdOf(frame: FrameCandidate): number {
  return frame.lensWidthA + frame.bridgeDbl
}

/**
 * Validate one frame candidate: per-eye decentration against the cap, FPD
 * against the PD-derived band, and the non-full mount edge risk. A missing PD
 * fails the decentration check rather than skipping it.
 * @param prescription - derived prescription.
 * @param advice - fitting advice; its `rimlessOk` can veto a non-full mount.
 * @param frame - candidate to check.
 * @param rules - resolved recommend rules.
 * @returns the compatibility report.
 */
export function validateFrameReport(
  prescription: Prescription,
  advice: FittingRecommendation,
  frame: FrameCandidate,
  rules: RecommendRules,
): CompatibilityReport {
  const checks: CompatibilityCheck[] = []
  const fpd = fpdOf(frame)

  const pds = monocularPds(prescription)
  if (pds === undefined) {
    checks.push({ name: 'decentration', status: 'FAIL', detail: '缺少瞳距（pd/pdL/pdR），无法计算移心量' })
  } else {
    const cap = rules.decentrationCapMm
    const left = Math.abs(fpd / 2 - pds.left)
    const right = Math.abs(fpd / 2 - pds.right)
    const worst = Math.max(left, right)
    if (worst <= cap + EPS) {
      checks.push({
        name: 'decentration',
        status: 'OK',
        detail: `移心量 左 ${left.toFixed(1)}/右 ${right.toFixed(1)}mm，均在 ${String(cap)}mm 内`,
      })
    } else {
      checks.push({
        name: 'decentration',
        status: 'FAIL',
        detail: `移心量 左 ${left.toFixed(1)}/右 ${right.toFixed(1)}mm，超出 ${String(cap)}mm 上限，换更小 FPD`,
      })
    }
  }

  const band = frameBandFor(prescription, rules)
  if (band === undefined) {
    checks.push({ name: 'frame-band', status: 'WARN', detail: '缺少瞳距，无法评估镜架尺寸带' })
  } else if (fpd < band.fpdMin - EPS || fpd > band.fpdMax + EPS) {
    checks.push({
      name: 'frame-band',
      status: 'WARN',
      detail: `FPD ${fpd.toFixed(1)}mm 超出建议 ${band.fpdMin.toFixed(1)}-${band.fpdMax.toFixed(1)}mm`,
    })
  } else {
    checks.push({
      name: 'frame-band',
      status: 'OK',
      detail: `FPD ${fpd.toFixed(1)}mm 在建议 ${band.fpdMin.toFixed(1)}-${band.fpdMax.toFixed(1)}mm 内`,
    })
  }

  if (frame.frameType === 'full') {
    checks.push({ name: 'mounting', status: 'OK', detail: `${mountLabel(frame.frameType)}装配无高光度边缘风险` })
  } else if (!advice.rimlessOk || rimlessRisk(prescription)) {
    checks.push({
      name: 'mounting',
      status: 'FAIL',
      detail: `${mountLabel(frame.frameType)}装配在高光度/高散光下边缘厚度与变形风险大，建议全框`,
    })
  } else {
    checks.push({ name: 'mounting', status: 'OK', detail: `${mountLabel(frame.frameType)}装配可行` })
  }

  return reportOf(checks, '镜架校验')
}

/**
 * Validate one lens candidate: index at or above the required rung, a lens
 * form the advice lists, and the usage-recommended feature tokens present.
 * @param prescription - derived prescription.
 * @param advice - fitting advice; its `recommendedIndex` floors the requirement.
 * @param lens - candidate to check.
 * @param rules - resolved recommend rules.
 * @returns the compatibility report.
 */
export function validateLensReport(
  prescription: Prescription,
  advice: FittingRecommendation,
  lens: LensCandidate,
  rules: RecommendRules,
): CompatibilityReport {
  const checks: CompatibilityCheck[] = []

  const required = Math.max(Number(advice.recommendedIndex), requiredIndexFor(prescription, rules))
  checks.push(lens.index + EPS >= required
    ? { name: 'index', status: 'OK', detail: `折射率 ${String(lens.index)} ≥ 要求 ${String(required)}` }
    : { name: 'index', status: 'FAIL', detail: `折射率 ${String(lens.index)} 低于要求 ${String(required)}，高光度下镜片过厚` })

  const mapped = toFittingLensType(lens.lensType)
  checks.push(advice.lensTypes.includes(mapped)
    ? { name: 'lens-type', status: 'OK', detail: `片型 ${lens.lensType} 在建议范围内` }
    : { name: 'lens-type', status: 'WARN', detail: `片型 ${lens.lensType} 不在建议 ${advice.lensTypes.join('/')} 内` })

  const needed = recommendedFeatures(prescription)
  const missing = needed.filter(feature => !lens.features.some(token => token.toLowerCase() === feature))
  checks.push(missing.length === 0
    ? { name: 'features', status: 'OK', detail: needed.length === 0 ? '无额外功能要求' : `功能 ${needed.join('/')} 齐备` }
    : { name: 'features', status: 'WARN', detail: `缺少建议功能：${missing.join('/')}` })

  return reportOf(checks, '镜片校验')
}

/** Base score from the report status: OK 100, WARN 60, FAIL 0. */
function baseScore(report: CompatibilityReport): number {
  switch (report.overall) {
    case 'OK': return 100
    case 'WARN': return 60
    case 'FAIL': return 0
  }
}

/** Score one frame: report base, closeness to the target FPD, style bonuses. */
function scoreFrame(
  frame: FrameCandidate,
  report: CompatibilityReport,
  band: FrameSizeBand | undefined,
  preference: ConsumerStylePreference | undefined,
): number {
  let score = baseScore(report)
  if (band !== undefined) {
    score += Math.max(0, 20 - Math.abs(fpdOf(frame) - band.targetFpd))
  }
  if (preference?.shapePref !== undefined && frame.shape !== undefined
    && frame.shape.toLowerCase() === preference.shapePref.toLowerCase()) {
    score += 10
  }
  if (preference?.rimTypePref !== undefined && frame.frameType === preference.rimTypePref) {
    score += 10
  }
  return score
}

/** Score one lens: report base, index margin, and recommended-feature coverage. */
function scoreLens(
  lens: LensCandidate,
  report: CompatibilityReport,
  prescription: Prescription,
  advice: FittingRecommendation,
  rules: RecommendRules,
): number {
  let score = baseScore(report)
  const required = Math.max(Number(advice.recommendedIndex), requiredIndexFor(prescription, rules))
  score += Math.max(0, 15 - Math.max(0, lens.index - required) * 15)
  const covered = recommendedFeatures(prescription)
    .filter(feature => lens.features.some(token => token.toLowerCase() === feature)).length
  score += covered * 5
  return score
}

/** Stable descending sort by score; equal scores keep input order. */
function rank<T extends RankedCandidate>(candidates: T[]): T[] {
  return [...candidates].sort((left, right) => right.score - left.score)
}

/** Build the human-readable reasons behind one ranking result. */
function buildReasons(
  frames: readonly RankedCandidate[],
  lenses: readonly RankedCandidate[],
  band: FrameSizeBand | undefined,
  preference: ConsumerStylePreference | undefined,
): string[] {
  const reasons: string[] = []
  if (frames.length === 0) {
    reasons.push('未提供镜架候选')
  } else {
    const best = frames[0] as RankedCandidate
    const frame = best.candidate as FrameCandidate
    reasons.push(`镜架 ${String(frames.length)} 个候选，最优 FPD ${fpdOf(frame).toFixed(1)}mm（得分 ${String(best.score)}）`)
  }
  if (band !== undefined) {
    reasons.push(`建议 FPD 目标 ${band.targetFpd.toFixed(1)}mm（${band.fpdMin.toFixed(1)}-${band.fpdMax.toFixed(1)}mm）`)
  }
  if (lenses.length === 0) {
    reasons.push('未提供镜片候选')
  } else {
    const best = lenses[0] as RankedCandidate
    const lens = best.candidate as LensCandidate
    reasons.push(`镜片 ${String(lenses.length)} 个候选，最优折射率 ${String(lens.index)}（得分 ${String(best.score)}）`)
  }
  if (preference?.shapePref !== undefined) reasons.push(`已按偏好形状「${preference.shapePref}」加权`)
  if (preference?.rimTypePref !== undefined) reasons.push(`已按偏好框型「${preference.rimTypePref}」加权`)
  return reasons
}

/**
 * Validate and rank the supplied frame and lens candidates. Every candidate is
 * scored in input order (stable), so equal scores preserve the caller's order.
 * @param prescription - derived prescription.
 * @param advice - fitting advice used as the target.
 * @param candidates - frame and lens candidates to rank; either may be absent.
 * @param preference - optional consumer style preference folded into the scores.
 * @param rules - resolved recommend rules.
 * @returns ranked candidates plus the reasons behind the ordering.
 */
export function suggestCandidates(
  prescription: Prescription,
  advice: FittingRecommendation,
  candidates: SuggestCandidates,
  preference: ConsumerStylePreference | undefined,
  rules: RecommendRules,
): SuggestValue {
  const band = frameBandFor(prescription, rules)
  const frames = rank((candidates.frames ?? []).map((frame): RankedCandidate => {
    const report = validateFrameReport(prescription, advice, frame, rules)
    return { candidate: frame, report, score: scoreFrame(frame, report, band, preference) }
  }))
  const lenses = rank((candidates.lenses ?? []).map((lens): RankedCandidate => {
    const report = validateLensReport(prescription, advice, lens, rules)
    return { candidate: lens, report, score: scoreLens(lens, report, prescription, advice, rules) }
  }))
  return { frames, lenses, reasons: buildReasons(frames, lenses, band, preference) }
}
