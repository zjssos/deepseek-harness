import { describe, expect, it } from 'vitest'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { attributeJobUsage, isStageId, splitTurns, STAGE_IDS } from '../src/attribution.ts'
import type { PricingTable } from '../src/pricing.ts'

function event(seq: number, type: string, data: unknown): SessionEvent {
  return { seq, time: seq, type, data } as unknown as SessionEvent
}

function usage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  const value: Record<string, number> = {
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 170,
    cacheReadTokens: 50,
    ...overrides,
  }
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as unknown as TokenUsage
}

function message(
  seq: number,
  tokenUsage: TokenUsage | undefined,
  provider = 'deepseek',
  model = 'deepseek-chat',
  step = 1,
): SessionEvent {
  return event(seq, 'assistant/message', {
    turn: 1,
    step,
    stream: tokenUsage === undefined
      ? []
      : [{ type: 'chunk', time: seq, chunk: { type: 'usage', usage: tokenUsage } }],
    message: {
      id: `message-${seq}`,
      role: 'assistant',
      content: [{ type: 'text', text: 'done' }],
      source: { kind: 'model', provider, model },
    },
    ...tokenUsage === undefined ? {} : { usage: tokenUsage },
  })
}

function toolCall(seq: number, name: string, args: string, turn = 1, step = 1): SessionEvent {
  return event(seq, 'tool/call', { turn, step, callId: `call-${seq}`, name, arguments: args })
}

function turn(startSeq: number, body: readonly SessionEvent[], turnNumber = 1): SessionEvent[] {
  const normalized = body.map(item => ({
    ...item,
    data: { ...(item.data as Record<string, unknown>), turn: turnNumber },
  }) as SessionEvent)
  const last = Math.max(startSeq, ...normalized.map(item => item.seq)) + 1
  return [
    event(startSeq, 'turn/start', { turn: turnNumber }),
    event(startSeq + 1, 'step/start', { turn: turnNumber, step: 1 }),
    ...normalized,
    event(last, 'step/end', { turn: turnNumber, step: 1 }),
    event(last + 1, 'turn/end', { turn: turnNumber, reason: { kind: 'completed' } }),
  ]
}

const examArgs = JSON.stringify({ jobId: 'job-1', stage: 'exam' })
const lensArgs = JSON.stringify({ jobId: 'job-1', stage: 'lens' })

describe('splitTurns', () => {
  it('splits completed turns and drops an unclosed trailing turn', () => {
    const events = [
      ...turn(1, [message(3, usage())]),
      ...turn(10, [message(12, usage())], 2),
      event(20, 'turn/start', { turn: 3 }),
      event(21, 'step/start', { turn: 3, step: 1 }),
    ]
    const turns = splitTurns(events)
    expect(turns).toHaveLength(2)
    expect(turns[0]?.map(item => item.seq)[0]).toBe(1)
    expect(turns[1]?.map(item => item.seq)[0]).toBe(10)
  })
})

describe('isStageId', () => {
  it('accepts the six stages and rejects anything else', () => {
    for (const stage of STAGE_IDS) expect(isStageId(stage)).toBe(true)
    expect(isStageId('unknown')).toBe(false)
    expect(isStageId(undefined)).toBe(false)
    expect(isStageId(3)).toBe(false)
  })
})

describe('attributeJobUsage', () => {
  it('attributes turns to the most recent stage call and keeps unattributed turns in the job total', () => {
    const events = [
      ...turn(1, [message(3, usage())]),
      ...turn(10, [toolCall(12, 'job_write_stage', examArgs), message(13, usage())], 2),
      ...turn(20, [message(22, usage())], 3),
    ]
    const result = attributeJobUsage(events, undefined)
    expect(result.totals).toEqual({
      uncachedInputTokens: 300, outputTokens: 60, cacheReadTokens: 150, cacheWriteTokens: 0,
    })
    expect(result.stages).toEqual([
      {
        stage: 'exam',
        totals: { uncachedInputTokens: 200, outputTokens: 40, cacheReadTokens: 100, cacheWriteTokens: 0 },
      },
    ])
    expect(result.cost).toBeUndefined()
  })

  it('reattributes later turns when a new stage is written', () => {
    const events = [
      ...turn(1, [toolCall(3, 'job_write_stage', examArgs), message(4, usage())]),
      ...turn(10, [toolCall(12, 'job_write_stage', lensArgs), message(13, usage())], 2),
      ...turn(20, [message(22, usage())], 3),
    ]
    const result = attributeJobUsage(events, undefined)
    expect(result.stages.map(stage => stage.stage)).toEqual(['exam', 'lens'])
    expect(result.stages[0]?.totals.uncachedInputTokens).toBe(100)
    expect(result.stages[1]?.totals.uncachedInputTokens).toBe(200)
  })

  it('ignores other tools, malformed arguments, and unknown stages', () => {
    const events = turn(1, [
      toolCall(3, 'job_read', '{"jobId":"job-1"}'),
      toolCall(4, 'job_write_stage', 'not json'),
      toolCall(5, 'job_write_stage', '{"jobId":"job-1","stage":"telepathy"}'),
      message(6, usage()),
    ])
    const result = attributeJobUsage(events, undefined)
    expect(result.stages).toEqual([])
    expect(result.totals.uncachedInputTokens).toBe(100)
  })

  it('skips turns without a complete usage disclosure but keeps the stage anchor', () => {
    const events = [
      ...turn(1, [toolCall(3, 'job_write_stage', examArgs), message(4, undefined)]),
      ...turn(10, [message(12, usage())], 2),
    ]
    const result = attributeJobUsage(events, undefined)
    expect(result.totals.uncachedInputTokens).toBe(100)
    expect(result.stages).toHaveLength(1)
    expect(result.stages[0]?.stage).toBe('exam')
    expect(result.stages[0]?.totals.uncachedInputTokens).toBe(100)
  })

  it('prices a single-route turn and omits cost for multi-route or unpriced turns', () => {
    const table: PricingTable = {
      currency: 'CNY',
      routes: {
        'deepseek/deepseek-chat': { uncachedInput: 1, output: 2, cacheRead: 0.5, cacheWrite: 0 },
      },
    }
    const priced = attributeJobUsage(
      turn(1, [toolCall(3, 'job_write_stage', examArgs), message(4, usage())]),
      table,
    )
    expect(priced.cost).toBe(100 * 1 + 20 * 2 + 50 * 0.5)
    expect(priced.currency).toBe('CNY')
    expect(priced.stages[0]?.cost).toBe(priced.cost)

    const multiRoute = attributeJobUsage(
      turn(1, [
        toolCall(3, 'job_write_stage', examArgs),
        message(4, usage()),
        message(5, usage(), 'other', 'model-x', 1),
      ]),
      table,
    )
    expect(multiRoute.cost).toBeUndefined()

    const unpriced = attributeJobUsage(turn(1, [toolCall(3, 'job_write_stage', examArgs), message(4, usage(), 'other', 'model-x')]), table)
    expect(unpriced.cost).toBeUndefined()

    const noTable = attributeJobUsage(turn(1, [toolCall(3, 'job_write_stage', examArgs), message(4, usage())]), undefined)
    expect(noTable.cost).toBeUndefined()
  })

  it('leaves cost absent when there is no attributed usage at all', () => {
    expect(attributeJobUsage([], { currency: 'CNY', routes: {} }).cost).toBeUndefined()
    expect(attributeJobUsage([], undefined).totals.uncachedInputTokens).toBe(0)
  })
})
