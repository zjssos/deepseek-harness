---
description: "rxlab product collection: the rxlab_collect storage domain (link assets, captures, run batches), its typed rxlabCollect Remote, the self-mounting Client contribution, the deterministic L1 JD collector, and the agent browse (browser-use) surface with the collect agent preset."
kind: "package-reference"
---
# rxlab Collect

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-collect` owns the rxlab product collection data. On the Host it provides the `ctx.collectController` service and the generated `ctx.remote.rxlabCollect` namespace over the `rxlab_collect` storage domain (version 2, per-record layout; version-1 captures stay readable) with three tables — `links` (platform/shop/product-link assets), `captures` (one record per successful run), and `batches` (serial run state with per-link items). Captures are executed by deterministic L1 collectors (v1 ships a JD adapter over anonymous headless chromium) so the whole run loop is token-free and needs no model key. The package also owns the agent browse (browser-use) surface: a `CollectBrowserSession` over one persistent logged-in chromium and the model-facing `browser_*`/`collect_discover_submit` tools, which the shipped `collect` agent preset composes so one session can discover shop and product links by browsing and persist them directly — the CSV import stops being the only link-asset front door. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots the collector exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: the collector is rxlab-product data, not a generic Host capability. The collected raw domain is the future feed of the product-Wiki importer; this package does not write `rxlab_catalog`.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The rxlab profile composes one row, `rxlab-collect` (`@deepseek-ai/dsh-rxlab-collect`). The Host Loader activates the `CollectController` service, which opens the `rxlab_collect` domain through `ctx.storageDomain` for its lifetime and registers the `rxlabCollect` namespace on the Typert Gateway; the executor registry maps each platform to a deterministic `Collector`, and the controller owns one lazily launched headless chromium for the service lifetime. The SPA's headless client boot activates the package's own `/client` bundle (the modules node half serves it under `/plugins`), and its `apply` mounts the generated Remote contribution, so `remote.rxlabCollect.*` resolves in the browser. The rxlab profile also composes the `agent-presets` roster row, so the SPA can create a session on the shipped `collect` preset (see below).

Link assets are the front door: manual `upsertLink`, `importLinks` (CSV text; header `platform,url` plus optional `shopId`/`shopName`/`sku`/`title`, each row validated independently and rejections returned to the UI), or the agent's `collect_discover_submit` (same per-entry validation; platform guessed from the url when absent). Rows that share platform and canonical url merge. `createBatch` enqueues a serial batch over the selected link ids; the batch runs in-process one item at a time (1 s politeness gap), and each item commits the capture row, the link status/last-* fields, and the batch item/counts together — durable state updates only at commit points. `listLinks` filters by platform/shop/status and a case-insensitive query; `listBatches`/`getBatch` expose batch progress; `listCaptures` returns one link's capture history, newest first.

**Agent browse (browser use).** Two additional plugin rows mount the agent surface: `@deepseek-ai/dsh-rxlab-collect/browser` provides `ctx.collectBrowser` — one `CollectBrowserSession` with two launch modes. `persistent` (default) owns a Playwright persistent context whose user-data directory (config `profileDir`, default under the harness home) keeps the platform login state across restarts; `cdp` connects over Chrome DevTools Protocol to an already-running real browser (config `cdpEndpoint`, default `http://127.0.0.1:9222`), reusing its real logins and fingerprint. The browser session is a HOST-plane row beside `rxlab-collect` in the rxlab bundle: one instance and one login profile per host, so concurrent collect sessions share the profile instead of racing Playwright's per-directory process lock. `@deepseek-ai/dsh-rxlab-collect/tools` registers the model-facing tools: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_scroll`, `browser_back`, `browser_login`, `collect_discover_submit`, and `collect_list_links`. Snapshots render the page as readable text plus capped interactive-element refs (injected `data-dsh-ref` attributes); every action returns a fresh snapshot. `browser_login` in persistent mode relaunches headed, opens the platform login page, and waits (config `loginTimeoutMs`) while the person signs in, then restores the headless context and verifies the login state survived; in CDP mode it opens the page in the real browser and polls the login check — the person signs in over there and the cookie is the proof. The shipped `collect` agent preset (`packages/preset/agent-presets/presets/collect/`) mounts the tools row with `tool-web`, `tool-todo`, and `tool-ask-user` under a persona that carries the discovery workflow (plan, dedupe against `collect_list_links`, browse public entry points, submit findings in batches, ask for the manual login, report). The rxlab host row defaults to the owned persistent profile; `dsh rxlab --cdp` switches it to attach over CDP, and CDP attaches only when a browse tool first runs — a closed browser fails fast with launch guidance instead of blocking app startup.

