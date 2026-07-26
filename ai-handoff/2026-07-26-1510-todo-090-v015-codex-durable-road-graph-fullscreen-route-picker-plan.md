# Plan — durable Teskeið road graph and full-screen route picker

Created: 2026-07-26 15:10
Timezone: Atlantic/Reykjavik
TODO: #90 — Veður: eigið Íslandsleiðarkerfi og vegkaflagrunnur
Agent: Codex
Status: Plan only; no implementation, SQL, migration, production, deploy, commit, or push authorized

## Findings first

### P0 — The request path currently performs work that its own source says must not run there

`lib/iceland-routes/vegagerdinRoadGraphSource.server.ts` documents that the all-Iceland discovery/import boundary “must not be called in a user request path until cache/refresh policy is approved.”

The current chain does call it from a user request:

`POST /api/teskeid/weather/travel/route-candidate`
→ `getTeskeidRouteCandidatesOutcome()`
→ `getIcelandRoadGraph()`
→ `fetchVegagerdinRoadGraphSegments()`
→ paginated ArcGIS downloads for both road and surface layers
→ normalization and graph construction.

This is the root architecture issue. Raising the timeout would hide the symptom without fixing it.

### P0 — The eight-second timeout is terminal but the underlying work is not durable

Production uses an eight-second `Promise.race`. When it wins, the API returns `timeout` and the client renders “Tók of langan tíma. Prófaðu aftur.”

The underlying graph promise is not cancelled. It may finish and populate the module-level cache if the Vercel process stays alive, but process memory is ephemeral and the process may freeze or terminate. There is no durable continuation, shared graph snapshot, or reliable result for the next request.

Therefore the current status is neither a real failure nor a dependable pending job. The UI exposes an infrastructure race as a dead route option.

### P1 — The cache is only an optimization, not a product reliability layer

`roadGraphRuntime.server.ts` stores the graph in module memory for six hours. That helps warm requests in one process but is not shared across cold starts, instances, regions, or deployments.

### P1 — Candidate lifecycle is not future-proof

The client has one Teskeið-specific enum:

`idle | loading | ready | timeout | no_route | unavailable`.

This does not scale cleanly to multiple Teskeið alternatives, another provider, partial results, graph refresh, retry-after, or a result arriving later. `timeout` is modeled as terminal even though it should be nonterminal.

### P1 — The mini comparison map cannot become the requested full-screen picker by CSS alone

`RouteComparisonMiniMap` already has the correct provider-neutral route list and stable per-route colors, but it intentionally renders `DriveRouteMap` with `interactive={false}` and exposes no selection callback.

The existing full-screen route map hides the information panel and renders the currently previewed route in one `travel-bridge-route` source. It does not render all comparison routes with tappable selection.

## Product outcome

1. Google routes appear as soon as they are ready.
2. Teskeið route generation is independent and never blocks Google.
3. A Teskeið route that is not ready remains a live pending item and is inserted automatically when ready.
4. A user never sees “tók of langan tíma” as a terminal route card.
5. Expanding the comparison map opens a full-screen route picker showing every ready route at once.
6. Tapping a line or route card changes only the previewed geometry and selection, immediately and without weather recomputation.
7. `Skoða veðurskilyrði fyrir þessa leið` remains the explicit action that applies the selected route and recalculates route weather.
8. The compact and full-screen maps use the same route IDs, colors, labels, metrics, and selection state.
9. Closing full-screen returns to the same comparison selection and panel scroll context.

## Recommended architecture

### Phase A — Measure the real cost safely

Before choosing serialization details, add privacy-safe server timings for:

- graph snapshot/cache lookup;
- snapshot download/parse;
- graph materialization;
- origin/destination snapping;
- primary route calculation;
- alternative calculation;
- segment/node counts and graph version.

Do not log place names, coordinates, email, user ID, raw routes, or exact requested journeys.

Acceptance: one cold and one warm localhost/integration run identify whether download, parsing, graph construction, or routing dominates.

### Phase B — Move graph acquisition out of user requests

Create a dedicated road-graph snapshot pipeline:

