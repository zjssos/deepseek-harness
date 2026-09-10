/**
 * Renders the resolved 验光 target (prescription + fitting advice) shared by the
 * 选框 / 选片 stage panels, or why it is unavailable.
 */
import { CircleAlert } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ExamTargetState } from './use-recommend'

/** Read-only summary of the stage-2/3 prescription target. */
export function ExamTargetCard({ target }: { readonly target: ExamTargetState }) {
  if (target.phase === 'error') {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 pt-4 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">读取验光目标失败：{target.error}</span>
        </CardContent>
      </Card>
    )
  }
  if (target.phase !== 'ready') {
    return (
      <Card>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          {target.phase === 'missing' ? target.reason : '读取验光目标…'}
        </CardContent>
      </Card>
    )
  }
  const { prescription, advice } = target.target
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">验光目标</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>处方：右 {prescription.eyeR.sph}D / 左 {prescription.eyeL.sph}D</span>
        <span>建议折射率 {advice.recommendedIndex}</span>
        <span>FPD 目标 {advice.frameBand.targetFpd}mm（{advice.frameBand.fpdMin}–{advice.frameBand.fpdMax}）</span>
        <span>无框/半框：{advice.rimlessOk ? '可行' : '不建议'}</span>
      </CardContent>
    </Card>
  )
}
