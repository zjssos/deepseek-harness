/**
 * Catalog data hooks for the wiki panel: direct reads and writes over the
 * embedded client runtime's generated `remote.rxlabCatalog` namespace.
 *
 * The catalog has no client-side observable source yet, so these hooks use
 * controlled refresh state (a nonce the panel bumps after every mutation or
 * filter change), not a long subscription; `domain/changed` live sync is
 * deferred work. Hooks stay order-stable across the boot transition because
 * they never call useSyncExternalStore conditionally — they follow the
 * unconditional uSES discipline only where a real source exists; here plain
 * effect-driven fetches are enough.
 */
import { useCallback, useEffect, useState } from 'react'

// Type-only: pulls the generated `remote.rxlabCatalog` namespace declarations
// into the ClientRemote type shared with the rest of the workbench.
import type {} from '@deepseek-ai/dsh-rxlab-catalog/remote'
import type {
  CatalogImportRequest,
  CatalogImportValue,
  CatalogItemSummary,
  CatalogRemoveRequest,
  CatalogUpsertRequest,
  WikiItemDraft,
  WikiKind,
} from '@deepseek-ai/dsh-rxlab-catalog/types'
import type { RxlabClientRuntime } from '@/rxlab/client'

/** List filter the wiki browser holds. */
export interface CatalogListFilters {
  /** Row family; undefined lists every family. */
  readonly kind?: WikiKind
  /** Free-text brand/model/name substring. */
  readonly query?: string
}

export type CatalogListPhase = 'loading' | 'ready' | 'error'

/** Snapshot of one catalog list fetch. */
export interface CatalogListState {
  readonly phase: CatalogListPhase
  readonly items: readonly CatalogItemSummary[]
  readonly error?: string
}

/** One running catalog list plus a manual refresh trigger. */
export interface CatalogListController {
  readonly state: CatalogListState
  /** Bump to re-run the list fetch (after a mutation or reconnect). */
  readonly reload: () => void
}

/**
 * Fetch the catalog list whenever the runtime becomes connected or the filter
 * changes, and expose a manual reload for post-mutation refresh.
 * @param runtime - ready client runtime; absent keeps the list empty.
 * @param connected - whether the browser transport generation is established.
 * @param filters - kind and query; every change re-fetches.
 * @returns the last fetch snapshot and a reload trigger.
 */
export function useCatalogList(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  filters: CatalogListFilters,
): CatalogListController {
  const [state, setState] = useState<CatalogListState>({ phase: 'loading', items: [] })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])

  const kindKey = filters.kind ?? ''
  const queryKey = (filters.query ?? '').trim()
  useEffect(() => {
    if (runtime === undefined || !connected) return
    let alive = true
    const kind = kindKey === '' ? undefined : kindKey as WikiKind
    const query = queryKey.length === 0 ? undefined : queryKey
    setState({ phase: 'loading', items: [] })
    void runtime.remote.rxlabCatalog.list({
      ...(kind === undefined ? {} : { kind }),
      ...(query === undefined ? {} : { query }),
    })
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setState({
            phase: 'error',
            items: [],
            error: `${result.error.code}: ${result.error.message}`,
          })
          return
        }
        setState({ phase: 'ready', items: result.value.items })
      })
      .catch((cause: unknown) => {
        if (alive) {
          setState({
            phase: 'error',
            items: [],
            error: cause instanceof Error ? cause.message : String(cause),
          })
        }
      })
    return () => { alive = false }
  }, [runtime, connected, kindKey, queryKey, nonce])

  return { state, reload }
}

/** Create or replace one catalog record; throws the readable failure text. */
export async function catalogUpsert(
  runtime: RxlabClientRuntime,
  draft: WikiItemDraft,
): Promise<void> {
  const request: CatalogUpsertRequest = { item: draft }
  const result = await runtime.remote.rxlabCatalog.upsert(request)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
}

/**
 * Import one collected listing into the catalog (the collect→wiki seam);
 * throws the readable failure text and returns the merge-or-create verdict.
 */
export async function catalogImportCollected(
  runtime: RxlabClientRuntime,
  request: CatalogImportRequest,
): Promise<CatalogImportValue> {
  const result = await runtime.remote.rxlabCatalog.importCollected(request)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

/** Delete one catalog record; throws the readable failure text. */
export async function catalogRemove(
  runtime: RxlabClientRuntime,
  request: CatalogRemoveRequest,
): Promise<boolean> {
  const result = await runtime.remote.rxlabCatalog.delete(request)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value.removed
}
