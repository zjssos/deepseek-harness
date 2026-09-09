/**
 * The rxlab workbench workspace: one durable directory that structures the
 * workbench's module artifacts, agent guidance assets, and business storage.
 * The plugin registers the `rxlab-workspace` settings namespace (the root
 * path; restart-applied, because the storage backend resolves its root from
 * the resolved value at composition), provides the `rxlabPaths` service with
 * the resolved locations, and bootstraps the skeleton (module directories,
 * AGENTS.md guidance files, `.dsh/skills/`, and a git repository marker that
 * anchors project-root discovery for instructions and skills) when the
 * directory is first used.
 * @module @deepseek-ai/dsh-rxlab-app/workspace-paths
 */

import { execFile } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { expandHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'

/** Service provided by this plugin; consumers inject it for resolved paths. */
export const RXLAB_PATHS_SERVICE = 'rxlabPaths'

/** Settings namespace carrying the workbench workspace root. */
export const WORKSPACE_SETTINGS_NAMESPACE = 'rxlab-workspace'

/** Subdirectory holding the storage backend root inside the workspace. */
const STORAGE_SUBPATH = join('.rxlab', 'storage')

/** Plugin config: the workbench workspace root, overridable in settings. */
export interface Config {
  /** Absolute workspace root directory (a `~` prefix expands against the home directory). */
  root: string
}

/** Config schema. */
export const Config: z<Config> = z.object({
  root: z.string().required(),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Resolved rxlab workbench workspace locations. */
    rxlabPaths: RxlabWorkspacePaths
  }
}

/** One guidance file the skeleton materializes when absent, never overwriting. */
interface SkeletonFile {
  /** Path relative to the workspace root (forward or back slashes). */
  readonly relativePath: string
  /** Full file content written only when the file does not exist yet. */
  readonly content: string
}

const ROOT_AGENTS_MD = `# rxlab 工作台

这是 rxlab 工作台的工作空间根目录。各业务模块在本目录下有独立子目录，agent
会话按模块运行在对应子目录内。

## 目录约定

- \`collect/\`：商品采集模块的产物（导出的链接清单、页面快照、截图等）。
- \`wiki/\`：商品 Wiki 模块的导出与导入区（Markdown/CSV）。
- \`exports/\`：工作空间导入导出数据包的落点。
- \`.dsh/skills/\`：工作台级 skill，对本工作空间的会话可见。
- \`.rxlab/\`：应用管理的数据目录（存储单元文件）。这里的文件由应用写入，
  请勿手工编辑；业务数据一律通过 rxlabCollect / rxlabCatalog 接口读写。

## 指导文件

每个模块目录的 AGENTS.md 约定该模块的工作方式；本文件对所有会话生效。
`

const COLLECT_AGENTS_MD = `# 商品采集模块

本目录是采集模块会话的工作目录，采集产物（导出文件、快照）放在这里。

采集链接、捕获记录、批次等业务数据的权威存放是应用的 rxlab_collect 存储
域，通过 rxlabCollect 接口读写；本目录只放面向用户的导出产物。
`

const WIKI_AGENTS_MD = `# 商品 Wiki 模块

本目录是 Wiki 模块会话的工作目录，主数据的导出/导入文件放在这里。

Wiki 条目的权威存放是应用的 rxlab_catalog 存储域，通过 rxlabCatalog 接口
读写；本目录只放面向用户的导出产物。
`

/** Skeleton guidance files, materialized in order when absent. */
const SKELETON_FILES: readonly SkeletonFile[] = [
  { relativePath: 'AGENTS.md', content: ROOT_AGENTS_MD },
  { relativePath: join('collect', 'AGENTS.md'), content: COLLECT_AGENTS_MD },
  { relativePath: join('wiki', 'AGENTS.md'), content: WIKI_AGENTS_MD },
]

/** Directories the skeleton creates (empty module artifact directories). */
const SKELETON_DIRS: readonly string[] = [
  join('.dsh', 'skills'),
  'collect',
  'wiki',
  'exports',
]

/** Resolved workspace locations consumed by rxlab composition rows. */
export interface RxlabPaths {
  /** Absolute workspace root after `~` expansion and resolution. */
  readonly workspaceRoot: string
  /** Absolute storage backend root: `<workspaceRoot>/.rxlab/storage`. */
  readonly storageRoot: string
}

/** Expand and resolve one configured root into the absolute workspace root. */
function resolveRoot(configured: string): string {
  return resolve(expandHomePath(configured))
}

/**
 * Materialize the workspace skeleton: directories, guidance files (written
 * only when absent, so user edits survive), and the git repository marker.
 * Directory or file creation failures propagate — a workspace that cannot be
 * prepared fails the load. The git marker is best-effort: an environment
 * without git only loses root-level instruction and skill discovery, and the
 * per-module guidance still applies.
 * @param workspaceRoot - absolute workspace root to prepare.
 * @param logger - warn sink for the best-effort git marker.
 */
export async function bootstrapWorkspace(workspaceRoot: string, logger: { warn(message: string): void }): Promise<void> {
  for (const dir of SKELETON_DIRS) {
    await mkdir(join(workspaceRoot, dir), { recursive: true })
  }
  for (const file of SKELETON_FILES) {
    const target = join(workspaceRoot, file.relativePath)
    if (await exists(target)) continue
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.content, 'utf8')
  }
  if (!await exists(join(workspaceRoot, '.git'))) {
    await new Promise<void>((resolvePromise) => {
      execFile('git', ['init'], { cwd: workspaceRoot }, (error) => {
        if (error !== null) {
          logger.warn(`rxlab workspace: git init failed (${error.message}); root-level AGENTS.md and skills discovery will be limited to per-module directories`)
        }
        resolvePromise()
      })
    })
  }
}

/** Whether one filesystem path exists. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Owns the workbench workspace locations. Activation registers the settings
 * namespace, resolves the effective root (settings document over composition
 * entry), bootstraps the skeleton, and only then publishes `rxlabPaths` — a
 * consumer that injects the service observes prepared paths.
 */
export class RxlabWorkspacePaths extends Service {
  /** The settings provider must be live before the namespace registers. */
  static inject = ['settings']

  static Config: z<Config> = Config

  private readonly compositionConfig: Config
  private rootValue: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx, 'rxlabPaths')
    this.compositionConfig = config
  }

  /** Absolute workspace root after `~` expansion and resolution. */
  get workspaceRoot(): string {
    if (this.rootValue === undefined) throw new Error('rxlab workspace paths are not started yet')
    return this.rootValue
  }

  /** Absolute storage backend root: `<workspaceRoot>/.rxlab/storage`. */
  get storageRoot(): string {
    return join(this.workspaceRoot, STORAGE_SUBPATH)
  }

  protected async [Service.init](): Promise<void> {
    // The namespace is restart-applied: consumers resolve the root once at
    // composition, so a root edit takes effect on the next start.
    this.ctx.settings.installSection(this.ctx, WORKSPACE_SETTINGS_NAMESPACE, Config, this.compositionConfig, {
      setSource: () => {},
      onChange: () => {},
      applies: 'restart',
    })
    this.rootValue = resolveRoot((this.ctx.settings.get(WORKSPACE_SETTINGS_NAMESPACE) as Config).root)
    await bootstrapWorkspace(this.workspaceRoot, this.ctx.logger)
  }
}

export default RxlabWorkspacePaths
