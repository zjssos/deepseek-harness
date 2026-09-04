import { useState } from 'react'
import { Archive, Loader2, MoreHorizontal, Plus, SquarePen } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface SessionSidebarProps {
  /** Live host session list; undefined until the first list snapshot lands. */
  readonly list: SessionListState | undefined
  /** Session ids hidden by the workspace archive set. */
  readonly archivedIds: readonly SessionId[]
  readonly connected: boolean
  readonly creating: boolean
  readonly onCreate: () => void
  readonly onOpen: (id: SessionId) => void
  /** Rename one listed session; resolves undefined when the host rejected it. */
  readonly onRename: (id: SessionId, title: string) => Promise<string | undefined>
  /** Archive one listed session; resolves false when the host rejected it. */
  readonly onArchive: (id: SessionId) => Promise<boolean>
  /** Whether an archive is in flight (disables the row menu while running). */
  readonly archiving: boolean
}

/** Left rail: session list with create/open/rename/archive. */
export function SessionSidebar({
  list,
  archivedIds,
  connected,
  creating,
  onCreate,
  onOpen,
  onRename,
  onArchive,
  archiving,
}: SessionSidebarProps) {
  const [renaming, setRenaming] = useState<SessionId | undefined>(undefined)
  const [renamingTitle, setRenamingTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const hidden = new Set(archivedIds)
  const rows = list === undefined
    ? []
    : list.ids.map(id => list.byId[id])
      .filter((row): row is SessionSummary => row !== undefined && !hidden.has(row.id))

  const beginRename = (id: SessionId): void => {
    setRenamingTitle(list?.byId[id]?.title ?? '')
    setRenaming(id)
  }

  const submitRename = async (): Promise<void> => {
    if (renaming === undefined || renamingTitle.trim().length === 0) return
    setBusy(true)
    try {
      const accepted = await onRename(renaming, renamingTitle.trim())
      if (accepted !== undefined) setRenaming(undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-muted/30">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">会话</span>
          {connected
            ? <Badge variant="secondary" className="text-[10px]">已连接</Badge>
            : <Badge variant="outline" className="text-[10px]">连接中</Badge>}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={onCreate}
          disabled={!connected || creating}
          aria-label="新建会话"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {rows.length === 0 && list !== undefined
            ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                暂无会话，点右上角「+」新建。
              </p>
            )
            : null}
          {rows.map(row => (
            <div
              key={row.id}
              className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                list?.current === row.id
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/60'
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => { onOpen(row.id) }}
                title={row.displayTitle}
              >
                {row.displayTitle}
              </button>
              {row.running ? <Badge className="size-1.5 shrink-0 rounded-full p-0" aria-label="运行中" /> : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label={`会话操作 ${row.displayTitle}`}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { beginRename(row.id) }}>
                    <SquarePen className="size-4" />
                    重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={archiving || !connected}
                    onClick={() => { void onArchive(row.id) }}
                  >
                    <Archive className="size-4" />
                    归档（隐藏）
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Separator />
      <div className="px-4 py-2 text-[11px] text-muted-foreground">
        {list === undefined
          ? '会话列表加载中…'
          : list.phase === 'pending' ? '刷新中…' : `${rows.length} 个会话`}
      </div>

      <Dialog open={renaming !== undefined} onOpenChange={(open) => { if (!open) setRenaming(undefined) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>
              新标题会固定下来，不再随对话内容自动生成。
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renamingTitle}
            onChange={(event) => { setRenamingTitle(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void submitRename() }
            }}
            placeholder="会话标题"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenaming(undefined) }}>取消</Button>
            <Button onClick={() => { void submitRename() }} disabled={busy || renamingTitle.trim().length === 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
