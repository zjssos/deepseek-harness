/**
 * 商品采集 workbench: manage platform/shop/product-link assets (manual entry
 * and CSV import), trigger serial run batches over selected links, and review
 * capture history — all over the embedded client runtime's
 * `remote.rxlabCollect` namespace. Deterministic L1 collectors run host-side,
 * so this module works without a model key. zh copy until the app gains a
 * locale dictionary (wiki/agent precedent).
 */
import { useCallback, useEffect, useState } from 'react'
import {
  BookOpen,
  History,
  Link2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import type { ModulePanelProps } from '@/modules/types'
import type {
  CollectBatch,
  CollectBatchId,
  CollectLink,
  CollectLinkId,
  CollectLinkStatus,
  CollectPlatform,
} from '@deepseek-ai/dsh-rxlab-collect/types'
import type { CatalogImportRequest } from '@deepseek-ai/dsh-rxlab-catalog/types'
import { useConnected, useRxlabClient } from '@/modules/agent/use-sessions'
import type { RxlabClientRuntime } from '@/modules/agent/client'
import { catalogImportCollected } from '@/modules/wiki/use-catalog'
import {
  createBatch,
  importLinks,
  linkRemove,
  linkUpsert,
  useBatchDetail,
  useBatchList,
  useLinkCaptures,
  useLinkList,
  type LinkListFilters,
} from './use-collect'

const PLATFORMS: readonly CollectPlatform[] = ['jd', 'taobao', '1688', 'manual']
const STATUSES: readonly CollectLinkStatus[] = ['idle', 'running', 'ok', 'error']

const PLATFORM_LABELS: Record<CollectPlatform, string> = {
  jd: '京东',
  taobao: '淘宝',
  '1688': '1688',
  manual: '手工',
}

const STATUS_LABELS: Record<CollectLinkStatus, string> = {
  idle: '待采',
  running: '采集中',
  ok: '成功',
  error: '失败',
}

function formatTime(value: string | undefined): string {
  if (value === undefined) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatPrice(price: number | undefined): string {
  return price === undefined ? '' : `¥${price}`
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

export default function CollectPanel(_props: ModulePanelProps) {
  const { phase, error, runtime } = useRxlabClient()
  if (phase === 'booting' || runtime === undefined) return <BootSkeleton />
  if (phase === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>商品采集数据层启动失败</CardTitle>
          <CardDescription className="whitespace-pre-wrap">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return <CollectWorkbench runtime={runtime} />
}

function CollectWorkbench({ runtime }: { runtime: RxlabClientRuntime }) {
  const connected = useConnected(runtime)
  const [banner, setBanner] = useState<string | null>(null)
  const [tab, setTab] = useState<'links' | 'batches'>('links')
  const [focusBatch, setFocusBatch] = useState<CollectBatchId | undefined>(undefined)

  const notify = useCallback((message: string) => { setBanner(message) }, [])
  const clearBanner = useCallback(() => { setBanner(null) }, [])
  const goToBatch = useCallback((batchId: CollectBatchId) => {
    setFocusBatch(batchId)
    setTab('batches')
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">商品采集</h2>
          <p className="text-sm text-muted-foreground">
            平台 → 店铺 → 商品链接资产管理;选中链接成批次,由确定性采集器逐条抓取并落盘。
          </p>
        </div>
      </div>
      {banner !== null && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 pt-4 text-sm">
            <span className="text-muted-foreground">{banner}</span>
            <Button variant="ghost" size="sm" onClick={clearBanner}>关闭</Button>
          </CardContent>
        </Card>
      )}
      <Tabs value={tab} onValueChange={(value) => { setTab(value as 'links' | 'batches') }}>
        <TabsList>
          <TabsTrigger value="links">商品链接</TabsTrigger>
          <TabsTrigger value="batches">采集批次</TabsTrigger>
        </TabsList>
        {tab === 'links' && (
          <LinksTab runtime={runtime} connected={connected} notify={notify} onBatchCreated={goToBatch} />
        )}
        {tab === 'batches' && (
          <BatchesTab runtime={runtime} connected={connected} focusBatchId={focusBatch} />
        )}
      </Tabs>
    </div>
  )
}

interface TabProps {
  readonly runtime: RxlabClientRuntime
  readonly connected: boolean
  readonly notify: (message: string) => void
}

/** 商品链接:资产管理、筛选、选中成批次、单条采集/详情/删除。 */
function LinksTab({ runtime, connected, notify, onBatchCreated }: TabProps & { readonly onBatchCreated: (id: CollectBatchId) => void }) {
  const [platform, setPlatform] = useState<'all' | CollectPlatform>('all')
  const [status, setStatus] = useState<'all' | CollectLinkStatus>('all')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<CollectLinkId>>(new Set())
  const [running, setRunning] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [detailLink, setDetailLink] = useState<CollectLink | undefined>(undefined)
  const [removeTarget, setRemoveTarget] = useState<CollectLink | undefined>(undefined)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(query) }, 250)
    return () => { window.clearTimeout(timer) }
  }, [query])

  const filters: LinkListFilters = {
    ...(platform === 'all' ? {} : { platform }),
    ...(status === 'all' ? {} : { status }),
    ...(debounced.trim().length === 0 ? {} : { query: debounced.trim() }),
  }
  const list = useLinkList(runtime, connected, filters)

  // Light poll so link statuses follow in-flight batches without manual refresh.
  useEffect(() => {
    if (!connected) return
    const timer = window.setInterval(() => { list.reload() }, 4000)
    return () => { window.clearInterval(timer) }
  }, [connected])

  const toggleSelect = useCallback((id: CollectLinkId, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const runBatch = useCallback(async (linkIds: readonly CollectLinkId[], label: string) => {
    setRunning(true)
    try {
      const id = await createBatch(runtime, linkIds)
      notify(`${label}:批次已创建`)
      setSelected(new Set())
      onBatchCreated(id)
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
    }
  }, [runtime, notify, onBatchCreated])

  const confirmRemove = useCallback(async () => {
    if (removeTarget === undefined) return
    setRemoving(true)
    try {
      await linkRemove(runtime, removeTarget.id)
      notify('链接已删除(采集历史保留)')
      setRemoveTarget(undefined)
      list.reload()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRemoving(false)
    }
  }, [runtime, removeTarget, notify, list])

  const links = list.state.items
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="搜索店铺 / SKU / 链接" value={query}
            onChange={(event) => { setQuery(event.target.value) }} />
        </div>
        <Select value={platform} onValueChange={(value) => { setPlatform(value as 'all' | CollectPlatform) }}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部平台</SelectItem>
            {PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => { setStatus(value as 'all' | CollectLinkStatus) }}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => { list.reload() }}>
          <RefreshCw className="size-4" /> 刷新
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => { setCsvOpen(true) }}>CSV 导入</Button>
        <Button size="sm" variant="outline" onClick={() => { setAddOpen(true) }}>
          <Plus className="size-4" /> 新增链接
        </Button>
        <Button size="sm" disabled={selected.size === 0 || running} onClick={() => { void runBatch([...selected], `采集 ${selected.size} 条链接`) }}>
          <Play className="size-4" /> 采集所选 ({selected.size})
        </Button>
      </div>

      <Card>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>商品 / 链接</TableHead>
                <TableHead className="w-20">平台</TableHead>
                <TableHead className="w-28">店铺</TableHead>
                <TableHead className="w-20">状态</TableHead>
                <TableHead className="w-20">最近价</TableHead>
                <TableHead className="w-36">最近抓取</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.state.phase === 'loading' && (
                <TableRow><TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )}
              {list.state.phase === 'error' && (
                <TableRow><TableCell colSpan={8} className="text-destructive">{list.state.error}</TableCell></TableRow>
              )}
              {list.state.phase === 'ready' && links.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-muted-foreground">暂无链接,用 CSV 导入或新增链接开始。</TableCell></TableRow>
              )}
              {links.map(link => (
                <TableRow key={String(link.id)}>
                  <TableCell>
                    <Checkbox checked={selected.has(link.id)} onCheckedChange={(checked) => { toggleSelect(link.id, checked === true) }} />
                  </TableCell>
                  <TableCell className="max-w-72">
                    <div className="flex items-start gap-2">
                      <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate text-sm">{link.titleAtAdd ?? link.url}</div>
                        <div className="truncate text-xs text-muted-foreground">{link.url}</div>
                        {link.lastError !== undefined && (
                          <div className="truncate text-xs text-destructive" title={link.lastError}>{link.lastError}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{PLATFORM_LABELS[link.platform]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{link.shopName ?? link.shopId ?? '—'}</TableCell>
                  <TableCell><Badge variant={link.status === 'ok' ? 'secondary' : link.status === 'error' ? 'destructive' : 'outline'}>{STATUS_LABELS[link.status]}</Badge></TableCell>
                  <TableCell className="text-sm">{formatPrice(link.lastPrice)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatTime(link.lastCaptureAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" disabled={running || link.status === 'running'}
                        onClick={() => { void runBatch([link.id], `采集 ${link.titleAtAdd ?? link.url.slice(0, 24)}`) }}>
                        <Play className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setDetailLink(link) }}>
                        <History className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setRemoveTarget(link) }}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddLinkDialog runtime={runtime} connected={connected} open={addOpen} onOpenChange={setAddOpen}
        notify={notify} onSaved={() => { list.reload() }} />
      <CsvImportDialog runtime={runtime} connected={connected} open={csvOpen} onOpenChange={setCsvOpen}
        notify={notify} onSaved={() => { list.reload() }} />
      <LinkDetailDialog
        runtime={runtime} connected={connected} link={detailLink}
        onOpenChange={(open) => { if (!open) setDetailLink(undefined) }}
      />
      <AlertDialog open={removeTarget !== undefined} onOpenChange={(open) => { if (!open) setRemoveTarget(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该链接?</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该链接不再参与采集;已产生的采集历史保留。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={removing} onClick={() => { void confirmRemove() }}>
              {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} 删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 采集批次:列表 + 选中批次的逐项进度。 */
function BatchesTab({ runtime, connected, focusBatchId }: {
  readonly runtime: RxlabClientRuntime
  readonly connected: boolean
  readonly focusBatchId?: CollectBatchId
}) {
  const batches = useBatchList(runtime, connected)
  const [selectedId, setSelectedId] = useState<CollectBatchId | undefined>(undefined)

  useEffect(() => {
    if (!connected) return
    const timer = window.setInterval(() => { batches.reload() }, 4000)
    return () => { window.clearInterval(timer) }
  }, [connected])

  useEffect(() => {
    if (focusBatchId !== undefined) setSelectedId(focusBatchId)
  }, [focusBatchId])

  const detail = useBatchDetail(runtime, connected, selectedId)
  const detailBatch = detail.state.items[0]

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">批次列表</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-1">
            {batches.state.phase === 'loading' && <Skeleton className="h-8 w-full" />}
            {batches.state.phase === 'error' && <div className="text-destructive text-sm">{batches.state.error}</div>}
            {batches.state.phase === 'ready' && batches.state.items.length === 0 && (
              <div className="text-sm text-muted-foreground">暂无批次。在「商品链接」勾选链接后点“采集所选”。</div>
            )}
            {batches.state.items.map(batch => (
              <button key={String(batch.id)} type="button"
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${batch.id === selectedId ? 'bg-accent' : 'hover:bg-accent/50'}`}
                onClick={() => { setSelectedId(batch.id) }}>
                <span className="flex items-center gap-2">
                  <Badge variant={batch.status === 'done' ? 'secondary' : batch.status === 'partial' ? 'destructive' : 'outline'}>
                    {batch.status === 'done' ? '完成' : batch.status === 'partial' ? '部分失败' : batch.status === 'running' ? '运行中' : '排队中'}
                  </Badge>
                  <span className="text-muted-foreground">{formatTime(batch.createdAt)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {batch.counts.ok}/{batch.counts.total} 成功
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedId !== undefined && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">批次进度</CardTitle>
            <CardDescription className="text-xs">状态:{batchStatusText(detailBatch)}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-64">
              <div className="flex flex-col gap-1 pr-3">
                {detail.state.phase === 'loading' && <Skeleton className="h-8 w-full" />}
                {detail.state.phase === 'error' && <div className="text-sm text-destructive">{detail.state.error}</div>}
                {detailBatch?.items.map(item => (
                  <div key={String(item.linkId)} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                    <span className="truncate font-mono text-xs text-muted-foreground">{String(item.linkId).slice(0, 8)}</span>
                    <span className="flex-1 truncate text-xs">
                      {item.status === 'ok' ? '已采集' : item.status === 'error' ? item.error : '等待中'}
                    </span>
                    <Badge variant={item.status === 'ok' ? 'secondary' : item.status === 'error' ? 'destructive' : 'outline'}>
                      {item.status === 'ok' ? '成功' : item.status === 'error' ? '失败' : '待采'}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function batchStatusText(batch: CollectBatch | undefined): string {
  if (batch === undefined) return '—'
  if (batch.status === 'done') return '完成'
  if (batch.status === 'partial') return '部分失败(可对失败链接重试)'
  if (batch.status === 'running') return '运行中'
  return '排队中'
}

interface DialogBaseProps extends TabProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSaved: () => void
}

/** 新增链接:平台 + URL(必填),店铺名/标题可选。 */
function AddLinkDialog({ runtime, open, onOpenChange, notify, onSaved }: DialogBaseProps) {
  const [platform, setPlatform] = useState<CollectPlatform>('jd')
  const [url, setUrl] = useState('')
  const [shopName, setShopName] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setUrl('')
      setShopName('')
      setTitle('')
      setSaving(false)
    }
  }, [open])

  const submit = useCallback(async () => {
    if (url.trim().length === 0) return
    setSaving(true)
    try {
      const result = await linkUpsert(runtime, {
        platform,
        url: url.trim(),
        ...(shopName.trim().length === 0 ? {} : { shopName: shopName.trim() }),
        ...(title.trim().length === 0 ? {} : { titleAtAdd: title.trim() }),
      })
      notify(result.merged ? '链接已存在,已合并更新' : '链接已新增')
      onSaved()
      onOpenChange(false)
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [runtime, platform, url, shopName, title, notify, onSaved, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增商品链接</DialogTitle>
          <DialogDescription>登记一条商品详情链接,加入采集资产。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>平台</Label>
              <Select value={platform} onValueChange={(value) => { setPlatform(value as CollectPlatform) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>店铺名(可选)</Label>
              <Input value={shopName} placeholder="如 BOLON暴龙官方旗舰店"
                onChange={(event) => { setShopName(event.target.value) }} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>商品详情链接</Label>
            <Input value={url} placeholder="https://item.jd.com/100012345678.html"
              onChange={(event) => { setUrl(event.target.value) }} />
          </div>
          <div className="grid gap-1.5">
            <Label>标题(可选)</Label>
            <Input value={title} placeholder="便于列表辨认;采集时会覆盖为页面标题"
              onChange={(event) => { setTitle(event.target.value) }} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false) }} disabled={saving}>取消</Button>
          <Button onClick={() => { void submit() }} disabled={saving || url.trim().length === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} 保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** CSV 导入:表头 platform,url + 可选 shopId/shopName/sku/title。 */
function CsvImportDialog({ runtime, open, onOpenChange, notify, onSaved }: DialogBaseProps) {
  const [text, setText] = useState('')
  const [summary, setSummary] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setText('')
      setSummary(null)
      setSaving(false)
    }
  }, [open])

  const submit = useCallback(async () => {
    if (text.trim().length === 0) return
    setSaving(true)
    try {
      const result = await importLinks(runtime, text)
      const lines = [
        `新增 ${result.created} 条,合并 ${result.updated} 条`,
        ...result.rejected.map(entry => `第 ${entry.row} 行:${entry.reason}`),
      ]
      setSummary(lines.join('\n'))
      notify('CSV 导入完成')
      onSaved()
    } catch (cause) {
      setSummary(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [runtime, text, notify, onSaved])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>CSV 导入链接</DialogTitle>
          <DialogDescription>
            表头:platform,url + 可选 shopId / shopName / sku / title。platform 留空时按 url 自动推断。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Textarea className="h-48 font-mono text-xs" placeholder={'platform,url,shopName\njd,https://item.jd.com/10120538639231.html,BOLON暴龙官方旗舰店'}
            value={text} onChange={(event) => { setText(event.target.value) }} />
          {summary !== null && (
            <ScrollArea className="max-h-32">
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{summary}</pre>
            </ScrollArea>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false) }} disabled={saving}>关闭</Button>
          <Button onClick={() => { void submit() }} disabled={saving || text.trim().length === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} 导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 链接详情:最近一次采集字段 + 历史记录 + 导入到 Wiki。 */
function LinkDetailDialog({ runtime, connected, link, onOpenChange }: {
  readonly runtime: RxlabClientRuntime
  readonly connected: boolean
  readonly link: CollectLink | undefined
  readonly onOpenChange: (open: boolean) => void
}) {
  const captures = useLinkCaptures(runtime, connected, link?.id)
  const latest = captures.state.items[0]
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  useEffect(() => {
    setImporting(false)
    setImportMessage(null)
  }, [link?.id])

  const importWiki = useCallback(async () => {
    if (link === undefined || latest === undefined) return
    setImporting(true)
    setImportMessage(null)
    try {
      const request: CatalogImportRequest = {
        source: {
          platform: link.platform,
          url: link.url,
          linkId: link.id,
          shopName: link.shopName,
          sku: link.sku,
          captureId: latest.id,
          capturedAt: latest.capturedAt,
        },
        listing: {
          title: latest.fields.title ?? link.titleAtAdd ?? link.url,
          selectedSku: latest.fields.selectedSku,
          price: latest.fields.price?.value,
          priceRaw: latest.fields.price?.raw,
          params: latest.fields.params,
          mainImageUrl: latest.fields.mainImageUrl,
        },
      }
      const result = await catalogImportCollected(runtime, request)
      setImportMessage(result.created ? '已导入商品 Wiki' : '已更新 Wiki 记录（价格/属性合并）')
    } catch (cause) {
      setImportMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImporting(false)
    }
  }, [runtime, link, latest])

  const canImport = latest !== undefined && latest.error === undefined

  return (
    <Dialog open={link !== undefined} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>链接详情</DialogTitle>
          <DialogDescription className="truncate">{link?.url}</DialogDescription>
        </DialogHeader>
        {link !== undefined && (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{PLATFORM_LABELS[link.platform]}</Badge>
              <span>{link.shopName ?? '—'}</span>
              {link.sku !== undefined && <span className="font-mono text-xs text-muted-foreground">SKU {link.sku}</span>}
              <Badge variant={link.status === 'ok' ? 'secondary' : link.status === 'error' ? 'destructive' : 'outline'}>
                {STATUS_LABELS[link.status]}
              </Badge>
            </div>
            <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
              <div className="text-xs font-medium text-muted-foreground">最近一次采集</div>
              {captures.state.phase === 'loading' && <Skeleton className="h-8 w-full" />}
              {latest === undefined && captures.state.phase === 'ready' && (
                <div className="text-muted-foreground">尚无采集记录。</div>
              )}
              {latest !== undefined && (
                <div className="grid gap-1">
                  <div className="font-medium">{latest.fields.title ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">
                    价格:{latest.fields.price ? `${latest.fields.price.raw}(${latest.fields.price.note ?? ''})` : '—'} | 已选:{latest.fields.selectedSku ?? '—'} | {formatTime(latest.capturedAt)}
                  </div>
                  {latest.fields.buyUrl !== undefined && (
                    <a className="truncate text-xs text-primary underline" href={latest.fields.buyUrl} target="_blank" rel="noreferrer">
                      购买链接:{latest.fields.buyUrl}
                    </a>
                  )}
                  {latest.error !== undefined && <div className="text-xs text-destructive">{latest.error}</div>}
                </div>
              )}
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs font-medium text-muted-foreground">历史记录</div>
              {captures.state.items.length === 0 && captures.state.phase === 'ready' && (
                <div className="mt-1 text-muted-foreground">无历史。</div>
              )}
              <div className="mt-1 flex max-h-36 flex-col gap-0.5 overflow-y-auto">
                {captures.state.items.map(capture => (
                  <div key={String(capture.id)} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatTime(capture.capturedAt)}</span>
                    <span>{formatPrice(capture.fields.price?.value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter className="items-center gap-2 sm:justify-between">
              {importMessage !== null ? (
                <span className="text-xs text-muted-foreground">{importMessage}</span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {canImport ? '将把最近一次采集导入商品 Wiki。' : '需要一次成功的采集才能导入。'}
                </span>
              )}
              <Button size="sm" disabled={!canImport || importing} onClick={() => { void importWiki() }}>
                {importing ? <Loader2 className="animate-spin" /> : <BookOpen />}
                导入到 Wiki
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
