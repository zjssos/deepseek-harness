# Agent Note: rxlab 采集改为人工录入台账,智能体只做分析

Status: implemented

[English](2026-09-11-rxlab-collect-hand-entry-ledger.md) | 中文

## Problem

采集模块原本以**抓取**为中心:确定性 headless chromium 采集器把商品页的标题、价格、变体、购买链接与规格表抓进 `rxlab_collect` 域,后续里程碑又加了一套 browser-use agent,用持久化登录态浏览页面去发现店铺与商品链接。人工录入只是喂给这条流水线的前门,面板主 tab 是一张勾选成批次的链接表。

持续使用把这件事反了过来:**人**才是事实来源。采集器恰好在这种数据最要紧的地方被挡或退化 —— 本部署所在的机房出口 IP 会被 JD 返回风控页,价格只是尽力而为,图廊图片从未抓到 —— 而店铺、标题、规格恰恰是人知道或能粘贴的东西。模块需要的不是更好的采集器,而是一本按工作方式组织的台账:平台 → 店铺 → 商品,由人工填写,agent 帮着读材料,而不是取代人成为入口。

## Decision

把 `@deepseek-ai/dsh-rxlab-collect` 重新定位为人工录入台账,并整体移除自动抓取这条线。

- **域 version 3。** 三张表:`shops`(平台、名称、可选的平台侧标识、主页、备注)、`links`(挂在店铺下的商品条目)、`drafts`(待确认的助手草稿)。退役的 `captures` 与 `batches` 不再声明。`compatibleVersions` 列出 1 与 2,因为当前 link schema 仍接受它们的存量记录:本版本删掉的字段都不在 schema 里,旧记录因此在校验时保留身份、平台、url 与标题,而采集相关的簿记键自然脱落。
- **link 记录承载人工填写的字段。** `shopRef` 指向已登记店铺;`title`、`price`、`selectedSku`、`params`、`mainImageUrl`、`buyUrl`、`note` 是录入字段。遗留的 `shopId`(平台侧店铺 id)与 `shopName`(店铺文本)保留声明且可读,UI 显示 `title ?? titleAtAdd`;controller 保留它读到的原值,因此重存一条旧条目不会破坏它,但不再写入这些字段。
- **controller 的 RPC 面就是 店铺、条目、草稿。** `listShops`/`getShop`/`upsertShop`/`removeShop`,加 `listLinks`/`getLink`/`upsertLink`/`removeLink`/`importLinks`,加 `listDrafts`/`commitDraft`/`rejectDraft`。`removeShop` 从不删除商品数据:它把该店铺的条目转为未归类并回报条数。`upsertLink` 保留 平台 + 规范化 URL 合并,因此同一商品录两次是更新同一行。
- **草稿是 agent 通向数据的唯一路径。** `commitDraft` 与 `rejectDraft` 对已结算的草稿以 `collect/draft-not-pending` 拒绝;被接受的商品草稿可由人工指定归属店铺,覆盖草稿自带的值。
- **自动这条线是删除,不是停用。** `src/executor/`(JD 与淘宝采集器)、`src/browse/`(浏览器会话、登录流程、快照渲染)、`src/browser.ts`、`src/browser-launch.ts`、`browser_*` 与 `collect_discover_submit` 工具、`browserStatus`/`browserLaunch`/`browserStop` 三个 RPC、collect 的 CDP 设置描述符,以及 `rxlab-collect-browser`/`rxlab-collect-browser-launch` 两个 composition 行,全部移除。`playwright` 依赖、`./browser` 与 `./browser-launch` export、`setup:browsers` 脚本与两个 tsdown entry 一并移除。录入路径仍需要的解析助手(`platformFromUrl`、JD/淘宝 url 规范化、CSV 读取、`readableError`)迁到 `src/parse.ts`。
- **agent 只分析并提议。** `@deepseek-ai/dsh-rxlab-collect/tools` 现在注册 `collect_draft_submit`、`collect_list_shops`、`collect_list_links`,并在一个说明草稿契约的 `tool:collect` 提示分区下。内置 `collect` preset 保留 `tool-web`、`tool-ask-user`、`tool-todo`,其 persona 要求 agent 读取人工交给它的材料、提议前先查台账、只记录材料支持的字段,并明确它**无法写台账**。`ctx.systemPrompt` 的 section order `TOOL_BROWSER` 改名为 `TOOL_COLLECT`:它唯一的消费者就是本包的工具行,名字随用途走。

