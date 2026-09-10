---
description: "rxlab guide workbench work orders: the rxlab_job storage domain (jobs / stages / guides), the deterministic guide assembler, the model-facing work-order tools, and the typed rxlabJob Remote with a self-mounting Client contribution."
kind: "package-reference"
---
# rxlab Job

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-job` owns the rxlab guide workbench's work orders. On the Host it provides the `ctx.jobController` service and the generated `ctx.remote.rxlabJob` namespace; the namespace reads and writes the `rxlab_job` storage domain (version 1, per-record layout) of one job per consumer, its six stage rows, and the assembled guide. `generateGuide` folds the stored stage artifacts and an injected content-domain copy map into a structured `GuideDocument` without calling a model. The package also ships the model-facing `job_read` / `job_write_stage` / `guide_generate` tools and a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots the work orders exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: work orders are rxlab-product data, not a generic Host capability.

## Table of Contents

- [The work-order model](#the-work-order-model)
- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="the-work-order-model"></a>
## The work-order model

One job carries the consumer profile, a lifecycle status, the tracked stage set, the bound agent session, and the consumer-facing `pricing`. Six stages — `exam`, `frame`, `lens`, `fabrication`, `pickup`, `aftercare` — each get one row keyed `${jobId}:${stage}`, holding the stage's `inputs` (投入) and `outputs` (产出) as opaque JSON plus an optional deterministic `checks` report (`overall` OK/WARN/FAIL with named findings). The guide row holds one `GuideDocument`: a chapter per tracked stage with `params`, `strategy`, `checklist`, `scripts`, and the stage's `checks`.

`createJob` mints the id, the timestamps, and the default tracked-stage set. `upsertStage` validates at the wire boundary and starts a missing row `pending` with empty JSON payloads. `generateGuide` runs the pure assembler over the stored stage rows and persists the result; it passes no injected content copy until the content domain lands, so chapters carry their artifacts and default titles.

## Use this package

The rxlab profile composes one data row, `rxlab-job` (`@deepseek-ai/dsh-rxlab-job`), and the shipped `guide` agent preset mounts this package's `./tools` row. The Host Loader activates the `JobController` service, which opens the `rxlab_job` domain through `ctx.storageDomain` for its lifetime and registers the `rxlabJob` namespace on the Typert Gateway. The SPA's headless client boot activates the package's own `/client` bundle (the modules node half serves it under `/plugins`), and its `apply` mounts the generated Remote contribution, so `remote.rxlabJob.listJobs/getJob/createJob/updateJob/bindSession/upsertStage/generateGuide/deleteJob` resolve in the browser.

`deleteJob` removes the job together with every stage row and the guide it owns. `getJob` throws `job/not-found` on an absent id; `upsertStage`, `updateJob`, `bindSession`, and `generateGuide` fail the same way so a stage or guide can never outlive its job.

Wire and durable types live in `./types` (browser-safe JSON, no runtime code); the zod schemas live in the Host-only `src/domain.ts`; the pure guide assembler lives in `src/guide.ts`; the model-facing tools live in `./tools`.

**Runtime invariant:** No runtime invariant companion is published because the `rxlab_job` durable schema owns the job/stage/guide relationships and the guide assembler is a pure function, so no independent observation can diverge.

## Model Experience

### Work-order tools

#### What the model sees

The `guide` preset mounts three tools. `job_read` lists work orders or opens one job with its stages and guide. `job_write_stage` creates or updates one stage row; its required `stage` argument is the anchor that later attributes a session round to a stage. `guide_generate` assembles and returns the guide chapters. Together they let the model move a work order through the six stages and produce the consumer guide. The preset's persona carries the workflow text; the tools' own descriptions stay task-scoped. The package adds no session event type: the stage a round belongs to is derivable from the persisted `tool/call` arguments.

#### Token effect

The three tool schemas and the persona workflow text enter every model request of a session composed on the `guide` preset; mounting the data row alone adds no model request text.

#### KV Cache effect

`job_read` is concurrency-safe and read-only; the write tools mutate durable work-order state without changing any assembled prompt. The tool catalog and its descriptions are fixed at preset mount, so repeated work-order reads and writes do not alter the cached request prefix.

## Known Limitations and Deferred Work

- The content domain is not wired yet: `assembleGuide` accepts injected `strategy` / `checklist` / `scripts` per stage, and `generateGuide` passes an empty map, so guide chapters currently carry artifacts, default titles, and checks only.
- The deterministic recommend checks (engine in `rxlab-recommend`) do not feed `stage.checks` yet; stages carry whatever the caller wrote.
- The SPA work-order and guide views are WS-5; this package ships the Host and Client data layer and the tools, not a panel.
- No REAL-composition controller boot test yet: the storage-domain-backed controller spec and the pure domain/assembler specs carry the package coverage today.
- `oldRx` is a compact self-contained JSON map; no migration from the fitting domain's prescription schema is modeled.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
