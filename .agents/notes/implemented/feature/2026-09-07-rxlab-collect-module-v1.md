# Agent Note: rxlab collect module v1 — link assets over deterministic L1 collectors

Status: implemented

English | [中文](2026-09-07-rxlab-collect-module-v1.zh.md)

## Problem

The rxlab workbench (`dsh rxlab`) needed its 商品采集 (collect) module to actually obtain real product data and land it durably, before any Wiki work: the existing 商品 Wiki `product` rows were synthetic placeholders, and the module previously rendered a placeholder panel. Business scope agreed with the user: capture at the granularity of platform → shop → product link, storing for each link the listing title, displayed price, selected variant, and a share-produced purchase link, with capture time; spec fields are not structured (detail images stay as history). The Wiki catalog is explicitly out of scope — collected records live in their own raw domain.

Route feasibility was probed first against JD (BOLON 官方旗舰店, mall.jd.com/index-57589) in the business engine repo (`glasses-packing-workbench/probes`, untracked): anonymous scripted search/shop discovery is risk-limited by JD ("访问频繁无法搜索", mobile `risk_handler`, login wall), while per-item mobile product pages (`item.m.jd.com/product/<sku>`) are anonymously reachable and their 分享 → 复制链接 flow deterministically yields the purchase link (`item.m.jd.com/product/<sku>.html?utm_campaign=…`). A deterministic anonymous headless run captured 6/6 pilot items at ~6.75 s/item; an agent-driven real-browser run captured the same 6 items with identical share links. The deterministic L1 line is therefore feasible and token-free; L3 (phone scrcpy/OCR) is deferred until a device is attached.

## Decision

Ship v1 as a new official dual-face package, `@deepseek-ai/dsh-rxlab-collect` under `packages/api/`, mirroring `@deepseek-ai/dsh-rxlab-catalog` (same `clientBundle`/typert chain, same profile-row composition, same `dsh.client` self-mount, same storage-domain form). It owns three entity families in one storage domain:

- `rxlab_collect` domain (version 1, per-record layout) with three tables: `links` (assets: platform/shop/sku/url/mobileUrl/status/last-capture summary), `captures` (one record per successful run: title/price(displayed value+raw+note)/selectedSku/buyUrl/capture time), and `batches` (queued run state with per-link items and counts).
- `CollectController extends TypertRemoteService` registers the `rxlabCollect` Remote namespace with link verbs `listLinks` / `getLink` / `upsertLink` (merges rows sharing the same platform+canonical url) / `removeLink` / `importLinks` (CSV rows validated independently, rejections returned to the UI), batch verbs `createBatch` (validates every link id, enqueues) / `listBatches` / `getBatch`, and `listCaptures` per link.
- The executor registry maps platform → deterministic `Collector`. v1 ships the JD adapter (anonymous headless chromium: mobile page title + 分享/复制链接 purchase link, desktop page price read); unimplemented platforms fail loud with `collect/adapter-unavailable`. The controller owns the chromium browser for the service lifetime (lazy launch, closed on dispose) and runs batches serially (single in-process promise chain, 1 s politeness gap), writing durable state only at each item's commit point — capture row, link status/last-* fields, and batch item/counts together.

Platform/shop/product-link management is the front door (manual entry + CSV import); shop discovery (店铺展开, needs a logged-in persistent browser) and scheduled rescans are later milestones (M2/M3), as is any future import into the Wiki catalog. The module deliberately needs no model key — the whole run loop is deterministic, matching the user's token budget. Price is captured as displayed with a note that promo/member prices drift, so rescans refresh it.

Profile wiring: one new row `rxlab-collect` in `packages/bundle/rxlab-app/cordis.patch.yml` plus a bundle dependency; the SPA module (`apps/rxlab-web/src/modules/collect/`) flips to `active` with a link-asset tab (filters, manual add, CSV import, selection → batch, per-row capture/detail/delete) and a batch tab (list + per-item progress, polled). Reads/writes go through `use-collect.ts` hooks over `runtime.remote.rxlabCollect`; list refresh is a nonce plus a light 4 s poll while in flight.

## Alternatives considered

**Follow the Wiki catalog shape and write captures into `rxlab_catalog`.** Rejected: Wiki rows were synthetic and the user explicitly deferred Wiki work; captures need per-link history and run state that catalog rows do not model. Keeping a separate raw domain leaves a clean future import step.

**Execute through agent sessions (L2).** Probe-proven but slower, token-consuming, and requires a new browser-tooling capability seam host-side; the user chose L1 ("整体可行, token 较少"), keeping L2 as a later escape hatch for pages the deterministic path cannot handle.

**Deterministic per-platform site scraping of list/shop pages.** JD blocks anonymous discovery outright; per-link item pages are the reachable, shareable surface and match the user's "scripts process links" model.

**Put price and images behind JD private APIs.** The public price endpoint was refused on this network; price is read from the rendered desktop DOM with its raw text, and images are left un-structured (lazy-rendered galleries have no stable DOM URL), recorded as a Known Limitation for a later image-mapping milestone.

## Consequences

The collect module now lands real captures end to end: CSV/paste or manual add → link rows under `$DSH_HOME/storages-rxlab/` → selected links run as a serial batch → per-link captures (title/price/selected/buyUrl + time) and batch/row statuses persisted, browsable in the SPA. Runs need no API key; failure rows carry readable errors and can be retried. The raw domain is the future feed for the Wiki catalog importer; scheduled rescans (M2) will refresh price/availability over the same queue.

## Testing

Unit tests (`tests/parse.spec.ts`) cover the offline pure logic: platform guessing from URLs, JD sku/mobile/desktop canonicalization and title cleaning, CSV splitting (quoted commas/newlines, escaped quotes, unclosed-quote rejection) and header→record mapping with row-level rejections. The network executor is not unit-tested; live evidence is the end-to-end run through `dsh rxlab` + SPA on the six BOLON pilot links (import → batch → records with share links; invalid-row failure path), consistent with the feasibility probe. Coverage debt (host-controller spec, per-file coverage) and the M2/M3 items are recorded in the package README Known Limitations.
