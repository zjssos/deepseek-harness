# rxlab：与 web 平行的全新 agent profile + 独立 Web 客户端

> **状态：设计计划（存档，未实施）** — 产品代号 **rxlab**（验光配镜工作台，`dsh rxlab`）。本文件由 2026-09-04 规划会话产出，落盘到仓库根 `rxlab-profile-plan.md`；后续在分支 `feat/rxlab-profile` 上按「实施顺序」执行，本会话不再实施。


## Context（背景与目标）

用户需要为 deepseek-harness 增加一个全新 agent 产品 **rxlab**：`dsh rxlab` 与 `dsh web` 是两个可同时运行、互不干扰的 Web 客户端。rxlab 的**后端能力与 web profile 一致**（会话/聊天/设置/模型选择等），但 UI 需要**全新独立编排**——UI 形态参照用户预想项目 `E:\zjssos\glasses-packing-workbench`（配镜工作台）：以 deepseek-harness 为 agent 底座做 Node 集成，UI 同时承载 **agent 能力区（会话）** 与 **整配镜各业务模块的工作区**（采集 / 商品 Wiki / 验光配镜 / 推荐校验 / 效果图 / 流程结果等）。该预想仓库目前是"契约清晰、CLI/JSON 驱动"的独立模块 + 简单 HTML 结果页，其 `docs/architecture.md`「harness 化」小节明确了后续形态：模块→工具、流程 schema 复用、JobState 作状态、产物路径作上下文——即由 harness agent 编排这些模块。本 deepseek-harness 侧的任务就是先把承载这一切的 **rxlab profile + 模块化工作台 UI 框架**搭起来。

本阶段交付：**工作台 UI 框架 + 1~2 个占位业务模块工作区**（命名对齐配镜工作台的模块域，如"会话(Agent)"为真实可用、其余如"商品 Wiki / 配镜流程"为占位）；真实业务模块后续由用户在 deepseek-harness 侧包成工具/行，或在 glasses-packing-workbench 侧按"harness 化"小节接入。会话/设置数据与 web profile **隔离**。

已确认决策：
- 顶层命令 `dsh rxlab` + 新 `PROFILE_TEMPLATES` 条目 + 新的 bundle 包（叠加于 `dsh-base`，不动 web profile）。
- 全新独立 UI 壳（工作台式：模块导航 + 工作区），不是复用 ui-layout 三栏。
- 数据隔离（会话/设置），凭据（env/`.credentials.yaml`）保持共享以保证模型可用。
- 在 deepseek-harness 仓库开新分支实现；glasses-packing-workbench 仅作为 UI 形态与模块划分的参照，不改动它。

## 架构机制（探索结论，实现依据）

- **Profile**：`packages/boot/app-boot/src/profile.ts` `PROFILE_TEMPLATES`（web = `['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']`）。`dsh web` 是 `apps/cli/src/args.ts` 的 Commander 硬编码别名（`resolveBoot(web,'web',…)`）。
- **Bundle**：`packages/bundle/<name>/` = `cordis.patch.yml`（patch 行）+ glue 插件 `src/` + `package.json`（`dsh.bundle.patch`、依赖每个被引用插件）。被引用 bundle 必须挂在 `@deepseek-ai/dsh`（`apps/cli/package.json`）dependencies 下，才能从安装锚点解析。
- **Web bundle 组装**（`packages/bundle/web-app/cordis.patch.yml`）：base 行重述（persona、tools、sqlite 等）+ 宿主行（webserver/web-runtime/startup/controller/…）+ **浏览器 roster**（`@deepseek-ai/dsh-client-ui-*` 等 insert 行）。glue `src/index.ts` 解析 `@deepseek-ai/dsh-web-frontend` dist、挂 frontend-static、打印 URL、开浏览器。端口默认在 webserver 行 `port: !!js ctx.webStartup.port ?? 3080`。
- **客户端**：无 URL 路由。`apps/web`（vite）只编译通用 shell（`@deepseek-ai/dsh-client-web` 内核 + primitives）；真正 UI 由 profile 的 cordis 树经 `window.__DSH_BOOT__` roster 决定。渲染器只 `renderSlot('root')`；`ui-layout` 浏览器插件（`packages/client/ui-layout/src/client/index.ts`）占用 root 并声明 children 席位 `sidebar/conversation/details/shell.overlay`；occupants（ui-sidebar→sidebar、ui-conversation→conversation/details、…）各自 `ctx.slots.register`。Slot 语义见 `packages/client/ui-slots`（single/list/keyed/chain；scope root/session-maybe/session）。
- **客户端包形态**（以 `packages/client/ui-jobs` 为模板）：双导出 `"."`（host，可空）+ `"./client"`（浏览器 bundle `lib/client.js`，tsdown 用包内 `tsdown.config.ts` + `packages/client/tsdown.client.ts` 预设），`dsh.client` manifest（`inject` 其它客户端包、`platform:'web'`），bundles 通过 `scripts/build.ts` client pass 产出。
- **存储默认**：`session-persistence-jsonl` 行 `root: !!js dshHomePath('sessions')`（base bundle）；settings-file 行默认 `<home>/settings.yaml`（schema 有 `path` 字段，可覆盖）；凭据 env/.credentials 共享。
- **测试样板**：`packages/bundle/web-app/tests/*.spec.ts`（dist/startup/trusted-hosts/browser-open）、`apps/cli/tests/args.spec.ts`、`apps/cli/tests/web-agent-presets.e2e.ts`、`apps/cli/tests/profiles/headless/tests/keyless-smoke.e2e.ts`。

