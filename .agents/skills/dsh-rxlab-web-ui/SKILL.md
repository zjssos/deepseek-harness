---
name: dsh-rxlab-web-ui
description: >-
  Use when developing, reviewing, or debugging UI in apps/rxlab-web (the dsh
  rxlab workbench SPA): creating or editing modules, panels, shadcn components,
  theming, adding dependencies, or wiring the SPA to the rxlab host. Layers this
  repository's assembly and build conventions on top of the vendored shadcn skill.
---

# rxlab-web UI Development

`apps/rxlab-web` is the React + shadcn SPA for the `dsh rxlab` profile (glasses-packing workbench). This skill defines how UI work is assembled and verified here. For component-level styling, composition, forms, icons, and chat rules, first load the vendored [shadcn skill](../shadcn/SKILL.md) — everything there applies verbatim except where this file overrides it.

## Assembly: source layout and ownership

```
src/
  main.tsx, index.css        entry + sole theme file (Tailwind v4, :root/.dark + @theme inline)
  app/                       shell: App.tsx routes, WorkbenchLayout, ModuleWorkspace
  components/ui/             vendored shadcn component source — CLI-managed, never hand-write here
  components/                app-level composed components (app-sidebar, site-header, module-placeholder)
  modules/<name>/            one workbench module: Panel.tsx + client.ts + hooks + subcomponents
  lib/, hooks/               cn() utility (app-level) and shared hooks
```

- **Module registration is a manifest edit.** A module is a `ModuleDefinition` in `src/modules/registry.tsx` (id, zh label/tagline/description, scope, lucide icon, status, lazy `panel`) plus a directory with a default-exported `Panel` satisfying `ModulePanelProps`. `status: 'planned'` modules render `module-placeholder`; flipping to `'active'` means the panel is real.
- **Panels are lazy.** `registry.tsx` imports every `Panel` with `lazy(() => import(...))`; keep `Panel.tsx` as the module's route entry so code-splitting stays per-module.
- **The agent module is the transcript host.** `src/modules/agent/` owns sessions, composer, message list, and model selection against the headless Cordis client data layer (`dsh-client-*` workspace packages). New chat-adjacent UI composes it or the shadcn chat primitives, not bespoke scroll containers.
- **`components/ui/` is CLI-managed.** Add or update components only via `pnpm dlx shadcn@latest add <name>` from `apps/rxlab-web/`; hand-edits to vendored files need a reason and survive `--diff` reviews.
- **Two `cn` imports exist by design.** Vendored `components/ui/*` import `cn` from the `cn` package (CLI convention); app code imports `{ cn } from '@/lib/utils'`. Do not "fix" either to match the other.

## Build: compilation and serving

- **Vite + Tailwind v4.** `vite.config.ts` pins `base: './'` (the rxlab-app bundle may mount `dist/` under any directory), aliases `@` → `src/`, and stubs `node:module` plus loader internals for the browserized vendored Cordis loader — do not remove those defines; the vendored loader probes them.
- **Dev proxy.** `pnpm dev` (port 5174) forwards `/api` (with WebSocket for `/api/remote.mux`) and `/plugins` to a locally running `dsh rxlab` (`DSH_RXLAB_URL`, default `http://127.0.0.1:3081`). The browser cookie is authority-bound, so keep `changeOrigin: false`.
- **Theme edits go to `src/index.css` only** — `:root`/`.dark` variables plus the `@theme inline` block; follow [customization.md](../shadcn/customization.md).
- **Workspace rules still apply.** `@deepseek-ai/*` imports come from workspace packages (devDependencies of the app); `strict` TS with `noUncheckedIndexedAccess` is on, and every export keeps its JSDoc contract.

## Copy and i18n

The repository gate `verify-client-ui-i18n` does not yet cover `apps/rxlab-web`; current in-tree convention is **zh product copy inline**, recorded in `src/modules/registry.tsx` and `src/modules/types.ts` as "locale-owned later". Follow that precedent: write user-facing copy in Chinese, do not introduce English product copy, and do not add a parallel translation mechanism ad hoc. When the app gains a locale dictionary, migrate modules together — see the [locale-owned copy decision](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md) for the target mechanism.

## Workflow

1. **Load the shadcn skill** before writing component code; run `pnpm dlx shadcn@latest docs <component>` and fetch the URLs before first use of an unfamiliar component.
2. **Check installed components** in `src/components/ui/` before importing or re-adding; add missing ones via the CLI (this project is radix base — `asChild`, never `render`).
3. **New module** = new `src/modules/<name>/` directory + `ModuleDefinition` entry in `registry.tsx` + route resolution through `ModuleWorkspace` (no separate route edits needed).
4. **New shared UI** = CLI-added primitive in `components/ui/`, composed wrapper in `components/`, module-specific widget stays inside the module.
5. **Verify** from the repository root:

```sh
pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck
pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend build
pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend dev   # against a running `dsh rxlab`
```

Product-user-visible GUI changes also follow the repo-wide [GIF recording skill](../record-browser-gif/SKILL.md) when preparing a PR.
