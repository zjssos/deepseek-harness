/**
 * The deterministic refraction engine: validates a staged exam record
 * (process facts, the nine stages documented in the package README) and
 * derives the final glasses prescription plus lens/frame advice from it.
 * Pure functions over the wire vocabulary — no storage, no transport, no
 * zod; the controller validates at the wire boundary and then calls in.
 *
 * Prescription principles encoded here (industry convention, simplified for
 * the workbench): never over-minus (highest plus for maximum acuity), keep
 * cylinder at or below the refined value, roll trial-fit failures back in
 * +0.25 D steps, and keep additions (ADD) at or below the measured value.
 * @module @deepseek-ai/dsh-rxlab-fitting/src/prescription
 */

import type {
  AnamnesisData,
  ExamIssue,
  ExamRecordDraft,
  ExamStageEntry,
  ExamUsage,
  FittingDeriveValue,
  FittingRecommendation,
  FittingRecordSummary,
  Prescription,
  PrescriptionEye,
  PrescriptionLensKind,
  RecommendedIndex,
  SubjectiveEyeData,
} from './types.ts'

/** Tolerance below which two dioptre values count as equal. */
const EPS = 0.001

/** Stage ids in capture order; the model's closed id vocabulary. */
export const EXAM_STAGE_IDS = [
  'anamnesis', 'baseline', 'objective', 'cycloplegia', 'subjective',
  'binocular', 'trial', 'add', 'pdMeasure',
] as const

/** Stage titles for summaries and issue messages. */
const STAGE_TITLES: Readonly<Record<ExamStageEntry['id'], string>> = {
  anamnesis: '问诊',
  baseline: '基线',
  objective: '客观验光',
  cycloplegia: '调节放松',
  subjective: '主觉验光',
  binocular: '双眼平衡',
  trial: '试戴',
  add: '下加光',
  pdMeasure: '瞳距',
}

function eyeLabel(side: 'eyeL' | 'eyeR'): string {
  return side === 'eyeL' ? '左眼' : '右眼'
}

/** First entry under one stage id, or undefined when the stage is absent. */
export function findStage<T extends ExamStageEntry['id']>(
  record: ExamRecordDraft,
  id: T,
): Extract<ExamStageEntry, { id: T }> | undefined {
  return record.stages.find(stage => stage.id === id) as
    | Extract<ExamStageEntry, { id: T }>
    | undefined
}

function requiredReason(record: ExamRecordDraft, id: ExamStageEntry['id']): string | null {
  const anamnesis = findStage(record, 'anamnesis')?.data
  switch (id) {
    case 'anamnesis':
      return '问诊决定所有后续分支'
    case 'objective':
      return '主觉验光的初值来源'
    case 'cycloplegia':
      return anamnesis !== undefined && anamnesis.age < 16 && anamnesis.firstExam
        ? '16 岁以下首次验光必须散瞳或雾视，否则客观值含调节痉挛成分'
        : null
    case 'subjective':
      return '处方光度的直接来源'
    case 'binocular':
      return '双眼光度一致性必需'
    case 'pdMeasure':
      return '镜片加工定位必需'
    case 'baseline':
    case 'trial':
    case 'add':
      return null
  }
}

/** JCC cylinder reduction must compensate sphere by the spherical equivalent: Δsph = −Δcyl / 2. */
function checkJccCompensation(side: 'eyeL' | 'eyeR', eye: SubjectiveEyeData, issues: ExamIssue[]): void {
  if (eye.jccCylDelta === undefined || Math.abs(eye.jccCylDelta) < EPS) return
  const initialCyl = eye.mpmvaCyl ?? 0
  const finalCyl = eye.finalCyl ?? 0
  if (Math.abs(finalCyl - initialCyl - eye.jccCylDelta) > EPS) {
    issues.push({
      level: 'WARN',
      stage: 'subjective',
      message: `${eyeLabel(side)} JCC 柱镜修正量与前后柱镜不一致，请复核录入`,
    })
    return
  }
  const actualDeltaSph = eye.finalSph - eye.mpmvaSph
  const expectedDeltaSph = -eye.jccCylDelta / 2
  if (Math.abs(actualDeltaSph - expectedDeltaSph) > 0.25 + EPS) {
    issues.push({
      level: 'WARN',
      stage: 'subjective',
      message: `${eyeLabel(side)} 柱镜调整未按等效球镜原则补偿球镜（Δsph 期望 ${expectedDeltaSph.toFixed(2)}D）`,
    })
  }
}

