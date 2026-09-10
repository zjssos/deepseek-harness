/**
 * The workbench-tunable rules behind the recommend engine, registered as the
 * `rxlab-recommend-rules` settings namespace. Every threshold — the refractive
 * index ladder, the FPD size band, the per-eye decentration cap, and the
 * cylinder step that raises the index — is a schema field so the settings
 * surface can edit it; the engine reads the resolved namespace value and never
 * carries a private constant.
 * @module @deepseek-ai/dsh-rxlab-recommend/src/rules
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace carrying the recommend rule knobs. */
export const RECOMMEND_RULES_NAMESPACE = 'rxlab-recommend-rules'

/** One rung of the refractive-index ladder: the worst power it covers. */
export interface IndexLadderEntry {
  /** Highest absolute meridional power (dioptres) this index serves. */
  maxPowerD: number
  /** Nominal index once the power reaches this rung. */
  index: number
}

/** Advised FPD window as offsets from the prescription's binocular PD. */
export interface SizeBandRule {
  /** Lower FPD offset in mm (`pd + minExtraMm`). */
  minExtraMm: number
  /** Upper FPD offset in mm (`pd + maxExtraMm`). */
  maxExtraMm: number
  /** Preferred FPD offset in mm used as the ranking target. */
  targetExtraMm: number
}

/** Every knob the recommend engine reads from the settings namespace. */
export interface RecommendRules {
  /** Ascending index ladder; the last rung is the ceiling. */
  indexLadder: IndexLadderEntry[]
  sizeBand: SizeBandRule
  /** Per-eye decentration upper bound in mm. */
  decentrationCapMm: number
  /** Cylinder magnitude (dioptres) at or above which the index steps up one rung. */
  cylinderStepD: number
}

/**
 * Shipped defaults, mirrored into the settings schema so an absent composition
 * base still resolves every field. These are simplified industry convention for
 * a decision aid, not a medical-device specification.
 */
export const DEFAULT_RECOMMEND_RULES: RecommendRules = {
  indexLadder: [
    { maxPowerD: 2, index: 1.56 },
    { maxPowerD: 4, index: 1.6 },
    { maxPowerD: 6, index: 1.67 },
    { maxPowerD: 40, index: 1.74 },
  ],
  sizeBand: { minExtraMm: 0, maxExtraMm: 16, targetExtraMm: 8 },
  decentrationCapMm: 3,
  cylinderStepD: 2,
}

/** Settings schema for `rxlab-recommend-rules`, with the shipped defaults. */
export const recommendRulesSchema: z<RecommendRules> = z.object({
  indexLadder: z.array(z.object({
    maxPowerD: z.number().default(2),
    index: z.number().default(1.56),
  })).default([...DEFAULT_RECOMMEND_RULES.indexLadder]),
  sizeBand: z.object({
    minExtraMm: z.number().default(0),
    maxExtraMm: z.number().default(16),
    targetExtraMm: z.number().default(8),
  }).default({ ...DEFAULT_RECOMMEND_RULES.sizeBand }),
  decentrationCapMm: z.number().default(DEFAULT_RECOMMEND_RULES.decentrationCapMm),
  cylinderStepD: z.number().default(DEFAULT_RECOMMEND_RULES.cylinderStepD),
})

/**
 * Reject a rule set the engine cannot act on: an empty or non-ascending index
 * ladder, an inverted size band, or a non-positive cap or step. Registered as
 * the namespace's cross-field `validate` so a bad edit is refused at the write
 * rather than silently changing fit advice.
 * @param rules - resolved namespace value, schema-valid by construction.
 * @throws {Error} when the ladder or a threshold is unusable.
 */
export function assertRecommendRules(rules: RecommendRules): void {
  if (rules.indexLadder.length === 0) {
    throw new Error('rxlab-recommend-rules: indexLadder must not be empty')
  }
  let previous = Number.NEGATIVE_INFINITY
  for (const entry of rules.indexLadder) {
    if (!(entry.maxPowerD > previous)) {
      throw new Error('rxlab-recommend-rules: indexLadder maxPowerD values must strictly ascend')
    }
    if (!(entry.index > 0)) {
      throw new Error('rxlab-recommend-rules: indexLadder indices must be positive')
    }
    previous = entry.maxPowerD
  }
  if (rules.sizeBand.minExtraMm > rules.sizeBand.maxExtraMm) {
    throw new Error('rxlab-recommend-rules: sizeBand minExtraMm must not exceed maxExtraMm')
  }
  if (!(rules.decentrationCapMm > 0)) {
    throw new Error('rxlab-recommend-rules: decentrationCapMm must be positive')
  }
  if (!(rules.cylinderStepD > 0)) {
    throw new Error('rxlab-recommend-rules: cylinderStepD must be positive')
  }
}
