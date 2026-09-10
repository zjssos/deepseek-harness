---
description: "rxlab 验光配镜模块：rxlab_fitting 存储域的分阶段验光记录、确定性处方推导引擎，以及自带 Client 装配的类型化 rxlabFitting Remote。"
kind: "package-reference"
---
# rxlab Fitting

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-rxlab-fitting` 拥有 rxlab 验光配镜模块的数据。Host 侧它提供 `ctx.fittingController` 服务和生成的 `ctx.remote.rxlabFitting` namespace；该 namespace 读写 `rxlab_fitting` 存储域（version 1、per-record 布局）中的分阶段验光记录，其 `derive` RPC 对草稿运行确定性处方推导引擎且不落盘。Client 侧本包是 `dsh.client` 行，其 `/client` bundle 自行 mount 该 namespace，因此 rxlab SPA 恰好在组合 rxlab 业务数据处启动 fitting。本包刻意不加入平台 `api-remotes` 装配：fitting 记录是 rxlab 业务数据，不是通用 Host 能力。

## 目录

- [验光记录模型](#the-exam-record-model)
- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="the-exam-record-model"></a>
## 验光记录模型

一条验光记录以九个受校验的阶段刻画验光过程，以闭集 `id` 判别：`anamnesis`（年龄、是否首验、用眼场景）、`baseline`（焦度计实测原镜度数与视力）、`objective`（电脑验光/检影均值读数）、`cycloplegia`（未做/雾视/散瞳）、`subjective`（MPMVA → 红绿 → JCC 轴位 → JCC 柱镜 → 单眼终值）、`binocular`（平衡微调与双眼终值球镜）、`trial`（试戴耐受与 0.25D 步进回退）、`add`（下加光）、`pdMeasure`（单眼瞳距、可选瞳高）。`anamnesis`、`objective`、`subjective`、`binocular`、`pdMeasure` 必需；16 岁以下首验还必须有非 `none` 的 `cycloplegia` 阶段。

`derive` 校验记录并返回最终处方（双眼终值球镜、主觉柱镜与轴位、分眼 ADD、单眼瞳距求和、试戴回退按加正补偿）以及校验发现与镜片/镜架建议。FAIL 发现抑制处方输出；WARN 发现随结果附送。建议规则按最重光度选折射率（柱镜 ≥ 2D 升一档）、按用途与 ADD 选镜片类型、由瞳距给镜架尺寸带（FPD = 镜片宽 + 鼻梁距，单眼移心 ≤ 3mm）、按光度与散光判断无框/半框可行性。这些是行业惯例的简化（宁正勿负、柱镜宁低勿高、ADD 宁低勿高）；工作台是决策辅助，不是医疗器械。

<a id="use-this-package"></a>
## 使用本包

rxlab profile 组合一行 `rxlab-fitting`（`@deepseek-ai/dsh-rxlab-fitting`）。Host Loader 激活 `FittingController` 服务：它通过 `ctx.storageDomain` 打开 `rxlab_fitting` 域并保持到生命周期结束，同时向 Typert Gateway 注册 `rxlabFitting` namespace。SPA 的 headless client boot 会激活本包自身的 `/client` bundle（由 modules node half 在 `/plugins` 下提供），其 `apply` mount 生成的 Remote contribution，于是浏览器内 `remote.rxlabFitting.list/get/upsert/delete/derive` 即可调用。

`upsert` 在 wire 边界用域 zod schema 校验草稿，铸造记录 id 与写时间戳，并排队到域的单写链（先持久，后内存，再 `domain/changed`）。`list` 做患者/日期大小写不敏感子串匹配并返回最新写优先的摘要。`get` 对缺失 id 抛 `fitting/not-found`。`derive` 不落盘。

Wire 与持久类型在 `./types`（浏览器安全 JSON，无运行时代码）；zod schema 在 Host-only 的 `src/domain.ts`；纯推导引擎在 `./prescription`。

**运行时不变式：** 不发布运行时不变式伴生包（companion）：`rxlab_fitting` 持久 schema 拥有全部记录关系，推导引擎是纯函数，没有可独立观测而发散的关系。

<a id="model-experience"></a>
## 模型体验

### 验光数据

#### 模型可见什么

无。本包不注册工具、不注入提示词、不追加会话事件；`rxlab_fitting` 记录位于 `ctx.remote.rxlabFitting` 与 storage domain 之后，模型只能经消费方自身有文档说明的界面触达（今天是 rxlab SPA）。

#### Token 影响

零：本包没有文本进入任何模型请求。

#### KV Cache 影响

无直接影响；fitting 变更不改变模型请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- SPA 目前只能新建记录，尚不能编辑既有记录；编辑需要面板里阶段到表单的反向映射。
- SPA 按需刷新列表；尚未订阅 `domain/changed` 做多客户端实时同步。
- 尚无 REAL-composition 控制器测试，与 catalog、collect 行一致；当前由引擎与 schema 的包内测试承担。
- 镜片/镜架建议是简化惯例，不替代磨边设备或验光师复核。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
