/**
 * Host Backup Remote owner for the rxlab workbench: the `rxlabBackup`
 * namespace packages every `rxlab_*` business storage domain under the
 * workspace storage root into one JSON bundle and restores records from such
 * a bundle. The storage root comes from the existing `rxlabPaths` service, so
 * this package adds no cross-package dependency. It mounts its own namespace
 * on the Client side (see `src/client/index.ts`) and is a rxlab-app data row;
 * it deliberately never joins the platform `api-remotes` assembly, because the
 * workspace business tree is rxlab-product data, not a generic Host
 * capability.
 * @module @deepseek-ai/dsh-rxlab-backup
 */

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  BackupExportRequest,
  BackupExportValue,
  BackupImportRequest,
  BackupImportValue,
  BackupRecord,
  BackupValue,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host business API and Remote namespace owner for rxlab workspace backup. */
    backupController: BackupController
  }
}

/**
 * Domain directories this namespace packages. Only `rxlab_*` names match, so
 * `session_projcache` and every other unit are excluded.
 */
const DOMAIN_PATTERN = /^rxlab_[a-z0-9_]+$/

/** Table and record-key path segments accepted on both the export and import sides. */
const SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/

/** Upper bound on records one import bundle may carry. */
const MAX_IMPORT_RECORDS = 200000

/** Structural view of the `rxlabPaths` service: only the storage root is read. */
interface BackupPaths {
  /** Absolute storage backend root: `<workspaceRoot>/.rxlab/storage`. */
  readonly storageRoot: string
}

/** One parsed per-record document. */
interface StoredDocument {
  readonly version: number
  readonly record: BackupValue
}

/**
 * Host service backing the generated `ctx.remote.rxlabBackup` namespace.
 * `export` walks `<storageRoot>/<domain>/<table>/<key>.json` for every
 * `rxlab_*` domain and returns the records as one bundle; `import` validates
 * the bundle and writes each accepted record back through a temporary file
 * and an atomic rename. The storage root comes from `rxlabPaths`.
 */
export class BackupController extends TypertRemoteService {
  static inject = ['rxlabPaths']

  private readonly paths: BackupPaths | undefined

  /**
   * Register the backup namespace on the Typert Gateway.
   * @param ctx - Host context carrying the resolved workspace paths.
   */
  constructor(ctx: Context) {
    super(ctx, 'backupController', { namespace: 'rxlabBackup' })
    this.paths = ctx.get('rxlabPaths') as BackupPaths | undefined
  }

  /**
   * Package every record of every `rxlab_*` storage domain into one bundle.
   * Domain, table, and key sort deterministically; a document that is
   * malformed or carries no valid version stamp is skipped.
   * @param _request - empty request; the export always covers the whole workspace.
   * @returns the bundle with every readable business record.
   * @throws RemoteError `gateway/internal` when the workspace paths are unavailable.
   */
  @Remote('export')
  async export(_request: BackupExportRequest): Promise<BackupExportValue> {
    const storageRoot = this.requireStorageRoot()
    const records: BackupRecord[] = []
    for (const domain of await listDomains(storageRoot)) {
      const domainDir = join(storageRoot, domain)
      for (const table of await listSegments(domainDir)) {
        const tableDir = join(domainDir, table)
        for (const key of await listKeys(tableDir)) {
          const document = await readStoredDocument(join(tableDir, `${key}.json`))
          if (document === undefined) continue
          records.push({ domain, table, key, version: document.version, record: document.record })
        }
      }
    }
    records.sort(compareRecords)
    return { bundle: { formatVersion: 1, exportedAt: new Date().toISOString(), records } }
  }

