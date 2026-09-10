---
description: "rxlab workbench content: the rxlab_content storage domain of knowledge and script entries plus its typed rxlabContent Remote and self-mounting Client contribution."
kind: "package-reference"
---
# rxlab Content

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-content` owns the rxlab workbench knowledge and talk-script content. On the Host it provides the `ctx.contentController` service and the generated `ctx.remote.rxlabContent` namespace; the namespace reads and writes the `rxlab_content` storage domain (version 1, per-record layout) whose single `items` table holds `kind: 'knowledge' | 'script'` entries tagged to an optional workbench stage. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots content exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: content entries are rxlab-product data, not a generic Host capability.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The rxlab profile composes one row, `rxlab-content` (`@deepseek-ai/dsh-rxlab-content`). The Host Loader activates the `ContentController` service, which opens the `rxlab_content` domain through `ctx.storageDomain` for its lifetime and registers the `rxlabContent` namespace on the Typert Gateway. The SPA's headless client boot activates the package's own `/client` bundle (the modules node half serves it under `/plugins`), and its `apply` mounts the generated Remote contribution, so `remote.rxlabContent.list/get/upsert/delete` resolve in the browser.

`upsert` validates its draft against the domain zod schema at the wire boundary, mints the item id and write timestamp, and queues the write on the domain's single write chain (durability first, then memory, then `domain/changed`); an absent request id mints a new item, a present id replaces the stored one. `list` filters by the closed `kind` and `stage` unions plus a case-insensitive title/tags substring, returning newest-write-first summaries that omit the body. `get` throws `content/not-found` on an absent id. `delete` reports whether an item existed and never writes when it did not.

Wire and durable types live in `./types` (browser-safe JSON, no runtime code); the zod schemas live in the Host-only `src/domain.ts`.

**Runtime invariant:** No runtime invariant companion is published because the `rxlab_content` durable schema owns every record relationship, so no independent observation can diverge.

-----

<a id="model-experience"></a>
## Model Experience

### Workbench content

#### What the model sees

Nothing. The package registers no tools, injects no prompts, and appends no session events; the `rxlab_content` rows live behind `ctx.remote.rxlabContent` and the storage domain, which a model reaches only through a consumer's own documented surface (today the rxlab SPA).

#### Token effect

Zero: no text from this package enters any model request.

#### KV Cache effect

Independent: content reads and writes never touch request prefixes, so nothing here can invalidate provider cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The content manager panel is a later SPA change; until then the namespace has no browser consumer in the workbench.
- Lists refresh on demand; the panel does not yet subscribe to `domain/changed` for live multi-client sync.
- Bodies are stored whole per record; full-text search over large content sets is not indexed.
- The stage vocabulary is duplicated from the job domain to keep this package independent; the job package owns the authoritative list.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
