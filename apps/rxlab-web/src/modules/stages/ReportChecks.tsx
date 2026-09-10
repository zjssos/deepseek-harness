/**
 * Deterministic compatibility-report rendering shared by every stage panel:
 * one overall verdict badge, the digest, and the per-check rows.
 */
import { CheckCircle2, CircleAlert, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { CheckStatus, CompatibilityReport } from '@deepseek-ai/dsh-rxlab-job/types'

/** One status's zh label. */
export const CHECK_LABELS: Record<CheckStatus, string> = {
  OK: '通过',
  WARN: '注意',
  FAIL: '不通过',
}

/** Verdict badge for one check/report status. */
export function CheckBadge({ status }: { readonly status: CheckStatus }) {
  return (
    <Badge variant={status === 'FAIL' ? 'destructive' : status === 'OK' ? 'secondary' : 'outline'}>
      {CHECK_LABELS[status]}
    </Badge>
  )
}

/** The report's verdict icon. */
function StatusIcon({ status }: { readonly status: CheckStatus }) {
  if (status === 'FAIL') return <CircleAlert className="size-4 shrink-0" />
  if (status === 'WARN') return <TriangleAlert className="size-4 shrink-0" />
  return <CheckCircle2 className="size-4 shrink-0" />
}

/** Render one stage's deterministic compatibility report. */
export function ReportChecks({ report }: { readonly report: CompatibilityReport | undefined }) {
  if (report === undefined) {
    return <p className="text-xs text-muted-foreground">尚未运行确定性校验。</p>
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <StatusIcon status={report.overall} />
        <CheckBadge status={report.overall} />
        <span className="min-w-0 break-words text-muted-foreground">{report.summary}</span>
      </div>
      {report.checks.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {report.checks.map(check => (
            <li key={check.name} className="flex items-start gap-2 text-xs">
              <CheckBadge status={check.status} />
              <span className="font-medium">{check.name}</span>
              <span className="min-w-0 break-words text-muted-foreground">{check.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
