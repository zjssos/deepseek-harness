/**
 * Fitting data hooks for the optometry panel: direct reads, writes, and
 * derives over the embedded client runtime's generated `remote.rxlabFitting`
 * namespace. Like the catalog hooks, these use controlled refresh state (a
 * nonce the panel bumps after every mutation), not a long subscription;
 * `domain/changed` live sync is deferred work.
 */
import { useCallback, useEffect, useState } from 'react'

// Type-only: pulls the generated `remote.rxlabFitting` namespace declarations
// into the ClientRemote type shared with the rest of the workbench.
import type {} from '@deepseek-ai/dsh-rxlab-fitting/remote'
import type {
  ExamRecordDraft,
  FittingDeriveValue,
  FittingRecord,
  FittingRecordId,
  FittingRecordSummary,
  FittingRemoveRequest,
  FittingUpsertRequest,
} from '@deepseek-ai/dsh-rxlab-fitting/types'
import type { RxlabClientRuntime } from '@/modules/agent/client'

export type FittingListPhase = 'loading' | 'ready' | 'error'

/** Snapshot of one fitting-record list fetch. */
export interface FittingListState {
  readonly phase: FittingListPhase
  readonly records: readonly FittingRecordSummary[]
  readonly error?: string
}

/** One running record list plus a manual refresh trigger. */
export interface FittingListController {
  readonly state: FittingListState
  /** Bump to re-run the list fetch (after a mutation or reconnect). */
  readonly reload: () => void
}

/**
 * Fetch the exam-record list whenever the runtime becomes connected, the
 * query changes, or a mutation asks for a refresh.
 * @param runtime - ready client runtime; absent keeps the list empty.
 * @param connected - whether the browser transport generation is established.
 * @param query - case-insensitive patient/date substring; re-fetches on change.
 * @returns the last fetch snapshot and a reload trigger.
 */
export function useFittingRecords(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  query: string,
): FittingListController {
  const [state, setState] = useState<FittingListState>({ phase: 'loading', records: [] })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])

  const queryKey = query.trim()
  useEffect(() => {
    if (runtime === undefined || !connected) return
    let alive = true
    setState({ phase: 'loading', records: [] })
    void runtime.remote.rxlabFitting.list({
      ...(queryKey.length === 0 ? {} : { query: queryKey }),
    })
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setState({ phase: 'error', records: [], error: `${result.error.code}: ${result.error.message}` })
          return
        }
        setState({ phase: 'ready', records: result.value.items })
      })
      .catch((cause: unknown) => {
        if (alive) {
          setState({
            phase: 'error',
            records: [],
            error: cause instanceof Error ? cause.message : String(cause),
          })
        }
      })
    return () => { alive = false }
  }, [runtime, connected, queryKey, nonce])

  return { state, reload }
}

/** Read one full exam record; throws the readable failure text. */
export async function fittingGet(
  runtime: RxlabClientRuntime,
  id: FittingRecordId,
): Promise<FittingRecord> {
  const result = await runtime.remote.rxlabFitting.get({ id })
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value.record
}

/** Create or replace one exam record; throws the readable failure text. */
export async function fittingUpsert(
  runtime: RxlabClientRuntime,
  record: ExamRecordDraft,
  id?: FittingRecordId,
): Promise<FittingRecord> {
  const request: FittingUpsertRequest = { record, ...(id === undefined ? {} : { id }) }
  const result = await runtime.remote.rxlabFitting.upsert(request)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value.record
}

/** Delete one exam record; throws the readable failure text. */
export async function fittingRemove(
  runtime: RxlabClientRuntime,
  request: FittingRemoveRequest,
): Promise<boolean> {
  const result = await runtime.remote.rxlabFitting.delete(request)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value.removed
}

/** Derive a prescription from a staged record without storing it. */
export async function fittingDerive(
  runtime: RxlabClientRuntime,
  record: ExamRecordDraft,
): Promise<FittingDeriveValue> {
  const result = await runtime.remote.rxlabFitting.derive({ record })
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}
