/**
 * 内容管理 workbench: two surfaces over one panel — the 参照库 (catalog CRUD,
 * reused from the former 商品 Wiki) and the knowledge/script library backed by
 * `remote.rxlabContent`. zh copy until the app gains a locale dictionary.
 */
import { useEffect, useState } from 'react'
import { BookOpen, CircleAlert, FileText, Loader2, MessagesSquare, Pencil, Plus, Search, Trash2 } from 'lucide-react'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PanelHeader } from '@/components/panel-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { ContentItem, ContentItemId, ContentItemSummary, ContentKind, StageId } from '@deepseek-ai/dsh-rxlab-content/types'
import type { ModulePanelProps } from '@/modules/types'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { useConnected, useRxlabClient } from '@/rxlab/use-sessions'
import { STAGE_LABELS, STAGE_ORDER } from '@/modules/stages/stage-meta'
import RefLibrary from './RefLibrary'
import { contentDelete, contentGet, contentUpsert, useContentList, type ContentListFilters } from './use-content'

const KIND_LABELS: Record<ContentKind, string> = { knowledge: '知识', script: '话术' }

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function BootSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  )
}

export default function ContentPanel(props: ModulePanelProps) {
  const { phase, error, runtime } = useRxlabClient()
  if (phase === 'booting' || runtime === undefined) return <BootSkeleton />
  if (phase === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>内容管理数据层启动失败</CardTitle>
          <CardDescription className="whitespace-pre-wrap">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-(--workbench-panel-gap)">
      <PanelHeader
        icon={props.module.icon}
        title={props.module.label}
        description={props.module.tagline}
      />
      <ContentWorkbench runtime={runtime} module={props.module} />
    </div>
  )
}

/** Tabs shell: 参照库 + 知识 + 话术. */
function ContentWorkbench({ runtime, module }: { readonly runtime: RxlabClientRuntime; readonly module: ModulePanelProps['module'] }) {
  const [tab, setTab] = useState<'reference' | 'knowledge' | 'script'>('reference')
  return (
    <Tabs value={tab} onValueChange={(value) => { setTab(value as typeof tab) }}>
      <TabsList>
        <TabsTrigger value="reference">参照库</TabsTrigger>
        <TabsTrigger value="knowledge">知识</TabsTrigger>
        <TabsTrigger value="script">话术</TabsTrigger>
      </TabsList>
      <TabsContent value="reference" className="mt-3">
        <RefLibrary module={module} />
      </TabsContent>
      <TabsContent value="knowledge" className="mt-3">
        <ContentLibrary runtime={runtime} kind="knowledge" />
      </TabsContent>
      <TabsContent value="script" className="mt-3">
        <ContentLibrary runtime={runtime} kind="script" />
      </TabsContent>
    </Tabs>
  )
}

