> 状态：现状说明 · 2026-09-09

# 设置中枢与用量记账现状

本轮把 rxlab 工作台的模块边界、设置面与用量数据整理到可继续演进的状态：业务模块不再跨目录借共享基建、设置页按工作台模块分组并以 schema 表单编辑、Agent 设置脱离“一个输入框”、token 用量按模块落盘打底。

## 数据层解耦

共享 host 数据层从 `apps/rxlab-web/src/modules/agent/` 与 `modules/settings/` 迁到中立的 `apps/rxlab-web/src/rxlab/`（`client.ts`、`use-sessions.ts`、`use-archived-sessions.ts`、`use-credentials.ts`、`use-settings.ts`、`session-cwd.ts`）。业务模块（collect/wiki/fitting/settings）只从 `@/rxlab/*` 取数据层；agent↔settings 循环引用随之消失。模块间的产品级数据联系（collect「导入到 Wiki」经 `remote.rxlabCatalog.importCollected`）原样保留，未加深耦合。

## 设置中枢（settings 模块）

`apps/rxlab-web/src/modules/settings/Panel.tsx` 的「模块设置」页从全 namespace 平铺改为按工作台模块（`registry.tsx` 的 `MODULES`）分区：每个模块一栏展示工作空间管控（状态徽标、会话目录）与可编辑设置；planned 模块显示“规划中”。Agent 分区与 Agent 模块的齿轮对话框共用同一实现 `src/rxlab/settings-form/AgentSettingsSection.tsx`，编辑模块默认级部署命名空间 `llm-deepseek`（思考模式/思考强度/输出上限/上下文容量/模型目录只读/Base URL/API Key 环境变量名）与 `agent-default-model`（provider/model/思考强度）。控件由 `schema` 无关的 hint 表（`settings-form/hints.ts`）驱动：enum 渲染 Select、数值渲染数字输入、对象只读摘要；不属于任何模块的 host 分区保留通用标量编辑兜底。

字段名以 llm-deepseek 的 Config 与 agent-default-model 的 `AGENT_DEFAULT_MODEL_SETTINGS_SCHEMA` 为准；会话级配置覆盖不在本轮范围（随 agent 集成各模块的后续步骤）。

## 用量记账（rxlab-usage）

新包 `packages/api/rxlab-usage`：`UsageController` 监听 session-projection 变更流中客户端可见的 `tokenUsage` 单元（token-meter 由 base 组装，rxlab 继承），按会话 cwd 相对工作空间根目录归到模块（子目录映射与 SPA `session-cwd.ts` 互为镜像），把会话总量与重算后的模块聚合写入 `rxlab_usage` 域（`sessions`/`modules` per-record 表）。remote：`summary`（模块聚合）、`sessionUsage`（按 id 回填会话行）。SPA 侧 agent 模块显示当前会话用量条、会话列表每行 token 与模块聚合 chips（`modules/agent/SessionUsage.tsx` + `use-usage.ts`），为后续按工作流/模块计费提供落盘数据。

接线：`packages/bundle/rxlab-app/cordis.patch.yml` 新增 `rxlab-usage` 行（注入 storageDomain/sessionProjections/rxlabPaths），rxlab-app 与 rxlab-web 增依赖；tsconfig host/client 与 `packages/api/README` 双语表同步登记。

## 已知限制与延期

- **collect 可编辑 knob 已接入设置(后续提交)**：`rxlab-collect-browser` settings namespace 由浏览器行注册(restart 生效),设置中枢 collect 分区可编辑并提供「打开 CDP 浏览器」控制;确定性采集在 `cdp` 模式下 connectOverCDP。
- **淘宝/天猫采集器已添加(后续提交)**:executor registry 在 JD 之外注册 `taobao`(匿名抓 item/detail …item.htm 的标题/价格/主图),JD 被风控时可换平台继续;登录流程仍仅 JD。
- **用量记账不回填历史**：rxlab-usage 从观察到投影变更起记账；行存在前流过的会话用量在 SPA 回退到实时投影视图。
- **映射已归一**:模块→子目录映射单一源为 host `rxlab-module-agents` settings namespace(SPA 与 rxlab-usage 同读)。

相关标准决策记录：fitting 模块基建见 `.agents/notes/implemented/architecture/2026-09-09-rxlab-fitting-module-infra.md`。
