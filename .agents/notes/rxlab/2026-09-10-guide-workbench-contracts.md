# 配镜指南工作台 —— 冻结契约与工作流拆分

> 状态：规划 · 2026-09-10

本文是并行实施的唯一接口事实源，配合[架构重规划](2026-09-10-guide-workbench-architecture.md)阅读。任何流都不得改动本文冻结的名称与签名；需要变更时先在主对话改本文，再通知各流。实施前每个流必须 `git worktree` 切到自己的分支、`pnpm install` 并跑通基线。

## 命名与拥有边界

| 包 | 目录 | storage 域 | ctx 服务 | Remote namespace | client 行 |
| --- | --- | --- | --- | --- | --- |
| `@deepseek-ai/dsh-rxlab-recommend` | `packages/api/rxlab-recommend` | 无（无状态） | `recommendController` | `rxlabRecommend` | 有 |
| `@deepseek-ai/dsh-rxlab-job` | `packages/api/rxlab-job` | `rxlab_job` v1 | `jobController` | `rxlabJob` | 有 |
| `@deepseek-ai/dsh-rxlab-content` | `packages/api/rxlab-content` | `rxlab_content` v1 | `contentController` | `rxlabContent` | 有 |
| `@deepseek-ai/dsh-rxlab-usage` | `packages/api/rxlab-usage` | `rxlab_usage` v2（compatible `[1]`） | `usageController` | `rxlabUsage` | 有 |

新包一律照 `packages/api/rxlab-fitting` 模板：Host/Client 双叶 tsconfig、`defineDomain`、`TypertRemoteService`、`src/client/index.ts` 自挂载 `/remote`、`tsdown` 的 `clientBundle(..., { hostPhase: true })`、双语 README，且**不加入平台 `api-remotes`**。

## 阶段与内容标识

```
StageId = 'exam' | 'frame' | 'lens' | 'fabrication' | 'pickup' | 'aftercare'
ContentKind = 'knowledge' | 'script'
```

## 存储域契约

`rxlab_job` v1、`layout: 'per-record'`：

- `jobs`：`JobRecord = { id: JobId; consumer: ConsumerProfile; status: 'draft'|'in-progress'|'complete'|'archived'; stageIds: StageId[]; sessionId?: string; pricing?: { amount: number; currency: string }; createdAt: string; updatedAt: string }`。
- `stages`：`StageRecord = { id: StageId_branded; jobId: JobId; stage: StageId; status: 'pending'|'in-progress'|'done'|'skipped'; inputs: JsonValue; outputs: JsonValue; checks?: CompatibilityReport; updatedAt: string }`。键为 `${jobId}:${stage}`。
- `guides`：`GuideRecord = { jobId: JobId; document: GuideDocument; generatedAt: string }`。

`ConsumerProfile = { name?: string; age?: number; faceWidthMm?: number; usage?: 'far'|'near'|'computer'|'outdoor'|'all'; budget?: { amount: number; currency: string }; style?: { shapePref?: string; rimTypePref?: string; colorPref?: string }; oldRx?: JsonValue }`；`oldRx` 存紧凑自持映射，不引用 fitting schema。

**每阶段 `inputs`/`outputs` 的字段是 WS-2 的包内细节**，但类型名冻结并在 `src/types.ts` 导出：`ExamStageInput/ExamStageArtifact`、`FrameStageInput/FrameStageArtifact`、`LensStageInput/LensStageArtifact`、`FabricationStageInput/FabricationStageArtifact`、`PickupStageInput/PickupStageArtifact`、`AftercareStageInput/AftercareStageArtifact`。`CompatibilityReport` 的字段一致于原型契约：

```
CompatibilityReport = { overall: 'OK'|'WARN'|'FAIL'; checks: { name: string; status: 'OK'|'WARN'|'FAIL'; detail: string }[]; summary: string }
```

`GuideDocument = { jobId: JobId; consumer: ConsumerProfile; chapters: GuideChapter[]; pricing?: { amount: number; currency: string }; generatedAt: string }`，`GuideChapter = { stage: StageId; title: string; params?: Record<string, JsonValue>; strategy?: string[]; checklist?: string[]; scripts?: string[]; checks?: CompatibilityReport }`。

`rxlab_content` v1、per-record：`ContentItem = { id: ContentItemId; kind: ContentKind; stage?: StageId; title: string; tags: string[]; body: string; updatedAt: string }`。

`rxlab_usage` v2、per-record、`compatibleVersions: [1]`，新增 `jobs` 与 `stage_usage` 两表（存储表名限 `^[a-z][a-z0-9_]*$`，故用下划线；wire 名保持 `stageUsage`），原有 `sessions`/`modules` 不动。

## Remote 契约

`rxlabRecommend`（无状态，消费 fitting 类型）：

