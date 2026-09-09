# Agent Note: rxlab collect agent browser use — discovery replaces the CSV front door

Status: implemented

English | [中文](2026-09-08-rxlab-collect-agent-browser-use.zh.md)

## Problem

The collect module's link-asset front door was manual entry or CSV import, and JD's risk control blocks anonymous search/shop discovery outright — so "collect the links for a shop" meant a person browsing, copying urls, and pasting them back. The v1 note kept shop discovery (店铺扩展, needs a logged-in persistent browser) as an M2 item and left the deterministic L1 line token-free. The user then asked to close that gap with the harness's own agent: browse platform pages with login state, summarize what is found, and persist shop/product links directly, replacing the CSV prerequisite. The harness's `web/` group deliberately owns no browsing (only anonymous search/fetch), so no ready-made browser-use assembly existed to mount — the capability had to be built on the rxlab side where the login profile and the link-asset domain both live.

## Decision

Give `@deepseek-ai/dsh-rxlab-collect` an agent browse surface, shipped as two additional plugin rows of the same package and consumed by a new shipped agent preset:

- `./browser` (`CollectBrowserSession`, service `ctx.collectBrowser`): one browser session with two launch modes. `persistent` (default) owns a Playwright **persistent context** over a user-data directory (`profileDir`, default `$DSH_HOME/rxlab-browser`), so a platform login survives process restarts; `cdp` connects over Chrome DevTools Protocol to an already-running real browser (`cdpEndpoint`, default `http://127.0.0.1:9222`), reusing its real logins and fingerprint. Launch/relaunch serialize on one chain; disposal runs after the chain settles, and CDP teardown only disconnects (never closes the real browser). `login(url, check)` in persistent mode relaunches headed, opens the entry page, polls the platform login check while the person signs in (config `loginTimeoutMs`), then restores headless and verifies the check still passes; in CDP mode it opens the page in the real browser and polls the check — the login state is proven on the real session, not assumed. The host row reads its launch mode from the rxlab startup flags, so `dsh rxlab --cdp` runs it in cdp mode; CDP attaches lazily on first browse use and fails fast with launch guidance when the debugging endpoint is down, so the dedicated browser only needs to be open while the agent actually browses.
- `./tools` (`rxlab-collect-tools`): model-facing `browser_navigate` / `browser_snapshot` / `browser_click` / `browser_type` / `browser_scroll` / `browser_back` / `browser_login` plus `collect_discover_submit` and `collect_list_links`. Snapshots render readable body text plus capped interactive-element refs (injected `data-dsh-ref` attributes); every action returns a fresh snapshot, click/type validate refs against the last snapshot's element range with a re-snapshot recovery error, and a politeness delay follows every load. `browser_login` resolves per-platform flows from `browse/login.ts` (v1 ships `jd`); unknown platforms fail loud.
- `CollectController.submitDiscovered` (host-internal, no Remote method): per-entry validation like CSV import, platform guessed from the url when absent, same platform+canonical-url merge.
- The shipped `collect` preset (`packages/preset/agent-presets/presets/collect/`) mounts the tools row with `tool-web` (public discovery fallback), `tool-todo`, and `tool-ask-user`, under a persona that carries the workflow: plan, dedupe against `collect_list_links`, browse public entry points, submit in batches, request the manual login when a wall appears, report created/merged/rejected. The browser session row itself sits in the rxlab bundle's HOST composition beside `rxlab-collect` — a preset-provided service would have to isolate per agent, and two agents each launching the same user-data directory would race Playwright's per-directory process lock; host-plane ownership gives one instance and one login profile per host.
- The rxlab profile gains the `agent-presets` roster row; the session-create client contract (`ISessions.create`) grows an `agentPreset` option so the rxlab SPA's create picker composes a session on it. Playwright stays as the driver — the upgrade is that deterministic scripts become model-driven browse tools over a persistent logged-in session, not a library swap.

## Alternatives considered

**A generic browser-use capability seam (`packages/web/…` with Service Definition / Provider / Consumer).** Rejected for this milestone: the only consumer is the collect agent, the login profile and the discovery write path are rxlab-owned, and a generic seam would force public choices (login model, profile layout, flow registry) with no second consumer to evidence them. The rows stay package-local and can be promoted later.

**Auto login from `credentials` (headless username/password).** Rejected: platform login walls are QR/captcha-first on this business's platforms; automation would fail exactly where it matters and invites risk-control escalation. The headed manual window is the honest flow.

**One shared headed browser for everything.** Rejected: the deterministic collectors keep their own anonymous headless chromium (token-free capture path unchanged); the persistent login session is separate so agent browsing can never contaminate the deterministic run loop's anonymity assumptions.

## Consequences

A session composed on the `collect` preset can now discover and persist links end to end: plan → browse (search/shop/category pages) → submit batches into `rxlab_collect` → the existing deterministic collectors run against them as before. CSV import remains and the SPA gains a preset picker on session create. The mounted tool schemas and the `tool:browser` prompt section ride every model request of such sessions (KV effect documented in the package README). Login is manual and one profile is shared per host; profiles are wiped, not rotated.

## Testing

`tests/tools-format.spec.ts` pins the pure model-facing formatting: snapshot layout and per-dimension truncation notes, submit receipts (created/merged/rejected lines, shop-name suffix), and link-list rendering including the empty case. The browser session and tool executes are not unit-tested (Playwright-coupled, following the package's executor precedent); the composition path is exercised through `tsc` project builds for both faces and the preset is parsed by the shipped-roster discovery. Coverage debt for the browse session is recorded in the package README Known Limitations.
