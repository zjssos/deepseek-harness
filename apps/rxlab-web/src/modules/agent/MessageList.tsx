import { Bot, CircleAlert, GitBranch, Loader2, LibraryBig, SkipForward, User, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { SessionView } from './use-sessions'
import type { TranscriptRow } from './transcript'

const MAX_ARGUMENTS_CHARS = 240
const MAX_RESULT_CHARS = 500
/** Expanded context body keeps an inner scrollport instead of stretching the transcript. */
const MAX_CONTEXT_CHARS = 20_000

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

/** Fork entry shown on hover for user/assistant rows. */
function ForkButton({ seq, onForkAt }: { seq: number; onForkAt: (seq: number) => void }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
      title="从此处新建分支会话"
      aria-label="从此处新建分支会话"
      onClick={() => { onForkAt(seq) }}
    >
      <GitBranch className="size-3.5" />
    </Button>
  )
}

/** One user text message bubble. */
function UserMessage({ row, onForkAt }: { row: Extract<TranscriptRow, { kind: 'user' }>; onForkAt: (seq: number) => void }) {
  return (
    <div className="group flex items-start justify-end gap-1">
      <ForkButton seq={row.seq} onForkAt={onForkAt} />
      <div className="flex max-w-[85%] items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-primary text-primary-foreground">
          <User className="size-3.5" />
        </div>
        <div className="rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
          {row.text.length > 0 ? <p className="whitespace-pre-wrap">{row.text}</p> : null}
          {row.attachmentCount > 0
            ? <p className="mt-1 text-xs opacity-70">{row.attachmentCount} 个附件</p>
            : null}
        </div>
      </div>
    </div>
  )
}

/** One assistant reply bubble with optional reasoning and interruption marks. */
function AssistantMessage({ row, onForkAt }: { row: Extract<TranscriptRow, { kind: 'assistant' }>; onForkAt: (seq: number) => void }) {
  return (
    <div className="group flex items-start gap-1">
      <div className="flex max-w-[85%] items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted">
          <Bot className="size-3.5" />
        </div>
        <div className="rounded-2xl border bg-card px-3 py-2 text-sm">
          {row.reasoning.length > 0 ? (
            <details className="mb-1 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">思考过程</summary>
              <pre className="mt-1 whitespace-pre-wrap font-sans">{row.reasoning}</pre>
            </details>
          ) : null}
          {row.text.length > 0
            ? <p className="whitespace-pre-wrap">{row.text}</p>
            : <p className="text-xs text-muted-foreground">（无文本回复）</p>}
          {row.interrupted ? <p className="mt-1 text-xs opacity-70">（已中断）</p> : null}
        </div>
      </div>
      <ForkButton seq={row.seq} onForkAt={onForkAt} />
    </div>
  )
}

/** A tool execution summary card folded from the paired call/result events. */
function ToolCard({ row }: { row: Extract<TranscriptRow, { kind: 'tool' }> }) {
  return (
    <Card className="mx-auto w-full max-w-[85%]">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 py-2.5">
        <CardTitle className="font-mono text-xs font-medium">{row.name}</CardTitle>
        {row.error !== null
          ? <Badge variant="destructive">{row.error.name || row.error.code}</Badge>
          : row.completed
            ? <Badge variant="secondary">完成</Badge>
            : <Badge className="gap-1"><Loader2 className="size-3 animate-spin" />运行中</Badge>}
      </CardHeader>
      <CardContent className="space-y-1.5 px-4 py-2.5">
        {row.argumentsText.length > 0
          ? (
            <pre className="overflow-hidden rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {clip(row.argumentsText, MAX_ARGUMENTS_CHARS)}
            </pre>
          )
          : null}
        {row.completed
          ? (
            row.resultText.length > 0
              ? <pre className="overflow-hidden text-xs leading-relaxed text-muted-foreground">{clip(row.resultText, MAX_RESULT_CHARS)}</pre>
              : <p className="text-xs text-muted-foreground">（无文本结果）</p>
          )
          : null}
      </CardContent>
    </Card>
  )
}

