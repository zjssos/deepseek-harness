/**
 * Public wire vocabulary of the rxlab fitting Remote namespace: the durable
 * `rxlab_fitting` exam-record model (the staged refraction process, nine
 * stages), the derived prescription, the derive report, and the list/get/
 * upsert/remove/derive requests and results. Types only — the zod schemas
 * that validate this model live in `domain.ts`, and the prescription rules
 * live in `prescription.ts`.
 *
 * Optional fields are declared `T | undefined` (not bare `T`): the domain
 * schemas model them the same way, so a parsed stored record is directly
 * assignable to its wire interfaces under `exactOptionalPropertyTypes`.
 * @module @deepseek-ai/dsh-rxlab-fitting/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Identifies one exam record (a generated uuid at create). */
export type FittingRecordId = Branded<'FittingRecordId'>

/** Why the corrected eye is used; drives lens-type and feature advice. */
export type ExamUsage = 'far' | 'near' | 'computer' | 'outdoor' | 'all'

/** Lens-type vocabulary a prescription can call for. */
export type PrescriptionLensKind = 'single-vision' | 'reading' | 'progressive' | 'bifocal' | 'office'

/** Suggested refractive index, matching the catalog lens vocabulary. */
export type RecommendedIndex = '1.56' | '1.60' | '1.67' | '1.74'

/** One sphere/cylinder reading for one eye, in dioptres. */
export interface RxReading {
  readonly sph: number
  readonly cyl?: number | undefined
  /** Cylinder axis in degrees, 0-180; required whenever cyl is present. */
  readonly axis?: number | undefined
}

/** A1 问诊/病史: the interview that decides every later branch. */
export interface AnamnesisData {
  readonly age: number
  /** First refraction ever; with age < 16 it requires a cycloplegia record. */
  readonly firstExam: boolean
  readonly usage: ExamUsage
  /** Subjective complaints such as 视疲劳/头痛; bounded free text. */
  readonly symptoms?: readonly string[] | undefined
  /** Years the current glasses have been worn. */
  readonly oldGlassesAgeYears?: number | undefined
  /** Systemic history that can shift refraction (diabetes, ...). */
  readonly systemicNotes?: string | undefined
}

/** One acuity reading table; absent eyes stay absent. */
export interface VaEntry {
  readonly farL?: string | undefined
  readonly farR?: string | undefined
  readonly nearL?: string | undefined
  readonly nearR?: string | undefined
}

/** A2/A3 基线: measured old-glass powers plus naked and corrected acuity. */
export interface BaselineData {
  readonly oldGlasses?: {
    readonly measured: boolean
    readonly sphL?: number | undefined
    readonly sphR?: number | undefined
    readonly cylL?: number | undefined
    readonly cylR?: number | undefined
    readonly axisL?: number | undefined
    readonly axisR?: number | undefined
  } | undefined
  /** Naked visual acuity, e.g. farL: '0.3'. */
  readonly nakedVa?: VaEntry | undefined
  /** Acuity through the old glasses. */
  readonly withOldVa?: VaEntry | undefined
}

/** B1 客观验光: averaged autorefractor or retinoscopy readings. */
export interface ObjectiveData {
  readonly method: 'autorefractor' | 'retinoscopy'
  readonly eyeL: RxReading
  readonly eyeR: RxReading
}

/** B2 调节放松: none / fogging / cycloplegia, with the reason. */
export interface CycloplegiaData {
  readonly method: 'none' | 'fogging' | 'cycloplegia'
  readonly reason?: string | undefined
}

/** C1-C5 单眼主觉验光: MPMVA → duochrome → JCC axis → JCC cyl → final. */
export interface SubjectiveEyeData {
  /** C1 single-eye MPMVA sphere before refinement. */
  readonly mpmvaSph: number
  readonly mpmvaCyl?: number | undefined
  /** C2 duochrome endpoint: red clear / green clear / balanced. */
  readonly duochrome?: 'red' | 'green' | 'balanced' | undefined
  /** C3 axis correction applied by JCC, within ±5°. */
  readonly jccAxisDelta?: number | undefined
  /** C4 cylinder correction applied by JCC (minus-cylinder notation). */
  readonly jccCylDelta?: number | undefined
  /** C5 refined single-eye endpoint; the prescription's cyl/axis source. */
  readonly finalSph: number
  readonly finalCyl?: number | undefined
  readonly finalAxis?: number | undefined
  readonly va?: string | undefined
}

/** C1-C5 for both eyes. */
export interface SubjectiveData {
  readonly eyeL: SubjectiveEyeData
  readonly eyeR: SubjectiveEyeData
}

/** C6/C7 双眼平衡与终验: balance nudges plus the binocular final spheres. */
export interface BinocularData {
  readonly balanceDeltaL: number
  readonly balanceDeltaR: number
  readonly finalSphL: number
  readonly finalSphR: number
  readonly duochrome?: 'red' | 'green' | 'balanced' | undefined
}

/** C8 试戴: tolerance and the rollback applied in 0.25 D steps. */
export interface TrialData {
  readonly performed: boolean
  readonly tolerated?: boolean | undefined
  /** Total both-eye rollback in dioptres; a non-negative multiple of 0.25. */
  readonly rollbackDiopters?: number | undefined
  readonly notes?: string | undefined
}

/** C9 下加光: near addition per eye (presbyopia) and near acuity. */
export interface AddData {
  readonly addL: number
  readonly addR: number
  readonly nearVa?: string | undefined
}

