# Agent Note: Keep rxlab transcript rows inside the ScrollArea viewport

Status: implemented

English | [中文](2026-09-09-rxlab-transcript-wrap-long-tokens.zh.md)

## Problem

The rxlab session-Agent transcript clipped every row on the right as soon as one tool call carried a long unbroken string: a Windows path, JSON arguments, or a tool output line. `MessageList` renders inside a Radix ScrollArea, which wraps its children in a `display: table` element with `min-width: 100%`. A table's shrink-to-fit width is bounded below by its content's min-content width, so one unbreakable line widened the whole transcript past the viewport. The viewport hides horizontal overflow (the app mounts only a vertical scrollbar), so `w-full` and `max-w-[85%]` resolved against the over-wide table and every row was cut mid-text with no way to scroll to it. The tool card also kept the shadcn `Card` defaults (`py-6`, `gap-6`) while overriding only its header and content padding, leaving 24px bands of empty space around a compact summary.

## Decision

Every long-text surface in [MessageList.tsx](../../../../apps/rxlab-web/src/modules/agent/MessageList.tsx) carries `wrap-anywhere` (`overflow-wrap: anywhere`) next to its existing `whitespace-pre-wrap`: user and assistant text, the reasoning body, tool arguments and results, context bodies, and the agent-error banner. The flex items holding them carry `min-w-0`. `overflow-wrap: anywhere` lowers an element's min-content width, so the ScrollArea's table stays at viewport width instead of growing with its content. `ToolCard` overrides the Card defaults with `gap-0 py-0` and uses `gap-*` in place of `space-y-*`.

## Alternatives considered

**Horizontal scrolling inside the transcript.** Verbatim long lines would stay intact, but the viewport mounts only a vertical scrollbar, so a reader would scroll sideways inside each card to read one path; the transcript is a conversation, not a code viewer.

**`break-all` on the tool blocks only.** `word-break: break-all` also lowers min-content width, but it splits words that would fit on the next line, which reads badly in prose and in the reasoning body.

**Trim long lines in the `transcript.ts` projection.** Hiding the width problem would leave the assistant text and reasoning clipped, and truncating tool output before its clip budget hides what the card exists to show.

**Replace the Radix ScrollArea with a plain `overflow-y-auto` element.** Removing the table wrapper fixes the width, but drops the styled scrollbar the app's other modules rely on for a fix that a class on the offending content already carries.

## Consequences

Rows stay inside the viewport, and long paths and digests wrap across lines instead of being clipped, so they can no longer be copied from the rendered row as a single line. Tool cards lose the Card default padding. The constraint applies to any future row added to this transcript: content that can arrive unbroken must carry `wrap-anywhere`, or the whole transcript widens again. A browser preview of the component with long paths, a 288-character unbroken digest, and long Chinese prose reports the ScrollArea's inner table width equal to the viewport width, viewport `scrollWidth` equal to `clientWidth`, and no element with horizontal overflow; `pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck` and `build` pass.

## Related

[The session agent workbench note](../feature/2026-09-05-rxlab-agent-session-workbench.md) owns the transcript projection this fix renders.
