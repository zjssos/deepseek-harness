# Customization & Theming

Components reference semantic CSS variable tokens. Change the variables to change every component.

In this repository the theme file is `apps/rxlab-web/src/index.css` (Tailwind v4, CSS-first). Never create another CSS file for tokens.

## Contents

- How it works (CSS variables → Tailwind utilities → components)
- Color variables and OKLCH format
- Dark mode setup
- Changing the theme
- Adding custom colors (Tailwind v4)
- Border radius
- Customizing components (variants, className, wrappers)
- Checking for updates

---

## How It Works

1. CSS variables defined in `:root` (light) and `.dark` (dark mode) in `src/index.css`.
2. Tailwind maps them to utilities via the `@theme inline` block: `bg-primary`, `text-muted-foreground`, etc.
3. Components use these utilities — changing a variable changes all components that reference it.

---

## Color Variables

Every color follows the `name` / `name-foreground` convention. The base variable is for backgrounds, `-foreground` is for text/icons on that background.

| Variable                                     | Purpose                          |
| -------------------------------------------- | -------------------------------- |
| `--background` / `--foreground`              | Page background and default text |
| `--card` / `--card-foreground`               | Card surfaces                    |
| `--primary` / `--primary-foreground`         | Primary buttons and actions      |
| `--secondary` / `--secondary-foreground`     | Secondary actions                |
| `--muted` / `--muted-foreground`             | Muted/disabled states            |
| `--accent` / `--accent-foreground`           | Hover and accent states          |
| `--destructive` / `--destructive-foreground` | Error and destructive actions    |
| `--border`                                   | Default border color             |
| `--input`                                    | Form input borders               |
| `--ring`                                     | Focus ring color                 |
| `--chart-1` through `--chart-5`              | Chart/data visualization         |
| `--sidebar-*`                                | Sidebar-specific colors          |
| `--surface` / `--surface-foreground`         | Secondary surface                |

Colors use OKLCH: `--primary: oklch(0.205 0 0)` where values are lightness (0–1), chroma (0 = gray), and hue (0–360).

---

## Dark Mode

Class-based toggle via `.dark` on the root element (`@custom-variant dark (&:is(.dark *));` is already declared in `src/index.css`). Use `next-themes` (already a devDependency) with `attribute="class"`.

---

## Changing the Theme

```sh
# Run from apps/rxlab-web/.
pnpm dlx shadcn@latest apply --preset a2r6bw
```

Or edit CSS variables directly in `src/index.css`. Keep both `:root` and `.dark` blocks in sync when adding variables.

---

## Adding Custom Colors (Tailwind v4)

Add variables to `src/index.css`. Never create a new CSS file for this.

```css
/* 1. Define in the global CSS file. */
:root {
  --warning: oklch(0.84 0.16 84);
  --warning-foreground: oklch(0.28 0.07 46);
}
.dark {
  --warning: oklch(0.41 0.11 46);
  --warning-foreground: oklch(0.99 0.02 95);
}

/* 2. Register with Tailwind v4 (@theme inline) in the same file. */
@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```

```tsx
// 3. Use in components.
<div className="bg-warning text-warning-foreground">Warning</div>
```

---

## Border Radius

`--radius` controls border radius globally. Components derive values from it (`rounded-lg` = `var(--radius)`, `rounded-md` = `calc(var(--radius) - 2px)`).

---

## Customizing Components

See also [rules/styling.md](./rules/styling.md) for Incorrect/Correct examples.

Prefer these approaches in order:

### 1. Built-in variants

```tsx
<Button variant="outline" size="sm">
  Click
</Button>
```

### 2. Tailwind classes via `className` (layout only)

```tsx
<Card className="mx-auto max-w-md">...</Card>
```

### 3. Add a new variant

Edit the component source in `src/components/ui/` to add a variant via `cva`:

```tsx
// src/components/ui/button.tsx
warning: "bg-warning text-warning-foreground hover:bg-warning/90",
```

### 4. Wrapper components

Compose shadcn/ui primitives into higher-level components under `src/components/` (not `src/components/ui/`):

```tsx
export function ConfirmDialog({ title, description, onConfirm, children }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

---

## Checking for Updates

```sh
# Run from apps/rxlab-web/.
pnpm dlx shadcn@latest add button --dry-run        # see all affected files
pnpm dlx shadcn@latest add button --diff button.tsx # see the diff for a specific file
```
