/**
 * 售后 stage shell (stage 6): record warranty/care inputs (投入) and the
 * follow-up facts (产出) on the bound work order.
 */
import type { ModulePanelProps } from '@/modules/types'
import { ShellStagePanel } from '@/modules/stages/ShellStage'

export default function AftercarePanel(_props: ModulePanelProps) {
  return (
    <ShellStagePanel
      stage="aftercare"
      inputFields={[
        { key: 'warrantyMonths', label: '保修月数', kind: 'number', placeholder: '如 12' },
        { key: 'carePoints', label: '护理要点', kind: 'list', placeholder: '镜片用清水冲洗, 避免高温' },
      ]}
      outputFields={[
        { key: 'followUpAt', label: '随访时间', kind: 'text', placeholder: '如 2026-10-16' },
        { key: 'carePoints', label: '已交代护理要点', kind: 'list' },
        { key: 'warrantyNote', label: '保修备注', kind: 'text' },
      ]}
      checklist={[
        '登记保修期限与保修范围',
        '交代镜片清洁、放置与高温/化学品禁忌',
        '确认随访时间与复查项目',
        '记录消费者反馈并判断是否需返修',
      ]}
    />
  )
}