1. A controlled refresh task fetches the Vegagerðin road and surface pages.
2. It validates payloads, normalizes segments, builds or serializes a graph-ready artifact, and records source timestamps, schema version, checksum, segment count, and node count.
3. The artifact is written under an immutable versioned key.
4. Only after validation succeeds is a small `latest` manifest promoted atomically.
5. Refresh failure leaves the previous last-known-good snapshot active.
6. User route requests never call the live all-Iceland ArcGIS import.

Recommended durable home: a private, versioned Supabase Storage artifact read by the existing server-only service-role boundary, with a small manifest/pointer. This matches the existing stack and keeps large graph data out of a relational row. A bundled repository snapshot is a valid bootstrap fallback if Vegagerðin storage/licensing and artifact size are approved.

Module memory remains L1 acceleration only:

- L1: parsed graph in the current process.
- Durable source of truth: versioned snapshot.
- Last-known-good fallback: previous validated snapshot and optionally a bundled baseline.
- Never require a warm process for correctness.

Do not implement persistence until Vegagerðin reuse/storage terms and attribution requirements are explicitly confirmed.

### Phase C — Make route computation fast and provider-neutral

The user request path should:

1. Read the active snapshot manifest.
2. Reuse the matching in-process graph or materialize that version from the durable artifact.
3. Compute the primary Teskeið route first.
4. Return the primary route immediately.
5. Compute alternatives only on explicit request or under a separate bounded budget.

Target budgets should be based on measured data, but the product contract should aim for sub-second warm primary routing and a small bounded cold snapshot load. A deadline must protect infrastructure, not become the normal user state.

A route-result cache may be added later using:

- graph version;
- routing profile;
- snapped origin node;
- snapped destination node;
- alternatives flag.

Do not key durable cache entries by raw home/work coordinates or store personal journey history. Snapped-node keys are provider-neutral, aggregateable, and less privacy-sensitive, but still require retention review.

### Phase D — Replace terminal timeout with resumable source state

Introduce a provider-neutral source model, for example:

- `sourceId`
- `status: idle | pending | ready | no_route | temporarily_unavailable`
- `routes`
- `requestId?`
- `retryAfterMs?`
- `graphVersion?`
- `attempt?`

Remove `timeout` from the visible terminal vocabulary.

With the durable snapshot in place, pending should be rare. If a transient cold-load or refresh race still occurs:

- return `pending`, not `timeout`;
- keep Google routes usable;
- retry automatically with bounded backoff such as 1.5 s, 3 s, and 6 s;
- abort retries when endpoints or the active calculation change;
- insert the result into the existing list without moving the selected route;
- after bounded retries, show a temporary availability message and an explicit retry action, while retaining Google routes.

Do not depend on an unawaited Vercel promise as the pending job. If future route calculations genuinely exceed function limits, add a durable job/queue as a separate approved phase. Do not persist raw endpoint coordinates merely to implement polling without a privacy design.

### Phase E — Generalize the comparison map

Extract or evolve a reusable `RouteComparisonMap` based on the current `RouteComparisonMiniMap` and `DriveRouteMap`:

Shared props:

- routes with stable IDs, provider, label, geometry, color, availability, and selected state;
- `selectedRouteId`;
- `onPreviewRoute(routeId)`;
- mode `compact | fullscreen`;
- optional `onClose` and `onApplySelected`.

Compact mode:

- existing 120 px overview;
- all ready route lines;
- new `Stækka kort` control in the top-right, away from MapLibre attribution;
- at least 40 × 40 px touch target;
- pending source appears in cards/status, not as a fake geometry.

Full-screen mode:

- reuse the canonical full-screen MapLibre surface rather than opening a detached page;
- show all ready routes simultaneously in the same stable colors;
- selected route is wider and fully opaque; others are visually secondary;
- route line and horizontally scrollable route card are both selectable;
- selected card scrolls into view;
- a compact header gives back/close and route context;
- a bottom action applies the selection: `Skoða veðurskilyrði fyrir þessa leið`;
- selecting does not call the travel/weather API;
- applying calls the existing `handleSelectSurfaceRouteChoice`;
- closing preserves `previewRouteChoiceId`, applied route, and information-panel state;
- no unavailable route is drawn as if it had geometry.

Extend `DriveRouteMap` with optional route-selection events or use the main map's comparison layers. Do not maintain separate color/order logic in mini map, full-screen map, cards, and legend.

