/**
 * 工单工作台：一条工单的全部作业面。左列在配镜流程与工单级视图之间切换，右列
 * 渲染选中的阶段面板、会话、配镜指南或用量。阶段不再是独立路由，由 `?view=`
 * 选择；工单身份由 `/jobs/:jobId` 决定，壳层负责绑定与阶段进度。
 */
import { Suspense, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BadgeCheck, CircleAlert, Download, Loader2, Pencil, RefreshCw, Send, Sparkles, Trash2, UserRound,
} from 'lucide-react'

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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { JobRecord, JobStatus, Money } from '@deepseek-ai/dsh-rxlab-job/types'
import { useWorkbenchJob, type StageProgress } from '@/app/workbench-context'
import { JOB_STATUS_LABELS } from '@/lib/job-labels'
import { cn } from '@/lib/utils'
import { stageModules } from '@/modules/registry'
import { STAGE_LABELS } from '@/modules/stages/stage-meta'
import { useConnected, useSessionActions } from '@/rxlab/use-sessions'
import { useWorkspaceRoot } from '@/rxlab/use-settings'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { bindSession, deleteJob, generateGuide, updateJob, useJobUsage } from '@/modules/stages/use-job'
import { consumerSummary, formatMoney } from './consumer'
import { ConsumerDialog } from './ConsumerDialog'
import { GuideDocumentView } from './GuideView'
import { downloadGuideHtml } from './guide-html'

const STATUS_OPTIONS = Object.keys(JOB_STATUS_LABELS) as JobStatus[]

/** Work-order-level views that sit beside the six workflow stages. */
const JOB_VIEWS = [
  { id: 'session', label: '会话' },
  { id: 'guide', label: '配镜指南' },
  { id: 'usage', label: '用量与成本' },
] as const

