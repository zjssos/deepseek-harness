# Agent Note: rxlab 工作台在壳层绑定单一工单

Status: implemented

[English](2026-09-11-rxlab-workbench-shell-bound-work-order.md) | 中文

## Problem

`apps/rxlab-web` 原先建在通用 dashboard 模板上：可折叠的模块侧栏、只显示模块名的顶栏、以及 `max-w-5xl` 居中的内容列。六个阶段各自拥有独立路由，并重复解析同一个 `?job=<id>` 工单；模块侧栏把 工单总览、六个阶段、各工具与 全局设置 平级摆放。工单才是实际的工作单元——一个消费者、一段分阶段流程、一个绑定的 agent 会话与一份组装的指南——但壳层没有让它成为作业面：操作员在每个阶段路由上都要重新绑定工单，跨阶段进度只在单个阶段内部可见，还要在互不相干的独立页面组成的侧栏里导航。

## Decision

工单是工单作业面的工作单元，且两个作业面彼此分离：`/jobs` 下的一切都围绕一条工单，而工具模块与工单完全无关。

**两个作业面，两套壳层。** `WorkbenchLayout`（`src/app/WorkbenchLayout.tsx`）按路径选择壳层。`/jobs` 下挂载 `WorkbenchJobProvider` 以及 `WorkOrderHeader` 与可收合的 `JobContextRail`；其他路径只挂载 `ModuleHeader`，不带任何工单相关的东西。只有工单路由携带绑定，因此工具模块读不到绑定。

**绑定。** `WorkbenchJobProvider`（`src/app/workbench-context.tsx`）拥有工单作业面的绑定：工作台打开时 `/jobs/<id>` 路径是权威值，作业面其他位置下绑定是上次打开的工单，由 `localStorage`（`rxlab:current-job`）跨刷新记忆。打开工单会把它写回存储，因此总览与阶段重定向都解析到操作员最近查看的工单。`?job=` 查询参数已移除——阶段视图不再是需要携带工单的路由。`rememberedJobId()` 被导出，供 provider 之外唯一的调用方（下述阶段重定向）使用。

**工单顶栏**（`src/components/work-order-header.tsx`）：面包屑——工作台内是 `工单总览 › <消费者>`，总览页是 `工单总览`——首段链回总览；另有工单选择器、「更多」菜单、右栏开关与主题开关。选择器在工作台路由打开时会导航，否则只更新绑定。

**工具顶栏**（`src/components/module-header.tsx`）：一个「工单总览」返回按钮、分隔符、模块名，以及「更多」菜单与主题开关。没有工单选择器、没有右栏、没有绑定。`MoreMenu`（`src/components/more-menu.tsx`）与 `ThemeToggle`（`src/components/theme-toggle.tsx`）由两套顶栏共用；`src/components/site-header.tsx` 已删除。

**工单工作台。** `/jobs/:jobId` 渲染工作台（`src/modules/jobs/JobDetail.tsx`）：共享的 `PanelHeader`（消费者、状态、价格、操作）在上方，下方是左侧视图列表——配镜流程（验光 / 选框 / 选片 / 加工 / 取镜 / 售后）与 工单（会话 / 配镜指南 / 用量与成本）——选中的视图渲染在右侧。选择项存放在 `?view=`，默认是流程中第一个未关闭的阶段。六个阶段面板在这个工作台内渲染；它们不是路由。

**阶段。** URL 中的阶段键（`/exam`、`/frame`……）不是路由：`ModuleWorkspace` 把它重定向到记忆工单的工作台视图，没有记忆时重定向到 `/jobs`。它通过 `rememberedJobId()` 读取绑定，因为它渲染在 provider 之外。`StageShell` 不再渲染自己的标题块或工单选择器——两者由工作台框架承担——现在只是把类型化的 `StageContext` 交给阶段面板的启动/加载边界。

**上下文。** 右侧栏只存在于工单作业面，展示绑定工单的身份、六阶段进度与跳转到下一个未处理阶段的入口。工作台不重复该展示：左侧视图列表是切换器，不携带状态标记（评审中由操作员选定这一分工）。总览页无需绑定，因此右栏改为说明列表本身，而不是提供一个指向当前页面的链接。

