/**
 * 加工 stage shell (stage 4): record the lab order (投入) and the returned
 * artifact (产出) on the bound work order.
 */
import type { ModulePanelProps } from '@/modules/types'
import { ShellStagePanel } from '@/modules/stages/ShellStage'

export default function FabricationPanel(_props: ModulePanelProps) {
  return (
    <ShellStagePanel
      stage="fabrication"
      inputFields={[
        { key: 'lab', label: '加工方 / 实验室', kind: 'text', placeholder: '如 本地车房 A' },
        { key: 'edgeType', label: '边缘处理', kind: 'text', placeholder: '如 磨边 / 倒角' },
        { key: 'coatings', label: '镀膜清单', kind: 'list', placeholder: '减反, 加硬, 防污' },
        { key: 'expectedAt', label: '预计交期', kind: 'text', placeholder: '如 2026-09-15' },
      ]}
      outputFields={[
        { key: 'lab', label: '实际加工方', kind: 'text' },
        { key: 'edgeType', label: '实际边缘处理', kind: 'text' },
        { key: 'coatings', label: '实际镀膜', kind: 'list' },
        { key: 'completedAt', label: '完成时间', kind: 'text', placeholder: '如 2026-09-14' },
      ]}
      checklist={[
        '核对处方与镜片型号、折射率、镀膜项一致',
        '确认镜架 FPD 与瞳距的移心量在规则阈值内',
        '高光度 / 无框订单确认边缘厚度与倒角工艺',
        '登记交期并在超期时提醒消费者',
      ]}
    />
  )
}
