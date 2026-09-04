---
description: "rxlab 商品 Wiki 主数据：rxlab_catalog 存储域及其类型化 rxlabCatalog Remote，并自带 Client 贡献的装配。"
kind: "package-reference"
---
# rxlab Catalog

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-rxlab-catalog` 拥有 rxlab 商品 Wiki 的 master data。Host 侧它提供 `ctx.catalogController` 服务和生成的 `ctx.remote.rxlabCatalog` namespace；该 namespace 读写 `rxlab_catalog` 存储域（version 1、per-record 布局），域中存放镜架 / 镜片 / 商品条目的判别联合，供后续验光与推荐规则消费。Client 侧本包是 `dsh.client` 行，其 `/client` bundle 自行 mount 该 namespace，因此 rxlab SPA 恰好在组合 rxlab 业务数据处启动 catalog。本包刻意不加入平台 `api-remotes` 装配：catalog 是 rxlab 业务数据，不是通用 Host 能力。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

rxlab profile 组合一行 `rxlab-catalog`（`@deepseek-ai/dsh-rxlab-catalog`）。Host Loader 激活 `CatalogController` 服务：它通过 `ctx.storageDomain` 打开 `rxlab_catalog` 域并保持到生命周期结束，同时向 Typert Gateway 注册 `rxlabCatalog` namespace。SPA 的 headless client boot 会激活本包自身的 `/client` bundle（由 modules node half 在 `/plugins` 下提供），其 `apply` mount 生成的 Remote contribution，于是浏览器内 `remote.rxlabCatalog.list/get/upsert/remove` 即可调用。

`upsert` 在 wire 边界用域 zod schema 校验 draft，服务端铸造记录 id 与写入时间戳，并把写操作排入域的单写链（先持久化、再内存、再发 `domain/changed`）。`list` 按封闭 `kind` 联合过滤并做品牌/型号/名称大小写不敏感子串匹配，返回按最近写入排序的摘要。`remove` 删除单条记录并回报其是否存在。

Wire 与持久类型在 `./types`（浏览器安全 JSON、无运行时代码）；zod schema 在仅 Host 侧的 `src/domain.ts`。

-----

<a id="model-experience"></a>
## 模型体验

无，catalog 属浏览器与 Host 数据，不注册 prompt、工具或 session 事件。

#### KV Cache 影响

无直接效应；catalog 变更不改变模型请求。

-----

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- SPA 按需刷新列表，尚未订阅 `domain/changed` 做多端实时同步。
- 采集导入、catalog 之上的 agent 工具、域的 `storage-sqlite` 后端属于后续轮次。
- 记录按条 JSON 存储；大目录的全文本与参数区间查询暂无索引。

-----

<a id="dev-note"></a>
## 开发备注

无。
