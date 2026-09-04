# Agent Note: rxlab session agent workbench over the embedded headless client runtime

Status: implemented

English | [中文](2026-09-05-rxlab-agent-session-workbench.zh.md)

## Problem

rxlab (the `dsh rxlab` eyeglass-fitting profile) needed a working session-Agent module in its standalone SPA (`apps/rxlab-web`). The SPA does not run the Cordis browser UI roster, so the official Web conversation components (`ui-renderer` slots, `ui-conversation`) are unavailable; the module must render a conversation from the object layer's plain observable sources without reimplementing the slot machinery, and it must keep working when the host has no API key (a send must fail visibly, never crash the panel).

## Decision

The session-Agent module binds the object layer directly with `useSyncExternalStore` and renders a row projection of the session event window. `packages/client/*` owns the pattern "engine products are bare observables; hook synthesis is the renderer's one bridge" — rxlab-web is its own renderer, so `apps/rxlab-web/src/modules/agent/use-sessions.ts` (and `use-session-view.ts`) synthesize three standing hooks over the embedded runtime:

- `useSessionList` / `useConnected` subscribe to `sessions.list` and `connection.generation`.
- `useSessionView(runtime, list)` resolves the staged session binding synchronously (`sessions.binding(current)`; the object layer caches one scope per staged session and treats resolution as render-safe) and subscribes to the session snapshot and the binding's event window.

Every uSES call site is unconditional: when its source is absent the hook passes a stable no-op subscribe plus a constant snapshot, so hook order never changes across the boot/selection transition. A conditional uSES (return before the call while the source is still absent) throws `Invalid hook call` once the source appears and the hook count grows — the failure that blocked this module at first render.

`transcript.ts` folds the event window into rows: `user/message` and `assistant/message` text (+ reasoning, collapsed), and tool cards assembled from paired `tool/call` → `tool/result` events keyed by call id. Live `assistant/live-chunk` transients, turn/step boundaries, attempts, and headers stay out of the rows; lifecycle state (running, queue count, open state, last agent error, prompt errors) renders from the session snapshot instead, and `tool/result` cards carry the result text or `{name, code}` error. A tool call whose result never arrives stays an open "running" card while the snapshot reports running.

The composer sends through the session face's `beginSubmission` + `prompt` queue path, shows a stop button from `snapshot.running` via `face.cancel()`, and lists queued items from `snapshot.queue`. Model selection loads the Host-generation catalog once per connection (`remote.session.modelCatalog`) and submits through `remote.session.selectModel`; the current value is the catalog default until a successful selection replaces it. Sending without an API key fails through the normal remote error path and renders as the agent-error banner and/or prompt-error line — the panel stays usable.

The module registry entry upgrades to `status: 'active'` with scope text describing the shipped workbench.

## Alternatives considered

**Reuse the official Web conversation machinery.** The production conversation fold (`ui-conversation` ConversationNodes) and uSES bridge (`ui-renderer` `bindSnapshotSelector`) are built for the slot roster and its four-props-share components. Pulling them into rxlab-web would drag the roster loading contract and its locale/slot graph into a non-roster app; the row projection is a tenth of the code and loses nothing the workbench needs yet.

**Subscribe via `use-sync-external-store/with-selector` with per-slice equality.** The official bridge uses selector hooks; the session snapshot and window are small and change as whole facts, so whole-snapshot binding with stable empty-source fallbacks is simpler and satisfies the uSES contract.

**Fold a full conversation tree (turn/step grouping, assistant-owned tool calls).** The event surface already pairs every `tool/call` with its `tool/result`; folding only those pairs into sequential cards, and leaving the durable `assistant/message` tool-call blocks unrendered, avoids double-rendering the same call while keeping the ordering the wire produced.

**Render transient live chunks as streaming text.** The assistant stream would appear incrementally. Sending is a queue admission and the durable settlement lands as one `assistant/message`; the "running" badge plus a settled reply is the minimal viable presentation until streaming matters.

**Read the session's durable model-selection projection for the trigger label.** The projection (`next`/`lastUsed`) is available, but rendering it needs the projection-store seat; showing the catalog default and then the last locally successful selection keeps the composer self-contained.

## Consequences

The rxlab SPA now runs real host sessions from the browser: list/create/open/rename, queued sends, stop, model catalog selection, and a transcript with tool cards, with no keyless-send crash. The module remains independent of the client roster, so it cannot regress on `packages/client` slot contract changes that do not touch the object layer. Streaming (live chunks), attachment upload, queue edit/steer, and durable model-projection display remain future work; the conversation is rendered from durable events alone, and client-only pending echoes are not yet displayed beyond the queue count.

## Testing

Browser smoke on `dsh rxlab` verifies the connected badge, persistent list, create/open/rename, catalog-backed model selector, and a keyless send that fails into the error banner without crashing. `apps/rxlab-web` typecheck and Vite build are green; the host build (`pnpm run build:lib:host`) is unchanged by this work beyond the earlier modules-row patch already verified in the rxlab profile work.