```
validateFrame({ prescription: Prescription; advice: FittingRecommendation; frame: FrameCandidate }): { report: CompatibilityReport }
validateLens({ prescription: Prescription; advice: FittingRecommendation; lens: LensCandidate }): { report: CompatibilityReport }
suggest({ prescription: Prescription; advice: FittingRecommendation; candidates: { frames?: FrameCandidate[]; lenses?: LensCandidate[] }; preference?: ConsumerProfile['style'] }): { frames: RankedCandidate[]; lenses: RankedCandidate[]; reasons: string[] }
FrameCandidate = { frameType: 'full'|'half'|'rimless'; lensWidthA: number; bridgeDbl: number; frameWidth?: number; templeLength?: number; weight?: number; shape?: string }
LensCandidate = { index: number; lensType: 'single'|'reading'|'progressive'|'bifocal'|'office'; features: string[] }
RankedCandidate = { candidate: FrameCandidate | LensCandidate; report: CompatibilityReport; score: number }
```

`Prescription` 与 `FittingRecommendation` 从 `@deepseek-ai/dsh-rxlab-fitting/types` 类型导入；recommend 不重推导目标，只做候选校验与匹配。

`rxlabJob`：

```
listJobs({ query?: string }): { items: JobSummary[] }
getJob({ id: JobId }): { job: JobRecord; stages: StageRecord[]; guide?: GuideDocument }
createJob({ consumer: ConsumerProfile }): { job: JobRecord }
updateJob({ id: JobId; patch: Partial<Pick<JobRecord,'consumer'|'pricing'|'status'>> }): { job: JobRecord }
bindSession({ id: JobId; sessionId: string }): { job: JobRecord }
upsertStage({ jobId: JobId; stage: StageId; patch: { status?: StageRecord['status']; inputs?: JsonValue; outputs?: JsonValue; checks?: CompatibilityReport } }): { stage: StageRecord }
generateGuide({ jobId: JobId }): { document: GuideDocument }
deleteJob({ id: JobId }): { removed: boolean }
```

`rxlabContent`：

```
list({ kind?: ContentKind; stage?: StageId; query?: string }): { items: ContentItemSummary[] }
get({ id: ContentItemId }): { item: ContentItem }
upsert({ item: { kind: ContentKind; stage?: StageId; title: string; tags: string[]; body: string }; id?: ContentItemId }): { item: ContentItem }
delete({ id: ContentItemId }): { removed: boolean }
```

`rxlabUsage` 新增：

```
jobUsage({ jobId: JobId }): { totals: UsageTotals; cost?: number; currency?: string; stages: { stage: StageId; totals: UsageTotals; cost?: number }[] }
```

`UsageTotals` 沿用现有四桶。成本不来自 `token-meter` 的 `route-pricing`（那只计量图像/文件表示，不含货币价），改由 `rxlab-usage` 的运行时可配置费率计算：Config 字段 `pricingCurrency` 与 `routeRates`（每 token 费率，按 provider/model 路由）；未配置费率或无路由信息时省略 `cost` 而非置零。

## settings 命名空间

- 新增 `rxlab-recommend-rules`（schema：`indexLadder`、`sizeBand`、`decentrationCapMm`、`cylinderStepD`），由 `rxlab-recommend` 的 Host 行注册，`applies: 'restart'`，设置模块可编辑。
- 既有 `rxlab-workspace`、`rxlab-module-agents`、`rxlab-collect-browser` 不变。

## 工具与 preset

- preset id `guide`，目录 `packages/preset/agent-presets/presets/guide/`，挂 persona、ask-user、todo、web、skill 与下述工具行。
- 工具由 `rxlab-job` 的 `./tools` 与 `rxlab-recommend` 的 `./tools` 提供，模型可见名冻结：`job_read`、`job_write_stage`、`guide_generate`、`recommend_validate_frame`、`recommend_validate_lens`、`recommend_suggest`。
- `job_write_stage` 参数含 `stage`，是计量阶段归属的锚点；不新增 session 事件类型。

## SPA 路由与导航契约

主侧栏阶段/工单路由：`/jobs`、`/jobs/:jobId`、`/exam`、`/frame`、`/lens`、`/fabrication`、`/pickup`、`/aftercare`。次侧栏工具路由：`/content`、`/collect`、`/agent`、`/settings`。阶段路由用 `?job=<id>` 绑定当前工单；无 `job` 参数时提示先选/建工单。

`ModuleDefinition` 增加 `group: 'stage' | 'tool'`（阶段 vs 工具），侧栏据此分组；`registry.tsx` 为唯一改动点。`recommend`/`render`/`flow` 占位模块移除，`fitting` 面板并入 `/exam`，`wiki` 面板并入 `/content` 的参照库分区。

## 共享注册文件归属

以下文件多流都会触碰，除各流自身包的最小附加行外，最终由**主对话**统一集成：`packages/bundle/rxlab-app/cordis.patch.yml`、`packages/bundle/rxlab-app/package.json`、`tsconfig.host.json`、`tsconfig.client.json`、`tsconfig.base.json`（别名，必要时 `pnpm run gen-tsconfig-paths`）、`packages/api/README.md`/`.zh.md`、`pnpm-lock.yaml`、`THIRD_PARTY_NOTICES.md`。各流只加自己包的行，禁止重排既有内容。

## 工作流拆分

