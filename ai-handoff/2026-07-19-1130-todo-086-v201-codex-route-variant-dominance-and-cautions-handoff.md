# 2026-07-19 11:30 - TODO 086 v201 - Codex handoff: route variant dominance + caution pills

Created: 2026-07-19 11:30
Timezone: Atlantic/Reykjavik

## Context

Stebbi wants the next route-memory polish after v199:

1. Fix the confusing `/vedrid` route-pill state where a generic `Leið 1` appears next to `Um Hellisheiði`, even though `Leið 1` is visibly a poorer/sparser version of the same route family.
2. Wire `Varasöm leið` end-to-end into the `/vedrid` route variant pills.

This handoff is for Claude Code. Codex did not change product code, SQL, migrations, commits, pushes, deploys, or production data.

## Goal

Make `/vedrid` route variant pills cleaner and more meaningful:

- Prefer curated route labels over generic `Leið {n}` when they represent the same route family.
- Hide generic variants when they are clearly dominated by a richer curated variant.
- Show `Varasöm leið` on `/vedrid` variant pills when the underlying `/ferdalagid` route option has caution IDs.

## Non-Goals

- Do not store raw Google route geometry, route steps, raw route text, Google place IDs, user IDs, or raw addresses.
- Do not hard-delete old route-memory rows in this pass.
- Do not create a broad cleanup job yet.
- Do not replace Google Routes or redesign the picker.
- Do not run SQL migrations without explicit Stebbi approval.

## Current State

From v199 review:

- `sql/87_weather_route_memory_route_cautions.sql` exists and adds `weather_route_memory_routes.route_caution_ids text[] not null default '{}'`.
- Current production code is still safe before SQL87 because it omits `route_caution_ids` from route-memory writes and lookups.
- `recordRouteMemory()` accepts `routeCautionIds?: string[]`, but does not persist it yet.
- `/api/teskeid/weather/travel/routes/route.ts` already passes `routeCautionIds: routeOption.cautions?.map(c => c.id) ?? []` into `recordRouteMemory()`.
- `lookupRouteMemory()` currently returns `routeCautionIds: []` for every variant.
- `WeatherOverviewClient` already appends the `Varasöm leið` label when `variant.routeCautionIds.length > 0`.
- `dedupeRouteVariants()` currently groups curated variants by `CURATED_*` label, but keeps non-curated variants by raw `routeVariantKey`.
- Existing tests explicitly preserve a curated + non-curated pair as two variants. That test should change.

## Required Release Sequencing

This is the important schema gate:

1. SQL87 must be run before deploying code that selects or writes `route_caution_ids`.
2. Running SQL87 while old/current code is live should be safe because it is additive and old code ignores the column.
3. Do not deploy code that includes `.select('..., route_caution_ids')` or upsert payload `{ route_caution_ids: ... }` until SQL87 has been run in the target database.
4. If Claude Code wants deploy-before-SQL safety, it must implement a compatibility path that does not fail when the column is missing. The simpler recommended path is: Stebbi runs SQL87 first, then deploy the code.

`sql/87` itself must still be reviewed before Stebbi runs it. It must not weaken RLS, grants, auth, policies, or expose route-memory to anon/authenticated roles.

## Implementation Plan

### 1. Wire route caution IDs end-to-end

Update `lib/iceland-routes/routeMemory.server.ts`:

- Include `route_caution_ids: input.routeCautionIds ?? []` in the route upsert payload.
- Update `lookupRouteMemory()` select to include `route_caution_ids`.
- Map it defensively:
  - if `Array.isArray(r.route_caution_ids)`, use string items only
  - otherwise return `[]`
- Keep logs safe: never log raw route labels, addresses, payloads, user IDs, or station lists.

Update tests:

- Add a test that route-memory lookup maps `route_caution_ids` through to API-shaped variants.
- If direct Supabase mocking is heavy, add/adjust unit tests around mapper/helper extraction rather than making brittle endpoint tests.
- Confirm `/vedrid` pill label uses existing `routeVariantCautionLabel` copy.

### 2. Add route-variant dominance cleanup

Update `dedupeRouteVariants()` or add a small helper it calls.

Recommended conservative rule:

- First group exact duplicate curated variants by `CURATED_*` label as today.
- Keep genuinely distinct curated variants separate, e.g. `CURATED_AVOID_OXI` and `CURATED_VIA_HELLISHEIDI`.
- Then compare non-curated variants against curated variants for the same from/to lookup result.
- Drop a non-curated variant if it is clearly dominated by a curated variant.

Use provider-qualified station IDs so Veðurstofan and Vegagerðin IDs never collide:

```ts
vedurstofan:123
vegagerdin:456
```

Dominance rule for first pass:

- Exact subset: drop generic when every generic station ID appears in a curated variant and the curated variant has at least as many total station IDs.
- Near-subset: optionally drop generic when overlap is high enough and curated has clearly more detail.

Be careful with near-subset. Suggested threshold if implemented:

