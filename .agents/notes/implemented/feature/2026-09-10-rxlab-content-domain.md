# Agent Note: rxlab content domain with an official Remote package

Status: implemented

English | [中文](2026-09-10-rxlab-content-domain.zh.md)

## Problem

The rxlab workbench (`dsh rxlab`) needed durable knowledge entries and reusable talk scripts, each optionally tagged to one of the six workbench stages, for the SPA content manager to browse and curate across restarts. Those text corpora are not product master data: the `rxlab_catalog` domain holds frame / lens / product rows with geometry, optics, and prices that fitting and recommendation rules consume, while a knowledge entry or a script carries a title, tags, and prose. The module also had to follow rxlab's existing composition pattern — a host data row plus a generated typed Remote namespace driven by the SPA's embedded headless Cordis client runtime — without polluting the platform's generic client assembly.

## Decision

Ship the content manager as a new official dual-face package, `@deepseek-ai/dsh-rxlab-content`, under `packages/api/` for the same reason the catalog lives there: the `api/` controller packages own the tsdown `clientBundle` and typert generation chain, which `packages/bundle/` lacks.

The Host owns its data through the **storage domain** form (`ctx.storageDomain`): `defineDomain` declares `rxlab_content` (version 1, `per-record` layout so each entry is its own disposable document) with one `items` table whose zod schema is `ContentItem = { id, kind: 'knowledge' | 'script', stage?, title, tags, body, updatedAt }`. The domain name is `rxlab_content`, not `rxlab-content`: storage unit names must match `[a-z][a-z0-9_]*`.

`ContentController extends TypertRemoteService` registers the `rxlabContent` Remote namespace (`super(ctx, 'contentController', { namespace: 'rxlabContent' })`), declares `static inject = ['storageDomain']`, opens the domain in `[Service.init]`, and exposes `list`, `get`, `upsert`, and `delete`. `list` applies the closed `kind` and `stage` facets plus a case-insensitive title/tags substring and returns newest-write-first summaries that omit the body. `get` throws `content/not-found` on an absent id. `upsert` validates the draft against the domain zod schema at the wire boundary, mints the item id and write timestamp, and queues the write on the domain's single write chain; the target id is a sibling request field (absent mints, present replaces) rather than a draft field, matching the fitting Remote. `delete` reports whether an item existed. Wire and durable types are browser-safe JSON types in `src/types.ts`; zod lives host-only in `src/domain.ts`.

On the Client the package is a `dsh.client` row whose `/client` bundle `$mount`s its own generated Remote contribution (`import contentRemote from '@deepseek-ai/dsh-rxlab-content/remote'`). The rxlab profile composes it the same way as the other rxlab data rows, so the SPA's generic headless boot activates the bundle and `remote.rxlabContent.*` resolves. The platform `api-remotes` assembly is untouched.

The `StageId` union (`exam | frame | lens | fabrication | pickup | aftercare`) is declared locally rather than imported from the job domain, the same way the catalog duplicates `collectPlatform` from the collector; the job package remains the authority and the content package stays independent of it.

## Alternatives considered

**Add the namespace to the platform `api-remotes` assembly.** The assembly chooses generic Host capabilities for every Client; rxlab content is product-scoped and would force the platform to import an rxlab package. Instead the package self-mounts its contribution through its own `dsh.client` row, matching the catalog and fitting rows.

**Extend the `rxlab_catalog` domain instead of adding a domain.** The catalog's discriminated union is product master data with geometry, optics, and price history that fitting and recommendation consume; adding a `knowledge`/`script` arm would widen that union and force every catalog consumer to handle editorial rows it has no use for. A separate `rxlab_content` domain keeps each domain's schema closed and lets the SPA expose content management independently.

**Import `StageId` from `@deepseek-ai/dsh-rxlab-job/types`.** That would couple this package to a parallel workstream and make content availability depend on the job domain, while the six-stage vocabulary is already frozen in the workbench contract. Duplicating the closed union keeps the packages independent; the catalog precedent duplicates `CollectPlatform` from the collector for the same reason.

**Use a bespoke JSON file or sqlite directly.** The storage-domain form already provides zod validation at the durable read boundary, synchronous in-memory reads, a single per-record write chain, and `domain/changed` events under the rxlab-isolated `storages-rxlab` root; bespoke file code would duplicate those guarantees. The json backend serves the domain today and `storage-sqlite` can back it later by routing change only.

## Consequences

The workbench now has durable, typed content CRUD: browser → `rxlabContent` Remote → `rxlab_content` records under `$DSH_HOME/storages-rxlab/`. The catalog domain stays product-only, and each domain keeps a closed schema. The stage vocabulary now exists in two packages, so a change to the six stages must update both (the job package is authoritative). The rxlab-app profile does not compose the row yet, so no shipped profile loads the controller until the workbench SPA integration adds it.

## Testing

`tests/domain.spec.ts` pins the domain: unknown `kind` and `stage` are rejected, a whitespace-only title fails, an absent stage stays absent, a stored record round-trips with a minted id and `updatedAt`, and `contentDomainSpec` declares `rxlab_content` at version 1 with one `items` table. `tests/content-controller.host.spec.ts` boots the real `ContentController` over the real storage-domain facility on an in-memory backend and covers create with minted id/updatedAt, read-back, replace under a supplied id, wire-boundary rejection (`gateway/bad-request`), `content/not-found`, `list` facets and ordering (summary omits the body), and delete including the never-write miss case.

## Deferred

The SPA content manager panel and its browser smoke land with the workbench SPA change; until then the namespace has no browser consumer. The panel refreshes lists on demand rather than subscribing to `domain/changed`, and no full-text index covers large content sets.