/** C10 瞳距/瞳高: monocular PD (required) and PH for progressive fitting. */
export interface PdMeasureData {
  readonly pdL: number
  readonly pdR: number
  readonly pdH?: number | undefined
  readonly instrument?: 'ruler' | 'pupillometer' | undefined
}

/** One staged exam entry; the closed id discriminant drives every switch. */
export type ExamStageEntry =
  | { readonly id: 'anamnesis'; readonly data: AnamnesisData }
  | { readonly id: 'baseline'; readonly data: BaselineData }
  | { readonly id: 'objective'; readonly data: ObjectiveData }
  | { readonly id: 'cycloplegia'; readonly data: CycloplegiaData }
  | { readonly id: 'subjective'; readonly data: SubjectiveData }
  | { readonly id: 'binocular'; readonly data: BinocularData }
  | { readonly id: 'trial'; readonly data: TrialData }
  | { readonly id: 'add'; readonly data: AddData }
  | { readonly id: 'pdMeasure'; readonly data: PdMeasureData }

/** The staged refraction process as captured; `stages` order is free. */
export interface ExamRecordDraft {
  readonly patient?: string | undefined
  readonly date?: string | undefined
  readonly stages: readonly ExamStageEntry[]
}

/** One durable exam record with server-minted id and write timestamp. */
export interface FittingRecord extends ExamRecordDraft {
  readonly id: FittingRecordId
  readonly updatedAt: string
}

/** List-row projection of one exam record. */
export interface FittingRecordSummary {
  readonly id: FittingRecordId
  readonly patient?: string | undefined
  readonly date?: string | undefined
  /** Interview age, when the anamnesis stage is present. */
  readonly age?: number | undefined
  /** Interview usage, when the anamnesis stage is present. */
  readonly usage?: ExamUsage | undefined
  readonly updatedAt: string
}

/** One derived prescription eye. */
export interface PrescriptionEye {
  readonly sph: number
  readonly cyl?: number | undefined
  readonly axis?: number | undefined
  readonly add?: number | undefined
  readonly va?: string | undefined
}

/** The final glasses prescription derived from an exam record. */
export interface Prescription {
  readonly patient?: string | undefined
  readonly date?: string | undefined
  readonly age?: number | undefined
  readonly usage?: ExamUsage | undefined
  /** Binocular PD in mm (the monocular sum). */
  readonly pd?: number | undefined
  readonly pdL?: number | undefined
  readonly pdR?: number | undefined
  readonly pdH?: number | undefined
  readonly eyeL: PrescriptionEye
  readonly eyeR: PrescriptionEye
  readonly notes?: string | undefined
}

/** One validation finding over an exam record. */
export interface ExamIssue {
  readonly level: 'FAIL' | 'WARN'
  /** Stage the finding points at, when it is stage-local. */
  readonly stage?: ExamStageEntry['id'] | undefined
  readonly message: string
}

/** Suggested frame-size band derived from the prescription PD. */
export interface FrameBand {
  readonly fpdMin: number
  readonly fpdMax: number
  /** Per-eye decentration cap the band assumes. */
  readonly maxDecentrationPerEye: number
  /** Preferred FPD (lensWidth + bridgeWidth) inside the band. */
  readonly targetFpd: number
}

/** Deterministic lens/frame advice derived from the prescription. */
export interface FittingRecommendation {
  readonly recommendedIndex: RecommendedIndex
  readonly lensTypes: readonly PrescriptionLensKind[]
  readonly frameBand: FrameBand
  /** Whether rimless / half-rim mounting stays optically advisable. */
  readonly rimlessOk: boolean
  readonly warnings: readonly string[]
  readonly summary: string
}

/** List exam records: optional free-text patient/date match. */
export interface FittingListRequest {
  readonly query?: string | undefined
}

/** Ordered summaries for one {@link FittingListRequest}, newest write first. */
export interface FittingListValue {
  readonly items: readonly FittingRecordSummary[]
}

/** Open one full exam record by id. */
export interface FittingGetRequest {
  readonly id: FittingRecordId
}

/** The full stored record for one {@link FittingGetRequest}. */
export interface FittingGetValue {
  readonly record: FittingRecord
}

/** Create or replace one exam record by its (optional) id. */
export interface FittingUpsertRequest {
  /** Draft to store. */
  readonly record: ExamRecordDraft
  /** Present to replace an existing record; absent mints a new one. */
  readonly id?: FittingRecordId | undefined
}

/** The stored record after one {@link FittingUpsertRequest}. */
export interface FittingUpsertValue {
  readonly record: FittingRecord
}

/** Remove one exam record by id. */
export interface FittingRemoveRequest {
  readonly id: FittingRecordId
}

/** Receipt after one {@link FittingRemoveRequest}. */
export interface FittingRemoveValue {
  /** Whether a record existed under the id (false never writes). */
  readonly removed: boolean
}

/** Derive a prescription from a staged record without storing anything. */
export interface FittingDeriveRequest {
  readonly record: ExamRecordDraft
}

/** One derive outcome: prescription plus validation and lens/frame advice. */
export interface FittingDeriveValue {
  /** null when the record fails validation and cannot derive safely. */
  readonly prescription: Prescription | null
  readonly issues: readonly ExamIssue[]
  /** null alongside {@link FittingDeriveValue.prescription}. */
  readonly recommendation: FittingRecommendation | null
  readonly summary: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No fitting exam record carries that identity. */
    'fitting/not-found': { readonly id: FittingRecordId }
  }
}
