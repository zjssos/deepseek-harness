# Agent Note:rxlab 采集模块 v1 —— 链接资产 + 确定性 L1 采集器

Status: implemented

[English](2026-09-07-rxlab-collect-module-v1.md) | 中文

## Problem(问题)

rxlab 工作台(`dsh rxlab`)需要让「商品采集(collect)」模块真正拿到真实商品数据并落盘,优先于任何 Wiki 工作:现有商品 Wiki 的 `product` 行是推演的占位数据,而本模块此前只渲染占位面板。与用户对齐的业务口径:按 **平台 → 店铺 → 商品链接** 的粒度采集,为每条链接落盘 标题 / 页面显示价格 / 已选规格变体 / 通过分享拿到的购买链接 与抓取时刻;规格不结构化(详情图仅作历史留存);Wiki 明确出界——采集记录落在独立的 raw 域。

线路可行性先在业务引擎仓库(`glasses-packing-workbench/probes`,未跟踪)对京东 BOLON 官方旗舰店(mall.jd.com/index-57589)做了探针:京东对匿名脚本的搜索/店铺发现全程风控(桌面"访问频繁无法搜索"、移动端 `risk_handler`、登录墙),而逐商品移动页(`item.m.jd.com/product/<sku>`)匿名可达,其「分享 → 复制链接」流程可确定性地拿到购买链接(`item.m.jd.com/product/<sku>.html?utm_campaign=…`)。匿名 headless 确定性抓取 6/6 试点商品、约 6.75 s/条;agent 驱动真实浏览器抓取同 6 条,分享链接完全一致。因此 **L1 确定性线路可行且零 token**;L3(手机 scrcpy/OCR)待有设备再排。

## Decision(决策)

v1 落为新的双面官方包 `@deepseek-ai/dsh-rxlab-collect`(置于 `packages/api/`,完整镜像 `@deepseek-ai/dsh-rxlab-catalog`:`clientBundle`/typert 生成链、profile 行组装、`dsh.client` 自挂载、storage-domain 形态一致)。它在一个存储域内拥有三类实体:

- `rxlab_collect` 域(交付时 version 1,per-record;后升 v2 增加 capture 可选 `params` 并保持 v1 可读,见 [Wiki v2 注记](2026-09-09-rxlab-wiki-v2-attributes-and-import.zh.md))三张表:`links`(资产:平台/店铺/sku/url/mobileUrl/状态/最近采集摘要)、`captures`(每次成功抓取一条:标题/价格(显示值+原文+说明)/已选SKU/购买链接/时间)、`batches`(排队运行状态:逐链接条目与计数)。
- `CollectController extends TypertRemoteService` 注册 `rxlabCollect` Remote 命名空间:链接动词 `listLinks`/`getLink`/`upsertLink`(同一 平台+规范化URL 合并为一行)/`removeLink`/`importLinks`(CSV 各行独立校验,拒绝行原样返回 UI);批次动词 `createBatch`(校验每个 link id 后入队)/`listBatches`/`getBatch`;`listCaptures` 查单链接历史。
- 执行器注册表:平台 → 确定性 `Collector`。v1 只带 JD 适配器(匿名 headless chromium:移动页标题 + 分享/复制链接购买链接 + 桌面页价格读取);未实现平台以 `collect/adapter-unavailable` fail loud。controller 在服务生命周期内持有 chromium 单例(懒启动、随 dispose 关闭),批次串行执行(单条进程内 promise 链、1 s 礼貌间隔),只在每个条目**提交点**落盘(capture 行、link 状态/last-*、batch 条目与计数)。

「平台/店铺/商品链接管理」是入口(单条录入 + CSV 导入);店铺展开发现(需登录态持久浏览器)与定时重采列为后续里程碑(M2/M3),导入 Wiki catalog 亦属后续。模块刻意**不需要模型 key**——整条运行链路确定性,贴合用户的 token 预算。价格按页面显示值记录并注明促销/会员价会漂移,靠重采刷新。

Profile 接线:`packages/bundle/rxlab-app/cordis.patch.yml` 新增一行 `rxlab-collect` 及 bundle 依赖;SPA 模块(`apps/rxlab-web/src/modules/collect/`)翻为 `active`,含「商品链接」页签(筛选/单条新增/CSV 导入/勾选成批次/单条采集与详情删除)与「采集批次」页签(列表 + 逐项进度,轮询)。读写经 `use-collect.ts` hooks 走 `runtime.remote.rxlabCollect`;列表刷新 = nonce + 运行中 4 s 轻轮询。

## Alternatives considered(备选)

**沿用 Wiki 形态把采集写进 `rxlab_catalog`。** 拒绝:Wiki 行是推演数据且用户明确延后 Wiki;capture 需要逐链接历史与运行态,目录行不建模;独立 raw 域留出干净的将来导入步。

**由 agent 会话执行(L2)。** 探针证明可行但慢、耗 token,且 host 侧需新建浏览器工具能力缝;用户选 L1(整体可行、token 少),L2 留作确定性路径处理不了的页面的后手。

**确定性站点级列表/店铺页抓取。** JD 直接封匿名发现;逐商品 item 页才是可达、可分享的表面,契合用户"脚本按链接处理"模型。

**价格与图片走平台私有接口。** 本网络下公开价格接口被拒;价格改读渲染后桌面 DOM 并保留原文,图片未结构化(懒加载图廊无稳定 DOM URL),记为 Known Limitation 留给后续图片映射里程碑。

## Consequences(后果)

采集模块现可端到端落盘真实数据:CSV/粘贴或单条录入 → 链接行落 `$DSH_HOME/storages-rxlab/` → 勾选链接串行成批次 → 每条链接的 capture(标题/价格/已选/购买链接+时间)与批次/行状态持久化并在 SPA 可查。运行无需 API key;失败行带可读错误、可重试。raw 域是将来 Wiki 导入器的数据源;定时重采(M2)用同一队列刷新价格与在售。

## Testing(测试)

单测(`tests/parse.spec.ts`)覆盖离线纯逻辑:URL 平台推断、JD sku/移动/桌面规范化与标题清洗、CSV 拆分(带引号逗号/换行、转义引号、未闭合引号拒绝)与表头→记录映射及行级拒绝。网络执行器不做单测;活体证据为通过 `dsh rxlab` + SPA 对六条 BOLON 试点链接的端到端运行(导入 → 批次 → 含分享链接的记录;无效行失败路径),与可行性探针一致。覆盖债(host controller spec、逐文件覆盖率)与 M2/M3 项记于包 README 的 Known Limitations。
