import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import BackupController from '../src/index.ts'
import type { BackupBundle, BackupRecord } from '../src/types.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** One isolated storage root that teardown removes. */
async function makeStorageRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'rxlab-backup-'))
  roots.push(root)
  return root
}

/** Write one per-record document exactly as the JSON backend lays it out. */
async function writeRecord(
  storageRoot: string,
  domain: string,
  table: string,
  key: string,
  document: unknown,
): Promise<void> {
  const dir = join(storageRoot, domain, table)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${key}.json`), `${JSON.stringify(document, null, 2)}\n`, 'utf8')
}

/** Boot the backup controller over a temp storage root published as `rxlabPaths`. */
async function boot(storageRoot: string): Promise<Context> {
  const ctx = new Context()
  ctx.provide('rxlabPaths', {
    workspaceRoot: dirname(storageRoot),
    storageRoot,
    moduleAgents: {},
  })
  await ctx.plugin(BackupController)
  await vi.waitFor(() => { expect(ctx.backupController).toBeInstanceOf(BackupController) })
  return ctx
}

/** One well-formed bundle around the given records. */
function bundleOf(records: readonly BackupRecord[]): BackupBundle {
  return { formatVersion: 1, exportedAt: '2026-09-24T00:00:00.000Z', records }
}

describe('export', () => {
  it('packages rxlab_* records in domain/table/key order and skips foreign and invalid documents', async () => {
    const storageRoot = await makeStorageRoot()
    await writeRecord(storageRoot, 'rxlab_collect', 'items', 'x', { version: 3, record: { id: 'x' } })
    await writeRecord(storageRoot, 'rxlab_catalog', 'items', 'y', { version: 2, record: { id: 'y' } })
    await writeRecord(storageRoot, 'rxlab_collect', 'items', 'bad', { version: '1', record: { id: 'bad' } })
    await writeRecord(storageRoot, 'session_projcache', 'items', 'skip', { version: 1, record: { id: 'skip' } })
    await writeFile(join(storageRoot, 'rxlab_collect', 'items', 'broken.json'), 'not json', 'utf8')

    const ctx = await boot(storageRoot)
    const { bundle } = await ctx.backupController.export({})

    expect(bundle.formatVersion).toBe(1)
    expect(bundle.exportedAt).toBeTruthy()
    expect(bundle.records.map(record => `${record.domain}/${record.table}/${record.key}`)).toEqual([
      'rxlab_catalog/items/y',
      'rxlab_collect/items/x',
    ])
    expect(bundle.records[0]?.record).toEqual({ id: 'y' })
  })

  it('returns an empty bundle when the storage root does not exist yet', async () => {
    const storageRoot = await makeStorageRoot()
    const ctx = await boot(join(storageRoot, 'missing'))
    const { bundle } = await ctx.backupController.export({})
    expect(bundle.records).toEqual([])
  })
})

describe('import', () => {
  it('writes records back and re-exports them identically', async () => {
    const storageRoot = await makeStorageRoot()
    const ctx = await boot(storageRoot)
    const bundle = bundleOf([
      { domain: 'rxlab_catalog', table: 'items', key: 'y', version: 2, record: { id: 'y' } },
      { domain: 'rxlab_collect', table: 'items', key: 'x', version: 3, record: { id: 'x' } },
    ])

    await expect(ctx.backupController.import({ bundle })).resolves.toEqual({ written: 2, skipped: 0 })

    const written = await readFile(join(storageRoot, 'rxlab_collect', 'items', 'x.json'), 'utf8')
    expect(JSON.parse(written)).toEqual({ version: 3, record: { id: 'x' } })

    const reexported = await ctx.backupController.export({})
    expect(reexported.bundle.records).toEqual(bundle.records)
  })

  it('skips an unsafe key without writing outside the storage root', async () => {
    const storageRoot = await makeStorageRoot()
    const ctx = await boot(storageRoot)
    const bundle = bundleOf([
      { domain: 'rxlab_collect', table: 'items', key: '../evil', version: 1, record: { id: 'evil' } },
    ])

    await expect(ctx.backupController.import({ bundle })).resolves.toEqual({ written: 0, skipped: 1 })
    expect(existsSync(join(storageRoot, 'rxlab_collect', 'evil.json'))).toBe(false)
    expect(existsSync(join(storageRoot, 'rxlab_collect', 'items', '..', 'evil.json'))).toBe(false)
  })

  it('rejects a bundle whose formatVersion is not 1', async () => {
    const storageRoot = await makeStorageRoot()
    const ctx = await boot(storageRoot)
    const bundle = { ...bundleOf([]), formatVersion: 2 } as unknown as BackupBundle
    await expect(ctx.backupController.import({ bundle }))
      .rejects.toMatchObject({ code: 'backup/bad-request' })
  })

  it('rejects a bundle whose records field is not an array', async () => {
    const storageRoot = await makeStorageRoot()
    const ctx = await boot(storageRoot)
    const bundle = { ...bundleOf([]), records: 'nope' } as unknown as BackupBundle
    await expect(ctx.backupController.import({ bundle }))
      .rejects.toMatchObject({ code: 'backup/bad-request' })
  })

  it('rejects a bundle above the record limit', async () => {
    const storageRoot = await makeStorageRoot()
    const ctx = await boot(storageRoot)
    const bundle = bundleOf(new Array(200001) as unknown as BackupRecord[])
    await expect(ctx.backupController.import({ bundle }))
      .rejects.toMatchObject({ code: 'backup/bad-request' })
  })
})
