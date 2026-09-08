# rxlab:组装逻辑与分层架构说明(harness 版)

> 状态:现状说明(2026-09-07,分支 qoder/rxlab @ 83cbb44c02;rxlab 文档区规则见 [AGENTS.md](AGENTS.md))。与[独立 SPA 架构取舍注记](2026-09-05-standalone-spa-architecture-decision.md)(决策)互补。本文描述**已实现**的组装,不是未来设想;文字以仓库当前代码为准,不引用历史实现。

## 0. 一句话

rxlab = 「`dsh-base` 完整 Cordis host + `rxlab-app` bundle(patch 层)」组成的 profile(`dsh rxlab`,端口 3081);UI 不跑 Cordis 浏览器 roster,而是独立 React SPA(`apps/rxlab-web`),经 host 的「/api Remote 面 + headless Cordis 客户端数据层」驱动会话与业务域。

## 1. 分层总览

| 层 | 职责 | 关键物 |
|---|---|---|
| 配置面 | profile 由哪些 bundle 拼、CLI 怎么叫、类型/构建怎么登记 | PROFILE_TEMPLATES、args.ts、tsconfig.*、cordis.patch.yml |
| host 运行时 | 插件树(模型/工具/会话/传输/域),一切可替换 | `@deepseek-ai/dsh-base` + rxlab-app 的 patch 行 |
| 传输/认证 | webserver、/api 网关 + cookie、静态伺服 | webserver/frontend-static/connection 行与 glue |
| UI | 独立工作台 SPA(不经 Cordis roster) | apps/rxlab-web + headless client 数据层 |
| 数据面 | rxlab 专属隔离存储 + 业务域 + 共享凭据 | settings-*/sessions-*/storages-rxlab、catalog/collect 域 |

## 2. 配置面:profile 由什么拼成

- **PROFILE_TEMPLATES**(`packages/boot/app-boot/src/profile.ts`):`rxlab: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-rxlab-app'], patchReload: 'live' }`。profile 目录首次初始化即安装这两个 bundle,之后 `dsh rxlab` 按其组合启动。
- **bundle = 带 patch 的 npm 包**:`packages/bundle/rxlab-app/package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`。patch 语义:按行 `id` **整行替换** base 已有行,`insert` 追加新行;用户层 `cordis.patch.yml` 与 `--patch` 覆盖在其后叠加。
- **CLI**:`apps/cli/src/args.ts` 硬编码 `dsh rxlab` 子命令 → `resolveBoot(rxlab, 'rxlab', …)`;启动后剩余 flags 交给 glue 的 commander 解析。
- **类型与构建登记**:`tsconfig.host.json` project reference、`tsconfig.base.json` paths(含子路径导出 `@deepseek-ai/dsh-rxlab-app/startup` 的手写别名;bare 别名由 `pnpm run gen-tsconfig-paths` 重生成)、`apps/cli/package.json` 依赖、`.gitignore`(rxlab-web dist 等)。漏任一环即 host 编译或 CLI 解析失败。

## 3. host 运行时:插件树(`rxlab-app/cordis.patch.yml`)

按块说明 patch 里的行(当前含 catalog 与 collect 两个业务域行):

