# Agent Note: rxlab 采集 agent 浏览(browser use)—— 发现能力取代 CSV 前置入口

Status: implemented

[English](2026-09-08-rxlab-collect-agent-browser-use.md) | 中文

## Problem

采集模块的链接资产入口此前只有手工录入或 CSV 导入,而 JD 的风控直接封锁匿名搜索/店铺发现 —— 于是"采集某店铺的链接"意味着人工浏览、复制 url、再贴回来。v1 注记把店铺发现(店铺扩展,需要登录态持久浏览器)列为 M2 项,并保持确定性 L1 线路零 token。用户随后要求用 harness 自己的 agent 补上这块:带登录态浏览平台页面、总结所见、直接入库店铺/商品链接,取代 CSV 前置。harness 的 `web/` 组刻意不拥有浏览能力(只有匿名 search/fetch),所以没有现成的 browser-use 组装可挂 —— 这个能力必须建在登录 profile 与链接资产域共存的 rxlab 侧。

## Decision

给 `@deepseek-ai/dsh-rxlab-collect` 增加 agent 浏览界面,以同包两个新插件行交付,由新的内置 agent preset 消费:

- `./browser`(`CollectBrowserSession`,服务 `ctx.collectBrowser`):一个带两种启动模式的浏览器会话。`persistent`(默认)持有 Playwright **persistent context**,user-data 目录(`profileDir`,默认 `$DSH_HOME/rxlab-browser`)让平台登录态跨进程重启保留;`cdp` 通过 Chrome DevTools Protocol 连接已在运行的真实浏览器(`cdpEndpoint`,默认 `http://127.0.0.1:9222`),复用其真实登录态与指纹。启动/重启在一条链上串行;释放等链路结算后再处理,且 CDP 的 teardown 只断连(从不关闭真实浏览器)。`login(url, check)` 在 persistent 模式切换有头窗口、打开入口页,在人工登录期间轮询平台登录检测(config `loginTimeoutMs`),然后恢复无头并复核检测仍通过;在 cdp 模式则在真实浏览器里打开页面并轮询检测 —— 登录态在真实会话上验证,而非假定。host 行的启动模式取自 rxlab startup flags,`dsh rxlab --cdp` 即以 cdp 模式运行;CDP 在首次浏览使用时才懒连接,endpoint 未就绪时快速失败并给出启动指引 —— 专用浏览器只需在 agent 真正浏览时开着。
- `./tools`(`rxlab-collect-tools`):模型侧 `browser_navigate` / `browser_snapshot` / `browser_click` / `browser_type` / `browser_scroll` / `browser_back` / `browser_login`,外加 `collect_discover_submit` 与 `collect_list_links`。快照渲染可读正文加上有上限的可交互元素 ref(注入 `data-dsh-ref` 属性);每个操作都返回新快照,click/type 按最近一次快照的元素范围校验 ref,失效时给出"重新 snapshot"的恢复错误,每次加载后保持礼貌间隔。`browser_login` 从 `browse/login.ts` 解析平台流程(v1 内置 `jd`);未知平台响亮失败。
- `CollectController.submitDiscovered`(Host 内部,不注册 Remote 方法):与 CSV 导入相同的逐条校验,平台缺失时由 url 推断,沿用 平台+规范化URL 合并。
- 内置 `collect` preset(`packages/preset/agent-presets/presets/collect/`)挂载工具行,与 `tool-web`(公开发现兜底)、`tool-todo`、`tool-ask-user` 组装,persona 承载工作流:计划 → 对照 `collect_list_links` 去重 → 浏览公开入口 → 分批提交 → 遇墙时请求人工登录 → 汇报新增/合并/拒绝。浏览器会话行本身放在 rxlab bundle 的 HOST 组装、与 `rxlab-collect` 同层 —— preset 提供的服务必须按 agent isolate,两个 agent 各自启动同一 user-data 目录会争抢 Playwright 的同目录进程锁;host 层所有带来一机一实例、一份登录 profile。
- rxlab profile 增加 `agent-presets` 名单行;会话创建的 client contract(`ISessions.create`)增加 `agentPreset` 选项,rxlab SPA 的新建选择器即可在其上组装会话。Playwright 仍是驱动层 —— 升级点在于确定性脚本变成持久登录会话上的模型驱动浏览工具,而不是换库。

## Alternatives considered

**通用 browser-use 能力缝(`packages/web/…`,Service Definition / Provider / Consumer 三角色)。** 本里程碑否决:唯一消费者是采集 agent,登录 profile 与发现写路径都是 rxlab 所有;通用缝会迫使我们公开没有第二个消费者可佐证的选择(登录模型、profile 布局、流程注册表)。这两行保持包内私有,后续可再晋升。

**从 `credentials` 自动登录(headless 账号密码)。** 否决:本业务的平台登录以扫码/验证码为主;自动化恰好在最关键处失效,并招致风控升级。有头人工窗口是诚实的流程。

**全局共用一个有头浏览器。** 否决:确定性采集器保留自己的匿名 headless chromium(零 token 抓取路径不变);持久登录会话独立存在,agent 浏览永远不会污染确定性运行链路的匿名假设。

## Consequences

组装在 `collect` preset 上的会话现在可以端到端地发现并入库链接:计划 → 浏览(搜索/店铺/分类页) → 分批提交到 `rxlab_collect` → 既有的确定性采集器照常运行。CSV 导入保留,SPA 在新建会话处获得 preset 选择器。这类会话的每次模型请求携带挂载的工具 schema 与 `tool:browser` 分区(KV 影响记录在包 README)。登录为人工,host 每机共享一个 profile;profile 被清空而非轮换。

## Testing

`tests/tools-format.spec.ts` 钉住纯模型侧格式化:快照布局与逐维度截断提示、提交回执(新增/合并/拒绝行、店名后缀)、链接列表渲染(含空态)。浏览器会话与工具 execute 未做单测(Playwright 耦合,沿用本包 executor 先例);组装路径经两个编译面的 `tsc` 工程构建验证,preset 由内置名单发现解析。浏览会话的覆盖欠账记录在包 README 的 Known Limitations。
