/**
 * 商品采集 workbench: a hand-entry ledger over the embedded client runtime's
 * `remote.rxlabCollect` namespace — 平台 → 店铺 → 商品, typed in by a person
 * and optionally filled in from drafts the collect agent proposed. Nothing is
 * captured here: every field comes from a person, or from a draft that a
 * person confirmed. zh copy until the app gains a locale dictionary
 * (wiki/agent precedent).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Trash2,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PanelHeader } from '@/components/panel-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import type { ModulePanelProps } from '@/modules/types'
import type {
  CollectDraft,
  CollectDraftPayload,
  CollectLink,
  CollectParam,
  CollectPlatform,
  CollectShop,
  CollectShopId,
} from '@deepseek-ai/dsh-rxlab-collect/types'
import type { CatalogImportRequest } from '@deepseek-ai/dsh-rxlab-catalog/types'
import { useConnected, useRxlabClient } from '@/rxlab/use-sessions'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { useModuleAgents } from '@/rxlab/use-settings'
import { moduleById } from '@/modules/registry'
import { ModuleAgentSurface } from '@/rxlab/module-agent/ModuleAgentSurface'
import { catalogImportCollected } from '@/modules/content/use-catalog'
import {
  draftCommit,
  draftReject,
  importLinks,
  linkRemove,
  linkUpsert,
  shopRemove,
  shopUpsert,
  useDraftList,
  useLinkList,
  useShopList,
  type LinkListFilters,
  type ListController,
  type ShopListFilters,
} from './use-collect'

const PLATFORMS: readonly CollectPlatform[] = ['jd', 'taobao', '1688', 'manual']

const PLATFORM_LABELS: Record<CollectPlatform, string> = {
  jd: '京东',
  taobao: '淘宝',
  '1688': '1688',
  manual: '手工',
}

/** 未归类商品在选择区里的哨兵值;店铺 id 都是 uuid,不会与之相撞。 */
const UNFILED = 'unfiled'

type LedgerSelection = typeof UNFILED | CollectShopId

function formatTime(value: string | undefined): string {
  if (value === undefined) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

/** 条目标题:人工录入的 title 优先,兼容域 v1/v2 记录的 titleAtAdd。 */
function displayTitle(link: CollectLink): string {
  return link.title ?? link.titleAtAdd ?? link.url
}

/** 把人工输入的价格文本解析为数值;解析不出时返回 null,由调用方决定是否写入。 */
function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, '')
  if (cleaned === '' || cleaned === '.') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** 参数输入:每行一条“名称:值”。无法解析的行被忽略。 */
function parseParams(text: string): { name: string; value: string }[] {
  const entries: { name: string; value: string }[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const stops = [trimmed.indexOf(':'), trimmed.indexOf('：')].filter(index => index > 0)
    if (stops.length === 0) continue
    const at = Math.min(...stops)
    const name = trimmed.slice(0, at).trim()
    const value = trimmed.slice(at + 1).trim()
    if (name.length > 0 && value.length > 0) entries.push({ name, value })
  }
  return entries
}

/** 参数回填成表单文本。 */
function paramsText(params: readonly CollectParam[] | undefined): string {
  return params === undefined ? '' : params.map(param => `${param.name}:${param.value}`).join('\n')
}

/** 草稿一行的摘要文案。 */
function draftSummary(payload: CollectDraftPayload): string {
  if (payload.target === 'shop') return `${PLATFORM_LABELS[payload.platform]} · ${payload.name}`
  return `${PLATFORM_LABELS[payload.platform]} · ${payload.title ?? payload.url}`
}

function BootSkeleton() {
  return (
    <div className="flex flex-col gap-(--workbench-panel-gap)">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-md" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-56 rounded-lg" />
    </div>
  )
}

export default function CollectPanel(props: ModulePanelProps) {
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
  return <CollectWorkbench runtime={runtime} module={props.module} />
}

interface TabProps {
  readonly runtime: RxlabClientRuntime
  readonly connected: boolean
  readonly notify: (message: string) => void
}