- **persona**:`system-prompt` 行整行覆盖 base——眼镜/验光语境 persona,并声明「商品 Wiki 等已接,其余业务模块(采集、验光配镜…)未接时不虚构工具」。
- **数据隔离行**(覆盖 base):`settings → dshHomePath('settings-rxlab.yaml')`、`session-persistence-jsonl → sessions-rxlab`、`storage-json → storages-rxlab`。凭据(`.credentials.yaml`)保持共享,模型可用;attachment 走共享默认直到业务域自管。
- **insert 行**(职责表):
  - `rxlab-startup`(`@deepseek-ai/dsh-rxlab-app/startup`):cmdlineArgs 的 commander 解析(`--host/--port/--trusted-host/--no-open`,拒绝 `--host 0.0.0.0`),提供普通服务 `rxlabStartup`。
  - `webserver`:注入 `rxlabStartup`,`host/port` 取 flag,兜底 `127.0.0.1:3081`(避开 web 的 3080)。
  - `rxlab-runtime`(bundle 本体 `@deepseek-ai/dsh-rxlab-app`):resolve 前端包 dist → 运行时 mount `FrontendStatic` fallback(无独立 patch 行);注册 `app:rxlab-surface` prompt 段与 `DSH_RXLAB_URL` bash 变量;打印 `dsh rxlab: …` URL、按 `openBrowser` 开浏览器;bind 后提供 `rxlabRuntime`(trustedHosts 等)给信任围栏。
  - `connection`:浏览器认证半层(/api RPC 网关 carrier;由进程 token 铸 cookie,frontend-static 每次 index 渲染校验)+ 注入 `rxlabRuntime` 的 /api 信任围栏。
  - **会话 Remote 面**:`workspace`、`file-upload`、`session-controller`、`api-remotes`、`settings-controller`、`workspace-controller` —— 把 base 已含的 typert 网关/会话日志/工作区服务暴露成 /api Remote,供 SPA 调用,并把 api-session/* 事件推到浏览器 `$events` 流。
  - **业务域行**:`rxlab-catalog`(`@deepseek-ai/dsh-rxlab-catalog`,rxlab_catalog storage 域)、`rxlab-collect`(`@deepseek-ai/dsh-rxlab-collect`,rxlab_collect 域)——都是 dsh.client 行,自带包内 /client bundle,业务域不进平台 api-remotes。
  - `modules`(`@deepseek-ai/dsh-client-modules`):为所有激活的 dsh.client 行 compose `window.__DSH_BOOT__` 并 serve `/plugins/<id>/client.js` —— SPA headless 数据层由此拿到运行时。

**机制要点**:patch 整行替换→行注释强调「restates every key it owns」;inject 表达式按服务依赖延迟解析(rxlab-startup 先于引用它的行);`dsh --profile rxlab --help` 两服务都不建 → 不 bind server;base 的 host 插件树(agent-loop/工具/会话日志/typert 等)不因 rxlab 改动,全部走原可配置替换机制。

## 4. UI 侧组装(独立 SPA)

- **工程**:`apps/rxlab-web`(npm 名 `@deepseek-ai/dsh-rxlab-web-frontend`),Vite + React + TS + shadcn(neutral);构建出 `dist/`(dist gitignored、不入库,需本地先 build)。dev server 5174,proxy `/api` 与 `/plugins` → `http://127.0.0.1:3081`(changeOrigin:false 保 cookie,ws 开)。
- **接线**:rxlab-app glue `resolveDistIndex()` = `require.resolve('@deepseek-ai/dsh-rxlab-web-frontend/package.json')/dist/index.html` → 运行时 mount FrontendStatic(serves 真实 dist 文件)。SPA 因此用 **HashRouter**(深链留在页内)。
- **模块注册表**:`src/modules/registry.tsx` + `types.ts`(id/label/tagline/description/scope/icon/status/panel;status ∈ planned|active),侧栏与路由由 registry 驱动;7 个模块:agent/采集/商品 Wiki **active**,验光配镜/推荐校验/效果图/流程结果 **planned**(占位 Panel 渲染 ModulePlaceholder)。
- **agent 模块的数据层(核心机制)**:SPA 不跑 Cordis UI roster,而是在 bare Cordis root 上启动官方 **client DATA 层**——`bootHeadless()` 读 host modules 行注入的 `window.__ModuleLoader__` / `window.__DSH_BOOT__`,逐行创建并 await 激活 client 插件;经 `/api` Remote + WebSocket `$events` 驱动会话;hooks(use-sessions/use-credentials/use-model-catalog 等)绑对象层可观察源。**该数据层只在 `dsh rxlab` 伺服下可跑**(dev server 单独打开会失败并给出该错误)。
- **wiki/采集模块**:消费 `rxlabCatalog`/`rxlabCollect` 类型化 Remote,读写 `storages-rxlab` 下的 catalog/collect storage 域;域包在 `packages/api/rxlab-catalog`、`packages/api/rxlab-collect`(host/client tsconfig 双叶 + 双语 README)。

## 5. 数据与运行态

- `dsh rxlab --no-open` → 输出 `dsh rxlab: http://127.0.0.1:3081/?token=…`;无 token 首页 401(共享 browser-auth 文案仍写 "dsh web",已知润色项)。
- 首次启动自动建 `~/.dsh` 下 rxlab 专属文件(settings-rxlab.yaml / sessions-rxlab / storages-rxlab);web 的 sessions/storages 不被写入。
- 会话持久化为 JSONL(会话日志),业务域落 storage 域;凭据共享于 `.credentials.yaml`。

## 6. 改一份「组装要素」要动哪些文件

| 改动 | 文件 |
|---|---|
| host 行/配置/persona/端口/隔离 | `packages/bundle/rxlab-app/cordis.patch.yml` |
| glue 行为(dist 指向/URL/服务名) | `packages/bundle/rxlab-app/src/{index.ts,startup.ts}` |
| 新 profile/bundle 注册 | `packages/boot/app-boot/src/profile.ts` + `apps/cli/src/args.ts` + `apps/cli/package.json` |
| 类型聚合 | `tsconfig.host.json` ref + `tsconfig.base.json` alias → `pnpm run gen-tsconfig-paths` |
| SPA 加业务模块 | `apps/rxlab-web/src/modules/registry.tsx`(或新域包)+ host patch 行按需(控制器等仍在 base/remotes,配置级恢复) |
| 新第三方依赖 | `pnpm-workspace.yaml`(允许/年龄豁免)+ `THIRD_PARTY_NOTICES.md` 重生成 |

## 7. 与 web 的差异与演进边界

- **web profile** 的 UI 是「浏览器里再跑一个 Cordis Context」(roster:ui-* + cordis-client-runner),UI 组件以客户端插件贡献到 `window.__DSH_BOOT__`;rxlab 砍掉 roster,UI = 独立 SPA 消费者,「host 插件模型未破、破的是 UI 层客户端插件约定」这一取舍见同目录决策注记。
- 新业务模块的接入模板 = 域包(dsh.client 行 + host/client 双叶)+ registry 模块 + SPA 消费 Remote,或复用 agent 会话/工具;不重写 agent-loop。
- 桌面新线(E:\rxlab,electron-vite + @qodercn-ai/qodercn-agent-sdk)与本 harness 线的关系待用户明确,本文只描述 harness 版。
