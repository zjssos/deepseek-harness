---
description: "rxlab optometry module: the stateless rxlabRecommend Remote (candidate frame/lens validation and ranking) over a deterministic rules engine and the editable rxlab-recommend-rules settings namespace, with model-facing tools and a self-mounting Client contribution."
kind: "package-reference"
---
# rxlab Recommend

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-rxlab-recommend` owns the rxlab workbench's deterministic candidate validation and matching. On the Host it provides the `ctx.recommendController` service and the generated `ctx.remote.rxlabRecommend` namespace with `validateFrame`, `validateLens`, and `suggest`; it has no storage domain and never persists. It consumes the `Prescription` and `FittingRecommendation` types from `@deepseek-ai/dsh-rxlab-fitting/types` as the target and checks candidate frames and lenses against them — it does not re-derive a prescription. The package registers the `rxlab-recommend-rules` settings namespace, so the refractive-index ladder, FPD size band, per-eye decentration cap, and cylinder-step threshold are editable in the settings surface without a code change. On the Client it ships a `dsh.client` row whose `/client` bundle mounts the namespace itself, so the rxlab SPA boots recommend exactly where rxlab-product data is composed; it deliberately never joins the platform `api-remotes` assembly.

## Table of Contents

- [The recommend model](#the-recommend-model)
- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="the-recommend-model"></a>
## The recommend model

`FrameCandidate` is a mount style (`full`/`half`/`rimless`) with lens width A and bridge DBL (FPD = A + DBL) plus optional frame width, temple length, weight, and shape. `LensCandidate` is a nominal refractive index, a lens form (`single`/`reading`/`progressive`/`bifocal`/`office`; `single` maps to the fitting engine's `single-vision`), and feature tokens (for example `uv`, `blue-light`). Every validation returns a `CompatibilityReport`: `overall` (`OK`/`WARN`/`FAIL`), the per-check list, and a one-line `summary`.

Frame validation runs three checks. The PD-derived band is `[pd + minExtraMm, pd + maxExtraMm]` from the `sizeBand` rule, with `targetExtraMm` as the ranking target. Per-eye decentration is `|FPD / 2 − PD_eye|` against `decentrationCapMm`; a missing PD fails the check rather than skipping it. A non-`full` mount fails at power ≥ 6 D, cylinder ≥ 2 D, or when the fitting advice sets `rimlessOk` false. Band overflow warns; decentration and mount violations fail.

Lens validation runs three checks. The required index is the stricter of the advice's `recommendedIndex` and the `indexLadder` rung the worst meridional power lands on, stepped up one rung when the cylinder reaches `cylinderStepD`; a lower candidate index fails. The lens form must appear in the advice's `lensTypes` (otherwise a warning), and the usage-recommended feature tokens (`uv` for outdoor, `blue-light` for computer) must be present (otherwise a warning).

`suggest` validates every supplied candidate, scores each from its report plus band proximity, index margin, feature coverage, and any `shapePref`/`rimTypePref` style match, and returns the frames and lenses in descending score order (stable on ties) with the reasons behind the ordering.

## Use this package

The rxlab profile composes one host row, `rxlab-recommend` (`@deepseek-ai/dsh-rxlab-recommend`), and the `guide` preset composes the tools row (`@deepseek-ai/dsh-rxlab-recommend/tools`). The Host Loader activates `RecommendController`, which registers `rxlab-recommend-rules` against the settings provider (restart-applied) and registers the `rxlabRecommend` namespace on the Typert Gateway. The SPA's headless client boot activates the package's own `/client` bundle (the modules node half serves it under `/plugins`), and its `apply` mounts the generated Remote contribution, so `remote.rxlabRecommend.validateFrame/validateLens/suggest` resolve in the browser.

The tools row registers `recommend_validate_frame`, `recommend_validate_lens`, and `recommend_suggest` for a workbench agent session. Wire types live in `./types` (browser-safe JSON, no runtime code); the pure engine lives in `src/engine.ts`; the settings schema and its cross-field validation live in `src/rules.ts`.

## Model Experience

### Recommend tools (per-session)

#### What the model sees

Sessions composed on the shipped `guide` preset carry the `recommend_validate_frame`, `recommend_validate_lens`, and `recommend_suggest` tool schemas; mounting only the base `rxlab-recommend` row registers nothing model-visible, and the engine itself runs with no model key. Each validate tool returns a `CompatibilityReport` as text; `recommend_suggest` returns the ranked lists plus the reasons.

#### Token effect

The three tool schemas enter every model request of a session composed on the `guide` preset; engine and settings changes add nothing to model requests.

#### KV Cache effect

Stable within a session: the tool schemas mount once at session composition, so their prefix contribution caches like the rest of the tool block; rule edits and candidate data changes never invalidate it.

## Known Limitations and Deferred Work

- The rules are simplified industry convention for a decision aid, not a medical-device specification; a high-power recommendation is an advisory, not a substitute for optometrist review.
- `suggest` ranks only the candidates the caller supplies; it does not query a catalog, price, or availability source, and `colorPref` is recorded but not scored because candidates carry no color.
- The engine and controller carry the package tests; there is no REAL-composition boot through a shipped `cordis.yml` yet, matching the fitting and collect rows.
- The Client bundle is only covered by the assembly-level client checks, not a package spec (the fitting and collect rows share this state).
- No invariant companion is published: a validation is a pure function of the candidate, prescription, advice, and current rules, so no independent observation can diverge.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
