/**
 * Service plugin entry for the `@deepseek-ai/dsh-rxlab-collect/browser` row:
 * provides `ctx.collectBrowser`, the persistent logged-in chromium session
 * behind the collect agent browse tools. The companion `./tools` entry
 * registers the model-facing tools that consume it.
 * @module @deepseek-ai/dsh-rxlab-collect/src/browser
 */

export { CollectBrowserSession as default } from './browse/session.ts'
export type { Config, LoginOutcome } from './browse/session.ts'
