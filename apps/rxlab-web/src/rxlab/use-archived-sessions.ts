/**
 * Archived-session display set for the rxlab session list. The archive set is
 * a workspace-domain fact (`workspace.archiveSession` + the `workspace.follow`
 * baseline), while rxlab's list rows come from `session-controller.list`, so
 * the SPA keeps its own projection: read the complete set once per connection
 * from the follow baseline, then extend it locally as archiving happens.
 */
import { useEffect, useState } from 'react'

// Type-only: pulls the generated `remote.workspace` namespace declaration.
import type {} from '@deepseek-ai/dsh-api-workspace-controller/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RxlabClientRuntime } from './client'

export interface ArchivedSessions {
  /** Currently hidden session ids in Host order. */
  readonly ids: readonly SessionId[]
  /** Record one just-archived session locally (after the RPC accepted it). */
  readonly markArchived: (id: SessionId) => void
}

/** Load the workspace archive set once per ready connection. */
export function useArchivedSessions(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
): ArchivedSessions {
  const [ids, setIds] = useState<readonly SessionId[]>([])
  useEffect(() => {
    if (runtime === undefined || !connected) return
    let alive = true
    const controller = new AbortController()
    void (async () => {
      try {
        const frames = runtime.remote.workspace.follow(controller.signal)
        for await (const frame of frames) {
          if (!alive) break
          if (frame.type === 'baseline') {
            setIds(frame.value.archivedSessionIds)
            break
          }
          if (frame.type === 'archived') {
            setIds(frame.archivedSessionIds)
            break
          }
        }
      } catch (cause) {
        // Archive filtering degrades to empty on read failure (rows all shown).
        console.error('[rxlab] workspace archive baseline read failed:', cause)
      }
    })()
    return () => {
      alive = false
      controller.abort()
    }
  }, [runtime, connected])
  return {
    ids,
    markArchived: (id) => {
      setIds(prev => prev.includes(id) ? prev : [...prev, id])
    },
  }
}
