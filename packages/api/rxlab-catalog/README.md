---
description: "rxlab product-Wiki master data: the rxlab_catalog storage domain and its typed rxlabCatalog Remote, with a self-mounting Client contribution."
kind: "package-reference"
---
# rxlab Catalog

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-catalog` owns the rxlab product-Wiki master data. On the Host it provides the `ctx.catalogController` service and the generated `ctx.remote.rxlabCatalog` namespace; the namespace reads and writes the `rxlab_catalog` storage domain (version 2, per-record layout, version-1 records still readable), a discriminated union of frame / lens / product rows whose structured attribute vocabularies (frame material/shape/rim/style, lens optics) later fitting and recommendation rules consume. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots the catalog exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: the catalog is rxlab-product data, not a generic Host capability.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The rxlab profile composes one row, `rxlab-catalog` (`@deepseek-ai/dsh-rxlab-catalog`). The Host Loader activates the `CatalogController` service, which opens the `rxlab_catalog` domain through `ctx.storageDomain` for its lifetime and registers the `rxlabCatalog` namespace on the Typert Gateway. The SPA's headless client boot activates the package's own `/client` bundle (the modules node half serves it under `/plugins`), and its `apply` mounts the generated Remote contribution, so `remote.rxlabCatalog.list/get/upsert/importCollected/remove` resolve in the browser.

`upsert` validates its draft against the domain zod schema at the wire boundary, mints the record id and write timestamp, and queues the write on the domain's single write chain (durability first, then memory, then `domain/changed`). `list` filters by the closed `kind` union, a case-insensitive brand/model/name substring, and facet filters (frame material and rim construction on frame rows, refractive index on lens rows, an inclusive price range over the latest price reading), returning newest-write-first summaries that carry the latest price and the family tag.

`importCollected` is the collect→catalog seam: the caller passes one captured listing (title, selected variant, price, spec-parameter pairs) plus its collect lineage (platform, url, link id, capture id), and the controller extracts structured attributes deterministically (`src/extract.ts`, marketing-vocabulary matchers over the glasses-industry attribute scheme — no model round-trip), appends the price reading to the record's price history unless it repeats the latest value, and merges on the collect link id so a re-import updates the existing record (keeping its id and operator notes) instead of minting a duplicate. Extraction assigns the record family (frame / lens / product) and never invents a value; unmatched attributes stay absent for later model-assisted enrichment.

Wire and durable types live in `./types` (browser-safe JSON, no runtime code); the zod schemas live in the Host-only `src/domain.ts`.

**Runtime invariant:** No runtime invariant companion is published because the `rxlab_catalog` durable schema owns every record relationship and extraction is a pure function, so no independent observation can diverge.

-----

<a id="model-experience"></a>
## Model Experience

### Catalog master data

#### What the model sees

Nothing. The package registers no tools, injects no prompts, and appends no session events; the `rxlab_catalog` rows live behind `ctx.remote.rxlabCatalog` and the storage domain, which a model reaches only through a consumer's own documented surface (today the rxlab SPA).

#### Token effect

Zero: no text from this package enters any model request.

#### KV Cache effect

Independent: catalog reads and writes never touch request prefixes, so nothing here can invalidate provider cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The SPA refreshes lists on demand; it does not yet subscribe to `domain/changed` for live multi-client sync.
- Extraction is deterministic only: attributes the title and parameter table do not name stay absent; a model-assisted enrichment pass over those gaps is a later round.
- The `rxlab_collect` capture fields the import consumes (`params`, `mainImageUrl`, price) are best-effort reads over anonymous headless sessions; JD risk pages omit them.
- Agent tools over the catalog and a `storage-sqlite` backend for the domain are later rounds.
- Stored records are plain JSON per record; full-text and parameter-range queries over large catalogs are not indexed.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
