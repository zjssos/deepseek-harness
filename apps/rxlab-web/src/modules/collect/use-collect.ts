/**
 * Collect data hooks for the collect panel: reads and writes over the
 * embedded client runtime's generated `remote.rxlabCollect` namespace (link
 * assets, run batches, capture history). Like the catalog hooks, these use
 * controlled refresh state — a nonce the panel bumps plus a light poll while
 * a batch is in flight — not a long subscription.
 */
import { useCallback, useEffect, useState } from 'react'

// Type-only: pulls the generated `remote.rxlabCollect` namespace declarations
// into the ClientRemote type shared with the rest of the workbench.
import type {} from '@deepseek-ai/dsh-rxlab-collect/remote'
import type {
  CollectBatch,
  CollectBatchId,
  CollectBatchSummary,
  CollectCapture,
  CollectLink,
  CollectLinkDraft,
  CollectLinkId,
  CollectPlatform,
  CollectLinkStatus,
} from '@deepseek-ai/dsh-rxlab-collect/types'
import type { RxlabClientRuntime } from '@/rxlab/client'

/** List filter the link browser holds. */
export interface LinkListFilters {
  readonly platform?: CollectPlatform
  readonly shopId?: string
  readonly status?: CollectLinkStatus
  readonly query?: string
}

export type FetchPhase = 'loading' | 'ready' | 'error'

export interface FetchState<T> {
  readonly phase: FetchPhase
  readonly items: readonly T[]
  readonly error?: string
}

export interface ListController<T> {
  readonly state: FetchState<T>
  /** Bump to re-run the fetch (after a mutation or reconnect). */
  readonly reload: () => void
}

/**
 * Fetch the link list whenever the runtime connects or a filter changes, and
 * expose a manual reload for post-mutation refresh.
 * @param runtime - ready client runtime; absent keeps the list empty.
 * @param connected - whether the browser transport generation is established.
 * @param filters - platform/shop/status/query; every change re-fetches.
 * @returns the last fetch snapshot and a reload trigger.
 */
export function useLinkList(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  filters: LinkListFilters,
): ListController<CollectLink> {
  const [state, setState] = useState<FetchState<CollectLink>>({ phase: 'loading', items: [] })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])

  const platformKey = filters.platform ?? ''
  const shopKey = filters.shopId ?? ''
  const statusKey = filters.status ?? ''
  const queryKey = (filters.query ?? '').trim()

  useEffect(() => {
    if (runtime === undefined || !connected) return
    let alive = true
    setState({ phase: 'loading', items: [] })
    void runtime.remote.rxlabCollect.listLinks({
      ...(platformKey === '' ? {} : { platform: platformKey as CollectPlatform }),
      ...(shopKey === '' ? {} : { shopId: shopKey }),
      ...(statusKey === '' ? {} : { status: statusKey as CollectLinkStatus }),
      ...(queryKey.length === 0 ? {} : { query: queryKey }),
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
  }, [runtime, connected, platformKey, shopKey, statusKey, queryKey, nonce])

  return { state, reload }
}

/** Fetch the batch list; polled by the panel while a batch is in flight. */
export function useBatchList(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
): ListController<CollectBatchSummary> {
  const [state, setState] = useState<FetchState<CollectBatchSummary>>({ phase: 'loading', items: [] })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])

  useEffect(() => {
    if (runtime === undefined || !connected) return
    let alive = true
    setState({ phase: 'loading', items: [] })
    void runtime.remote.rxlabCollect.listBatches({})
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
        setState({ phase: 'ready', items: result.value.batches })
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
  }, [runtime, connected, nonce])

  return { state, reload }
}

/** One batch plus its in-flight polling status. */
export interface BatchDetailController {
  readonly state: FetchState<CollectBatch>
  /** Stop polling and force one last fetch. */
  readonly stopAndReload: () => void
}

/**
 * Fetch one full batch (with per-link items) and poll while it is queued or
 * running. The poll stops on its own once the batch settles.
 * @param runtime - ready client runtime.
 * @param connected - whether the browser transport generation is established.
 * @param batchId - target batch; absent keeps the state empty.
 */
export function useBatchDetail(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  batchId: CollectBatchId | undefined,
): BatchDetailController {
  const [state, setState] = useState<FetchState<CollectBatch>>({ phase: 'loading', items: [] })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    if (runtime === undefined || !connected || batchId === undefined) {
      setState({ phase: 'loading', items: [] })
      return
    }
    let alive = true
    setState({ phase: 'loading', items: [] })
    const fetchOnce = (): void => {
      void runtime.remote.rxlabCollect.getBatch({ id: batchId })
        .then((result) => {
          if (!alive) return
          if (!result.ok) {
            setState({ phase: 'error', items: [], error: `${result.error.code}: ${result.error.message}` })
            setPolling(false)
            return
          }
          const batch = result.value.batch
          setState({ phase: 'ready', items: [batch] })
          const running = batch.status === 'queued' || batch.status === 'running'
          setPolling(running)
        })
        .catch((cause: unknown) => {
          if (alive) {
            setState({
              phase: 'error',
              items: [],
              error: cause instanceof Error ? cause.message : String(cause),
            })
            setPolling(false)
          }
        })
    }
    fetchOnce()
    const timer = window.setInterval(() => {
      if (polling) fetchOnce()
    }, 1500)
    return () => { alive = false; window.clearInterval(timer) }
  }, [runtime, connected, batchId, nonce, polling])

  const stopAndReload = useCallback(() => { setPolling(false); reload() }, [reload])
  return { state, stopAndReload }
}

/** Open one link's capture history, newest first. */
export function useLinkCaptures(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  linkId: CollectLinkId | undefined,
): ListController<CollectCapture> {
  const [state, setState] = useState<FetchState<CollectCapture>>({ phase: 'loading', items: [] })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])

  useEffect(() => {
    if (runtime === undefined || !connected || linkId === undefined) {
      setState({ phase: 'loading', items: [] })
      return
    }
    let alive = true
    setState({ phase: 'loading', items: [] })
    void runtime.remote.rxlabCollect.listCaptures({ linkId, limit: 30 })
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
        setState({ phase: 'ready', items: result.value.captures })
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
  }, [runtime, connected, linkId, nonce])

  return { state, reload }
}

/** Create or replace one link; throws the readable failure text. */
export async function linkUpsert(
  runtime: RxlabClientRuntime,
  draft: CollectLinkDraft,
): Promise<{ merged: boolean }> {
  const result = await runtime.remote.rxlabCollect.upsertLink({ link: draft })
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return { merged: result.value.merged }
}

/** Delete one link; throws the readable failure text. */
export async function linkRemove(runtime: RxlabClientRuntime, id: CollectLinkId): Promise<void> {
  const result = await runtime.remote.rxlabCollect.removeLink({ id })
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
}

/** Import links from CSV text; returns the server's import summary. */
export async function importLinks(
  runtime: RxlabClientRuntime,
  text: string,
): Promise<{ created: number; updated: number; rejected: readonly { row: number; reason: string }[] }> {
  const result = await runtime.remote.rxlabCollect.importLinks({ text })
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return {
    created: result.value.created.length,
    updated: result.value.updated.length,
    rejected: result.value.rejected,
  }
}

/** Start one run batch over the given links; throws the readable failure text. */
export async function createBatch(
  runtime: RxlabClientRuntime,
  linkIds: readonly CollectLinkId[],
): Promise<CollectBatchId> {
  const result = await runtime.remote.rxlabCollect.createBatch({ linkIds })
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value.batch.id
}
