---
name: shadcn
description: >-
  Manages shadcn components and projects — adding, searching, fixing, debugging,
  styling, and composing UI, including chat interfaces. Provides project context,
  component docs, and usage examples. Applies when working with shadcn/ui,
  component registries, or any project with a components.json file.
---

# shadcn/ui

A framework for building ui, components and design systems. Components are added as source code to the user's project via the CLI.

> **Vendoring provenance.** Pinned from [shadcn-ui/ui](https://github.com/shadcn-ui/ui) `skills/shadcn/` at commit `c257f688cf4de7ec10cc1be84cad29cd4631182c` (2026-09-04). Local adaptations: the upstream dynamic context injection is replaced by the static "Current Project Context" section below, and all CLI runners are normalized to `pnpm dlx` (this repository's package manager). Sync via the upstream repo; re-check `skills/shadcn/SKILL.md` and re-run the project-context command after any `components.json` change.

## Current Project Context (apps/rxlab-web)

Refresh this section from `apps/rxlab-web` with:

```sh
pnpm dlx shadcn@latest info --json
```

The JSON above would contain the project config and installed components. Use `pnpm dlx shadcn@latest docs <component>` to get documentation and example URLs for any component.

Key fields for this repository:

- **framework:** Vite SPA (React 19, `react-router-dom` v7); no RSC — never add `"use client"`.
- **packageManager:** pnpm — run every shadcn command as `pnpm dlx shadcn@latest ...` from `apps/rxlab-web/`.
- **style:** `new-york`; **base:** `radix` (the monolithic `radix-ui` package, e.g. `import { Slot } from 'radix-ui'`).
- **tailwindVersion:** `"v4"` — `@tailwindcss/vite` plugin, CSS-first config; tokens live in `apps/rxlab-web/src/index.css` (`:root`/`.dark` variables + `@theme inline` mapping). Never create another theme CSS file.
- **aliases:** `@/` → `apps/rxlab-web/src/`; `ui` → `@/components/ui`; `utils` → `@/lib/utils`; `hooks` → `@/hooks`.
- **iconLibrary:** `lucide` → `lucide-react` for all new work. Exception: the vendored dashboard block (`src/components/nav-*`, `section-cards.tsx`, `data-table.tsx`) still imports `@tabler/icons-react`; do not copy that pattern into new code.
- **installed components (`src/components/ui/`):** alert-dialog, avatar, badge, breadcrumb, button, card, chart, checkbox, dialog, drawer, dropdown-menu, input, label, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, table, tabs, textarea, toggle-group, toggle, tooltip.

## Principles

1. **Use existing components first.** Use `pnpm dlx shadcn@latest search` to check registries before writing custom UI. Check community registries too.
2. **Compose, don't reinvent.** Settings page = Tabs + Card + form controls. Dashboard = Sidebar + Card + Chart + Table.
3. **Use built-in variants before custom styles.** `variant="outline"`, `size="sm"`, etc.
4. **Use semantic colors.** `bg-primary`, `text-muted-foreground` — never raw values like `bg-blue-500`.

## Critical Rules

These rules are **always enforced**. Each links to a vendored file with Incorrect/Correct code pairs.

### Styling & Tailwind → [styling.md](./rules/styling.md)

- **`className` for layout, not styling.** Never override component colors or typography.
- **No `space-x-*` or `space-y-*`.** Use `flex` with `gap-*`. For vertical stacks, `flex flex-col gap-*`.
- **Use `size-*` when width and height are equal.** `size-10` not `w-10 h-10`.
- **Use `truncate` shorthand.** Not `overflow-hidden text-ellipsis whitespace-nowrap`.
- **No manual `dark:` color overrides.** Use semantic tokens (`bg-background`, `text-muted-foreground`).
- **Use `cn()` for conditional classes.** Don't write manual template literal ternaries.
- **No manual `z-index` on overlay components.** Dialog, Sheet, Popover, etc. handle their own stacking.

### Forms & Inputs → [forms.md](./rules/forms.md)

- **Forms use `FieldGroup` + `Field`.** Never use raw `div` with `space-y-*` or `grid gap-*` for form layout.
- **`InputGroup` uses `InputGroupInput`/`InputGroupTextarea`.** Never raw `Input`/`Textarea` inside `InputGroup`.
- **Buttons inside inputs use `InputGroup` + `InputGroupAddon`.**
- **Option sets (2–7 choices) use `ToggleGroup`.** Don't loop `Button` with manual active state.
- **`FieldSet` + `FieldLegend` for grouping related checkboxes/radios.** Don't use a `div` with a heading.
- **Field validation uses `data-invalid` + `aria-invalid`.** `data-invalid` on `Field`, `aria-invalid` on the control. For disabled: `data-disabled` on `Field`, `disabled` on the control.

### Component Structure → [composition.md](./rules/composition.md)

- **Items always inside their Group.** `SelectItem` → `SelectGroup`. `DropdownMenuItem` → `DropdownMenuGroup`. `CommandItem` → `CommandGroup`.
- **Use `asChild` (radix) for custom triggers.** This project is `base: radix`; never use base-UI's `render` prop. → [base-vs-radix.md](./rules/base-vs-radix.md)
- **Dialog, Sheet, and Drawer always need a Title.** `DialogTitle`, `SheetTitle`, `DrawerTitle` required for accessibility. Use `className="sr-only"` if visually hidden.
- **Use full Card composition.** `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`. Don't dump everything in `CardContent`.
- **Button has no `isPending`/`isLoading`.** Compose with `Spinner` + `data-icon` + `disabled`.
- **`TabsTrigger` must be inside `TabsList`.** Never render triggers directly in `Tabs`.
- **`Avatar` always needs `AvatarFallback`.** For when the image fails to load.

### Use Components, Not Custom Markup → [composition.md](./rules/composition.md)

- **Use existing components before custom markup.** Check if a component exists before writing a styled `div`.
- **Callouts use `Alert`.** Don't build custom styled divs.
- **Empty states use `Empty`.** Don't build custom empty state markup.
- **Toast uses Sonner.** This project is Radix-based: `import { toast } from 'sonner'` (the `sonner` component is installed in `src/components/ui/sonner.tsx`).
- **Use `Separator`** instead of `<hr>` or `<div className="border-t">`.
- **Use `Skeleton`** for loading placeholders. No custom `animate-pulse` divs.
- **Use `Badge`** instead of custom styled spans.

### Icons → [icons.md](./rules/icons.md)

- **Icons in `Button` use `data-icon`.** `data-icon="inline-start"` or `data-icon="inline-end"` on the icon.
- **No sizing classes on icons inside components.** Components handle icon sizing via CSS. No `size-4` or `w-4 h-4`.
- **Pass icons as objects, not string keys.** `icon={CheckIcon}`, not a string lookup.

### Chat & Messaging → [chat.md](./rules/chat.md)

- **Chat UI composes the chat primitives.** Conversations use `MessageScroller`, rows use `Message`, surfaces use `Bubble`. Never hand-rolled bubble `div`s or a raw scroll container.
- **`MessageScroller` owns scroll behavior.** Streaming follow, anchoring, and jump-to-latest (`MessageScrollerButton`) are built in. Don't write a `useStickToBottom`/`ResizeObserver` hook.
- **Attachments use `Attachment`; system notes and dividers use `Marker`.** Not `Item` cards or `Separator` + a label.

## Key Patterns

These are the most common patterns that differentiate correct shadcn/ui code. For edge cases, see the linked rule files above.

```tsx
// Form layout: FieldGroup + Field, not div + Label.
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// Validation: data-invalid on Field, aria-invalid on the control.
<Field data-invalid>
  <FieldLabel>Email</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>Invalid email.</FieldDescription>
</Field>

// Icons in buttons: data-icon, no sizing classes.
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

// Spacing: gap-*, not space-y-*.
<div className="flex flex-col gap-4">  // correct
<div className="space-y-4">           // wrong

// Equal dimensions: size-*, not w-* h-*.
<Avatar className="size-10">   // correct
<Avatar className="w-10 h-10"> // wrong

// Status colors: Badge variants or semantic tokens, not raw colors.
<Badge variant="secondary">+20.1%</Badge>    // correct
<span className="text-emerald-600">+20.1%</span> // wrong
```

## Component Selection

| Need                       | Use                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Button/action              | `Button` with appropriate variant                                                                   |
| Form inputs                | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider` |
| Toggle between 2–5 options | `ToggleGroup` + `ToggleGroupItem`                                                                   |
| Data display               | `Table`, `Card`, `Badge`, `Avatar`                                                                  |
| Navigation                 | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination`                                     |
| Overlays                   | `Dialog` (modal), `Sheet` (side panel), `Drawer` (bottom sheet), `AlertDialog` (confirmation)       |
| Feedback                   | `toast` (Base UI), `sonner` (Radix/Aria), `Alert`, `Progress`, `Skeleton`, `Spinner`                 |
| Command palette            | `Command` inside `Dialog`                                                                           |
| Charts                     | `Chart` (wraps Recharts)                                                                            |
| Layout                     | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible`                          |
| Empty states               | `Empty`                                                                                             |
| Menus                      | `DropdownMenu`, `ContextMenu`, `Menubar`                                                            |
| Tooltips/info              | `Tooltip`, `HoverCard`, `Popover`                                                                   |
| Chat / conversation UI     | `MessageScroller`, `Message`, `Bubble`, `Attachment`, `Marker`                                      |

## Component Docs, Examples, and Usage

Run `pnpm dlx shadcn@latest docs <component>` to get the URLs for a component's documentation, examples, and API reference. Fetch these URLs to get the actual content.

```sh
pnpm dlx shadcn@latest docs button dialog select
```

**When creating, fixing, debugging, or using a component, always run `pnpm dlx shadcn@latest docs` and fetch the URLs first.** This ensures you're working with the correct API and usage patterns rather than guessing.

## Workflow

1. **Get project context** — see "Current Project Context" above; re-run `pnpm dlx shadcn@latest info --json` from `apps/rxlab-web/` to refresh.
2. **Check installed components first** — before running `add`, always check the `components` list from project context or list `apps/rxlab-web/src/components/ui/`. Don't import components that haven't been added, and don't re-add ones already installed.
3. **Find components** — `pnpm dlx shadcn@latest search`.
4. **Get docs and examples** — run `pnpm dlx shadcn@latest docs <component>` to get URLs, then fetch them. Use `pnpm dlx shadcn@latest view` to browse registry items you haven't installed. To preview changes to installed components, use `pnpm dlx shadcn@latest add --diff`.
5. **Install or update** — `pnpm dlx shadcn@latest add` (run from `apps/rxlab-web/`). When updating existing components, use `--dry-run` and `--diff` to preview changes first (see [Updating Components](#updating-components) below).
6. **Fix imports in third-party components** — After adding components from community registries (e.g. `@bundui`, `@magicui`), check the added non-UI files for hardcoded import paths like `@/components/ui/...`. These won't match the project's actual aliases. Use `pnpm dlx shadcn@latest info` to get the correct `ui` alias and rewrite the imports accordingly. The CLI rewrites imports for its own UI files, but third-party registry components may use default paths that don't match the project.
7. **Review added components** — After adding a component or block from any registry, **always read the added files and verify they are correct**. Check for missing sub-components (e.g. `SelectItem` without `SelectGroup`), missing imports, incorrect composition, or violations of the [Critical Rules](#critical-rules). Also replace any icon imports with `lucide-react` (this project's `iconLibrary`). Fix all issues before moving on.
8. **Registry must be explicit** — When the user asks to add a block or component, **do not guess the registry**. If no registry is specified, ask which registry to use. Never default to a registry on behalf of the user.

## Updating Components

When the user asks to update a component from upstream while keeping their local changes, use `--dry-run` and `--diff` to intelligently merge. **NEVER fetch raw files from GitHub manually — always use the CLI.**

1. Run `pnpm dlx shadcn@latest add <component> --dry-run` to see all files that would be affected.
2. For each file, run `pnpm dlx shadcn@latest add <component> --diff <file>` to see what changed upstream vs local.
3. Decide per file based on the diff:
   - No local changes → safe to overwrite.
   - Has local changes → read the local file, analyze the diff, and apply upstream updates while preserving local modifications.
   - User says "just update everything" → use `--overwrite`, but confirm first.
4. **Never use `--overwrite` without the user's explicit approval.**

## Quick Reference

```sh
# Run from apps/rxlab-web/ (the directory with components.json).
pnpm dlx shadcn@latest init

# Add components.
pnpm dlx shadcn@latest add button card dialog
pnpm dlx shadcn@latest add @magicui/shimmer-button
pnpm dlx shadcn@latest add owner/repo/item

# Preview changes before adding/updating.
pnpm dlx shadcn@latest add button --dry-run
pnpm dlx shadcn@latest add button --diff button.tsx

# Search registries.
pnpm dlx shadcn@latest search @shadcn -q "sidebar"
pnpm dlx shadcn@latest search                          # all configured registries

# Get component docs and example URLs.
pnpm dlx shadcn@latest docs button dialog select

# View registry item details (for items not yet installed).
pnpm dlx shadcn@latest view @shadcn/button

# Project info as JSON.
pnpm dlx shadcn@latest info --json
```

## Detailed References

- [rules/forms.md](./rules/forms.md) — FieldGroup, Field, InputGroup, ToggleGroup, FieldSet, validation states
- [rules/composition.md](./rules/composition.md) — Groups, overlays, Card, Tabs, Avatar, Alert, Empty, Toast, Separator, Skeleton, Badge, Button loading
- [rules/chat.md](./rules/chat.md) — MessageScroller, Message, Bubble, Attachment, Marker; streaming, anchoring, jump-to-latest
- [rules/icons.md](./rules/icons.md) — data-icon, icon sizing, passing icons as objects
- [rules/styling.md](./rules/styling.md) — Semantic colors, variants, className, spacing, size, truncate, dark mode, cn(), z-index
- [rules/base-vs-radix.md](./rules/base-vs-radix.md) — asChild vs render, Select, ToggleGroup, Slider, Accordion
- [customization.md](./customization.md) — Theming, CSS variables, extending components
- [CLI reference (upstream)](https://raw.githubusercontent.com/shadcn-ui/ui/c257f688cf4de7ec10cc1be84cad29cd4631182c/skills/shadcn/cli.md) — commands, flags, presets, templates (not vendored: preset/init flows are out of scope for this repo)
- [Registry authoring (upstream)](https://raw.githubusercontent.com/shadcn-ui/ui/c257f688cf4de7ec10cc1be84cad29cd4631182c/skills/shadcn/registry.md) — building custom registries (not vendored: no registry publisher in this repo)