/**
 * Validate one exam record: structural completeness plus the optical logic
 * checks. FAIL findings make the record unsafe to derive from; WARN findings
 * travel with the derived prescription as review notes.
 * @param record - staged exam record to validate.
 * @returns findings, empty when the record is clean.
 */
export function validateExamRecord(record: ExamRecordDraft): ExamIssue[] {
  const issues: ExamIssue[] = []

  const seen = new Set<ExamStageEntry['id']>()
  for (const stage of record.stages) {
    if (seen.has(stage.id)) {
      issues.push({ level: 'FAIL', stage: stage.id, message: '阶段重复记录' })
    }
    seen.add(stage.id)
  }

  for (const id of EXAM_STAGE_IDS) {
    const reason = requiredReason(record, id)
    if (!seen.has(id) && reason !== null) {
      issues.push({ level: 'FAIL', stage: id, message: `缺少必需阶段「${STAGE_TITLES[id]}」：${reason}` })
    }
  }

  const cycloplegia = findStage(record, 'cycloplegia')
  if (cycloplegia !== undefined && cycloplegia.data.method === 'none') {
    const reason = requiredReason(record, 'cycloplegia')
    if (reason !== null) {
      issues.push({ level: 'FAIL', stage: 'cycloplegia', message: `${reason}，但记录为未做（none）` })
    }
  }

  const subjective = findStage(record, 'subjective')
  const objective = findStage(record, 'objective')
  if (subjective !== undefined) {
    for (const side of ['eyeL', 'eyeR'] as const) {
      const eye = subjective.data[side]
      if (eye.finalCyl !== undefined && eye.finalAxis === undefined) {
        issues.push({ level: 'FAIL', stage: 'subjective', message: `${eyeLabel(side)}柱镜有度数但缺轴位` })
      }
      checkJccCompensation(side, eye, issues)
      if (objective !== undefined && eye.finalSph <= objective.data[side].sph - 0.5 + EPS) {
        issues.push({
          level: 'WARN',
          stage: 'subjective',
          message: `${eyeLabel(side)}主觉终值比客观读数更负超过 0.5D，警惕过矫（处方应宁正勿负）`,
        })
      }
    }
  }

  const binocular = findStage(record, 'binocular')
  if (binocular !== undefined && subjective !== undefined) {
    const pairs = [
      [binocular.data.finalSphL, subjective.data.eyeL.finalSph, '左眼'],
      [binocular.data.finalSphR, subjective.data.eyeR.finalSph, '右眼'],
    ] as const
    for (const [final, single, label] of pairs) {
      if (Math.abs(final - single) > 0.25 + EPS) {
        issues.push({
          level: 'WARN',
          stage: 'binocular',
          message: `${label}双眼终值与单眼终值差超过 0.25D，请复核平衡步骤`,
        })
      }
    }
  }

  const trial = findStage(record, 'trial')
  if (trial === undefined) {
    issues.push({ level: 'WARN', stage: 'trial', message: '未记录试戴结果，处方可行性与适应风险未知' })
  } else {
    const rollback = trial.data.rollbackDiopters ?? 0
    if (rollback > EPS && Math.abs(rollback * 4 - Math.round(rollback * 4)) > EPS) {
      issues.push({ level: 'FAIL', stage: 'trial', message: '试戴回退幅度应为 0.25D 的整数倍' })
    }
    if (trial.data.performed && trial.data.tolerated === false) {
      issues.push({
        level: 'WARN',
        stage: 'trial',
        message: `试戴不适应，已回退 ${rollback}D；建议适应期后复查`,
      })
    }
  }

  const anamnesis = findStage(record, 'anamnesis')
  if (anamnesis !== undefined && anamnesis.data.age >= 45 && !seen.has('add')) {
    issues.push({ level: 'WARN', stage: 'add', message: '45 岁以上未记录下加光（ADD）测定，近用需求可能未覆盖' })
  }

  return issues
}

