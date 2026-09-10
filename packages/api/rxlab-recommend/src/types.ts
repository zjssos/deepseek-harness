/**
 * Browser-safe wire vocabulary of the rxlab recommend Remote namespace: the
 * frame and lens candidates a workbench operator can enter, the deterministic
 * compatibility report every validation returns, and the ranked suggestions
 * `suggest` produces. The prescription and fitting advice the engine scores
 * against are imported from `@deepseek-ai/dsh-rxlab-fitting/types` — recommend
 * validates candidates against that already-derived target instead of
 * re-deriving one. Types only — the pure rules live in `engine.ts` and the
 * settings schema lives in `rules.ts`.
 *
 * Optional fields are declared `T | undefined` (not bare `T`) so parsed values
 * stay assignable to these interfaces under `exactOptionalPropertyTypes`.
 * @module @deepseek-ai/dsh-rxlab-recommend/src/types
 */

import type { FittingRecommendation, Prescription } from '@deepseek-ai/dsh-rxlab-fitting/types'

/** How a frame is mounted around the lens; drives the edge-thickness risk. */
export type FrameMountType = 'full' | 'half' | 'rimless'

/** Lens-form vocabulary a candidate can carry. */
export type CandidateLensType = 'single' | 'reading' | 'progressive' | 'bifocal' | 'office'

/** Outcome of one compatibility check, also the report's aggregate status. */
export type CheckStatus = 'OK' | 'WARN' | 'FAIL'

/** One frame a customer might order, in the dimensions the engine checks. */
export interface FrameCandidate {
  /** Mount style; a non-`full` frame raises the high-power edge risk. */
  readonly frameType: FrameMountType
  /** Horizontal lens width A in mm; FPD is `lensWidthA + bridgeDbl`. */
  readonly lensWidthA: number
  /** Bridge (DBL) in mm; FPD is `lensWidthA + bridgeDbl`. */
  readonly bridgeDbl: number
  /** Total frame front width in mm, when the vendor publishes it. */
  readonly frameWidth?: number | undefined
  /** Temple length in mm. */
  readonly templeLength?: number | undefined
  /** Frame weight in grams. */
  readonly weight?: number | undefined
  /** Free-form shape label (e.g. 方框/圆框), matched against a style preference. */
  readonly shape?: string | undefined
}

/** One lens a customer might order, in the qualities the engine checks. */
export interface LensCandidate {
  /** Nominal refractive index (e.g. 1.60). */
  readonly index: number
  /** Lens form; `single` maps to the fitting engine's `single-vision`. */
  readonly lensType: CandidateLensType
  /** Feature tokens (e.g. uv, blue-light); compared case-insensitively. */
  readonly features: string[]
}

/** One named check inside a compatibility report. */
export interface CompatibilityCheck {
  /** Stable check id (`decentration`, `index`, ...). */
  readonly name: string
  readonly status: CheckStatus
  /** Human-readable result, naming the measured value and the threshold. */
  readonly detail: string
}

/** Deterministic validation outcome shared by frames, lenses, and stage checks. */
export interface CompatibilityReport {
  /** FAIL when any check fails, else WARN when any warns, else OK. */
  readonly overall: CheckStatus
  readonly checks: CompatibilityCheck[]
  /** One-line digest of the non-OK checks. */
  readonly summary: string
}

/** One scored candidate, ordered by {@link SuggestValue.frames} / `.lenses`. */
export interface RankedCandidate {
  readonly candidate: FrameCandidate | LensCandidate
  readonly report: CompatibilityReport
  /** Higher is better; 0 for a FAIL candidate. */
  readonly score: number
}

/** Consumer frame-style preference; the structural shape of the job profile's `style`. */
export interface ConsumerStylePreference {
  /** Preferred frame shape label. */
  readonly shapePref?: string | undefined
  /** Preferred mount style, matched against {@link FrameCandidate.frameType}. */
  readonly rimTypePref?: string | undefined
  /** Preferred color label; recorded but not scored (candidates carry no color). */
  readonly colorPref?: string | undefined
}

/** Advised FPD window derived from the prescription PD and the size-band rules. */
export interface FrameSizeBand {
  readonly fpdMin: number
  readonly fpdMax: number
  /** Preferred FPD used as the ranking target. */
  readonly targetFpd: number
}

/** Validate one frame against a prescription and its fitting advice. */
export interface ValidateFrameRequest {
  readonly prescription: Prescription
  readonly advice: FittingRecommendation
  readonly frame: FrameCandidate
}

/** The report for one {@link ValidateFrameRequest}. */
export interface ValidateFrameValue {
  readonly report: CompatibilityReport
}

/** Validate one lens against a prescription and its fitting advice. */
export interface ValidateLensRequest {
  readonly prescription: Prescription
  readonly advice: FittingRecommendation
  readonly lens: LensCandidate
}

/** The report for one {@link ValidateLensRequest}. */
export interface ValidateLensValue {
  readonly report: CompatibilityReport
}

/** Candidate sets one `suggest` call ranks; either side may be absent. */
export interface SuggestCandidates {
  readonly frames?: FrameCandidate[] | undefined
  readonly lenses?: LensCandidate[] | undefined
}

/** Rank frame and lens candidates for one prescription and fitting advice. */
export interface SuggestRequest {
  readonly prescription: Prescription
  readonly advice: FittingRecommendation
  readonly candidates: SuggestCandidates
  /** Optional consumer style preference folded into the scores. */
  readonly preference?: ConsumerStylePreference | undefined
}

/** Ranked candidates plus the reasons behind the ordering. */
export interface SuggestValue {
  readonly frames: RankedCandidate[]
  readonly lenses: RankedCandidate[]
  readonly reasons: string[]
}
