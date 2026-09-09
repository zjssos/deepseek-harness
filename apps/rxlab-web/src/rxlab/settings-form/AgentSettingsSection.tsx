/**
 * AgentSettingsSection: the shared module-default settings surface for the
 * agent workbench — the deployment namespaces that govern every session
 * (`llm-deepseek` provider knobs + `agent-default-model`). One seat lives in
 * the agent module's settings dialog, the other in the settings hub's agent
 * section; both render this same component so the two never drift. Edits apply
 * at module-default level: no per-session override channel exists yet. zh copy
 * until the app gains a locale dictionary.
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

export interface AgentSettingsSectionProps {
  readonly runtime: RxlabClientRuntime
  readonly connected: boolean
}

/** Module-default model/thinking settings for agent sessions, both seats. */
export function AgentSettingsSection({ runtime, connected }: AgentSettingsSectionProps) {
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
            ? '编辑会话模块默认：模型、思考与上下文设置写入 settings-rxlab.yaml，新建/后续请求即生效。'
            : '当前部署为只读，无法保存修改。'}
        </p>
        <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2" onClick={reload}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      {AGENT_NAMESPACE_DESCRIPTORS.map((descriptor) => {
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
