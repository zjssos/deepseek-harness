# Agent Note: rxlab composes agent-presets as a management surface, not a session mount

[English](2026-09-09-rxlab-preset-management-surface.md) | 中文

Status: implemented

## Problem

rxlab profile 刻意保留 base 的 process-wide agent 组装：SPA 通过 Remote 面驱动普通会话，而不是 per-session agent preset。这导致工作台没有任何 preset 能力——没有 roster，也没有 Remote namespace——而 web profile 已 compose `agent-presets` 并带完整管理分区（`ui-agent-preset`）。工作台需要与 base profile 对齐的管理能力，但不能采纳会改变每个 rxlab 会话组装方式、并把业务模块耦合到 preset id 上的 per-session 组装。

## Decision

`dsh rxlab` profile 仅为 Remote namespace 与 settings 分区而 compose `@deepseek-ai/dsh-agent-presets`。`remote.agentPresets`（list/read/copy/deletePreset）与 `agent-presets` settings namespace（`default`）服务 SPA 的全局设置模块：渲染带 trust/默认/损坏标记的 roster，并提供设为默认、复制与删除。会话继续按 base process-wide agent plane 组装；`AgentPresets.mount()` 不会在其创建路径上被调用，因此 roster 是惰性的管理面。

SPA 的 preset 界面位于 `apps/rxlab-web/src/modules/settings/`，与模块设置编辑器并列；后者读取 host 的 `settings` describe 视图（`remote.settings.describe`），经 `update`/`mutate` 编辑顶层标量字段，使模块配置（包括 `web` 服务的 provider 选择）成为叠加在 composition base 之上的用户设置，而不是加载时冻结。

## Alternatives considered

**为什么不给 rxlab 会话上 per-session presets？** 让会话加入 preset 会把模型可见行从 host composition 挪进 standing mount——对每个现有会话都是真实行为变更，还要让第二种组装模式与 base 默认并存。bundle 注释里"agent plane 保持 base 默认"是有意为之；管理面不得连带改变会话组装。

**为什么不在 agent-presets 里做 `extends` 继承机制？** delta-preset 组合（`extends` + patch 行）在本决策之前已实现并回退：它把内置 preset 重构为 delta 来证明机制，超出需求所要求的对既有集合的改动量。管理面与组合机制是两个决策，当前工作只有前者。若按模块的 preset 成为真实需求，届时再重新审视组合，且保持内置集合不动。

**为什么只建在 web profile？** web profile 已有 `ui-agent-preset`；那里不加东西意味着 rxlab 工作台始终没有管理对齐，而这正是本决策要关闭的缺口。

## Consequences

agent-presets 的 `agent/created` advisory 会对每个 rxlab agent 触发（"published without joining an agent preset"）。它按设计只是建议性——裸 agent 是文档化的预期情形（ACP、SDK server、headless）——rxlab 接受这行日志作为 compose roster 的代价；没有 rxlab 会话加入 mount，`resolvedRoots` 仍为管理读取提供内置集合。preset 界面无法启动会话组装，损坏的 preset 不会阻塞 rxlab 会话，roster 会将其报告为损坏行。

`web` settings namespace 引入一个哨兵：空 `searchProvider`/`fetchProvider` 字符串表示"未选择"，与字段缺席一样回退到启动环境与自动选择，因为设置表单清空字段时写入 `''`，而空的 provider id 永远不会被注册。

## Testing

`packages/web/web/tests/web.spec.ts` 启动真实的文件后端 settings provider，断言分区覆盖 env、已配置的选择胜过另一个可用 provider、以及清空后重新继承。rxlab SPA 通过 `pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck && build` 检查其界面；host 侧组合改动除 roster 可解析外无自身行为。
