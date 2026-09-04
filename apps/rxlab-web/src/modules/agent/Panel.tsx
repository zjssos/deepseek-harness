import { useEffect, useState } from 'react'
import { CircleAlert, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ModulePanelProps } from '@/modules/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RxlabClientRuntime } from './client'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { SessionSidebar } from './SessionSidebar'
import { foldTranscript } from './transcript'
import { useModelCatalog } from './use-model-catalog'
import {
  useConnected,
  useRxlabClient,
  useSessionActions,
  useSessionList,
  useSessionView,
} from './use-sessions'

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
  const [creating, setCreating] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  useEffect(() => {
    if (connected) void actions.refresh()
  }, [connected, actions])

  const rows = view === undefined ? [] : foldTranscript(view.window.entries)
  const currentTitle = list === undefined || view === undefined
    ? undefined
    : list.byId[view.sessionId]?.displayTitle

  const onCreate = async (): Promise<void> => {
    setCreating(true)
    setBanner(null)
    try {
      const id = await actions.create()
      if (id === undefined) setBanner('新建会话未完成')
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

  return (
    <div className="flex h-[calc(100svh-10.5rem)] min-h-[34rem] overflow-hidden rounded-xl border shadow-sm">
      <SessionSidebar
        list={list}
        connected={connected}
        creating={creating}
        onCreate={() => { void onCreate() }}
        onOpen={actions.open}
        onRename={onRename}
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
          <span className="shrink-0 text-xs text-muted-foreground">
            {connected ? '已连接' : '连接中'}
          </span>
        </header>
        {banner !== null ? (
          <div className="flex items-start gap-2 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{banner}</span>
          </div>
        ) : null}
        <MessageList view={view} rows={rows} />
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
