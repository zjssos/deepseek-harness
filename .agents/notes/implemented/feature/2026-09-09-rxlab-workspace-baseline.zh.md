# Agent Note：rxlab 工作台工作空间基线 —— 单一按模块结构化的工作空间

Status: implemented

[English](2026-09-09-rxlab-workspace-baseline.md) | 中文

## 问题

rxlab 各模块的持久数据位于任何工作空间之外：`rxlab_collect`/`rxlab_catalog` 单元在 `$DSH_HOME/storages-rxlab/` 下，而 agent 会话运行在宿主进程的 `process.cwd()`（SPA 从不传 `cwd`，见 `apps/rxlab-web/src/modules/agent/use-sessions.ts`）。agent 因此无法通过文件工具读取或产出模块产物，也不存在一棵可整体导出用于初始化的目录树。商定基线：工作台使用一个工作空间目录，按模块子目录结构化，模块 agent 通过 `AGENTS.md`/skill/preset 指导运行，工作空间后续可导入导出。

## 决策

`@deepseek-ai/dsh-rxlab-app/workspace-paths`（`packages/bundle/rxlab-app/src/workspace-paths.ts`）持有工作空间缝：

- 注册 `rxlab-workspace` 设置命名空间（schema：`root`；`applies: 'restart'`，因为消费方只在组合期解析一次根），以 patch 提供的组合基值 `dshHomePath('rxlab-workspace')` 为 base。
- 提供 `rxlabPaths` 服务：`workspaceRoot`（展开 `~` 后解析）与 `storageRoot = <workspaceRoot>/.rxlab/storage`。bundle patch 把 `storage-json` 的 `root` 指向 `ctx.rxlabPaths.storageRoot`，全部业务存储单元（`rxlab_collect`、`rxlab_catalog`、workspace 记录）因此位于工作空间内，而设置文档与会话日志留在 `$DSH_HOME`（设置文档定义工作空间在哪，不能住在它定义的目录里）。
- 首次激活时、服务发布之前生成骨架：模块目录（`collect/`、`wiki/`、`exports/`、`.dsh/skills/`）、指导文件（根与各模块的 `AGENTS.md`，仅在缺失时写入，用户编辑得以保留）、尽力而为的 `git init` —— 没有 `.git` 标记时，agent-instructions 与 skill-filesystem 的 `findProjectRoot` 会回退到会话 cwd，根级指导与工作空间 skill 将永远无法被按模块的会话发现。目录/文件创建失败使加载失败；git 缺失仅告警。
- patch 行以 `rxlabStartup` 门控，`dsh --profile rxlab --help` 不会创建工作空间，也不会注册命名空间。

沙箱交互（已在 `packages/sandbox/sandbox-policy/src/index.ts` 验证）：`workspace-write` 的可写根是会话 cwd。以 `cwd = <workspaceRoot>/<模块>` 创建的模块会话可以写自己的产物，但写不到 `.rxlab/storage`；业务数据只能通过类型化 Remote 命名空间触达。一般 agent 会话（cwd = 工作空间根）可写整棵树。

SPA 现在在创建会话时传 `cwd`：无 preset 与未知 preset 的会话运行在工作空间根；`collect` preset 映射到 `collect/`（`apps/rxlab-web/src/modules/agent/Panel.tsx` 的 `MODULE_SESSION_SUBDIRS`）。根路径经 `settings.describe()` 实时读取（`use-sessions.ts` 的 `useWorkspaceRoot`）；没有该命名空间的旧宿主回退到宿主默认 cwd。按模块 cwd 带来的 workspace registry 多记录是已接受的取舍。

配套改动：`SettingsProvider.installSection` 现在从 hooks 透传可选 `applies`，经该助手注册的重启语义命名空间能如实显示重启徽标。

## 被否决的备选

**存储保持在 `$DSH_HOME/storages-rxlab`，向工作空间投影导出。** 产品所有者否决：工作空间应直接承载业务数据，使导入导出成为目录操作；且存储入工作空间配合按模块 cwd，结构化数据本就不在 fs 工具的写范围内。

**所有模块统一以工作空间根为会话 cwd。** 更简单，但模块指导注入只能依赖根 `AGENTS.md`，且 agent 可经 fs 工具写 `.rxlab/storage`；产品所有者选择按模块 cwd 换取隔离。

**骨架不做 `git init`。** 验证回退行为后否决：两个 `findProjectRoot` 实现都在无 `.git` 时返回 cwd 本身，指令发现收窄到 cwd 单目录、项目 skill 收窄到 `<cwd>/.dsh/skills`。

## 后果

在设置中修改工作空间根是一次数据迁移：存储后端在下次启动解析新根，旧数据留在原处；重启徽标与 README 文案均如此声明，后续导入导出是正式迁移路径。preset → 子目录映射暂存于 SPA，直到 preset 元数据能承载它。

接线 SPA 时发现的非显然约束：rxlab-web 程序里存在两个冲突的 `Context.sessions` augmentation（宿主 `@deepseek-ai/dsh-session` 声明 `SessionStore`；客户端 `@deepseek-ai/dsh-api-session-controller/client` 声明 `ISessions`），`skipLibCheck` 下最先进入程序者获胜。形如 `import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets'` 的裸包类型导入（其 `index.d.ts` 会触及宿主 session augmentation）一旦导入点在图中前移，就会把 `ctx.sessions` 静默翻成 `SessionStore`。SPA 模块对这些包的类型导入必须走 `/types` 子路径（`use-sessions.ts` 早已如此）；settings 模块的两处违规现已改正。

## 测试

`packages/bundle/rxlab-app/tests/workspace-paths.spec.ts` 在临时 home 上以真实 file-backed settings provider + 服务组合启动，断言 storage root 落在工作空间内、骨架生成（目录 + 中文指导文件）、设置文档覆盖与 describe 中的 `restart`、重复 bootstrap 幂等。settings 套件新增用例覆盖 `applies` 透传。SPA：`typecheck` + `build` 绿。
