/**
 * Settings-module data layer: read the host's settings describe view and the
 * agent-preset roster, and issue the matching writes, all over the embedded
 * client runtime's generated Remote namespaces. zh copy until the app gains a
 * locale dictionary.
 */
import { useCallback, useEffect, useState } from 'react'

import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
// Type-only: pulls the generated `remote.settings` namespace declaration.
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
// Type-only: pulls the generated `remote.agentPresets` namespace declaration.
import type {} from '@deepseek-ai/dsh-agent-presets/remote'
import type { SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-settings/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { RxlabClientRuntime } from '@/modules/agent/client'

export const AGENT_PRESETS_NAMESPACE = 'agent-presets'

export const WORKSPACE_SETTINGS_NAMESPACE = 'rxlab-workspace'

export type LoadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly value: T }

/** Live describe view plus a reload trigger, refetched when connected flips. */
export function useSettingsDescribe(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
): { readonly state: LoadState<SettingsDescribeValue>; readonly reload: () => void } {
  const [state, setState] = useState<LoadState<SettingsDescribeValue>>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])
  useEffect(() => {
    if (runtime === undefined || !connected) return
    let alive = true
    setState({ status: 'loading' })
    void runtime.remote.settings.describe()
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setState({ status: 'error', message: `${result.error.code}: ${result.error.message}` })
          return
        }
        setState({ status: 'ready', value: result.value })
      })
      .catch((cause: unknown) => {
        if (alive) setState({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { alive = false }
  }, [runtime, connected, nonce])
  return { state, reload }
}

/** Live agent-preset roster plus a reload trigger. */
export function usePresetRoster(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
): { readonly state: LoadState<AgentPresetRoster>; readonly reload: () => void } {
  const [state, setState] = useState<LoadState<AgentPresetRoster>>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => { setNonce(value => value + 1) }, [])
  useEffect(() => {
    if (runtime === undefined || !connected) return
    let alive = true
    setState({ status: 'loading' })
    void runtime.remote.agentPresets.list()
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setState({ status: 'error', message: `${result.error.code}: ${result.error.message}` })
          return
        }
        setState({ status: 'ready', value: result.value })
      })
      .catch((cause: unknown) => {
        if (alive) setState({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { alive = false }
  }, [runtime, connected, nonce])
  return { state, reload }
}

/** Merge one scalar patch into a namespace; resolves the fresh view or null. */
export async function updateNamespace(
  runtime: RxlabClientRuntime,
  ns: string,
  patch: Record<string, JsonValue>,
  expectedRevision: number | undefined,
): Promise<SettingsNamespaceView | null> {
  const result = await runtime.remote.settings.update(ns, patch, expectedRevision)
  return result.ok ? result.value : null
}

/** Remove one field's user override so it re-inherits the composition base. */
export async function unsetNamespaceField(
  runtime: RxlabClientRuntime,
  ns: string,
  field: string,
  expectedRevision: number | undefined,
): Promise<SettingsNamespaceView | null> {
  const ops: SettingsPathOpView[] = [{ op: 'unset', path: [field] }]
  const result = await runtime.remote.settings.mutate(ns, ops, expectedRevision)
  return result.ok ? result.value : null
}

/** Copy one preset to a new id; resolves an error string, or undefined on success. */
export async function copyPreset(
  runtime: RxlabClientRuntime,
  from: string,
  id: string,
  name?: string,
): Promise<string | undefined> {
  const result = await runtime.remote.agentPresets.copy(from, id, name)
  return result.ok ? undefined : `${result.error.code}: ${result.error.message}`
}

/** Delete one locally authored preset; resolves an error string, or undefined on success. */
export async function deletePreset(runtime: RxlabClientRuntime, id: string): Promise<string | undefined> {
  const result = await runtime.remote.agentPresets.deletePreset(id)
  return result.ok ? undefined : `${result.error.code}: ${result.error.message}`
}

/** Set the default preset through the `agent-presets` settings namespace. */
export async function setDefaultPreset(
  runtime: RxlabClientRuntime,
  id: string,
  expectedRevision: number | undefined,
): Promise<string | undefined> {
  const result = await runtime.remote.settings.update(AGENT_PRESETS_NAMESPACE, { default: id }, expectedRevision)
  return result.ok ? undefined : `${result.error.code}: ${result.error.message}`
}

/**
 * Live workbench workspace root from the `rxlab-workspace` settings namespace.
 * Resolves undefined while loading, on failure, or when the host composes no
 * such namespace, so session creation falls back to the host default cwd.
 */
export function useWorkspaceRoot(
  runtime: RxlabClientRuntime | undefined,
  connected: boolean,
): string | undefined {
  const { state } = useSettingsDescribe(runtime, connected)
  if (state.status !== 'ready') return undefined
  const view = state.value.namespaces.find(entry => entry.ns === WORKSPACE_SETTINGS_NAMESPACE)
  if (view === undefined) return undefined
  const value = view.value
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const root = (value as Record<string, JsonValue>).root
  return typeof root === 'string' && root !== '' ? root : undefined
}