| 流 | 分支 | 独占目录 | 依赖 | 交付 |
| --- | --- | --- | --- | --- |
| WS-1 内核 | `rxlab/ws-recommend` | `packages/api/rxlab-recommend/**` | 本契约 | 引擎 + `rxlabRecommend` + 规则命名空间 + 工具 |
| WS-2 工单 | `rxlab/ws-job` | `packages/api/rxlab-job/**` | 本契约 | `rxlab_job` 域 + `rxlabJob` + 指南组装器 + 工具 + `guide` preset |
| WS-3 内容 | `rxlab/ws-content` | `packages/api/rxlab-content/**` | 本契约 | `rxlab_content` 域 + `rxlabContent` |
| WS-4 计量 | `rxlab/ws-usage` | `packages/api/rxlab-usage/**` | 本契约 + WS-2 类型名 | usage v2 + `jobUsage` |
| WS-5 SPA | `rxlab/ws-spa` | `apps/rxlab-web/**` | 本契约 + WS-1..4 契约 | 六阶段导航 + 工单/指南 + 内容面板 |
| WS-6 集成 | `rxlab`（主对话） | 共享注册文件 | 全部 | bundle patch、锁文件、门禁、合并 |

**波次**：`契约冻结` → WS-1/2/3 并行 → WS-4 → WS-5 → 主对话集成。WS-4 与 WS-5 可对冻结类型先行，实现待上游包可构建后联调。

## 各流自述 brief

**WS-1**：新建 `packages/api/rxlab-recommend`，照 `rxlab-fitting` 模板（但无 storage 域）。`src/types.ts` 定义上述 `FrameCandidate`/`LensCandidate`/`CompatibilityReport`/`RankedCandidate` 与请求/结果对，类型导入 fitting 的 `Prescription`/`FittingRecommendation`；`src/engine.ts`（或 `frame.ts`/`lens.ts`/`compatibility.ts`）实现纯规则：由瞳距算框带、移心量 `|FPD/2 − 单眼瞳距| ≤ decentrationCapMm`、无框/半框高光度风险、由最重光度选折射率、按用途选片型、功能适配；`src/index.ts` 的 `RecommendController extends TypertRemoteService`，`static inject = []`，`@Remote` 三个方法，规则从注册的 settings 命名空间解析（默认值写进 Config schema，不散落常量）；`src/client/index.ts` 自挂载；`./tools` 注册三工具。测试：引擎单元 + host 组合（`tests/`），覆盖高光度、大框、瞳距偏移、缺字段边界。README 双语。

**WS-2**：新建 `packages/api/rxlab-job`，照 fitting 模板。`src/domain.ts` 定义 `rxlab_job` 域与三表 zod；`src/types.ts` 导出品牌 id、六个阶段 `inputs`/`outputs` 类型、`GuideDocument`、请求/结果对；`src/guide.ts` 实现确定性指南组装（阶段产出 + 内容域话术 → `GuideDocument`，不调 LLM）；`src/index.ts` 的 `JobController extends TypertRemoteService`，`static inject = ['storageDomain']`，实现全部 RPC 与写链；`src/tools.ts` 注册 `job_read`/`job_write_stage`/`guide_generate`（`job_write_stage` 的 `stage` 参数是计量锚点）；`presets/guide/agent.cordis.yml` 挂工具行；`src/client/index.ts` 自挂载。测试：域 schema、组装器、工单写读与 `bindSession`。README 双语。

**WS-3**：新建 `packages/api/rxlab-content`，照 fitting 模板。`rxlab_content` v1 单表 `items`；RPC `list`/`get`/`upsert`/`delete`；`src/client/index.ts` 自挂载。测试：域 schema 与 Controller 写读。README 双语。

**WS-4**：扩展 `rxlab-usage` 到 v2（`compatibleVersions: [1]`），新增 `jobs`/`stageUsage` 表与 `jobUsage` RPC。监听工单会话持久日志：按 `deriveTurnTokenUsage` 取每轮用量与 `routes`，按最近的 `job_write_stage` 工具调用（读 job 的 `sessionId`）把轮次归到阶段，乘本包运行时费率（Config `routeRates`）得成本。**先写一个最小探针**验证"轮次→阶段"归集在真实会话日志上成立，再并入。测试：归集纯函数单元 + 组合。README 双语。

**WS-5**：改 `apps/rxlab-web`。`registry.tsx` 主轴改六阶段 + 工单，新增 `group`；`/jobs`、`/jobs/:jobId`、六阶段面板、`/content`、参照库并入内容；移除 `recommend`/`render`/`flow` 占位；阶段面板统一 `投入→校验→产出`；工单页渲染 `GuideDocument` 并导出 HTML；调用 `remote.rxlabRecommend`/`rxlabJob`/`rxlabContent`/`rxlabUsage`。遵守 `apps/rxlab-web/AGENTS.md` 与 shadcn/rxlab-web 技能；验证 `typecheck` + `build` + 浏览器冒烟。

**WS-6 主对话**：在各流合入后补 `cordis.patch.yml` 四个 insert 行与 bundle 依赖、tsconfig 聚合、`packages/api/README` 双语行、`gen-tsconfig-paths`、锁文件与通知文件，跑 `build`/`typecheck`/各包测试/`doc-sync`，处理合并冲突与跨流联调。
