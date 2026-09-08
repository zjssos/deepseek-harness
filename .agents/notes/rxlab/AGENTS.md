# AGENTS.md — rxlab 文档区

本目录是 rxlab 产品线（`dsh rxlab`，验光配镜工作台）的独立文档区。它位于 Agent Notes 树旁但不属于 Agent Notes：不受 `{lifecycle}/{class}` 结构、双语配对与归档门禁约束；`scripts/agent-note-tree.ts` 显式豁免本目录，`scripts/translation-pairing.manifest.json` 将其排除出双语配对。

## 与标准 Agent Notes 的分工

影响 shipped harness 源码的决策仍走标准 Agent Notes 树（`.agents/notes/{lifecycle}/{class}/`，规则见[上层 README](../README.md)）：判别问题是「这条结论是否约束 rxlab 之外的开发者」。现有三个 rxlab 功能决策记录是范本：

- [agent 会话工作台](../implemented/feature/2026-09-05-rxlab-agent-session-workbench.md)
- [商品 Wiki catalog 域](../implemented/feature/2026-09-05-rxlab-wiki-catalog-domain.md)
- [采集模块 v1](../implemented/feature/2026-09-07-rxlab-collect-module-v1.md)

本目录只放 rxlab 产品线自己的工作文档：规划、产品决策取舍、组装与架构现状说明。

## 新文档怎么输出

1. 落盘到本目录，文件名 `yyyy-mm-dd-english-topic.md`，日期为文档首次创建日；文件名确定后不随状态或内容演进改名。
2. 正文以一行 blockquote 声明状态与日期开头，状态取规划、决策、现状说明三者之一。状态演进就地改写该行与正文，不另开新文件、不保留旧副本。
3. 现状说明只描述已实现的组装，以仓库当前代码为准；引用代码位置写 `packages/...` 路径，不写行号。规划文档实施完成后改写为现状说明或删除，不与现状说明长期并存。
4. 文档语言默认中文，不强制 `.zh.md` 双语配对；叙述遵循 [docs/AGENTS.md](../../../docs/AGENTS.md)：只写当前状态、每段落一个物理行、术语与 harness 文档一致。
5. 一次性会话记录、逐条命令输出、协商草稿不落盘到本目录；被取代的历史文档直接删除（git 历史可追回），不长期保留。
6. 仓库根目录与 `docs/` 下不得再新增散落的 rxlab 文档；发现时移入本目录并修复引用。

## 门禁义务

本目录文件仍受通用 Markdown 门禁约束：`verify-md-wrap`（段落单行）、`verify-md-links`、`doc-typecheck`（TypeScript 代码块须可编译，尽量少用）、`verify-package-paths`。改动本目录或上述豁免配置后运行 `pnpm run test:docs` 验证。

## 当前文档

- [2026-09-05-standalone-spa-architecture-decision.md](2026-09-05-standalone-spa-architecture-decision.md) — 决策：独立 SPA 取代 Cordis 浏览器客户端栈的取舍与代价。
- [2026-09-07-assembly-and-layered-architecture.md](2026-09-07-assembly-and-layered-architecture.md) — 现状说明：profile 组装逻辑与分层架构。
