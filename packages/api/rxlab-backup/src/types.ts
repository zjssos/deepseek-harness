/**
 * Public wire vocabulary of the rxlab backup Remote namespace: one per-record
 * document copied out of an `rxlab_*` storage domain, the bundle that carries
 * the records across the wire, and the export/import request and result types
 * plus the backup failure code. Types only — the controller owns every
 * filesystem and validation concern.
 * @module @deepseek-ai/dsh-rxlab-backup/src/types
 */

import type {} from '@deepseek-ai/dsh-typert-protocol'

/**
 * A stored record value: lossless JSON passed through unchanged. The Typert
 * boundary requires a concrete JSON type (bare `unknown` is rejected), and
 * the storage medium holds exactly this shape.
 */
export type BackupValue =
  | null
  | boolean
  | number
  | string
  | readonly BackupValue[]
  | { readonly [key: string]: BackupValue }

/** One per-record document read from `<storageRoot>/<domain>/<table>/<key>.json`. */
export interface BackupRecord {
  /** `rxlab_*` storage domain the record belongs to. */
  readonly domain: string
  /** Table directory the record lives in. */
  readonly table: string
  /** Record key (the `<key>.json` file's basename). */
  readonly key: string
  /** Version stamp carried by the stored document. */
  readonly version: number
  /** The stored record value, passed through unchanged. */
  readonly record: BackupValue
}

/** One exported workspace bundle: every readable `rxlab_*` record. */
export interface BackupBundle {
  /** Bundle format version; only 1 is accepted. */
  readonly formatVersion: 1
  /** ISO-8601 instant the bundle was assembled. */
  readonly exportedAt: string
  /** Every record in deterministic domain/table/key order. */
  readonly records: readonly BackupRecord[]
}

/** Export request; the export always covers the whole workspace. */
export interface BackupExportRequest {}

/** The assembled bundle for one {@link BackupExportRequest}. */
export interface BackupExportValue {
  readonly bundle: BackupBundle
}

/** Restore one bundle. */
export interface BackupImportRequest {
  /** The bundle to write back into the workspace storage root. */
  readonly bundle: BackupBundle
}

/** Receipt after one {@link BackupImportRequest}. */
export interface BackupImportValue {
  /** Records written to disk. */
  readonly written: number
  /** Records rejected for an unsafe location or an invalid version stamp. */
  readonly skipped: number
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The bundle format, its records field, or its size is invalid. */
    'backup/bad-request': { readonly reason: string }
  }
}