### Phase F — Compact warning and protect map controls

Replace the current two-paragraph warning with one compact safety statement:

> Google Maps getur stundum lagt til varasamar leiðir. Notið leiðirnar með varúð meðan Teskeið þróar eigið leiðakerfi.

Move the existing journey-map `Stækka kort` control from bottom-right to top-right so MapLibre attribution cannot cover it. Give both expand controls a minimum 40 px touch height.

All user-facing copy remains in `messages/is.json` and `messages/en.json`.

## Suggested implementation sequence

1. Add timing instrumentation and deterministic cold/warm tests.
2. Decide and approve snapshot persistence/licensing.
3. Implement snapshot schema, validator, serializer, and last-known-good loader.
4. Add an explicit refresh command/admin/cron boundary outside user requests.
5. Change runtime so candidate requests cannot call live full-network import.
6. Replace Teskeið-specific terminal timeout state with provider-neutral pending state and bounded retry.
7. Generalize the comparison map data/component contract.
8. Add compact and full-screen comparison modes.
9. Wire preview-only selection and explicit apply/recalculation.
10. Shorten the warning and reposition both expand buttons.
11. Run targeted, full, build, localhost/mobile, and cold-start verification.

Do not combine persistence, SQL/RLS, and UI work in one unreviewed edit. Stop for a handoff after the durable graph boundary is implemented and verified, before full-screen UI work continues.

## Tests required

### Graph/runtime

- A candidate request never invokes the live all-Iceland WFS importer.
- Cold runtime loads a validated durable snapshot.
- Warm runtime reuses the same graph version.
- Concurrent cold requests share one materialization promise.
- Refresh failure retains the last-known-good snapshot.
- Invalid checksum/schema/count cannot become `latest`.
- A bundled fallback works when durable storage is temporarily unavailable.
- Primary routing returns before alternatives.
- Route IDs remain stable for the same graph version/profile/snapped nodes.
- No logs contain coordinates, place names, email, user ID, or raw route geometry.

### API/state

- Google results remain usable while Teskeið status is pending.
- Pending retries are aborted on endpoint change.
- Late ready result inserts without changing the user's current selection.
- `no_route` is terminal and distinct from temporary unavailability.
- Per-user and global feature flags remain strict and default-deny.
- Public users never gain Teskeið routing access accidentally.
- Rate limits remain enforced.

### Map/UI

- Compact and full-screen maps render identical route IDs, ordering, colors, and selected route.
- Every ready route has a distinct stable color.
- Pending/unavailable routes have no fake line.
- Tapping a line or card updates preview without a travel/weather fetch.
- Apply triggers exactly one recalculation for the selected route.
- Back/close restores the prior selection and panel state.
- `Stækka kort` is visible above attribution in both contexts.
- 360, 390, and 460 px have no horizontal page overflow, clipped CTA, keyboard zoom, or controls below browser chrome.
- Touch controls are at least 40 px.
- Existing scrubber becomes available after applying a different route.
- Google-only, Teskeið-primary, multiple Teskeið alternatives, pending, no-route, and temporary failure states all have fixtures.

## Route intelligence check

1. Scope: all Iceland route families, with Ísafjörður ↔ Reykjavík as the observed failure.
2. Domain ownership: graph snapshot, lifecycle, version, cache keys, and provider-neutral route selection belong in `lib/iceland-routes/` and `IcelandRoadmap.md`, not only in `RoadMapPrototypeMap.tsx`.
3. Provider neutrality: Google remains an independent comparison/fallback provider; the durable artifact contains Vegagerðin/Teskeið-derived graph data, not persisted raw Google routes.
4. New core concepts: graph snapshot schema/version, last-known-good pointer, source lifecycle state, snapped-node cache key, and regression fixtures.
5. Privacy: do not persist raw user endpoints or route history. Prefer snapped nodes and short retention if result caching is later approved.
6. Google terms: do not store raw Google geometry as Teskeið's durable graph or route cache.
7. Roadmap update: not made in this planning turn because Stebbi has not authorized implementation edits beyond handoff documentation. The durable snapshot decision and implementation status should be added during the approved implementation phase.

## Supabase, SQL, RLS, and production implications

