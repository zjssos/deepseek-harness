---
description: "rxlab 配镜指南工作台的工单：rxlab_job 存储域（jobs / stages / guides）、确定性指南组装器、模型可见工单工具，以及自带 Client 装配的类型化 rxlabJob Remote。"
kind: "package-reference"
---
# rxlab Job

[English](README.md) | 中文

## 概要

`@deepseek-ai/dsh-rxlab-job` 拥有 rxlab 配镜指南工作台的工单。Host 侧它提供 `ctx.jobController` 服务和生成的 `ctx.remote.rxlabJob` namespace；该 namespace 读写 `rxlab_job` 存储域（version 1、per-record 布局）中的每个消费者一个工单、六个阶段性行与组装后的指南。`generateGuide` 把已存阶段产物与注入的内容域话术映射折叠为结构化 `GuideDocument`，不调用模型。本包还提供模型可见的 `job_read` / `job_write_stage` / `guide_generate` 工具，以及一个 `dsh.client` 行，其 `/client` bundle 自行 mount 该 namespace，因此 rxlab SPA 恰好在组合 rxlab 业务数据处启动工单。本包刻意不加入平台 `api-remotes` 装配：工单是 rxlab 业务数据，不是通用 Host 能力。

## 目录

- [工单模型](#the-work-order-model)
- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="the-work-order-model"></a>
## 工单模型

一个工单承载消费者画像、生命周期状态、跟踪的阶段集合、绑定的 agent 会话与对客 `pricing`。六个阶段——`exam`、`frame`、`lens`、`fabrication`、`pickup`、`aftercare`——各占一行，键为 `${jobId}:${stage}`，持有该阶段的 `inputs`（投入）与 `outputs`（产出）作为不透明 JSON，外加可选的确定性 `checks` 报告（`overall` 为 OK/WARN/FAIL，含具名发现）。指南行持有一个 `GuideDocument`：每个被跟踪阶段一章，含 `params`、`strategy`、`checklist`、`scripts` 与该阶段的 `checks`。

`createJob` 铸造 id、时间戳与默认跟踪阶段集合。`upsertStage` 在 wire 边界校验，并把缺失行初始化为 `pending`、空 JSON 载荷。`generateGuide` 对已存阶段行运行纯组装器并持久化结果；在内容域合入前它不传注入话术，因此章节只携带产物与默认标题。

<a id="use-this-package"></a>
## 使用本包

rxlab profile 组合一个数据行 `rxlab-job`（`@deepseek-ai/dsh-rxlab-job`），随附的 `guide` agent preset 挂载本包的 `./tools` 行。Host Loader 激活 `JobController` 服务：它通过 `ctx.storageDomain` 打开 `rxlab_job` 域并保持到生命周期结束，同时向 Typert Gateway 注册 `rxlabJob` namespace。SPA 的 headless client boot 会激活本包自身的 `/client` bundle（由 modules node half 在 `/plugins` 下提供），其 `apply` mount 生成的 Remote contribution，于是浏览器内 `remote.rxlabJob.listJobs/getJob/createJob/updateJob/bindSession/upsertStage/generateGuide/deleteJob` 即可调用。

`deleteJob` 连同工单拥有的每个阶段行与指南一起删除。`getJob` 对缺失 id 抛 `job/not-found`；`upsertStage`、`updateJob`、`bindSession`、`generateGuide` 以同样方式失败，因此阶段或指南绝不会比工单存活更久。

Wire 与持久类型在 `./types`（浏览器安全 JSON，无运行时代码）；zod schema 在 Host-only 的 `src/domain.ts`；纯指南组装器在 `src/guide.ts`；模型可见工具在 `./tools`。

<a id="model-experience"></a>
## 模型体验

`guide` preset 挂载三个工具。`job_read` 列出工单，或打开一个工单及其阶段与指南。`job_write_stage` 创建或更新一个阶段行；其必需的 `stage` 参数是后续把会话轮次归到阶段的锚点。`guide_generate` 组装并返回指南章节。三者让模型把工单推进过六个阶段并产出消费指南。

preset 的 persona 承载工作流文本；工具自身描述保持任务范围。本包不新增 session 事件类型：一轮所属的阶段可由持久化的 `tool/call` 参数推导。

#### KV Cache 影响

`job_read` 并发安全且只读；写工具变更持久工单状态，不改动任何已组装的 prompt。工具目录及其描述在 preset 挂载时固定，因此重复的工单读写不会改变已缓存的请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 内容域尚未接通：`assembleGuide` 接受按阶段注入的 `strategy` / `checklist` / `scripts`，而 `generateGuide` 传空映射，因此指南章节当前只携带产物、默认标题与校验。
- 确定性 recommend 校验（引擎在 `rxlab-recommend`）尚未写入 `stage.checks`；阶段携带调用方写入的内容。
- SPA 的工单与指南视图属 WS-5；本包交付 Host 与 Client 数据层及工具，不含面板。
- 尚无 REAL-composition 控制器启动测试：当前由接 storage-domain 的控制器 spec 与纯 domain/组装器 spec 承担包内覆盖。
- `oldRx` 是紧凑自持 JSON 映射；未建模从 fitting 域处方 schema 的迁移。

<a id="dev-note"></a>
## 开发备注

无。
