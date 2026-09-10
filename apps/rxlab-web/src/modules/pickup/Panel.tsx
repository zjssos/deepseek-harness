/**
 * 取镜 stage shell (stage 5): record the pickup appointment (投入) and the
 * hand-over/adjustment facts (产出) on the bound work order.
 */
import type { ModulePanelProps } from '@/modules/types'
import { ShellStagePanel } from '@/modules/stages/ShellStage'

export default function PickupPanel(_props: ModulePanelProps) {
  return (
    <ShellStagePanel
      stage="pickup"
      inputFields={[
        { key: 'appointmentAt', label: '预约取镜时间', kind: 'text', placeholder: '如 2026-09-16 14:00' },
        { key: 'contact', label: '联系方式', kind: 'text', placeholder: '手机号 / 微信' },
      ]}
      outputFields={[
        { key: 'pickedAt', label: '实际取镜时间', kind: 'text', placeholder: '如 2026-09-16 14:30' },
        { key: 'adjustNotes', label: '调整记录', kind: 'list', placeholder: '镜腿收紧, 鼻托下调' },
        { key: 'handedOverBy', label: '交付人', kind: 'text' },
      ]}
      checklist={[
        '当面核对镜架、镜片、镀膜与订单一致',
        '试戴确认远近清晰、无明显头晕与压迫',
        '调整镜腿与鼻托至贴合，说明佩戴与保养要点',
        '告知保修范围与随访时间',
      ]}
    />
  )
}
