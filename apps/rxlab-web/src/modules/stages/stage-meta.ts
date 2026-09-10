import type { StageId } from '@deepseek-ai/dsh-rxlab-job/types'

/** The six workbench stages in canonical workflow order. */
export const STAGE_ORDER: readonly StageId[] = [
  'exam',
  'frame',
  'lens',
  'fabrication',
  'pickup',
  'aftercare',
]

/** zh display label per stage (locale-owned later). */
export const STAGE_LABELS: Record<StageId, string> = {
  exam: '验光',
  frame: '选框',
  lens: '选片',
  fabrication: '加工',
  pickup: '取镜',
  aftercare: '售后',
}

/** One-line stage intent shown in the panel header. */
export const STAGE_TAGLINES: Record<StageId, string> = {
  exam: '录入验光事实，用确定性引擎得出处方与配镜建议',
  frame: '按处方目标校验候选镜架尺寸与框型',
  lens: '按处方与用途校验候选镜片折射率与功能',
  fabrication: '登记加工委托与镀膜清单，跟踪交期',
  pickup: '记录取镜交期、调整与交付人',
  aftercare: '记录保修与随访，沉淀护理清单',
}

/** The stage after this one, or undefined for 售后. */
export function nextStage(stage: StageId): StageId | undefined {
  const index = STAGE_ORDER.indexOf(stage)
  return index < 0 ? undefined : STAGE_ORDER[index + 1]
}
