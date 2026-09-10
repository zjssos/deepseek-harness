# 配镜指南工作台 —— rxlab 架构重规划

> 状态：规划 · 2026-09-10

本文把《配镜指南》设计（原稿针对独立原型 `glasses-packing-workbench`），重规划到 rxlab 的实际接缝：一等工单域、六阶段工作台主轴、复用现有能力包并补确定性内核。原型中 `src/optometrist`/`src/recommender`/`JobState`/`result.html` 的职责改由 rxlab 的包、存储域、类型化 Remote 与 SPA 面板承担。实施按 [工作流拆分与冻结契约](2026-09-10-guide-workbench-contracts.md) 并行推进。

## 产品判断（保留）

指南的价值来自程度与立场而非"有没有能力"；必须达到 L2——校验别人给的方案、给出线上线下动作清单。确定性规则校验走代码，LLM 只做语义与话术，工作台不推荐店铺与具体商品、不做医疗诊断。这些定位不因落地代码库改变而改变。

## 分层映射

| 设计层 | rxlab 落点 |
| --- | --- |
| 工作台（用户驱动） | SPA `apps/rxlab-web`：工单 + 六阶段导航 + 阶段面板 |
| 执行单元·确定性 | 纯引擎包：`rxlab-fitting`（复用）、`rxlab-recommend`（新） |
| 执行单元·模块 agent | 工单会话中的阶段工具（单会话、工具触发），不是按阶段建会话 |
| 消费统计 | 扩展 `rxlab-usage`：按轮次归集到 job/阶段，含路由计价成本 |
| 内容管理基建 | 参照库=`rxlab_catalog`；规则=settings 命名空间；知识/话术=`rxlab-content`（新域） |
| 存储 | `rxlab_job`（job/stages/guide）+ 各能力域 |

## 数据与产物

`rxlab_job` 是唯一新增的编排域，per-record，含 `jobs`/`stages`/`guides` 三表：job 持消费者画像、状态、所属会话与对客 `pricing`；每个阶段一行，持该阶段的投入 `inputs`、产出 `outputs` 与确定性 `checks`；指南在阶段完成后由确定性组装器生成并存 `guides`。跨域引用（验光记录、参照库条目）只存 id，不复制其他域的 schema。

《配镜指南》是结构化 `GuideDocument`（六章：参数 / 策略 / 清单 / 话术 / 校验结果），由确定性组装器从阶段产出与内容域话术拼装，在工单面板渲染并支持导出 HTML；不引入静态 `result.html` 机制。

**成本归属**：`rxlab_job` 只存 `pricing`；tokens 与 cost 单一归属 `rxlab-usage`，面板 join 二者，避免同一事实两处存。

## 导航与阶段面板

主侧栏 = `工单总览` + 六阶段（`验光 / 选框 / 选片 / 加工 / 取镜 / 售后`）。能力面降为次侧栏工具：`内容管理`（参照库 / 知识 / 话术 / 规则）、`采集`、`会话 Agent`、`设置`。阶段路由 `/<stageId>`，通过 `?job=<id>` 绑定当前工单，不共用一个大 stepper；`/jobs/:jobId` 是工单详情与指南页。

每个阶段面板遵循同一模式：`投入（人工录入 / 参照库 / 上一阶段产出） → 确定性校验（OK/WARN/FAIL） → 决策 / 清单 / 话术 → 产出 artifact`。既有 `fitting` 数据录入成为阶段①的确定性工具视图；`wiki` 即内容管理里的参照库；`collect` 移入次侧栏；原 `recommend`/`render`/`flow` 占位由阶段面板与工单页取代，效果图留 M3。

## 确定性与 agent

确定性判断一律走 host 纯引擎，面板可直接调用零成本的 Remote：`rxlab-fitting` 的 `derive` 提供处方与建议目标；新增 `rxlab-recommend` 提供任意候选框/片的适配校验与候选匹配（消费 fitting 的 `Prescription` 与建议，不重复推导）。agent 只承担语义与话术。

一个工单对应一个 agent 会话（cwd 指向工单目录），阶段语义任务通过阶段工具触发；工具参数携带阶段，因此阶段归属依据是持久且模型可见的 `tool/call` 事件，无需新增 session 事件类型。计量由 `rxlab-usage` 读取会话持久日志，用 `deriveTurnTokenUsage` 得到每轮精确用量与 provider/model 路由，按最近的阶段工具调用把轮次归到阶段，乘 `token-meter` 的路由计价得到成本。

## 内容管理

参照库复用 `rxlab_catalog`（人工小样本、字段完整优先、`source=manual`）。规则（折射率阶梯、尺寸带、校验阈值）注册为 settings 命名空间，设置模块以 schema 表单编辑，不写死常量。知识词条与话术模板新增 `rxlab-content` 域，由内容管理面板 CRUD，条目按阶段打标签。

## 里程碑

M1：`rxlab_job` 域 + 六阶段导航框架 + 阶段①–③端到端（fitting + recommend + 指南组装渲染）+ 基础计量/成本 + 内容落位；阶段④–⑥为阶段壳。M2：阶段④–⑥清单化内容与配镜档案。M3：效果图 / 试戴（独立排期）。

## 与现状的复用与迁移

保留 `rxlab-fitting`、`rxlab-catalog`、`rxlab-collect`、`rxlab-usage`、agent 会话栈、workspace baseline 与设置中枢。改造 SPA `registry.tsx` 主轴为阶段、移除被取代的占位；`rxlab-usage` 增加 job/阶段维度。涉及 `packages/` 的实现流各自补标准 Agent Note。
