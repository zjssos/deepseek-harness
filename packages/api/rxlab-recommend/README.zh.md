---
description: "rxlab 验光配镜模块：无状态的 rxlabRecommend Remote（候选框/片校验与排序）、确定性规则引擎与可编辑的 rxlab-recommend-rules 设置命名空间，附模型侧工具与自挂载 Client 贡献。"
kind: "package-reference"
---
# rxlab Recommend

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-rxlab-recommend` 拥有 rxlab 工作台的确定性候选校验与匹配。Host 侧它提供 `ctx.recommendController` 服务与生成的 `ctx.remote.rxlabRecommend` 命名空间（`validateFrame`、`validateLens`、`suggest`）；本包无存储域、从不落盘。它从 `@deepseek-ai/dsh-rxlab-fitting/types` 消费 `Prescription` 与 `FittingRecommendation` 作为目标，对候选镜架与镜片做校验——不重新推导处方。本包注册 `rxlab-recommend-rules` 设置命名空间，使折射率阶梯、FPD 尺寸带、单眼移心上限与柱镜升档阈值可在设置面编辑而无需改代码。Client 侧它是 `dsh.client` 行，其 `/client` bundle 自行挂载命名空间，因此 rxlab SPA 恰好在组合 rxlab 业务数据处装载 recommend；本包刻意不加入平台 `api-remotes` 装配。

## 目录

- [推荐模型](#the-recommend-model)
- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="the-recommend-model"></a>
## 推荐模型

`FrameCandidate` 是框型（`full`/`half`/`rimless`）加镜片宽 A 与鼻梁距 DBL（FPD = A + DBL），另有可选的镜架总宽、镜腿长、重量与形状。`LensCandidate` 是标称折射率、片型（`single`/`reading`/`progressive`/`bifocal`/`office`；`single` 映射到 fitting 引擎的 `single-vision`）与功能标签（如 `uv`、`blue-light`）。每次校验返回 `CompatibilityReport`：`overall`（`OK`/`WARN`/`FAIL`）、逐项检查列表与一行 `summary`。

镜架校验三项。由瞳距算出的尺寸带为 `[pd + minExtraMm, pd + maxExtraMm]`（`sizeBand` 规则），排序目标取 `targetExtraMm`。单眼移心量为 `|FPD / 2 − PD_eye|`，与 `decentrationCapMm` 比较；缺瞳距时该检查判失败而非跳过。非 `full` 框在光度 ≥ 6D、柱镜 ≥ 2D，或 fitting 建议中 `rimlessOk` 为 false 时判失败。超出尺寸带为警告；移心与框型违规为失败。

镜片校验三项。要求折射率取「建议 `recommendedIndex`」与「最重子午光度落入的 `indexLadder` 档位」中更严者，柱镜达到 `cylinderStepD` 时升一档；候选折射率更低判失败。片型须在建议 `lensTypes` 内（否则警告），用途建议的功能标签（户外 `uv`、电脑 `blue-light`）须齐备（否则警告）。

`suggest` 校验每个候选，按「报告 + 靠近尺寸带 + 折射率余量 + 功能覆盖 + `shapePref`/`rimTypePref` 风格匹配」打分，并按得分降序返回镜架与镜片（同分保持输入顺序）及排序理由。

<a id="use-this-package"></a>
## 使用本包

rxlab profile 组装一个 host 行 `rxlab-recommend`（`@deepseek-ai/dsh-rxlab-recommend`），`guide` preset 组装工具行（`@deepseek-ai/dsh-rxlab-recommend/tools`）。Host Loader 激活 `RecommendController`：它向设置 provider 注册 `rxlab-recommend-rules`（restart 生效），并向 Typert Gateway 注册 `rxlabRecommend` 命名空间。SPA 的 headless client boot 会激活本包自身的 `/client` bundle（由 modules node half 在 `/plugins` 下提供），其 `apply` mount 生成的 Remote contribution，于是浏览器内 `remote.rxlabRecommend.validateFrame/validateLens/suggest` 即可调用。

工具行注册 `recommend_validate_frame`、`recommend_validate_lens` 与 `recommend_suggest` 供工作台 agent 会话使用。Wire 类型在 `./types`（浏览器安全 JSON，无运行时代码）；纯引擎在 `src/engine.ts`；设置 schema 与其跨字段校验在 `src/rules.ts`。

<a id="model-experience"></a>
## 模型体验

### 推荐工具（会话级）

#### 模型可见什么

组装在内置 `guide` preset 上的会话携带 `recommend_validate_frame`、`recommend_validate_lens`、`recommend_suggest` 工具 schema；仅挂载基础 `rxlab-recommend` 行时不注册任何模型可见的东西，引擎本身无需模型 key 即可运行。两个校验工具以文本返回 `CompatibilityReport`；`recommend_suggest` 返回排序后的候选列表与理由。

#### Token 影响

三个工具 schema 进入组装在内置 `guide` preset 上会话的每次模型请求；引擎与设置变更不向模型请求添加任何内容。

#### KV Cache 影响

会话内稳定：工具 schema 在会话组装时一次性挂载，其前缀贡献与工具块的其余部分一样被缓存；规则编辑与候选数据变更不会使其失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 规则是决策辅助用的简化行业惯例，不是医疗器械规范；高光度建议仅供参考，不替代验光师复核。
- `suggest` 只对调用方给出的候选排序；它不查询参照库、价格或可售性来源，且 `colorPref` 只记录不计分，因为候选不携带颜色。
- 当前由引擎与 controller 的包内测试承担；尚无通过 shipped `cordis.yml` 的 REAL-composition 启动测试，与 fitting、collect 行一致。
- Client bundle 仅由装配级 client 检查覆盖，没有包内 spec（fitting 与 collect 行相同）。
- 不发布 invariant 伴随包：校验是候选、处方、建议与当前规则的纯函数，不存在可独立发散的观测。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