/**
 * Derive the final prescription from a validated record. Requires the
 * anamnesis, subjective, binocular, and pdMeasure stages; trial rollback is
 * added back as plus sphere (宁正勿负). Call only after
 * {@link validateExamRecord} reports no FAIL findings.
 * @param record - validated staged exam record.
 * @returns the prescription.
 * @throws when a required stage is absent.
 */
export function examRecordToRx(record: ExamRecordDraft): Prescription {
  const anamnesis = needStage(record, 'anamnesis')
  const subjective = needStage(record, 'subjective')
  const binocular = needStage(record, 'binocular')
  const pdMeasure = needStage(record, 'pdMeasure')
  const add = findStage(record, 'add')
  const trial = findStage(record, 'trial')
  const rollback = trial?.data.rollbackDiopters ?? 0
  const addL = add !== undefined && add.data.addL > 0 ? add.data.addL : undefined
  const addR = add !== undefined && add.data.addR > 0 ? add.data.addR : undefined
  return {
    patient: record.patient,
    date: record.date,
    age: anamnesis.data.age,
    usage: anamnesis.data.usage,
    pd: pdMeasure.data.pdL + pdMeasure.data.pdR,
    pdL: pdMeasure.data.pdL,
    pdR: pdMeasure.data.pdR,
    pdH: pdMeasure.data.pdH,
    eyeL: {
      sph: binocular.data.finalSphL + rollback,
      cyl: subjective.data.eyeL.finalCyl,
      axis: subjective.data.eyeL.finalAxis,
      add: addL,
      va: subjective.data.eyeL.va,
    },
    eyeR: {
      sph: binocular.data.finalSphR + rollback,
      cyl: subjective.data.eyeR.finalCyl,
      axis: subjective.data.eyeR.finalAxis,
      add: addR,
      va: subjective.data.eyeR.va,
    },
    notes: add?.data.nearVa !== undefined ? `近视力 ${add.data.nearVa}` : undefined,
  }
}

function needStage<T extends 'anamnesis' | 'subjective' | 'binocular' | 'pdMeasure'>(
  record: ExamRecordDraft,
  id: T,
): Extract<ExamStageEntry, { id: T }> {
  const stage = findStage(record, id)
  if (stage === undefined) throw new Error(`推导处方缺少必需阶段: ${id}`)
  return stage
}

/** Largest absolute equivalent-sphere power across both eyes. */
function maxAbsPower(prescription: Prescription): number {
  const meridional = (eye: PrescriptionEye) => {
    const effective = eye.cyl !== undefined ? eye.sph + eye.cyl : eye.sph
    return Math.max(Math.abs(eye.sph), Math.abs(effective))
  }
  return Math.max(meridional(prescription.eyeL), meridional(prescription.eyeR))
}

function maxAbsCyl(prescription: Prescription): number {
  return Math.max(Math.abs(prescription.eyeL.cyl ?? 0), Math.abs(prescription.eyeR.cyl ?? 0))
}

/** Stock index ladder step above the given index, if any. */
function nextIndex(index: RecommendedIndex): RecommendedIndex | undefined {
  const ladder: readonly RecommendedIndex[] = ['1.56', '1.60', '1.67', '1.74']
  const at = ladder.indexOf(index)
  return at >= 0 && at < ladder.length - 1 ? ladder[at + 1] : undefined
}

/**
 * Deterministic lens/frame advice for a derived prescription: refractive
 * index by worst power (cylinder ≥ 2D bumps one step), lens types by usage
 * and ADD, frame band from the binocular PD, and the rimless/half-rim
 * advisability by power and cylinder.
 * @param prescription - derived prescription.
 * @returns the recommendation.
 */