**清单与共享词汇。** `src/modules/registry.tsx` 把模块分为 `core`（工单总览）、`stage`（工作台内的六个阶段）与 `tool`（顶栏工具）；`stageModules()` 与 `toolModules()` 驱动工作台视图列表与「更多」菜单。`src/index.css` 中的密度令牌（`--header-height`、`--workbench-gutter`、`--workbench-panel-gap`、`--workbench-full-height`；oklch 色板，`--radius: 0.5rem`）、`PanelHeader`、`JOB_STATUS_LABELS`、`STAGE_STATUS_LABELS`、`StageStatusBadge` 与 `formatDateTime` 全部保留。`MODULE_GROUP_LABELS` 随侧栏一并删除，旧的 dashboard 区块壳层（`app-sidebar.tsx`）同样删除。

## Alternatives considered

**为什么不用一套壳层、在工具路由上隐藏工单控件？** 这正是本次替换掉的做法：单一壳层把所有路由包进 `WorkbenchJobProvider`，把工单选择器、绑定与右侧栏摆在 内容管理、采集、会话 Agent、全局设置 面前，而这些模块没有工单。隐藏控件仍然会在启动时列出工单，也仍然让工具模块依赖一个它永不使用的绑定。按路径选择壳层让分离成为结构性事实，而不是外观调整。

**为什么不为每个阶段保留独立路由？** 六个阶段编辑的是同一个工单，操作员因此必须在每个阶段路由上重新绑定，也无法一次看到完整流程；单个工单的推进被拆成独立路由，是信息架构的产物而非能力。把它们并入工单工作台，让每个阶段都离拥有它的工单只有一次点击（本决策取代了早先按阶段的 `?job=` 路由）。

**为什么用「更多」下拉而不是另一个页面或侧栏？** 工具与设置是偶发支撑，不是任一作业面的工作本身。顶栏菜单让工单作业面保持最大；为四个条目装一条侧栏等于把窗口的五分之一交给很少用的导航，单独做一个菜单页则让到达工具要多走一步。

**为什么工单作业面还要保留顶栏选择器？** 工单总览不需要绑定，但工作台需要，操作员在那里不必回到列表就能切换工单。选择器属于工单作业面自身的导航，而不属于壳层。

**为什么 `/jobs/<id>` 是权威而不是选择器状态？** 工作台不可能脱离它的工单存在；id 放进路径让刷新、深链与选择器保持一致，`localStorage` 只是总览页与阶段重定向的后备。

**为什么去掉 `?job=`？** 阶段不再是路由后，就没有第二个需要指名工单的界面了；id 要么在路径里，要么在记忆里。保留参数只会制造需要同步的第二个真相来源。

## Consequences

操作员落在 工单总览，打开一条工单，从同一个工作台完成阶段、会话、指南与用量，选择器与右栏显示同一条工单。工具模块可从任一顶栏进入，行为上是独立工具；它们携带的唯一工单入口就是「工单总览」按钮。

移除的界面：模块侧栏、单一共享壳层、六个独立阶段路由、`?job=` 路由与 dashboard 区块壳层。指向 `/exam` 等旧地址的书签现在落在记忆工单的工作台阶段视图（无记忆时落到 `/jobs`）。

代价与边界：工单作业面在挂载时获取工单列表（工具模块不再获取）；在两个作业面之间切换会重挂面板子树，因为壳层不同；工作台 URL 里的 id 不存在时显示失败卡片；`StageShell` 与阶段面板耦合工单 provider，无法独立挂载；右侧栏及其开关在 `lg` 以下隐藏。`ModuleAgentSurface`（嵌在采集的 tabs 内）保留自己的 `h-[calc(100svh-16rem)]`，因为那里的可用高度不是壳层的 `--workbench-full-height`。

验证为 `pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck` 与 `build`。本环境中无法针对运行中的 `dsh rxlab` 宿主做浏览器验证，该 app 也没有录制会话快照测试装置，因此两套壳层的视觉效果在此未经验证。