## 改动方案

### 1. 新 bundle：`packages/bundle/rxlab-app/`（后端组装）

以 `packages/bundle/web-app` 为模板复制改造（符合用户"复制一套组装"意图；web profile 不受影响）：

- `cordis.patch.yml`：复制 web-app patch 全部行，改动点：
  - `system-prompt` persona 换成 rxlab 文案（"配镜工作台 agent 底座"身份，说明可编排采集/Wiki/验光/推荐等模块，为后续 harness 化预留；文案先收敛、不引入未实现能力）。
  - `webserver` 行默认端口 `?? 3081`（避免与 web 的 3080 冲突，仍可用 `--port`/`--host`）。
  - **数据隔离行**（web-app 没有，需新增/覆盖）：`settings` 行 `config.path: !!js dshHomePath('settings-rxlab.yaml')`；`session-persistence-jsonl` 行 `config.root: !!js dshHomePath('sessions-rxlab')`；`session-query-sqlite` 保持 web 的 `:memory:`；`attachment-local`、spill、projection 等如默认落在共享 home 路径，实现时逐一核对并指向 rxlab 专属子目录（至少所有持久化会话数据的行必须隔离）。
  - 浏览器 roster：**删除 `ui-layout` 行**，替换为 `@deepseek-ai/dsh-client-ui-rxlab-shell`；追加占位模块行（如 `@deepseek-ai/dsh-client-ui-rxlab-module-demo`）。其余 roster 行（ui-session/conversation/chat/settings/sidebar/…）保留。
- `src/index.ts` + `src/startup.ts`：复制 web-app glue/startup，重命名插件/服务（`rxlab-app`/`rxlabStartup`），复用同一 `@deepseek-ai/dsh-web-frontend` dist 解析；URL 行文案带 rxlab 标识。
- `package.json`：name `@deepseek-ai/dsh-rxlab-app`，`dsh.bundle.patch`；dependencies 复制 web-app 全部，并把两个新客户端包加入。
- `README.md/.zh.md`、`tests/*`（镜像 web-app 的 dist/startup/flags 单测，先做最小集）。
- 在 `apps/cli/package.json` dependencies 增加 `@deepseek-ai/dsh-rxlab-app`。

### 2. CLI 入口与 profile 注册

- `packages/boot/app-boot/src/profile.ts`：`PROFILE_TEMPLATES` 增加 `rxlab: { bundles: ['@deepseek-ai/dsh-base','@deepseek-ai/dsh-rxlab-app'], patchReload: 'live' }`。
- `apps/cli/src/args.ts`：仿 `web` 增加 `rxlab` Commander 子命令别名（拒绝父级 flags 的 `rejectParentOptions`、`--patch`/dump 选项一致），并更新 HELP_EXAMPLES。
- 如需差异默认端口提示：见 bundle startup `--help` 文案即可（非必改）。

