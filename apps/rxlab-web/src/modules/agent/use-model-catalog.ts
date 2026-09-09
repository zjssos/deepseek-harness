/**
 * Model catalog loading + selection for the rxlab conversation. The catalog
 * is Host-generation state fetched through the generated `remote.session`
 * namespace; this hook keeps one load per connection and exposes the select
 * verb for the composer.
 */
import { useEffect, useState } from 'react'

// Type-only: pulls the generated `remote.session` namespace declaration
// (modelCatalog/selectModel) into the client's ClientRemote type.
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {
  ModelCatalog,
  ModelSelection,
  SessionSelectModelRequest,
} from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RxlabClientRuntime } from '@/rxlab/client'

export type ModelCatalogStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ModelCatalogState {
  readonly status: ModelCatalogStatus
  readonly catalog?: ModelCatalog
  readonly error?: string
}

/** Load the Host-generation model catalog once per ready connection. */
export function useModelCatalog(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
): ModelCatalogState & { readonly reload: () => void } {
  const [state, setState] = useState<ModelCatalogState>({ status: 'idle' })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (runtime === undefined || !connected) return
    let alive = true
    setState(current => current.status === 'ready' ? current : { status: 'loading' })
    void runtime.remote.session.modelCatalog()
      .then((result) => {
        if (!alive) return
        if (result.ok) setState({ status: 'ready', catalog: result.value })
        else setState({ status: 'error', error: `${result.error.code}: ${result.error.message}` })
      })
      .catch((cause: unknown) => {
        if (alive) {
          setState({ status: 'error', error: cause instanceof Error ? cause.message : String(cause) })
        }
      })
    return () => { alive = false }
  }, [runtime, connected, nonce])
  return { ...state, reload: () => { setNonce(value => value + 1) } }
}

/**
 * Submit one model selection for the staged session through the remote verb.
 * @param runtime - ready client runtime.
 * @param sessionId - the staged session identity.
 * @param selection - provider/model/reasoning-effort selection.
 * @returns the Host-normalized selection, or undefined on failure.
 */
export async function selectSessionModel(
  runtime: RxlabClientRuntime,
  sessionId: SessionId,
  selection: ModelSelection,
): Promise<ModelSelection | undefined> {
  const request: SessionSelectModelRequest = { sessionId, ...selection }
  const result = await runtime.remote.session.selectModel(request)
  return result.ok ? result.value.selected : undefined
}
