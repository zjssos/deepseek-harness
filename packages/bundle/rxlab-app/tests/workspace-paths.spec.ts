import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import {
  WORKSPACE_SETTINGS_NAMESPACE,
  bootstrapWorkspace,
  default as RxlabWorkspacePaths,
} from '@deepseek-ai/dsh-rxlab-app/workspace-paths'

/** Every temp root created by these tests, removed after each test. */
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** Boot one file-backed settings provider plus the workspace paths service over a fresh temp home. */
async function bootWorkspace(settingsDocument: string): Promise<{ ctx: Context; home: string }> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-rxlab-workspace-'))
  roots.push(home)
  const settingsFile = join(home, 'settings-rxlab.yaml')
  await writeFile(settingsFile, settingsDocument, 'utf8')
  const ctx = new Context()
  await ctx.plugin(FileSettingsProvider, { path: settingsFile, watch: false })
  await ctx.plugin(RxlabWorkspacePaths, { root: join(home, 'rxlab-workspace') })
  return { ctx, home }
}

describe('rxlab workspace paths', () => {
  it('resolves the storage root inside the workspace and bootstraps the skeleton', async () => {
    const { ctx, home } = await bootWorkspace('{}\n')
    const workspaceRoot = join(home, 'rxlab-workspace')
    expect(ctx.rxlabPaths.workspaceRoot).toBe(workspaceRoot)
    expect(ctx.rxlabPaths.storageRoot).toBe(join(workspaceRoot, '.rxlab', 'storage'))

    for (const dir of ['collect', 'wiki', 'exports', join('.dsh', 'skills')]) {
      expect((await stat(join(workspaceRoot, dir))).isDirectory()).toBe(true)
    }
    expect(await readFile(join(workspaceRoot, 'AGENTS.md'), 'utf8')).toContain('rxlab 工作台')
    expect(await readFile(join(workspaceRoot, 'collect', 'AGENTS.md'), 'utf8')).toContain('商品采集模块')
    expect(await readFile(join(workspaceRoot, 'wiki', 'AGENTS.md'), 'utf8')).toContain('商品 Wiki 模块')
  })

  it('layers the settings document over the composition entry and surfaces restart semantics', async () => {
    const { ctx, home } = await bootWorkspace(`${WORKSPACE_SETTINGS_NAMESPACE}:\n  root: ~/rxlab-elsewhere\n`)
    expect(ctx.rxlabPaths.storageRoot).toContain('rxlab-elsewhere')
    expect(ctx.rxlabPaths.storageRoot).not.toContain(home)

    const descriptor = ctx.settings.describe().find(entry => entry.ns === WORKSPACE_SETTINGS_NAMESPACE)
    expect(descriptor?.applies).toBe('restart')
    expect(descriptor?.base).toEqual({ root: join(home, 'rxlab-workspace') })
  })

  it('never overwrites an existing guidance file on a second bootstrap pass', async () => {
    const { home } = await bootWorkspace('{}\n')
    const workspaceRoot = join(home, 'rxlab-workspace')
    const agents = join(workspaceRoot, 'AGENTS.md')
    const bootstrapped = await readFile(agents, 'utf8')
    await bootstrapWorkspace(workspaceRoot, { warn: () => {} })
    expect(await readFile(agents, 'utf8')).toBe(bootstrapped)
  })
})
