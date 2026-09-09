# Agent Note: rxlab product-Wiki catalog domain with an official Remote package

Status: implemented

English | [中文](2026-09-05-rxlab-wiki-catalog-domain.zh.md)

## Problem

The rxlab workbench (`dsh rxlab`) needed its 商品 Wiki module to become a structured data foundation for later fitting and recommendation: durable frame / lens / product master data that the standalone SPA (`apps/rxlab-web`) can browse, curate, and keep across restarts. The module previously rendered a placeholder. The module also had to follow rxlab's existing composition pattern — a host data row plus an SPA that drives a generated typed Remote namespace through the embedded headless Cordis client runtime — without polluting the platform's generic client assembly.

## Decision

Ship the catalog as a new official dual-face package, `@deepseek-ai/dsh-rxlab-catalog`, placed under `packages/api/` (not `packages/bundle/`): the `bundle/` group owns installable patch-layer assemblies and has no tsdown `clientBundle`/typert generation chain, while the `api/` controller packages do. (As of 2026-09-09 the domain is at version 2 — structured attribute vocabularies, price history, and the collect import seam; see [the v2 note](2026-09-09-rxlab-wiki-v2-attributes-and-import.md). This note's assembly and Remote-shape decisions stay current.) The package owns its data on the Host through the **storage domain** form (`ctx.storageDomain`), not a bespoke JSON file: `defineDomain` declares `rxlab_catalog` (`per-record` layout so each record is its own disposable document), one `items` table whose zod schema is a discriminated union of `frame` / `lens` / `product` rows. The domain name is `rxlab_catalog`, not `rxlab-catalog`: storage unit names must match `[a-z][a-z0-9_]*`, and `defineDomain` fails loud on a hyphenated name.

`CatalogController extends TypertRemoteService` registers the `rxlabCatalog` Remote namespace (`super(ctx, 'catalogController', { namespace: 'rxlabCatalog' })`), opens the domain in `[Service.init]`, and exposes `list` (kind filter + case-insensitive brand/model/name substring, newest-write-first summaries), `get`, `upsert` (validates the draft against the domain zod schema at the wire boundary, mints id and `updatedAt`, queues on the domain's single write chain), and `delete` (the Remote endpoint is spelled `delete`, not `remove`: the Client namespace service reserves `remove`). Wire and durable types are browser-safe JSON types in `src/types.ts`; zod lives host-only in `src/domain.ts`.

On the Client the package is a `dsh.client` row whose `/client` bundle `$mount`s its own generated Remote contribution (`import catalogRemote from '@deepseek-ai/dsh-rxlab-catalog/remote'`). The rxlab profile (`packages/bundle/rxlab-app/cordis.patch.yml`) adds one host row, `rxlab-catalog`, that serves both halves: the Host Loader activates `CatalogController`, and the `modules` row composes the SPA graph including the new `dsh.client` row, so the SPA's generic headless boot activates the bundle and the namespace resolves. The platform `api-remotes` assembly is untouched.

The SPA module (`apps/rxlab-web/src/modules/wiki/`) is a minimal three-region browser: a filter/search bar (`Tabs` kind filter, debounced search input, and an add button), a summary list with a detail/edit/delete pane, and a create/edit form dialog with per-kind fields (frame geometry, lens refractive index and lens type selectors, collected-product fields). Reads and writes go through `useCatalogList` and thin action helpers over `runtime.remote.rxlabCatalog`; list refresh is controlled (a nonce the panel bumps after each mutation), not a `domain/changed` subscription. The registry entry flips to `status: 'active'`.

## Alternatives considered

**Add the namespace to the platform `api-remotes` assembly.** The assembly exists to choose generic Host capabilities for every Client. rxlab catalog data is product-scoped and would force the platform to import an rxlab package; rejected to keep the platform assembly clean. Instead the package self-mounts its contribution through its own `dsh.client` row.

**Place the package under `packages/bundle/`.** Bundle packages are patch-layer assemblies over base rows; the group has no client-typert tsdown chain. The `api/` group owns `clientBundle`/`client/tsdown.client.ts` and `typert` generation, so the dual-face package lives there with the other controllers while its profile row stays in the rxlab-app bundle.

**Route catalog data through the session agent first (agent tools / collection import before a durable store).** The fitting/recommendation modules need a shared master-data base independent of any model turn; the Remote + storage-domain surface is the narrowest durable seam and the collection importer later writes the same domain.

**Use a bespoke JSON file or sqlite directly.** The storage-domain form already provides zod validation at the durable read boundary, synchronous in-memory reads, a single per-record write chain, and `domain/changed` events under the rxlab-isolated `storages-rxlab` root; bespoke file code would duplicate those guarantees. The json backend stays for now; `storage-sqlite` can back the same domain later by routing change only.

## Consequences

The 商品 Wiki module now reads and writes durable structured master data end to end: browser → `rxlabCatalog` Remote → `rxlab_catalog` domain records under `$DSH_HOME/storages-rxlab/`. Records survive reload; the panel passes browser smoke for empty state, create-with-validation, list, detail and edit prefill, search/kind filtering, and delete. Fitting/recommendation modules and the collection importer can consume the same domain, and later `domain/changed` subscriptions can replace the panel's controlled refresh. The platform `api-remotes` assembly stays clean, and the rxlab-app patch stays a thin row addition. The storage-domain unit-name rule (`[a-z][a-z0-9_]*`) is the constraint future rxlab domain names must respect.

## Testing

Browser smoke on `dsh rxlab` covers the panel boot, empty state, create with local validation, create of a frame and a lens (Radix selects via real key/click), detail rendering of kind-specific fields, edit round-trip that persists added fields (color/weight) into the record file, search (`A-01`) and kind-tab filtering, delete with confirm that removes the row and its per-record document, and reload persistence of the remaining frame row. The session-Agent module still boots and renders its session workbench. `apps/rxlab-web` typecheck and Vite build are green; the full `build:lib:host` and `build:lib:client` passes are green. Not covered end to end: creating a `product` row through the browser, server-side zod rejection paths that the client pre-validates (only the name-required client validation was observed), and unit/coverage tests for the new package's Host controller (the repository per-file coverage gate would still need a host spec).
