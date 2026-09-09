---
description: "rxlab 商品采集:rxlab_collect 存储域(链接资产、采集记录、运行批次)、类型化 rxlabCollect Remote、自挂载 Client 贡献、确定性 L1 JD 采集器,以及 agent 浏览(browser-use)界面与采集 agent preset。"
kind: "package-reference"
---
# rxlab 采集(rxlab Collect)

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-rxlab-collect` 拥有 rxlab 商品采集数据。Host 侧提供 `ctx.collectController` 服务与生成式 `ctx.remote.rxlabCollect` 命名空间,读写 `rxlab_collect` 存储域(version 2,per-record;version 1 的 capture 记录仍可读),含三张表 —— `links`(平台/店铺/商品链接资产)、`captures`(每次成功抓取一条记录)与 `batches`(串行运行状态,逐链接条目)。抓取由确定性 L1 采集器执行(v1 内置 JD 适配器,匿名 headless chromium),整条运行链路**零 token、无需模型 key**。本包同时拥有 agent 浏览(browser-use)界面:一个基于持久化登录 chromium 的 `CollectBrowserSession` 与模型侧 `browser_*`/`collect_discover_submit` 工具,随内置 `collect` agent preset 组装,使一个会话能通过浏览发现店铺与商品链接并直接入库 —— CSV 导入不再是链接资产的唯一入口。Client 侧该包是 `dsh.client` 行,其 `/client` bundle 自行挂载命名空间,使 rxlab SPA 在装配 rxlab-product 数据的位置装载采集器。本包刻意不加入平台 `api-remotes` 装配:采集器是 rxlab 产品数据,不是通用 Host 能力。raw 采集域是将来商品 Wiki 导入器的数据源;本包不写 `rxlab_catalog`。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

rxlab profile 组装一行 `rxlab-collect`(`@deepseek-ai/dsh-rxlab-collect`)。Host Loader 激活 `CollectController` 服务:在其生命周期内经 `ctx.storageDomain` 打开 `rxlab_collect` 域并在 Typert Gateway 注册 `rxlabCollect` 命名空间;执行器注册表把平台映射到确定性 `Collector`,controller 在服务生命周期内持有一个懒启动的 headless chromium。SPA 的 headless client 启动会激活本包自带的 `/client` bundle(modules 节点在 `/plugins` 下提供),其 `apply` 挂载生成式 Remote 贡献,于是 `remote.rxlabCollect.*` 在浏览器内可用。rxlab profile 同时组装 `agent-presets` 名单行,SPA 可在内置 `collect` preset 上创建会话(见下)。

**链接资产是入口**:单条 `upsertLink`,`importLinks`(CSV 文本;表头 `platform,url` + 可选 `shopId`/`shopName`/`sku`/`title`,逐行独立校验,拒绝行返回 UI),或 agent 的 `collect_discover_submit`(同样的逐条校验;平台缺失时由 host 从 url 推断)。共享 平台+规范化URL 的行会合并。`createBatch` 把所选链接 id 排成一个串行批次;批次在进程内逐条执行(1 s 礼貌间隔),每个条目**在提交点**一次性落盘 capture 行、link 状态/last-* 字段与 batch 条目/计数。`listLinks` 按平台/店铺/状态与不区分大小写查询过滤;`listBatches`/`getBatch` 暴露批次进度;`listCaptures` 返回某链接的采集历史(新→旧)。

**Agent 浏览(browser use)。** 另有两个插件行挂载 agent 界面:`@deepseek-ai/dsh-rxlab-collect/browser` 提供 `ctx.collectBrowser` —— 一个带两种启动模式的 `CollectBrowserSession`。`persistent`(默认)持有本包自己的 Playwright persistent context,其 user-data 目录(config `profileDir`,默认在 harness home 下)让平台登录态跨重启保留;`cdp` 通过 Chrome DevTools Protocol 连接一个已在运行的真实浏览器(config `cdpEndpoint`,默认 `http://127.0.0.1:9222`),复用其真实登录态与指纹。浏览器会话是 rxlab bundle 里与 `rxlab-collect` 同层的 HOST 行:一机一实例、一份登录 profile/浏览器,并发的采集会话共享它,而不是争抢 Playwright 的同目录进程锁。`@deepseek-ai/dsh-rxlab-collect/tools` 注册模型侧工具:`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_type`、`browser_scroll`、`browser_back`、`browser_login`、`collect_discover_submit` 与 `collect_list_links`。快照把页面渲染为可读文本加上有上限的可交互元素 ref(注入 `data-dsh-ref` 属性);每个操作都返回新快照。`browser_login` 在 persistent 模式切换为有头窗口、打开平台登录页,在等待期间(config `loginTimeoutMs`)由人工登录,然后恢复无头并校验登录态是否保留;在 cdp 模式则直接在真实浏览器里打开页面并轮询登录检测 —— 人工在那边登录,cookie 即凭证。内置 `collect` agent preset(`packages/preset/agent-presets/presets/collect/`)挂载工具行,与 `tool-web`、`tool-todo`、`tool-ask-user` 组装在一起,persona 承载发现工作流(计划、对照 `collect_list_links` 去重、浏览公开入口、分批提交发现、请求人工登录、汇报)。rxlab host 行默认使用自有的 persistent profile;`dsh rxlab --cdp` 把它切到 CDP 接管,且 CDP 只在浏览工具首次执行时才连接 —— 浏览器未开时快速失败并给出启动指引,不会阻碍 app 启动。

