/**
 * 商品 Wiki workbench: browse, curate, and inspect the rxlab structured
 * catalog (frame / lens / product master data) over the embedded client
 * runtime's `remote.rxlabCatalog` namespace. The panel is one of the rxlab
 * module surfaces and follows the agent module's boot/lifecycle conventions.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
  BookOpen,
  CircleAlert,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ModulePanelProps } from '@/modules/types'
import type {
  CatalogItemId,
  CatalogItemSummary,
  LensType,
  RefractiveIndex,
  WikiItem,
  WikiItemDraft,
  WikiKind,
} from '@deepseek-ai/dsh-rxlab-catalog/types'
import { useConnected, useRxlabClient } from '@/modules/agent/use-sessions'
import type { RxlabClientRuntime } from '@/modules/agent/client'
import { catalogRemove, catalogUpsert, useCatalogList, type CatalogListFilters } from './use-catalog'

const KIND_LABELS: Record<WikiKind, string> = {
  frame: '镜架',
  lens: '镜片',
  product: '采集商品',
}

const ORIGIN_LABELS = { manual: '手工', collected: '采集' } as const

const LENS_TYPE_LABELS: Record<LensType, string> = {
  'single-vision': '单光',
  progressive: '渐进',
  'blue-light': '防蓝光',
  photochromic: '变色',
  occupational: '办公 / 抗疲劳',
  other: '其他',
}

const REFRACTIVE_INDEXES: readonly RefractiveIndex[] = ['1.56', '1.60', '1.67', '1.74']

const LENS_TYPES = Object.keys(LENS_TYPE_LABELS) as LensType[]

/** One editable field in the catalog form. */
interface FieldSpec {
  readonly key: string
  readonly label: string
  readonly type: 'text' | 'number' | 'select' | 'textarea'
  /** Select renders these option values verbatim (labels live beside the spec). */
  readonly options?: readonly string[]
  readonly required?: boolean
  readonly placeholder?: string
}

const FRAME_FIELDS: readonly FieldSpec[] = [
  { key: 'frameMaterial', label: '镜架材质', type: 'text', required: true, placeholder: '如 钛 / 板材 / 金属' },
  { key: 'lensWidth', label: '镜片宽 (mm)', type: 'number' },
  { key: 'lensHeight', label: '镜片高 (mm)', type: 'number' },
  { key: 'bridgeWidth', label: '鼻梁距 (mm)', type: 'number' },
  { key: 'templeLength', label: '镜腿长 (mm)', type: 'number' },
  { key: 'weightG', label: '重量 (g)', type: 'number' },
  { key: 'color', label: '颜色', type: 'text' },
]

const LENS_FIELDS: readonly FieldSpec[] = [
  { key: 'refractiveIndex', label: '折射率', type: 'select', options: REFRACTIVE_INDEXES, required: true },
  { key: 'lensType', label: '镜片类型', type: 'select', options: LENS_TYPES, required: true },
  { key: 'abbe', label: '阿贝数', type: 'number' },
  { key: 'coating', label: '镀膜', type: 'text', placeholder: '如 减反 / 加硬 / 防污' },
  { key: 'sphereRange', label: '光度范围', type: 'text', placeholder: '如 -8.00 ~ +6.00' },
]

const PRODUCT_FIELDS: readonly FieldSpec[] = [
  { key: 'title', label: '商品标题', type: 'text' },
  { key: 'sku', label: 'SKU / 货号', type: 'text' },
  { key: 'price', label: '价格', type: 'number' },
  { key: 'images', label: '图片 URL（逗号分隔）', type: 'text' },
]

const FIELDS_BY_KIND: Record<WikiKind, readonly FieldSpec[]> = {
  frame: FRAME_FIELDS,
  lens: LENS_FIELDS,
  product: PRODUCT_FIELDS,
}

