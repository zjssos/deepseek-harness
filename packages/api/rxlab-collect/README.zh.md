---
description: "rxlab 商品采集:rxlab_collect 存储域(已登记店铺、挂在店铺下的商品条目、助手待确认草稿)、类型化 rxlabCollect Remote、自挂载 Client 贡献,以及只做分析、草稿由人工确认的采集 agent preset。"
kind: "package-reference"
---
# rxlab 采集(rxlab Collect)

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-rxlab-collect` 拥有 rxlab 商品采集台账。Host 侧提供 `ctx.collectController` 服务与生成式 `ctx.remote.rxlabCollect` 命名空间,读写 `rxlab_collect` 存储域(version 3,per-record;version 1、2 的 link 记录仍可读),含三张表 —— `shops`(人工登记的 平台 + 店铺)、`links`(挂在店铺下的商品条目)与 `drafts`(等待人工决定的助手草稿)。**人工录入是唯一事实来源**:每个商品字段都由人工填写(单条或 CSV 批量),不从网页读取任何内容 —— 本包不含采集器、不含浏览器,因此既不需要模型 key,也不需要 headless chromium。内置 `collect` agent preset 挂载的是一套**只做分析**的工具:agent 读取人工交给它的材料,`collect_list_*` 查询让它不会重复提议,`collect_draft_submit` 只记录 pending 草稿 —— 只有人工确认才会把草稿变成店铺或商品条目。Client 侧该包是 `dsh.client` 行,其 `/client` bundle 自行挂载命名空间,使 rxlab SPA 在装配 rxlab-product 数据的位置装载台账。本包刻意不加入平台 `api-remotes` 装配:这是 rxlab 产品数据,不是通用 Host 能力。导入商品 Wiki 仍在 catalog 侧完成(`rxlabCatalog.importCollected`);本包不写 `rxlab_catalog`。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

rxlab profile 组装一行 `rxlab-collect`(`@deepseek-ai/dsh-rxlab-collect`)。Host Loader 激活 `CollectController` 服务:在其生命周期内经 `ctx.storageDomain` 打开 `rxlab_collect` 域并在 Typert Gateway 注册 `rxlabCollect` 命名空间。SPA 的 headless client 启动会激活本包自带的 `/client` bundle(modules 节点在 `/plugins` 下提供),其 `apply` 挂载生成式 Remote 贡献,于是 `remote.rxlabCollect.*` 在浏览器内可用。rxlab profile 同时组装 `agent-presets` 名单行,SPA 可在内置 `collect` preset 上创建会话(见下)。

**店铺是组织单位。** `upsertShop` 登记或替换一个店铺(平台、名称、可选的平台侧标识、店铺主页、备注),`listShops` 按平台与不区分大小写的 名称/标识/主页 查询过滤。店铺不做去重:带 id 即替换该行,不带 id 总是新建,因此人工改名不会与相邻行相撞。`removeShop` 从不删除商品数据 —— 该店铺下的每个条目失去店铺归属并回到「未归类」,回执给出被释放的条数。

**商品条目由人工录入。** `upsertLink` 接收完整条目(归属店铺、url、标题、价格文本、sku、已选规格、规格参数名值对、主图 url、购买链接、备注);共享 平台 + 规范化 URL 的条目会合并为一行,因此同一商品录两次是更新而非重复。`importLinks` 从 CSV 文本批量创建(表头 `url` + 可选 `platform`/`sku`/`title`,逐行独立校验,拒绝行返回 UI),并把接受的每一行归到请求指定的店铺。`listLinks` 按平台、某个店铺或「未归类」集合过滤,另有一个不区分大小写的 标题/sku/url 查询。`getLink` 读取单条,`removeLink` 删除单条。

**助手提议,人工决定。** `collect_draft_submit` 记录 agent 从材料中提取的条目;每条独立校验并以 `pending` 草稿入库,不会触碰店铺或商品表。`listDrafts` 暴露队列(可按状态与目标过滤),`commitDraft` 在一次调用里写入草稿提议的条目并把它标记为 accepted(商品草稿可由人工指定归属店铺,覆盖草稿自带的值),`rejectDraft` 标记为 rejected 且不写入任何东西。已结算的草稿再操作会以 `collect/draft-not-pending` 拒绝。

**Agent 工具(会话级)。** `@deepseek-ai/dsh-rxlab-collect/tools` 注册 `collect_draft_submit`、`collect_list_shops` 与 `collect_list_links`,并带一个解释草稿契约的 `tool:collect` 系统提示分区。内置 `collect` agent preset(`packages/preset/agent-presets/presets/collect/`)把该行与 `tool-web`、`tool-ask-user`、`tool-todo` 组装在一起,persona 要求它读取人工给出的材料(粘贴文本,或人工给出、可公开抓取的 url)、提议前先查台账,并明确告知它**无法写台账**。preset 不含任何浏览器工具:分析是它唯一的能力。

域 version 3 新增 `shops` 与 `drafts`,下架了退役的 `captures` 与 `batches`;两者的 document 仍留在介质上,不再被声明或读取。`compatibleVersions` 列出 1 与 2,因为当前 link schema 仍接受那些存量记录 —— 遗留字段 `shopId`、`shopName`、`titleAtAdd` 保留声明且可读(UI 显示 `title ?? titleAtAdd`),而 controller 不再写入它们。

Wire 与持久类型在 `./types`(浏览器安全 JSON,无运行时代码);zod 在 Host 侧 `src/domain.ts`;纯解析/规范化助手在 `src/parse.ts`,回执/列表的纯格式化在 `src/tools.ts`(有单测,不触网)。

**运行时不变式：** 不发布运行时不变式伴生包(companion)：`rxlab_collect` 持久 schema 拥有 店铺/条目/草稿 关系，且每次写入都经过 controller 自身的校验，没有可独立观测而发散的关系。

-----

<a id="model-experience"></a>
## 模型体验

### 采集工具（会话级）

#### 模型可见什么

组装在内置 `collect` preset 上的会话携带 `collect_draft_submit`、`collect_list_shops`、`collect_list_links` 工具 schema 与一个 `tool:collect` 系统提示分区。仅挂载基础 `rxlab-collect` 行时不注册任何东西:没有 prompt、工具或会话事件,台账无需模型 key 即可工作。

#### Token 影响

组装在 `collect` preset 上的会话,其每次模型请求都携带挂载的工具 schema 与 `tool:collect` 分区;人工录入、草稿审阅与台账变更不向模型请求增加任何内容。

#### KV Cache 影响

会话内稳定:工具 schema 与提示分区在会话组装时挂载一次,其前缀贡献与系统提示其余部分一样进入缓存;台账数据变更从不使其失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 设计上不做任何自动采集。确定性 JD/淘宝采集器与浏览器发现界面已随域 version 3 移除;每个字段都来自人工,或来自人工确认过的草稿,因此条目的完整程度取决于录入时的材料。
- version 1、2 为退役的 `captures` 与 `batches` 写入的 document 留在介质上,不再被声明或读取。既无迁移,UI 也无入口。
- 遗留 link 记录保留 `shopId` 与 `shopName` 文本,但不属于任何店铺:在人工归位之前,它们出现在「未归类」列表里。
- 助手草稿只是提议,永远不是事实来源:未被确认的草稿不改变任何东西;格式错误的条目在提交时连同原因被拒绝,而不是被修补。
- 包对纯解析/格式化助手与 Host controller 的 店铺/条目/草稿 流程有单测;工具 handler 的参数校验与 SPA 面板尚无 spec。
- raw 域对 catalog 保持只读:Wiki 导入在 catalog 侧运行(`rxlabCatalog.importCollected`),本包不写 `rxlab_catalog`。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本模块不需要浏览器,也不需要平台账号:无需安装任何东西,只需尊重人工自己的数据。`pnpm --filter @deepseek-ai/dsh-rxlab-collect run bundle` 重建 Host、tools 与 Client bundle;`rxlab_collect` 域在部署的存储后端所服务的位置打开(`rxlab-app` 把它路由到 workspace 存储根)。

</details>