## Alternatives considered

**保留采集器,在其上加店铺维度。** 按用户明确指示否决:一切字段由人工填写,而这次变更要移除的正是自动这条路。保留它同时也保留了浏览器行、Playwright 依赖与风控失效模式。

**只在 SPA 里按 `platform + shopName` 分组,不建店铺实体。** 否决:店铺需要自己的记录 —— 主页、平台侧标识、备注 —— 且台账必须能在任何商品挂上去之前先持有店铺。纯前端分组表达不了这一点,"按店铺采集"会退化成"勾选文本匹配的链接"。

**新增 `shopRef` 同时保留旧 `shopId`,不升版本。** 不可行:新增一张表就改变了声明的 spec,version 2 的存储介质会在 open 时被拒绝。升版本 + `compatibleVersions` 正是域层为这种情况提供的机制。

**把旧 `shopId` 直接改指向店铺实体,而不是新增字段。** 否决:存的值是平台侧店铺 id,schema 会接受这次改写而数据指向错误的店铺。静默的数据损坏比多一个冗余字段更糟。

**让 agent 直接写条目,UI 提供撤销。** 按用户明确指示否决:由人工逐条确认。未被确认的草稿不改变任何东西,这正是让 agent 可以安全面对杂乱粘贴材料的性质。

**保留 `captures` 作为人工编辑的审计轨迹。** 否决:用户选择连两张表一起退役,而没有人读的编辑历史表正是这次变更要清掉的负担。

## Consequences

模块现在不需要浏览器、不需要平台账号、也不需要模型 key:即使某个部署从不组装 `collect` preset,台账照样可用。台账里存的就是人工或已确认草稿放进去的东西,因此其质量取决于输入,而不是某个页面的 DOM。存量的 `captures` 与 `batches` document 仍留在介质上且不再被读取 —— 面板不再有采集历史,也没有迁移。被移除的能力不是休眠状态:恢复采集器或浏览器发现等于重写,而记录它们的两个 Agent Note 作为历史归档保留,不再是当前权威。

catalog 侧失去了采集血缘:`CatalogImportRequest.source` 不再带 `captureId` 与 `capturedAt`,导入改为自己盖时间戳给 source 与价格读数。已导入的记录保留其存储的 source 字段;catalog 域 schema 未变,因此无需升版本。

## Testing

`tests/controller.host.spec.ts`(新增)钉住的正是这次重定位依赖的流程:店铺登记、按 id 替换、按平台/查询列举;条目录入与 JD url 规范化;条目命名未登记店铺时被拒绝;删除店铺释放其条目;CSV 导入到指定店铺并返回逐行拒绝;草稿以 `pending` 入库且不触碰店铺表;格式错误的提交被拒绝且不写草稿;确认写入店铺一次并拒绝二次确认;被接受的商品草稿归到人工选定的店铺;拒绝不写入任何东西。`tests/parse.spec.ts` 改为指向 `src/parse.ts`,删掉采集器专属用例(`cleanJdTitle`、`cleanTaobaoTitle`、移动端 url 构造),保留 url、CSV 与平台覆盖。`tests/tools-format.spec.ts` 改为覆盖 `parsePriceText`、`describeDraftPayload`、`formatDraftSubmit`、`formatShopList`、`formatLinkList`。`packages/api/rxlab-catalog/tests/catalog-controller.host.spec.ts` 去掉被移除的 source 字段,并把价格读数改为按值断言,而不是断言调用方传入的时刻。

覆盖率缺口记录在包 README:工具 handler 的参数校验与 SPA 面板尚无 spec。
