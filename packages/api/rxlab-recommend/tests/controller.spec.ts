import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type { FittingRecommendation, Prescription } from '@deepseek-ai/dsh-rxlab-fitting/types'
import RecommendController from '../src/index.ts'
import { RECOMMEND_RULES_NAMESPACE } from '../src/rules.ts'
import type { FrameCandidate, LensCandidate } from '../src/types.ts'

/** Smallest real settings provider: the Service Definition owns resolution. */
class TestSettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

const prescription: Prescription = {
  age: 32,
  usage: 'all',
  pd: 64,
  pdL: 32,
  pdR: 32,
  eyeL: { sph: -3.25, cyl: -0.75, axis: 180 },
  eyeR: { sph: -3.0, cyl: -0.5, axis: 175 },
}

const advice: FittingRecommendation = {
  recommendedIndex: '1.60',
  lensTypes: ['single-vision'],
  frameBand: { fpdMin: 64, fpdMax: 80, maxDecentrationPerEye: 3, targetFpd: 72 },
  rimlessOk: true,
  warnings: [],
  summary: '建议 1.60 折射率',
}

const frame: FrameCandidate = { frameType: 'full', lensWidthA: 48, bridgeDbl: 16 }
const lens: LensCandidate = { index: 1.6, lensType: 'single', features: [] }

/** Boot a Context with a settings provider, then the recommend row. */
async function boot(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(TestSettings)
  await ctx.plugin(RecommendController)
  return ctx
}

/** Let queued plugin activations run. */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('RecommendController composition', () => {
  it('registers the restart-applied rules namespace', async () => {
    const ctx = await boot()
    const descriptor = ctx.settings.describe().find(entry => entry.ns === RECOMMEND_RULES_NAMESPACE)
    expect(descriptor?.applies).toBe('restart')
    expect(descriptor?.base).toMatchObject({ decentrationCapMm: 3, cylinderStepD: 2 })
  })

  it('validates frames and lenses through the Remote methods', async () => {
    const ctx = await boot()
    const frameReport = ctx.recommendController.validateFrame({ prescription, advice, frame })
    expect(frameReport.report.overall).toBe('OK')
    const lensReport = ctx.recommendController.validateLens({ prescription, advice, lens })
    expect(lensReport.report.overall).toBe('OK')
  })

  it('ranks candidates through the Remote method', async () => {
    const ctx = await boot()
    const value = ctx.recommendController.suggest({
      prescription,
      advice,
      candidates: { frames: [frame], lenses: [lens] },
    })
    expect(value.frames).toHaveLength(1)
    expect(value.lenses).toHaveLength(1)
    expect(value.reasons.length).toBeGreaterThan(0)
  })

  it('re-reads edited rules from the namespace', async () => {
    const ctx = await boot()
    await ctx.settings.update(RECOMMEND_RULES_NAMESPACE, { decentrationCapMm: 20 })
    const wide: FrameCandidate = { frameType: 'full', lensWidthA: 60, bridgeDbl: 20 }
    const report = ctx.recommendController.validateFrame({ prescription, advice, frame: wide })
    expect(report.report.checks.find(check => check.name === 'decentration')?.status).toBe('OK')
  })

  it('refuses an unusable rule edit', async () => {
    const ctx = await boot()
    await expect(ctx.settings.update(RECOMMEND_RULES_NAMESPACE, { indexLadder: [] }))
      .rejects.toThrow(/empty/)
  })

  it('falls back to defaults, then registers, when settings arrives later', async () => {
    const ctx = new Context()
    await ctx.plugin(RecommendController)
    const report = ctx.recommendController.validateFrame({ prescription, advice, frame })
    expect(report.report.overall).toBe('OK')

    await ctx.plugin(TestSettings)
    await flush()

    const descriptor = ctx.settings.describe().find(entry => entry.ns === RECOMMEND_RULES_NAMESPACE)
    expect(descriptor).toBeDefined()
  })
})
