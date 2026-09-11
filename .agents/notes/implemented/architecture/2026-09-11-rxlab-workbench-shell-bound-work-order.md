# Agent Note: The rxlab workbench binds one work order in the shell

Status: implemented

English | [中文](2026-09-11-rxlab-workbench-shell-bound-work-order.zh.md)

## Problem

`apps/rxlab-web` was built on a generic dashboard template: a collapsible module rail, a top bar carrying only the module name, and a `max-w-5xl` centered content column. The six stages each owned a standalone route and re-resolved the same `?job=<id>` work order, and the module rail treated 工单总览, the six stages, the tools, and 全局设置 as peers. The work order was the actual unit of work — a consumer with a staged workflow, a bound agent session, and an assembled guide — but nothing in the shell made it the surface: the operator had to re-bind a work order on every stage route, could not see cross-stage progress outside one stage, and navigated a rail of independent pages.

## Decision

The work order is the work-order surface's unit of work, and the two surfaces are kept apart: everything under `/jobs` is about one work order, and the tool modules are not about work orders at all.

**Two surfaces, two shells.** `WorkbenchLayout` (`src/app/WorkbenchLayout.tsx`) selects a shell by path. Under `/jobs` it mounts `WorkbenchJobProvider` plus `WorkOrderHeader` and the collapsible `JobContextRail`; anywhere else it mounts `ModuleHeader` and nothing work-order-related. Only the work-order routes carry a binding, so a tool module cannot read one.

**Binding.** `WorkbenchJobProvider` (`src/app/workbench-context.tsx`) owns the work-order surface's binding: the `/jobs/<id>` path is authoritative while the workbench is open, and elsewhere on the surface the binding is the last opened work order, remembered across reloads in `localStorage` (`rxlab:current-job`). Opening a work order writes it back to storage, so the overview and the stage redirects resolve to the work order the operator last looked at. The `?job=` search param is gone — stage views are no longer routes that would need to carry a work order. `rememberedJobId()` is exported for the one caller outside the provider (the stage redirect below).

**Work-order top bar** (`src/components/work-order-header.tsx`): the trail — `工单总览 › <consumer>` on the workbench, `工单总览` on the overview — where the first segment links back to the overview, plus the work-order picker, the 更多 menu, the rail toggle, and the theme toggle. The picker navigates when the workbench route is open and only binds otherwise.

**Tool top bar** (`src/components/module-header.tsx`): a 工单总览 back button, a separator, the module name, and the 更多 menu plus the theme toggle. No work-order picker, no rail, no binding. `MoreMenu` (`src/components/more-menu.tsx`) and `ThemeToggle` (`src/components/theme-toggle.tsx`) are shared by both bars; `src/components/site-header.tsx` is gone.

**Work-order workbench.** `/jobs/:jobId` renders the workbench (`src/modules/jobs/JobDetail.tsx`): the shared `PanelHeader` (consumer, status, pricing, actions) on top, and beneath it a left view list — 配镜流程 (验光 / 选框 / 选片 / 加工 / 取镜 / 售后) plus 工单 (会话 / 配镜指南 / 用量与成本) — with the selected view rendered on the right. The selection lives in `?view=` and defaults to the first stage the workflow has not closed. The six stage panels render inside this workbench; they are not routes.

**Stages.** A stage key in the URL (`/exam`, `/frame`, …) is not a route: `ModuleWorkspace` redirects it to the workbench view of the remembered work order, or to `/jobs` when none is remembered. It reads that binding through `rememberedJobId()`, because it renders outside the provider. `StageShell` no longer renders its own title block or work-order picker — the workbench frame owns both — and is now only the boot/load boundary handing a stage panel its typed `StageContext`.

**Context.** The right rail exists only on the work-order surface, where it shows the bound work order's identity, its six-stage progress, and the jump into the next open stage. The workbench does not repeat that display: the left view list is a switcher without status markers (operator chose this split in review). On the overview, where nothing needs to be bound, the rail explains the list instead of offering a link to the page it is already on.

**Manifest and shared vocabulary.** `src/modules/registry.tsx` groups modules as `core` (工单总览), `stage` (the six in-workbench stages), and `tool` (top-bar tools); `stageModules()` and `toolModules()` drive the workbench view list and the 更多 menu. The density tokens in `src/index.css` (`--header-height`, `--workbench-gutter`, `--workbench-panel-gap`, `--workbench-full-height`; oklch palette, `--radius: 0.5rem`), `PanelHeader`, `JOB_STATUS_LABELS`, `STAGE_STATUS_LABELS`, `StageStatusBadge`, and `formatDateTime` all remain. `MODULE_GROUP_LABELS` was deleted with the sidebar, and the old dashboard-block shell (`app-sidebar.tsx`) with it.

## Alternatives considered

**Why not one shell that hides the work-order controls on tool routes?** That is what this replaces: a single shell that wrapped every route in `WorkbenchJobProvider` put the work-order picker, the binding, and the context rail in front of 内容管理, 采集, 会话 Agent, and 全局设置, which have no work order. Hiding the controls would still have listed work orders at boot and still have made a tool module depend on a binding it never uses. Selecting the shell by path makes the separation structural rather than cosmetic.

**Why not keep one route per stage?** The six stages edited the same work order, so an operator had to re-bind it on every stage route and could not see the workflow whole; separate routes for one work order's progression are an information-architecture artifact, not a capability. Merging them into the work-order workbench keeps every stage one click from the work order that owns it (this supersedes the earlier per-stage `?job=` routing).

**Why a 更多 dropdown instead of another page or a sidebar?** Tools and settings are occasional support, not the work of either surface. A top-bar menu keeps the work-order surface maximal; a sidebar for four entries would give rarely-used navigation a fifth of the window, and a separate menu page would make reaching a tool take two hops.

**Why keep the top-bar picker on the work-order surface at all?** 工单总览 needs no binding, but the workbench does, and the operator switches work orders from there without going back to the list. The picker is part of the work-order surface's own navigation, not of the shell.

**Why is `/jobs/<id>` authoritative instead of the picker state?** A workbench cannot exist without its work order; the id in the path keeps reloads, deep links, and the picker consistent, and `localStorage` is only the fallback for the overview and the stage redirects.

**Why drop `?job=`?** With stages no longer routes there is no second surface that needs to name a work order; the id lives in the path or the memory. A param would only have created a second source of truth to keep in sync.

## Consequences

An operator lands on 工单总览, opens a work order, and works the stages, the session, the guide, and the usage from one workbench, with the picker and the rail showing the same work order. The tool modules are reached from either top bar and behave as standalone tools; the only work-order affordance they carry is the 工单总览 button.

Removed surfaces: the module sidebar, the single shared shell, the six standalone stage routes, `?job=` routing, and the dashboard-block shell. Bookmarks to `/exam` etc. land on the workbench stage view of the remembered work order, or `/jobs` when none is remembered.

Costs and edges: the work-order surface fetches the work-order list whenever it is mounted (the tool modules no longer do); switching between the surfaces remounts the panel subtree, because the shells differ; a workbench URL whose id no longer exists shows a failure card; `StageShell` and the stage panels are coupled to the work-order provider and cannot be mounted standalone; the rail and its toggle are hidden below `lg`. `ModuleAgentSurface` (embedded in 采集's tabs) keeps its own `h-[calc(100svh-16rem)]`, because the height available there is not the shell's `--workbench-full-height`.

Verification was `pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck` and `build`. No browser run against a live `dsh rxlab` host was possible in this environment, and the app has no recorded-session snapshot harness, so the two shells' visual result is unverified here.