/**
 * Collect data hooks for the collect panel: reads and writes over the
 * embedded client runtime's generated `remote.rxlabCollect` namespace —
 * registered shops, the product entries filed under them, and the agent's
 * pending drafts. Like the catalog hooks, these use controlled refresh state
 * (a nonce the panel bumps after a mutation) rather than a long subscription.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

// Type-only: pulls the generated `remote.rxlabCollect` namespace declarations
// into the ClientRemote type shared with the rest of the workbench.
import type {} from '@deepseek-ai/dsh-rxlab-collect/remote'
import type {
  CollectDraft,
  CollectDraftId,
  CollectDraftTarget,
  CollectLink,
  CollectLinkDraft,
  CollectLinkId,
  CollectPlatform,
  CollectShop,
  CollectShopDraft,
  CollectShopId,
  CollectDraftStatus,
} from '@deepseek-ai/dsh-rxlab-collect/types'
import type { RxlabClientRuntime } from '@/rxlab/client'

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
 * Shared list-fetch body: re-fetches whenever the caller's key or the
 * connection changes and exposes a manual reload for post-mutation refresh.
 * Only a key change clears the rows; a reload keeps the previous rows visible
 * until the fresh result lands, so the page never blanks mid-refresh.
 */
function useList<T>(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  key: string,
  load: (runtime: RxlabClientRuntime) => Promise<readonly T[]>,
): ListController<T> {
  const [state, setState] = useState<FetchState<T>>({ phase: 'loading', items: [] })
  const [nonce, setNonce] = useState(0)
  const prevKey = useRef<string | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])

  useEffect(() => {
    if (runtime === undefined || !connected) return
    const keyChanged = prevKey.current !== key
    prevKey.current = key
    let alive = true
    if (keyChanged) setState({ phase: 'loading', items: [] })
    void loadRef.current(runtime)
      .then((items) => {
        if (alive) setState({ phase: 'ready', items })
      })
      .catch((cause: unknown) => {
        if (!alive) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setState(prev => (prev.items.length > 0
          ? { phase: 'ready', items: prev.items }
          : { phase: 'error', items: [], error: message }))
      })
    return () => { alive = false }
  }, [runtime, connected, key, nonce])

  return { state, reload }
}

/** Readable failure text of one failed Remote call. */
function failure(error: { readonly code: string; readonly message: string }): Error {
  return new Error(`${error.code}: ${error.message}`)
}

/** Scope filter the shop tree holds. */
export interface ShopListFilters {
  readonly platform?: CollectPlatform
  readonly query?: string
}

/** Fetch registered shops, newest write first. */
export function useShopList(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  filters: ShopListFilters,
): ListController<CollectShop> {
  const platformKey = filters.platform ?? ''
  const queryKey = (filters.query ?? '').trim()
  return useList<CollectShop>(
    runtime,
    connected,
    [platformKey, queryKey].join('\u0000'),
    async (client) => {
      const result = await client.remote.rxlabCollect.listShops({
        ...(filters.platform === undefined ? {} : { platform: filters.platform }),
        ...(queryKey.length === 0 ? {} : { query: queryKey }),
      })
      if (!result.ok) throw failure(result.error)
      return result.value.shops
    },
  )
}

/**
 * List filter the product ledger holds. `unfiled` selects the entries that
 * belong to no shop; `shopRef` selects one shop's entries.
 */
export interface LinkListFilters {
  readonly platform?: CollectPlatform
  readonly shopRef?: CollectShopId
  readonly unfiled?: boolean
  readonly query?: string
}

/** Fetch product entries, newest write first. */
export function useLinkList(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  filters: LinkListFilters,
): ListController<CollectLink> {
  const platformKey = filters.platform ?? ''
  const shopKey = filters.shopRef ?? ''
  const unfiledKey = filters.unfiled === true ? 'unfiled' : ''
  const queryKey = (filters.query ?? '').trim()
  return useList<CollectLink>(
    runtime,
    connected,
    [platformKey, shopKey, unfiledKey, queryKey].join('\u0000'),
    async (client) => {
      const result = await client.remote.rxlabCollect.listLinks({
        ...(filters.platform === undefined ? {} : { platform: filters.platform }),
        ...(filters.shopRef === undefined ? {} : { shopRef: filters.shopRef }),
        ...(unfiledKey === '' ? {} : { unfiled: true }),
        ...(queryKey.length === 0 ? {} : { query: queryKey }),
      })
      if (!result.ok) throw failure(result.error)
      return result.value.items
    },
  )
}