The JD collector visits the canonical mobile page `item.m.jd.com/product/<sku>`, reads the cleaned title and the selected variant label, triggers the page's 分享 → 复制链接 flow to obtain the share purchase link, reads the displayed price from the desktop page (falling back to the mobile page's own price text), captures the main image from the page's `og:image` meta, and scrapes the desktop spec-parameter table into name/value `params` pairs (品牌/材质/尺寸/重量...). Prices are stored with their raw text and a note that the displayed price may be a promo/member price, so scheduled rescans can refresh it. These capture fields are exactly the feed the product-Wiki import (`rxlabCatalog.importCollected`) consumes.

Wire and durable types live in `./types` (browser-safe JSON, no runtime code); the zod schemas live in the Host-only `src/domain.ts`; pure parsing/normalization helpers live in `src/executor/parse.ts` and the pure snapshot/receipt formatting lives in `src/browse/snapshot.ts` + `src/tools.ts` (unit-covered, no network).

**Runtime invariant:** No runtime invariant companion is published because the `rxlab_collect` durable schema owns the link/capture/batch relationships and capture runs through the existing executor seam, so no independent observation can diverge.

-----

<a id="model-experience"></a>
## Model Experience

### Collect tools (per-session)

#### What the model sees

Sessions composed on the shipped `collect` preset carry the `browser_*`, `collect_discover_submit`, and `collect_list_links` tool schemas plus one `tool:browser` system-prompt section; the deterministic capture loop registers nothing model-visible. When only the base `rxlab-collect` row is mounted, nothing registers: no prompt, tool, or session event, and captures run without a model key.

#### Token effect

The mounted tool schemas and the `tool:browser` section enter every model request of a session composed on the `collect` preset; collector runs and mutations add nothing to model requests.

#### KV Cache effect

Stable within a session: the tool schemas and prompt section mount once at session composition, so their prefix contribution caches like the rest of the system prompt; collector data changes never invalidate it.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Main/detail gallery image URLs are not captured: JD galleries render lazily with no stable DOM URL, so `detailImageUrls` stays empty; `mainImageUrl` is the best-effort `og:image` meta read.
- Structured specs come from the desktop parameter table only; pages that render the table behind client-side hydration the anonymous session never reaches keep only the title and variant text as spec signal.
- Price is best-effort: JD can serve an anonymous headless session a risk page without price text (per-network 频控), in which case the capture keeps title/variant/purchase link and omits the price field; rescans under a warmed or logged-in browser session refresh it.
- Deterministic capture ships two collectors — JD (`item.jd.com`) and Taobao/Tmall (`item`/`detail` …`item.htm`) — both anonymous and failing fast on login/risk pages, so one platform being risk-blocked does not stop the others. Agent discovery covers JD login only: `browser_login` ships one flow (`jd`); other platforms browse public pages only. The login is manual — in persistent mode the person signs in the headed window, in CDP mode they sign in inside the real browser — and one profile/browser is shared by every session on the host. There is no multi-account or credential storage; a wiped persistent profile means a fresh login.
- JD frequency control blocks `search.jd.com` and the desktop `item.jd.com` page from datacenter exit IPs (登录前后均"访问频繁"/403); the agent preset teaches the fallback paths (`so.m.jd.com/chanpin/<keyword>` aggregation pages and `item.m.jd.com/product/<sku>` H5 pages), which are the reliable public surfaces from such IPs.
- Scheduled rescans (re-capture links on a timer) are a later milestone (M2); retries are manual per batch/failure row today.
- The package has unit coverage for the pure parsing and formatting logic only; the Host controller, the network executor, and the browse session have no spec yet (repository per-file coverage gate would still need one before a master merge), and the package has no invariant companion (no independently diverging observation to check).
- The raw domain stays read-only toward the catalog: the Wiki import runs on the catalog side (`rxlabCatalog.importCollected`); this package does not write `rxlab_catalog`.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The JD collector drives an anonymous headless chromium. First run needs browsers installed: `pnpm --filter @deepseek-ai/dsh-rxlab-collect run setup:browsers` (or `pnpm exec playwright install chromium`). Runs stay low-frequency by design (serial queue, 1 s gap, public pages only); respect platform terms and do not bulk-abuse.

</details>