No SQL, migration, Supabase write, Storage change, bucket creation, policy change, env change, or production action was performed.

If Supabase Storage is selected:

- use a private bucket;
- read/write only through server-only service role;
- expose no raw artifact directly to clients;
- grant no new anon/authenticated table access;
- validate object size, checksum, schema version, and counts before promotion;
- define retention for old versions;
- use atomic manifest promotion and last-known-good recovery;
- document whether bucket/policy setup needs an idempotent migration;
- Stebbi must separately authorize writing or running any migration and any production Storage/configuration change.

## Localhost checks for Stebbi

These checks apply after implementation, not to the current unchanged code.

Setup:

- authenticated test user with both `road-intelligence-v1` and `teskeid-routing-v1`;
- global Teskeið route candidate flag enabled locally;
- a validated local/bundled graph snapshot;
- use test routes only; do not alter production storage, flags, or real user data.

Steps:

1. Open `/auth-mvp/vedrid` and calculate Reykjavík → Ísafjörður.
   - Google routes appear first.
   - Teskeið card shows a live loading/pending state, never “tók of langan tíma.”
   - Teskeið route inserts automatically when ready without changing the selected Google route.
2. Click the comparison map's `Stækka kort`.
   - Full-screen map opens with all ready routes and identical colors to cards/legend.
   - Attribution does not cover the expand/back/apply controls.
3. Tap each line and each card.
   - Selection changes immediately.
   - Only geometry/highlight/card selection changes.
   - No weather/travel recalculation loader appears.
4. Select a Teskeið route and press `Skoða veðurskilyrði fyrir þessa leið`.
   - Exactly one calculation runs.
   - Applied-route copy names the correct provider/route.
   - Forecast scrubber and provider stations are populated as on initial calculation.
5. Return to comparison information and reopen full-screen.
   - Preview/applied selection and scroll context are preserved.
6. Test a route with multiple Teskeið alternatives.
   - Every available route has a distinct stable color.
   - Pending/no-route placeholders never draw a fake line.
7. Force the local snapshot loader into cold, warm, refresh-failed, and last-known-good fixtures through tests or safe local configuration.
   - User requests never fetch the live all-Iceland WFS import.
   - Previous validated snapshot remains usable on refresh failure.
8. Test 360, 390, and 460 px widths on iOS/Safari-style viewport.
   - Compact warning is substantially shorter.
   - Both `Stækka kort` controls are visible and at least 40 px.
   - Full-screen cards/CTA respect browser chrome and safe areas.
   - No horizontal page overflow or clipped controls.
9. Regression:
   - user without per-user Teskeið flag sees no Teskeið candidate calls or controls;
   - signed-out public user gains no route-candidate access;
   - Google-only route calculation remains unchanged;
   - map scrubber, station cards, route edit, and back navigation remain functional.

Do not test production bucket deletion, manifest corruption, env removal, or feature access changes casually. Those require explicit approval and a recovery plan.

## Decisions required before implementation

1. Approve durable artifact location: recommended private Supabase Storage versus bundled repository snapshot.
2. Confirm Vegagerðin storage/reuse terms and attribution for a persisted normalized graph.
3. Decide whether the first implementation includes a bundled last-known-good fallback.
4. Decide whether graph refresh is manual/admin first or scheduled cron immediately.
5. Confirm that full-screen selection remains preview-only until the explicit weather CTA.
6. Confirm the compact Icelandic warning copy above.

## Recommended next step

Claude Code should review this architecture adversarially, especially artifact serialization, Vercel cold-start behavior, Supabase Storage/RLS boundaries, licensing, and whether a simpler durable cache can meet the same reliability guarantees. After Stebbi chooses the storage/refresh option and gives explicit implementation permission, implement only the durable graph boundary first and hand off before UI work.

## Óvissa / þarf að staðfesta

- Timings have not yet been measured, so the relative cost of WFS pagination, JSON parsing, normalization, graph construction, and route search is unknown.
- Vegagerðin persistence/reuse terms have not been confirmed in this turn.
- The exact size and best serialization format of the graph-ready artifact need measurement.
- A durable async job may be unnecessary once the graph snapshot is removed from user requests; do not build a queue before measurements show it is needed.

