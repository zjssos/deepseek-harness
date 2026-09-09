import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import {
  clientState,
  rxlabClient,
  subscribeClientState,
  type RxlabClientRuntime,
} from './client'
import type {
  SessionEventWindow,
  SessionFace,
  SessionListState,
  SessionSnapshot,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { AgentPresetRow } from '@deepseek-ai/dsh-agent-presets/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the generated `remote.session`/`remote.workspace` and
// `remote.credentials` namespace declarations into the ClientRemote type.
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/remote'
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
import type {} from '@deepseek-ai/dsh-agent-presets/remote'

/**
 * React adapters over the embedded Cordis client data layer. rxlab-web is a
 * standalone React app (no Cordis UI roster), so these hooks bind the object
 * layer's plain observable sources with useSyncExternalStore directly.
 *
 * uSES contracts: subscribe/getSnapshot stay stable per source and are always
 * called — a source that is absent yet (runtime still booting) uses the empty
 * subscribe plus a constant snapshot, so hook order never changes across the
 * boot transition (a conditional uSES throws "Invalid hook call").
 */

/** No-op subscribe while the underlying source is absent. */
export function emptySubscribe(): () => void {
  return () => {}
}

/** Boot the embedded data layer once and surface its lifecycle. */
export function useRxlabClient(): {
  readonly phase: 'booting' | 'ready' | 'failed'
  readonly error?: string
  readonly runtime?: RxlabClientRuntime
} {
  const phase = useSyncExternalStore(subscribeClientState, clientState)
  const [runtime, setRuntime] = useState<RxlabClientRuntime | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void rxlabClient()
      .then((value) => {
        if (alive) setRuntime(value)
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { alive = false }
  }, [])
  if (phase.phase === 'failed') return { phase: 'failed', error: phase.error ?? error }
  if (runtime !== undefined) return { phase: 'ready', runtime }
  return { phase: 'booting', error }
}

/** Live host session list snapshot for one ready runtime. */
export function useSessionList(runtime: RxlabClientRuntime | undefined): SessionListState | undefined {
  const source = runtime?.sessions.list
  const subscribe = useMemo(() => {
    if (source === undefined) return emptySubscribe
    return (callback: () => void) => source.subscribe(callback)
  }, [source])
  const getSnapshot = useMemo(() => {
    if (source === undefined) return (): SessionListState | undefined => undefined
    return (): SessionListState | undefined => source.getSnapshot()
  }, [source])
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Agent preset roster state the session picker renders. */
export interface AgentPresetRosterState {
  /** Roster read outcome: loading, loaded, or failed. */
  readonly status: 'loading' | 'ok' | 'error'
  /** Shown rows (composeable presets first-come order, broken kept for display). */
  readonly presets: readonly AgentPresetRow[]
  /** Read failure message when the roster could not be listed. */
  readonly error?: string
}

const EMPTY_ROSTER: AgentPresetRosterState = { status: 'loading', presets: [] }

/**
 * Read the Host agent-preset roster once per connection. A deployment that
 * composes no presets (agentPresets row absent) reports an empty roster via
 * the optional-namespace contract; a read failure surfaces its message so
 * the picker can show why presets are missing.
 */
export function useAgentPresets(runtime: RxlabClientRuntime | undefined, connected: boolean): AgentPresetRosterState {
  const [state, setState] = useState<AgentPresetRosterState>(EMPTY_ROSTER)
  useEffect(() => {
    if (!connected || runtime === undefined) return
    let alive = true
    setState(EMPTY_ROSTER)
    runtime.remote.agentPresets.list()
      .then((result) => {
        if (!alive) return
        if (result.ok) {
          setState({ status: 'ok', presets: result.value.presets })
        } else {
          setState({ status: 'error', presets: [], error: `${result.error.code}: ${result.error.message}` })
        }
      })
      .catch((cause: unknown) => {
        if (alive) setState({ status: 'error', presets: [], error: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { alive = false }
  }, [runtime, connected])
  return state
}

/** Refresh/current/open/create/clear/archive/fork helpers bound to one runtime. */
export function useSessionActions(runtime: RxlabClientRuntime | undefined): SessionActions {
  return useMemo<SessionActions>(() => {
    if (runtime === undefined) {
      return {
        refresh: async () => {},
        create: async () => undefined,
        open: () => {},
        clear: () => {},
        archive: async () => false,
        forkAt: async () => undefined,
      }
    }
    return {
      refresh: async () => { await runtime.sessions.refresh() },
      create: async (opts) => {
        const request = {
          ...(opts?.agentPreset === undefined ? {} : { agentPreset: opts.agentPreset }),
          ...(opts?.cwd === undefined ? {} : { cwd: opts.cwd }),
        }
        const id = await runtime.sessions.create(request)
        runtime.sessions.open(id)
        return id
      },
      open: (id) => { runtime.sessions.open(id) },
      clear: () => { runtime.sessions.clear() },
      archive: async (id) => {
        const result = await runtime.remote.workspace.archiveSession({ sessionId: id })
        return result.ok
      },
      forkAt: async (id, seq) => {
        try {
          const childId = await runtime.sessions.fork({ sessionId: id, atSeq: seq, increaseTitle: true })
          runtime.sessions.open(childId)
          return childId
        } catch {
          // Fork or child-title failure leaves the source view unchanged.
          return undefined
        }
      },
    }
  }, [runtime])
}

/** Session-management verbs the workbench UI drives. */
export interface SessionActions {
  /** Re-pull the Host session list. */
  readonly refresh: () => Promise<void>
  /** Create and open a session, optionally composed from an Agent preset and rooted at a workspace directory. */
  readonly create: (opts?: { readonly agentPreset?: string; readonly cwd?: string }) => Promise<string | undefined>
  /** Select one listed session as current. */
  readonly open: (id: SessionId) => void
  /** Clear the current selection back to the no-session view. */
  readonly clear: () => void
  /** Archive one session (hides its row; the log and accounting stay intact). */
  readonly archive: (id: SessionId) => Promise<boolean>
  /** Fork at one row's seq and open the child; resolves undefined on failure. */
  readonly forkAt: (id: SessionId, seq: number) => Promise<string | undefined>
}

/** Whether the browser transport generation ($events ready) is established. */
export function useConnected(runtime: RxlabClientRuntime | undefined): boolean {
  const source = runtime?.connection.generation
  const subscribe = useMemo(() => {
    if (source === undefined) return emptySubscribe
    return (callback: () => void) => source.subscribe(callback)
  }, [source])
  const getSnapshot = useMemo(() => {
    if (source === undefined) return (): boolean => false
    return (): boolean => source.getSnapshot() !== undefined
  }, [source])
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** The live face of the currently selected session, when one is staged. */
export interface SessionView {
  readonly sessionId: SessionId
  /** Behavior verbs (prompt/cancel/rename/...) on the staged session. */
  readonly face: SessionFace
  /** Live lifecycle snapshot: running/queue/openState/promptError/... */
  readonly snapshot: SessionSnapshot
  /** Contiguous event window feeding the conversation rows. */
  readonly window: SessionEventWindow
}

/**
 * Subscribe to the current session's snapshot and event window. The binding
 * resolves synchronously (the object layer caches one scope per staged
 * session); snapshot and window sources flip from empty to live exactly when
 * the current id appears, with hook order held constant across the flip.
 * @param runtime - ready client runtime.
 * @param list - live session list (the current id rides its snapshot).
 * @returns the staged session view, or undefined while no session is current.
 */
export function useSessionView(
  runtime: RxlabClientRuntime | undefined,
  list: SessionListState | undefined,
): SessionView | undefined {
  const currentId = list?.current
  const binding = currentId === undefined || runtime === undefined
    ? undefined
    : runtime.sessions.binding(currentId)

  const snapshotSource = binding?.session
  const snapshotSubscribe = useMemo(() => {
    if (snapshotSource === undefined) return emptySubscribe
    return (callback: () => void) => snapshotSource.subscribe(callback)
  }, [snapshotSource])
  const snapshotGet = useMemo(() => {
    if (snapshotSource === undefined) return (): SessionSnapshot | undefined => undefined
    return (): SessionSnapshot | undefined => snapshotSource.getSnapshot()
  }, [snapshotSource])
  const snapshot = useSyncExternalStore(snapshotSubscribe, snapshotGet)

  const windowSource = binding?.eventSource
  const windowSubscribe = useMemo(() => {
    if (windowSource === undefined) return emptySubscribe
    return (callback: () => void) => windowSource.subscribe(callback)
  }, [windowSource])
  const windowGet = useMemo(() => {
    if (windowSource === undefined) return (): SessionEventWindow | undefined => undefined
    return (): SessionEventWindow | undefined => windowSource.getSnapshot()
  }, [windowSource])
  const window = useSyncExternalStore(windowSubscribe, windowGet)

  if (binding === undefined || currentId === undefined || snapshot === undefined || window === undefined) {
    return undefined
  }
  return { sessionId: currentId, face: binding.session, snapshot, window }
}