export function recommendFor(prescription: Prescription): FittingRecommendation {
  const warnings: string[] = []
  const power = maxAbsPower(prescription)
  let index: RecommendedIndex
  if (power <= 2) index = '1.56'
  else if (power <= 4) index = '1.60'
  else if (power <= 6) index = '1.67'
  else index = '1.74'
  if (maxAbsCyl(prescription) >= 2 && index !== '1.74') {
    const up = nextIndex(index)
    if (up !== undefined) {
      index = up
      warnings.push(`散光≥2D，折射率升至 ${up}`)
    }
  }

  const usage: ExamUsage = prescription.usage ?? 'far'
  const add = Math.max(prescription.eyeL.add ?? 0, prescription.eyeR.add ?? 0)
  const presbyopia = add >= 0.75
  const lensTypes: PrescriptionLensKind[] = ['single-vision']
  if (presbyopia) {
    if (usage === 'near') lensTypes.push('reading')
    else if (usage === 'computer') lensTypes.push('office')
    else lensTypes.push('progressive')
  } else if (usage === 'near' || usage === 'computer') {
    lensTypes.push('office')
  }

  const pd = prescription.pd ?? 60
  const fpdMin = Math.max(56, pd)
  const fpdMax = pd + 16
  const targetFpd = pd + 8

  const rimlessOk = power < 6 && maxAbsCyl(prescription) < 2
  if (!rimlessOk) warnings.push('光度或散光较高，无框/半框装配边缘厚度与变形风险大，建议全框')
  if (power >= 8) warnings.push('度数较深（-8D 量级），建议定制车房片并注意镜片厚度')

  return {
    recommendedIndex: index,
    lensTypes,
    frameBand: { fpdMin, fpdMax, maxDecentrationPerEye: 3, targetFpd },
    rimlessOk,
    warnings,
    summary: `建议 ${index} 折射率${lensTypes.length > 1 ? ` / ${lensTypes.join('/')}` : ''}；双眼瞳距 ${pd}mm，镜架 FPD ${fpdMin}-${fpdMax}mm（目标 ${targetFpd}）`,
  }
}

/**
 * Full derive pipeline: validate, derive the prescription and advice, and
 * summarize. FAIL findings suppress the prescription (null) — an incomplete
 * or self-contradictory record never reaches the fitting flow.
 * @param record - staged exam record to derive from.
 * @returns the derive value.
 */
export function runDerive(record: ExamRecordDraft): FittingDeriveValue {
  const issues = validateExamRecord(record)
  const fails = issues.filter(issue => issue.level === 'FAIL')
  if (fails.length > 0) {
    return {
      prescription: null,
      issues,
      recommendation: null,
      summary: `验光记录不可用：${fails.map(issue => issue.message).join('；')}`,
    }
  }
  const prescription = examRecordToRx(record)
  const recommendation = recommendFor(prescription)
  const warns = issues.filter(issue => issue.level === 'WARN')
  const summary = warns.length > 0
    ? `处方已生成，注意 ${warns.length} 条提示：${warns.map(issue => issue.message).join('；')}`
    : `验光记录完整，处方已生成。${recommendation.summary}`
  return { prescription, issues, recommendation, summary }
}

/** Project one stored record onto its list-row summary. */
export function summarizeRecord(record: {
  readonly id: FittingRecordSummary['id']
  readonly updatedAt: string
  readonly patient?: string | undefined
  readonly date?: string | undefined
  readonly stages: readonly ExamStageEntry[]
}): FittingRecordSummary {
  const anamnesis = findStage({ stages: record.stages }, 'anamnesis')?.data as AnamnesisData | undefined
  return {
    id: record.id,
    ...(record.patient === undefined ? {} : { patient: record.patient }),
    ...(record.date === undefined ? {} : { date: record.date }),
    ...(anamnesis === undefined ? {} : { age: anamnesis.age }),
    ...(anamnesis === undefined ? {} : { usage: anamnesis.usage }),
    updatedAt: record.updatedAt,
  }
}
