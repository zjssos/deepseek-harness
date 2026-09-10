/**
 * Shared stage-panel frame: resolves the `?job=<id>` work order bound to the
 * current stage route, renders the job switcher and stage-status header, and
 * hands the panel a typed stage context. Without a `job` param it prompts the
 * operator to pick or open a work order first, matching the routing contract.
 */
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleAlert, FolderOpen, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { JobId, JobRecord, StageId, StageRecord } from '@deepseek-ai/dsh-rxlab-job/types'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { useConnected, useRxlabClient } from '@/rxlab/use-sessions'
import { STAGE_LABELS, STAGE_ORDER } from './stage-meta'
import { useJobDetail, useJobList } from './use-job'

/** Sentinel Select value for "no work order bound"; Radix items reject the empty string. */
const NO_JOB = '__none__'

/** What a stage panel receives once its work order and stage row are resolved. */
export interface StageContext {
  readonly runtime: RxlabClientRuntime
  readonly job: JobRecord
  readonly stage: StageId
  /** Every stored stage row of the bound job, in canonical order. */
  readonly stages: readonly StageRecord[]
  /** The stored stage row for this panel's stage, or undefined before its first write. */
  readonly stageRecord: StageRecord | undefined
  /** Re-read the job projection after a stage write. */
  readonly reload: () => void
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

/** Stage route frame: boot gate, job binding, and header around the panel body. */
export function StageShell({ stage, children }: { readonly stage: StageId; readonly children: (context: StageContext) => ReactNode }) {
  const { phase, error, runtime } = useRxlabClient()
  if (phase === 'booting' || runtime === undefined) return <BootSkeleton />
  if (phase === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{STAGE_LABELS[stage]}阶段数据层启动失败</CardTitle>
          <CardDescription className="whitespace-pre-wrap">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return <BoundStage stage={stage} runtime={runtime}>{children}</BoundStage>
}

/** Resolves the bound work order, then renders the stage header and body. */
function BoundStage({ stage, runtime, children }: {
  readonly stage: StageId
  readonly runtime: RxlabClientRuntime
  readonly children: (context: StageContext) => ReactNode
}) {
  const connected = useConnected(runtime)
  const [params, setParams] = useSearchParams()
  const jobParam = params.get('job')
  const jobId = jobParam === null || jobParam.length === 0 ? undefined : (jobParam as JobId)
  const jobList = useJobList(runtime, connected, '')
  const detail = useJobDetail(runtime, connected, jobId)

  const selectJob = (value: string): void => {
    const next = new URLSearchParams(params)
    if (value === NO_JOB) next.delete('job')
    else next.set('job', value)
    setParams(next, { replace: true })
    detail.reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{STAGE_LABELS[stage]}</h2>
          <StageStepper stage={stage} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">当前工单</span>
          <Select value={jobId ?? NO_JOB} onValueChange={selectJob}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder={jobList.state.phase === 'loading' ? '读取中…' : '选择工单'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_JOB}>未绑定</SelectItem>
              {jobList.state.items.map(item => (
                <SelectItem key={String(item.id)} value={String(item.id)}>
                  {item.name ?? '未命名消费者'} · {item.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {detail.state.phase === 'ready'
            ? <StageStatusBadge record={stageRecordOf(detail.state.detail.stages, stage)} />
            : null}
        </div>
      </header>

      {jobId === undefined
        ? <NoJobPrompt />
        : detail.state.phase === 'loading'
          ? <Skeleton className="h-56 rounded-xl" />
          : detail.state.phase === 'error'
            ? (
              <Card>
                <CardContent className="flex items-start gap-2 pt-4 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span className="whitespace-pre-wrap">{detail.state.error}</span>
                </CardContent>
              </Card>
            )
            : children({
              runtime,
              job: detail.state.detail.job,
              stage,
              stages: detail.state.detail.stages,
              stageRecord: stageRecordOf(detail.state.detail.stages, stage),
              reload: detail.reload,
            })}
    </div>
  )
}

/** The stored stage row for one stage, or undefined before its first write. */
export function stageRecordOf(stages: readonly StageRecord[], stage: StageId): StageRecord | undefined {
  return stages.find(record => record.stage === stage)
}

/** Visual position of the current stage within the six-stage workflow. */
function StageStepper({ stage }: { readonly stage: StageId }) {
  return (
    <Tabs value={stage}>
      <TabsList>
        {STAGE_ORDER.map(id => (
          <TabsTrigger key={id} value={id} disabled>
            {STAGE_LABELS[id]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/** Lifecycle badge for the bound work order's stage row. */
export function StageStatusBadge({ record }: { readonly record: StageRecord | undefined }) {
  const status = record?.status ?? 'pending'
  const label = status === 'done' ? '已完成' : status === 'in-progress' ? '进行中' : status === 'skipped' ? '已跳过' : '未开始'
  return <Badge variant={status === 'done' ? 'secondary' : status === 'in-progress' ? 'default' : 'outline'}>{label}</Badge>
}

/** No work order bound: explain the routing contract and point at 工单总览. */
function NoJobPrompt() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          请先选择或新建工单
        </CardTitle>
        <CardDescription>
          阶段路由通过 <code className="font-mono">?job=&lt;id&gt;</code> 绑定当前工单；在上方选择一条工单，或到「工单总览」新建。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
        <FolderOpen className="size-4" />
        没有绑定工单时，阶段的投入 / 校验 / 产出不会写入任何记录。
      </CardContent>
    </Card>
  )
}