function kindBadge(kind: WikiKind): string {
  return KIND_LABELS[kind]
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

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

export default function WikiPanel(_props: ModulePanelProps) {
  const { phase, error, runtime } = useRxlabClient()
  if (phase === 'booting' || runtime === undefined) return <BootSkeleton />
  if (phase === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>商品 Wiki 数据层启动失败</CardTitle>
          <CardDescription className="whitespace-pre-wrap">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return <CatalogWorkbench runtime={runtime} />
}

/** The connected catalog browser: filter/search bar, list, and detail pane. */
function CatalogWorkbench({ runtime }: { runtime: RxlabClientRuntime }) {
  const connected = useConnected(runtime)
  const [kind, setKind] = useState<'all' | WikiKind>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selected, setSelected] = useState<CatalogItemId | undefined>(undefined)
  const [detail, setDetail] = useState<WikiItem | undefined>(undefined)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formEditing, setFormEditing] = useState<WikiItem | undefined>(undefined)
  const [confirmRemove, setConfirmRemove] = useState<WikiItem | undefined>(undefined)
  const [removing, setRemoving] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query) }, 250)
    return () => { window.clearTimeout(timer) }
  }, [query])

  const filters: CatalogListFilters = {
    ...(kind === 'all' ? {} : { kind }),
    ...(debouncedQuery.trim().length === 0 ? {} : { query: debouncedQuery.trim() }),
  }
  const list = useCatalogList(runtime, connected, filters)

  // Keep the detail pane in sync with the selected row after refresh.
  useEffect(() => {
    if (selected === undefined || !connected) {
      setDetail(undefined)
      setDetailError(null)
      return
    }
    let alive = true
    setDetail(undefined)
    setDetailError(null)
    void runtime.remote.rxlabCatalog.get({ id: selected })
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setDetailError(`${result.error.code}: ${result.error.message}`)
          return
        }
        setDetail(result.value.item)
      })
      .catch((cause: unknown) => {
        if (alive) {
          setDetailError(cause instanceof Error ? cause.message : String(cause))
        }
      })
    return () => { alive = false }
  }, [runtime, connected, selected, list.state.items])

  const refresh = (): void => {
    list.reload()
  }

  const onSaved = (): void => {
    setFormOpen(false)
    setFormEditing(undefined)
    refresh()
    // A create/update may not be the selected row; clear selection so the
    // list-only empty-detail state stays honest.
    setSelected(undefined)
  }

  const onRemoveConfirmed = async (): Promise<void> => {
    if (confirmRemove === undefined || removing) return
    setRemoving(true)
    setBanner(null)
    try {
      await catalogRemove(runtime, { id: confirmRemove.id })
      if (selected === confirmRemove.id) setSelected(undefined)
      refresh()
      setConfirmRemove(undefined)
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRemoving(false)
    }
  }

  const rows = list.state.items

  return (
    <div className="flex h-[calc(100svh-10.5rem)] min-h-[34rem] flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BookOpen className="size-4 text-muted-foreground" />
          商品 Wiki
          <span className="text-xs font-normal text-muted-foreground">
            {connected ? `${String(rows.length)} 条` : '连接中'}
          </span>
        </div>
        <Tabs
          value={kind}
          onValueChange={(value) => { setKind(value as 'all' | WikiKind) }}
        >
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="frame">镜架</TabsTrigger>
            <TabsTrigger value="lens">镜片</TabsTrigger>
            <TabsTrigger value="product">采集商品</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative min-w-44 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            placeholder="检索品牌 / 型号 / 名称"
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
          />
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => { setFormEditing(undefined); setFormOpen(true) }}
        >
          <Plus className="size-3.5" />
          新增条目
        </Button>
      </div>

      {banner !== null ? (
        <div className="flex items-start gap-2 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{banner}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row">
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">条目</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0 px-2 pb-2">
            {list.state.phase === 'loading'
              ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-9 rounded-md" />
                  <Skeleton className="h-9 rounded-md" />
                  <Skeleton className="h-9 rounded-md" />
                </div>
              )
              : list.state.phase === 'error'
                ? (
                  <div className="flex items-start gap-2 p-3 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span className="whitespace-pre-wrap">{list.state.error}</span>
                  </div>
                )
                : rows.length === 0
                  ? (
                    <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                      空态：还没有{kind === 'all' ? '' : kindBadge(kind)}条目。点「新增条目」录入第一条。
                    </div>
                  )
                  : (
                    <ScrollArea className="h-full">
                      <div className="space-y-1 p-1">
                        {rows.map(row => (
                          <CatalogRow
                            key={row.id}
                            row={row}
                            active={selected === row.id}
                            onSelect={() => { setSelected(row.id) }}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 w-full flex-col md:w-[26rem] lg:w-[30rem]">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">详情</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {selected === undefined
              ? (
                <p className="py-10 text-center text-xs text-muted-foreground">
                  选中左侧一条目查看 / 编辑 / 删除。
                </p>
              )
              : detailError !== null
                ? (
                  <div className="flex items-start gap-2 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span className="whitespace-pre-wrap">{detailError}</span>
                  </div>
                )
                : detail === undefined
                  ? <Skeleton className="h-40 rounded-md" />
                  : (
                    <>
                      <ItemDetail item={detail} />
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => { setFormEditing(detail); setFormOpen(true) }}
                        >
                          <Pencil className="size-3.5" />
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => { setConfirmRemove(detail) }}
                        >
                          <Trash2 className="size-3.5" />
                          删除
                        </Button>
                      </div>
                    </>
                  )}
          </CardContent>
        </Card>
      </div>

      <CatalogItemFormDialog
        runtime={runtime}
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={formEditing}
        onSaved={onSaved}
      />

      <AlertDialog open={confirmRemove !== undefined} onOpenChange={(open) => { if (!open) setConfirmRemove(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条条目？</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove === undefined
                ? ''
                : `「${confirmRemove.name}」（${kindBadge(confirmRemove.kind)}）将从 catalog 持久域删除，且不可恢复。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => { event.preventDefault(); void onRemoveConfirmed() }}
            >
              {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** One clickable summary row in the list pane. */
function CatalogRow({
  row,
  active,
  onSelect,
}: {
  readonly row: CatalogItemSummary
  readonly active: boolean
  readonly onSelect: () => void
}) {
  const identity = [row.brand, row.model].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
      ].join(' ')}
    >
      <Badge variant={active ? 'default' : 'secondary'} className="shrink-0">
        {kindBadge(row.kind)}
      </Badge>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{row.name}</span>
        {identity.length > 0 ? <span className="ml-1.5 text-muted-foreground">{identity}</span> : null}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(row.updatedAt)}</span>
    </button>
  )
}

/** Detail fields for one full record, one labeled line per present field. */
function ItemDetail({ item }: { readonly item: WikiItem }) {
  const identity = [item.brand, item.model].filter(Boolean).join(' · ')
  const rows: Array<{ label: string; value: string }> = [
    { label: '名称', value: item.name },
    ...(identity.length > 0 ? [{ label: '品牌 / 型号', value: identity }] : []),
    { label: '来源', value: ORIGIN_LABELS[item.origin] },
    { label: '更新时间', value: formatTime(item.updatedAt) },
  ]
  switch (item.kind) {
    case 'frame':
      rows.push({ label: '镜架材质', value: item.frameMaterial })
      pushNumberRows(rows, '镜片宽', item.lensWidth, 'mm')
      pushNumberRows(rows, '镜片高', item.lensHeight, 'mm')
      pushNumberRows(rows, '鼻梁距', item.bridgeWidth, 'mm')
      pushNumberRows(rows, '镜腿长', item.templeLength, 'mm')
      pushNumberRows(rows, '重量', item.weightG, 'g')
      pushTextRows(rows, '颜色', item.color)
      break
    case 'lens':
      rows.push({ label: '折射率', value: item.refractiveIndex })
      rows.push({ label: '镜片类型', value: LENS_TYPE_LABELS[item.lensType] })
      pushNumberRows(rows, '阿贝数', item.abbe)
      pushTextRows(rows, '镀膜', item.coating)
      pushTextRows(rows, '光度范围', item.sphereRange)
      break
    case 'product':
      pushTextRows(rows, '标题', item.title)
      pushTextRows(rows, 'SKU', item.sku)
      pushNumberRows(rows, '价格', item.price)
      if (item.images !== undefined && item.images.length > 0) {
        rows.push({ label: '图片', value: `${String(item.images.length)} 张` })
      }
      break
  }
  pushTextRows(rows, '来源页', item.rawUrl)
  pushTextRows(rows, '备注', item.notes)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge>{kindBadge(item.kind)}</Badge>
        <h3 className="text-sm font-medium">{item.name}</h3>
      </div>
      <dl className="space-y-1.5 text-xs">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-3">
            <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function pushTextRows(rows: Array<{ label: string; value: string }>, label: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) rows.push({ label, value })
}

function pushNumberRows(
  rows: Array<{ label: string; value: string }>,
  label: string,
  value: number | undefined,
  unit = '',
): void {
  if (value !== undefined) rows.push({ label, value: `${String(value)}${unit}` })
}

/** Create/edit dialog: kind switch plus one field set per kind. */
function CatalogItemFormDialog({
  runtime,
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  readonly runtime: RxlabClientRuntime
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Full stored record being edited; absent means create. */
  readonly editing?: WikiItem
  readonly onSaved: () => void
}) {
  const [kind, setKind] = useState<WikiKind>('frame')
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // (Re)seed the form whenever it opens or the editing target changes.
  useEffect(() => {
    if (!open) return
    setKind(editing?.kind ?? 'frame')
    setValues(fieldValuesOf(editing))
    setNotice(null)
  }, [open, editing])

  const setField = (key: string, value: string): void => {
    setValues(current => ({ ...current, [key]: value }))
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    const editingId = editing?.id
    const draft = draftOf(kind, values, setNotice)
    if (draft === undefined) return
    const payload: WikiItemDraft = editingId === undefined ? draft : { ...draft, id: editingId }
    setBusy(true)
    setNotice(null)
    try {
      await catalogUpsert(runtime, payload)
      onSaved()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const fields = FIELDS_BY_KIND[kind]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing === undefined ? '新增条目' : '编辑条目'}</DialogTitle>
          <DialogDescription>
            录入结构化 {editing === undefined ? '新条目' : `「${editing.name}」`}；带 * 的字段必填。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>类型</Label>
            {editing === undefined
              ? (
                <div className="flex gap-2">
                  {(['frame', 'lens', 'product'] as const).map(candidate => (
                    <Button
                      key={candidate}
                      type="button"
                      size="sm"
                      variant={kind === candidate ? 'default' : 'outline'}
                      onClick={() => { setKind(candidate) }}
                    >
                      {KIND_LABELS[candidate]}
                    </Button>
                  ))}
                </div>
              )
              : <Badge>{KIND_LABELS[editing.kind]}</Badge>}
          </div>

          <FormField label="名称 *" fieldKey="name">
            <Input
              value={values.name ?? ''}
              placeholder="展示名称，如「全框钛架 A-01」"
              onChange={(event) => { setField('name', event.target.value) }}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="品牌" fieldKey="brand">
              <Input value={values.brand ?? ''} placeholder="如 Ray-Ban" onChange={(event) => { setField('brand', event.target.value) }} />
            </FormField>
            <FormField label="型号" fieldKey="model">
              <Input value={values.model ?? ''} placeholder="如 RB2140" onChange={(event) => { setField('model', event.target.value) }} />
            </FormField>
          </div>

          {fields.map(field => (
            <FormField key={field.key} label={field.required ? `${field.label} *` : field.label} fieldKey={field.key}>
              {field.type === 'select' && field.options !== undefined
                ? (
                  <Select value={values[field.key] ?? ''} onValueChange={(value) => { setField(field.key, value) }}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map(option => (
                        <SelectItem key={option} value={option}>
                          {field.key === 'lensType' ? LENS_TYPE_LABELS[option as LensType] : option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
                : field.type === 'textarea'
                  ? (
                    <Textarea
                      value={values[field.key] ?? ''}
                      placeholder={field.placeholder}
                      onChange={(event) => { setField(field.key, event.target.value) }}
                    />
                  )
                  : (
                    <Input
                      value={values[field.key] ?? ''}
                      placeholder={field.placeholder}
                      inputMode={field.type === 'number' ? 'decimal' : undefined}
                      onChange={(event) => { setField(field.key, event.target.value) }}
                    />
                  )}
            </FormField>
          ))}

          <FormField label="备注" fieldKey="notes">
            <Textarea
              value={values.notes ?? ''}
              placeholder="可选：录入人、验配注意事项等"
              onChange={(event) => { setField('notes', event.target.value) }}
            />
          </FormField>

          {notice !== null ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="whitespace-pre-wrap">{notice}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => { onOpenChange(false) }}>
            取消
          </Button>
          <Button disabled={busy} onClick={() => { void submit() }}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormField({
  label,
  fieldKey,
  children,
}: {
  readonly label: string
  readonly fieldKey: string
  readonly children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div data-field={fieldKey}>{children}</div>
    </div>
  )
}

/** Read the form's string fields back into the edited record's own values. */
function fieldValuesOf(item: WikiItem | undefined): Record<string, string> {
  if (item === undefined) return {}
  const base: Record<string, string> = {
    name: item.name,
    ...(item.brand === undefined ? {} : { brand: item.brand }),
    ...(item.model === undefined ? {} : { model: item.model }),
    ...(item.notes === undefined ? {} : { notes: item.notes }),
  }
  switch (item.kind) {
    case 'frame':
      return {
        ...base,
        frameMaterial: item.frameMaterial,
        ...(item.color === undefined ? {} : { color: item.color }),
        ...(item.lensWidth === undefined ? {} : { lensWidth: String(item.lensWidth) }),
        ...(item.lensHeight === undefined ? {} : { lensHeight: String(item.lensHeight) }),
        ...(item.bridgeWidth === undefined ? {} : { bridgeWidth: String(item.bridgeWidth) }),
        ...(item.templeLength === undefined ? {} : { templeLength: String(item.templeLength) }),
        ...(item.weightG === undefined ? {} : { weightG: String(item.weightG) }),
      }
    case 'lens':
      return {
        ...base,
        refractiveIndex: item.refractiveIndex,
        lensType: item.lensType,
        ...(item.abbe === undefined ? {} : { abbe: String(item.abbe) }),
        ...(item.coating === undefined ? {} : { coating: item.coating }),
        ...(item.sphereRange === undefined ? {} : { sphereRange: item.sphereRange }),
      }
    case 'product':
      return {
        ...base,
        ...(item.title === undefined ? {} : { title: item.title }),
        ...(item.sku === undefined ? {} : { sku: item.sku }),
        ...(item.price === undefined ? {} : { price: String(item.price) }),
        ...(item.images === undefined ? {} : { images: item.images.join(', ') }),
      }
  }
}

/** Validate and build the wire draft from the form's string fields. */
function draftOf(
  kind: WikiKind,
  values: Record<string, string>,
  report: (message: string) => void,
): WikiItemDraft | undefined {
  const name = (values.name ?? '').trim()
  if (name.length === 0) {
    report('请填写名称。')
    return undefined
  }
  const base = {
    name,
    ...(values.brand !== undefined && values.brand.trim().length > 0 ? { brand: values.brand.trim() } : {}),
    ...(values.model !== undefined && values.model.trim().length > 0 ? { model: values.model.trim() } : {}),
    ...(values.notes !== undefined && values.notes.trim().length > 0 ? { notes: values.notes.trim() } : {}),
    origin: 'manual' as const,
  }
  switch (kind) {
    case 'frame': {
      const frameMaterial = (values.frameMaterial ?? '').trim()
      if (frameMaterial.length === 0) {
        report('镜架类型需要填写镜架材质。')
        return undefined
      }
      const numeric = collectNumbers(FRAME_FIELDS, values, report)
      if (numeric === undefined) return undefined
      return {
        ...base,
        kind: 'frame',
        frameMaterial,
        ...(values.color !== undefined && values.color.trim().length > 0 ? { color: values.color.trim() } : {}),
        ...numeric,
      }
    }
    case 'lens': {
      const refractiveIndex = values.refractiveIndex
      const lensType = values.lensType as LensType | undefined
      if (refractiveIndex === undefined || refractiveIndex.length === 0) {
        report('镜片需要选择折射率。')
        return undefined
      }
      if (lensType === undefined) {
        report('镜片需要选择镜片类型。')
        return undefined
      }
      const numeric = collectNumbers(LENS_FIELDS, values, report)
      if (numeric === undefined) return undefined
      return {
        ...base,
        kind: 'lens',
        refractiveIndex: refractiveIndex as RefractiveIndex,
        lensType,
        ...(values.coating !== undefined && values.coating.trim().length > 0 ? { coating: values.coating.trim() } : {}),
        ...(values.sphereRange !== undefined && values.sphereRange.trim().length > 0
          ? { sphereRange: values.sphereRange.trim() }
          : {}),
        ...numeric,
      }
    }
    case 'product': {
      const numeric = collectNumbers(PRODUCT_FIELDS, values, report)
      if (numeric === undefined) return undefined
      const imagesText = (values.images ?? '').trim()
      const images = imagesText.length === 0
        ? undefined
        : imagesText.split(',').map(part => part.trim()).filter(part => part.length > 0)
      return {
        ...base,
        kind: 'product',
        ...(values.title !== undefined && values.title.trim().length > 0 ? { title: values.title.trim() } : {}),
        ...(values.sku !== undefined && values.sku.trim().length > 0 ? { sku: values.sku.trim() } : {}),
        ...(images === undefined || images.length === 0 ? {} : { images }),
        ...numeric,
      }
    }
  }
}

/** Parse the numeric fields of one kind; reports the first bad number. */
function collectNumbers(
  fields: readonly FieldSpec[],
  values: Record<string, string>,
  report: (message: string) => void,
): Record<string, number> | undefined {
  const result: Record<string, number> = {}
  for (const field of fields) {
    if (field.type !== 'number') continue
    const raw = (values[field.key] ?? '').trim()
    if (raw.length === 0) continue
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      report(`「${field.label}」需要是数字。`)
      return undefined
    }
    if (parsed < 0) {
      report(`「${field.label}」不能为负数。`)
      return undefined
    }
    result[field.key] = parsed
  }
  return result
}
