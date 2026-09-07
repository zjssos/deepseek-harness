---
description: "rxlab 商品采集:rxlab_collect 存储域(链接资产、采集记录、运行批次)、类型化 rxlabCollect Remote、自挂载 Client 贡献与确定性 L1 JD 采集器。"
kind: "package-reference"
---
# rxlab 采集(rxlab Collect)

[English](README.md) | 中文

## Summary(概述)

`@deepseek-ai/dsh-rxlab-collect` 拥有 rxlab 商品采集数据。Host 侧提供 `ctx.collectController` 服务与生成式 `ctx.remote.rxlabCollect` 命名空间,读写 `rxlab_collect` 存储域(version 1,per-record),含三张表 —— `links`(平台/店铺/商品链接资产)、`captures`(每次成功抓取一条记录)与 `batches`(串行运行状态,逐链接条目)。抓取由确定性 L1 采集器执行(v1 内置 JD 适配器,匿名 headless chromium),整条运行链路**零 token、无需模型 key**。Client 侧该包是 `dsh.client` 行,其 `/client` bundle 自行挂载命名空间,使 rxlab SPA 在装配 rxlab-product 数据的位置装载采集器。本包刻意不加入平台 `api-remotes` 装配:采集器是 rxlab 产品数据,不是通用 Host 能力。raw 采集域是将来商品 Wiki 导入器的数据源;本包不写 `rxlab_catalog`。

## Table of Contents(目录)

- [Use this package(使用)](#use-this-package)
- [Model Experience(模型体验)](#model-experience)
- [Known Limitations and Deferred Work(已知限制与待办)](#known-limitations-and-deferred-work)
- [Dev Note(开发注记)](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package(使用)

rxlab profile 组装一行 `rxlab-collect`(`@deepseek-ai/dsh-rxlab-collect`)。Host Loader 激活 `CollectController` 服务:在其生命周期内经 `ctx.storageDomain` 打开 `rxlab_collect` 域并在 Typert Gateway 注册 `rxlabCollect` 命名空间;执行器注册表把平台映射到确定性 `Collector`,controller 在服务生命周期内持有一个懒启动的 headless chromium。SPA 的 headless client 启动会激活本包自带的 `/client` bundle(modules 节点在 `/plugins` 下提供),其 `apply` 挂载生成式 Remote 贡献,于是 `remote.rxlabCollect.*` 在浏览器内可用。

**链接资产是入口**:单条 `upsertLink`,或 `importLinks`(CSV 文本;表头 `platform,url` + 可选 `shopId`/`shopName`/`sku`/`title`,逐行独立校验,拒绝行返回 UI)。共享 平台+规范化URL 的行会合并。`createBatch` 把所选链接 id 排成一个串行批次;批次在进程内逐条执行(1 s 礼貌间隔),每个条目**在提交点**一次性落盘 capture 行、link 状态/last-* 字段与 batch 条目/计数。`listLinks` 按平台/店铺/状态与不区分大小写查询过滤;`listBatches`/`getBatch` 暴露批次进度;`listCaptures` 返回某链接的采集历史(新→旧)。

JD 采集器访问 canonical 移动页 `item.m.jd.com/product/<sku>`:读清洗后的标题与默认选中变体标签,触发页面「分享 → 复制链接」拿到分享购买链接,再从桌面页读显示价格。价格连同原文与说明一起落盘(注明显示价可能是促销/会员价),因此定时重采可刷新它。

Wire 与持久类型在 `./types`(浏览器安全 JSON,无运行时代码);zod 在 Host 侧 `src/domain.ts`;纯解析/规范化助手在 `src/executor/parse.ts`(有单测,不触网)。

-----

<a id="model-experience"></a>
## Model Experience(模型体验)

无 —— 采集器是浏览器与 Host 数据,不注册 prompt、工具或会话事件;抓取无需模型 key。

#### KV Cache effect(KV 缓存影响)

无直接影响;采集变更不改变模型请求。

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work(已知限制与待办)

- 主图/详情图 URL 未采集:JD 图廊懒渲染、无稳定 DOM URL,`mainImageUrl`/`detailImageUrls` 留空,待平台图片映射里程碑。
- 结构化规格未抽取:这类 listing 的规格只在详情营销长图里(留作历史,尚无 OCR/视觉环节)。
- 价格为尽力而为:部分网络下 JD 会给匿名 headless 桌面会话返回无价格文本的风控页,此时采集保留 标题/变体/购买链接 而省略价格字段;在暖机或登录态浏览器会话下重采可刷新。
- JD 对匿名"搜索/店铺发现"风控;链接资产需录入或导入(带登录态持久浏览器的店铺级发现是后续里程碑)。
- 定时重采(M2)未做;目前失败重试为手动(重跑该行/新批次)。
- 包仅有纯解析逻辑单测;Host controller 与网络 executor 尚无 spec(合入 master 前需补齐以满足逐文件覆盖率门),且无 invariant companion(无独立可分歧观测)。
- 未来"raw 域 → `rxlab_catalog`"的商品 Wiki 导入器未建;不要把本域记录当作 catalog 主数据读。

-----

<a id="dev-note"></a>
## Dev Note(开发注记)

JD 采集器驱动匿名 headless chromium。首次运行需装浏览器:`pnpm --filter @deepseek-ai/dsh-rxlab-collect run setup:browsers`(或 `pnpm exec playwright install chromium`)。运行刻意低频(串行队列、1 s 间隔、仅公开页面);请遵守平台条款,勿批量滥用。
