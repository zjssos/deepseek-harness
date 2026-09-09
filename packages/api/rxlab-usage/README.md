---
description: "rxlab token-accounting module: per-session and per-module totals over the token-meter projection, exposed as the typed rxlabUsage Remote with a self-mounting Client contribution."
kind: "package-reference"
---
# rxlab Usage

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-usage` owns rxlab's token accounting. On the Host it provides the `ctx.usageController` service and the generated `ctx.remote.rxlabUsage` namespace; the namespace reads and writes the `rxlab_usage` storage domain (version 1, per-record layout) of per-session totals and per-module aggregates. The controller listens to the session-projection change feed for the client-visible `tokenUsage` unit (composed by the base bundle's token-meter row), attributes each changed session to a workbench module from its cwd under the workspace root, and durably records the session total plus the recomputed module aggregate — the accounting foundation for later per-workflow or per-module billing. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots usage exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: usage is rxlab-product data, not a generic Host capability.

## Table of Contents

- [Use this package](#use-this-package)
- [Understanding the implementation](#understanding-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

Shipped as an rxlab-app data row; the SPA usage view reads it through the generated `remote.rxlabUsage` namespace. No configuration: the module-subdirectory attribution map is workspace-structure knowledge shared with the SPA, not a tunable.

## Understanding the implementation

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | `UsageController` host service: opens the domain, subscribes the projection feed, exposes `summary` / `sessionUsage` |
| [`src/domain.ts`](src/domain.ts) | `rxlab_usage` domain spec: `sessions` and `modules` per-record tables |
| [`src/aggregate.ts`](src/aggregate.ts) | Pure bucket addition and cwd → module attribution |
| [`src/types.ts`](src/types.ts) | Browser-safe wire types for the namespace |
| [`src/client/index.ts`](src/client/index.ts) | Self-mounting Client contribution (`dsh.client` row) |

## Model Experience

No model-visible surface: the row consumes host projection events and serves the SPA; it adds no prompts, tools, or request text to any session.

## Known Limitations and Deferred Work

- Durable accounting starts when this row observes projection changes: usage streamed before the row existed (or while the profile was off) is not backfilled. The SPA list column falls back to the live projection view for such sessions.
- The subdirectory → module map is duplicated between this package and the SPA (`apps/rxlab-web/src/rxlab/session-cwd.ts`); the two must move together.
- Billing rates and per-workflow invoices are not modeled yet; this package only keeps the token totals they would be computed from.
