# Agent Note: rxlab fitting 是带确定性推导引擎的分阶段验光记录域

Status: implemented

[English](2026-09-09-rxlab-fitting-module-infra.md) | 中文

## 问题

rxlab 工作台的「验光配镜」此前只是 planned 占位：没有验光过程的数据模型，没有处方计算，也没有适配建议。下游的 recommend、render 模块都要出处方数据，fitting 是工作台主线上下一个数据接缝。

## 决策

新增 `packages/api/rxlab-fitting` 行，拥有 `rxlab_fitting` 存储域（version 1、per-record）中的分阶段验光记录和 `rxlabFitting` Remote（`list/get/upsert/delete/derive`），形态与 catalog 行对齐：自带 `/client` 装配、不进平台 `api-remotes` 装配。

验光记录以九个闭集 `id` 判别的阶段刻画验光过程（问诊/基线/客观/调节放松/主觉/双眼/试戴/下加光/瞳距）。`derive` 运行纯引擎（`src/prescription.ts`，无 zod、无存储）：校验 → 处方 → 镜片/镜架建议。FAIL 发现抑制处方输出；WARN 发现随结果附送。SPA 面板以记录列表/详情、核心阶段的录入对话框和处方报告替换占位，处方报告按推导出的 FPD 尺寸带匹配 Wiki 镜架。

## 已考虑的替代方案

**为什么是确定性引擎而不是 LLM 步骤？** 处方推导是规则工作：处方原则（宁正勿负、柱镜宁低勿高、ADD 宁低勿高、等效球镜补偿）都是可检验的事实。LLM 步骤会给一个必须跨次运行完全一致的决策面引入非确定性；语义环节属于将来的 agent 面，不属于计算核心。

**为什么独立存储域而不是扩展 `rxlab_catalog`？** 验光记录是过程事实，其生命周期和形态（分阶段条目，非镜架/镜片/商品联合）与 catalog master data 不同；一域一关注点让持久 schema 可读且可版本化。面板在客户端跨包（catalog `list/get` 匹配镜架），不让 Host 服务相互耦合。

**为什么 FAIL 抑制处方而不是降级输出？** 缺必需阶段或记录非法回退的记录推不出安全球镜；降级输出会诱导操作者用残缺事实配镜。抑制让 wire 保持诚实：null 处方加 FAIL 清单。

**为什么面板只做新建？** 编辑需要阶段到表单的反向映射；先交付新建 + 推导可端到端跑通完整契约，编辑面作为独立后续。

## 后果

recommend 模块现在可以直接消费 `derive` 的处方与建议。`rxlab_fitting` 域 schema 为 version 1；阶段形态扩展只能通过版本升级。面板未订阅 `domain/changed`，两个浏览器标签在变更刷新前可能看到过期列表。建议是简化行业惯例——决策辅助，明确不是医疗器械。
