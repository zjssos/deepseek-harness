# Agent Note: 内嵌 headless 客户端运行时之上的 rxlab 会话 Agent 工作台

Status: implemented

[English](2026-09-05-rxlab-agent-session-workbench.md) | 中文

## 问题

rxlab（`dsh rxlab` 配镜工作台 profile）需要在其独立 SPA（`apps/rxlab-web`）中提供一个可用的会话 Agent 模块。SPA 不运行 Cordis 浏览器 UI roster，因此官方 Web 会话组件（`ui-renderer` 插槽、`ui-conversation`）不可用；模块必须直接基于对象层的裸可观察源渲染会话，而不能重造插槽机制；并且当 host 没有 API key 时仍须可用（发送必须可见地失败，而不是让面板崩溃）。

## 决策

会话 Agent 模块用 `useSyncExternalStore` 直接绑定对象层，并对会话事件窗做行式投影渲染。`packages/client/*` 拥有「引擎产物是裸可观察源，hook 合成是渲染器唯一的桥」这一模式——rxlab-web 自己充当渲染器，因此 `apps/rxlab-web/src/modules/agent/use-sessions.ts`（以及 `use-session-view.ts`）在内嵌运行时之上合成了三个常驻 hook：

- `useSessionList` / `useConnected` 订阅 `sessions.list` 与 `connection.generation`。
- `useSessionView(runtime, list)` 同步解析当前舞台会话的 binding（`sessions.binding(current)`；对象层为每个舞台会话缓存一个 scope，并把解析视为 render-safe），并订阅会话快照与 binding 的事件窗。

每个 uSES 调用点都是无条件调用：源缺失时传入稳定的空订阅加常量快照，因此跨启动/切换的 hook 顺序保持不变。条件式 uSES（源尚缺失时提前 return、不调用 uSES）会在源出现、hook 数量增加时抛出 `Invalid hook call`——这正是本模块首次渲染被卡住的故障。

`transcript.ts` 把事件窗折叠为行：`user/message` 与 `assistant/message` 文本（含可折叠的推理），以及由 `tool/call` → `tool/result` 事件按 call id 配对的工具卡。实时 `assistant/live-chunk` 瞬态、turn/step 边界、attempt 与 header 不进入行；生命周期状态（运行中、队列数、打开状态、最近一次 agent 错误、提示错误）改由会话快照渲染；`tool/result` 卡携带结果文本或 `{name, code}` 错误。结果迟迟未到的工具调用在快照报告运行中时保持为「运行中」卡。

输入区通过会话面的 `beginSubmission` + `prompt` 队列路径发送，运行中按钮从 `snapshot.running` 经 `face.cancel()` 变为停止，并在 `snapshot.queue` 列出排队项。模型选择每次连接加载一次 Host 代目录（`remote.session.modelCatalog`），经 `remote.session.selectModel` 提交；当前值在成功选择前为目录默认值。无 API key 发送会走正常 remote 错误路径，渲染为 agent 错误条和/或提示错误行——面板保持可用。

模块注册表条目升级为 `status: 'active'`，scope 文案描述已交付的工作台。

## 备选方案

**复用官方 Web 会话机制。** 生产会话折叠（`ui-conversation` ConversationNodes）与 uSES 桥（`ui-renderer` 的 `bindSnapshotSelector`）是为插槽 roster 及其四份 props 组件构建的。把它们拉进 rxlab-web 会把 roster 加载契约及其 locale/插槽图拖进一个非 roster 应用；行式投影只有其十分之一的代码，且当前工作台所需能力一样不缺。

**用 `use-sync-external-store/with-selector` 按切片相等订阅。** 官方桥使用 selector hook；会话快照与事件窗很小且作为整体事实变化，因此整体快照绑定加稳定的空源回退更简单，且满足 uSES 契约。

**折叠完整会话树（turn/step 分组、assistant 归属的工具调用）。** 事件面已经把每个 `tool/call` 与其 `tool/result` 配对；只把这对事件折叠为顺序卡片，而不渲染持久化 `assistant/message` 中的 tool-call 块，可避免同一调用被渲染两次，同时保持线上产生的顺序。

**把实时瞬态块渲染为流式文本。** assistant 流可以增量出现。发送是队列准入，持久结算以一条 `assistant/message` 落定；「运行中」徽标加结算回复是最小可用呈现，等流式真正重要时再做。

**用会话持久模型选择投影做触发器标签。** 投影（`next`/`lastUsed`）可用，但渲染它需要投影存储座位；显示目录默认值再显示最近一次本地成功选择，让输入区自包含。

## 后果

rxlab SPA 现在能在浏览器中跑真实 host 会话：列表/新建/打开/重命名、排队发送、停止、模型目录选择，以及带工具卡的会话记录，且无 key 发送不崩溃。模块保持独立于客户端 roster，因此在对象层未变时不会因 `packages/client` 插槽契约变更而回归。流式（实时块）、附件上传、队列编辑/steer、持久模型投影展示留待后续；会话仅由持久事件渲染，客户端本地 pending 回显目前只以队列计数呈现。

## 测试

`dsh rxlab` 上的浏览器冒烟验证「已连接」徽标、持久化列表、新建/打开/重命名、目录支撑的模型选择，以及无 key 发送失败进入错误条而不崩溃。`apps/rxlab-web` typecheck 与 Vite 构建通过；host 构建（`pnpm run build:lib:host`）在本工作之外无改动（早前的 modules 行补丁已在 rxlab profile 工作中验证）。
