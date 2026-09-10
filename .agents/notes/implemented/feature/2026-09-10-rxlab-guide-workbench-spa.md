# Agent Note: rxlab guide workbench SPA with six-stage navigation and work orders

Status: implemented

English | [中文](2026-09-10-rxlab-guide-workbench-spa.zh.md)

## Problem

The rxlab workbench SPA (`apps/rxlab-web`) presented a flat rail of one-off capability panels — agent, collect, catalog wiki, fitting — plus three planned placeholders (`recommend` / `render` / `flow`). The guide-workbench replan recasts the product around a first-class work order (工单) and a six-stage workflow (验光 / 选框 / 选片 / 加工 / 取镜 / 售后). The SPA had to adopt the frozen routing contract, drive four Remote namespaces (`rxlabJob`, `rxlabRecommend`, `rxlabContent`, and the extended `rxlabUsage.jobUsage`), fold the old fitting and wiki panels into the new structure, and delete the placeholders. All work is confined to `apps/rxlab-web/**`; the host rows and bundle patch are owned by the integration stream.

## Decision

`ModuleDefinition` gains `group: 'stage' | 'tool'` and an optional `stage: StageId`; `registry.tsx` is the only manifest edit point and `app-sidebar.tsx` renders the two groups (配镜流程: 工单总览 + the six stages; 工具: 内容管理 / 采集 / 会话 Agent / 设置). Routes are `/jobs`, `/jobs/:jobId`, `/<stage>` bound to a work order through `?job=<id>`, and the tool routes; `App.tsx` resolves the job-detail page separately and redirects unknown paths to `/jobs`.

A shared `StageShell` resolves the bound work order and hands every stage panel a `StageContext` (runtime, job, all stage rows, the current stage row, reload); without a `?job` it shows the "先选/建工单" prompt. Each stage follows the same four-block pattern: 投入 → 确定性校验 (OK/WARN/FAIL) → 决策 / 清单 / 话术 → 产出 artifact. The 验光 panel reuses the fitting workbench (moved to `modules/exam/`) and writes `ExamStageArtifact` plus a `CompatibilityReport` mapped from the derive issues through `upsertStage`; the frame and lens panels resolve their target (`Prescription` + `FittingRecommendation`) by re-deriving from the exam stage's `fittingRecordId`, map catalog rows onto recommend candidates, call `suggest` and `validateFrame` / `validateLens`, and write stage artifacts. The 加工 / 取镜 / 售后 panels are generic field-driven shells persisted through `upsertStage`.

The 工单总览 lists and creates work orders; the detail page edits consumer / pricing / status, binds one agent session (preset `guide`, cwd `${workspaceRoot}/jobs/<id>`), calls `generateGuide`, renders the `GuideDocument`, exports a standalone HTML page, and joins `remote.rxlabUsage.jobUsage` for tokens and route-priced cost. The 内容管理 panel offers the 参照库 (catalog CRUD, reused from the former wiki panel) and knowledge / script CRUD over `rxlabContent`. `recommend` / `render` / `flow` are deleted; `fitting` is renamed to `exam`; `wiki` is renamed to `content`; the collect module's import path is updated. The `Field` primitive was added through `pnpm dlx shadcn@latest add field`.

## Alternatives considered

**Keep the flat rail and add 工单 / stages as more modules.** The workbench contracts freeze a grouped rail where the six stages are primary and the capability surfaces are secondary tools; a flat list would not express the workflow and would keep the deleted placeholders meaningful.

**Render all stages inside one stepper screen.** The contract fixes per-stage routes bound by `?job`, so each stage is linkable and independently reloadable; a single stepper would couple unrelated panels and lose deep links.

**Persist the derived `Prescription` inside the job stage.** The job domain stores cross-domain references as ids only, by contract; the frame and lens panels re-derive the target from the fitting record the exam stage references, keeping one authority for the prescription.

**Reuse the fitting panel directly as the frame / lens target view.** The fitting panel only renders its derive result; recommendation needs the typed `Prescription` and `FittingRecommendation` as request inputs, so a dedicated `useExamTarget` hook re-derives and gates the stage on a valid target.

## Consequences

The SPA now depends on `@deepseek-ai/dsh-rxlab-job`, `-recommend`, and `-content` (added to its devDependencies with the lockfile rows); `rxlab-usage` was already a dependency. Deterministic verdicts reach the UI only from the Host engines — the panels add no rule logic and no LLM talk. The guide HTML export is client-side string building. A stage without a bound work order is inert but still renders. Stage 4–6 checklists are static declarations in the SPA. The bundle patch, tsconfig aggregation, and API READMEs remain the integration stream's files.

## Testing

`pnpm --filter @deepseek-ai/dsh-rxlab-web-frontend typecheck` and `... build` are green on the source tree after `pnpm run build:lib` produced the workspace type declarations. The manifest resolves all eleven modules, the routes cover `/jobs`, `/jobs/:jobId`, the six stages, and the tools, and the app compiles the four new Remote namespaces. No browser smoke was run: the environment had no `DEEPSEEK_API_KEY` and no running `dsh rxlab` host, so the end-to-end stage writes, guide export, and usage join are unverified in a browser.

## Deferred

The 加工 / 取镜 / 售后 checklists are static and await the M2 content-driven milestone. Panels refresh lists on demand rather than subscribing to `domain/changed`. The PR's product-visible GUI change still needs a recorded browser GIF from the real server and model flow.
