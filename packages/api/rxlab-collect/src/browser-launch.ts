/**
 * CDP-mode chromium launcher row for the rxlab collect module: spawns a real
 * browser with `--remote-debugging-port` so the deterministic capture flow and
 * (later) the browser-use tools can attach to it. The row is host-owned and
 * stateless — every launch call carries its parameters — so the SPA can hand
 * the settings-namespace values straight through without restart semantics.
 * Stopping kills only the process this row spawned; an externally started CDP
 * browser is never touched.
 * @module @deepseek-ai/dsh-rxlab-collect/src/browser-launch
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { Context, Service } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'

/** Launcher defaults; callers may override every field per launch. */
export interface Config {
  /** Chromium/Chrome/Edge executable path; resolved from Playwright's build or common installs when absent. */
  executablePath?: string
  /** Remote-debugging port. */
  port?: number
  /** Browser user-data directory (the CDP login profile). */
  profileDir?: string
  /** Whether the launched browser runs headless. */
  headless?: boolean
}

/** Config schema. */
export const Config: z<Config> = z.object({
  executablePath: z.string(),
  port: z.number().default(9222),
  profileDir: z.string().default(dshHomePath('rxlab-browser-cdp')),
  headless: z.boolean().default(false),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host CDP-browser launcher behind the collect module's browserLaunch RPC. */
    collectCdpLauncher: CollectCdpLauncher
  }
}

/** Launcher process + endpoint state served to the SPA status row. */
export interface LauncherStatus {
  readonly running: boolean
  readonly endpointUp: boolean
}

/** Outcome of one launch attempt. */
export interface LaunchOutcome {
  readonly launched: boolean
  readonly detail: string
}

const PROBE_TIMEOUT_MS = 1_500

/** Spawn and own one CDP-mode browser process per host. */
export class CollectCdpLauncher extends Service {
  static inject = []

  static Config: z<Config> = Config

  private readonly defaults: Required<Config>
  private child: ChildProcess | undefined
  private endpointValue: string

  constructor(ctx: Context, public config: Config = {}) {
    super(ctx, 'collectCdpLauncher')
    this.defaults = {
      port: config.port ?? 9222,
      profileDir: config.profileDir ?? dshHomePath('rxlab-browser-cdp'),
      headless: config.headless ?? false,
      executablePath: config.executablePath ?? '',
    }
    this.endpointValue = `http://127.0.0.1:${this.defaults.port}`
  }

  /** The endpoint the launcher spawns (and probes) browsers on. */
  get endpoint(): string {
    return this.endpointValue
  }

  /**
   * Spawn the configured browser with remote debugging and wait for its
   * version endpoint. A browser this row already spawned stays running.
   * @param opts - per-call overrides of the row defaults.
   * @returns whether the endpoint answers after the launch wait.
   */
  async launch(opts: Config = {}): Promise<LaunchOutcome> {
    if (this.child !== undefined && this.child.exitCode === null) {
      return { launched: true, detail: 'CDP 浏览器已在运行' }
    }
    const port = opts.port ?? this.defaults.port
    const profileDir = opts.profileDir ?? this.defaults.profileDir
    const headless = opts.headless ?? this.defaults.headless
    const executable = (opts.executablePath ?? this.defaults.executablePath).trim()
    if (executable.length === 0) {
      return { launched: false, detail: '未配置浏览器可执行文件：请在 collect 模块设置中填写 CDP 浏览器路径' }
    }
    this.endpointValue = `http://127.0.0.1:${port}`
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(headless ? ['--headless=new'] : []),
    ]
    try {
      const child = spawn(executable, args, { stdio: 'ignore', windowsHide: true })
      this.child = child
      child.on('exit', () => {
        if (this.child === child) this.child = undefined
      })
      child.on('error', () => {
        if (this.child === child) this.child = undefined
      })
    } catch (cause) {
      this.child = undefined
      return { launched: false, detail: `浏览器启动失败：${cause instanceof Error ? cause.message : String(cause)}` }
    }
    const deadline = Date.now() + 8_000
    while (Date.now() < deadline) {
      if (await this.probe(this.endpointValue)) return { launched: true, detail: `CDP 浏览器已就绪（${this.endpointValue}）` }
      await new Promise(resolve => setTimeout(resolve, 400))
    }
    await this.stop()
    return {
      launched: false,
      detail: `CDP 浏览器启动超时：${this.endpointValue} 无响应。请确认可执行文件路径正确，且该 profile 未被其他浏览器占用。`,
    }
  }

  /** Whether the spawned process lives and its endpoint answers. */
  async status(): Promise<LauncherStatus> {
    return { running: this.child !== undefined && this.child.exitCode === null, endpointUp: await this.probe(this.endpointValue) }
  }

  /** Kill the process this row spawned (never an externally started browser). */
  async stop(): Promise<boolean> {
    const child = this.child
    this.child = undefined
    if (child === undefined || child.exitCode !== null) return false
    child.kill()
    return true
  }

  /** Dispose kills the spawned browser on the calling fiber's teardown. */
  protected [Service.init](): void {
    this.ctx.effect(() => () => { void this.stop() }, 'rxlab_collect.cdpLauncherClose')
  }

  private async probe(endpoint: string): Promise<boolean> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    try {
      const response = await fetch(`${endpoint.replace(/\/+$/, '')}/json/version`, { signal: controller.signal })
      return response.ok
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Resolve a chromium executable: Playwright's bundled build first, then the
 * common Windows Chrome/Edge install paths. Returns undefined when nothing is
 * found so the caller can ask the user to configure the path.
 */
export function defaultChromiumExecutable(): string | undefined {
  const candidates = [chromium.executablePath(), chromeCandidate(), edgeCandidate()].filter(
    (candidate): candidate is string => typeof candidate === 'string' && existsSync(candidate),
  )
  return candidates[0]
}

function chromeCandidate(): string | undefined {
  const local = process.env.LOCALAPPDATA
  if (local === undefined) return undefined
  const candidate = join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')
  return existsSync(candidate) ? candidate : undefined
}

function edgeCandidate(): string | undefined {
  const programFiles = process.env['PROGRAMFILES'] ?? join('C:', 'Program Files')
  const candidates = [
    join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(programFiles, '(x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]
  return candidates.find(candidate => existsSync(candidate))
}

export default CollectCdpLauncher