### 3. 客户端：工作台式 shell + 模块框架（浏览器插件包，均在 `packages/client/`）

UI 形态按配镜工作台预想实现：同一窗口内，左侧是**模块 rail**（会话 Agent / 商品 Wiki / 配镜流程 …），主区随激活模块切换；**会话模块承载 agent 能力**（与 web 功能一致），业务模块工作区先给占位面板，后续把 glasses-packing-workbench 模块包成 harness 工具/行后逐模块接入。新增两个包（以 `ui-jobs` 包结构为模板：`src/index.ts`(host，可仅透传)、`src/client/*`、`package.json` 双导出 + `dsh.client`、`tsdown.config.ts`、`tsconfig.json`、README 双语、`tests/`）：

1. `@deepseek-ai/dsh-client-ui-rxlab-shell`
   - 浏览器 `apply()`：提供 `ctx.layout`/theme/locale/store 接线（照抄 ui-layout 的服务接线，保证 ui-sidebar/ui-workspace/ui-conversation 等 occupants 依赖不缺失）；`ctx.slots.register` 占用 **`root`**，children 声明与 ui-layout 一致的四席位 **加上** 模块席位：
     - `na.rail`（list, root）：模块导航条目（模块贡献 key/label/icon，参照配镜工作台模块域：agent 会话、商品 Wiki、验光配镜、推荐校验、效果图、流程/结果）。
     - `na.module`（keyed, root）：模块工作台内容，按 active key 渲染（参照现有 keyed 用法：`conversation.chat.commandview`、`settings.plugin.item`）。
   - 新 frame 组件（工作台视觉：品牌 + 左侧模块 rail + 主区；**agent 会话模块**激活时主区渲染会话三栏席位，业务模块激活时渲染其工作台面板）。关键做法：children 席位 **与 ui-layout 使用完全相同的 key/kind/scope**（如 `conversation` single/session-maybe、`sidebar` single/root、`details` single/session、`shell.overlay` list/root），并在需要处 type-only import `@deepseek-ai/dsh-client-ui-layout/client` 的 OwnerShare 类型以维持 SlotMap 合并一致；**不**在运行时挂 ui-layout 包（root 单槽只能有一个占用者）。
   - "会话"模块即复用现有 occupants（ui-sidebar/ui-conversation/…）渲染，保证功能一致；"商品 Wiki / 配镜流程"等模块点击后在主区渲染 keyed 工作台面板。
   - SlotMap type-merge：本包只新增自有 key（`na.rail`/`na.module`），不重复声明 ui-layout 已声明的 key 成员（其类型通过 type-only import 引入）。
   - 注意：若与 web roster 差异导致 ui-sidebar 依赖的 `ctx.layout` 行为缺失，以 ui-layout 的服务接线为准补齐；这是本方案风险点之一（见 Risks）。
2. `@deepseek-ai/dsh-client-ui-rxlab-module-demo`（工作台模块接入示例）
   - 演示"如何新增一个业务模块工作区"：向 `na.rail` 注册条目 + 向 `na.module` 注册一个 keyed 工作台面板（按配镜模块域提供 1~2 个占位工作区，如"商品 Wiki"占位展示产物目录/搜索框占位、"配镜流程"占位展示步骤状态条占位；含 keyProps 与 locale）。后续真实模块 = 一个/一组浏览器插件行 + 相应 host 工具行，注册进同一席位即接入工作台。

（如实现中发现"复用现有 conversation occupants 同时保留独立 shell"在席位类型上不可行，退路见 Risks R2。）

### 4. 文档、目录、Agent Note

- `packages/bundle/README.md/.zh.md`：包表增加 rxlab-app 行。
- `apps/cli/README.md/.zh.md`（如 dsh 文档列命令则补 `dsh rxlab`）、`apps/cli/composition.md` 由 `pnpm run gen-doc-graphs` 重新生成。
- 配置目录：bundle Config schema 入目录后跑 `gen-config-catalog`；客户端目录跑 `gen-client-catalog`；`verify-cordis-config` 要求 cordis 行引用的插件都在包 dependencies 中（步骤 1 已覆盖）。
- `.agents/notes/implemented/architecture/2026-09-04-rxlab-profile-and-module-ui.md`：记录 profile/bundle/模块 UI 组装决策（非平凡改动必须有 Agent Note）。