/**
 * One non-user injection (workspace instructions, skill catalog, …), collapsed
 * to a producer-label line. Expanding reveals the model-facing text verbatim,
 * bounded to an inner scrollport so preset-assembled context never stretches
 * the conversation flow.
 */
function ContextRowView({ row }: { row: Extract<TranscriptRow, { kind: 'context' }> }) {
  const text = row.text.length > MAX_CONTEXT_CHARS
    ? `${row.text.slice(0, MAX_CONTEXT_CHARS)}…`
    : row.text
  return (
    <details className="mx-auto w-full max-w-[85%] rounded-xl border bg-muted/40">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <LibraryBig className="size-3.5 shrink-0" />
        <span>上下文注入</span>
        <span className="min-w-0 truncate font-mono">{row.label}</span>
      </summary>
      <pre className="max-h-56 overflow-y-auto border-t px-4 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {text}
      </pre>
    </details>
  )
}

function RowView({ row, onForkAt }: { row: TranscriptRow; onForkAt: (seq: number) => void }) {
  switch (row.kind) {
    case 'user':
      return <UserMessage row={row} onForkAt={onForkAt} />
    case 'assistant':
      return <AssistantMessage row={row} onForkAt={onForkAt} />
    case 'tool':
      return <ToolCard row={row} />
    case 'context':
      return <ContextRowView row={row} />
  }
}

export interface MessageListProps {
  /** The staged session view; undefined until a session is current. */
  readonly view: SessionView | undefined
  /** Folded conversation rows for the staged window. */
  readonly rows: readonly TranscriptRow[]
  /** Fork one message row (seq) into a new child session. */
  readonly onForkAt: (seq: number) => void
}

/** Main conversation transcript pane. */
export function MessageList({ view, rows, onForkAt }: MessageListProps) {
  if (view === undefined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Bot className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">从左侧选择一个会话，或新建一个开始对话。</p>
      </div>
    )
  }
  const { snapshot, face: viewFace } = view
  const opening = snapshot.openState === 'cold' || snapshot.openState === 'loading'
  const lastAgentError = snapshot.lastAgentError
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {opening ? (
        <div className="flex h-full flex-col gap-3 p-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24 w-3/4" />
        </div>
      ) : lastAgentError !== null ? (
        <div className="flex items-start gap-2 border-b px-4 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">Agent 运行出错：{lastAgentError}</span>
        </div>
      ) : null}
      {snapshot.queue.length > 0 ? (
        <div className="space-y-1 border-b px-3 py-2">
          {snapshot.queue.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1 truncate">{index + 1}. {item.preview}</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0"
                title="移到最前并打断当前运行"
                disabled={!viewFace}
                onClick={() => { void viewFace?.updateQueue(item.id, { kind: 'steer' }) }}
              >
                <SkipForward className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0"
                title="从队列移除"
                disabled={!viewFace}
                onClick={() => { void viewFace?.updateQueue(item.id, { kind: 'remove' }) }}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {snapshot.hasMore && !snapshot.loadingOlder ? (
            <div className="flex justify-center">
              <Button size="sm" variant="outline" onClick={() => { void viewFace?.loadOlder() }}>
                加载更早消息
              </Button>
            </div>
          ) : null}
          {rows.length === 0 && !opening && snapshot.blank ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 pt-16 text-center">
              <p className="text-sm text-muted-foreground">这是一个新会话。</p>
              <p className="text-xs text-muted-foreground/70">在下方向 agent 发送第一条消息。</p>
            </div>
          ) : null}
          {rows.map(row => <RowView key={`${row.kind}-${row.seq}-${'callId' in row ? row.callId : ''}`} row={row} onForkAt={onForkAt} />)}
          {snapshot.running && rows.length === 0
            ? (
              <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>Agent 运行中…</span>
              </div>
            )
            : null}
        </div>
      </ScrollArea>
    </div>
  )
}
