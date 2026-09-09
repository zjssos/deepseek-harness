/**
 * The executor registry: resolves the deterministic collector for one
 * platform. Every platform ships at most one adapter; an unimplemented
 * platform fails loud at batch time with a readable error instead of being
 * silently skipped.
 * @module @deepseek-ai/dsh-rxlab-collect/src/executor/index
 */

import type { Browser } from 'playwright'
import type { CollectPlatform } from '../types.ts'
import { createJdCollector } from './jd.ts'
import { createTaobaoCollector } from './taobao.ts'
import type { CaptureContextMode } from './context.ts'
import type { Collector } from './types.ts'

/**
 * Build the platform collector registry over one shared browser handle.
 * @param openBrowser - lazily resolved shared browser.
 * @param resolveMode - context mode resolved at each capture: `isolated` for
 *   the anonymous headless chromium, `default` when attaching to a real CDP
 *   browser so the login cookies apply and no fresh windows open.
 */
export function createCollectorRegistry(
  openBrowser: () => Promise<Browser>,
  resolveMode: () => CaptureContextMode,
): Map<CollectPlatform, Collector> {
  return new Map<CollectPlatform, Collector>([
    ['jd', createJdCollector(openBrowser, resolveMode)],
    ['taobao', createTaobaoCollector(openBrowser, resolveMode)],
  ])
}
