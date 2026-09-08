# Base vs Radix

API differences between `base` and `radix`. **This project is `base: radix`** (the monolithic `radix-ui` package) — always use the radix column here; `render` props and `items` props from Base UI do not exist in this codebase.

## Contents

- Composition: asChild vs render
- Button / trigger as non-button element
- Select (items prop, placeholder, positioning, multiple, object values)
- ToggleGroup (type vs multiple)
- Slider (scalar vs array)
- Accordion (type and defaultValue)

---

## Composition: asChild (radix) vs render (base)

Radix uses `asChild` to replace the default element. Base uses `render`. Don't wrap triggers in extra elements.

**Incorrect:**

```tsx
<DialogTrigger>
  <div>
    <Button>Open</Button>
  </div>
</DialogTrigger>
```

**Correct (radix — this project):**

```tsx
<DialogTrigger asChild>
  <Button>Open</Button>
</DialogTrigger>
```

**Correct (base):**

```tsx
<DialogTrigger render={<Button />}>Open</DialogTrigger>
```

This applies to all trigger and close components: `DialogTrigger`, `SheetTrigger`, `AlertDialogTrigger`, `DropdownMenuTrigger`, `PopoverTrigger`, `TooltipTrigger`, `CollapsibleTrigger`, `DialogClose`, `SheetClose`, `NavigationMenuLink`, `BreadcrumbLink`, `SidebarMenuButton`, `Badge`, `Item`.

---

## Button / trigger as non-button element (radix)

When the trigger renders a non-button element (`<a>`, `<span>`), `asChild` handles it directly.

**Correct (radix — this project):**

```tsx
<Button asChild>
  <a href="/docs">Read the docs</a>
</Button>
```

---

## Select

Radix uses inline JSX only; no `items` prop.

**Correct (radix — this project):**

```tsx
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select a fruit" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectItem value="apple">Apple</SelectItem>
      <SelectItem value="banana">Banana</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

**Placeholder.** Radix uses `<SelectValue placeholder="...">`. Base's `{ value: null }` items entry does not apply here.

**Content positioning.** Radix uses `position`:

```tsx
<SelectContent position="popper">
```

**Multiple selection and object values.** Radix is single-select with string values only. For multiple selection, compose `ToggleGroup type="multiple"` or checkbox lists instead.

---

## ToggleGroup

Radix uses `type="single"` or `type="multiple"`. Base uses a `multiple` boolean prop.

**Correct (radix — this project):**

```tsx
// Single, defaultValue is a string.
<ToggleGroup type="single" defaultValue="daily" spacing={2}>
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
  <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
</ToggleGroup>

// Multi-selection.
<ToggleGroup type="multiple">
  <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
  <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
</ToggleGroup>
```

**Controlled single value (radix):**

```tsx
const [value, setValue] = React.useState("normal")
<ToggleGroup type="single" value={value} onValueChange={setValue}>
```

---

## Slider

Radix always requires an array, including single thumbs.

**Correct (radix — this project):**

```tsx
<Slider defaultValue={[50]} max={100} step={1} />
```

Range sliders and controlled value use arrays directly:

```tsx
const [value, setValue] = React.useState([0.3, 0.7])
<Slider value={value} onValueChange={setValue} />
```

---

## Accordion

Radix requires `type="single"` or `type="multiple"` and supports `collapsible`. `defaultValue` is a string. Base uses no `type` prop and array defaults.

**Correct (radix — this project):**

```tsx
<Accordion type="single" collapsible defaultValue="item-1">
  <AccordionItem value="item-1">...</AccordionItem>
</Accordion>
```
