/**
 * Credential state for the model settings dialog. The dialog reads and writes
 * the same `.credentials.yaml` the web Models page owns: `credentials/describe`
 * reports configured state, `credentials/set` stores a value, and `unset`
 * clears it. DeepSeek's adapter resolves the default env ref `DEEPSEEK_API_KEY`
 * per request, which is what this dialog edits unless the user overrides it.
 */
import { useCallback, useEffect, useState } from 'react'

// Type-only: pulls the generated `remote.credentials` namespace declaration.
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
import type { RxlabClientRuntime } from './client'

export const DEFAULT_API_KEY_REF = 'DEEPSEEK_API_KEY'

export type CredentialStatus = 'idle' | 'loading' | 'configured' | 'missing' | 'error'

export interface CredentialState {
  readonly status: CredentialStatus
  /** Configured (masked) value when the ref resolves. */
  readonly configured: boolean
  readonly error?: string
}

/** Read one credential ref's configured state from the host. */
export function useCredential(
  runtime: RxlabClientRuntime | undefined,
  ref: string,
): CredentialState & { readonly reload: () => void } {
  const [state, setState] = useState<CredentialState>({ status: 'idle', configured: false })
  const [nonce, setNonce] = useState(0)
  const effectiveRef = ref.trim().length > 0 ? ref.trim() : DEFAULT_API_KEY_REF
  useEffect(() => {
    if (runtime === undefined) return
    let alive = true
    setState({ status: 'loading', configured: false })
    void runtime.remote.credentials.describe([effectiveRef])
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setState({ status: 'error', configured: false, error: `${result.error.code}: ${result.error.message}` })
          return
        }
        const info = result.value[effectiveRef]
        setState({
          status: info?.configured === true ? 'configured' : 'missing',
          configured: info?.configured === true,
        })
      })
      .catch((cause: unknown) => {
        if (alive) {
          setState({
            status: 'error',
            configured: false,
            error: cause instanceof Error ? cause.message : String(cause),
          })
        }
      })
    return () => { alive = false }
  }, [runtime, effectiveRef, nonce])
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])
  return { ...state, reload }
}

/** Store one credential ref value on the host; resolves false on rejection. */
export async function setCredential(
  runtime: RxlabClientRuntime,
  ref: string,
  value: string,
): Promise<boolean> {
  const result = await runtime.remote.credentials.set(ref, value)
  return result.ok
}

/** Clear one credential ref; resolves false on rejection. */
export async function clearCredential(
  runtime: RxlabClientRuntime,
  ref: string,
): Promise<boolean> {
  const result = await runtime.remote.credentials.unset(ref)
  return result.ok
}
