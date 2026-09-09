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
import type { Collector } from './types.ts'

/** Build the platform collector registry over one shared browser handle. */
export function createCollectorRegistry(openBrowser: () => Promise<Browser>): Map<CollectPlatform, Collector> {
  return new Map<CollectPlatform, Collector>([
    ['jd', createJdCollector(openBrowser)],
    ['taobao', createTaobaoCollector(openBrowser)],
  ])
}
