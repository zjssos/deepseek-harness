/**
 * 工单详情 / 指南页: consumer profile, six-stage overview, the bound agent
 * session, deterministic guide assembly + HTML export, and the job's token/cost
 * usage. Reached at `/jobs/:jobId`; stage overview links into `/<stage>?job=`.
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { JobId, JobRecord, JobStatus, Money, StageId, StageRecord } from '@deepseek-ai/dsh-rxlab-job/types'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { useWorkspaceRoot } from '@/rxlab/use-settings'
import { useConnected, useRxlabClient, useSessionActions } from '@/rxlab/use-sessions'
import { STAGE_LABELS, STAGE_ORDER } from '@/modules/stages/stage-meta'
import { StageStatusBadge, stageRecordOf } from '@/modules/stages/StageShell'
import { bindSession, deleteJob, generateGuide, updateJob, useJobDetail, useJobUsage } from '@/modules/stages/use-job'
import { consumerSummary, formatMoney } from './consumer'
import { ConsumerDialog } from './ConsumerDialog'
import { GuideDocumentView } from './GuideView'
import { downloadGuideHtml } from './guide-html'

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: '草稿',
  'in-progress': '进行中',
  complete: '已完成',
  archived: '已归档',
}

const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as JobStatus[]

function totalTokens(totals: {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): number {
  return totals.uncachedInputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
}

function BootSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}

export default function JobDetailPanel() {
  const { phase, error, runtime } = useRxlabClient()
  if (phase === 'booting' || runtime === undefined) return <BootSkeleton />
  if (phase === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>工单数据层启动失败</CardTitle>
          <CardDescription className="whitespace-pre-wrap">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return <JobDetail runtime={runtime} />
}

/** One work order's detail/guide page over a ready runtime. */
function JobDetail({ runtime }: { readonly runtime: RxlabClientRuntime }) {
  const navigate = useNavigate()
  const params = useParams()
  const jobId = (params.jobId ?? '') as JobId
  const connected = useConnected(runtime)
  const workspaceRoot = useWorkspaceRoot(runtime, connected)
  const actions = useSessionActions(runtime)
  const detail = useJobDetail(runtime, connected, jobId)
  const usage = useJobUsage(runtime, connected, jobId)
  const [editConsumerOpen, setEditConsumerOpen] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState<'bind' | 'guide' | 'delete' | undefined>(undefined)
  const [banner, setBanner] = useState<string | null>(null)

  if (detail.state.phase === 'loading') return <BootSkeleton />
  if (detail.state.phase === 'error') {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 pt-4 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{detail.state.error}</span>
        </CardContent>
      </Card>
    )
  }

  const { job, stages, guide } = detail.state.detail

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
      detail.reload()
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
      detail.reload()
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

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
            <UserRound className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{job.consumer.name ?? '未命名消费者'}</h2>
              <Badge variant="outline">{STATUS_LABELS[job.status]}</Badge>
              {job.pricing === undefined ? null : <Badge variant="secondary">{formatMoney(job.pricing)}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {consumerSummary(job.consumer) || '尚未补充消费画像'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditConsumerOpen(true) }}>
            <Pencil className="size-3.5" />编辑画像
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setMetaOpen(true) }}>
            <BadgeCheck className="size-3.5" />状态 / 价格
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => { setConfirmDelete(true) }}>
            <Trash2 className="size-3.5" />删除
          </Button>
        </div>
      </header>

      {banner !== null ? (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{banner}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">阶段进度</CardTitle>
          <CardDescription>点击阶段进入该阶段的投入 / 校验 / 产出面板。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {STAGE_ORDER.map(stage => (
            <StageRow
              key={stage}
              stage={stage}
              record={stageRecordOf(stages, stage)}
              onOpen={() => { void navigate(`/${stage}?job=${String(job.id)}`) }}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">会话</CardTitle>
          <CardDescription>一个工单对应一个 agent 会话；阶段语义任务由会话内的阶段工具触发。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {job.sessionId === undefined ? (
            <>
              <span className="text-sm text-muted-foreground">尚未绑定会话。</span>
              <Button size="sm" className="gap-1.5" disabled={busy !== undefined} onClick={() => { void onBind() }}>
                {busy === 'bind' ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                新建并绑定会话
              </Button>
            </>
          ) : (
            <>
              <code className="min-w-0 truncate font-mono text-xs">{job.sessionId}</code>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { void navigate('/agent') }}>
                打开会话
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5" disabled={busy !== undefined} onClick={() => { void onBind() }}>
                <RefreshCw className="size-3.5" />重新绑定
              </Button>
            </>
          )}
        </CardContent>
      </Card>

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
            <Button size="sm" className="gap-1.5" disabled={busy !== undefined} onClick={() => { void onGenerate() }}>
              {busy === 'guide' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              生成指南
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {guide === undefined
            ? <p className="text-xs text-muted-foreground">尚未生成指南。完成阶段产出后点「生成指南」。</p>
            : <GuideDocumentView document={guide} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-sm">用量与成本</CardTitle>
            <CardDescription>来自 rxlabUsage；成本按运行时配置的路由费率，未配置时省略。</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={usage.reload}>
            <RefreshCw className="size-3.5" />刷新
          </Button>
        </CardHeader>
        <CardContent>
          <UsageBlock state={usage.state} />
        </CardContent>
      </Card>

      <ConsumerDialog
        open={editConsumerOpen}
        onOpenChange={setEditConsumerOpen}
        initial={job.consumer}
        title="编辑消费画像"
        onSubmit={async (consumer) => {
          await updateJob(runtime, job.id, { consumer })
          detail.reload()
        }}
      />

      <JobMetaDialog
        runtime={runtime}
        job={job}
        open={metaOpen}
        onOpenChange={setMetaOpen}
        onSaved={detail.reload}
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

/** One stage row in the detail's progress card. */
function StageRow({ stage, record, onOpen }: {
  readonly stage: StageId
  readonly record: StageRecord | undefined
  readonly onOpen: () => void
}) {
  return (
    <button type="button" onClick={onOpen}
      className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/60">
      <span className="flex items-center gap-2 text-sm">
        <span className="font-medium">{STAGE_LABELS[stage]}</span>
        <span className="text-xs text-muted-foreground">{record === undefined ? '未开始' : record.updatedAt}</span>
      </span>
      <StageStatusBadge record={record} />
    </button>
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
                {STATUS_OPTIONS.map(option => <SelectItem key={option} value={option}>{STATUS_LABELS[option]}</SelectItem>)}
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

/** Token/cost rendering for one job-usage fetch. */
function UsageBlock({ state }: { readonly state: ReturnType<typeof useJobUsage>['state'] }) {
  if (state.phase === 'loading') return <Skeleton className="h-20 w-full" />
  if (state.phase === 'error') {
    return (
      <div className="flex items-start gap-2 text-xs text-destructive">
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
          <span className="text-xs text-muted-foreground">未配置路由费率，未计算成本</span>
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
      ) : <p className="text-xs text-muted-foreground">该工单会话尚无归集到的用量。</p>}
    </div>
  )
}
