/**
 * Host Recommend Remote owner for the rxlab workbench: the stateless
 * `rxlabRecommend` namespace over the pure candidate-validation engine. It owns
 * no storage; it registers the `rxlab-recommend-rules` settings namespace and
 * resolves the rule knobs from it on every call, so the settings surface can
 * retune the engine without a code change. This package mounts its own
 * namespace on the Client side (see `src/client/index.ts`) and, like the other
 * rxlab business rows, never joins the platform `api-remotes` assembly.
 * @module @deepseek-ai/dsh-rxlab-recommend
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { suggestCandidates, validateFrameReport, validateLensReport } from './engine.ts'
import {
  assertRecommendRules,
  DEFAULT_RECOMMEND_RULES,
  RECOMMEND_RULES_NAMESPACE,
  recommendRulesSchema,
  type RecommendRules,
} from './rules.ts'
import type {
  SuggestRequest,
  SuggestValue,
  ValidateFrameRequest,
  ValidateFrameValue,
  ValidateLensRequest,
  ValidateLensValue,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Stateless Host business API and Remote namespace owner for rxlab recommendation. */
    recommendController: RecommendController
  }
}

/**
 * Host service backing the generated `ctx.remote.rxlabRecommend` namespace.
 * It has no service dependency of its own; when the settings provider is
 * composed it registers the rules namespace and reads the resolved value,
 * otherwise it serves the schema defaults.
 */
export class RecommendController extends TypertRemoteService {
  static inject: string[] = []

  private rulesScope?: SettingsScope<RecommendRules>

  /**
   * Register the recommend namespace on the Typert Gateway.
   * @param ctx - Host context, optionally carrying the settings provider.
   */
  constructor(ctx: Context) {
    super(ctx, 'recommendController', { namespace: 'rxlabRecommend' })
  }

  /**
   * Register the rules namespace against the settings provider. Runs at
   * activation when the provider is already composed, and from an injected
   * callback when it arrives later; the namespace is an effect on this fiber.
   */
  protected [Service.init](): void {
    const settings = this.ctx.get('settings')
    if (settings !== undefined) {
      this.registerRules(settings)
      return
    }
    this.ctx.inject(['settings'], (ctx) => {
      this.registerRules(ctx.settings)
    })
  }

  /**
   * Validate one frame candidate against a prescription and its fitting advice.
   * @param request - prescription, advice, and the frame to check.
   * @returns the compatibility report.
   */
  @Remote('validateFrame')
  validateFrame(request: ValidateFrameRequest): ValidateFrameValue {
    return {
      report: validateFrameReport(request.prescription, request.advice, request.frame, this.rules()),
    }
  }

  /**
   * Validate one lens candidate against a prescription and its fitting advice.
   * @param request - prescription, advice, and the lens to check.
   * @returns the compatibility report.
   */
  @Remote('validateLens')
  validateLens(request: ValidateLensRequest): ValidateLensValue {
    return {
      report: validateLensReport(request.prescription, request.advice, request.lens, this.rules()),
    }
  }

  /**
   * Rank frame and lens candidates for one prescription and its fitting advice.
   * @param request - prescription, advice, candidates, and optional style preference.
   * @returns ranked candidates plus the reasons behind the ordering.
   */
  @Remote('suggest')
  suggest(request: SuggestRequest): SuggestValue {
    return suggestCandidates(
      request.prescription,
      request.advice,
      request.candidates,
      request.preference,
      this.rules(),
    )
  }

  /** Register the rules namespace; the schema supplies every default. */
  private registerRules(settings: SettingsProvider): void {
    this.rulesScope = settings.register(RECOMMEND_RULES_NAMESPACE, recommendRulesSchema, {
      base: DEFAULT_RECOMMEND_RULES,
      applies: 'restart',
      validate: assertRecommendRules,
    })
  }

  /** Resolved rule knobs, or the shipped defaults when settings is absent. */
  private rules(): RecommendRules {
    return this.rulesScope?.get() ?? DEFAULT_RECOMMEND_RULES
  }
}

export default RecommendController
