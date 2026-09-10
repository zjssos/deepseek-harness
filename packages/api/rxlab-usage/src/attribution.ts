/**
 * Pure turn-to-stage attribution for rxlab job usage: split a persisted session
 * log into completed turns, derive each turn's exact token accounting, and fold
 * it into the stage named by the most recent `job_write_stage` tool call at or
 * before the turn. Kept free of Cordis, storage, and I/O so the attribution
 * rule (which stage a turn belongs to, which buckets a job/stage owns, when a
 * cost is exact) is unit-testable against a constructed log.
 *
 * Stage order is the log's first-appearance order, so the result is a
 * deterministic function of the events; untouched stages are absent.
 * @module @deepseek-ai/dsh-rxlab-usage/src/attribution
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { deriveTurnTokenUsage } from '@deepseek-ai/dsh-token-meter/client'
import { addTotals, ZERO_TOTALS } from './aggregate.ts'
import { turnCost, type PricingTable } from './pricing.ts'
import type { StageId, StageUsage, UsageTotals } from './types.ts'

/** The six workbench stages, mirroring `@deepseek-ai/dsh-rxlab-job`'s vocabulary. */
export const STAGE_IDS = ['exam', 'frame', 'lens', 'fabrication', 'pickup', 'aftercare'] as const

/**
 * Whether a value is one of the six workbench stages.
 * @param value - candidate value from a tool-call argument or stored row.
 * @returns true when the value names a stage.
 */
export function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && (STAGE_IDS as readonly string[]).includes(value)
}

/** One stage's running aggregate while folding turns. */
interface StageFold {
  totals: UsageTotals
  cost: number
  /** False once any attributed turn lacked an exact route cost. */
  costComplete: boolean
  /** Whether at least one attributed turn carried provider usage. */
  hasUsage: boolean
}

/** One job's attributed token and cost totals across its session's turns. */
export interface JobUsageAttribution {
  readonly totals: UsageTotals
  /** Present only when every attributed turn priced exactly under the table. */
  readonly cost?: number | undefined
  /** The pricing table's currency; present exactly when `cost` is. */
  readonly currency?: string | undefined
  /** Stages in first-appearance order; only stages with provider usage appear. */
  readonly stages: readonly StageUsage[]
}

/**
 * Split a session log into completed turn windows, each from its `turn/start`
 * through the matching `turn/end`. An unclosed trailing turn or a malformed
 * nested start is dropped: `deriveTurnTokenUsage` requires a whole window.
 * @param events - the session's durable events in log order.
 * @returns one event window per completed turn.
 */
export function splitTurns(events: readonly SessionEvent[]): readonly (readonly SessionEvent[])[] {
  const turns: SessionEvent[][] = []
  let current: SessionEvent[] | undefined
  let currentTurn: number | undefined
  for (const event of events) {
    if (event.type === 'turn/start') {
      current = [event]
      currentTurn = event.data.turn
      continue
    }
    if (current === undefined) continue
    current.push(event)
    if (event.type === 'turn/end' && event.data.turn === currentTurn) {
      turns.push(current)
      current = undefined
      currentTurn = undefined
    }
  }
  return turns
}

/**
 * The stage one `job_write_stage` call wrote, when the call is that tool and
 * its model-authored JSON arguments name a known stage.
 * @param data - a `tool/call` event's data.
 * @returns the named stage, or undefined for any other tool, malformed
 *   arguments text, or a stage outside the six.
 */
function stageOfToolCall(data: { readonly name: string; readonly arguments: string }): StageId | undefined {
  if (data.name !== 'job_write_stage') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(data.arguments)
  } catch {
    // Model-authored tool arguments are JSON text on the tool boundary; malformed
    // text carries no stage, and nothing else can throw here.
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const stage: unknown = (parsed as Record<string, unknown>).stage
  return isStageId(stage) ? stage : undefined
}

/**
 * Fold one session's turns into job totals and per-stage usage, attributing
 * each completed turn to the stage of the most recent `job_write_stage` call at
 * or before the turn. Turns before any stage call contribute to the job total
 * but to no stage; turns whose token accounting cannot be proven are skipped.
 * @param events - the session's durable events in log order.
 * @param pricing - the resolved pricing table, or undefined to omit all cost.
 * @returns the job's totals, per-stage usage, and exact cost when available.
 */
export function attributeJobUsage(
  events: readonly SessionEvent[],
  pricing: PricingTable | undefined,
): JobUsageAttribution {
  const stageOrder: StageId[] = []
  const stages = new Map<StageId, StageFold>()
  let totals = ZERO_TOTALS
  let cost = 0
  let costComplete = true
  let hasUsage = false
  let currentStage: StageId | undefined

  for (const turn of splitTurns(events)) {
    for (const event of turn) {
      if (event.type !== 'tool/call') continue
      const stage = stageOfToolCall(event.data)
      if (stage !== undefined) currentStage = stage
    }
    const usage = deriveTurnTokenUsage(turn)
    if (usage === undefined) continue
    hasUsage = true
    const buckets: UsageTotals = {
      uncachedInputTokens: usage.uncachedInputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    }
    totals = addTotals(totals, buckets)
    const turnCostValue = pricing === undefined ? undefined : turnCost(usage, pricing)
    if (turnCostValue === undefined) costComplete = false
    else cost += turnCostValue
    if (currentStage === undefined) continue
    let fold = stages.get(currentStage)
    if (fold === undefined) {
      fold = { totals: ZERO_TOTALS, cost: 0, costComplete: true, hasUsage: false }
      stages.set(currentStage, fold)
      stageOrder.push(currentStage)
    }
    fold.totals = addTotals(fold.totals, buckets)
    fold.hasUsage = true
    if (turnCostValue === undefined) fold.costComplete = false
    else fold.cost += turnCostValue
  }

  const jobCost = pricing !== undefined && hasUsage && costComplete ? cost : undefined
  const currency = jobCost === undefined || pricing === undefined ? undefined : pricing.currency
  const stageUsages: StageUsage[] = stageOrder.map((stage) => {
    // The order list and the map are written together; a stage in one is in the other.
    const fold = stages.get(stage) as StageFold
    const stageCost = pricing !== undefined && fold.hasUsage && fold.costComplete ? fold.cost : undefined
    return {
      stage,
      totals: fold.totals,
      ...(stageCost === undefined ? {} : { cost: stageCost }),
    }
  })

  return {
    totals,
    ...(jobCost === undefined ? {} : { cost: jobCost }),
    ...(currency === undefined ? {} : { currency }),
    stages: stageUsages,
  }
}
