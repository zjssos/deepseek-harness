/**
 * Pure aggregation helpers for the rxlab-usage accounting: bucket addition and
 * the session-cwd → workbench-module attribution. Kept free of Cordis and
 * storage so the attribution contract (which subdirectory means which module)
 * is unit-testable and mirrors the SPA's `session-cwd.ts` map exactly.
 * @module @deepseek-ai/dsh-rxlab-usage/src/aggregate
 */

import { relative, sep } from 'node:path'
import type { UsageTotals } from './types.ts'

/** All-zero token buckets; the neutral element of {@link addTotals}. */
export const ZERO_TOTALS: UsageTotals = {
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

/** Sum two token-bucket sets field by field. */
export function addTotals(left: UsageTotals, right: UsageTotals): UsageTotals {
  return {
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  }
}

/** Whether two bucket sets carry identical counts. */
export function totalsEqual(left: UsageTotals, right: UsageTotals): boolean {
  return left.uncachedInputTokens === right.uncachedInputTokens
    && left.outputTokens === right.outputTokens
    && left.cacheReadTokens === right.cacheReadTokens
    && left.cacheWriteTokens === right.cacheWriteTokens
}

/**
 * Attribute one session cwd to a workbench module. A cwd inside the workspace
 * under the subdirectory of a configured module belongs to that module; the
 * workspace root, an unknown subdirectory, or an absent cwd all fall back to
 * the default module (agent runs at the workspace root).
 * @param cwd - the session's validated absolute cwd, or undefined.
 * @param workspaceRoot - the rxlab workbench workspace root.
 * @param moduleSubdirs - module id → workspace subdirectory map.
 * @param defaultModule - module id returned when no subdirectory matches.
 */
export function moduleOfCwd(
  cwd: string | undefined,
  workspaceRoot: string,
  moduleSubdirs: Readonly<Record<string, string>>,
  defaultModule: string,
): string {
  if (cwd === undefined || cwd === workspaceRoot) return defaultModule
  const rel = relative(workspaceRoot, cwd)
  if (rel === '' || rel.startsWith('..') || rel.includes('..' + sep)) return defaultModule
  const [first] = rel.split(sep)
  if (first === undefined) return defaultModule
  for (const [moduleId, subdir] of Object.entries(moduleSubdirs)) {
    if (subdir === first) return moduleId
  }
  return defaultModule
}
