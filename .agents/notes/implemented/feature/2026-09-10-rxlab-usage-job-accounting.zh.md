# Agent Note: rxlab 用量工单与阶段记账

Status: implemented

[English](2026-09-10-rxlab-usage-job-accounting.md) | 中文

## Problem

配镜指南工作台重规划让一个 `rxlab_job` 工单对应一个 agent 会话，并通过参数携带阶段的 `job_write_stage` 工具触发各阶段工作。`rxlab-usage` v1 只从实时 `tokenUsage` 投影按会话与模块记账，因此无法回答一个工单或其某个阶段花了多少；工单决策记录也明确把 token 与成本归属 `rxlab-usage` 而非工单域。规划冻结了接口：`rxlab_usage` v2 含 `jobs` 与 `stageUsage` 两表，以及返回工单级与阶段级 `UsageTotals` 加可选路由计价 `cost` 的 `jobUsage({ jobId })` RPC。harness 没有货币价目表——`llm-pi-ai` 刻意不读 pi-ai 的成本元数据，也没有消费者报告花费——因此成本来源必须选定，而非查表获得。

## Decision

`@deepseek-ai/dsh-rxlab-usage` 交付 `rxlab_usage` version 2，`compatibleVersions: [1]`。version-1 的 `sessions` 与 `modules` 表保持完全相同形状，因此已存 version-1 记录经受兼容标记继续可读；新版本新增 `jobs`（每个工单一行归集总量，键 `jobId`）与 `stage_usage`（键 `${jobId}:${stage}`）。阶段表名为 `stage_usage` 而非冻结的 `stageUsage`，因为 `defineDomain` 只接受小写 snake_case 表名；`jobUsage` 的 wire 词汇不受影响。`rxlabUsage` namespace 新增 `jobUsage({ jobId })`，返回工单总量、可选成本与币种，以及收到用量的阶段。

### 轮次到阶段的归集

`src/attribution.ts` 是对持久会话事件的纯函数。它把日志切成完整轮次窗口（每个 `turn/start` 到匹配的 `turn/end`），对每个窗口调用 token-meter 的 `deriveTurnTokenUsage`——从 `@deepseek-ai/dsh-token-meter/client` 导入——取精确 provider 桶与 provider/model 路由。它跟踪最近的 `job_write_stage` 工具调用；一轮归到该轮结束时的当前阶段，因此写入某阶段的那一轮属于该阶段，其后轮次保持在该阶段直到写入新阶段。用量无法证实的一轮不计入任何量，但仍推进阶段锚点。任何阶段调用之前的轮次与从未写入的阶段不进阶段列表，但计入工单总量。阶段顺序为日志首次出现顺序，因此结果是事件的确定性函数。

### 路由计价成本

`src/pricing.ts` 是纯路由费率查表与每轮精确成本。本行接受可选的 `pricingCurrency` 与按 `${provider}/${model}` 键控四个每 token 费率的 `routeRates`。`TurnTokenUsage` 携带一份共享桶数据加上其尝试使用的路由集合，因此仅当一轮只有一个路由且该路由配置了费率时该轮成本才存在；多路由或未计价的一轮让工单与阶段 `cost` 省略而非置零，符合“缺路由信息则省略成本”的冻结规则。未配置费率时所有成本省略。

### 读取会话日志

`UsageController` 经 `jobController` 服务解析工单（结构化读取 `getJob`/`listJobs`，绝不导入工单包）。它优先从实时内存 store 读取工单会话事件——该日志权威且包含尚未落盘的轮次——对不再实时的会话回退到 `ctx.get('sessionPersistence')` 的读句柄。持久层与实时 store 服务都经本地结构化接口访问，因此本包运行时从不导入其 augmentation 拥有者。

### RPC、触发与写链

每次 `jobUsage` 调用都从权威日志重算并 upsert `jobs` 与 `stage_usage` 行，删除工单已不再拥有的阶段行；重复读取返回相同值，因为重算是事件的纯函数。既有投影 feed 额外预热持久行：`tokenUsage` 变更把会话入队，一次排空把会话匹配到绑定它的工单并重算。排空在一个 microtask 内批量处理且幂等，因此一串投影变更只花一次处理。

## Alternatives considered

**从模型目录读 provider 成本。** 否决：`llm-pi-ai` 明确 harness 从不读 pi-ai 成本元数据，`llm-replay` 会将其清零，用它既违背已交付决策，也仍会报告其它面都不报告的花费。`ctx.llm.resolveModel` 根本不暴露成本字段。可配置的每路由费率让该选择显式且归部署方所有。

**让 `rxlab_job` 存 token 与成本。** 工单决策记录已否决，且会把同一事实复制到两个域。token 与成本归 `rxlab-usage`；工单只存对客 `pricing`。

**在本包内重新推导轮次用量。** 否决：`deriveTurnTokenUsage` 已拥有精确 provider 记账与路由归属，第二份拷贝会与 token-meter 的尝试生命周期漂移。从 `@deepseek-ai/dsh-token-meter/client` 导入该浏览器安全折叠是唯一来源。

**快照实时 `tokenUsage` 投影而不读日志。** 否决：投影是会话级总量而非轮次级，无法把轮次归到阶段，且只在投影 feed 观察过该会话时存在。持久日志才是工单规划所指的、持久的轮次级权威。

## Consequences

工单的 token 总量与阶段拆分现在持久且类型化，凡部署配置了路由费率处成本即可用。SPA 可 join 工单的对客 `pricing` 与 `rxlabUsage.jobUsage`，而无需把任一事实存两遍。代价：成本依赖部署配置的费率，否则省略，因为 harness 没有权威价格；跨多路由的轮次无法按路由拆分，故省略成本；持久的 `jobs`/`stage_usage` 行是重算投影，仅对 store 或持久后端仍可读取的会话有意义。依赖策略尚未分类本行运行时导入的 token-meter 导出，这与各 rxlab 包既有未分类的 `dsh-storage-domain` 导入一致；该调和不在本包范围内。

## Testing

`tests/attribution.spec.ts` 覆盖轮次切分、跨重写的阶段归集、畸形与未知阶段参数、无用量轮次与成本规则。`tests/usage.spec.ts` 覆盖 version-2 域声明。`tests/controller.host.spec.ts` 在共享内存存储后端与真实 `JobController` 之上启动控制器，覆盖实时日志归集、精确成本与持久行写入、持久层回退、无会话零值、`job/not-found` 传播与幂等重复读取。