function totalTokens(totals: {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): number {
  return totals.uncachedInputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
}

/** The view the workbench opens on: the first stage the workflow has not closed. */
function defaultView(progress: readonly StageProgress[]): string {
  const open = progress.find(entry => entry.status !== 'done' && entry.status !== 'skipped')
  return open?.stage ?? 'guide'
}

function BootSkeleton() {
  return (
    <div className="flex flex-col gap-(--workbench-panel-gap)">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-md" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <Skeleton className="h-56 rounded-lg" />
    </div>
  )
}

/** Failure surface for a work order the shell could not read. */
function WorkbenchFailure({ message }: { readonly message: string | undefined }) {
  return (
    <Card>
      <CardContent className="text-destructive flex items-start gap-2 pt-4 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span className="whitespace-pre-wrap">{message ?? '工单读取失败'}</span>
      </CardContent>
    </Card>
  )
}

export default function JobDetailPanel() {
  const { phase, error, runtime, job, detailPhase, detailError } = useWorkbenchJob()

  if (phase === 'booting' || runtime === undefined) return <BootSkeleton />
  if (phase === 'failed') return <WorkbenchFailure message={error} />
  if (detailPhase === 'error') return <WorkbenchFailure message={detailError} />
  if (job === undefined) return <BootSkeleton />

  return <WorkOrderWorkbench runtime={runtime} job={job} />
}

/** One work order's workbench over a ready runtime. */
function WorkOrderWorkbench({ runtime, job }: {
  readonly runtime: RxlabClientRuntime
  readonly job: JobRecord
}) {
  const { guide, progress, reload } = useWorkbenchJob()
  const navigate = useNavigate()
  const connected = useConnected(runtime)
  const workspaceRoot = useWorkspaceRoot(runtime, connected)
  const actions = useSessionActions(runtime)
  const usage = useJobUsage(runtime, connected, job.id)
  const [params, setParams] = useSearchParams()
  const [editConsumerOpen, setEditConsumerOpen] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState<'bind' | 'guide' | 'delete' | undefined>(undefined)
  const [banner, setBanner] = useState<string | null>(null)

  const view = params.get('view') ?? defaultView(progress)
  const openView = (next: string): void => {
    const updated = new URLSearchParams(params)
    updated.set('view', next)
    setParams(updated)
  }

  const onBind = async (): Promise<void> => {
    if (busy !== undefined) return
    setBusy('bind')
    setBanner(null)
    try {
      const cwd = workspaceRoot === undefined ? undefined : `${workspaceRoot}/jobs/${String(job.id)}`
      const sessionId = await actions.create({
        agentPreset: 'guide',
        ...(cwd === undefined ? {} : { cwd }),
      })
      if (sessionId === undefined) {
        setBanner('新建会话未返回 id。')
        return
      }
      await bindSession(runtime, job.id, sessionId)
      reload()
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const onGenerate = async (): Promise<void> => {
    if (busy !== undefined) return
    setBusy('guide')
    setBanner(null)
    try {
      await generateGuide(runtime, job.id)
      reload()
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const onDelete = async (): Promise<void> => {
    if (busy !== undefined) return
    setBusy('delete')
    setBanner(null)
    try {
      await deleteJob(runtime, job.id)
      void navigate('/jobs')
    } catch (cause) {
      setBanner(cause instanceof Error ? cause.message : String(cause))
      setBusy(undefined)
      setConfirmDelete(false)
    }
  }

  const stage = stageModules().find(module => module.id === view)

  return (
    <div className="flex flex-col gap-(--workbench-panel-gap)">
      <PanelHeader
        icon={UserRound}
        title={job.consumer.name ?? '未命名消费者'}
        description={consumerSummary(job.consumer) || '尚未补充消费画像'}
        status={
          <>
            <Badge variant="outline">{JOB_STATUS_LABELS[job.status]}</Badge>
            {job.pricing === undefined ? null : <Badge variant="secondary">{formatMoney(job.pricing)}</Badge>}
          </>
        }
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditConsumerOpen(true) }}>
              <Pencil className="size-3.5" />编辑画像
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setMetaOpen(true) }}>
              <BadgeCheck className="size-3.5" />状态 / 价格
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive gap-1.5"
              onClick={() => { setConfirmDelete(true) }}>
              <Trash2 className="size-3.5" />删除
            </Button>
          </>
        }
      />

      {banner !== null ? (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-xs">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{banner}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-(--workbench-panel-gap) lg:flex-row lg:items-start">
        <nav className="flex shrink-0 flex-col gap-4 lg:sticky lg:top-0 lg:w-44" aria-label="工单视图">
          <div className="flex flex-col gap-0.5">
            <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">配镜流程</p>
            {stageModules().map(module => (
              <NavItem
                key={module.id}
                active={view === module.id}
                onSelect={() => { openView(module.id) }}
              >
                {module.label}
              </NavItem>
            ))}
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">工单</p>
            {JOB_VIEWS.map(entry => (
              <NavItem
                key={entry.id}
                active={view === entry.id}
                onSelect={() => { openView(entry.id) }}
              >
                {entry.label}
              </NavItem>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          {stage === undefined
            ? view === 'session'
              ? <SessionCard job={job} busy={busy} onBind={() => { void onBind() }} onOpen={() => { void navigate('/agent') }} />
              : view === 'usage'
                ? <UsageCard state={usage.state} onReload={usage.reload} />
                : <GuideCard guide={guide} busy={busy} onGenerate={() => { void onGenerate() }} />
            : (
              <Suspense fallback={<Skeleton className="h-56 rounded-lg" />}>
                <stage.panel module={stage} />
              </Suspense>
            )}
        </div>
      </div>

      <ConsumerDialog
        open={editConsumerOpen}
        onOpenChange={setEditConsumerOpen}
        initial={job.consumer}
        title="编辑消费画像"
        onSubmit={async (consumer) => {
          await updateJob(runtime, job.id, { consumer })
          reload()
        }}
      />

      <JobMetaDialog
        runtime={runtime}
        job={job}
        open={metaOpen}
        onOpenChange={setMetaOpen}
        onSaved={reload}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条工单？</AlertDialogTitle>
            <AlertDialogDescription>
              「{job.consumer.name ?? '未命名消费者'}」及其阶段记录、指南将从 rxlab_job 域删除，不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== undefined}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={busy !== undefined} onClick={(event) => { event.preventDefault(); void onDelete() }}>
              {busy === 'delete' ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** One workbench view row in the left column. */
function NavItem({ active, onSelect, children }: {
  readonly active: boolean
  readonly onSelect: () => void
  readonly children: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'hover:bg-accent/60 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-accent font-medium' : 'text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** The bound agent session for this work order. */
function SessionCard({ job, busy, onBind, onOpen }: {
  readonly job: JobRecord
  readonly busy: 'bind' | 'guide' | 'delete' | undefined
  readonly onBind: () => void
  readonly onOpen: () => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">会话</CardTitle>
        <CardDescription>一个工单对应一个 agent 会话；阶段语义任务由会话内的阶段工具触发。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {job.sessionId === undefined ? (
          <>
            <span className="text-muted-foreground text-sm">尚未绑定会话。</span>
            <Button size="sm" className="gap-1.5" disabled={busy !== undefined} onClick={onBind}>
              {busy === 'bind' ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              新建并绑定会话
            </Button>
          </>
        ) : (
          <>
            <code className="min-w-0 truncate font-mono text-xs">{job.sessionId}</code>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpen}>打开会话</Button>
            <Button size="sm" variant="ghost" className="gap-1.5" disabled={busy !== undefined} onClick={onBind}>
              <RefreshCw className="size-3.5" />重新绑定
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Deterministic guide assembly, rendering, and HTML export. */
function GuideCard({ guide, busy, onGenerate }: {
  readonly guide: ReturnType<typeof useWorkbenchJob>['guide']
  readonly busy: 'bind' | 'guide' | 'delete' | undefined
  readonly onGenerate: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-sm">配镜指南</CardTitle>
          <CardDescription>由确定性组装器从阶段产出与话术域拼装。</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {guide === undefined ? null : (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { downloadGuideHtml(guide) }}>
              <Download className="size-3.5" />导出 HTML
            </Button>
          )}
          <Button size="sm" className="gap-1.5" disabled={busy !== undefined} onClick={onGenerate}>
            {busy === 'guide' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            生成指南
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {guide === undefined
          ? <p className="text-muted-foreground text-xs">尚未生成指南。完成阶段产出后点「生成指南」。</p>
          : <GuideDocumentView document={guide} />}
      </CardContent>
    </Card>
  )
}

/** Token/cost usage for this work order. */
function UsageCard({ state, onReload }: {
  readonly state: ReturnType<typeof useJobUsage>['state']
  readonly onReload: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-sm">用量与成本</CardTitle>
          <CardDescription>来自 rxlabUsage；成本按运行时配置的路由费率，未配置时省略。</CardDescription>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onReload}>
          <RefreshCw className="size-3.5" />刷新
        </Button>
      </CardHeader>
      <CardContent>
        <UsageBlock state={state} />
      </CardContent>
    </Card>
  )
}

/** Job status + pricing editor. */
function JobMetaDialog({
  runtime, job, open, onOpenChange, onSaved,
}: {
  readonly runtime: RxlabClientRuntime
  readonly job: JobRecord
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSaved: () => void
}) {
  const [status, setStatus] = useState<JobStatus>(job.status)
  const [amount, setAmount] = useState(job.pricing === undefined ? '' : String(job.pricing.amount))
  const [currency, setCurrency] = useState(job.pricing?.currency ?? 'CNY')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (busy) return
    const trimmedAmount = amount.trim()
    let pricing: Money | undefined
    if (trimmedAmount.length > 0) {
      const parsed = Number(trimmedAmount)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setNotice('「价格」需要是 0 或正数。')
        return
      }
      pricing = { amount: parsed, currency: currency.trim() === '' ? 'CNY' : currency.trim() }
    }
    setBusy(true)
    setNotice(null)
    try {
      await updateJob(runtime, job.id, { status, ...(pricing === undefined ? {} : { pricing }) })
      onSaved()
      onOpenChange(false)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>状态与对客价格</DialogTitle>
          <DialogDescription>价格只登记在工单；tokens 与成本归属 rxlabUsage。</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>状态</FieldLabel>
            <Select value={status} onValueChange={(value) => { setStatus(value as JobStatus) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(option => <SelectItem key={option} value={option}>{JOB_STATUS_LABELS[option]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="job-price">价格</FieldLabel>
              <Input id="job-price" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value) }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="job-currency">币种</FieldLabel>
              <Input id="job-currency" value={currency} onChange={(event) => { setCurrency(event.target.value) }} />
            </Field>
          </div>
        </FieldGroup>
        {notice !== null ? (
          <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-xs">
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

/** Token/cost rendering for one job-usage fetch. */
function UsageBlock({ state }: { readonly state: ReturnType<typeof useJobUsage>['state'] }) {
  if (state.phase === 'loading') return <Skeleton className="h-20 w-full" />
  if (state.phase === 'error') {
    return (
      <div className="text-destructive flex items-start gap-2 text-xs">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span className="whitespace-pre-wrap">{state.error}</span>
      </div>
    )
  }
  const { usage } = state
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span>总 tokens：<span className="font-medium">{totalTokens(usage.totals)}</span></span>
        {usage.cost === undefined ? (
          <span className="text-muted-foreground text-xs">未配置路由费率，未计算成本</span>
        ) : (
          <span>成本：<span className="font-medium">{usage.currency ?? ''} {usage.cost}</span></span>
        )}
      </div>
      {usage.stages.length > 0 ? (
        <>
          <Separator />
          <ScrollArea className="max-h-48">
            <div className="flex flex-col gap-1 pr-3">
              {usage.stages.map(stage => (
                <div key={stage.stage} className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium">{STAGE_LABELS[stage.stage]}</span>
                  <span className="text-muted-foreground">{totalTokens(stage.totals)} tokens</span>
                  <span className="text-muted-foreground">{stage.cost === undefined ? '—' : `${usage.currency ?? ''} ${stage.cost}`}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      ) : <p className="text-muted-foreground text-xs">该工单会话尚无归集到的用量。</p>}
    </div>
  )
}
