/**
 * Content data hooks for the 内容管理 panel: list/get/upsert/delete over the
 * generated `remote.rxlabContent` namespace, filtered by kind and stage. Reads
 * use controlled refresh state (a nonce bumped after each mutation).
 */
import { useCallback, useEffect, useState } from 'react'

// Type-only: pulls the generated `remote.rxlabContent` namespace declarations
// into the ClientRemote type shared with the rest of the workbench.
import type {} from '@deepseek-ai/dsh-rxlab-content/remote'
import type {
  ContentItem,
  ContentItemDraft,
  ContentItemId,
  ContentItemSummary,
  ContentKind,
  StageId,
} from '@deepseek-ai/dsh-rxlab-content/types'
import type { RxlabClientRuntime } from '@/rxlab/client'

/** List filters the content browser holds. */
export interface ContentListFilters {
  readonly kind: ContentKind
  /** Restrict to one stage; undefined lists every stage. */
  readonly stage?: StageId
  readonly query?: string
}

/** One content list fetch snapshot. */
export interface ContentListState {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly items: readonly ContentItemSummary[]
  readonly error?: string
}

/** One running content list plus a manual refresh trigger. */
export interface ContentListController {
  readonly state: ContentListState
  readonly reload: () => void
}

/** Human-readable failure text for a rejected Remote result. */
function failure(error: { readonly code: string; readonly message: string }): string {
  return `${error.code}: ${error.message}`
}

/** Fetch content items whenever the runtime connects, the filter changes, or a mutation refreshes. */
export function useContentList(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  filters: ContentListFilters,
): ContentListController {
  const [state, setState] = useState<ContentListState>({ phase: 'loading', items: [] })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])

  const stageKey = filters.stage ?? ''
  const queryKey = (filters.query ?? '').trim()
  useEffect(() => {
    if (runtime === undefined || !connected || runtime.remote.rxlabContent === undefined) return
    let alive = true
    setState({ phase: 'loading', items: [] })
    void runtime.remote.rxlabContent.list({
      kind: filters.kind,
      ...(filters.stage === undefined ? {} : { stage: filters.stage }),
      ...(queryKey.length === 0 ? {} : { query: queryKey }),
    })
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setState({ phase: 'error', items: [], error: failure(result.error) })
          return
        }
        setState({ phase: 'ready', items: result.value.items })
      })
      .catch((cause: unknown) => {
        if (alive) setState({ phase: 'error', items: [], error: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { alive = false }
  }, [runtime, connected, filters.kind, stageKey, queryKey, nonce])

  return { state, reload }
}

/** Read one full content item; throws the readable failure text. */
export async function contentGet(runtime: RxlabClientRuntime, id: ContentItemId): Promise<ContentItem> {
  const result = await requireContentRemote(runtime).get({ id })
  if (!result.ok) throw new Error(failure(result.error))
  return result.value.item
}

/** Create or replace one content item; throws the readable failure text. */
export async function contentUpsert(
  runtime: RxlabClientRuntime,
  item: ContentItemDraft,
  id?: ContentItemId,
): Promise<ContentItem> {
  const result = await requireContentRemote(runtime).upsert({ item, ...(id === undefined ? {} : { id }) })
  if (!result.ok) throw new Error(failure(result.error))
  return result.value.item
}

/** Delete one content item; throws the readable failure text. */
export async function contentDelete(runtime: RxlabClientRuntime, id: ContentItemId): Promise<boolean> {
  const result = await requireContentRemote(runtime).delete({ id })
  if (!result.ok) throw new Error(failure(result.error))
  return result.value.removed
}

/** The generated content namespace, or a loud failure when the row is not composed. */
function requireContentRemote(runtime: RxlabClientRuntime): NonNullable<RxlabClientRuntime['remote']['rxlabContent']> {
  const remote = runtime.remote.rxlabContent
  if (remote === undefined) throw new Error('rxlabContent namespace is not composed in this deployment.')
  return remote
}
