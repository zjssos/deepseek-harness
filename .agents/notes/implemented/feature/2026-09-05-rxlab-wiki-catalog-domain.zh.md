# Agent Note: rxlab 商品 Wiki catalog 域与官方 Remote 包

Status: implemented

[English](2026-09-05-rxlab-wiki-catalog-domain.md) | 中文

## 问题

rxlab 工作台（`dsh rxlab`）需要让「商品 Wiki」模块成为后续验光与推荐的结构化数据底座：可持久、可维护的镜架 / 镜片 / 商品 master data，供独立 SPA（`apps/rxlab-web`）浏览与录入并跨重启保留。此前该模块只是占位。模块还必须沿用 rxlab 既有组合模式——host 数据行 + SPA 通过内嵌 headless Cordis 客户端运行时驱动生成的类型化 Remote namespace——且不得污染平台通用客户端装配。

## 决策

以新官方双面包 `@deepseek-ai/dsh-rxlab-catalog` 交付，落在 `packages/api/`（而非 `packages/bundle/`）：bundle 组是「可安装的 patch 层装配」，没有 tsdown `clientBundle`/typert 生成链；api 组各 controller 包才有该链。Host 侧数据经由 **storage domain** 形态（`ctx.storageDomain`）而非自建 JSON 文件：`defineDomain` 声明 `rxlab_catalog`（version 1、`per-record` 布局使每条记录为独立文档）、单张 `items` 表，zod schema 是 `frame` / `lens` / `product` 的判别联合。域名为 `rxlab_catalog` 而非 `rxlab-catalog`：storage 单元名须匹配 `[a-z][a-z0-9_]*`，带连字符的名字会被 `defineDomain` 立刻拒绝。

`CatalogController extends TypertRemoteService` 注册 `rxlabCatalog` Remote namespace（`super(ctx, 'catalogController', { namespace: 'rxlabCatalog' })`），在 `[Service.init]` 打开域，暴露 `list`（kind 过滤 + 品牌/型号/名称大小写不敏感子串，按最近写入倒序的摘要）、`get`、`upsert`（在 wire 边界用域 zod schema 校验 draft，服务端铸造 id 与 `updatedAt`，排入域的单写链）与 `delete`（endpoint 拼写为 `delete` 而非 `remove`：Client namespace 服务保留了 `remove`）。Wire 与持久类型是 `src/types.ts` 中的浏览器安全 JSON 类型；zod 仅存于 host 侧 `src/domain.ts`。

Client 侧本包是 `dsh.client` 行，其 `/client` bundle 自行 `$mount` 生成的 Remote contribution（`import catalogRemote from '@deepseek-ai/dsh-rxlab-catalog/remote'`）。rxlab profile（`packages/bundle/rxlab-app/cordis.patch.yml`）只加一行 host 行 `rxlab-catalog`，它同时承担两半：Host Loader 激活 `CatalogController`，`modules` 行组合 SPA 图时包含新的 `dsh.client` 行，于是 SPA 通用 headless boot 激活该 bundle、namespace 得以解析。平台 `api-remotes` 装配未改动。

SPA 模块（`apps/rxlab-web/src/modules/wiki/`）是最小三区浏览器：顶部过滤/检索条（`Tabs` kind 过滤、防抖检索框、新增按钮）、摘要列表 + 详情/编辑/删除面板、以及按 kind 显示字段的新建/编辑表单弹窗（镜架几何参数、镜片折射率与类型选择器、采集商品字段）。读写经 `useCatalogList` 与薄 action helper 走 `runtime.remote.rxlabCatalog`；列表采用受控刷新（每次变更后由面板 bump nonce），而非 `domain/changed` 订阅。registry 条目翻为 `status: 'active'`。

## 备选方案

**把 namespace 加入平台 `api-remotes` 装配。** 该装配用于为每个 Client 选择通用 Host 能力；rxlab catalog 是产品域数据，会让平台被迫依赖 rxlab 包；为避免污染平台装配而否决。改为本包通过自己的 `dsh.client` 行自 mount contribution。

**把包放在 `packages/bundle/`。** bundle 包是 base 行之上的 patch 层装配，组内无 client-typert tsdown 链；api 组才有 `clientBundle`/`client/tsdown.client.ts` 与 typert 生成。故双面包与其他 controller 同放 api 组，profile 行仍留在 rxlab-app bundle。

**先走会话 Agent 工具 / 采集导入再落持久库。** 验光/推荐模块需要独立于任何模型轮次的共享 master-data 底座；Remote + storage-domain 是最窄的持久 seam，后续采集导入会写同一域。

**自建 JSON 文件或直接用 sqlite。** storage-domain 形态已提供持久读边界的 zod 校验、同步内存读、每域单写链与 `domain/changed` 事件，且落在 rxlab 隔离的 `storages-rxlab` 根下；自建文件会重复这些保证。首版沿用 json 后端；后续仅需改路由即可让 `storage-sqlite` 支撑同一域。

## 结果

商品 Wiki 现可端到端读写持久化结构化 master data：浏览器 → `rxlabCatalog` Remote → `$DSH_HOME/storages-rxlab/` 下的 `rxlab_catalog` 域记录。记录在刷新后仍在；面板通过空态、带校验的新建、列表、详情与编辑回显、检索/kind 过滤、删除等浏览器冒烟。验光/推荐模块与采集导入可消费同一域；后续可用 `domain/changed` 订阅替换面板的受控刷新。平台 `api-remotes` 装配保持干净，rxlab-app patch 只是薄薄一行。storage 单元命名规则（`[a-z][a-z0-9_]*`）是未来 rxlab 域名必须遵守的约束。

## 测试

在 `dsh rxlab` 上做浏览器冒烟，覆盖面板启动、空态、本地校验、镜架与镜片各建一条（Radix select 用真实按键/点击）、分 kind 的详情渲染、编辑往返并把新增字段（颜色/重量）持久化进记录文件、检索（`A-01`）与 kind 标签过滤、删除确认后行与 per-record 文档一并移除、以及重载后剩余镜架行的持久读回。会话 Agent 模块仍能启动并渲染其会话工作台。`apps/rxlab-web` typecheck 与 Vite 构建全绿；完整 `build:lib:host` 与 `build:lib:client` 通过。未端到端覆盖：浏览器建 `product` 行、客户端预校验之外的 server 端 zod 拒绝路径（只观察到必填名称的客户端校验），以及新包 Host controller 的单元/覆盖率测试（仓库 per-file 覆盖率门仍需 host spec）。
