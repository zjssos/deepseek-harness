/**
 * Token-usage state for the agent workbench: live totals from the staged
 * session's projection face, durable per-session rows from the host
 * `rxlabUsage` namespace (cold sessions the live stream never carried), and
 * per-module aggregates for the session rail. zh copy until the app gains a
 * locale dictionary.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

// Type-only: pulls the generated `remote.rxlabUsage` namespace declarations
// into the ClientRemote type shared with the rest of the workbench.
import type {} from '@deepseek-ai/dsh-rxlab-usage/remote'
import type { ModuleUsageSummary, UsageTotals } from '@deepseek-ai/dsh-rxlab-usage/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { emptySubscribe, type SessionView } from '@/rxlab/use-sessions'

/** Decode an unknown projection value into token totals; null when not totals. */
export function totalsOf(value: unknown): UsageTotals | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const read = (key: string): number | null =>
    typeof record[key] === 'number' && Number.isFinite(record[key] as number) && (record[key] as number) >= 0
      ? record[key] as number
      : null
  const uncachedInputTokens = read('uncachedInputTokens')
  const outputTokens = read('outputTokens')
  const cacheReadTokens = read('cacheReadTokens')
  const cacheWriteTokens = read('cacheWriteTokens')
  if (uncachedInputTokens === null || outputTokens === null || cacheReadTokens === null || cacheWriteTokens === null) {
    return null
  }
  return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

/** Sum of every bucket (the billing-visible total). */
export function totalTokens(totals: UsageTotals): number {
  return totals.uncachedInputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
}

/** Whether every bucket is zero. */
export function isEmptyTotals(totals: UsageTotals): boolean {
  return totalTokens(totals) === 0
}

/** Live token totals of the currently staged session (its projection face). */
export function useLiveSessionUsage(view: SessionView | undefined): UsageTotals | undefined {
  const source = view?.face.projections.faceOf('tokenUsage')
  const subscribe = useMemo(() => {
    if (source === undefined) return emptySubscribe
    return (callback: () => void) => source.subscribe(callback)
  }, [source])
  const getSnapshot = useMemo(() => {
    if (source === undefined) return (): unknown => undefined
    return (): unknown => source.getSnapshot()
  }, [source])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  if (snapshot === undefined) return undefined
  const totals = totalsOf(snapshot)
  return totals === null || isEmptyTotals(totals) ? undefined : totals
}

export interface SessionUsageMapState {
  /** Token totals by session id; absent id means the row carries no usage yet. */
  readonly byId: Readonly<Record<string, UsageTotals>>
  /** Whether a durable backfill is still in flight. */
  readonly pending: boolean
}

/**
 * List-column usage: prefers each row's live projection value, then fills the
 * gaps from the host's durable rxlabUsage rows whenever the listed session set
 * changes. Hosts without the rxlab-usage row degrade to the live values only.
 */
export function useSessionUsageMap(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
  list: SessionListState | undefined,
): SessionUsageMapState {
  const listKey = useMemo(() => {
    if (list === undefined) return undefined
    return list.ids.join('\u0000')
  }, [list])

  const [durable, setDurable] = useState<Readonly<Record<string, UsageTotals>>>({})
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!connected || runtime === undefined || listKey === undefined) return
    const ids = listKey.length === 0 ? [] : listKey.split('\u0000')
    if (ids.length === 0 || runtime.remote.rxlabUsage === undefined) return
    let alive = true
    setPending(true)
    void runtime.remote.rxlabUsage.sessionUsage({ ids })
      .then((result) => {
        if (!alive) return
        const rows: Record<string, UsageTotals> = {}
        if (result.ok) {
          for (const row of Object.values(result.value.sessions)) {
            rows[row.sessionId] = row.totals
          }
        }
        setDurable(rows)
      })
      .catch(() => { /* durable backfill degrades to live projection values */ })
      .finally(() => { if (alive) setPending(false) })
    return () => { alive = false }
  }, [runtime, connected, listKey])

  const byId = useMemo(() => {
    const merged: Record<string, UsageTotals> = {}
    if (list !== undefined) {
      for (const id of list.ids) {
        const row = list.byId[id]
        if (row === undefined) continue
        const raw = (row.projectionValues as Partial<Record<string, unknown>> | undefined)?.['tokenUsage']
        const live = totalsOf(raw)
        if (live !== null && !isEmptyTotals(live)) {
          merged[id] = live
          continue
        }
        const durableRow = durable[id]
        if (durableRow !== undefined) merged[id] = durableRow
      }
    }
    return merged
  }, [list, durable])

  return { byId, pending }
}

/** Per-module aggregate state read once per connection from the host row. */
export interface ModuleUsageState {
  readonly modules: readonly ModuleUsageSummary[]
  readonly error?: string
}

export function useModuleUsage(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
): ModuleUsageState {
  const [state, setState] = useState<ModuleUsageState>({ modules: [] })
  useEffect(() => {
    if (!connected || runtime === undefined || runtime.remote.rxlabUsage === undefined) return
    let alive = true
    void runtime.remote.rxlabUsage.summary()
      .then((result) => {
        if (!alive) return
        if (result.ok) setState({ modules: result.value.modules })
        else setState({ modules: [], error: `${result.error.code}: ${result.error.message}` })
      })
      .catch((cause: unknown) => {
        if (alive) {
          setState({ modules: [], error: cause instanceof Error ? cause.message : String(cause) })
        }
      })
    return () => { alive = false }
  }, [runtime, connected])
  return state
}
