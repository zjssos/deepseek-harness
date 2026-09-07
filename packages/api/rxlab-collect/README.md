---
description: "rxlab product collection: the rxlab_collect storage domain (link assets, captures, run batches), its typed rxlabCollect Remote, the self-mounting Client contribution, and the deterministic L1 JD collector."
kind: "package-reference"
---
# rxlab Collect

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-collect` owns the rxlab product collection data. On the Host it provides the `ctx.collectController` service and the generated `ctx.remote.rxlabCollect` namespace over the `rxlab_collect` storage domain (version 1, per-record layout) with three tables — `links` (platform/shop/product-link assets), `captures` (one record per successful run), and `batches` (serial run state with per-link items). Captures are executed by deterministic L1 collectors (v1 ships a JD adapter over anonymous headless chromium) so the whole run loop is token-free and needs no model key. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots the collector exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: the collector is rxlab-product data, not a generic Host capability. The collected raw domain is the future feed of the product-Wiki importer; this package does not write `rxlab_catalog`.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The rxlab profile composes one row, `rxlab-collect` (`@deepseek-ai/dsh-rxlab-collect`). The Host Loader activates the `CollectController` service, which opens the `rxlab_collect` domain through `ctx.storageDomain` for its lifetime and registers the `rxlabCollect` namespace on the Typert Gateway; the executor registry maps each platform to a deterministic `Collector`, and the controller owns one lazily launched headless chromium for the service lifetime. The SPA's headless client boot activates the package's own `/client` bundle (the modules node half serves it under `/plugins`), and its `apply` mounts the generated Remote contribution, so `remote.rxlabCollect.*` resolves in the browser.

Link assets are the front door: manual `upsertLink` or `importLinks` (CSV text; header `platform,url` plus optional `shopId`/`shopName`/`sku`/`title`, each row validated independently and rejections returned to the UI). Rows that share platform and canonical url merge. `createBatch` enqueues a serial batch over the selected link ids; the batch runs in-process one item at a time (1 s politeness gap), and each item commits the capture row, the link status/last-* fields, and the batch item/counts together — durable state updates only at commit points. `listLinks` filters by platform/shop/status and a case-insensitive query; `listBatches`/`getBatch` expose batch progress; `listCaptures` returns one link's capture history, newest first.

The JD collector visits the canonical mobile page `item.m.jd.com/product/<sku>`, reads the cleaned title and the selected variant label, triggers the page's 分享 → 复制链接 flow to obtain the share purchase link, and reads the displayed price from the desktop page. Prices are stored with their raw text and a note that the displayed price may be a promo/member price, so scheduled rescans can refresh it.

Wire and durable types live in `./types` (browser-safe JSON, no runtime code); the zod schemas live in the Host-only `src/domain.ts`; pure parsing/normalization helpers live in `src/executor/parse.ts` (unit-covered, no network).

-----

<a id="model-experience"></a>
## Model Experience

None, as the collector is browser and Host data and registers no prompt, tool, or session event; captures run without a model key.

#### KV Cache effect

No direct effect; collector mutations do not alter model requests.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Main/detail image URLs are not captured: JD galleries render lazily with no stable DOM URL, so `mainImageUrl`/`detailImageUrls` stay empty until a platform image-mapping milestone.
- Structured specs are not extracted; detail marketing images are the only spec source for these listings (kept as history, no OCR/vision pass yet).
- Price is best-effort: JD can serve an anonymous headless desktop session a risk page without price text (per-network 频控), in which case the capture keeps title/variant/purchase link and omits the price field; rescans under a warmed or logged-in browser session refresh it.
- Anonymous "search/shop discovery" is risk-limited on JD; link assets must be entered or imported (shop-level discovery with a logged-in persistent browser is a later milestone).
- Scheduled rescans (re-capture links on a timer) are a later milestone (M2); retries are manual per batch/failure row today.
- The package has unit coverage for the pure parsing logic only; the Host controller and the network executor have no spec yet (repository per-file coverage gate would still need one before a master merge), and the package has no invariant companion (no independently diverging observation to check).
- The future product-Wiki importer that feeds `rxlab_catalog` from this raw domain is not built; do not read these records as catalog master data.

-----

<a id="dev-note"></a>
## Dev Note

The JD collector drives an anonymous headless chromium. First run needs browsers installed: `pnpm --filter @deepseek-ai/dsh-rxlab-collect run setup:browsers` (or `pnpm exec playwright install chromium`). Runs stay low-frequency by design (serial queue, 1 s gap, public pages only); respect platform terms and do not bulk-abuse.
