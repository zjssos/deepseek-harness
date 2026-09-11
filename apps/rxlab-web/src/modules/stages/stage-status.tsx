/**
 * Stage lifecycle presentation shared by the stage panels and the shell's
 * context rail, so both read one set of labels and one lookup.
 */
import { Badge } from '@/components/ui/badge'
import type { StageId, StageRecord, StageStatus } from '@deepseek-ai/dsh-rxlab-job/types'

/** zh display label per stage lifecycle state (locale-owned later). */
export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: '未开始',
  'in-progress': '进行中',
  done: '已完成',
  skipped: '已跳过',
}

/** The stored stage row for one stage, or undefined before its first write. */
export function stageRecordOf(stages: readonly StageRecord[], stage: StageId): StageRecord | undefined {
  return stages.find(record => record.stage === stage)
}

/** Lifecycle badge for one work order's stage row. */
export function StageStatusBadge({ record }: { readonly record: StageRecord | undefined }) {
  const status = record?.status ?? 'pending'
  return (
    <Badge variant={status === 'done' ? 'secondary' : status === 'in-progress' ? 'default' : 'outline'}>
      {STAGE_STATUS_LABELS[status]}
    </Badge>
  )
}
