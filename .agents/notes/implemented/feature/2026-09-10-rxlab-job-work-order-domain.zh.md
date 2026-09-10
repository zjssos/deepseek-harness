# Agent Note: rxlab 工单域与确定性指南组装

Status: implemented

[English](2026-09-10-rxlab-job-work-order-domain.md) | 中文

## Problem

rxlab 配镜指南工作台需要一等工单：原型把 `JobState` 放在进程内并临时生成 `result.html`，因此工单无法跨重启存活、无法被 SPA 读取，也无法由工作台已计算的确定性阶段产物组装。重规划架构把 `rxlab_job` 定为唯一新增的编排域，含六阶段、类型化 Remote、确定性指南组装器与配套 agent preset。它还需要阶段锚点工具调用，供后续计量把一轮会话归到阶段。

## Decision

在 `packages/api/` 下交付新双面包 `@deepseek-ai/dsh-rxlab-job`，照 `@deepseek-ai/dsh-rxlab-fitting` 模板（相同的 Host/Client 拆分、`clientBundle(..., { hostPhase: true })`、`defineDomain`、`TypertRemoteService`、自挂载 `/client`，且不加入平台 `api-remotes` 装配）。

### 存储域

`rxlab_job` 为 version 1、`per-record`，含三表：

- `jobs`，键为 `JobId`：`{ id, consumer, status: draft|in-progress|complete|archived, stageIds: StageId[], sessionId?, pricing?, createdAt, updatedAt }`。
- `stages`，键为 `${jobId}:${stage}`：`{ id, jobId, stage, status: pending|in-progress|done|skipped, inputs: JsonValue, outputs: JsonValue, checks?: CompatibilityReport, updatedAt }`。
- `guides`，键为 `JobId`：`{ jobId, document: GuideDocument, generatedAt }`。

`ConsumerProfile` 携带问诊事实（`name`、`age`、`faceWidthMm`、`usage`、`budget`、`style`）与紧凑自持的 `oldRx` JSON 映射；它绝不引用 fitting 域的 schema。六个阶段的 `inputs`/`outputs` 类型对（`ExamStageInput`/`ExamStageArtifact` 等）从 `src/types.ts` 导出，作为工具与 SPA 共享的类型化词汇，而域把它们存为不透明 `JsonValue`，使阶段载荷无需 schema 变更即可演进。

### Remote 与指南组装

`JobController extends TypertRemoteService` 注册 `rxlabJob` namespace、注入 `storageDomain`，并暴露 `listJobs` / `getJob` / `createJob` / `updateJob` / `bindSession` / `upsertStage` / `generateGuide` / `deleteJob`。写在 wire 边界用域 zod schema 校验、Host 侧铸造 id 与时间戳，并排队到域写链；`getJob` 与每个针对工单的写操作在 id 缺失时抛 `job/not-found`。`deleteJob` 连同工单拥有的阶段行与指南一起删除。

`src/guide.ts` 是纯组装器：给定一个工单、其阶段行、可选的按阶段内容映射与组装时刻，它输出一个 `GuideDocument`，每个被跟踪阶段一章（规范顺序），由阶段产物推导 `params`，合并注入的 `strategy` / `checklist` / `scripts`，并复制该阶段的 `checks`。`generateGuide` 提供组装时刻，暂不传内容映射，因此本包在 `rxlab-content` 合入前即可工作；内容域后续再填该映射。

### 工具与 preset

`src/tools.ts` 是函数插件，注册 `job_read`、`job_write_stage`、`guide_generate`，注入 `tools` 与 `jobController`。`job_write_stage` 要求 `stage` 参数，是后续计量从持久化 `tool/call` 参数读取的锚点；不新增 session 事件类型。随附的 `guide` agent preset（`packages/preset/agent-presets/presets/guide/`）挂载本包的 `./tools` 行，以及 persona、ask-user、todo、web、skill 行。

## Alternatives considered

**复用 `rxlab_fitting` 记录作为工单存储。** 否决：fitting 建模验光的九个阶段，而非跨六个工作台阶段的编排，且指南需要 fitting 记录不携带的阶段产物与兼容校验。跨域事实只存 id。

**用 LLM 组装指南。** 否决：产品判断是确定性代码负责校验与结构、模型负责语义与话术；指南必须可复现且零成本重生成。组装器是纯函数。

**把 token 总量与成本存到工单上。** 否决：token 与成本只有一个归属者 `rxlab-usage`；工单只存对客 `pricing`，SPA join 二者而不是复制同一事实。

**每次阶段写入新增一种 session 事件。** 否决：阶段已可由持久化的工具调用参数推导，新事件只会重复已记录的数据。

## Consequences

工单现在持久且类型化：工单在 `$DSH_HOME/storages-rxlab/` 下跨重启存活，SPA 通过 `rxlabJob` 读取它，指南是可复现的 `GuideDocument` 而非静态导出。`guide` preset 给模型一组有界工单工具。代价：在 `rxlab-content` 接通前，指南的 strategy/checklist/script 分区在源头为空；在 `rxlab-recommend` 合入前，确定性阶段校验是调用方写入的内容。两处缺口都记在包 README。

## Testing

`tests/domain.spec.ts` 覆盖三个 zod schema、闭集阶段/状态词汇与域声明。`tests/guide.spec.ts` 覆盖章节顺序、产物到 params 的推导、内容合并、校验传递、`stageIds` 为空时的回退与确定性。`tests/controller.host.spec.ts` 在共享内存存储后端上启动控制器，覆盖创建/读取、更新、`bindSession`、阶段先建后改、规范阶段排序、指南组装与持久化、级联删除，以及 `job/not-found` 与 `gateway/bad-request` 失败。
