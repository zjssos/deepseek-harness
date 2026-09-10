# Agent Note: rxlab recommend 是消费 fitting 建议的无状态候选校验器

Status: implemented

[English](2026-09-10-rxlab-recommend-engine.md) | 中文

## 问题

rxlab 工作台能从分阶段验光记录推导处方与适配建议，但无法回答操作者的下一步问题：这一副镜架或镜片到底适不适配该处方，几个候选里哪个最好？工作台承诺确定性的 L2 指导——校验别人给的方案，而不仅是产出方案——因此该检查必须是可复现的规则工作，不能是 LLM 步骤。第二个确定性引擎若独立推导目标，也会与 fitting 引擎漂移。

## 决策

新增 `packages/api/rxlab-recommend` 行，拥有无状态的 `rxlabRecommend` Remote（`validateFrame`/`validateLens`/`suggest`），底层是纯规则引擎。它无存储域、从不落盘，从 `@deepseek-ai/dsh-rxlab-fitting/types` 消费 `Prescription` 与 `FittingRecommendation` 作为权威目标，只对候选做校验，绝不重新推导处方。

每个阈值——折射率阶梯、FPD 尺寸带、单眼移心上限、柱镜升档阈值——都是 `rxlab-recommend-rules` 设置命名空间的字段（restart 生效注册），而非私有常量，因此设置面可重新调校引擎。引擎按瞳距算出的 FPD 尺寸带、单眼移心 `|FPD / 2 − PD_eye|` 与非 `full` 框型风险校验镜架；按折射率下限（建议值与「最重光度落入的阶梯档位」中更严者）、建议片型与用途功能覆盖校验镜片；`suggest` 对候选集打分并排序。`./tools` 函数插件注册 `recommend_validate_frame`、`recommend_validate_lens`、`recommend_suggest`，`src/client/index.ts` 自挂载命名空间，因此本包不进入平台 `api-remotes` 装配。

## 已考虑的替代方案

**为什么不在 recommend 内部重新推导处方与建议？** fitting 引擎已拥有处方推导，是这些决策的单一来源。两处推导就有两处要改且可能不一致；消费冻结的 `Prescription`/`FittingRecommendation` 类型让 recommend 保持纯校验器、目标唯一。当建议与阶梯在折射率上不一致时，recommend 取更严者，而不是相信任何一方。

**为什么用设置命名空间而不是插件 Config 常量？** 这些阈值是验光师必须在不改代码的情况下调校的部署相关选择；仓库规则要求此类选择是受校验的设置字段，工作台架构本就把规则走设置命名空间。`DEFAULT_*` 常量不是可配置性。

**为什么用同步 Remote 方法而其它行是 async？** 引擎是纯的、没有自有异步操作，因此没有 `await` 的 `async` 方法只是仪式；Typert Gateway 仍向 Client 面交付 promise。

**为什么没有存储域？** 没有记录要留：校验结果是输入与当前规则的函数，调用方（阶段面板或指南组装器）拥有任何持久化。

## 后果

阶段面板与指南组装器可以零 token 成本调用 `rxlabRecommend` 校验并排序候选，agent 也可通过三个工具做同样的事。规则词汇是持久配置：其字段在设置面编辑，其命名空间在写入时拒绝不可用的阶梯或阈值。引擎、controller 与工具由包内测试钉住；尚无 recorded-session 快照、也尚无通过 shipped `cordis.yml` 的 REAL-composition 启动，与 fitting、collect 行一致。校验是决策辅助用的简化行业惯例，明确不是医疗器械规范。
