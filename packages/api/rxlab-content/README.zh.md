---
description: "rxlab 工作台内容：rxlab_content 存储域中的知识词条与话术模板，以及类型化 rxlabContent Remote 和自带 Client 贡献的装配。"
kind: "package-reference"
---
# rxlab Content

[English](README.md) | 中文

## 概要

`@deepseek-ai/dsh-rxlab-content` 拥有 rxlab 工作台的知识词条与话术内容。Host 侧它提供 `ctx.contentController` 服务和生成的 `ctx.remote.rxlabContent` namespace；该 namespace 读写 `rxlab_content` 存储域（version 1、per-record 布局），其单张 `items` 表存放 `kind: 'knowledge' | 'script'` 条目，可打上可选的阶段标签。Client 侧本包是 `dsh.client` 行，其 `/client` bundle 自行 mount 该 namespace，因此 rxlab SPA 恰好在组合 rxlab 业务数据处启动 content。本包刻意不加入平台 `api-remotes` 装配：内容条目是 rxlab 业务数据，不是通用 Host 能力。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

rxlab profile 组合一行 `rxlab-content`（`@deepseek-ai/dsh-rxlab-content`）。Host Loader 激活 `ContentController` 服务：它通过 `ctx.storageDomain` 打开 `rxlab_content` 域并保持到生命周期结束，同时向 Typert Gateway 注册 `rxlabContent` namespace。SPA 的 headless client boot 会激活本包自身的 `/client` bundle（由 modules node half 在 `/plugins` 下提供），其 `apply` mount 生成的 Remote contribution，于是浏览器内 `remote.rxlabContent.list/get/upsert/delete` 即可调用。

`upsert` 在 wire 边界用域 zod schema 校验草稿，铸造条目 id 与写时间戳，并把写操作排入域的单写链（先持久化、再内存、再发 `domain/changed`）；请求未带 id 时新建条目，带 id 时替换该键下的既有条目。`list` 按封闭的 `kind` 与 `stage` 联合、以及标题/标签大小写不敏感子串过滤，返回按最近写入排序、省略正文的摘要。`get` 对缺失 id 抛 `content/not-found`。`delete` 报告条目是否存在，不存在时不写。

Wire 与持久类型在 `./types`（浏览器安全 JSON、无运行时代码）；zod schema 在仅 Host 侧的 `src/domain.ts`。

**运行时不变式：** 不发布运行时不变式伴生包（companion）：`rxlab_content` 的持久 schema 拥有全部记录关系，没有可独立观测而发散的关系。

-----

<a id="model-experience"></a>
## 模型体验

### 工作台内容

#### 模型可见什么

无。本包不注册工具、不注入提示词、不追加会话事件；`rxlab_content` 的数据行位于 `ctx.remote.rxlabContent` 与 storage domain 之后，模型只能经消费方自身有文档说明的界面触达（今天是 rxlab SPA）。

#### Token 影响

零：本包没有文本进入任何模型请求。

#### KV Cache 影响

独立：content 读写不触碰请求前缀，这里没有任何东西会使提供方缓存失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 内容管理面板是后续的 SPA 改动；在那之前该 namespace 在工作台内没有浏览器消费方。
- 列表按需刷新；面板尚未订阅 `domain/changed` 做多端实时同步。
- 正文按条整体存储；大内容集的全文本检索暂无索引。
- 阶段词表从 job 域复制以保持本包独立；job 包拥有权威列表。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
