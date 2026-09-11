---
description: "The rxlab workbench app bundle: the dsh rxlab profile's patch layer composing the standalone glasses-packing SPA surface, rxlab business data rows, and the collect browser-use host row."
kind: "package-bundle"
---

# @deepseek-ai/dsh-rxlab-app

English | [中文](README.zh.md)

## Summary

`dsh-rxlab-app` is the bundle behind `dsh rxlab`, the rxlab workbench profile (验光配镜工作台). As a patch layer over [dsh-base](../base/README.md) it composes three things the base does not carry: the standalone SPA surface (webserver bound from rxlab flags, the built rxlab-web frontend, and browser authentication over `/api`), the rxlab business data rows (the product-Wiki catalog and the product collector, each with its own storage domain under a rxlab-isolated `storages-rxlab` root), and the host-plane login-capable browser behind the collect agent's browser-use tools. The agent plane keeps the base defaults; sessions run through the ordinary Remote surface.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Start the workbench with `dsh rxlab`; the launcher composes the profile from this bundle's patch (`cordis.patch.yml`) over dsh-base. `dsh rxlab --help` shows the surface flags; `--profile rxlab --help` (without the rxlab startup service) runs no server.

| Flag | Default | Meaning |
|---|---|---|
| `--host` | `127.0.0.1` | Bind host for the workbench server (`0.0.0.0` is rejected) |
| `--port` | `3081` | Bind port; chosen to run beside the web profile's 3080 |
| `--no-open` | off | Skip opening the canonical URL in a browser |

The SPA talks to the host through the `/api` Remote channel; rxlab data lands under `$DSH_HOME/storages-rxlab`, sessions under `sessions-rxlab`, and settings under `settings-rxlab.yaml`, so the profile can run beside the web profile over the same home without sharing business data. Credentials stay shared so models keep working.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Patch surface over base

The patch replaces whole base rows by id (a patch row restates every key it owns) and inserts the rxlab rows: `rxlab-startup` (commander parsing of the flags, providing `rxlabStartup`), `webserver` and `connection` (bind values and the `/api` trust fence supplied by `rxlabStartup`/`rxlabRuntime`), `rxlab-runtime` (this bundle's glue: resolves the built frontend dist, mounts the frontend-static fallback owner, registers the rxlab surface prompt section, prints the URL line, opens the browser, and provides `rxlabRuntime` after the server binds), the session Remote surface rows, the rxlab business rows `rxlab-catalog` and `rxlab-collect`, and the `agent-presets` roster. Data isolation rides per-row overrides of `settings`, `session-persistence-jsonl`, and `storage-json`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The `rxlab-runtime` glue plugin: dist resolution, frontend mounting, surface context, runtime values |
| [`src/startup.ts`](src/startup.ts) | The `rxlab-startup` provider: flag parsing and invocation-only values |
| [`cordis.patch.yml`](cordis.patch.yml) | The rxlab patch over dsh-base |
| — | No runtime invariant companion is published; the bundle is an assembly, and its observable behavior is owned by the rows it composes (each documented in its own package README). |

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Surface persona and preset roster

#### What the model sees

Sessions on this surface get the rxlab persona line on the base `system-prompt` row (the glasses-packing workbench context), and a session created on the shipped `collect` preset additionally carries that preset's tool schemas and `tool:browser` section. The bundle itself contributes no plugins of its own to the model plane.

#### Token effect

The persona text rides every rxlab session's system prompt; the collect-preset additions ride only sessions composed on that preset. Bundle composition itself adds no further request text.

#### KV Cache effect

Stable: the persona is fixed per surface and the preset roster mounts per session at composition, so both cache like the rest of the system prompt; rxlab data changes never invalidate a request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The frontend dist is an assembly fact** — the profile serves the built `@deepseek-ai/dsh-rxlab-web-frontend/dist`; the dist is not committed, so a source checkout must build the frontend before `dsh rxlab` can serve it.
- **Shared browser-auth copy** — a request without a token gets the shared dsh browser-authentication page, whose wording still says "dsh web"; a rxlab-specific rendering is a polish item.
- **Business-module coverage** — the 验光配镜/推荐校验/效果图 modules are planned panels; the persona states they are not connected instead of inventing tools for them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The assembly and layered-architecture walkthrough (rows, patch semantics, SPA data layer) lives in the rxlab documentation area: [`.agents/notes/rxlab/2026-09-07-assembly-and-layered-architecture.md`](../../../.agents/notes/rxlab/2026-09-07-assembly-and-layered-architecture.md).

</details>
