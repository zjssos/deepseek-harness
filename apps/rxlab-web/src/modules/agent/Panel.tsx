import { useEffect, useState } from 'react'
import { CircleAlert, Loader2, LogOut, Settings } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ModulePanelProps } from '@/modules/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { sessionCwd } from '@/rxlab/session-cwd'
import { useModuleAgents, useWorkspaceRoot } from '@/rxlab/use-settings'
import { useArchivedSessions } from '@/rxlab/use-archived-sessions'
import {
  useAgentPresets,
  useConnected,
  useRxlabClient,
  useSessionActions,
  useSessionList,
  useSessionView,
} from '@/rxlab/use-sessions'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { ModelSettingsDialog } from './ModelSettingsDialog'
import { SessionSidebar } from './SessionSidebar'
import { ModuleUsageChips, SessionUsageLine } from './SessionUsage'
import { foldTranscript } from './transcript'
import { useModelCatalog } from './use-model-catalog'
import { useLiveSessionUsage, useModuleUsage, useSessionUsageMap } from './use-usage'

function BootSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </div>
  )
}

/** The three-pane conversation workbench over one ready headless runtime. */
function SessionWorkbench({ runtime }: { runtime: RxlabClientRuntime }) {
  const list = useSessionList(runtime)
  const actions = useSessionActions(runtime)
  const connected = useConnected(runtime)
  const view = useSessionView(runtime, list)
  const modelState = useModelCatalog(runtime, connected)
  const archived = useArchivedSessions(runtime, connected)
  const presetRoster = useAgentPresets(runtime, connected)
  const workspaceRoot = useWorkspaceRoot(runtime, connected)
  const moduleAgents = useModuleAgents(runtime, connected)
  const liveUsage = useLiveSessionUsage(view)
  const usageRows = useSessionUsageMap(runtime, connected, list)
  const moduleUsage = useModuleUsage(runtime, connected)
  const [creating, setCreating] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (connected) void actions.refresh()
  }, [connected, actions])

  const rows = view === undefined ? [] : foldTranscript(view.window.entries)
  const currentTitle = list === undefined || view === undefined
    ? undefined
    : list.byId[view.sessionId]?.displayTitle

  const onCreate = async (opts?: { readonly agentPreset?: string }): Promise<void> => {
    setCreating(true)
    setBanner(null)
    try {
      const id = await actions.create({ ...opts, cwd: sessionCwd(workspaceRoot, moduleAgents, opts?.agentPreset) })
      if (id === undefined) setBanner('新建会话未返回')
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCreating(false)
    }
  }

  const onRename = async (id: SessionId, title: string): Promise<string | undefined> => {
    setBanner(null)
    const result = await runtime.remote.session.rename({ sessionId: id, title })
    if (result.ok) return result.value.title
    setBanner(`重命名失败：${result.error.code}: ${result.error.message}`)
    return undefined
  }

  const onArchive = async (id: SessionId): Promise<boolean> => {
    setBanner(null)
    setArchiving(true)
    try {
      const ok = await actions.archive(id)
      if (!ok) {
        setBanner('归档失败：host 拒绝了该操作。')
        return false
      }
      archived.markArchived(id)
      if (view?.sessionId === id) actions.clear()
      return true
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
      return false
    } finally {
      setArchiving(false)
    }
  }

  return (
    <div className="flex h-[calc(100svh-10.5rem)] min-h-[34rem] overflow-hidden rounded-xl border shadow-sm">
      <SessionSidebar
        list={list}
        archivedIds={archived.ids}
        connected={connected}
        creating={creating}
        archiving={archiving}
        presets={presetRoster.presets}
        presetsReady={presetRoster.status === 'ok'}
        onCreate={(opts) => { void onCreate(opts) }}
        onOpen={actions.open}
        onRename={onRename}
        onArchive={onArchive}
        usageBySession={usageRows.byId}
      />
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-medium">{currentTitle ?? '会话'}</h2>
            {view?.snapshot.running ? (
              <Badge className="gap-1">
                <Loader2 className="size-3 animate-spin" />
                运行中
              </Badge>
            ) : null}
            {view !== undefined && view.snapshot.openState === 'error'
              ? <Badge variant="destructive">打开失败</Badge>
              : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {view !== undefined ? (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="关闭当前会话"
                aria-label="关闭当前会话"
                onClick={actions.clear}
              >
                <LogOut className="size-3.5" />
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              title="Agent 设置"
              aria-label="Agent 设置"
              onClick={() => { setSettingsOpen(true) }}
            >
              <Settings className="size-3.5" />
            </Button>
            <span className="ml-1 text-xs text-muted-foreground">
              {connected ? '已连接' : '连接中'}
            </span>
          </div>
        </header>
        {banner !== null ? (
          <div className="flex items-start gap-2 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{banner}</span>
          </div>
        ) : null}
        {view !== undefined && liveUsage !== undefined ? (
          <div className="flex items-center justify-between gap-3 border-b px-4 py-1 text-[11px] text-muted-foreground">
            <SessionUsageLine totals={liveUsage} />
            {moduleUsage.error === undefined && moduleUsage.modules.length > 0 ? (
              <ModuleUsageChips modules={moduleUsage.modules} />
            ) : null}
          </div>
        ) : null}
        <MessageList
          view={view}
          rows={rows}
          onForkAt={(seq) => {
            if (view !== undefined) void actions.forkAt(view.sessionId, seq)
          }}
        />
        {view === undefined
          ? null
          : (
            <Composer
              runtime={runtime}
              view={view}
              connected={connected}
              modelState={modelState}
            />
          )}
      </main>
      <ModelSettingsDialog runtime={runtime} connected={connected} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default function AgentPanel(_props: ModulePanelProps) {
  const { phase, error, runtime } = useRxlabClient()
  if (phase === 'booting' || runtime === undefined) return <BootSkeleton />
  if (phase === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>会话数据层启动失败</CardTitle>
          <CardDescription className="whitespace-pre-wrap">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return <SessionWorkbench runtime={runtime} />
}
