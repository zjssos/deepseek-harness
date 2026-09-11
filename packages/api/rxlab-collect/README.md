---
description: "rxlab product collect: the rxlab_collect storage domain (registered shops, the product entries filed under them, the agent's pending drafts), its typed rxlabCollect Remote, the self-mounting Client contribution, and the analysis-only collect agent preset whose drafts a person confirms."
kind: "package-reference"
---
# rxlab Collect

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-collect` owns the rxlab 商品采集 ledger. On the Host it provides the `ctx.collectController` service and the generated `ctx.remote.rxlabCollect` namespace over the `rxlab_collect` storage domain (version 3, per-record layout; version 1 and 2 link records stay readable) with three tables — `shops` (a platform + shop a person registered), `links` (the product entries filed under a shop), and `drafts` (agent proposals awaiting a person's decision). Hand entry is the source of truth: a person types every product field, singly or through CSV import, and nothing is read from a web page — the package ships no collector and no browser, so it needs no model key and no headless chromium. The shipped `collect` agent preset mounts an analysis-only tool set: the agent reads material the person hands it, the `collect_list_*` lookups keep it from proposing a duplicate, and `collect_draft_submit` records pending drafts — only a person's acceptance turns a draft into a shop or a product entry. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots the ledger exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: this is rxlab-product data, not a generic Host capability. Importing an entry into the product Wiki stays on the catalog side (`rxlabCatalog.importCollected`); this package does not write `rxlab_catalog`.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The rxlab profile composes one row, `rxlab-collect` (`@deepseek-ai/dsh-rxlab-collect`). The Host Loader activates the `CollectController` service, which opens the `rxlab_collect` domain through `ctx.storageDomain` for its lifetime and registers the `rxlabCollect` namespace on the Typert Gateway. The SPA's headless client boot activates the package's own `/client` bundle (the modules node half serves it under `/plugins`), and its `apply` mounts the generated Remote contribution, so `remote.rxlabCollect.*` resolves in the browser. The rxlab profile also composes the `agent-presets` roster row, so the SPA can create a session on the shipped `collect` preset (see below).

**Shops are the organizing unit.** `upsertShop` registers or replaces one shop (platform, name, optional platform-side key, home page url, and note) and `listShops` filters by platform and a case-insensitive name/key/home-url query. Shops are not de-duplicated: a present id replaces that row and an absent id always mints a new one, so a person's rename never collides with a neighbour. `removeShop` never deletes product data — every entry filed under the shop loses its shop link and returns to the unfiled list, and the receipt reports how many moved.

**Product entries are typed in by hand.** `upsertLink` takes a full entry (owning shop, url, title, price text, sku, selected variant, spec-parameter pairs, main image url, purchase url, note); entries that share a platform and a canonical url merge into one row, so entering the same product twice updates it instead of duplicating it. `importLinks` bulk-creates from CSV text (header `url` plus optional `platform`/`sku`/`title`, each row validated independently with rejections returned to the UI) and files every accepted row under the shop the request names. `listLinks` filters by platform, one shop, or the unfiled set, plus a case-insensitive title/sku/url query. `getLink` reads one entry and `removeLink` deletes one.

**The agent proposes, a person decides.** `collect_draft_submit` records what the agent derived from the material it was given; every entry is validated independently and stored as a `pending` draft, and nothing reaches the shop or product tables. `listDrafts` exposes the queue (by status and target), `commitDraft` writes the entry the draft proposes and marks it accepted in one call (a product draft may be filed under a shop the person picks, overriding the draft's own), and `rejectDraft` marks it rejected without writing anything. An already-resolved draft refuses either operation with `collect/draft-not-pending`.

**Agent tools (per-session).** `@deepseek-ai/dsh-rxlab-collect/tools` registers `collect_draft_submit`, `collect_list_shops`, and `collect_list_links`, plus one `tool:collect` system-prompt section explaining the draft contract. The shipped `collect` agent preset (`packages/preset/agent-presets/presets/collect/`) mounts that row with `tool-web`, `tool-ask-user`, and `tool-todo` under a persona that reads material the person provides (pasted text, or a public url it fetches), checks the ledger before proposing, and is told plainly that it cannot write the ledger itself. The preset ships no browser tools: analysis is its only capability.

Domain version 3 adds `shops` and `drafts` and drops the retired `captures` and `batches` tables; their documents remain on the medium unread. `compatibleVersions` lists 1 and 2 because the current link schema still accepts those stored records — the legacy `shopId`, `shopName`, and `titleAtAdd` fields stay declared and readable (the UI shows `title ?? titleAtAdd`) while the controller never writes them again.

Wire and durable types live in `./types` (browser-safe JSON, no runtime code); the zod schemas live in the Host-only `src/domain.ts`; pure parsing/normalization helpers live in `src/parse.ts` and the pure receipt/list formatting lives in `src/tools.ts` (unit-covered, no network).

**Runtime invariant:** No runtime invariant companion is published because the `rxlab_collect` durable schema owns the shop/entry/draft relationships and every write goes through the controller's own validation, so no independent observation can diverge.

-----

<a id="model-experience"></a>
## Model Experience

### Collect tools (per-session)

#### What the model sees

Sessions composed on the shipped `collect` preset carry the `collect_draft_submit`, `collect_list_shops`, and `collect_list_links` tool schemas plus one `tool:collect` system-prompt section. When only the base `rxlab-collect` row is mounted, nothing registers: no prompt, tool, or session event, and the ledger works without a model key.

#### Token effect

The mounted tool schemas and the `tool:collect` section enter every model request of a session composed on the `collect` preset; hand entry, draft review, and ledger mutations add nothing to model requests.

#### KV Cache effect

Stable within a session: the tool schemas and prompt section mount once at session composition, so their prefix contribution caches like the rest of the system prompt; ledger data changes never invalidate it.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Nothing is captured automatically, by design. The deterministic JD/Taobao collectors and the browser discovery surface were removed with domain version 3; every field comes from a person or from a draft they confirmed, so an entry is only as complete as the material it was entered from.
- Documents written by version 1 and 2 for the retired `captures` and `batches` tables stay on the medium and are no longer declared or read. There is no migration and no UI for them.
- Legacy link records keep their `shopId` and `shopName` text but are not attached to a shop: they appear in the unfiled list until a person files them.
- Agent drafts are proposals, never a source of truth: a draft the person never confirms changes nothing, and a malformed entry is rejected at submission with its reason rather than repaired.
- The package has unit coverage for the pure parsing/formatting helpers and for the Host controller's shop, entry, and draft flows; the tool handlers' argument validation and the SPA panel have no spec yet.
- The raw domain stays read-only toward the catalog: the Wiki import runs on the catalog side (`rxlabCatalog.importCollected`); this package does not write `rxlab_catalog`.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The module needs no browser and no platform account: install nothing and respect nothing but the person's own data. `pnpm --filter @deepseek-ai/dsh-rxlab-collect run bundle` rebuilds the Host, tools, and Client bundles; the `rxlab_collect` domain is opened where the deployed storage backend serves it (`rxlab-app` routes it to the workspace storage root).

</details>
