import { describe, expect, it } from 'vitest'
import { rxlabUsageDomainSpec } from '../src/domain.ts'
import { addTotals, moduleOfCwd, totalsEqual, ZERO_TOTALS } from '../src/aggregate.ts'

const SUBDIRS = { collect: 'collect' } as const

describe('moduleOfCwd', () => {
  const root = '/work/rxlab-workspace'

  it('attributes a cwd inside a module subdirectory to that module', () => {
    expect(moduleOfCwd(`${root}/collect`, root, SUBDIRS, 'agent')).toBe('collect')
    expect(moduleOfCwd(`${root}/collect/extra`, root, SUBDIRS, 'agent')).toBe('collect')
  })

  it('falls back to the default module for the root, unknown subdirs, and absent cwd', () => {
    expect(moduleOfCwd(undefined, root, SUBDIRS, 'agent')).toBe('agent')
    expect(moduleOfCwd(root, root, SUBDIRS, 'agent')).toBe('agent')
    expect(moduleOfCwd(`${root}/wiki`, root, SUBDIRS, 'agent')).toBe('agent')
    expect(moduleOfCwd(`${root}/collect-up`, root, SUBDIRS, 'agent')).toBe('agent')
  })

  it('ignores a cwd outside the workspace root', () => {
    expect(moduleOfCwd('/elsewhere/collect', root, SUBDIRS, 'agent')).toBe('agent')
  })
})

describe('addTotals / totalsEqual', () => {
  const a = { uncachedInputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1 }
  const b = { uncachedInputTokens: 3, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 2 }

  it('sums field by field', () => {
    expect(addTotals(a, b)).toEqual({
      uncachedInputTokens: 13,
      outputTokens: 9,
      cacheReadTokens: 2,
      cacheWriteTokens: 3,
    })
  })

  it('treats zero as the neutral element', () => {
    expect(addTotals(a, ZERO_TOTALS)).toEqual(a)
    expect(totalsEqual(a, a)).toBe(true)
    expect(totalsEqual(a, b)).toBe(false)
  })
})

describe('rxlabUsageDomainSpec', () => {
  it('declares per-record sessions and modules tables', () => {
    expect(rxlabUsageDomainSpec.name).toBe('rxlab_usage')
    expect(rxlabUsageDomainSpec.layout).toBe('per-record')
    expect(Object.keys(rxlabUsageDomainSpec.tables).sort()).toEqual(['modules', 'sessions'])
  })
})
