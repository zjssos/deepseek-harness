# Agent Note: rxlab 商品 Wiki v2 —— 结构化属性词表、价格纬度与采集导入缝

Status: implemented

[English](2026-09-09-rxlab-wiki-v2-attributes-and-import.md) | 中文

## 问题

商品 Wiki v1（[2026-09-05 注记](2026-09-05-rxlab-wiki-catalog-domain.zh.md)）的记录模型只有粗字段：镜架 6 个几何/自由文本字段，镜片一个折射率枚举；采集模块落盘的 raw capture（标题/价格/已选规格）没有任何通道进入 catalog。业务需要三个能力：按眼镜行业的专业属性体系定义镜架与镜片实体；给商品加价格纬度（价格随采集演化，不是单值）；通过结构化过滤或 agent 检索找到商品。前提是先核实既有采集数据是否支撑这些字段。

## 决策

**数据核实先行。** 检查 `$DSH_HOME/storages-rxlab/rxlab_collect`：29 条 JD 链接、仅 1 条成功 capture，且只有 title/selectedSku/buyUrl —— 价格（桌面页被风控）、主图、规格参数全部缺失。结论：标题营销词可确定性抽取品牌/材质/框型/风格/性别/重量/颜色，但尺寸规格（方框法 `52□18-140`）与镜片参数必须反补采集器。

**属性词表有行业依据。** 镜架采用方框法规格（GB/T 14214 的镜圈宽-鼻梁宽-镜腿长）加镜框高度/总宽/重量，材质分档取行业通行的 纯钛/β钛/钛/金属合金/不锈钢/TR90/塑钢/板材/PC；镜片采用 折射率×材料成对的事实（1.50 CR-39 阿贝 58、1.60 MR-8 阿贝 41、1.67 MR-7 阿贝 32、1.74 聚氨酯），词表扩到 1.50/1.56/1.59/1.60/1.61/1.67/1.71/1.74，另立 设计（球面/非球面/双面非球面）与功能标签（防蓝光/变色/偏光/染色/驾驶）。封闭 zod enum 供推荐规则 switch；厂商差异化字段（膜层、颜色）保持自由文本。

**catalog 域升 v2，兼容读 v1。** `compatibleVersions: [1]`，v1 携带的字段全部保留声明，原必填的自由文本 `frameMaterial` 转为可选的遗留字段，新结构化字段全部可选。共享新增 `priceHistory`（有序读数，重复最新值不追加，200 条封顶丢最旧）与 `source`（采集血统：平台/url/linkId/captureId）。两个域（catalog、collect）各自升 v2，均为加可选字段的相邻迁移。

**导入缝放在 catalog 侧。** `rxlabCatalog.importCollected(source, listing)` 接收采集血统与 listing 字段，`src/extract.ts` 的确定性抽取器把标题/参数表映射成结构化属性并判定记录家族（镜架/镜片/商品，套餐按镜架归类），按 `source.linkId` 幂等合并（重复导入更新既有记录，保留 id 与备注），价格读数并入历史。调用方（SPA 采集面板的「导入到 Wiki」按钮，后续可为会话工具）用现有 `rxlabCollect.listCaptures` 取最新 capture。没有让一个控制器并发打开两个 storage 域（域名单开语义禁止），也没有在 `rxlab-collect` 里反向写 catalog —— raw 域对 catalog 保持只读。

**`list` 扩分面而不是加新端点。** kind/子串查询之外新增 材质、框型（镜架行）、折射率（镜片行）、最新价格闭区间过滤；摘要携带最新价格与家族标签。

## 备选方案

**新建 `rxlab-import` api 包做导入控制器。** 需要完整的双面 typert 链而唯一消费者是 SPA 一个按钮；抽取器与合并逻辑作为 catalog 的纯函数 + Remote 方法已可复用，等第二个消费者（会话工具）出现再晋升。

**采集器直接解析成结构化属性。** 属性词表是 catalog 的领域知识，放采集器会让 raw 域承担主数据语义；采集保持原样落盘、导入时抽取，重跑导入即可随词表演进而无需重采。

**价格存单值字段。** 采集天然逐次留痕；单值会丢价格演化，与「wiki 记录是知识」的定位冲突。历史作为权威，最新值由消费方读取末条。

## 结果

catalog v2 上线：结构化属性词表、价格历史、采集血统、`importCollected` 幂等导入、`list` 分面过滤；`rxlab-catalog` 首次拥有单测（抽取器 12 例 + 控制器 8 例，含 v1 schema 兼容）。collect v2 的 capture 增加可选 `params`，JD 采集器补抓桌面参数表、`og:image` 主图与移动端价格回退。SPA 镜架/镜片表单改用结构化词表，详情渲染价格记录与来源，采集面板链接详情可一键导入。后续轮次：模型辅助补全抽取空隙、catalog 会话工具、`storage-sqlite` 后端。

## 测试

`packages/api/rxlab-catalog`：`tests/extract.spec.ts`（真实采集标题驱动的抽取断言：BOLON/材质分档/方框法规格/参数表优先/镜片词表/套餐归类/缺省保持）与 `tests/catalog-controller.host.spec.ts`（内存后端上的导入幂等/价格合并/家族判定/分面过滤/v1 schema 兼容）。仓库 typecheck 对两包双叶配置全绿；`apps/rxlab-web` typecheck 与 vite build 绿。未覆盖：JD 采集器 DOM 抓取的离线断言（需真实页面，沿用既有 executor 无网测的边界）、`compatibleVersions` 在真实 json 后端上的读取（内存测试替身只做单元版本强等，v1 兼容以 schema 层断言代替）。
