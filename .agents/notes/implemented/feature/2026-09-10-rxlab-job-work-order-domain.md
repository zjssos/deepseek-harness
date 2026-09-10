# Agent Note: rxlab job work-order domain and deterministic guide assembly

Status: implemented

English | [中文](2026-09-10-rxlab-job-work-order-domain.zh.md)

## Problem

The rxlab 配镜指南 workbench needed a first-class work order: the prototype held `JobState` in process and produced `result.html` ad hoc, so a job could not survive a restart, be read by the SPA, or be assembled from the deterministic stage artifacts the workbench already computes. The re-planned architecture makes `rxlab_job` the one new orchestration domain, with six stages, a typed Remote, a deterministic guide assembler, and a matching agent preset. It also needs the stage-anchored tool call that later attributes a session round to a stage for accounting.

## Decision

Ship a new dual-face package `@deepseek-ai/dsh-rxlab-job` under `packages/api/`, mirroring `@deepseek-ai/dsh-rxlab-fitting` (same Host/Client split, `clientBundle(..., { hostPhase: true })`, `defineDomain`, `TypertRemoteService`, self-mounting `/client`, and no membership in the platform `api-remotes` assembly).

### The storage domain

`rxlab_job` is version 1, `per-record`, with three tables:

- `jobs` keyed by `JobId`: `{ id, consumer, status: draft|in-progress|complete|archived, stageIds: StageId[], sessionId?, pricing?, createdAt, updatedAt }`.
- `stages` keyed `${jobId}:${stage}`: `{ id, jobId, stage, status: pending|in-progress|done|skipped, inputs: JsonValue, outputs: JsonValue, checks?: CompatibilityReport, updatedAt }`.
- `guides` keyed by `JobId`: `{ jobId, document: GuideDocument, generatedAt }`.

`ConsumerProfile` carries the intake facts (`name`, `age`, `faceWidthMm`, `usage`, `budget`, `style`) and a compact self-contained `oldRx` JSON map; it never references the fitting domain's schema. The six stage `inputs`/`outputs` pairs (`ExamStageInput`/`ExamStageArtifact` and so on) are exported from `src/types.ts` as the typed vocabulary the tools and the SPA share, while the domain stores them as opaque `JsonValue` so a stage payload can evolve without a schema change.

### The Remote and guide assembly

`JobController extends TypertRemoteService` registers the `rxlabJob` namespace, injects `storageDomain`, and exposes `listJobs` / `getJob` / `createJob` / `updateJob` / `bindSession` / `upsertStage` / `generateGuide` / `deleteJob`. Writes validate against the domain zod schema at the wire boundary, mint ids and timestamps host-side, and queue on the domain's write chain; `getJob` and every write that targets a job throw `job/not-found` when the id is absent. `deleteJob` removes the job with its owned stage rows and guide.

`src/guide.ts` is a pure assembler: given a job, its stage rows, an optional per-stage content map, and the assembly instant, it emits one `GuideDocument` with a chapter per tracked stage (canonical order), deriving `params` from each stage artifact, merging injected `strategy` / `checklist` / `scripts`, and copying the stage's `checks`. `generateGuide` supplies the instant and passes no content map yet, so the package keeps working before `rxlab-content` lands; the content domain fills the map later.

### Tools and preset

`src/tools.ts` is a function plugin registering `job_read`, `job_write_stage`, and `guide_generate`, injected with `tools` and `jobController`. `job_write_stage` requires a `stage` argument and is the anchor a later accounting pass reads from the persisted `tool/call` arguments; no session event type is added. The shipped `guide` agent preset (`packages/preset/agent-presets/presets/guide/`) mounts this package's `./tools` row plus persona, ask-user, todo, web, and skill rows.

## Alternatives considered

**Reuse `rxlab_fitting` records as the work-order store.** Rejected: fitting models the refraction exam's nine stages, not orchestration across six workbench stages, and the guide needs stage artifacts plus compatibility checks that fitting records do not carry. Cross-domain facts stay as ids.

**Assemble the guide with an LLM.** Rejected: the product judgment is that deterministic code owns checks and structure while the model owns semantics and copy; the guide must be reproducible and cost nothing to regenerate. The assembler is a pure function.

**Store token totals and cost on the job.** Rejected: tokens and cost have one owner, `rxlab-usage`; the job stores only consumer-facing `pricing`, and the SPA joins the two rather than duplicating the fact.

**Add a session event type per stage write.** Rejected: the stage is already derivable from the persisted tool-call arguments, so a new event would duplicate logged data.

## Consequences

Work orders are now durable and typed: a job survives restarts under `$DSH_HOME/storages-rxlab/`, the SPA reads it through `rxlabJob`, and the guide is a reproducible `GuideDocument` rather than a static export. The `guide` preset gives the model a bounded set of work-order tools. What this gives up: until `rxlab-content` is wired the guide's strategy/checklist/script sections are empty at the source, and until `rxlab-recommend` lands the deterministic stage checks are whatever the caller writes. Both gaps are recorded in the package README.

## Testing

`tests/domain.spec.ts` covers the three zod schemas, the closed stage/status vocabularies, and the domain declaration. `tests/guide.spec.ts` covers chapter order, artifact-to-params derivation, content merging, checks propagation, the empty-`stageIds` fallback, and determinism. `tests/controller.host.spec.ts` boots the controller over the shared in-memory storage backend and covers create/get, update, `bindSession`, stage create-then-update, canonical stage ordering, guide assembly and persistence, cascade delete, and the `job/not-found` and `gateway/bad-request` failures.
