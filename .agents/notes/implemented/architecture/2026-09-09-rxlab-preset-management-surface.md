# Agent Note: rxlab composes agent-presets as a management surface, not a session mount

Status: implemented

English | [中文](2026-09-09-rxlab-preset-management-surface.zh.md)

## Problem

The rxlab profile deliberately keeps the base process-wide agent composition: its SPA drives ordinary sessions over the Remote surface, not per-session agent presets. That left the workbench without any preset story — no roster, no Remote namespace — while the web profile composes `agent-presets` and ships a full management section (`ui-agent-preset`). The workbench needed a management capability at parity with the base profile without adopting per-session composition, which would change how every rxlab session is assembled and would couple business modules to a preset id.

## Decision

The `dsh rxlab` profile composes `@deepseek-ai/dsh-agent-presets` for its Remote namespace and settings section only. `remote.agentPresets` (list/read/copy/deletePreset) and the `agent-presets` settings namespace (`default`) serve the SPA's global-settings module, which renders the roster with trust/default/broken badges and offers set-default, copy, and delete. Sessions keep composing over the base process-wide agent plane; `AgentPresets.mount()` is never called on their creation path, so the roster is an inert management surface.

The SPA's preset surface lives in `apps/rxlab-web/src/modules/settings/` beside the module-settings editor, which reads the host's `settings` describe view (`remote.settings.describe`) and edits top-level scalar fields through `update`/`mutate`, so module picks (the `web` service's provider picks among them) are user settings layered over the composition base rather than frozen at load.

## Alternatives considered

**Why not per-session presets for rxlab sessions?** Joining sessions to a preset would move the model-facing rows out of the host composition into a standing mount — a real behavior change for every existing session and a second assembly mode to keep working beside the base defaults. The bundle comment that keeps the agent plane on base defaults is deliberate; a management surface must not drag session composition along.

**Why not an `extends` inheritance mechanism inside agent-presets?** A delta-preset composition (`extends` + patch rows) was built and reverted before this decision: it refactored the shipped presets to prove the mechanism, which was more change to the shipped set than the need justified. Management surfaces and composition mechanisms are different decisions; only the first is current work. If per-module presets become real, composition should be revisited then, with the shipped set left alone.

**Why not build the surface in the web profile only?** The web profile already has `ui-agent-preset`; adding nothing there means the rxlab workbench stays without management parity, which is the gap this decision closes.

## Consequences

The `agent/created` advisory in agent-presets fires for every rxlab agent ("published without joining an agent preset"). It is advisory by design — bare agents are a documented expected case (ACP, SDK server, headless) — and rxlab accepts the log line as the price of composing the roster; no rxlab session joins a mount, and `resolvedRoots` still supplies the shipped set for management reads. The preset surface cannot start a session's composition, so a broken preset never blocks an rxlab session; the roster reports it as a broken row instead.

The `web` settings namespace introduces one sentinel: an empty `searchProvider`/`fetchProvider` string means "no pick" and falls through to the launch env and auto-select, exactly like an absent field, because a settings form's cleared field writes `''` and an empty provider id can never be registered.

## Testing

`packages/web/web/tests/web.spec.ts` boots a real file-backed settings provider and asserts the section overrides the env, that a configured pick wins over another usable provider, and that clearing re-inherits. The rxlab SPA checks its surface through `pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck && build`; the host-side composition change has no behavior of its own beyond the roster being resolvable.
