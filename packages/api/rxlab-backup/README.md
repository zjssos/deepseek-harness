---
description: "rxlab workbench backup: packages every rxlab_* business storage domain under the workspace storage root into one JSON bundle and restores it, plus the typed rxlabBackup Remote and self-mounting Client contribution."
kind: "package-reference"
---
# rxlab Backup

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-backup` owns the rxlab workbench workspace backup. On the Host it provides the `ctx.backupController` service and the generated `ctx.remote.rxlabBackup` namespace. `export` walks every `rxlab_*` storage domain under the workspace storage root (`rxlabPaths.storageRoot`) and returns every per-record document as one JSON bundle; `import` validates a bundle and writes each record back to `<storageRoot>/<domain>/<table>/<key>.json` through a temporary file and an atomic rename. The package reads its storage root from the existing `rxlabPaths` service, so it adds no cross-package dependency. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots backup exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: the workspace business tree is rxlab-product data, not a generic Host capability.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The rxlab profile composes one row, `rxlab-backup` (`@deepseek-ai/dsh-rxlab-backup`). The Host Loader activates the `BackupController` service, which resolves the workspace storage root from the injected `rxlabPaths` service and registers the `rxlabBackup` namespace on the Typert Gateway. The SPA's headless client boot activates the package's own `/client` bundle, and its `apply` mounts the generated Remote contribution, so `remote.rxlabBackup.export/import` resolve in the browser.

`export` accepts an empty request, lists the `rxlab_*` domain directories under `<storageRoot>`, reads each table's `<key>.json` documents, and returns them sorted by domain, table, and key. `session_projcache` and every non-`rxlab_` unit are excluded, and a document that is malformed or carries no non-negative integer version stamp is skipped. `import` requires `formatVersion: 1`, an array of at most 200000 records, and per record a `rxlab_*` domain plus a path-safe table and key; a record outside those bounds is skipped and counted, while an invalid bundle throws `backup/bad-request`. Each accepted record is written atomically (temporary file, then rename).

Wire types live in `./types` (browser-safe JSON, no runtime code); the controller owns every filesystem and validation concern.

**Runtime invariant:** No runtime invariant companion is published because the workspace storage tree is the authoritative medium, so no independent observation can diverge.

-----

<a id="model-experience"></a>
## Model Experience

### Workspace backup

#### What the model sees

Nothing. The package registers no tools, injects no prompts, and appends no session events; the bundle is assembled behind `ctx.remote.rxlabBackup` and the storage tree, which a model reaches only through a consumer's own documented surface (today the rxlab SPA).

#### Token effect

Zero: no text from this package enters any model request.

#### KV Cache effect

Independent: backup reads and writes never touch request prefixes, so nothing here can invalidate provider cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- An import takes effect only after the app restarts (or the affected domain reopens); the running controllers keep their in-memory tables and do not observe files written underneath them.
- The bundle carries the stored records verbatim and performs no cross-version migration; importing a bundle stamped for a newer or older domain version relies on that domain's own compatible-version policy.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
