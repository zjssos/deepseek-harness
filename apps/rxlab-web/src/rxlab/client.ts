import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import * as Cordis from '@deepseek-ai/cordis'
import * as ClientStore from '@deepseek-ai/dsh-client-store'
import * as UiSlots from '@deepseek-ai/dsh-client-ui-slots'
import * as UiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientModuleCreateOptions, DshWindow } from '@deepseek-ai/dsh-client-modules/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'

/**
 * rxlab headless Cordis client runtime.
 *
 * The rxlab SPA does not run the Cordis browser UI roster (ui-* slots,
 * renderer), but it boots the official client DATA layer on a bare Cordis
 * root: the rxlab profile's `modules` row injects `window.__DSH_BOOT__` +
 * `window.__ModuleLoader__` into the served index and serves the four data
 * packages' `/client` bundles under `/plugins`. This kernel mirrors the web
 * shell boot (packages/client/web) minus the uiRenderer mount: it creates the
 * module system from the injected graph, mounts the Cordis Loader over it,
 * activates every graph row, and exposes the resulting typed services. Static
 * imports below are only the module-table baseline (platform words), which is
 * exactly why the SPA can bundle the kernel while the data rows arrive as
 * runtime bundles.
 */

/** A live headless session runtime after every graph row activated. */
export interface RxlabClientRuntime {
  readonly ctx: Context
  /** Generated typed Remote namespaces (session/commands/...). */
  readonly remote: ClientRemote
  /** Session list/selection object layer. */
  readonly sessions: ISessions
  /** Browser transport generations; becomes defined once the $events stream is ready. */
  readonly connection: ConnectionHandle
}

export type RxlabClientPhase = 'booting' | 'ready' | 'failed'

/** Current boot lifecycle for the workbench (module singleton created lazily). */
export interface RxlabClientSnapshot {
  readonly phase: RxlabClientPhase
  readonly error?: string
}

const stateListeners = new Set<() => void>()
let state: RxlabClientSnapshot = { phase: 'booting' }
let runtimePromise: Promise<RxlabClientRuntime> | undefined

function setState(next: RxlabClientSnapshot): void {
  state = next
  for (const listener of [...stateListeners]) listener()
}

export function clientState(): RxlabClientSnapshot {
  return state
}

export function subscribeClientState(listener: () => void): () => void {
  stateListeners.add(listener)
  return () => { stateListeners.delete(listener) }
}

/** Platform-singleton module table: the only entities bundles may externalize onto. */
function staticModules(): ClientModuleCreateOptions['staticModules'] {
  return {
    'react': React,
    'react/jsx-runtime': ReactJsxRuntime,
    'react-dom': ReactDom,
    'react-dom/client': ReactDomClient,
    '@deepseek-ai/cordis': Cordis,
    '@deepseek-ai/dsh-client-store': ClientStore,
    '@deepseek-ai/dsh-client-ui-slots': UiSlots,
    '@deepseek-ai/dsh-client-ui-primitives': UiPrimitives,
  }
}

/** Boot the headless client runtime once; subsequent calls share the result. */
export function rxlabClient(): Promise<RxlabClientRuntime> {
  if (runtimePromise !== undefined) return runtimePromise
  runtimePromise = bootHeadless()
    .then((runtime) => {
      setState({ phase: 'ready' })
      return runtime
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? (error.stack ?? '') : ''
      console.error('rxlab headless boot failed', error)
      setState({ phase: 'failed', error: `${message}\n${stack}` })
      throw error
    })
  return runtimePromise
}

async function bootHeadless(): Promise<RxlabClientRuntime> {
  const windowGlobal = globalThis as Partial<DshWindow>
  const moduleLoader = windowGlobal.__ModuleLoader__
  if (moduleLoader === undefined) {
    throw new Error('rxlab: window.__ModuleLoader__ is missing — the SPA must be served by the dsh rxlab host (modules row injection); Vite dev has no runtime boot')
  }
  const modules = moduleLoader.create({
    boot: windowGlobal.__DSH_BOOT__,
    staticModules: staticModules(),
  })
  const ctx = new Context()
  await ctx.plugin(Loader)
  const loader = ctx.loader
  loader.internal = modules as never

  const rows = modules.manifest.plugins.map(row => row.id)
  await Promise.all(rows.map(async (name) => {
    await loader.create({ name })
  }))
  await loader.await()

  const inactive = [...loader.entries()].filter(entry => !entry.disabled && entry.fiber?.state !== 2)
  if (inactive.length > 0) {
    const missing = inactive.map(entry =>
      `${entry.options.name}: ${entry.fiber === undefined ? 'no fiber' : `state ${entry.fiber.state}`}`)
    throw new Error(`rxlab: ${String(inactive.length)} client entr${inactive.length === 1 ? 'y' : 'ies'} did not activate\n${missing.join('\n')}`)
  }

  const runtime: RxlabClientRuntime = {
    ctx,
    remote: ctx.remote,
    sessions: ctx.sessions,
    // The connection service is injected, not a declared Context member.
    connection: ctx.get('connection') as ConnectionHandle,
  }
  return runtime
}
