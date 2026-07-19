# 2026-07-19 09:46 - TODO 086 v187 - Codex: v186 hotfix route draft and option-memory plan

Created: 2026-07-19 09:46
Timezone: Atlantic/Reykjavik

## Context

Stebbi asked Claude Code to release after
`2026-07-19-0924-todo-086-v186-claude-self-registering-places.md`.

One release-adjacent bug remains:

- When a user chooses a known route in `/vedrid` and opens `Ferðalagið`, the first
  `/ferdalagid` step clearly has a selected route in state/map/route options, but
  the `Frá` field is rendered as an empty search box.
- When the user manually enters `Frá`, the `Til` field appears to fall out, while
  the map/route options still know the old destination and can calculate the route.

Stebbi also raised a product/architecture question:

- If `/ferdalagid` already has route options on the first step, can we save the
  provider station sets for all shown route options immediately, instead of waiting
  until the final trip-weather result is calculated?

## Findings

### 1. Release-blocking UX bug: route draft hydrates origin/destination after `RouteSelectionStep` has already chosen an active empty input

Severity: High for release polish.

Likely source:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx` reads `readOverviewRouteDraft()` on
  mount and then calls `setOrigin(...)` and `setDestination(...)`.
- `components/weather/RouteSelectionStep.tsx` initializes `activeField` only once:
  if `origin` is missing on the first render, it starts as `'origin'`.
- When the parent later hydrates both `origin` and `destination`, `activeField`
  remains `'origin'`.
- The render condition is `origin && activeField !== 'origin'`; therefore the
  origin exists in state but the UI still renders `PlaceSearch` for `Frá`.
- `handleOriginSelected()` then always does `setActiveField('destination')`, even
  when `destination` is already present from the draft. That explains why `Til`
  appears to drop back into edit/search mode.

This looks like local component state falling out of sync with hydrated props,
not a Google Routes issue.

### 2. Route-memory is written too late for the `/vedrid` quick screen

Severity: Medium, not required for the immediate hotfix, but important before we
depend on `/vedrid` route-memory as the main fast overview.

Current shape:

- `/api/teskeid/weather/travel/routes` returns route options for the first
  `/ferdalagid` step.
- `/api/teskeid/weather/travel` writes `weather_route_memory_*` later, during the
  final travel-weather calculation.

Stebbi's point is correct: the first route-options step already has the useful
route alternatives. If that endpoint can match provider stations server-side
while it has the route geometry in memory, it should write route-memory for each
shown option immediately.

This should not add Google cost if it only reuses the existing route-options
response from Google.

### 3. Do not store raw Google route content while warming route-memory

Severity: High for terms/privacy discipline.

If route-options warming is implemented, it must continue the SQL86 privacy
contract:

- no raw Google geometry
- no raw route steps
- no raw Google duration/distance cache
- no raw home/street addresses
- no user IDs
- only normalized public place labels/keys, route variant keys/labels, and
  provider station IDs plus derived station-order metadata

## Recommended Hotfix Scope

Keep the release hotfix small:

1. Fix the `/vedrid -> /ferdalagid` draft hydration bug.
2. Do not change SQL.
3. Do not change Google provider behavior.
4. Do not introduce route-options memory warming in the same patch unless the
   hotfix is already done and tests are clean.

## Implementation Plan For Claude Code

### A. Fix `RouteSelectionStep` active-field hydration

File:

- `components/weather/RouteSelectionStep.tsx`

Add a small sync effect after `activeField` state is declared:

- If both `origin` and `destination` are present and `activeField` is not `null`,
  set `activeField(null)`.
- This should represent the hydrated/complete state: both fields are filled, so
  neither field should be open as an empty search box.

Important edge cases:

- If user clicks X on `Frá`, parent sets `origin(null)` and local handler sets
  `activeField('origin')`; the sync effect must not close it because `origin` is
  missing.
- If user clicks X on `Til`, parent sets `destination(null)` and local handler
  sets `activeField('destination')`; the sync effect must not close it because
  `destination` is missing.

### B. Fix `handleOriginSelected`

In the same file, change `handleOriginSelected(p)`:

- Current behavior appears to always call `setActiveField('destination')`.
- New behavior:
  - call `onOriginSelected(...)` as before
  - if `destination` is already present, call `setActiveField(null)`
  - otherwise call `setActiveField('destination')`

Leave `handleDestinationSelected` as-is unless testing reveals a related issue.

### C. Add or update tests where feasible

Preferred regression:

- Render `RouteSelectionStep` first with `origin={null}` and `destination={null}`.
- Re-render with both `origin` and `destination` provided.
- Assert that the selected place cards are visible and the empty `Frá` search
  input is not active.

If a component test is too expensive in this codebase, add a concise handoff note
explaining why it was skipped and rely on localhost checks below.

## Immediate Next Step After Hotfix: Warm route-memory from route options

Do this as a separate implementation step unless the hotfix is trivial and the
test suite stays clean.

Target:

- `app/api/teskeid/weather/travel/routes/route.ts`

Goal:

- After `provider.getRouteOptions(...)` returns sorted route options, match
  Veðurstofan and Vegagerðin stations for every shown route option and call
  `recordRouteMemory()` for each option.
- Use the existing `routeOption.providerMatchingPoints ?? routeOption.points`.
- Use existing `normalizePlaceForMemory()`, `buildRouteMemoryKey()`,
  `matchProviderPointsToRoute()`, and `recordRouteMemory()` patterns from
  `app/api/teskeid/weather/travel/route.ts`.
- Use `route.id` as `routeVariantKey`.
- Use a stable human label as `routeVariantLabel` if available, for example
  curated labels or `route.description`, but do not store raw Google route text
  unless that has already been terms-reviewed. If unsure, leave
  `routeVariantLabel` null.

Provider handling:

- Veðurstofan station registry can be matched directly as in the final endpoint.
- Vegagerðin should only be evaluated when current/cache data is available.
- If Vegagerðin is available and zero stations match, include it in
  `providersEvaluated` so stale rows are cleared.
- If Vegagerðin cache/data is unavailable, omit it from `providersEvaluated` so
  existing rows are preserved.

Cost contract:

- Do not make an additional Google Routes or Google Places call.
- Do not add a `/vedrid` Google dependency.
- This is derived station-memory warming only.

Why this matters:

- If Stebbi computes Reykjavík -> Siglufjörður in `/ferdalagid` and sees route
  options, that route should become available in `/vedrid` route-memory without
  requiring a final result calculation.
- If Reykjavík -> Egilsstaðir shows two route alternatives, both alternatives
  can be written as route-memory variants for the quick screen.

## Why A New Reykjavík -> Siglufjörður Route May Not Appear Immediately Today

Likely explanations to check before assuming a UI bug:

1. SQL86 has not been run in the Supabase project used by localhost.
2. Route-memory is currently written only from the final travel endpoint, not
   from route-options.
3. The `/vedrid` picker refetches on mount/focus/visibility. If the write happens
   in another tab or late request, focus/reload may be needed.
4. `recordRouteMemory()` is best-effort and swallows errors with static logging;
   a DB permission/table issue can fail silently in UI.

## SQL / Migration Notes

- This hotfix should not require a new SQL migration.
- SQL86 is still the required table foundation for route-memory.
- Do not run SQL from Claude Code/Codex. Stebbi runs migrations explicitly.
- If route-options memory warming uses the existing SQL86 tables, no additional
  migration should be needed.

## Route Intelligence Check

1. Route scope: all route-memory backed `/vedrid` quick routes and the
   `/ferdalagid` route-selection step.
2. New route knowledge: no new canonical IcelandRoadmap knowledge is required for
   the active-field hotfix.
3. Provider neutrality: hotfix is UI state only; route-options warming should use
   provider-neutral `lib/iceland-routes` helpers and station IDs.
4. Cache/test fixtures: add a regression test for route draft hydration if
   feasible. Route-options warming should add tests for one route with two
   variants and provider station rows per variant.
5. Privacy: do not store raw addresses, user IDs, raw Google geometry, steps,
   duration, distance, or place IDs in route-memory.
6. Google: no new Google call should be introduced. Reuse already returned route
   options only.
7. IcelandRoadmap update: not required for the hotfix. If route-options warming
   is implemented, mention in handoff that it advances the existing R4/R5
   route-memory plan already documented in `IcelandRoadmap.md`.

## Design Check

- This is primarily state/interaction correctness, not visual redesign.
- The expected UI follows `Design.md`: mobile-first app behavior, no dead-looking
  controls, no confusing split state, and no unnecessary extra UI.

## Localhost Checks For Stebbi

### Hotfix checks

1. Open `/vedrid`.
2. Choose a known route-memory route with canonical places, for example
   `Siglufjörður` -> `Reykjavík` if both are available.
3. Click `Ferðalagið`.
4. Expected:
   - `/ferdalagid` opens on the route step.
   - `Frá` is visible as a filled place card, not an empty input.
   - `Til` is visible as a filled place card.
   - The map and route options match the two filled fields.
5. Click X on `Frá`.
6. Expected:
   - Only `Frá` becomes editable.
   - `Til` stays selected.
7. Select a new `Frá`.
8. Expected:
   - If `Til` is still present, neither input remains open unnecessarily.
   - Route options refresh for the new pair.
9. Click X on `Til`.
10. Expected:
    - Only `Til` becomes editable.
    - `Frá` stays selected.

### Route-options memory warming checks, if implemented

1. Open `/ferdalagid`.
2. Select `Reykjavík` -> `Egilsstaðir`.
3. Wait until route options appear on the first step.
4. Do not continue to the final result yet.
5. Return to `/vedrid` and focus/reload if needed.
6. Expected:
   - `Reykjavík` and `Egilsstaðir` appear as route-memory places.
   - Selecting the pair filters `/vedrid` to the stored stations.
   - If multiple route options were shown, variants should be stored separately
     under route-memory.

### Cost / network checks

1. On `/vedrid`, selecting route-memory pills must not call Google APIs.
2. On `/ferdalagid`, route-options warming must not add a second Google Routes
   call beyond the existing route-options request.
3. Watch Google billing after release; route-memory should reduce repeat need,
   not increase it.

## Commands Reviewed By Codex

Read-only inspection only. No code or SQL was changed by Codex for this review.

- Read `ai-handoff/2026-07-19-0924-todo-086-v186-claude-self-registering-places.md`
- Inspected `components/weather/RouteSelectionStep.tsx`
- Inspected `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- Inspected `components/weather/WeatherOverviewClient.tsx`
- Inspected `components/weather/RouteMemoryPicker.tsx`
- Inspected `lib/iceland-routes/routeDraft.ts`
- Inspected `lib/iceland-routes/routeMemory.server.ts`
- Inspected `app/api/teskeid/weather/travel/routes/route.ts`
- Inspected `app/api/teskeid/weather/travel/route.ts`
- Consulted `WORKFLOW.md`, `Design.md`, `IcelandRoadmap.md`, and
  `ai-handoff/README.md`

## Final Recommendation

Ship the route draft UI hotfix first. It is small, low-risk, and directly fixes
the broken first-step experience.

Then, as the next immediate backend step, warm route-memory from route options
using only already-fetched route option geometry and derived provider station
IDs. That makes `/vedrid` route-memory useful faster without extra Google cost.