/** Knowledge/script CRUD over `remote.rxlabContent`. */
function ContentLibrary({ runtime, kind }: { readonly runtime: RxlabClientRuntime; readonly kind: ContentKind }) {
  const connected = useConnected(runtime)
  const [stage, setStage] = useState<'all' | StageId>('all')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<ContentItemId | undefined>(undefined)
  const [detail, setDetail] = useState<ContentItem | undefined>(undefined)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ContentItem | undefined>(undefined)
  const [confirmRemove, setConfirmRemove] = useState<ContentItem | undefined>(undefined)
  const [removing, setRemoving] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(query) }, 250)
    return () => { window.clearTimeout(timer) }
  }, [query])

  // Reset the detail pane when switching kind.
  useEffect(() => {
    setSelected(undefined)
    setDetail(undefined)
    setDetailError(null)
  }, [kind])

  const filters: ContentListFilters = {
    kind,
    ...(stage === 'all' ? {} : { stage }),
    ...(debounced.trim().length === 0 ? {} : { query: debounced.trim() }),
  }
  const list = useContentList(runtime, connected, filters)

  useEffect(() => {
    if (selected === undefined || !connected) {
      setDetail(undefined)
      setDetailError(null)
      return
    }
    let alive = true
    setDetail(undefined)
    setDetailError(null)
    void contentGet(runtime, selected)
      .then((item) => { if (alive) setDetail(item) })
      .catch((cause: unknown) => {
        if (alive) setDetailError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { alive = false }
  }, [runtime, connected, selected, list.state.items])

  const onRemoveConfirmed = async (): Promise<void> => {
    if (confirmRemove === undefined || removing) return
    setRemoving(true)
    setBanner(null)
    try {
      await contentDelete(runtime, confirmRemove.id)
      if (selected === confirmRemove.id) setSelected(undefined)
      list.reload()
      setConfirmRemove(undefined)
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRemoving(false)
    }
  }

  const rows = list.state.items

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {kind === 'knowledge' ? <BookOpen className="size-4 text-muted-foreground" /> : <MessagesSquare className="size-4 text-muted-foreground" />}
          {KIND_LABELS[kind]}
          <span className="text-xs font-normal text-muted-foreground">{connected ? `${String(rows.length)} 条` : '连接中'}</span>
        </div>
        <Select value={stage} onValueChange={(value) => { setStage(value as 'all' | StageId) }}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部阶段</SelectItem>
            {STAGE_ORDER.map(id => <SelectItem key={id} value={id}>{STAGE_LABELS[id]}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative min-w-44 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="检索标题 / 标签" value={query} onChange={(event) => { setQuery(event.target.value) }} />
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(undefined); setEditorOpen(true) }}>
          <Plus className="size-3.5" />新增{KIND_LABELS[kind]}
        </Button>
      </div>

      {banner !== null ? (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{banner}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-col gap-4 md:flex-row">
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="px-4 py-3"><CardTitle className="text-sm">条目</CardTitle></CardHeader>
          <CardContent className="min-h-0 flex-1 p-0 px-2 pb-2">
            {list.state.phase === 'loading' ? (
              <div className="flex flex-col gap-2 p-2">
                <Skeleton className="h-9 rounded-md" />
                <Skeleton className="h-9 rounded-md" />
                <Skeleton className="h-9 rounded-md" />
              </div>
            ) : list.state.phase === 'error' ? (
              <div className="flex items-start gap-2 p-3 text-xs text-destructive">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span className="whitespace-pre-wrap">{list.state.error}</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                空态：还没有{KIND_LABELS[kind]}条目。点「新增{KIND_LABELS[kind]}」录入第一条。
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-1 p-1">
                  {rows.map(row => (
                    <ContentRow key={String(row.id)} row={row} active={selected === row.id} onSelect={() => { setSelected(row.id) }} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 w-full flex-col md:w-[26rem] lg:w-[30rem]">
          <CardHeader className="px-4 py-3"><CardTitle className="text-sm">详情</CardTitle></CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {selected === undefined ? (
              <p className="py-10 text-center text-xs text-muted-foreground">选中左侧一条查看 / 编辑 / 删除。</p>
            ) : detailError !== null ? (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span className="whitespace-pre-wrap">{detailError}</span>
              </div>
            ) : detail === undefined ? (
              <Skeleton className="h-40 rounded-md" />
            ) : (
              <>
                <ContentDetail item={detail} />
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditing(detail); setEditorOpen(true) }}>
                    <Pencil className="size-3.5" />编辑
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => { setConfirmRemove(detail) }}>
                    <Trash2 className="size-3.5" />删除
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ContentEditorDialog
        runtime={runtime}
        kind={kind}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSaved={() => { setEditorOpen(false); setEditing(undefined); list.reload(); setSelected(undefined) }}
      />

      <AlertDialog open={confirmRemove !== undefined} onOpenChange={(open) => { if (!open) setConfirmRemove(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条{KIND_LABELS[kind]}？</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove === undefined ? '' : `「${confirmRemove.title}」将从 rxlab_content 域删除，且不可恢复。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={removing} onClick={(event) => { event.preventDefault(); void onRemoveConfirmed() }}>
              {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** One clickable list row. */
function ContentRow({ row, active, onSelect }: {
  readonly row: ContentItemSummary
  readonly active: boolean
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
      ].join(' ')}
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{row.title}</span>
        {row.stage === undefined ? null : <span className="ml-1.5 text-muted-foreground">{STAGE_LABELS[row.stage]}</span>}
        {row.tags.length === 0 ? null : <span className="ml-1.5 text-muted-foreground">{row.tags.join(' · ')}</span>}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(row.updatedAt)}</span>
    </button>
  )
}

/** Full content item detail. */
function ContentDetail({ item }: { readonly item: ContentItem }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{item.title}</h3>
        {item.stage === undefined ? null : <Badge variant="outline">{STAGE_LABELS[item.stage]}</Badge>}
      </div>
      {item.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">{item.body}</p>
      <p className="text-[10px] text-muted-foreground">更新于 {formatTime(item.updatedAt)}</p>
    </div>
  )
}

/** Create/edit dialog for one knowledge or script entry. */
function ContentEditorDialog({
  runtime, kind, open, onOpenChange, editing, onSaved,
}: {
  readonly runtime: RxlabClientRuntime
  readonly kind: ContentKind
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly editing?: ContentItem | undefined
  readonly onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState<'all' | StageId>('all')
  const [tags, setTags] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(editing?.title ?? '')
    setStage(editing?.stage ?? 'all')
    setTags((editing?.tags ?? []).join(', '))
    setBody(editing?.body ?? '')
    setNotice(null)
    setBusy(false)
  }, [open, editing])

  const submit = async (): Promise<void> => {
    if (busy) return
    if (title.trim().length === 0) { setNotice('请填写标题。'); return }
    setBusy(true)
    setNotice(null)
    try {
      await contentUpsert(
        runtime,
        {
          kind,
          ...(stage === 'all' ? {} : { stage }),
          title: title.trim(),
          tags: tags.split(',').map(part => part.trim()).filter(part => part.length > 0),
          body,
        },
        editing?.id,
      )
      onSaved()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing === undefined ? `新增${KIND_LABELS[kind]}` : `编辑${KIND_LABELS[kind]}`}</DialogTitle>
          <DialogDescription>按阶段打标签；话术可在阶段面板中作为对客口径复用。</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="content-title">标题</FieldLabel>
            <Input id="content-title" value={title} onChange={(event) => { setTitle(event.target.value) }} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>阶段</FieldLabel>
              <Select value={stage} onValueChange={(value) => { setStage(value as 'all' | StageId) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">不限阶段</SelectItem>
                  {STAGE_ORDER.map(id => <SelectItem key={id} value={id}>{STAGE_LABELS[id]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="content-tags">标签（逗号分隔）</FieldLabel>
              <Input id="content-tags" value={tags} onChange={(event) => { setTags(event.target.value) }} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="content-body">正文</FieldLabel>
            <Textarea id="content-body" className="h-40" value={body} onChange={(event) => { setBody(event.target.value) }} />
          </Field>
        </FieldGroup>
        {notice !== null ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{notice}</span>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => { onOpenChange(false) }}>取消</Button>
          <Button disabled={busy} onClick={() => { void submit() }}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
