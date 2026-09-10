---
description: "rxlab 用量记账模块：token-meter 投影之上的会话级、模块级与工单级总量，含路由计价成本，以类型化 rxlabUsage Remote 暴露，自带 Client 装配。"
kind: "package-reference"
---
# rxlab Usage

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-rxlab-usage` 拥有 rxlab 的用量记账。Host 侧它提供 `ctx.usageController` 服务与生成的 `ctx.remote.rxlabUsage` namespace；该 namespace 读写 `rxlab_usage` 存储域（version 2、per-record 布局、兼容 version 1）中的会话级总量、模块级聚合与工单级 job/stage 用量。控制器监听 session-projection 变更流中的客户端可见 `tokenUsage` 单元（由 base bundle 的 token-meter 行组装），把每次变更的会话按 cwd 相对工作空间根目录归到工作台模块，并持久化记录会话总量与重算后的模块聚合。对工单绑定的 agent 会话，它把持久日志切成完整轮次、取每轮精确 provider 用量，按最近的 `job_write_stage` 工具调用把轮次归到对应阶段，再乘配置的路由 token 费率得到精确成本。Client 侧本包是 `dsh.client` 行，其 `/client` bundle 自行 mount 该 namespace，因此 rxlab SPA 恰好在组合 rxlab 业务数据处启动 usage。本包刻意不加入平台 `api-remotes` 装配：用量是 rxlab 业务数据，不是通用 Host 能力。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understanding-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

作为 rxlab-app 数据行随 profile 组装；SPA 用量视图经生成的 `remote.rxlabUsage` namespace 读取。模块子目录归属映射是与 SPA 共享的工作空间结构约定，非常规可调参数。工单成本按需开启：在行的 `pricingCurrency` 与 `routeRates` 下配置每 token 费率，键为 `${provider}/${model}`。

```yaml
- id: rxlab-usage
  name: '@deepseek-ai/dsh-rxlab-usage'
  config:
    pricingCurrency: CNY
    routeRates:
      'deepseek/deepseek-chat':
        uncachedInput: 0.000001
        output: 0.000002
        cacheRead: 0.0000005
        cacheWrite: 0.000001
```

费率为 `pricingCurrency` 下的每 token 成本。未配置 `pricingCurrency` 或 `routeRates` 时，所有 `jobUsage` 成本省略。仅当某一轮只有一个路由且该路由配置了费率时，该轮 `cost` 才存在；否则省略而非置零——harness 没有权威价格，置零会被读成免费。

<a id="understanding-the-implementation"></a>
## 理解实现

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `UsageController` host 服务：开域、订阅投影流、暴露 `summary` / `sessionUsage` / `jobUsage`，从实时 store 或持久日志解析工单会话 |
| [`src/domain.ts`](src/domain.ts) | `rxlab_usage` 域：`sessions`、`modules`、`jobs`、`stage_usage` per-record 表 |
| [`src/aggregate.ts`](src/aggregate.ts) | 纯函数：token 桶相加与 cwd → 模块归属 |
| [`src/attribution.ts`](src/attribution.ts) | 纯函数：轮次切分与轮次 → 阶段归属，把精确用量折叠进工单与阶段总量 |
| [`src/pricing.ts`](src/pricing.ts) | 纯函数：路由费率查表与每轮精确成本 |
| [`src/types.ts`](src/types.ts) | namespace 的浏览器安全 wire 类型 |
| [`src/client/index.ts`](src/client/index.ts) | 自挂载 Client 贡献（`dsh.client` 行） |

<a id="model-experience"></a>
## 模型体验

### 用量记账

#### 模型可见什么

无。本行消费 host 投影事件与会话日志并服务 SPA，不向任何会话增加提示词、工具或请求文本。`rxlabUsage` 总量位于 `ctx.remote.rxlabUsage` 与 storage domain 之后，模型只能经 SPA 触达。

#### Token 影响

零：本包没有文本进入任何模型请求。

#### KV Cache 影响

独立：用量读取不触碰请求前缀，这里没有任何东西会使提供方缓存失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 工单成本没有内置价目表。`rxlab-usage` 不读任何 provider 成本元数据，因此需部署方配置 `routeRates`；否则 `cost` 省略。harness 其它地方也不报告花费。
- 持久阶段表名是 `stage_usage` 而非 `stageUsage`：`defineDomain` 只接受小写 snake_case 表名。`jobUsage` 的 wire 名称不受影响。
- 一轮若跨多个 provider/model 路由，只共享一份桶数据，无法按路由拆分成本；该轮计入总量，但使工单与阶段的 `cost` 省略。
- 持久记账从本行观察到投影变更开始：行存在之前（或 profile 停机期间）产生的用量不会回填到会话/模块表。`jobUsage` 读取整段会话日志，因此对仍可读取的会话会回填工单总量。
- 子目录 → 模块映射在本包与 SPA（`apps/rxlab-web/src/rxlab/session-cwd.ts`）各有一份，须同步演进。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
