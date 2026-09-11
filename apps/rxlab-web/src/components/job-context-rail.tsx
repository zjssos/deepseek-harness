/**
 * The workbench's right context rail: the bound work order's identity, its
 * six-stage progress, and the jump into the next open stage stay visible while
 * any surface is on screen. Stage rows open the work-order workbench on that
 * stage, since stages are views rather than routes.
 */
import { CheckCircle2, CircleDashed, Loader2, MinusCircle, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { StageStatus } from '@deepseek-ai/dsh-rxlab-job/types'
import { JOB_STATUS_LABELS } from '@/lib/job-labels'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { jobStagePath, useWorkbenchJob } from '@/app/workbench-context'
import { STAGE_LABELS, STAGE_ORDER } from '@/modules/stages/stage-meta'
import { STAGE_STATUS_LABELS } from '@/modules/stages/stage-status'

/** The bound work order's always-on context, as a collapsible right rail. */
export function JobContextRail() {
  const { railOpen, setRailOpen } = useWorkbenchJob()

  if (!railOpen) {
    return (
      <aside className="bg-sidebar text-sidebar-foreground hidden shrink-0 flex-col border-l pt-2 lg:flex">
        <Button variant="ghost" size="icon" aria-label="展开工单上下文" onClick={() => { setRailOpen(true) }}>
          <PanelRightOpen />
        </Button>
      </aside>
    )
  }

  return (
    <aside className="bg-sidebar text-sidebar-foreground hidden w-80 shrink-0 flex-col border-l lg:flex">
      <div className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-3">
        <span className="text-sm font-medium">工单上下文</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label="收起工单上下文"
          onClick={() => { setRailOpen(false) }}
        >
          <PanelRightClose />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-(--workbench-panel-gap) overflow-y-auto p-3">
        <RailBody />
      </div>
    </aside>
  )
}

/** The rail's body: the bound work order, or why nothing is bound yet. */
function RailBody() {
  const { jobId, job, detailPhase, detailError, jobsPhase } = useWorkbenchJob()
  const { pathname } = useLocation()
  const onOverview = pathname === '/jobs'

  if (jobId === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">尚未绑定工单</p>
        <p className="text-muted-foreground text-xs">
          {onOverview
            ? '在工单列表里选择或新建一条工单；打开后这里显示它的阶段进度与交付状态。'
            : '阶段的投入与产出都写入当前工单。回到工单总览选择或新建一条。'}
        </p>
        {onOverview ? null : (
          <Button size="sm" variant="outline" asChild className="self-start">
            <Link to="/jobs">前往工单总览</Link>
          </Button>
        )}
      </div>
    )
  }

  if (detailPhase === 'error') {
    return <p className="text-destructive text-xs whitespace-pre-wrap">{detailError ?? '工单读取失败'}</p>
  }

  if (job === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {job.consumer.name ?? '未命名消费者'}
          </span>
          <Badge variant="outline">{JOB_STATUS_LABELS[job.status]}</Badge>
        </div>
        <dl className="text-muted-foreground flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2">
            <dt>更新</dt>
            <dd className="text-foreground ml-auto">{formatDateTime(job.updatedAt)}</dd>
          </div>
          {job.pricing === undefined ? null : (
            <div className="flex items-center gap-2">
              <dt>对客价格</dt>
              <dd className="text-foreground ml-auto">
                {job.pricing.amount} {job.pricing.currency}
              </dd>
            </div>
          )}
          <div className="flex items-center gap-2">
            <dt>Agent 会话</dt>
            <dd className="text-foreground ml-auto truncate">{job.sessionId ?? '未绑定'}</dd>
          </div>
        </dl>
      </div>

      <StageProgressList />

      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        {jobsPhase === 'loading' ? <Loader2 className="size-3.5 animate-spin" /> : null}
        <span>共 {STAGE_ORDER.length} 个阶段</span>
      </div>
    </>
  )
}

/** The six-stage checklist; the stage open in the workbench is highlighted. */
function StageProgressList() {
  const { jobId, progress } = useWorkbenchJob()
  const [params] = useSearchParams()
  const done = progress.filter(entry => entry.status === 'done').length
  const next = progress.find(entry => entry.status !== 'done' && entry.status !== 'skipped')
  const current = params.get('view') ?? ''

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">配镜流程</span>
        <span className="text-muted-foreground ml-auto text-xs">{done}/{STAGE_ORDER.length} 已完成</span>
      </div>

      <div className="flex flex-col gap-0.5">
        {progress.map(entry => (
          <Link
            key={entry.stage}
            to={jobStagePath(entry.stage, jobId)}
            className={cn(
              'hover:bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
              entry.stage === current && 'bg-sidebar-accent',
            )}
          >
            <StageGlyph status={entry.status} />
            <span>{STAGE_LABELS[entry.stage]}</span>
            <span className="text-muted-foreground ml-auto text-xs">{STAGE_STATUS_LABELS[entry.status]}</span>
          </Link>
        ))}
      </div>

      {next === undefined ? (
        <p className="text-muted-foreground text-xs">六个阶段都已处理，可到配镜指南生成交付文档。</p>
      ) : (
        <Button size="sm" variant="outline" asChild>
          <Link to={jobStagePath(next.stage, jobId)}>下一步：{STAGE_LABELS[next.stage]}</Link>
        </Button>
      )}
    </div>
  )
}

/** Lifecycle glyph for one stage progress row. */
function StageGlyph({ status }: { readonly status: StageStatus }) {
  if (status === 'done') return <CheckCircle2 className="text-primary size-4 shrink-0" />
  if (status === 'in-progress') return <Loader2 className="text-primary size-4 shrink-0 animate-spin" />
  if (status === 'skipped') return <MinusCircle className="text-muted-foreground size-4 shrink-0" />
  return <CircleDashed className="text-muted-foreground size-4 shrink-0" />
}