/** Review filter the draft queue holds. */
export interface DraftListFilters {
  readonly status?: CollectDraftStatus
  readonly target?: CollectDraftTarget
}

/** Fetch agent drafts, newest first. */
export function useDraftList(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  filters: DraftListFilters,
): ListController<CollectDraft> {
  const statusKey = filters.status ?? ''
  const targetKey = filters.target ?? ''
  return useList<CollectDraft>(
    runtime,
    connected,
    [statusKey, targetKey].join('\u0000'),
    async (client) => {
      const result = await client.remote.rxlabCollect.listDrafts({
        ...(filters.status === undefined ? {} : { status: filters.status }),
        ...(filters.target === undefined ? {} : { target: filters.target }),
      })
      if (!result.ok) throw failure(result.error)
      return result.value.drafts
    },
  )
}

/** Register or replace one shop; throws the readable failure text. */
export async function shopUpsert(
  runtime: RxlabClientRuntime,
  draft: CollectShopDraft,
): Promise<CollectShop> {
  const result = await runtime.remote.rxlabCollect.upsertShop({ shop: draft })
  if (!result.ok) throw failure(result.error)
  return result.value.shop
}

/** Delete one shop; its product entries return to unfiled. Throws the readable failure text. */
export async function shopRemove(
  runtime: RxlabClientRuntime,
  id: CollectShopId,
): Promise<{ unfiled: number }> {
  const result = await runtime.remote.rxlabCollect.removeShop({ id })
  if (!result.ok) throw failure(result.error)
  return { unfiled: result.value.unfiled }
}

/** Create or replace one product entry; throws the readable failure text. */
export async function linkUpsert(
  runtime: RxlabClientRuntime,
  draft: CollectLinkDraft,
): Promise<{ merged: boolean }> {
  const result = await runtime.remote.rxlabCollect.upsertLink({ link: draft })
  if (!result.ok) throw failure(result.error)
  return { merged: result.value.merged }
}

/** Delete one product entry; throws the readable failure text. */
export async function linkRemove(runtime: RxlabClientRuntime, id: CollectLinkId): Promise<void> {
  const result = await runtime.remote.rxlabCollect.removeLink({ id })
  if (!result.ok) throw failure(result.error)
}

/** Import product entries from CSV text into one shop; returns the server's import summary. */
export async function importLinks(
  runtime: RxlabClientRuntime,
  text: string,
  shopRef: CollectShopId | undefined,
): Promise<{ created: number; updated: number; rejected: readonly { row: number; reason: string }[] }> {
  const result = await runtime.remote.rxlabCollect.importLinks({
    text,
    ...(shopRef === undefined ? {} : { shopRef }),
  })
  if (!result.ok) throw failure(result.error)
  return {
    created: result.value.created.length,
    updated: result.value.updated.length,
    rejected: result.value.rejected,
  }
}

/**
 * Accept one pending draft. The optional shop files an accepted product entry
 * under it, overriding whatever the draft proposed.
 */
export async function draftCommit(
  runtime: RxlabClientRuntime,
  id: CollectDraftId,
  shopRef: CollectShopId | undefined,
): Promise<{ created: CollectShop | CollectLink }> {
  const result = await runtime.remote.rxlabCollect.commitDraft({
    id,
    ...(shopRef === undefined ? {} : { shopRef }),
  })
  if (!result.ok) throw failure(result.error)
  const created = result.value.shop ?? result.value.link
  if (created === undefined) throw new Error('草稿已确认，但服务端未返回落库记录')
  return { created }
}

/** Reject one pending draft; nothing is written. */
export async function draftReject(runtime: RxlabClientRuntime, id: CollectDraftId): Promise<void> {
  const result = await runtime.remote.rxlabCollect.rejectDraft({ id })
  if (!result.ok) throw failure(result.error)
}
