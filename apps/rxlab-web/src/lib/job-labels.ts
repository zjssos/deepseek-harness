/** Zh work-order lifecycle labels, shared by the job list, detail, and context rail. */
import type { JobStatus } from '@deepseek-ai/dsh-rxlab-job/types'

/** zh display label per work-order status (locale-owned later). */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: '草稿',
  'in-progress': '进行中',
  complete: '已完成',
  archived: '已归档',
}
