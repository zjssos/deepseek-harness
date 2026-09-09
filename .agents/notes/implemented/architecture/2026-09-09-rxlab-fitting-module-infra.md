# Agent Note: rxlab fitting is a staged exam-record domain with a deterministic derive engine

Status: implemented

English | [中文](2026-09-09-rxlab-fitting-module-infra.zh.md)

## Problem

The rxlab workbench rail listed 验光配镜 (optometry/fitting) as a planned placeholder: no data model for the refraction process, no prescription calculation, and no adapter advice. The downstream recommend and render modules all consume a prescription, so the fitting module is the next data seam on the workbench's spine.

## Decision

A new `packages/api/rxlab-fitting` row owns the `rxlab_fitting` storage domain (version 1, per-record) of staged exam records and the `rxlabFitting` Remote (`list/get/upsert/delete/derive`), mirroring the catalog row's shape: self-mounting `/client` contribution, never in the platform `api-remotes` assembly.

The exam record captures the refraction process as nine stages keyed by a closed `id` discriminant (问诊/基线/客观/调节放松/主觉/双眼/试戴/下加光/瞳距). `derive` runs a pure engine (`src/prescription.ts`, no zod, no storage): validate → prescription → lens/frame advice. FAIL findings suppress the prescription; WARN findings travel with it. The SPA panel replaces the placeholder with record list/detail, a create dialog over the core stages, and a derive report that matches Wiki frames by the derived FPD band.

## Alternatives considered

**Why a deterministic engine, not an LLM step?** Refraction derivation is rule work: prescribed principles (宁正勿负, cylinder at or below the refined value, ADD at or below the measured value, spherical-equivalent compensation) are checkable facts. An LLM step would add nondeterminism to a decision surface that must reproduce identically across runs; semantics belong to later agent surfaces, not to the calculation core.

**Why a separate domain instead of extending `rxlab_catalog`?** Exam records are process facts with a different lifecycle and shape (staged entries, no frame/lens/product union) from catalog master data; one domain per concern keeps the durable schemas readable and versionable. The panel crosses packages client-side (catalog `list/get` for frame matches) instead of coupling the Host services.

**Why does FAIL suppress the prescription instead of degrading it?** A record missing a required stage or recording an illegal rollback cannot derive a safe sphere; a degraded output would invite the operator to fit from partial facts. Suppressing keeps the wire honest: null prescription plus the FAIL list.

**Why create-only in the panel?** Editing needs the inverse stage-to-form mapping; shipping create + derive first exercises the full contract end to end and leaves the edit surface as an isolated follow-up.

## Consequences

The recommend module can now consume `derive`'s prescription and advice directly. The `rxlab_fitting` domain schema is version 1; stage shapes may only extend by version bump. The panel does not subscribe to `domain/changed`, so two browser tabs can show stale lists until a mutation refreshes. The advice is simplified industry convention — a decision aid, explicitly not a medical device.
