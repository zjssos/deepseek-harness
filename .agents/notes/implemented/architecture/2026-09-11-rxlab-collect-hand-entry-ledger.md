# Agent Note: rxlab collect becomes a hand-entry ledger with an analysis-only agent

Status: implemented

English | [中文](2026-09-11-rxlab-collect-hand-entry-ledger.zh.md)

## Problem

The collect module was built around capture: a deterministic headless-chromium collector fetched a product page's title, price, variant, purchase link, and spec table into the `rxlab_collect` domain, and a later milestone added a browser-use agent that discovered shop and product links by browsing with a persistent login. Hand entry existed only as the front door for feeding that pipeline, and the panel's main tab was a link table you selected into run batches.

Sustained use inverted that: the person is the source of truth. The collectors are blocked or degraded exactly where the data matters — JD serves risk pages to the datacenter exit IPs this deployment runs from, price is best-effort, gallery images never captured — while shops, titles, and specs are things the person knows or can paste. What the module needed was not a better collector but a ledger organized the way the work is: 平台 → 店铺 → 商品, filled in by hand, with the agent helping to read material instead of replacing the person as the entry point.

## Decision

Reposition `@deepseek-ai/dsh-rxlab-collect` as a hand-entry ledger and remove the automatic capture line outright.

- **Domain version 3.** Three tables: `shops` (platform, name, optional platform-side key, home url, note), `links` (the product entries filed under a shop), and `drafts` (pending agent proposals). The retired `captures` and `batches` tables are no longer declared. `compatibleVersions` lists 1 and 2 because the current link schema still accepts their stored records: every field this version dropped is absent from the schema, so an old record keeps its identity, platform, url, and title while its capture bookkeeping keys fall away at validation.
- **The link record carries what a person types.** `shopRef` points at a registered shop; `title`, `price`, `selectedSku`, `params`, `mainImageUrl`, `buyUrl`, and `note` are entry fields. The legacy `shopId` (platform-side shop id) and `shopName` (shop text) stay declared and readable, and the UI shows `title ?? titleAtAdd`; the controller preserves whatever it found so re-saving an old entry never destroys it, but never writes those fields again.
- **The controller's RPC surface is shops, entries, and drafts.** `listShops`/`getShop`/`upsertShop`/`removeShop` plus `listLinks`/`getLink`/`upsertLink`/`removeLink`/`importLinks` plus `listDrafts`/`commitDraft`/`rejectDraft`. `removeShop` never deletes product data: it unfiles the shop's entries and reports how many moved. `upsertLink` keeps the platform + canonical-url merge, so entering the same product twice updates one row.
- **Drafts are the only path from the agent to the data.** `CommitDraft` and `rejectDraft` refuse an already-resolved draft with `collect/draft-not-pending`; an accepted product draft may be filed under a shop the person picks, overriding the draft's own.
- **The automatic line is deleted, not disabled.** `src/executor/` (the JD and Taobao collectors), `src/browse/` (the browser session, login flows, snapshot rendering), `src/browser.ts`, `src/browser-launch.ts`, the `browser_*` and `collect_discover_submit` tools, the `browserStatus`/`browserLaunch`/`browserStop` RPCs, the collect CDP settings descriptors, and the `rxlab-collect-browser` / `rxlab-collect-browser-launch` composition rows all go. The `playwright` dependency, the `./browser` and `./browser-launch` exports, the `setup:browsers` script, and the two tsdown entries go with them. Parsing helpers the entry path still needs (`platformFromUrl`, the JD/Taobao url normalizers, the CSV reader, `readableError`) move to `src/parse.ts`.
- **The agent analyzes and proposes.** `@deepseek-ai/dsh-rxlab-collect/tools` now registers `collect_draft_submit`, `collect_list_shops`, and `collect_list_links` under one `tool:collect` prompt section that states the draft contract. The shipped `collect` preset keeps `tool-web`, `tool-ask-user`, and `tool-todo`, and its persona tells the agent to read the material the person hands it, check the ledger before proposing, record only what that material supports, and that it cannot write the ledger. `ctx.systemPrompt`'s `TOOL_BROWSER` section order is renamed to `TOOL_COLLECT`: its only consumer was this package's tool row, so the name followed the use.

## Alternatives considered

**Keep the collectors and add shop grouping on top.** Rejected on the user's explicit direction: every field is entered by hand, and the automatic path is what the change is removing. Keeping it would also keep the browser row, the Playwright dependency, and the risk-control failure modes in the module.

**Group by `platform + shopName` in the SPA without a shop entity.** Rejected: a shop needs its own record — home url, platform-side key, note — and the ledger must be able to hold a shop before any product is filed under it. Front-end-only grouping cannot express that, and "collect per shop" would degrade into "select the links whose text matches".

**Add `shopRef` alongside the legacy `shopId` without a version bump.** Impossible: adding a table changes the declared spec, so a stored version-2 medium would reject at open. The version bump plus `compatibleVersions` is the mechanism the domain layer already provides for exactly this.

**Repoint the legacy `shopId` at the shop entity instead of adding a field.** Rejected: the stored value is a platform-side shop id, so the schema would accept the rewrite while the data pointed at the wrong shop. Silent corruption is worse than a redundant field.

**Have the agent write entries directly, with the UI offering undo.** Rejected on the user's explicit direction: the person confirms each draft. A draft that is never confirmed changes nothing, which is the property that makes the agent safe to point at messy pasted material.

**Keep `captures` as an audit trail of hand edits.** Rejected: the user chose to retire both tables, and an edit-history table nobody reads is the dead weight this change is removing.

## Consequences

The module now needs no browser, no platform account, and no model key: a deployment that never composes the `collect` preset still gets a working ledger. What the ledger holds is exactly what a person or a confirmed draft put there, so its quality follows the input rather than a page's DOM. Stored `captures` and `batches` documents remain on the medium and are no longer read — the panel shows no capture history, and there is no migration. The removed capability is not dormant: restoring the collectors or the browser discovery means writing them again, and the two Agent Notes that recorded them stay archived as history rather than as current authority.

The catalog side loses its collection lineage: `CatalogImportRequest.source` no longer carries `captureId` or `capturedAt`, and the import stamps its own time for the source and the price reading. Records already imported keep their stored source fields; the catalog domain schema is unchanged, so no catalog version bump was needed.

## Testing

`tests/controller.host.spec.ts` (new) pins the flows the repositioning turns on: shop registration, replacement by id, and platform/query listing; entry filing with JD url canonicalization; rejection of an entry naming an unregistered shop; shop removal unfiling its entries; CSV import into the named shop with row rejections; drafts submitted as `pending` without touching the shop table; a malformed submission rejected without writing a draft; acceptance writing the shop once and refusing a second commit; an accepted product draft filed under the person's chosen shop; and rejection writing nothing. `tests/parse.spec.ts` moves to `src/parse.ts` and drops the collector-only cases (`cleanJdTitle`, `cleanTaobaoTitle`, the mobile-url builder) while keeping the url, CSV, and platform coverage. `tests/tools-format.spec.ts` now covers `parsePriceText`, `describeDraftPayload`, `formatDraftSubmit`, `formatShopList`, and `formatLinkList`. `packages/api/rxlab-catalog/tests/catalog-controller.host.spec.ts` drops the removed source fields and asserts the price reading by value instead of by a caller-supplied instant.

Coverage debt recorded in the package README: the tool handlers' argument validation and the SPA panel have no spec.