### 5. 测试

- `apps/cli/tests/args.spec.ts`：新增 `dsh rxlab` 别名解析/错误分支用例。
- `packages/bundle/rxlab-app/tests/`：dist 解析 + startup flags + 隔离路径断言的最小单测（镜像 web-app）。
- 关键路径 e2e：参考 `keyless-smoke.e2e.ts`/`web-agent-presets.e2e.ts` 增加一条 rxlab profile 冒烟（replay/mock 模型下能起 profile 并得到 UI 托管 URL 类输出），作为快照策略的基线；若新增 model-visible persona 需按 snapshot ownership 规则决定是否补 recorded-session fixture（先在计划内标记为待定项，实施时按 docs/testing.md 判定）。

## 实施顺序（checkpoint）

1. **分支**：`git checkout -b feat/rxlab-profile`（从 master）。
2. 后端 bundle + PROFILE_TEMPLATES + args alias + apps/cli dep → 验证：`pnpm dsh --profile rxlab --dump-default-config` 能打印 rxlab 树；`pnpm dsh rxlab --help` 生效（无需 build 全量，typecheck 相关包）。
3. 隔离路径 override → 验证：跑起后 `$DSH_HOME/sessions-rxlab`、`settings-rxlab.yaml` 生效且 web 的 sessions 不被写入。
4. 客户端两个新包 + rxlab-app roster 更新 → `pnpm run build:lib:client` / `pnpm run build:web` 产出。
5. `pnpm dsh rxlab` 与 `pnpm dsh web`（不同端口）并行验证两个客户端；rxlab 工作台界面可聊、可新开会话、可进设置、模块 rail 可在"会话 / 商品 Wiki(占位) / 配镜流程(占位)"间切换并渲染对应工作台。
6. 测试/文档/Agent Note → 跑相关 gate：`pnpm run typecheck`、目标 vitest（args/bundle/client specs）、`verify-cordis-config`、`gen-*-catalog --check`、`doc-sync`（按需裁剪）。

## 验证方式（最终验收）

- `pnpm dsh rxlab`（前台）出现 `dsh rxlab:` URL（端口 3081 或 `--port` 指定）；`pnpm dsh web`（3080）同时可用，互不干扰。
- rxlab 浏览器界面为工作台式：模块 rail 含"会话(Agent)"与 1~2 个配镜域占位模块；会话模块可完成一次真实聊天（有 `DEEPSEEK_API_KEY`）、会话持久化到 rxlab 专属目录；占位模块可切换展示对应工作台面板；设置/模型选择可用。
- `pnpm run typecheck` 通过；目标单测/e2e 通过；`--dump-default-config` 与生成目录 gate 通过。

## Risks / 开放问题

- **R1 端口**：rxlab 默认 3081；若 3081 也被占，提示用 `--port`（与 web 行为一致）。
- **R2 席位复用**：最不确定点是"rxlab-shell 声明与 ui-layout 相同的 children 席位供现有 occupants 使用"。若类型/运行时冲突不可行，退路：shell 先自带一个简化会话面（仅 ui-conversation 的会话体 + composer 核心席位），设置/模型页改为模块 stub；并在此 PR 中与用户确认取舍。
- **R3 代码重复**：rxlab-shell 会复制/改写 ui-layout 的 frame 逻辑；jscpd duplication gate 可能告警。缓解：优先以"适配 + 精简"而非全文复制；告警则把共享 frame 抽到中性包并让 ui-layout 与 rxlab-shell 共用（需跑 web 相关 golden 防回归）。
- **R4 占位模块→真实模块**：本 PR 只固化工作台 UI 接入点（`na.rail`/`na.module`）与注册示范；真实配镜模块后续按 glasses-packing-workbench「harness 化」小节接入（模块→host 工具行 + 浏览器工作台行）。