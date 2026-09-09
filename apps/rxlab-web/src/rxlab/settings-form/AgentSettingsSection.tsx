/**
 * SettingsSection: the shared descriptor-driven settings surface for one
 * workbench module. Given a list of namespace descriptors it renders each as a
 * titled SchemaForm group with its applies badge, plus one loading/error/read-
 * only toolbar. The agent module's dialog and the settings hub both use it so
 * seats never drift. Edits apply at module-default level: no per-session
 * override channel exists yet. zh copy until the app gains a locale
 * dictionary.
 */
import { useMemo, useState } from 'react'
import { CircleAlert, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-settings/types'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { useSettingsDescribe } from '@/rxlab/use-settings'
import { agentDefaultModelDescriptor, llmDeepseekDescriptor } from './hints'
import { SchemaForm } from './SchemaForm'
import type { NamespaceDescriptor } from './types'

const AGENT_NAMESPACE_DESCRIPTORS: readonly NamespaceDescriptor[] = [
  llmDeepseekDescriptor,
  agentDefaultModelDescriptor,
]

export interface SettingsSectionProps {
  readonly runtime: RxlabClientRuntime
  readonly connected: boolean
  /** Namespace sections to render; defaults to the agent module's model namespaces. */
  readonly descriptors?: readonly NamespaceDescriptor[]
  /** One-line zh toolbar copy describing the surface's effect. */
  readonly note?: string
}

/** Module-default settings sections (agent model namespaces unless overridden). */
export function SettingsSection({
  runtime, connected, descriptors = AGENT_NAMESPACE_DESCRIPTORS, note,
}: SettingsSectionProps) {
  const { state, reload } = useSettingsDescribe(runtime, connected)
  const [savedViews, setSavedViews] = useState<ReadonlyMap<string, SettingsNamespaceView>>(new Map())

  const viewsByNamespace = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, SettingsNamespaceView>()
    const merged = new Map<string, SettingsNamespaceView>()
    for (const view of state.value.namespaces) {
      merged.set(view.ns, savedViews.get(view.ns) ?? view)
    }
    return merged
  }, [state, savedViews])

  const onSaved = (next: SettingsNamespaceView): void => {
    setSavedViews(prev => new Map(prev).set(next.ns, next))
  }

  if (!connected) return <p className="text-sm text-muted-foreground">数据层未就绪。</p>
  if (state.status === 'loading') return <Skeleton className="h-28" />
  if (state.status === 'error') {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>读取设置失败：{state.message}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {state.value.writable
            ? (note ?? '编辑写入 settings-rxlab.yaml；需重启的分区在下一次启动生效。')
            : '当前部署为只读，无法保存修改。'}
        </p>
        <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2" onClick={reload}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      {descriptors.map((descriptor) => {
        const view = viewsByNamespace.get(descriptor.ns)
        if (view === undefined) {
          return (
            <div key={descriptor.ns} className="flex flex-col gap-1">
              <p className="text-xs font-medium">{descriptor.title}</p>
              <p className="text-xs text-muted-foreground">该分区尚未装配（命名空间未注册）。</p>
            </div>
          )
        }
        return (
          <div key={descriptor.ns} className="flex flex-col gap-2.5 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">{descriptor.title}</p>
              <Badge variant="secondary">{view.applies === 'restart' ? '需重启' : '即时生效'}</Badge>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">{descriptor.ns}</p>
            <SchemaForm runtime={runtime} view={view} descriptor={descriptor} onSaved={onSaved} />
          </div>
        )
      })}
    </div>
  )
}

/** Back-compat name: the agent module's default namespace sections. */
export function AgentSettingsSection(props: SettingsSectionProps) {
  return <SettingsSection {...props} />
}
