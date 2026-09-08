# AGENTS.md — rxlab-web

`apps/rxlab-web` is the React + shadcn SPA served by the `dsh rxlab` profile's bundle. UI work here follows the vendored [shadcn skill](../../.agents/skills/shadcn/SKILL.md) and the [rxlab-web UI skill](../../.agents/skills/dsh-rxlab-web-ui/SKILL.md); load both before writing component code.

- **Component rules live in the vendored shadcn skill.** Radix base (`asChild`, never `render`), semantic tokens only (`bg-primary`, `text-muted-foreground`; never raw palette colors), `gap-*` not `space-y-*`, `FieldGroup`/`Field` for forms, full Card/Dialog composition, lucide icons with `data-icon` and no sizing classes.
- **`src/components/ui/` is CLI-managed** — add or update only via `pnpm dlx shadcn@latest add <name>` from this directory; keep vendored `cn` imports as-is.
- **`src/index.css` is the only theme file** — `:root`/`.dark` OKLCH variables plus the `@theme inline` block (Tailwind v4, CSS-first; no tailwind.config).
- **Modules register through `src/modules/registry.tsx`** — one `ModuleDefinition` per workbench module with a lazy `Panel`; see the skill's assembly section before adding one.
- **Copy is zh inline** until the app gains a locale dictionary (see `src/modules/types.ts`); do not introduce English product copy or an ad-hoc i18n layer.
- **Verify with** `pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck && pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend build`.
