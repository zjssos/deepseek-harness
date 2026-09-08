/**
 * Delta presets (`extends`): the composition resolver decides the file a mount
 * reads and the patches it applies, and the roster judges every chain at
 * discovery — a delta naming a missing base, a cycle, or a patch that matches
 * nothing is a broken roster row, and a working delta mounts the composed
 * composition with its rows resolving from its OWN directory.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AgentPresets, { COMPOSITION_FILE } from '@deepseek-ai/dsh-agent-presets'
import { documentProblem, patchProblem } from '../src/composition.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const CONTRIBUTE = join(FIXTURES, 'plugins', 'contribute.js')

let root: string
let previousHome: string | undefined

beforeEach(async () => {
  previousHome = process.env.DSH_HOME
  root = await mkdtemp(join(tmpdir(), 'dsh-preset-composition-'))
  process.env.DSH_HOME = join(root, 'home')
})

afterEach(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(root, { recursive: true, force: true })
})

/** Seed one preset directory with a composition document. */
async function preset(id: string, document: string): Promise<void> {
  await mkdir(join(root, id), { recursive: true })
  await writeFile(join(root, id, COMPOSITION_FILE), document)
}

/** One preset directory carrying a runnable helper beside its composition. */
async function presetWithHelper(id: string, document: string): Promise<void> {
  await preset(id, document)
  await mkdir(join(root, id, 'files'), { recursive: true })
  await writeFile(join(root, id, 'files', 'row.js'), await readFile(CONTRIBUTE, 'utf8'))
}

async function harness(defaultId: string): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(AgentPresets, {
    default: defaultId,
    roots: [{ path: root, trust: 'user' }],
    includeShippedRoot: false,
    includeUserRoot: false,
  })
  return ctx
}

async function toolsFor(ctx: Context, id: string, presetId?: string): Promise<string[]> {
  await ctx.agents.create({
    sessionId: SessionId(id),
    setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, presetId),
  })
  return ctx.tools.schemas(ctx.agents.get(SessionId(id))).map(schema => schema.name).sort()
}

describe('delta document shape', () => {
  it('accepts both shapes and rejects the hand-edits between them', () => {
    expect(documentProblem([{ name: 'one' }])).toBeUndefined()
    expect(documentProblem('text')).toMatch(/top-level list/)
    expect(documentProblem({})).toMatch(/top-level list/)
    expect(documentProblem({ extends: 'Base_Upper' })).toMatch(/must be a preset id/)
    expect(documentProblem({ extends: 'base', rows: 'nope' })).toMatch(/must be a list/)
    expect(documentProblem({ extends: 'base', rows: [{ config: {} }] })).toMatch(/carries no "id"/)
    expect(documentProblem({ extends: 'base', rows: [{ insert: [{ id: 'x' }] }] }))
      .toMatch(/inserts an invalid entry list/)
    expect(documentProblem({ extends: 'base', rows: [{ id: 'x' }] })).toBeUndefined()
    expect(documentProblem({ extends: 'base', rows: [{ insert: [] }] })).toBeUndefined()
  })
})

describe('patch coverage', () => {
  const base = [
    { id: 'a', name: 'one' },
    { id: 'group', group: true, config: [{ id: 'inner', name: 'two' }] },
  ]

  it('accepts overrides by id, top-level insertions, and insertions into a group', () => {
    expect(patchProblem(base, [
      { id: 'a', disabled: true },
      { id: 'inner', name: 'two', config: { deeper: true } },
      { insert: [{ id: 'added', name: 'three' }] },
      { id: 'group', insert: [{ id: 'nested', name: 'four' }] },
    ])).toBeUndefined()
  })

  it('lets a later patch target a row an earlier patch inserted', () => {
    expect(patchProblem(base, [
      { insert: [{ id: 'added', name: 'three' }] },
      { id: 'added', name: 'three', disabled: true },
    ])).toBeUndefined()
  })

  it('names the patch that targets an absent id, a non-group, or a renamed entry', () => {
    expect(patchProblem(base, [{ id: 'missing', disabled: true }]))
      .toBe('patch row 1 targets entry "missing", which the composition does not declare')
    expect(patchProblem(base, [{ id: 'a', insert: [] }]))
      .toBe('patch row 1 inserts into entry "a", which is not a group')
    expect(patchProblem(base, [{ id: 'a', name: 'other' }]))
      .toBe('patch row 1 names "other" but entry "a" names "one"')
  })
})

