/**
 * Compact token-usage readouts for the agent workbench: a per-session line for
 * the transcript column and per-module aggregate chips for the rail footer.
 * zh copy until the app gains a locale dictionary.
 */
import type { ModuleUsageSummary, UsageTotals } from '@deepseek-ai/dsh-rxlab-usage/types'

/** zh thousands grouping for one exact token count. */
export function formatTokens(value: number): string {
  return value.toLocaleString('zh-CN')
}

/** zh compact notation for constrained row real estate. */
export function compactTokens(value: number): string {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

const MODULE_LABELS: Record<string, string> = {
  agent: '会话',
  collect: '采集',
}

/** zh label for one workbench module id (fallback to the raw id). */
export function moduleLabel(moduleId: string): string {
  return MODULE_LABELS[moduleId] ?? moduleId
}

/** Sum of every token bucket. */
export function totalTokens(totals: UsageTotals): number {
  return totals.uncachedInputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
}

/** One-line per-session usage with the full counts in the hover title. */
export function SessionUsageLine({ totals }: { totals: UsageTotals }) {
  const total = totalTokens(totals)
  return (
    <span
      title={`输入 ${formatTokens(totals.uncachedInputTokens)} · 输出 ${formatTokens(totals.outputTokens)} · 缓存读 ${formatTokens(totals.cacheReadTokens)} · 缓存写 ${formatTokens(totals.cacheWriteTokens)}`}
    >
      本会话用量 · {formatTokens(total)} tokens
    </span>
  )
}

/** Right-aligned per-module aggregate chips (module label + compact total). */
export function ModuleUsageChips({ modules }: { modules: readonly ModuleUsageSummary[] }) {
  if (modules.length === 0) return null
  return (
    <span className="flex shrink-0 items-center gap-2">
      {modules.map(module => (
        <span key={module.moduleId} title={`${moduleLabel(module.moduleId)}：${module.sessionCount} 个会话`}>
          {moduleLabel(module.moduleId)} {compactTokens(totalTokens(module.totals))}
        </span>
      ))}
    </span>
  )
}