JD 采集器访问 canonical 移动页 `item.m.jd.com/product/<sku>`:读清洗后的标题与默认选中变体标签,触发页面「分享 → 复制链接」拿到分享购买链接,从桌面页读显示价格(失败时回退移动页自身价格文本),从 `og:image` meta 读主图,并把桌面页的规格参数表抓成 `params` 名值对(品牌/材质/尺寸/重量...)。价格连同原文与说明一起落盘(注明显示价可能是促销/会员价),因此定时重采可刷新它。这些 capture 字段正是商品 Wiki 导入(`rxlabCatalog.importCollected`)消费的数据源。

Wire 与持久类型在 `./types`(浏览器安全 JSON,无运行时代码);zod 在 Host 侧 `src/domain.ts`;纯解析/规范化助手在 `src/executor/parse.ts`,快照/回执的纯格式化在 `src/browse/snapshot.ts` + `src/tools.ts`(有单测,不触网)。

-----

<a id="model-experience"></a>
## 模型体验

### 采集工具（会话级）

#### 模型可见什么

组装在内置 `collect` preset 上的会话携带 `browser_*`、`collect_discover_submit`、`collect_list_links` 工具 schema 与一个 `tool:browser` 系统提示分区;确定性采集链路不注册任何模型可见的东西。仅挂载基础 `rxlab-collect` 行时不注册任何东西:没有 prompt、工具或会话事件,抓取无需模型 key。

#### Token 影响

组装在 `collect` preset 上的会话,其每次模型请求都携带挂载的工具 schema 与 `tool:browser` 分区;采集运行与变更不向模型请求增加任何内容。

#### KV Cache 影响

会话内稳定:工具 schema 与提示分区在会话组装时挂载一次,其前缀贡献与系统提示其余部分一样进入缓存;采集数据变更从不使其失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 图廊详情图 URL 未采集:JD 图廊懒渲染、无稳定 DOM URL,`detailImageUrls` 留空;`mainImageUrl` 是 `og:image` meta 的尽力读取。
- 结构化规格只来自桌面页参数表:匿名会话够不到客户端水合参数表的页面,只剩标题与变体文本作为规格信号。
- 价格为尽力而为:部分网络下 JD 会给匿名 headless 会话返回无价格文本的风控页,此时采集保留 标题/变体/购买链接 而省略价格字段;在暖机或登录态浏览器会话下重采可刷新。
- 确定性采集内置 JD(item.jd.com)与 淘宝/天猫(item/detail …item.htm)两款采集器,均匿名运行并在登录/风控页快速失败(某平台风控时可用另一平台继续)。Agent 发现仅覆盖 JD 登录:`browser_login` 内置一个流程(`jd`);其他平台只能浏览公开页面。登录为人工 —— persistent 模式在有头窗口里完成,cdp 模式在真实浏览器里完成 —— host 上所有会话共享一个 profile/浏览器,无多账号或凭据存储;persistent profile 目录清空即需重新登录。
- JD 风控会从机房出口 IP 拦截 `search.jd.com` 与桌面 `item.jd.com` 页(登录前后均"访问频繁"/403);agent preset 已教授绕行路径(`so.m.jd.com/chanpin/<关键词>` 聚合页与 `item.m.jd.com/product/<sku>` H5 页),这才是这类 IP 下可靠的公开页面。
- 定时重采(M2)未做;目前失败重试为手动(重跑该行/新批次)。
- 包仅有纯解析与格式化逻辑单测;Host controller、网络 executor 与浏览会话尚无 spec(合入 master 前需补齐以满足逐文件覆盖率门),且无 invariant companion(无独立可分歧观测)。
- raw 域对 catalog 保持只读:Wiki 导入在 catalog 侧运行(`rxlabCatalog.importCollected`),本包不写 `rxlab_catalog`。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

JD 采集器驱动匿名 headless chromium。首次运行需装浏览器:`pnpm --filter @deepseek-ai/dsh-rxlab-collect run setup:browsers`(或 `pnpm exec playwright install chromium`)。运行刻意低频(串行队列、1 s 间隔、仅公开页面);请遵守平台条款,勿批量滥用。

</details>