- generic total stations >= 6
- overlap ratio >= 0.85
- curated total stations >= generic total stations + 2

If in doubt, start with exact subset only. That avoids hiding a truly different route by accident. If Stebbi's Reykjavík/Egilsstaðir case is not caught by exact subset, add the near-subset threshold with tests.

### 3. Prefer curated labels in UI

After dominance cleanup, `/vedrid` should show:

- `Allar leiðir`
- `Um Hellisheiði`
- `Til að sleppa við Öxi`
- other genuinely distinct variants

It should not show a sparse `Leið 1` beside `Um Hellisheiði` when `Leið 1` is only a poorer generic version of the same route.

Keep generic `Leið {n}` only when there is no curated route that dominates it.

### 4. Update tests

Update `lib/__tests__/weather-route-memory-migration.test.ts`:

- Replace the current expectation that curated + non-curated always remain separate.
- Add exact-subset test:
  - curated `CURATED_VIA_HELLISHEIDI` has stations `A, B, C, D`
  - generic `google-route-1` has `A, B, C`
  - expected: only curated remains
- Add non-subset test:
  - curated has `A, B, C`
  - generic has `A, B, X`
  - expected: both remain if exact-subset-only, or both remain if overlap threshold is not met
- Add distinct curated test:
  - `CURATED_VIA_HELLISHEIDI` and `CURATED_AVOID_OXI` both remain
- Add caution propagation test:
  - variant with `routeCautionIds: ['oxi']` remains with that array after dedupe

Also run existing targeted tests:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts`

If route-memory APIs have direct tests, include those too.

## UX Requirements

- Clicking route variant pills must not open station detail cards.
- `Allar leiðir` remains default and shows the union of visible variants after cleanup.
- A selected route pill narrows the map to that route variant only.
- `Varasöm leið` appears only when `routeCautionIds.length > 0`.
- If SQL87/code wiring is not active yet, do not show fake `Varasöm leið`.
- Keep pill style compact and mobile-first, consistent with current `/vedrid` route-memory picker.
- All new or changed user-facing text must live in `messages/is.json` and `messages/en.json`.

## Route Intelligence Check

Route family affected:

- Reykjavík/Egilsstaðir
- especially variants around `Um Hellisheiði`, `Til að sleppa við Öxi`, and generic Google route alternatives like `Leið 1`

This belongs in `lib/iceland-routes/`, not in one-off `/vedrid` UI logic.

Provider-neutrality:

- The cleanup should use provider station sets and curated route labels, not Google route geometry.
- It should work for Veðurstofan and Vegagerðin together.
- Station IDs must be provider-qualified before comparison.

Privacy:

- Continue storing only normalized place labels/keys, route variant keys/labels, caution IDs, and provider station IDs.
- No raw Google geometry, raw addresses, place IDs, user IDs, or personal route history.

IcelandRoadmap:

- If Claude Code discovers a route-family rule that is more specific than generic station-set dominance, document it in `IcelandRoadmap.md` or explicitly say why it is deferred.

## Supabase / SQL Notes

SQL87:

- File: `sql/87_weather_route_memory_route_cautions.sql`
- Adds `route_caution_ids text[] not null default '{}'`
- Additive schema-only change
- Prerequisite: SQL86
- Still requires explicit Stebbi approval before running

Do not change RLS/grants/policies for this work unless there is a specific reason and Codex/Stebbi review it first.

## Localhost Checks for Stebbi

After Claude Code implements and SQL87 is available in the local/test database:

1. Open `/vedrid`.
2. Select `Reykjavík` and `Egilsstaðir` or the reverse direction.
3. Confirm route pills appear.
4. Expected: a sparse generic `Leið 1` does not appear beside `Um Hellisheiði` if it is only a poorer subset of that route.
5. Select `Allar leiðir`. Expected: map shows union of the remaining meaningful route variants.
6. Select `Um Hellisheiði`. Expected: map narrows to that route's stations.
7. Select `Til að sleppa við Öxi`. Expected: map narrows to that route's stations and pill shows `Varasöm leið` if the route has caution IDs.
8. Click route pills repeatedly. Expected: no station pulse/detail card opens from pill clicks.
9. Create or recalculate a route in `/vedrid/ferdalagid` that includes a cautious route option.
10. Return to `/vedrid`, focus/reload, and confirm the caution label appears from route-memory.
11. Test on mobile width around 390 px. Expected: pills wrap cleanly, no horizontal overflow, no text overlap.

Do not run production SQL, trigger production cron, deploy, push, or touch production data casually. Those require separate explicit approval.

## Questions for Codex Review After Claude Code

1. Is SQL87 still additive and safe?
2. Does the code now hard-require SQL87, and has the deployment order been stated clearly?
3. Is generic route hiding conservative enough to avoid losing truly distinct route options?
4. Are caution labels driven by real `route_caution_ids`, not inferred from UI labels?
5. Do tests cover both exact-subset and genuinely distinct route variants?

