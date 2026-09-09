# Agent Note: 让 rxlab transcript 的行保持在 ScrollArea 视口内

Status: implemented

[English](2026-09-09-rxlab-transcript-wrap-long-tokens.md) | 中文

## Problem

只要有一次工具调用携带长且不可断开的字符串——Windows 路径、JSON 参数或工具输出行——rxlab 会话 Agent 的 transcript（文本记录）就会把每一行右侧裁掉。`MessageList` 渲染在 Radix ScrollArea 内，而 ScrollArea 会把子节点包进一个带 `min-width: 100%` 的 `display: table` 元素。表格的收缩适应宽度下限是其内容的 min-content 宽度，于是一行不可断开的文本就把整个 transcript 撑到超出视口。视口隐藏横向溢出（应用只挂载纵向滚动条），因此 `w-full` 与 `max-w-[85%]` 都按被撑宽的表格计算，每一行都在文本中间被截断，且无法滚动到被截掉的部分。工具卡还保留了 shadcn `Card` 的默认值（`py-6`、`gap-6`），却只覆盖了 header 与 content 的内边距，使紧凑的摘要卡周围留下 24px 的空白带。

## Decision

[MessageList.tsx](../../../../apps/rxlab-web/src/modules/agent/MessageList.tsx) 中每个长文本面都在原有 `whitespace-pre-wrap` 之外加上 `wrap-anywhere`（`overflow-wrap: anywhere`）：用户与助手文本、思考内容、工具参数与结果、上下文正文，以及 Agent 运行出错横幅。承载它们的 flex 子项加上 `min-w-0`。`overflow-wrap: anywhere` 会降低元素的 min-content 宽度，使 ScrollArea 的表格保持视口宽度而不再随内容增长。`ToolCard` 用 `gap-0 py-0` 覆盖 Card 默认值，并把 `space-y-*` 换成 `gap-*`。

## Alternatives considered

**在 transcript 内做横向滚动。** 长行能保持原样，但视口只挂载纵向滚动条，读者要在每张卡里横向滚动才能读到一个路径；transcript 是对话，不是代码查看器。

**只在工具块上用 `break-all`。** `word-break: break-all` 同样能降低 min-content 宽度，但它会拆开本可以换到下一行的词，在散文和思考内容里阅读体验很差。

**在 `transcript.ts` 投影层截断长行。** 掩盖宽度问题会让助手文本和思考内容继续被裁切，而在 clip 预算之前截断工具输出会隐藏卡片本就用来展示的信息。

**用普通 `overflow-y-auto` 元素替换 Radix ScrollArea。** 去掉表格包装确实能解决宽度，但会丢掉应用其他模块依赖的样式化滚动条，而给问题内容加一个类就能解决。

## Consequences

各行保持在视口内，长路径与摘要会折行而不是被裁掉，因此无法再从渲染出来的行里以单行形式复制它们。工具卡不再带 Card 的默认内边距。这个约束适用于此后加入该 transcript 的任何行：可能以不可断开形式到达的内容必须带 `wrap-anywhere`，否则整个 transcript 会再次被撑宽。用长路径、288 字符不可断开摘要和长中文散文做组件浏览器预览时，ScrollArea 内层表格宽度等于视口宽度、视口 `scrollWidth` 等于 `clientWidth`、没有任何元素横向溢出；`pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck` 与 `build` 通过。

## Related

[会话 Agent 工作台笔记](../feature/2026-09-05-rxlab-agent-session-workbench.zh.md) 负责本修复所渲染的 transcript 投影。
