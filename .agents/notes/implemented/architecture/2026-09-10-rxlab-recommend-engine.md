# Agent Note: rxlab recommend is a stateless candidate validator over the fitting advice

Status: implemented

English | [中文](2026-09-10-rxlab-recommend-engine.zh.md)

## Problem

The rxlab workbench could derive a prescription and fitting advice from a staged exam record, but it had no way to answer the operator's next questions: does this particular frame or lens actually fit that prescription, and which of several candidates is best? The workbench promised deterministic L2 guidance — validating a plan someone else gave, not just producing one — so the check had to be reproducible rule work, not an LLM step. A second deterministic engine could also drift from the fitting engine if both derived the target independently.

## Decision

A new `packages/api/rxlab-recommend` row owns the stateless `rxlabRecommend` Remote (`validateFrame`/`validateLens`/`suggest`) over a pure rules engine. It has no storage domain and never persists. It consumes `Prescription` and `FittingRecommendation` from `@deepseek-ai/dsh-rxlab-fitting/types` as the authoritative target and only validates candidates against it; it never re-derives a prescription.

Every threshold — the refractive-index ladder, the FPD size band, the per-eye decentration cap, and the cylinder-step threshold — is a field of the `rxlab-recommend-rules` settings namespace (registered restart-applied), not a private constant, so the settings surface can retune the engine. The engine validates frames on PD-derived FPD band, per-eye decentration `|FPD / 2 − PD_eye|`, and non-`full` mount risk; validates lenses on an index floor (the stricter of the advice and the ladder position the worst power lands on), the advice's lens forms, and usage feature coverage; and `suggest` scores and ranks candidate sets. A `./tools` function plugin registers `recommend_validate_frame`, `recommend_validate_lens`, and `recommend_suggest`, and `src/client/index.ts` self-mounts the namespace so it is never in the platform `api-remotes` assembly.

## Alternatives considered

**Why not re-derive the prescription and advice inside recommend?** The fitting engine already owns prescription derivation and is the single source of those decisions. Two derivations would be two places to change and could disagree; consuming the frozen `Prescription`/`FittingRecommendation` types keeps recommend a pure validator and the target singular. When the advice and the ladder disagree on index, recommend takes the stricter value rather than trusting either alone.

**Why a settings namespace instead of plugin Config constants?** The thresholds are deployment-varying choices an optometrist must tune without a code change; the repo rule is that such choices are validated settings fields, and the workbench architecture already routes rules through a settings namespace. A `DEFAULT_*` constant would not be configurability.

**Why synchronous Remote methods when the other rows are async?** The engine is pure and has no owned asynchronous operation, so an `async` method with no `await` would be ceremony; the Typert gateway still delivers a promise to the Client face.

**Why no storage domain?** There is no record to keep: a validation result is a function of the inputs and the current rules, and the caller (stage panel or guide assembler) owns any persistence.

## Consequences

The stage panels and the guide assembler can validate and rank candidates with zero token cost by calling `rxlabRecommend`, and the agent can do the same through the three tools. The rule vocabulary is durable configuration: its fields are edited in the settings surface and its namespace rejects an unusable ladder or threshold at the write. The engine, controller, and tools are pinned by package tests; there is no recorded-session snapshot and no REAL-composition `cordis.yml` boot yet, matching the fitting and collect rows. The validation is simplified industry convention for a decision aid, explicitly not a medical-device specification.