describe('resolving a working chain', () => {
  it('mounts the base file and composes the delta patches onto it', async () => {
    await preset('standard', `- id: base-tool\n  name: ${JSON.stringify(CONTRIBUTE)}\n  config:\n    tool: base\n`)
    await preset('delta', [
      'extends: standard',
      'rows:',
      '  - id: base-tool',
      `    name: ${JSON.stringify(CONTRIBUTE)}`,
      '    config:',
      '      tool: renamed',
      '  - insert:',
      '      - id: extra-tool',
      `        name: ${JSON.stringify(CONTRIBUTE)}`,
      '        config:',
      '          tool: extra',
    ].join('\n'))

    const ctx = await harness('delta')
    expect(await toolsFor(ctx, 'sess-delta', 'delta')).toEqual(['extra', 'renamed'])
    expect(await toolsFor(ctx, 'sess-base', 'standard')).toEqual(['base'])
  })

  it('resolves preset-relative specifiers of delta rows against the delta directory', async () => {
    // Helper files travel with the delta preset even though the mount reads
    // the base file: a composed mount re-points `baseUrl` at the selected
    // preset's own directory before any row activates.
    await preset('standard', `- id: base-tool\n  name: ${JSON.stringify(CONTRIBUTE)}\n  config:\n    tool: base\n`)
    await presetWithHelper('delta', [
      'extends: standard',
      'rows:',
      '  - insert:',
      '      - id: local-tool',
      '        name: ./files/row.js',
      '        config:',
      '          tool: local',
    ].join('\n'))

    const ctx = await harness('delta')
    expect(await toolsFor(ctx, 'sess-local', 'delta')).toEqual(['base', 'local'])
  })

  it('composes a two-level chain deepest-first', async () => {
    await preset('standard', `- id: base-tool\n  name: ${JSON.stringify(CONTRIBUTE)}\n  config:\n    tool: base\n`)
    await preset('mid', [
      'extends: standard',
      'rows:',
      '  - insert:',
      '      - id: mid-tool',
      `        name: ${JSON.stringify(CONTRIBUTE)}`,
      '        config:',
      '          tool: mid',
    ].join('\n'))
    await preset('top', [
      'extends: mid',
      'rows:',
      '  - id: base-tool',
      `    name: ${JSON.stringify(CONTRIBUTE)}`,
      '    config:',
      '      tool: overridden',
    ].join('\n'))

    const ctx = await harness('top')
    expect(await toolsFor(ctx, 'sess-chain', 'top')).toEqual(['mid', 'overridden'])
  })
})

describe('refusing a broken chain at discovery', () => {
  it('marks a delta whose base is missing on the roster', async () => {
    await preset('delta', 'extends: standard\n')
    const ctx = await harness('delta')
    expect((await ctx.agentPresets.list()).find(row => row.id === 'delta')?.broken)
      .toMatch(/extends "standard", which the roster does not supply/)
    await expect(ctx.agentPresets.standingKeyFor('delta')).rejects.toMatchObject({ code: 'agent-preset/invalid' })
  })

  it('marks a cycle through the chain', async () => {
    await preset('standard', 'extends: top\n')
    await preset('top', 'extends: standard\n')
    const ctx = await harness('top')
    expect((await ctx.agentPresets.list()).find(row => row.id === 'top')?.broken)
      .toMatch(/extends cycle/)
  })

  it('marks a patch that matches nothing before any session mounts', async () => {
    await preset('standard', `- id: base-tool\n  name: ${JSON.stringify(CONTRIBUTE)}\n`)
    await preset('delta', 'extends: standard\nrows:\n  - id: absent\n    name: gone\n')
    const ctx = await harness('delta')
    expect((await ctx.agentPresets.list()).find(row => row.id === 'delta')?.broken)
      .toMatch(/targets entry "absent", which the composition does not declare/)
  })

  it('propagates a broken base verdict to the delta that extends it', async () => {
    await preset('standard', 'extends: ghost\n')
    await preset('delta', 'extends: standard\n')
    const ctx = await harness('delta')
    expect((await ctx.agentPresets.list()).find(row => row.id === 'delta')?.broken)
      .toMatch(/extends "ghost", which the roster does not supply/)
  })
})
