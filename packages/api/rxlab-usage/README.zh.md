---
description: "rxlab 用量记账模块：token-meter 投影之上的会话级与模块级总量，以类型化 rxlabUsage Remote 暴露，自带 Client 装配。"
kind: "package-reference"
---
# rxlab Usage

[English](README.md) | 中文

## 概要

`@deepseek-ai/dsh-rxlab-usage` 拥有 rxlab 的用量记账。Host 侧它提供 `ctx.usageController` 服务与生成的 `ctx.remote.rxlabUsage` namespace；该 namespace 读写 `rxlab_usage` 存储域（version 1、per-record 布局）中的会话级总量与模块级聚合。控制器监听 session-projection 变更流中的客户端可见 `tokenUsage` 单元（由 base bundle 的 token-meter 行组装），把每次变更的会话按 cwd 相对工作空间根目录归到工作台模块，并持久化记录会话总量与重算后的模块聚合——为后续按工作流/模块计费提供数据底座。Client 侧本包是 `dsh.client` 行，其 `/client` bundle 自行 mount 该 namespace，因此 rxlab SPA 恰好在组合 rxlab 业务数据处启动 usage。本包刻意不加入平台 `api-remotes` 装配：用量是 rxlab 业务数据，不是通用 Host 能力。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understanding-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

## 使用本包

作为 rxlab-app 数据行随 profile 组装；SPA 用量视图经生成的 `remote.rxlabUsage` namespace 读取。无配置项：模块子目录归属映射是与 SPA 共享的工作空间结构约定，非常规可调参数。

## 理解实现

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `UsageController` host 服务：开域、订阅投影流、暴露 `summary` / `sessionUsage` |
| [`src/domain.ts`](src/domain.ts) | `rxlab_usage` 域：`sessions` 与 `modules` per-record 表 |
| [`src/aggregate.ts`](src/aggregate.ts) | 纯函数：token 桶相加与 cwd → 模块归属 |
| [`src/types.ts`](src/types.ts) | namespace 的浏览器安全 wire 类型 |
| [`src/client/index.ts`](src/client/index.ts) | 自挂载 Client 贡献（`dsh.client` 行） |

## 模型体验

无模型可见面：本行消费 host 投影事件并服务 SPA，不向任何会话增加提示词、工具或请求文本。

## 已知限制与延期工作

- 持久记账从本行观察到投影变更开始：行存在之前（或 profile 停机期间）产生的用量不会回填；SPA 列表列对这类会话回退到实时投影视图。
- 子目录 → 模块映射在本包与 SPA（`apps/rxlab-web/src/rxlab/session-cwd.ts`）各有一份，须同步演进。
- 计费费率与按工作流账单尚未建模；本包只留存计算它们所需的 token 总量。
