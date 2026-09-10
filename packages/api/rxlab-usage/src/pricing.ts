/**
 * Pure route-pricing helpers for rxlab usage cost: a deployment-configured
 * table of per-token rates keyed by the provider/model route that
 * `deriveTurnTokenUsage` reports, and the exact cost of one turn's
 * provider-reported buckets under that table. Kept free of Cordis and storage
 * so the pricing rule is unit-testable.
 *
 * A turn carries one shared set of buckets across every billed attempt and
 * only the set of routes those attempts used, so an exact per-route cost
 * exists only when a turn has one route with a configured rate; otherwise the
 * cost is unavailable rather than guessed.
 * @module @deepseek-ai/dsh-rxlab-usage/src/pricing
 */

import type { TurnTokenUsage } from '@deepseek-ai/dsh-token-meter/client'

/** Cost per token for one route's four provider-reported buckets, in one currency. */
export interface RouteRate {
  readonly uncachedInput: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

/** Deployment-configured route rates sharing one currency. */
export interface PricingTable {
  readonly currency: string
  /** Route key `${provider}/${model}` → per-token rates. */
  readonly routes: Readonly<Record<string, RouteRate>>
}

/**
 * The table key for one provider/model route.
 * @param provider - provider route key reported by the token meter.
 * @param model - exact model id reported by the token meter.
 * @returns the lookup key shared by configuration and resolution.
 */
export function routeKey(provider: string, model: string): string {
  return `${provider}/${model}`
}

/**
 * The configured rate for one route.
 * @param table - the resolved pricing table.
 * @param provider - provider route key.
 * @param model - exact model id.
 * @returns the matching rate, or undefined when the route is not priced.
 */
export function rateFor(table: PricingTable, provider: string, model: string): RouteRate | undefined {
  return table.routes[routeKey(provider, model)]
}

/**
 * Exact cost of one completed turn under a pricing table.
 * @param usage - exact provider-reported accounting for one turn.
 * @param table - the resolved pricing table.
 * @returns the turn's cost, or undefined when the turn is not attributed to a
 *   single priced route (multiple routes, no route, or an unpriced route).
 */
export function turnCost(usage: TurnTokenUsage, table: PricingTable): number | undefined {
  const routes = usage.routes
  if (routes === undefined || routes.length !== 1) return undefined
  const route = routes[0]
  if (route === undefined) return undefined
  const rate = rateFor(table, route.provider, route.model)
  if (rate === undefined) return undefined
  const cost = usage.uncachedInputTokens * rate.uncachedInput
    + usage.outputTokens * rate.output
    + (usage.cacheReadTokens ?? 0) * rate.cacheRead
    + (usage.cacheWriteTokens ?? 0) * rate.cacheWrite
  return Number.isFinite(cost) ? cost : undefined
}