  /**
   * Restore a bundle: validate it as a whole, then write each accepted record
   * to `<storageRoot>/<domain>/<table>/<key>.json` through a temporary file
   * and an atomic rename. A record with an unsafe domain, table, or key, or
   * without a valid version stamp, is skipped and counted.
   * @param request - the bundle to restore.
   * @returns how many records were written and how many were skipped.
   * @throws RemoteError `backup/bad-request` when the bundle format, its records field, or its size is invalid.
   * @throws RemoteError `gateway/internal` when the workspace paths are unavailable.
   */
  @Remote('import')
  async import(request: BackupImportRequest): Promise<BackupImportValue> {
    const storageRoot = this.requireStorageRoot()
    const bundle = request.bundle
    if (bundle === null || typeof bundle !== 'object' || bundle.formatVersion !== 1) {
      throw new RemoteError('backup/bad-request', 'rxlab backup bundle formatVersion must be 1', {
        reason: 'formatVersion must be 1',
      })
    }
    const candidates: unknown = bundle.records
    if (!Array.isArray(candidates)) {
      throw new RemoteError('backup/bad-request', 'rxlab backup bundle records must be an array', {
        reason: 'records must be an array',
      })
    }
    if (candidates.length > MAX_IMPORT_RECORDS) {
      throw new RemoteError(
        'backup/bad-request',
        `rxlab backup bundle carries ${String(candidates.length)} records, above the ${String(MAX_IMPORT_RECORDS)} limit`,
        { reason: `at most ${String(MAX_IMPORT_RECORDS)} records are accepted` },
      )
    }
    let written = 0
    let skipped = 0
    for (const candidate of candidates) {
      if (!isSafeRecord(candidate)) {
        skipped += 1
        continue
      }
      const dir = join(storageRoot, candidate.domain, candidate.table)
      await mkdir(dir, { recursive: true })
      const target = join(dir, `${candidate.key}.json`)
      const tmp = `${target}.tmp`
      await writeFile(tmp, serializeDocument(candidate.version, candidate.record), 'utf8')
      await rename(tmp, target)
      written += 1
    }
    return { written, skipped }
  }

  private requireStorageRoot(): string {
    if (this.paths === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'rxlab backup cannot resolve the workspace storage root without the rxlabPaths service',
        {},
      )
    }
    return this.paths.storageRoot
  }
}

/** Read the `rxlab_*` domain directories under the storage root; a missing root is an empty workspace. */
async function listDomains(storageRoot: string): Promise<readonly string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(storageRoot, { withFileTypes: true })
  } catch (cause) {
    // Only a missing storage root is empty: a fresh workspace has not opened a domain yet.
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw cause
  }
  return entries
    .filter(entry => entry.isDirectory() && DOMAIN_PATTERN.test(entry.name))
    .map(entry => entry.name)
    .sort()
}

/** Read the path-safe table directories under one domain directory. */
async function listSegments(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory() && SEGMENT_PATTERN.test(entry.name))
    .map(entry => entry.name)
    .sort()
}

/** Read the path-safe record keys (`<key>.json`) under one table directory. */
async function listKeys(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name.slice(0, -'.json'.length))
    .filter(key => SEGMENT_PATTERN.test(key))
    .sort()
}

/** Parse one stored document; a malformed file or an invalid version stamp reads as absent. */
async function readStoredDocument(file: string): Promise<StoredDocument | undefined> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    // A record file removed between listing and reading is simply absent.
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Malformed JSON is not a record; the export skips it.
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const candidate = parsed as Record<string, unknown>
  const version = candidate.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return undefined
  if (!Object.hasOwn(candidate, 'record')) return undefined
  // JSON.parse only yields JSON, so the parsed record is a BackupValue by construction.
  return { version, record: candidate.record as BackupValue }
}

/** Whether one imported record names a safe location and carries a valid version stamp. */
function isSafeRecord(value: unknown): value is BackupRecord {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.domain === 'string' && DOMAIN_PATTERN.test(candidate.domain)
    && typeof candidate.table === 'string' && SEGMENT_PATTERN.test(candidate.table)
    && typeof candidate.key === 'string' && SEGMENT_PATTERN.test(candidate.key)
    && typeof candidate.version === 'number' && Number.isInteger(candidate.version) && candidate.version >= 0
    && Object.hasOwn(candidate, 'record')
}

/** Deterministic domain/table/key order for one bundle's records. */
function compareRecords(left: BackupRecord, right: BackupRecord): number {
  return compareSegment(left.domain, right.domain)
    || compareSegment(left.table, right.table)
    || compareSegment(left.key, right.key)
}

/** Compare two path segments in code-point order, independent of host locale. */
function compareSegment(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** Serialize one record exactly as the JSON storage backend writes it. */
function serializeDocument(version: number, record: BackupValue): string {
  return `${JSON.stringify({ version, record }, null, 2)}\n`
}

export default BackupController