function CollectWorkbench({
  runtime,
  module,
}: {
  readonly runtime: RxlabClientRuntime
  readonly module: ModulePanelProps['module']
}) {
  const connected = useConnected(runtime)
  const moduleAgents = useModuleAgents(runtime, connected)
  const [banner, setBanner] = useState<string | null>(null)
  const [tab, setTab] = useState<'shops' | 'drafts' | 'agent'>('shops')

  const notify = useCallback((message: string) => { setBanner(message) }, [])
  const clearBanner = useCallback(() => { setBanner(null) }, [])
  const pendingDrafts = useDraftList(runtime, connected, { status: 'pending' })
  const pending = pendingDrafts.state.items.length

  return (
    <div className="flex flex-col gap-(--workbench-panel-gap)">
      <PanelHeader
        icon={module.icon}
        title={module.label}
        description={module.tagline}
      />
      {banner !== null && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 pt-4 text-sm">
            <span className="text-muted-foreground">{banner}</span>
            <Button variant="ghost" size="sm" onClick={clearBanner}>关闭</Button>
          </CardContent>
        </Card>
      )}
      <Tabs value={tab} onValueChange={(value) => { setTab(value as 'shops' | 'drafts' | 'agent') }}>
        <TabsList>
          <TabsTrigger value="shops">店铺台账</TabsTrigger>
          <TabsTrigger value="drafts">
            待确认草稿{pending > 0 && <Badge variant="secondary" className="ml-1">{pending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="agent">采集助手</TabsTrigger>
        </TabsList>
        {tab === 'shops' && (
          <ShopLedgerTab runtime={runtime} connected={connected} notify={notify} />
        )}
        {tab === 'drafts' && (
          <DraftReviewTab
            runtime={runtime}
            connected={connected}
            notify={notify}
            drafts={pendingDrafts}
          />
        )}
        {tab === 'agent' && (
          <ModuleAgentSurface
            moduleId="collect"
            label={moduleById('collect')?.label ?? '采集'}
            agent={moduleAgents.collect ?? { preset: 'collect', subdir: 'collect' }}
          />
        )}
      </Tabs>
    </div>
  )
}

/** 店铺台账:左栏按平台列店铺,右栏是该店铺的档案与商品条目。 */
function ShopLedgerTab({ runtime, connected, notify }: TabProps) {
  const [shopQuery, setShopQuery] = useState('')
  const [shopDebounced, setShopDebounced] = useState('')
  const [platform, setPlatform] = useState<'all' | CollectPlatform>('all')
  const [selection, setSelection] = useState<LedgerSelection | undefined>(undefined)
  const [linkQuery, setLinkQuery] = useState('')
  const [linkDebounced, setLinkDebounced] = useState('')
  const [shopDialog, setShopDialog] = useState<{ open: boolean; shop?: CollectShop }>({ open: false })
  const [productDialog, setProductDialog] = useState<{ open: boolean; link?: CollectLink }>({ open: false })
  const [csvOpen, setCsvOpen] = useState(false)
  const [removeShop, setRemoveShop] = useState<CollectShop | undefined>(undefined)
  const [removeLink, setRemoveLink] = useState<CollectLink | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => { setShopDebounced(shopQuery) }, 250)
    return () => { window.clearTimeout(timer) }
  }, [shopQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => { setLinkDebounced(linkQuery) }, 250)
    return () => { window.clearTimeout(timer) }
  }, [linkQuery])

  const shopFilters: ShopListFilters = {
    ...(platform === 'all' ? {} : { platform }),
    ...(shopDebounced.trim().length === 0 ? {} : { query: shopDebounced.trim() }),
  }
  const shops = useShopList(runtime, connected, shopFilters)

  const linkFilters: LinkListFilters = {
    ...(selection === undefined || selection === UNFILED ? {} : { shopRef: selection }),
    ...(selection === UNFILED ? { unfiled: true } : {}),
    ...(linkDebounced.trim().length === 0 ? {} : { query: linkDebounced.trim() }),
  }
  const links = useLinkList(runtime, connected, linkFilters)

  // 首次加载后自动选中第一个店铺,让右栏直接有事可做。
  useEffect(() => {
    if (selection !== undefined) return
    const first = shops.state.items[0]
    if (first !== undefined) setSelection(first.id)
  }, [selection, shops.state.items])

  const selectedShop = selection === undefined || selection === UNFILED
    ? undefined
    : shops.state.items.find(shop => shop.id === selection)

  const grouped = useMemo(() => {
    return PLATFORMS
      .map(p => ({ platform: p, shops: shops.state.items.filter(shop => shop.platform === p) }))
      .filter(group => group.shops.length > 0)
  }, [shops.state.items])

  const reloadAll = useCallback(() => {
    shops.reload()
    links.reload()
  }, [shops, links])

  const confirmRemoveShop = useCallback(async () => {
    if (removeShop === undefined) return
    setBusy(true)
    try {
      const result = await shopRemove(runtime, removeShop.id)
      notify(result.unfiled === 0
        ? `店铺「${removeShop.name}」已删除`
        : `店铺「${removeShop.name}」已删除,${result.unfiled} 条商品转为未归类`)
      setRemoveShop(undefined)
      if (selection === removeShop.id) setSelection(UNFILED)
      reloadAll()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [runtime, removeShop, selection, notify, reloadAll])

  const confirmRemoveLink = useCallback(async () => {
    if (removeLink === undefined) return
    setBusy(true)
    try {
      await linkRemove(runtime, removeLink.id)
      notify('商品条目已删除')
      setRemoveLink(undefined)
      links.reload()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [runtime, removeLink, notify, links])

  /** 把一条商品条目按人工确认的内容导入商品 Wiki。 */
  const importWiki = useCallback(async (link: CollectLink) => {
    setBusy(true)
    try {
      const shopName = link.shopRef === undefined
        ? undefined
        : shops.state.items.find(shop => shop.id === link.shopRef)?.name
      const request: CatalogImportRequest = {
        source: {
          platform: link.platform,
          url: link.url,
          linkId: String(link.id),
          ...(shopName === undefined ? {} : { shopName }),
          ...(link.sku === undefined ? {} : { sku: link.sku }),
        },
        listing: {
          title: displayTitle(link),
          ...(link.selectedSku === undefined ? {} : { selectedSku: link.selectedSku }),
          ...(link.price === undefined ? {} : { price: link.price.value, priceRaw: link.price.raw }),
          ...(link.params === undefined ? {} : { params: link.params }),
          ...(link.mainImageUrl === undefined ? {} : { mainImageUrl: link.mainImageUrl }),
        },
      }
      const result = await catalogImportCollected(runtime, request)
      notify(result.created ? '已导入商品 Wiki' : '已更新商品 Wiki 记录')
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [runtime, shops.state.items, notify])

  return (
    <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
      <Card className="h-fit">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">店铺</CardTitle>
            <Button size="sm" variant="outline" onClick={() => { setShopDialog({ open: true }) }}>
              <FolderPlus className="size-4" /> 新增
            </Button>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="搜索店铺" value={shopQuery}
                onChange={(event) => { setShopQuery(event.target.value) }} />
            </div>
            <Select value={platform} onValueChange={(value) => { setPlatform(value as 'all' | CollectPlatform) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                {PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[26rem]">
            <div className="flex flex-col gap-1 pr-2">
              <button
                type="button"
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${selection === UNFILED ? 'bg-accent' : 'hover:bg-accent/50'}`}
                onClick={() => { setSelection(UNFILED) }}
              >
                <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                <span>未归类商品</span>
              </button>
              {shops.state.phase === 'loading' && <Skeleton className="h-8 w-full" />}
              {shops.state.phase === 'error' && (
                <div className="text-sm text-destructive">{shops.state.error}</div>
              )}
              {shops.state.phase === 'ready' && shops.state.items.length === 0 && (
                <div className="pt-2 text-sm text-muted-foreground">还没有店铺,先「新增」一个。</div>
              )}
              {grouped.map(group => (
                <div key={group.platform} className="pt-2">
                  <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                    {PLATFORM_LABELS[group.platform]}
                  </div>
                  <div className="flex flex-col gap-1">
                    {group.shops.map(shop => (
                      <button
                        key={String(shop.id)}
                        type="button"
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${selection === shop.id ? 'bg-accent' : 'hover:bg-accent/50'}`}
                        onClick={() => { setSelection(shop.id) }}
                      >
                        <Store className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{shop.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {selectedShop !== undefined && (
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{selectedShop.name}</CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <Badge variant="outline">{PLATFORM_LABELS[selectedShop.platform]}</Badge>
                    {selectedShop.shopKey !== undefined && <span className="font-mono">{selectedShop.shopKey}</span>}
                    {selectedShop.homeUrl !== undefined && (
                      <a className="truncate underline" href={selectedShop.homeUrl} target="_blank" rel="noreferrer">
                        {selectedShop.homeUrl}
                      </a>
                    )}
                  </CardDescription>
                  {selectedShop.note !== undefined && (
                    <p className="pt-1 text-sm text-muted-foreground">{selectedShop.note}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setShopDialog({ open: true, shop: selectedShop }) }}>
                    <Pencil className="size-3.5" /> 编辑
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setRemoveShop(selectedShop) }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}
        {selection === UNFILED && (
          <Card>
            <CardContent className="pt-4 text-sm text-muted-foreground">
              这些商品还没有归属店铺。打开某条商品的「编辑」选一个店铺,即可把它们归位。
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="搜索商品标题 / SKU / 链接" value={linkQuery}
              onChange={(event) => { setLinkQuery(event.target.value) }} />
          </div>
          <Button variant="outline" size="sm" onClick={() => { reloadAll() }}>
            <RefreshCw className="size-4" /> 刷新
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" disabled={selectedShop === undefined}
            onClick={() => { setCsvOpen(true) }}>
            CSV 导入
          </Button>
          <Button size="sm" onClick={() => { setProductDialog({ open: true }) }}>
            <Plus className="size-4" /> 新增商品
          </Button>
        </div>

        <Card>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品</TableHead>
                  <TableHead className="w-20">平台</TableHead>
                  <TableHead className="w-28">价格</TableHead>
                  <TableHead className="w-32">SKU</TableHead>
                  <TableHead className="w-36">更新时间</TableHead>
                  <TableHead className="w-36">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.state.phase === 'loading' && (
                  <TableRow><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                )}
                {links.state.phase === 'error' && (
                  <TableRow><TableCell colSpan={6} className="text-destructive">{links.state.error}</TableCell></TableRow>
                )}
                {links.state.phase === 'ready' && links.state.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      暂无商品条目。用「新增商品」或 CSV 导入录入,也可以让采集助手分析材料后生成草稿。
                    </TableCell>
                  </TableRow>
                )}
                {links.state.items.map(link => (
                  <TableRow key={String(link.id)}>
                    <TableCell className="max-w-72">
                      <div className="truncate text-sm">{displayTitle(link)}</div>
                      <div className="truncate text-xs text-muted-foreground">{link.url}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{PLATFORM_LABELS[link.platform]}</Badge></TableCell>
                    <TableCell className="text-sm">{link.price?.raw ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{link.sku ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTime(link.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" title="编辑"
                          onClick={() => { setProductDialog({ open: true, link }) }}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" title="导入到商品 Wiki"
                          onClick={() => { void importWiki(link) }}>
                          <BookOpen className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" title="删除" onClick={() => { setRemoveLink(link) }}>
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
      </div>

      <ShopDialog
        runtime={runtime} notify={notify} open={shopDialog.open} shop={shopDialog.shop}
        onOpenChange={(open) => { setShopDialog(open ? { open: true, shop: shopDialog.shop } : { open: false }) }}
        onSaved={reloadAll}
      />
      <ProductDialog
        runtime={runtime} notify={notify} open={productDialog.open} link={productDialog.link}
        shops={shops.state.items} defaultShopRef={selectedShop?.id}
        onOpenChange={(open) => { setProductDialog(open ? { open: true, link: productDialog.link } : { open: false }) }}
        onSaved={() => { reloadAll() }}
      />
      <CsvImportDialog
        runtime={runtime} notify={notify} open={csvOpen} shop={selectedShop}
        onOpenChange={setCsvOpen} onSaved={() => { links.reload() }}
      />

      <AlertDialog open={removeShop !== undefined} onOpenChange={(open) => { if (!open) setRemoveShop(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除店铺「{removeShop?.name}」?</AlertDialogTitle>
            <AlertDialogDescription>
              店铺会被删除,其下商品条目保留并转为「未归类」,不会丢失。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => { void confirmRemoveShop() }}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} 删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeLink !== undefined} onOpenChange={(open) => { if (!open) setRemoveLink(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该商品条目?</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复。此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => { void confirmRemoveLink() }}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} 删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface ShopDialogProps {
  readonly runtime: RxlabClientRuntime
  readonly notify: (message: string) => void
  readonly open: boolean
  readonly shop?: CollectShop | undefined
  readonly onOpenChange: (open: boolean) => void
  readonly onSaved: () => void
}

/** 店铺档案:人工登记平台、店铺名、平台侧标识、主页与备注。 */
function ShopDialog({ runtime, notify, open, shop, onOpenChange, onSaved }: ShopDialogProps) {
  const [platform, setPlatform] = useState<CollectPlatform>('jd')
  const [name, setName] = useState('')
  const [shopKey, setShopKey] = useState('')
  const [homeUrl, setHomeUrl] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setPlatform(shop?.platform ?? 'jd')
    setName(shop?.name ?? '')
    setShopKey(shop?.shopKey ?? '')
    setHomeUrl(shop?.homeUrl ?? '')
    setNote(shop?.note ?? '')
    setSaving(false)
  }, [open, shop])

  const submit = useCallback(async () => {
    if (name.trim().length === 0) return
    setSaving(true)
    try {
      await shopUpsert(runtime, {
        platform,
        name: name.trim(),
        ...(shopKey.trim().length === 0 ? {} : { shopKey: shopKey.trim() }),
        ...(homeUrl.trim().length === 0 ? {} : { homeUrl: homeUrl.trim() }),
        ...(note.trim().length === 0 ? {} : { note: note.trim() }),
        ...(shop === undefined ? {} : { id: shop.id }),
      })
      notify(shop === undefined ? '店铺已登记' : '店铺已更新')
      onSaved()
      onOpenChange(false)
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [runtime, platform, name, shopKey, homeUrl, note, shop, notify, onSaved, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{shop === undefined ? '登记店铺' : '编辑店铺'}</DialogTitle>
          <DialogDescription>店铺是本模块的组织单位:商品条目都挂在某个店铺下。</DialogDescription>
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
              <Label>店铺名</Label>
              <Input value={name} placeholder="如 BOLON暴龙官方旗舰店"
                onChange={(event) => { setName(event.target.value) }} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>平台侧店铺标识(可选)</Label>
            <Input value={shopKey} placeholder="平台上的店铺 id / 旺旺号"
              onChange={(event) => { setShopKey(event.target.value) }} />
          </div>
          <div className="grid gap-1.5">
            <Label>店铺主页(可选)</Label>
            <Input value={homeUrl} placeholder="https://…"
              onChange={(event) => { setHomeUrl(event.target.value) }} />
          </div>
          <div className="grid gap-1.5">
            <Label>备注(可选)</Label>
            <Textarea className="h-20" value={note} onChange={(event) => { setNote(event.target.value) }} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false) }} disabled={saving}>取消</Button>
          <Button onClick={() => { void submit() }} disabled={saving || name.trim().length === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} 保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ProductDialogProps {
  readonly runtime: RxlabClientRuntime
  readonly notify: (message: string) => void
  readonly open: boolean
  readonly link?: CollectLink | undefined
  readonly shops: readonly CollectShop[]
  readonly defaultShopRef?: CollectShopId | undefined
  readonly onOpenChange: (open: boolean) => void
  readonly onSaved: () => void
}

/** 商品条目:全部字段由人工录入,或由人工确认的草稿带入。 */
function ProductDialog({
  runtime, notify, open, link, shops, defaultShopRef, onOpenChange, onSaved,
}: ProductDialogProps) {
  const [platform, setPlatform] = useState<CollectPlatform>('jd')
  const [shopRef, setShopRef] = useState<string>('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [sku, setSku] = useState('')
  const [selectedSku, setSelectedSku] = useState('')
  const [mainImageUrl, setMainImageUrl] = useState('')
  const [buyUrl, setBuyUrl] = useState('')
  const [params, setParams] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setPlatform(link?.platform ?? 'jd')
    setShopRef(link?.shopRef === undefined ? (defaultShopRef ?? '') : String(link.shopRef))
    setUrl(link?.url ?? '')
    setTitle(link?.title ?? link?.titleAtAdd ?? '')
    setPrice(link?.price?.raw ?? '')
    setSku(link?.sku ?? '')
    setSelectedSku(link?.selectedSku ?? '')
    setMainImageUrl(link?.mainImageUrl ?? '')
    setBuyUrl(link?.buyUrl ?? '')
    setParams(paramsText(link?.params))
    setNote(link?.note ?? '')
    setSaving(false)
  }, [open, link, defaultShopRef])

  const submit = useCallback(async () => {
    if (url.trim().length === 0) return
    setSaving(true)
    try {
      const priceText = price.trim()
      const priceValue = priceText.length === 0 ? null : parsePrice(priceText)
      const parsed = parseParams(params)
      const result = await linkUpsert(runtime, {
        platform,
        url: url.trim(),
        ...(shopRef === '' ? {} : { shopRef: shopRef as CollectShopId }),
        ...(title.trim().length === 0 ? {} : { title: title.trim() }),
        ...(priceText.length === 0 || priceValue === null ? {} : { price: { value: priceValue, raw: priceText } }),
        ...(sku.trim().length === 0 ? {} : { sku: sku.trim() }),
        ...(selectedSku.trim().length === 0 ? {} : { selectedSku: selectedSku.trim() }),
        ...(mainImageUrl.trim().length === 0 ? {} : { mainImageUrl: mainImageUrl.trim() }),
        ...(buyUrl.trim().length === 0 ? {} : { buyUrl: buyUrl.trim() }),
        ...(parsed.length === 0 ? {} : { params: parsed }),
        ...(note.trim().length === 0 ? {} : { note: note.trim() }),
        ...(link === undefined ? {} : { id: link.id }),
      })
      notify(link === undefined
        ? (result.merged ? '同链接已存在,已合并更新' : '商品条目已新增')
        : '商品条目已更新')
      onSaved()
      onOpenChange(false)
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [
    runtime, platform, shopRef, url, title, price, sku, selectedSku, mainImageUrl, buyUrl, params, note,
    link, notify, onSaved, onOpenChange,
  ])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{link === undefined ? '新增商品条目' : '编辑商品条目'}</DialogTitle>
          <DialogDescription>所有字段由人工填写;采集助手只会产出待确认的草稿。</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[28rem] pr-3">
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
                <Label>归属店铺</Label>
                <Select value={shopRef === '' ? 'none' : shopRef}
                  onValueChange={(value) => { setShopRef(value === 'none' ? '' : value) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未归类</SelectItem>
                    {shops.map(shop => (
                      <SelectItem key={String(shop.id)} value={String(shop.id)}>
                        {PLATFORM_LABELS[shop.platform]} · {shop.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>商品链接</Label>
              <Input value={url} placeholder="https://item.jd.com/100012345678.html"
                onChange={(event) => { setUrl(event.target.value) }} />
            </div>
            <div className="grid gap-1.5">
              <Label>标题</Label>
              <Input value={title} onChange={(event) => { setTitle(event.target.value) }} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>价格</Label>
                <Input value={price} placeholder="如 ¥1,280.00"
                  onChange={(event) => { setPrice(event.target.value) }} />
              </div>
              <div className="grid gap-1.5">
                <Label>SKU(可选)</Label>
                <Input value={sku} onChange={(event) => { setSku(event.target.value) }} />
              </div>
              <div className="grid gap-1.5">
                <Label>已选规格(可选)</Label>
                <Input value={selectedSku} onChange={(event) => { setSelectedSku(event.target.value) }} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>主图链接(可选)</Label>
              <Input value={mainImageUrl} placeholder="https://…"
                onChange={(event) => { setMainImageUrl(event.target.value) }} />
            </div>
            <div className="grid gap-1.5">
              <Label>购买链接(可选)</Label>
              <Input value={buyUrl} placeholder="https://…"
                onChange={(event) => { setBuyUrl(event.target.value) }} />
            </div>
            <div className="grid gap-1.5">
              <Label>规格参数(可选,每行“名称:值”)</Label>
              <Textarea className="h-24 font-mono text-xs" value={params}
                placeholder={'材质:TR90\n尺寸:54-18-145'}
                onChange={(event) => { setParams(event.target.value) }} />
            </div>
            <div className="grid gap-1.5">
              <Label>备注(可选)</Label>
              <Textarea className="h-20" value={note} onChange={(event) => { setNote(event.target.value) }} />
            </div>
          </div>
        </ScrollArea>
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

interface CsvImportDialogProps {
  readonly runtime: RxlabClientRuntime
  readonly notify: (message: string) => void
  readonly open: boolean
  readonly shop: CollectShop | undefined
  readonly onOpenChange: (open: boolean) => void
  readonly onSaved: () => void
}

/** CSV 导入:表头 url + 可选 platform/sku/title,全部导入到当前店铺。 */
function CsvImportDialog({ runtime, notify, open, shop, onOpenChange, onSaved }: CsvImportDialogProps) {
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
      const result = await importLinks(runtime, text, shop?.id)
      setSummary([
        `新增 ${result.created} 条,合并 ${result.updated} 条`,
        ...result.rejected.map(entry => `第 ${entry.row} 行:${entry.reason}`),
      ].join('\n'))
      notify('CSV 导入完成')
      onSaved()
    } catch (cause) {
      setSummary(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [runtime, text, shop, notify, onSaved])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>CSV 导入商品</DialogTitle>
          <DialogDescription>
            表头:url + 可选 platform / sku / title。platform 留空时按 url 自动推断。
            导入的条目全部归到「{shop?.name ?? '未归类'}」。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Textarea className="h-48 font-mono text-xs"
            placeholder={'url,title\nhttps://item.jd.com/10120538639231.html,暴龙 BA7009'}
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

/** 待确认草稿:采集助手产出的条目,人工逐条确认后才落库。 */
function DraftReviewTab({
  runtime,
  connected,
  notify,
  drafts,
}: TabProps & { readonly drafts: ListController<CollectDraft> }) {
  const [busyId, setBusyId] = useState<string | undefined>(undefined)
  const [fileUnder, setFileUnder] = useState<Record<string, string>>({})
  const shops = useShopList(runtime, connected, {})

  const pending = drafts.state.items

  const confirm = useCallback(async (draft: CollectDraft) => {
    const target = draft.payload.target === 'product' ? fileUnder[String(draft.id)] : undefined
    setBusyId(String(draft.id))
    try {
      await draftCommit(runtime, draft.id, target === undefined || target === '' ? undefined : target as CollectShopId)
      notify(draft.payload.target === 'shop' ? '草稿已确认,店铺已登记' : '草稿已确认,商品已入库')
      drafts.reload()
      shops.reload()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusyId(undefined)
    }
  }, [runtime, notify, drafts, shops, fileUnder])

  const reject = useCallback(async (draft: CollectDraft) => {
    setBusyId(String(draft.id))
    try {
      await draftReject(runtime, draft.id)
      notify('草稿已拒绝')
      drafts.reload()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusyId(undefined)
    }
  }, [runtime, notify, drafts])

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-4 text-sm">
          <span className="text-muted-foreground">
            采集助手只能产出草稿。这里每条草稿都需要你确认才会写入店铺或商品台账。
          </span>
          <Button variant="outline" size="sm" onClick={() => { drafts.reload() }}>
            <RefreshCw className="size-4" /> 刷新
          </Button>
        </CardContent>
      </Card>

      {drafts.state.phase === 'loading' && <Skeleton className="h-24 w-full" />}
      {drafts.state.phase === 'error' && (
        <Card><CardContent className="pt-4 text-sm text-destructive">{drafts.state.error}</CardContent></Card>
      )}
      {drafts.state.phase === 'ready' && pending.length === 0 && (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            没有待确认的草稿。在「采集助手」里把店铺或商品材料交给它,它会生成草稿待你确认。
          </CardContent>
        </Card>
      )}

      {pending.map((draft) => {
        const busy = busyId === String(draft.id)
        return (
          <Card key={String(draft.id)}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{draft.payload.target === 'shop' ? '店铺' : '商品'}</Badge>
                  <CardTitle className="text-sm font-medium">{draftSummary(draft.payload)}</CardTitle>
                </div>
                <span className="text-xs text-muted-foreground">{formatTime(draft.createdAt)}</span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0 text-sm">
              <DraftFields payload={draft.payload} />
              {draft.sourceText !== undefined && (
                <div className="rounded-md border p-2">
                  <div className="text-xs font-medium text-muted-foreground">来源材料</div>
                  <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
                    {draft.sourceText}
                  </pre>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {draft.payload.target === 'product' && (
                  <Select
                    value={fileUnder[String(draft.id)] ?? 'none'}
                    onValueChange={(value) => {
                      setFileUnder(previous => ({ ...previous, [String(draft.id)]: value === 'none' ? '' : value }))
                    }}
                  >
                    <SelectTrigger className="w-56"><SelectValue placeholder="归属店铺" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不指定店铺</SelectItem>
                      {shops.state.items.map(shop => (
                        <SelectItem key={String(shop.id)} value={String(shop.id)}>{shop.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex-1" />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { void reject(draft) }}>
                  <X className="size-4" /> 拒绝
                </Button>
                <Button size="sm" disabled={busy} onClick={() => { void confirm(draft) }}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} 确认落库
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/** 草稿正文:按目标表列出它要写入的字段。 */
function DraftFields({ payload }: { readonly payload: CollectDraftPayload }) {
  const rows: { label: string; value: string }[] = payload.target === 'shop'
    ? [
      { label: '平台', value: PLATFORM_LABELS[payload.platform] },
      { label: '店铺名', value: payload.name },
      ...(payload.shopKey === undefined ? [] : [{ label: '店铺标识', value: payload.shopKey }]),
      ...(payload.homeUrl === undefined ? [] : [{ label: '店铺主页', value: payload.homeUrl }]),
      ...(payload.note === undefined ? [] : [{ label: '备注', value: payload.note }]),
    ]
    : [
      { label: '平台', value: PLATFORM_LABELS[payload.platform] },
      { label: '链接', value: payload.url },
      ...(payload.title === undefined ? [] : [{ label: '标题', value: payload.title }]),
      ...(payload.price === undefined ? [] : [{ label: '价格', value: payload.price.raw }]),
      ...(payload.sku === undefined ? [] : [{ label: 'SKU', value: payload.sku }]),
      ...(payload.selectedSku === undefined ? [] : [{ label: '已选规格', value: payload.selectedSku }]),
      ...(payload.mainImageUrl === undefined ? [] : [{ label: '主图', value: payload.mainImageUrl }]),
      ...(payload.buyUrl === undefined ? [] : [{ label: '购买链接', value: payload.buyUrl }]),
      ...(payload.params === undefined
        ? []
        : [{ label: '规格参数', value: payload.params.map(param => `${param.name}:${param.value}`).join(' / ') }]),
      ...(payload.note === undefined ? [] : [{ label: '备注', value: payload.note }]),
    ]
  return (
    <div className="grid gap-1">
      {rows.map(row => (
        <div key={row.label} className="flex gap-2 text-xs">
          <span className="w-16 shrink-0 text-muted-foreground">{row.label}</span>
          <span className="min-w-0 flex-1 break-all">{row.value}</span>
        </div>
      ))}
    </div>
  )
}
