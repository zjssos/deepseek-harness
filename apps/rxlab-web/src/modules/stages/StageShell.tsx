/**
 * Stage-panel boundary inside the work-order workbench: reads the shell's bound
 * work order and hands the panel a typed {@link StageContext}. The workbench
 * frame owns the work order's identity and stage navigation, so this boundary
 * carries no title block and no work-order picker of its own.
 */
import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { JobRecord, StageId, StageRecord } from '@deepseek-ai/dsh-rxlab-job/types'
import { useWorkbenchJob } from '@/app/workbench-context'
import type { RxlabClientRuntime } from '@/rxlab/client'
import { StageStatusBadge, stageRecordOf } from './stage-status'

export { StageStatusBadge, stageRecordOf }

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

/** Boot/load boundary around one stage panel. */
export function StageShell({
  stage,
  children,
}: {
  readonly stage: StageId
  readonly children: (context: StageContext) => ReactNode
}) {
  const { phase, error, runtime, job, stages, detailPhase, detailError, reload } = useWorkbenchJob()

  if (phase === 'booting' || runtime === undefined) return <Skeleton className="h-56 rounded-lg" />
  if (phase === 'failed') {
    return (
      <Card>
        <CardContent className="text-destructive flex items-start gap-2 pt-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{error ?? '数据层启动失败'}</span>
        </CardContent>
      </Card>
    )
  }
  if (detailPhase === 'error') {
    return (
      <Card>
        <CardContent className="text-destructive flex items-start gap-2 pt-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{detailError ?? '工单读取失败'}</span>
        </CardContent>
      </Card>
    )
  }
  if (job === undefined) return <Skeleton className="h-56 rounded-lg" />

  return <>{children({ runtime, job, stage, stages, stageRecord: stageRecordOf(stages, stage), reload })}</>
}
