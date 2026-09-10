import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { apply, formatSuggest, inject, name } from '../src/tools.ts'
import type { CompatibilityReport } from '../src/types.ts'

function report(overall: CompatibilityReport['overall']): CompatibilityReport {
  return { overall, checks: [{ name: 'index', status: overall, detail: 'detail' }], summary: `${overall} summary` }
}

const frame = { frameType: 'full', lensWidthA: 48, bridgeDbl: 16 }
const lens = { index: 1.6, lensType: 'single', features: [] }

/** Capture the tools a run registers and the requests they forward. */
function harness() {
  const registrations: ToolDefinition[] = []
  const requests: unknown[] = []
  const controller = {
    validateFrame(request: unknown) { requests.push(request); return { report: report('OK') } },
    validateLens(request: unknown) { requests.push(request); return { report: report('WARN') } },
    suggest(request: unknown) {
      requests.push(request)
      return {
        frames: [{ candidate: frame, report: report('OK'), score: 121 }],
        lenses: [{ candidate: lens, report: report('OK'), score: 110 }],
        reasons: ['镜架 1 个候选'],
      }
    },
  }
  const ctx = {
    tools: { register: (tool: ToolDefinition) => { registrations.push(tool); return () => {} } },
    recommendController: controller,
  } as unknown as Context
  apply(ctx)
  return { registrations, requests }
}

describe('recommend tools plugin', () => {
  it('exposes its loader identity and required services', () => {
    expect(name).toBe('rxlab-recommend-tools')
    expect(inject).toEqual(['tools', 'recommendController'])
  })

  it('registers the three frozen tool names', () => {
    const { registrations } = harness()
    expect(registrations.map(tool => tool.name)).toEqual([
      'recommend_validate_frame',
      'recommend_validate_lens',
      'recommend_suggest',
    ])
  })

  it('forwards a frame validation and renders the report', async () => {
    const { registrations, requests } = harness()
    const tool = registrations[0]
    if (tool === undefined) throw new Error('missing frame tool')
    const value = await tool.execute({ prescription: {}, advice: {}, frame }, {} as ToolRunContext)
    expect(requests).toHaveLength(1)
    expect(tool.output.render({}, value as never)).toEqual([{ type: 'text', text: 'OK summary' }])
    expect(tool.presentCall?.({ prescription: {}, advice: {}, frame })).toEqual({ card: 'generic', title: '校验镜架适配' })
    expect(tool.presentCall?.({})).toBeUndefined()
  })

  it('forwards a lens validation and renders the report', async () => {
    const { registrations } = harness()
    const tool = registrations[1]
    if (tool === undefined) throw new Error('missing lens tool')
    const value = await tool.execute({ prescription: {}, advice: {}, lens }, {} as ToolRunContext)
    expect(tool.output.render({}, value as never)).toEqual([{ type: 'text', text: 'WARN summary' }])
    expect(tool.presentCall?.({ prescription: {}, advice: {}, lens })).toEqual({ card: 'generic', title: '校验镜片适配' })
  })

  it('runs a suggestion and formats the ranking', async () => {
    const { registrations } = harness()
    const tool = registrations[2]
    if (tool === undefined) throw new Error('missing suggest tool')
    const value = await tool.execute(
      { prescription: {}, advice: {}, candidates: { frames: [frame], lenses: [lens] } },
      {} as ToolRunContext,
    )
    expect(tool.presentCall?.({ prescription: {}, advice: {}, candidates: {} })).toEqual({ card: 'generic', title: '推荐镜架与镜片' })
    expect(formatSuggest(value as never)).toContain('镜架 1 个候选')
    const rendered = tool.output.render({}, value as never)
    expect(rendered).toHaveLength(1)
  })
})
