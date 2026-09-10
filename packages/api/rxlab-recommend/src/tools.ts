/**
 * Model-facing recommend tools: `recommend_validate_frame`,
 * `recommend_validate_lens`, and `recommend_suggest` call the stateless
 * `rxlabRecommend` service so an agent can check a customer's candidate frame
 * or lens against the derived prescription and advice, and rank a candidate
 * set, without leaving the workbench session. This module owns the tool
 * schemas, the concise model-facing text, and registration; the rules live in
 * the controller and the pure engine.
 * @module @deepseek-ai/dsh-rxlab-recommend/src/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { FittingRecommendation, Prescription } from '@deepseek-ai/dsh-rxlab-fitting/types'
import type { SuggestValue } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'rxlab-recommend-tools'

/** Services required by the recommend tool suite. */
export const inject = ['tools', 'recommendController']

/** Canonical JSON output the suggest tool declares; candidates stay opaque JSON. */
interface SuggestToolValue {
  frames: { candidate: JsonValue; report: JsonValue; score: number }[]
  lenses: { candidate: JsonValue; report: JsonValue; score: number }[]
  reasons: string[]
}

/** Frame candidate shape shared by the validate and suggest tools. */
const FRAME_PARAM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    frameType: { type: 'string', required: true, enum: ['full', 'half', 'rimless'], description: 'Mount style.' },
    lensWidthA: { type: 'number', required: true, description: 'Horizontal lens width A in mm.' },
    bridgeDbl: { type: 'number', required: true, description: 'Bridge (DBL) in mm.' },
    frameWidth: { type: 'number', description: 'Total frame front width in mm.' },
    templeLength: { type: 'number', description: 'Temple length in mm.' },
    weight: { type: 'number', description: 'Frame weight in grams.' },
    shape: { type: 'string', description: 'Frame shape label (方框/圆框…).' },
  },
} as const

/** Lens candidate shape shared by the validate and suggest tools. */
const LENS_PARAM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    index: { type: 'number', required: true, description: 'Nominal refractive index, e.g. 1.6.' },
    lensType: { type: 'string', required: true, enum: ['single', 'reading', 'progressive', 'bifocal', 'office'] },
    features: { type: 'array', required: true, items: { type: 'string' }, description: 'Feature tokens, e.g. uv, blue-light.' },
  },
} as const

/**
 * Render one `suggest` result as the model-facing text block.
 * @param value - ranked candidates plus the reasons behind the ordering.
 * @returns the reasons followed by one line per ranked candidate.
 */
export function formatSuggest(value: SuggestValue): string {
  const lines = [...value.reasons]
  for (const item of value.frames) {
    lines.push(`- 框 score=${String(item.score)} ${item.report.overall}: ${item.report.summary}`)
  }
  for (const item of value.lenses) {
    lines.push(`- 片 score=${String(item.score)} ${item.report.overall}: ${item.report.summary}`)
  }
  return lines.join('\n')
}

/**
 * Register the recommend validation and ranking tools. All registrations are
 * effect-scoped and unregister on plugin dispose.
 * @param ctx - context whose `tools` registry receives the registrations, with
 *   the recommend controller resolved.
 */
export function apply(ctx: Context): void {
  const controller = ctx.recommendController

  ctx.tools.register(defineTool({
    name: 'recommend_validate_frame',
    description: 'Check one candidate frame against a patient prescription and fitting advice; report decentration, size-band, and mount fit.',
    parameters: {
      prescription: { type: 'json', required: true, description: 'The derived prescription object.' },
      advice: { type: 'json', required: true, description: 'The fitting advice derived from that prescription.' },
      frame: { ...FRAME_PARAM, required: true, description: 'The candidate frame.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          report: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              overall: { type: 'string', required: true, enum: ['OK', 'WARN', 'FAIL'] },
              checks: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', required: true },
                    status: { type: 'string', required: true, enum: ['OK', 'WARN', 'FAIL'] },
                    detail: { type: 'string', required: true },
                  },
                },
              },
              summary: { type: 'string', required: true },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.report.summary }],
    },
    execute(args) {
      const value = controller.validateFrame({
        prescription: args.prescription as unknown as Prescription,
        advice: args.advice as unknown as FittingRecommendation,
        frame: args.frame,
      })
      return Promise.resolve({ report: value.report })
    },
    presentCall: () => ({ card: 'generic', title: '校验镜架适配' }),
  }))

  ctx.tools.register(defineTool({
    name: 'recommend_validate_lens',
    description: 'Check one candidate lens against a patient prescription and fitting advice; report index, lens-form, and feature fit.',
    parameters: {
      prescription: { type: 'json', required: true, description: 'The derived prescription object.' },
      advice: { type: 'json', required: true, description: 'The fitting advice derived from that prescription.' },
      lens: { ...LENS_PARAM, required: true, description: 'The candidate lens.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          report: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              overall: { type: 'string', required: true, enum: ['OK', 'WARN', 'FAIL'] },
              checks: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', required: true },
                    status: { type: 'string', required: true, enum: ['OK', 'WARN', 'FAIL'] },
                    detail: { type: 'string', required: true },
                  },
                },
              },
              summary: { type: 'string', required: true },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.report.summary }],
    },
    execute(args) {
      const value = controller.validateLens({
        prescription: args.prescription as unknown as Prescription,
        advice: args.advice as unknown as FittingRecommendation,
        lens: args.lens,
      })
      return Promise.resolve({ report: value.report })
    },
    presentCall: () => ({ card: 'generic', title: '校验镜片适配' }),
  }))

  ctx.tools.register(defineTool({
    name: 'recommend_suggest',
    description: 'Rank candidate frames and lenses for a prescription and fitting advice, returning each candidate with its compatibility report and score.',
    parameters: {
      prescription: { type: 'json', required: true, description: 'The derived prescription object.' },
      advice: { type: 'json', required: true, description: 'The fitting advice derived from that prescription.' },
      candidates: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          frames: { type: 'array', items: FRAME_PARAM, description: 'Frame candidates to rank.' },
          lenses: { type: 'array', items: LENS_PARAM, description: 'Lens candidates to rank.' },
        },
      },
      preference: {
        type: 'object',
        additionalProperties: false,
        properties: {
          shapePref: { type: 'string', description: 'Preferred frame shape label.' },
          rimTypePref: { type: 'string', description: 'Preferred mount style.' },
          colorPref: { type: 'string', description: 'Preferred color label (recorded, not scored).' },
        },
        description: 'Optional consumer style preference.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          frames: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                candidate: { type: 'json', required: true },
                report: { type: 'json', required: true },
                score: { type: 'number', required: true },
              },
            },
          },
          lenses: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                candidate: { type: 'json', required: true },
                report: { type: 'json', required: true },
                score: { type: 'number', required: true },
              },
            },
          },
          reasons: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatSuggest(value as unknown as SuggestValue) }],
    },
    execute(args) {
      const value = controller.suggest({
        prescription: args.prescription as unknown as Prescription,
        advice: args.advice as unknown as FittingRecommendation,
        candidates: args.candidates,
        preference: args.preference,
      })
      return Promise.resolve(value as unknown as SuggestToolValue)
    },
    presentCall: () => ({ card: 'generic', title: '推荐镜架与镜片' }),
  }))
}
