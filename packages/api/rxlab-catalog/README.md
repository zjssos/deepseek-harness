---
description: "rxlab product-Wiki master data: the rxlab_catalog storage domain and its typed rxlabCatalog Remote, with a self-mounting Client contribution."
kind: "package-reference"
---
# rxlab Catalog

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-catalog` owns the rxlab product-Wiki master data. On the Host it provides the `ctx.catalogController` service and the generated `ctx.remote.rxlabCatalog` namespace; the namespace reads and writes the `rxlab_catalog` storage domain (version 1, per-record layout), a discriminated union of frame / lens / product rows that later fitting and recommendation rules consume. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots the catalog exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: the catalog is rxlab-product data, not a generic Host capability.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The rxlab profile composes one row, `rxlab-catalog` (`@deepseek-ai/dsh-rxlab-catalog`). The Host Loader activates the `CatalogController` service, which opens the `rxlab_catalog` domain through `ctx.storageDomain` for its lifetime and registers the `rxlabCatalog` namespace on the Typert Gateway. The SPA's headless client boot activates the package's own `/client` bundle (the modules node half serves it under `/plugins`), and its `apply` mounts the generated Remote contribution, so `remote.rxlabCatalog.list/get/upsert/remove` resolve in the browser.

`upsert` validates its draft against the domain zod schema at the wire boundary, mints the record id and write timestamp, and queues the write on the domain's single write chain (durability first, then memory, then `domain/changed`). `list` filters by the closed `kind` union and a case-insensitive brand/model/name substring and returns newest-write-first summaries. `remove` deletes one record and reports whether it existed.

Wire and durable types live in `./types` (browser-safe JSON, no runtime code); the zod schemas live in the Host-only `src/domain.ts`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the catalog is browser and Host data and registers no prompt, tool, or session event.

#### KV Cache effect

No direct effect; catalog mutations do not alter model requests.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The SPA refreshes lists on demand; it does not yet subscribe to `domain/changed` for live multi-client sync.
- Collection imports, agent tools over the catalog, and a `storage-sqlite` backend for the domain are later rounds.
- Stored records are plain JSON per record; full-text and parameter-range queries over large catalogs are not indexed.

-----

<a id="dev-note"></a>
## Dev Note

No notes.
