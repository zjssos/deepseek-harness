# Agent Note: rxlab product-Wiki v2 — structured attribute vocabularies, the price dimension, and the collect import seam

Status: implemented

English | [中文](2026-09-09-rxlab-wiki-v2-attributes-and-import.zh.md)

## Problem

The product-Wiki v1 record model ([the 2026-09-05 note](2026-09-05-rxlab-wiki-catalog-domain.md)) carries only coarse fields: six geometry/free-text fields for a frame, one refractive-index enum for a lens; and the raw captures the collect module lands (title/price/selected variant) have no path into the catalog. The business needs three capabilities: define the frame and lens entities over the glasses industry's professional attribute scheme, add a price dimension to products (a price that evolves with collection, not a single value), and find products through structured filters or agent retrieval. The prerequisite was verifying whether the existing collected data supports those fields.

## Decision

**Verify the data first.** Inspecting `$DSH_HOME/storages-rxlab/rxlab_collect`: 29 JD links, one successful capture, carrying only title/selectedSku/buyUrl — price (the desktop page was risk-gated), main image, and spec parameters all missing. Conclusion: title marketing vocabulary yields deterministic brand/material/rim/shape/style/gender/weight/color extraction, but the frame-size marking (box method `52□18-140`) and lens parameters require backfilling the collector.

**The attribute vocabularies rest on industry sources.** Frames adopt the box-method specification (lens width - bridge width - temple length, GB/T 14214) plus frame height, total width, and weight; the material categories are the industry's stock bands pure-titanium / beta-titanium / titanium / metal-alloy / stainless-steel / TR90 / plastic-steel / acetate / PC. Lenses adopt the fact that refractive index and material pair (1.50 CR-39 Abbe 58, 1.60 MR-8 Abbe 41, 1.67 MR-7 Abbe 32, 1.74 polyurethane), the vocabulary extends to 1.50/1.56/1.59/1.60/1.61/1.67/1.71/1.74, and design (spherical / aspheric / double-aspheric) and function tags (blue-light / photochromic / polarized / tinted / driving) get their own fields. Closed zod enums are what fitting rules switch on; vendor-differentiated fields (coating, color) stay free text.

**The catalog domain bumps to v2, reading v1.** `compatibleVersions: [1]`; every field v1 carried stays declared, the previously required free-text `frameMaterial` becomes an optional legacy field, and all new structured fields are optional. Both families gain the shared `priceHistory` (ordered readings, a repeat of the latest value does not append, capped at 200 by dropping oldest) and `source` (collection lineage: platform/url/linkId/captureId). Both domains (catalog, collect) bump to v2, each an adjacent migration of added-optional-fields only.

**The import seam lives on the catalog side.** `rxlabCatalog.importCollected(source, listing)` takes the collect lineage plus the listing fields; the deterministic extractor in `src/extract.ts` maps the title and parameter table onto structured attributes and assigns the record family (frame / lens / product, with bundles classified as frames), merging idempotently on `source.linkId` (a re-import updates the existing record, keeping its id and notes), and the price reading joins the history. The caller (the SPA collect panel's 导入到 Wiki button today, a session tool later) reads the latest capture through the existing `rxlabCollect.listCaptures`. No controller concurrently opens two storage domains (the one-open-per-name rule forbids it), and nothing writes the catalog from `rxlab-collect` — the raw domain stays read-only toward the catalog.

**`list` gains facets instead of a new endpoint.** Beyond kind and substring query, facet filters cover frame material and rim construction (frame rows), refractive index (lens rows), and an inclusive range over the latest price reading; summaries carry the latest price and the family tag.

## Alternatives considered

**A new `rxlab-import` api package as an import controller.** It would need the full dual-face typert chain while the only consumer is one SPA button; the extractor and merge logic are reusable as catalog pure functions plus one Remote method. Promotion waits for a second consumer (a session tool).

**Parsing into structured attributes inside the collector.** The attribute vocabulary is catalog domain knowledge; putting it in the collector would make the raw domain carry master-data semantics. The collector keeps landing raw fields and extraction runs at import, so vocabulary evolution needs a re-import, not a re-collection.

**A single price field.** Collection naturally records one reading per run; a single value would discard price evolution and contradict the positioning of a wiki record as knowledge. History is authoritative and consumers read the last entry as the latest.

## Consequences

Catalog v2 ships: structured attribute vocabularies, price history, collection lineage, the idempotent `importCollected`, and `list` facet filters; `rxlab-catalog` carries unit tests for the first time (12 extractor cases + 8 controller cases, including v1 schema compatibility). Collect v2 adds the optional capture `params`, and the JD collector backfills the desktop parameter table, the `og:image` main image, and the mobile-page price fallback. The SPA frame/lens forms switch to the structured vocabularies, the detail view renders the price history and source, and the collect panel's link detail imports with one click. Later rounds: model-assisted enrichment of extraction gaps, a catalog session tool, and a `storage-sqlite` backend.

## Testing

`packages/api/rxlab-catalog`: `tests/extract.spec.ts` (extraction assertions driven by real collected titles: BOLON, material bands, box-method marking, parameter-table precedence, lens vocabulary, bundle classification, absence stays absent) and `tests/catalog-controller.host.spec.ts` (over the memory backend: import idempotency, price merging, family classification, facet filters, v1 schema compatibility). Repository typecheck passes on both packages' dual leaf configs; `apps/rxlab-web` typecheck and vite build pass. Not covered: offline assertions for the JD collector's DOM scraping (needs a real page — the existing executor stays untested against the network, the same boundary as before) and `compatibleVersions` reads on the real json backend (the memory test double enforces strict unit-version equality, so v1 compatibility is asserted at the schema level instead).
