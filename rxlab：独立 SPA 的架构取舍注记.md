# rxlab：独立 SPA 与 Cordis 客户端栈的架构取舍

> 状态：决策注记（2026-09-05，分支 qoder/rxlab，与「rxlab：与 web 平行的全新 agent profile + 独立 Web 客户端.md」并列）。
> 回答一个问题：rxlab 的 SPA「不走 Cordis 客户端栈、经 /api 访问 host」，是不是破坏了 deepseek-harness「一切皆插件、可配置替换」的框架原则？

## 结论

没有破坏 host 平面的插件模型；被替换的是「UI 也作为 Cordis 客户端插件」这一层，属有意取舍，代价（UI 模块不再配置级可换）需要显式记账。

## 把问题拆成两层看

deepseek-harness 里 Cordis 的「插件贡献服务 / 类型化事件 / 可逆副作用 / 可配置替换」精确作用在 **host 平面**：模型适配器、工具注册表、会话持久化、agent loop、认证与传输，全部是 host Context 上的插件，由 profile 的 patch 层（cordis.yml）决定装哪些、怎么配。rxlab profile 没有改这条：`dsh-base` + `dsh-rxlab-app` 的 patch 行照常组合，`webserver`、`connection`（/api 网关 + 浏览器 cookie 认证）、`frontend-static`（SPA fallback 席位）本身也都是插件。

被删掉的是 **浏览器客户端 roster**（`cordis.patch.yml` 里 `dsh.client` 的 ui-*、cordis-client-runner、modules 等行）。原来 web profile 的 UI 是「浏览器里再跑一个 Cordis Context」，UI 组件以客户端插件形式贡献到 `window.__DSH_BOOT__`，由部署配置决定。rxlab 不跑这套，UI 换成独立 React 应用（apps/rxlab-web），模块通过应用内注册表（`src/modules/registry.tsx`）挂载。

「经 /api 访问 host」对 rxlab 的 agent 会话目前是**规划中**而非已完成：SPA 现阶段不调 /api，但 `connection` 行已保留 /api 网关与 cookie 认证，是现成的平台面。

## 没有破的部分

- host 插件树不变：base 的 agent-loop/工具/会话等与 rxlab-app 新增行全部按原机制组合、可配置替换。
- 传输面由插件提供：webserver 路由、frontend-static fallback、connection 的 /api 信封 + 浏览器认证都是 host 插件；未来加会话通道不需要改框架。
- 有先例：TypeScript / Python SDK 本来就是非 Cordis 消费者，通过 JSON-RPC 使用 host；「产品界面 = host 的普通消费者」不是新发明。
- web profile 完全不受影响，仍是 Cordis 客户端栈的参考实现。

## 破掉的约定与代价

- UI 模块失去配置级可替换性：原来 roster 决定装哪些 UI 插件，现在注册表是代码（id → lazy Panel），部署无法只靠配置裁剪模块。
- UI 与 host 之间不再共享 Cordis 客户端的类型化事件/副作用生命周期，事件渲染、状态同步要由 SPA 自己接（会话接入时是主要工作量）。
- /api 契约需要维护：若不消费 host 侧已有的 Typert/remotes 生成客户端（session/settings/workspace 控制器），而自造一套 RPC，会造成双份协议。

## 缓解与后续

- 把模块注册表演进为 manifest/数据驱动（菜单项与懒加载路径来自配置或构建清单），保留"轻量 slot + 部署可裁剪"语义，不必回到完整 Cordis 客户端 runtime。
- agent 会话的 wire client 优先复用 Typert/remotes 生成的类型化客户端与现有 /api 信封，不自造协议。
- 会话控制器等 host 行当前从 rxlab patch 移除了（保持最小面），会话模块接入时按需加回对应行（它们都还存在于 base/remotes，属配置级恢复，不是重新发明）。
- 若未来出现「UI 必须配置级可换且与 host 强绑定」的需求，再评估完整 Cordis 客户端 runtime 或只复用其协议层，而不是推翻本取舍。
- 本取舍是产品决策：rxlab 要独立 shadcn 工作台（现成模板、独立演进），以 UI 不再插件化为代价；计划/实施引用本文件时应把它当决策记录，不要误述为 deepseek-harness 平台的既有机制。
