---
description: "rxlab token-accounting module: per-session, per-module, and per-work-order totals with route-priced cost over the token-meter projection, exposed as the typed rxlabUsage Remote with a self-mounting Client contribution."
kind: "package-reference"
---
# rxlab Usage

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-usage` owns rxlab's token accounting. On the Host it provides the `ctx.usageController` service and the generated `ctx.remote.rxlabUsage` namespace; the namespace reads and writes the `rxlab_usage` storage domain (version 2, per-record layout, compatible with version 1) of per-session totals, per-module aggregates, and per-work-order job/stage usage. The controller listens to the session-projection change feed for the client-visible `tokenUsage` unit (composed by the base bundle's token-meter row), attributes each changed session to a workbench module from its cwd under the workspace root, and durably records the session total plus the recomputed module aggregate. For a work order's bound agent session it splits the persisted log into completed turns, derives each turn's exact provider usage, attributes the turn to the stage named by the latest `job_write_stage` tool call at or before it, and multiplies the configured per-route token rates into an exact cost. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots usage exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: usage is rxlab-product data, not a generic Host capability.

## Table of Contents

- [Use this package](#use-this-package)
- [Understanding the implementation](#understanding-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Shipped as an rxlab-app data row; the SPA usage view reads it through the generated `remote.rxlabUsage` namespace. The module-subdirectory attribution map is workspace-structure knowledge shared with the SPA, not a tunable. Job cost is opt-in: configure per-token rates under the row's `pricingCurrency` and `routeRates`, keyed `${provider}/${model}`.

```yaml
- id: rxlab-usage
  name: '@deepseek-ai/dsh-rxlab-usage'
  config:
    pricingCurrency: CNY
    routeRates:
      'deepseek/deepseek-chat':
        uncachedInput: 0.000001
        output: 0.000002
        cacheRead: 0.0000005
        cacheWrite: 0.000001
```

Rates are cost per token in `pricingCurrency`. With no `pricingCurrency` or `routeRates`, every `jobUsage` cost is omitted. A turn row's `cost` is present only when the turn has exactly one route and that route has a configured rate; otherwise it is omitted rather than zeroed, because the harness holds no authoritative price and a zero would read as free.

## Understanding the implementation

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | `UsageController` host service: opens the domain, subscribes the projection feed, exposes `summary` / `sessionUsage` / `jobUsage`, resolves job sessions from the live store or the durable log |
| [`src/domain.ts`](src/domain.ts) | `rxlab_usage` domain spec: `sessions`, `modules`, `jobs`, and `stage_usage` per-record tables |
| [`src/aggregate.ts`](src/aggregate.ts) | Pure bucket addition and cwd → module attribution |
| [`src/attribution.ts`](src/attribution.ts) | Pure turn splitting and turn → stage attribution, folding exact usage into job and stage totals |
| [`src/pricing.ts`](src/pricing.ts) | Pure route-rate lookup and exact per-turn cost |
| [`src/types.ts`](src/types.ts) | Browser-safe wire types for the namespace |
| [`src/client/index.ts`](src/client/index.ts) | Self-mounting Client contribution (`dsh.client` row) |

**Runtime invariant:** No runtime invariant companion is published because usage derives from the authoritative session/projection feed and the durable log, so no independent observation can diverge.

## Model Experience

### Usage accounting

#### What the model sees

Nothing. The row consumes host projection events and session logs and serves the SPA; it adds no prompts, tools, or request text to any session. The `rxlabUsage` totals live behind `ctx.remote.rxlabUsage` and the storage domain, which a model reaches only through the SPA.

#### Token effect

Zero: no text from this package enters any model request.

#### KV Cache effect

Independent: usage reads never touch request prefixes, so nothing here can invalidate provider cache reuse.

## Known Limitations and Deferred Work

- Job cost has no built-in price table. `rxlab-usage` reads no provider cost metadata, so a deployment must configure `routeRates`; otherwise `cost` is omitted. The harness does not report spend anywhere else either.
- The durable stage table is `stage_usage`, not `stageUsage`: `defineDomain` accepts only lowercase snake_case table names. The `jobUsage` wire names are unaffected.
- A turn with several provider/model routes carries one shared bucket set, so its cost cannot be attributed per route; such a turn contributes to totals but makes the job and stage `cost` absent.
- Durable accounting starts when this row observes projection changes: usage streamed before the row existed (or while the profile was off) is not backfilled for the module/session tables. `jobUsage` reads the whole session log, so it does backfill job totals for a session the store can still read.
- The subdirectory → module map is duplicated between this package and the SPA (`apps/rxlab-web/src/rxlab/session-cwd.ts`); the two must move together.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
