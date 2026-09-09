/**
 * ModuleAgentSurface: a reusable module-scoped agent session embed. Given a
 * module's agent composition (preset id + workspace subdir) it shows that
 * module's sessions only, lets the person start a fresh module session, and
 * drives the active one with the shared conversation components. The embed
 * renders one at a time because the SPA shows one workbench module per route;
 * wiki/fitting will mount the same surface with their own entries.
 */
import { useMemo, useState } from 'react'
import { Loader2, Plus, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Composer } from '@/modules/agent/Composer'
import { MessageList } from '@/modules/agent/MessageList'
import { foldTranscript } from '@/modules/agent/transcript'
import { useModelCatalog } from '@/modules/agent/use-model-catalog'
import { ModuleUsageChips, SessionUsageLine } from '@/modules/agent/SessionUsage'
import { useLiveSessionUsage } from '@/modules/agent/use-usage'
import type { ModuleAgentMapping } from '@/rxlab/session-cwd'
import { useWorkspaceRoot } from '@/rxlab/use-settings'
import {
  useConnected,
  useRxlabClient,
  useSessionActions,
  useSessionList,
  useSessionView,
} from '@/rxlab/use-sessions'
import type { RxlabClientRuntime } from '@/rxlab/client'

export interface ModuleAgentSurfaceProps {
  /** Workbench module id (registry) whose sessions this surface scopes to. */
  readonly moduleId: string
  /** The module's agent composition (preset id + workspace subdir). */
  readonly agent: ModuleAgentMapping
  /** zh module label for headers. */
  readonly label: string
}

/** One workbench module's scoped agent conversation embed. */
export function ModuleAgentSurface({ agent, label }: ModuleAgentSurfaceProps) {
  const { runtime } = useRxlabClient()
  const connected = useConnected(runtime)

  if (runtime === undefined) {
    return (
      <div className="flex items-center gap-3 rounded-xl border p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />会话数据层启动中…
      </div>
    )
  }
  return <ScopedAgent runtime={runtime} connected={connected} agent={agent} label={label} />
}

function ScopedAgent({
  runtime, connected, agent, label,
}: { runtime: RxlabClientRuntime; connected: boolean; agent: ModuleAgentMapping; label: string }) {
  const workspaceRoot = useWorkspaceRoot(runtime, connected)
  const list = useSessionList(runtime)
  const actions = useSessionActions(runtime)
  const view = useSessionView(runtime, list)
  const modelState = useModelCatalog(runtime, connected)
  const liveUsage = useLiveSessionUsage(view)
  const [creating, setCreating] = useState(false)

  const moduleCwd = workspaceRoot === undefined ? undefined : `${workspaceRoot}/${agent.subdir}`

  const moduleRows = useMemo(() => {
    if (list === undefined || moduleCwd === undefined) return []
    return list.ids
      .map(id => list.byId[id])
      .filter((row): row is NonNullable<typeof row> =>
        row !== undefined
        && (row.cwd === moduleCwd || (row.cwd ?? '').startsWith(`${moduleCwd}/`)))
  }, [list, moduleCwd])

  const currentScoped = view !== undefined && moduleRows.some(row => row.id === view.sessionId)
  const rows = view === undefined || !currentScoped ? [] : foldTranscript(view.window.entries)

  const onCreate = async (): Promise<void> => {
    if (creating || moduleCwd === undefined) return
    setCreating(true)
    try {
      // create() opens the new session itself.
      await actions.create({ agentPreset: agent.preset, cwd: moduleCwd })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-[calc(100svh-16rem)] min-h-[24rem] flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{label} · 采集助手</h3>
          <Badge variant="secondary">{agent.preset}</Badge>
        </div>
        <Button size="sm" disabled={!connected || creating || moduleCwd === undefined} onClick={() => { void onCreate() }}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          新建模块会话
        </Button>
      </div>

      <Card className="min-h-0 flex-1">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">模块会话（{moduleRows.length}）</CardTitle>
            <CardDescription className="text-xs">
              运行在 <code className="font-mono">{moduleCwd ?? `${agent.subdir}/`}</code>，工具与技能按 {label} 模块预设收敛。
            </CardDescription>
          </div>
          {liveUsage !== undefined ? <SessionUsageLine totals={liveUsage} /> : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-col gap-2">
          <ScrollArea className="max-h-28 shrink-0">
            <div className="flex flex-col gap-1 pr-2">
              {moduleRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">还没有该模块的会话，点「新建模块会话」开始。</p>
              ) : (
                moduleRows.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => { actions.open(row.id) }}
                    className={`rounded-md px-2 py-1 text-left text-sm ${
                      row.id === view?.sessionId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                    }`}
                  >
                    {row.displayTitle}
                    {row.running ? <span className="ml-2 text-[10px] text-muted-foreground">运行中</span> : null}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border">
            {!currentScoped ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {moduleCwd === undefined ? '工作空间根目录未知：请先在全局设置确认工作空间。' : '选择或新建一个模块会话后在此对话。'}
              </div>
            ) : (
              <>
                <div className="flex min-h-0 flex-1 flex-col">
                  {view !== undefined && liveUsage !== undefined ? (
                    <div className="flex items-center justify-between border-b px-3 py-1 text-[11px] text-muted-foreground">
                      <SessionUsageLine totals={liveUsage} />
                      <ModuleUsageChips modules={[]} />
                    </div>
                  ) : null}
                  <div className="flex min-h-0 flex-1 flex-col">
                    <MessageList view={view} rows={rows} onForkAt={() => {}} />
                  </div>
                </div>
                <Composer runtime={runtime} view={view} connected={connected} modelState={modelState} />
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
