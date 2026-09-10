# Agent Note: rxlab usage job and stage accounting

Status: implemented

English | [中文](2026-09-10-rxlab-usage-job-accounting.zh.md)

## Problem

The 配镜指南 workbench re-plan makes one `rxlab_job` work order correspond to one agent session, and triggers each stage's work through the `job_write_stage` tool whose arguments carry the stage. `rxlab-usage` v1 accounted only per session and per module from the live `tokenUsage` projection, so it could not answer what a work order or one of its stages cost, and the work-order note explicitly gave token and cost ownership to `rxlab-usage` rather than the job domain. The plan froze the interface: `rxlab_usage` v2 with `jobs` and `stageUsage` tables and a `jobUsage({ jobId })` RPC that returns job and per-stage `UsageTotals` plus an optional route-priced `cost`. The harness holds no currency price table — `llm-pi-ai` deliberately never reads pi-ai cost metadata and no consumer reports spend — so the cost source had to be chosen rather than looked up.

## Decision

`@deepseek-ai/dsh-rxlab-usage` ships `rxlab_usage` version 2 with `compatibleVersions: [1]`. The version-1 `sessions` and `modules` tables keep their exact shape, so stored version-1 records stay read through the compatibility stamp; the version adds `jobs` (one row per work order's attributed total, key `jobId`) and `stage_usage` (one row per `${jobId}:${stage}`). The stage table is `stage_usage` rather than the frozen `stageUsage` because `defineDomain` accepts only lowercase snake_case table names; the `jobUsage` wire vocabulary is unaffected. The `rxlabUsage` namespace gains `jobUsage({ jobId })`, which returns the job totals, the optional cost and currency, and the stages that received usage.

### Turn to stage attribution

`src/attribution.ts` is a pure function over the persisted session events. It splits the log into completed turn windows (each `turn/start` through its matching `turn/end`) and calls the token-meter's `deriveTurnTokenUsage` — imported from `@deepseek-ai/dsh-token-meter/client` — on each window for the exact provider buckets and the provider/model routes. It tracks the most recent `job_write_stage` tool call; a turn is attributed to the stage in force at that turn's end, so the turn that writes a stage belongs to it and later turns stay there until another stage is written. A turn whose usage cannot be proven contributes nothing, but still advances the stage anchor. Turns before any stage call and stages never written stay out of the stage list while still counting toward the job total. Stage order is first appearance in the log, so the result is a deterministic function of the events.

### Route-priced cost

`src/pricing.ts` is a pure route-rate lookup and exact per-turn cost. The row accepts an optional `pricingCurrency` and `routeRates` keyed `${provider}/${model}` with the four per-token rates. `TurnTokenUsage` carries one shared bucket set plus the set of routes its attempts used, so a turn's cost exists only when it has exactly one route with a configured rate; a multi-route or unpriced turn makes the job and stage `cost` absent rather than zero, matching the frozen rule that missing route information omits cost. With no configured rates every cost is absent.

### Reading the session log

`UsageController` resolves the job through the `jobController` service (a structural read of `getJob`/`listJobs`, never an import of the work-order package). It reads a job session's events from the live in-memory store first — that log is authoritative and includes turns not yet flushed — and falls back to `ctx.get('sessionPersistence')`'s read handle for a session that is no longer live. The persistence and live-store services are addressed through local structural interfaces, so this package never imports their augmentation owners at runtime.

### The RPC, the trigger, and the write chain

Every `jobUsage` call recomputes from the authoritative log and upserts the `jobs` and `stage_usage` rows, removing stage rows the job no longer has; a repeated read returns the same value because the recompute is a pure function of the events. The existing projection feed additionally warms the durable rows: a `tokenUsage` change enqueues the session, and a drained pass matches it to any job bound to that session and recomputes. The drain batches within a microtask and is idempotent, so a burst of projection changes costs one pass.

## Alternatives considered

**Read provider cost from the model catalog.** Rejected: `llm-pi-ai` states that the harness never reads pi-ai's cost metadata and `llm-replay` zeroes it, so using it would contradict a shipped decision and still report spend no other surface reports. `ctx.llm.resolveModel` exposes no cost field at all. Configured per-route rates keep the choice explicit and deployment-owned.

**Have `rxlab_job` store tokens and cost.** Already rejected by the work-order note, and it would duplicate one fact in two domains. `rxlab-usage` owns tokens and cost; the job keeps only consumer-facing `pricing`.

**Re-derive turn usage inside this package.** Rejected: `deriveTurnTokenUsage` already owns the exact provider accounting and route attribution, and a second copy would drift from the token-meter's attempt lifecycle. Importing the browser-safe fold from `@deepseek-ai/dsh-token-meter/client` is the single source.

**Snapshot the live `tokenUsage` projection instead of reading the log.** Rejected: the projection is a per-session total, not per-turn, so it cannot attribute turns to stages, and it exists only while the projection feed has observed the session. The persisted log is the durable, turn-level authority the work-order plan names.

## Consequences

A work order's token totals and per-stage split are now durable and typed, and cost is available wherever a deployment configures route rates. The SPA can join the job's consumer `pricing` with `rxlabUsage.jobUsage` without either fact being stored twice. What this gives up: cost depends on deployment-configured rates and is absent otherwise, because the harness has no authoritative price; multi-route turns cannot be split per route and so omit cost; and the durable `jobs`/`stage_usage` rows are a recomputed projection, meaningful only for sessions the store or the persistence backend can still read. The dependency policy does not yet classify the token-meter export this row imports at runtime, matching the pre-existing unclassified `dsh-storage-domain` imports across the rxlab packages; that reconciliation is outside this package.

## Testing

`tests/attribution.spec.ts` covers turn splitting, stage attribution across re-writes, malformed and unknown stage arguments, usage-less turns, and the cost rules. `tests/usage.spec.ts` covers the version-2 domain declaration. `tests/controller.host.spec.ts` boots the controller over the shared in-memory storage backend and a real `JobController`, then covers live-log attribution, exact cost and durable row writes, the durable persistence fallback, the zero-job case, `job/not-found` propagation, and idempotent repeated reads.
