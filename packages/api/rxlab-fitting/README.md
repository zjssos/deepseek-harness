---
description: "rxlab optometry module: the rxlab_fitting storage domain of staged exam records, the deterministic prescription derivation engine, and the typed rxlabFitting Remote with a self-mounting Client contribution."
kind: "package-reference"
---
# rxlab Fitting

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-fitting` owns the rxlab optometry module's data. On the Host it provides the `ctx.fittingController` service and the generated `ctx.remote.rxlabFitting` namespace; the namespace reads and writes the `rxlab_fitting` storage domain (version 1, per-record layout) of staged refraction exam records, and its `derive` RPC runs the deterministic prescription engine over a draft without storing anything. On the Client the package ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots fitting exactly where rxlab-product data is composed. The package deliberately never joins the platform `api-remotes` assembly: fitting records are rxlab-product data, not a generic Host capability.

## Table of Contents

- [The exam-record model](#the-exam-record-model)
- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="the-exam-record-model"></a>
## The exam-record model

One exam record captures the refraction process as nine optional-but-checked stages, keyed by the closed `id` discriminant: `anamnesis` (age, first-exam flag, usage), `baseline` (measured old-glass powers and acuity), `objective` (averaged autorefractor/retinoscopy readings), `cycloplegia` (none / fogging / cycloplegia), `subjective` (MPMVA → duochrome → JCC axis → JCC cylinder → refined endpoint, per eye), `binocular` (balance nudges and final spheres), `trial` (tolerance and the 0.25 D-step rollback), `add` (near addition), and `pdMeasure` (monocular PD, optional PH). `anamnesis`, `objective`, `subjective`, `binocular`, and `pdMeasure` are required; an under-16 first exam additionally requires a non-`none` `cycloplegia` stage.

`derive` validates the record and returns the final prescription (binocular-final spheres, subjective cylinders and axes, per-eye ADD, monocular-PD sum, trial rollback added back as plus sphere) plus findings and lens/frame advice. FAIL findings suppress the prescription; WARN findings travel with it. The advice picks the refractive index by worst power (cylinder ≥ 2 D steps one index up), lens types by usage and ADD, a frame-size band (FPD = lensWidth + bridgeWidth) from the PD with a 3 mm per-eye decentration cap, and rimless/half-rim advisability by power and cylinder. These encode simplified industry convention (never over-minus, cylinder at or below the refined value, ADD at or below the measured value); the workbench is a decision aid, not a medical device.

## Use this package

The rxlab profile composes one row, `rxlab-fitting` (`@deepseek-ai/dsh-rxlab-fitting`). The Host Loader activates the `FittingController` service, which opens the `rxlab_fitting` domain through `ctx.storageDomain` for its lifetime and registers the `rxlabFitting` namespace on the Typert Gateway. The SPA's headless client boot activates the package's own `/client` bundle (the modules node half serves it under `/plugins`), and its `apply` mounts the generated Remote contribution, so `remote.rxlabFitting.list/get/upsert/delete/derive` resolve in the browser.

`upsert` validates its draft against the domain zod schema at the wire boundary, mints the record id and write timestamp, and queues the write on the domain's single write chain (durability first, then memory, then `domain/changed`). `list` applies a case-insensitive patient/date substring match and returns newest-write-first summaries. `get` throws `fitting/not-found` on an absent id. `derive` never persists.

Wire and durable types live in `./types` (browser-safe JSON, no runtime code); the zod schemas live in the Host-only `src/domain.ts`; the pure engine lives in `./prescription`.

**Runtime invariant:** No runtime invariant companion is published because the `rxlab_fitting` durable schema owns every record relationship and the derivation engine is a pure function, so no independent observation can diverge.

## Model Experience

### Fitting data

#### What the model sees

Nothing. The package registers no tools, injects no prompts, and appends no session events; the `rxlab_fitting` records live behind `ctx.remote.rxlabFitting` and the storage domain, which a model reaches only through a consumer's own documented surface (today the rxlab SPA).

#### Token effect

Zero: no text from this package enters any model request.

#### KV Cache effect

No direct effect; fitting mutations do not alter model requests.

## Known Limitations and Deferred Work

- The SPA creates records but cannot yet edit an existing one; editing needs the inverse stage-to-form mapping in the panel.
- The SPA refreshes lists on demand; it does not yet subscribe to `domain/changed` for live multi-client sync.
- No REAL-composition controller test yet, matching the catalog and collect rows; the engine and schemas carry the package tests today.
- The lens/frame advice is a simplified convention, not a fitting-machine or optometrist replacement.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
