/**
 * rxlab-collect Client contribution: mounts the generated `rxlabCollect`
 * namespace onto the Client Remote face. The rxlab SPA boots this package's
 * `/client` bundle (a `dsh.client` row served by the rxlab `modules` row), so
 * the collect namespace exists exactly where the rxlab product data layer is
 * composed — never in the platform `api-remotes` assembly.
 * @module @deepseek-ai/dsh-rxlab-collect/src/client
 */

import type { Context } from '@deepseek-ai/cordis'
import collectRemote from '@deepseek-ai/dsh-rxlab-collect/remote'
// Type-only: pulls the api-gateway `remote` Context member into this program.
import type {} from '@deepseek-ai/dsh-api-gateway/client'

export type * from '../types.ts'

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the rxlabCollect Remote namespace for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after the namespace is mounted.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const dispose = await ctx.remote.$mount(collectRemote)
  return async () => { await dispose() }
}
