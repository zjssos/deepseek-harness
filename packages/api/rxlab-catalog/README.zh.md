---
description: "rxlab 商品 Wiki 主数据：rxlab_catalog 存储域及其类型化 rxlabCatalog Remote，并自带 Client 贡献的装配。"
kind: "package-reference"
---
# rxlab Catalog

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-rxlab-catalog` 拥有 rxlab 商品 Wiki 的 master data。Host 侧它提供 `ctx.catalogController` 服务和生成的 `ctx.remote.rxlabCatalog` namespace；该 namespace 读写 `rxlab_catalog` 存储域（version 2、per-record 布局，version 1 记录仍可读），域中存放镜架 / 镜片 / 商品条目的判别联合，其结构化属性词表（镜架材质/形状/框型/风格，镜片光学参数）供后续验光与推荐规则消费。Client 侧本包是 `dsh.client` 行，其 `/client` bundle 自行 mount 该 namespace，因此 rxlab SPA 恰好在组合 rxlab 业务数据处启动 catalog。本包刻意不加入平台 `api-remotes` 装配：catalog 是 rxlab 业务数据，不是通用 Host 能力。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

rxlab profile 组合一行 `rxlab-catalog`（`@deepseek-ai/dsh-rxlab-catalog`）。Host Loader 激活 `CatalogController` 服务：它通过 `ctx.storageDomain` 打开 `rxlab_catalog` 域并保持到生命周期结束，同时向 Typert Gateway 注册 `rxlabCatalog` namespace。SPA 的 headless client boot 会激活本包自身的 `/client` bundle（由 modules node half 在 `/plugins` 下提供），其 `apply` mount 生成的 Remote contribution，于是浏览器内 `remote.rxlabCatalog.list/get/upsert/importCollected/remove` 即可调用。

`upsert` 在 wire 边界用域 zod schema 校验 draft，服务端铸造记录 id 与写入时间戳，并把写操作排入域的单写链（先持久化、再内存、再发 `domain/changed`）。`list` 按封闭 `kind` 联合、品牌/型号/名称大小写不敏感子串与分面过滤（镜架行的材质与框型、镜片行的折射率、基于最新价格读数的闭区间价格段）过滤，返回按最近写入排序、携带最新价格与家族标签的摘要。

`importCollected` 是采集→catalog 的接缝：调用方传入一条采集到的 listing（标题、已选规格、价格、规格参数对）及其采集血统（平台、url、链接 id、capture id），控制器用确定性抽取器（`src/extract.ts`，基于眼镜行业属性词表的营销词汇匹配，不经过模型）抽出结构化属性，把价格读数并入记录的价格历史（重复最新值则不追加），并按采集链接 id 合并——重复导入会更新既有记录（保留 id 与操作者备注）而不是新建重复行。抽取会判定记录家族（镜架/镜片/商品）且从不虚构取值；标题与参数表未命中的属性保持缺省，留给后续模型辅助补全。

Wire 与持久类型在 `./types`（浏览器安全 JSON、无运行时代码）；zod schema 在仅 Host 侧的 `src/domain.ts`。

-----

<a id="model-experience"></a>
## 模型体验

### Catalog 主数据

#### 模型可见什么

无。本包不注册工具、不注入提示词、不追加会话事件；`rxlab_catalog` 的数据行位于 `ctx.remote.rxlabCatalog` 与 storage domain 之后，模型只能经消费方自身有文档说明的界面触达（今天是 rxlab SPA）。

#### Token 影响

零：本包没有文本进入任何模型请求。

#### KV Cache 影响

独立：catalog 读写不触碰请求前缀，这里没有任何东西会使提供方缓存失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- SPA 按需刷新列表，尚未订阅 `domain/changed` 做多端实时同步。
- 抽取目前只有确定性通道：标题与参数表未命中的属性保持缺省，覆盖这些空隙的模型辅助补全是后续轮次。
- 导入消费的 `rxlab_collect` capture 字段（`params`、`mainImageUrl`、价格）来自匿名 headless 会话的尽力读取；JD 风控页会整体缺失。
- catalog 之上的 agent 工具、域的 `storage-sqlite` 后端属于后续轮次。
- 记录按条 JSON 存储；大目录的全文本与参数区间查询暂无索引。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
