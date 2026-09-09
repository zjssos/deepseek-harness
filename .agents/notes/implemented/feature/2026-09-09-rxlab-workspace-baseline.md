# Agent Note: rxlab workbench workspace baseline — one module-structured workspace

Status: implemented

English | [中文](2026-09-09-rxlab-workspace-baseline.zh.md)

## Problem

The rxlab modules' durable data lived outside any workspace: `rxlab_collect`/`rxlab_catalog` units under `$DSH_HOME/storages-rxlab/`, while agent sessions ran in the Host process's `process.cwd()` (the SPA never sent `cwd`, `apps/rxlab-web/src/modules/agent/use-sessions.ts`). Agents therefore could not read or produce module artifacts through file tools, and there was no single tree to export for initialization. The agreed baseline: the workbench uses one workspace directory, structured by module subdirectories, with module agents guided by `AGENTS.md`/skills/presets, and the workspace importable/exportable later.

## Decision

`@deepseek-ai/dsh-rxlab-app/workspace-paths` (`packages/bundle/rxlab-app/src/workspace-paths.ts`) owns the workspace seam:

- Registers the `rxlab-workspace` settings namespace (schema: `root`; `applies: 'restart'`, because consumers resolve the root once at composition) with the patch-provided composition base `dshHomePath('rxlab-workspace')`.
- Provides the `rxlabPaths` service: `workspaceRoot` (`~`-expanded, resolved) and `storageRoot = <workspaceRoot>/.rxlab/storage`. The bundle patch points `storage-json`'s `root` at `ctx.rxlabPaths.storageRoot`, so all business storage units (`rxlab_collect`, `rxlab_catalog`, workspace records) live inside the workspace while the settings document and session logs stay in `$DSH_HOME` (the settings document defines where the workspace is, so it cannot live inside it).
- Bootstraps the skeleton on first activation, before the service publishes: module directories (`collect/`, `wiki/`, `exports/`, `.dsh/skills/`), guidance files (`AGENTS.md` at the root and per module, written only when absent so user edits survive), and a best-effort `git init` — without a `.git` marker, `findProjectRoot` in agent-instructions and skill-filesystem falls back to the session cwd, so root-level guidance and workspace skills would never be discovered by per-module sessions. Directory/file failures fail the load; git absence only warns.
- The patch row gates on `rxlabStartup`, so `dsh --profile rxlab --help` never creates the workspace or registers the namespace.

Sandbox interplay (verified in `packages/sandbox/sandbox-policy/src/index.ts`): the `workspace-write` writable root is the session cwd. Module sessions created with `cwd = <workspaceRoot>/<module>` can write their own artifacts but not `.rxlab/storage`; business data stays reachable only through the typed Remote namespaces. General agent sessions (cwd = the workspace root) can write the whole tree.

The SPA now sends `cwd` on session creation: preset-less sessions and unknown presets run at the workspace root; the `collect` preset maps to `collect/` (`MODULE_SESSION_SUBDIRS` in `apps/rxlab-web/src/modules/agent/Panel.tsx`). The root is read live from `settings.describe()` (`useWorkspaceRoot` in `use-sessions.ts`); an older host without the namespace falls back to the host default cwd. Per-module workspace records in the workspace registry are the accepted tradeoff of per-module cwd.

Supporting change: `SettingsProvider.installSection` now forwards an optional `applies` from its hooks, so restart-semantics namespaces registered through the helper surface the honest restart badge.

## Alternatives considered

**Keep storage at `$DSH_HOME/storages-rxlab` and project exports into the workspace.** Rejected by the product owner: the workspace should hold business data directly so import/export is a directory operation, and the storage-inside-workspace placement combined with per-module cwd keeps the structured data out of the fs tools' write scope anyway.

**One session cwd at the workspace root for all modules.** Simpler, but module guidance injection would be limited to the root `AGENTS.md`, and agents could write `.rxlab/storage` through fs tools; per-module cwd was chosen by the product owner for the isolation.

**Skeleton without `git init`.** Rejected after verifying the fallback behavior: both `findProjectRoot` implementations return the cwd itself when no `.git` exists, collapsing instruction discovery to the cwd directory and project skills to `<cwd>/.dsh/skills`.

## Consequences

Changing the workspace root in settings is a data migration: the storage backend resolves the new root at the next start and old data stays at the old location; the restart badge and README copy say so, and the later import/export wave is the sanctioned migration path. Module preset → subdirectory mapping lives in the SPA until preset metadata can carry it.

Non-obvious constraint discovered while wiring the SPA: the rxlab-web program contains two conflicting `Context.sessions` augmentations (host `@deepseek-ai/dsh-session` declares `SessionStore`; client `@deepseek-ai/dsh-api-session-controller/client` declares `ISessions`), and under `skipLibCheck` the first declaration entered into the program wins. Bare package type imports such as `import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets'` (whose `index.d.ts` reaches the host session augmentation) silently flip `ctx.sessions` to `SessionStore` when their import site moves earlier in the graph. Type-only imports of these packages from SPA modules must use the `/types` subpath (as `use-sessions.ts` already did); both settings-module offenders now do.

## Testing

`packages/bundle/rxlab-app/tests/workspace-paths.spec.ts` boots a real file-backed settings provider plus the service over a temp home and asserts the storage-root derivation inside the workspace, skeleton creation (directories + zh guidance files), the settings-document override with `restart` in describe, and idempotent re-bootstrap. A settings suite case covers the `applies` forwarding. SPA: `typecheck` + `build` green.
