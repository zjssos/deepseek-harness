# Agent Note: rxlab 配镜指南工作台 SPA：六阶段导航与工单

Status: implemented

[English](2026-09-10-rxlab-guide-workbench-spa.md) | 中文

## 问题

rxlab 工作台 SPA（`apps/rxlab-web`）此前是扁平的模块栏：agent、collect、商品 Wiki、验光配镜，外加三个规划中的占位（`recommend` / `render` / `flow`）。配镜指南重规划把产品重构为以一等工单（工单）为核心、六个阶段为轴的形态（验光 / 选框 / 选片 / 加工 / 取镜 / 售后）。SPA 必须采用冻结的路由契约、驱动四个 Remote namespace（`rxlabJob`、`rxlabRecommend`、`rxlabContent` 与扩展的 `rxlabUsage.jobUsage`）、把旧的 fitting 与 wiki 面板并入新结构，并删除占位模块。全部改动限于 `apps/rxlab-web/**`；host 数据行与 bundle patch 归集成流所有。

## 决策

`ModuleDefinition` 增加 `group: 'stage' | 'tool'` 与可选 `stage: StageId`；`registry.tsx` 是唯一清单改动点，`app-sidebar.tsx` 按两组渲染（配镜流程：工单总览 + 六阶段；工具：内容管理 / 采集 / 会话 Agent / 设置）。路由为 `/jobs`、`/jobs/:jobId`、经 `?job=<id>` 绑定工单的 `/<stage>` 以及各工具路由；`App.tsx` 单独解析工单详情页，未知路径重定向到 `/jobs`。

共享的 `StageShell` 解析绑定的工单，并向每个阶段面板传入 `StageContext`（runtime、job、全部阶段行、当前阶段行、reload）；无 `?job` 时展示「先选/建工单」提示。每个阶段遵循同一四段式：投入 → 确定性校验（OK/WARN/FAIL）→ 决策 / 清单 / 话术 → 产出 artifact。验光面板复用 fitting 工作台（移至 `modules/exam/`），把 `ExamStageArtifact` 与由 derive issues 映射出的 `CompatibilityReport` 经 `upsertStage` 写入；选框与选片面板通过 exam 阶段的 `fittingRecordId` 重新推导目标（`Prescription` + `FittingRecommendation`），把 catalog 行映射为 recommend 候选，调用 `suggest` 与 `validateFrame` / `validateLens`，再写入阶段产出。加工 / 取镜 / 售后是通用的字段驱动壳，经 `upsertStage` 持久化。

工单总览列出并创建工单；详情页编辑消费画像 / 价格 / 状态，绑定单个 agent 会话（preset `guide`，cwd 为 `${workspaceRoot}/jobs/<id>`），调用 `generateGuide`，渲染 `GuideDocument`，导出独立 HTML 页面，并 join `remote.rxlabUsage.jobUsage` 得到 tokens 与按路由计价成本。内容管理面板提供参照库（复用原 wiki 面板的 catalog CRUD）与经 `rxlabContent` 的知识 / 话术 CRUD。删除 `recommend` / `render` / `flow`；`fitting` 更名为 `exam`；`wiki` 更名为 `content`；更新 collect 模块的导入路径。`Field` 原语经 `pnpm dlx shadcn@latest add field` 加入。

## 备选方案

**保留扁平模块栏，把工单 / 阶段作为更多模块加入。** 工作台契约冻结了分组栏：六个阶段为主、能力面为次侧栏工具；扁平列表无法表达工作流，也会让已删除的占位继续有意义。

**在一个 stepper 页内渲染全部阶段。** 契约固定了按 `?job` 绑定的逐阶段路由，使每个阶段可链接、可独立重载；单一 stepper 会耦合无关面板并丢失深链。

**把推导出的 `Prescription` 持久化进工单阶段。** 按契约，工单域只以 id 存跨域引用；选框与选片面板从 exam 阶段引用的 fitting 记录重新推导目标，使处方只有一个权威来源。

**直接把 fitting 面板当作选框 / 选片目标视图复用。** fitting 面板只渲染其结果；推荐需要类型化的 `Prescription` 与 `FittingRecommendation` 作为请求输入，因此由专门的 `useExamTarget` hook 重新推导并以有效目标为阶段闸门。

## 结果

SPA 现依赖 `@deepseek-ai/dsh-rxlab-job`、`-recommend`、`-content`（加入其 devDependencies 及锁文件行）；`rxlab-usage` 原已是依赖。确定性裁决只经 Host 引擎到达 UI——面板不新增规则逻辑、也不含 LLM 话术。指南 HTML 导出是客户端字符串拼装。未绑定工单的阶段不可写但仍会渲染。阶段 4–6 的清单是 SPA 内的静态声明。bundle patch、tsconfig 聚合与 API README 仍归集成流。

## 测试

在 `pnpm run build:lib` 生成工作区类型声明后，`pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck` 与 `... build` 在源码树上全绿。清单可解析全部十一个模块，路由覆盖 `/jobs`、`/jobs/:jobId`、六个阶段与各工具，应用可编译四个新 Remote namespace。未做浏览器冒烟：环境没有 `DEEPSEEK_API_KEY`，也没有运行中的 `dsh rxlab` host，因此端到端的阶段写入、指南导出与用量 join 未在浏览器中验证。

## 延期

加工 / 取镜 / 售后 的清单为静态，等待 M2 的内容驱动里程碑。面板按需刷新列表而非订阅 `domain/changed`。本 PR 的产品可见 GUI 改动仍需从真实服务器与模型流程录制浏览器 GIF。
