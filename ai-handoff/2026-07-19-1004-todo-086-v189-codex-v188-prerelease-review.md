# 2026-07-19 10:04 - TODO 086 v189 - Codex review of Claude v188

Created: 2026-07-19 10:04
Timezone: Atlantic/Reykjavik

## Context

Review of:

- `ai-handoff/2026-07-19-0957-todo-086-v188-claude-v188-done-prerelease.md`

Stebbi also flagged a product issue from screenshots: `/vedrid` route filter for
`Reykjavík -> Egilsstaðir` appears to show only one route-option station set,
while `/ferdalagid` has multiple Google route options and the upper/northern
route stations are missing from `/vedrid`.

## Findings

### 1. Release blocker: `/vedrid` still filters by only the first route-memory variant

Severity: high.

Evidence:

- `components/weather/WeatherOverviewClient.tsx:147-154`
  reads `data.variants` from `/api/teskeid/weather/route-memory/lookup`, but then
  does:

```ts
const v = data.variants[0]
vedurstofanIds: new Set(v.vedurstofanStationIds)
vegagerdinIds: new Set(v.vegagerdinStationIds)
```

The backend already returns multiple variants for the exact normalized
`from/to` pair:

- `lib/iceland-routes/routeMemory.server.ts:176-180` says lookup returns all
  stored variants ordered by `last_seen_at`.
- `lib/iceland-routes/routeMemory.server.ts:227-234` maps all route rows to
  `variants`.

This matches Stebbi's screenshot: if `/ferdalagid` has both `Til að sleppa við
Öxi` and `Um Hellisheiði` or another alternative route for the same pair,
`/vedrid` currently shows only whichever variant is first/newest. That means the
overview can hide valid stations from the same exact `Frá`/`Til` pair.

Recommended fix before release:

- In `/vedrid`, union station IDs across every returned variant for the exact
  pair.
- Do this for both providers:
  - `vedurstofanStationIds`
  - `vegagerdinStationIds`
- Keep the route picker semantics exact: no kilometer guessing and no Google
  call from `/vedrid`.

Sketch:

```ts
const variants = data.variants ?? []
const vedurstofanIds = new Set(variants.flatMap(v => v.vedurstofanStationIds))
const vegagerdinIds = new Set(variants.flatMap(v => v.vegagerdinStationIds))
```

Optional later, not for this release: add variant pills so the user can narrow
down to a specific known alternative. The default overview should be the union
of all known route variants for the exact pair.

### 2. Backend cap may eventually hide older known variants

Severity: medium-low for this release, but easy to address with the fix above.

Evidence:

- `lib/iceland-routes/routeMemory.server.ts:191-197` limits route-memory lookup
  to 5 route rows.

For the current Reykjavík -> Egilsstaðir case, this probably does not explain
the missing upper route if there are only two variants. The frontend `variants[0]`
bug is the primary cause. But if route-options warming creates several variants
over time, `limit(5)` could still make `/vedrid` silently omit older known
station sets.

Recommendation:

- Raise the cap to a documented safe number such as 20, or make the endpoint
  explicitly return "all variants for this pair up to a product cap".
- Keep ordering by `last_seen_at desc`.
- Do not store or fetch Google geometry.

### 3. Stale comment says route-memory warming is fire-and-forget after v188 made it awaited

Severity: low.

Evidence:

- `app/api/teskeid/weather/travel/routes/route.ts:159-167` now correctly uses
  `await warmRouteMemoryFromOptions(...)`.
- But `app/api/teskeid/weather/travel/routes/route.ts:159-161` still says:
  `Fire-and-forget — does not block the response to the client.`

This is only a comment bug, but it is exactly the kind of comment that can make
the next handoff regress the fix.

Recommendation:

- Update the comment to say the warming is awaited best-effort, uses only
  already-returned route options, and does not make additional Google calls.

## What Looks Good

- v188 fixed the main serverless reliability issue from the prior Codex review:
  `await warmRouteMemoryFromOptions(...)` is now present.
- The helper still swallows failures, so the route-options response should not
  fail just because route-memory warming fails.
- The added `console.error('[route-memory] options warm failed')` is acceptable
  as long as it does not include route names, addresses, user IDs, or raw Google
  data.
- No new SQL or migration appears necessary for the route-variant union fix.

## Answer To Stebbi's Specific Question

Yes. `/vedrid` should fetch/use route-memory with a better aggregation model now.

It should not rely on one single route variant. For a selected exact normalized
pair such as `reykjavik -> egilsstadir`, `/vedrid` should show all station IDs
that have appeared on any `/ferdalagid` route option for that exact pair.

That means:

- exact pair match from `weather_route_memory_routes`
- all stored variants for that pair
- union of station IDs from `weather_route_memory_stations`
- no kilometer approximation
- no Google call from `/vedrid`
- no raw Google geometry stored or reused

This is still privacy-safe under the current `sql/86_weather_route_memory.sql`
contract because we are only using normalized public place keys/labels and
provider station IDs.

## Suggested Next Handoff For Claude Code

Claude Code should do a very small pre-release fix:

1. Change `/vedrid` route-memory handling in
   `components/weather/WeatherOverviewClient.tsx` to union all returned variants.
2. Keep single-place focus behavior unchanged:
   - one selected place filters to the nearest/known station for that place
   - two selected places filters to union of known station sets across all route
     variants for the exact pair
3. Raise or document the route-memory lookup cap in
   `lib/iceland-routes/routeMemory.server.ts`.
4. Update the stale `Fire-and-forget` comment in
   `app/api/teskeid/weather/travel/routes/route.ts`.
5. Add a focused test for two variants with disjoint station IDs:
   - API/backend returns both variants
   - overview union includes stations from both variants
   - providers remain independent
6. Run:
   - `npm run type-check`
   - focused route-memory/travel tests

No migration. No deploy. No Google billing change.

## Commands Run By Codex

- `git status --short`
  - exit 0
  - showed unrelated `.obsidian/workspace.json` modified and Codex handoff files
    untracked
- `rg -n "variants\\[0\\]|routeMemory|vedurstofanStationIds|vegagerdinStationIds|lookupRouteMemory|warmRouteMemoryFromOptions" components app lib`
  - exit 0
- `rg -n "void warmRouteMemoryFromOptions|await warmRouteMemoryFromOptions|options warm failed" app/api lib`
  - exit 0
- `rg -n "lookupRouteMemoryBidirectional|limit\\(|variants" lib/iceland-routes app/api/teskeid/weather/route-memory`
  - exit 0
- `npm run type-check`
  - exit 0
- `npm run test:run -- lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-memory.test.ts lib/__tests__/route-observation.test.ts`
  - exit 0
  - Vitest reported 2 test files and 44 tests passed

## Design Check

This review does not ask for a visual redesign. The recommended fix preserves
the current `/vedrid` UI and only corrects which stations feed the existing map
and pills.

Relevant `Design.md` constraints still apply if Claude Code touches visible UI:

- no mobile overflow or zoom regressions
- no layout shift in the route picker or scrubber
- all changed user text must stay in `messages/is.json` and `messages/en.json`
- route picker pills/buttons should retain stable touch targets

## Route Intelligence Check

- Route touched: Reykjavík -> Egilsstaðir and equivalent bidirectional route
  family, including multiple alternatives such as routes avoiding or using
  certain east/north approaches.
- New route knowledge: no new canonical segment is required for this fix.
  The issue is aggregation of already-recorded provider station IDs.
- Provider neutrality: the fix should union both `vedurstofan` and `vegagerdin`
  station IDs independently and should not special-case either provider.
- Cache key: use existing normalized route-memory place keys and variant rows.
- Privacy: no raw Google route geometry, steps, duration, place IDs, user IDs,
  or raw addresses should be added.
- `IcelandRoadmap.md` does not need an update for this tiny fix, because the
  route-memory section already describes station sets from `/ferdalagid`.

## Localhost Checks For Stebbi

After Claude Code applies the small fix:

1. Open `/ferdalagid`.
2. Choose `Reykjavík -> Egilsstaðir`.
3. Let the route options load, including at least two alternatives.
4. Open `/vedrid`.
5. In `Skoða veðrið á ákveðinni leið`, choose `Reykjavík` and `Egilsstaðir`.
6. Expected:
   - the `/vedrid` map includes stations from all known route options for that
     exact pair, not just one route
   - the upper/northern route station set from the screenshot is visible if it
     was warmed from `/ferdalagid`
   - Vegagerðin and Veðurstofan filters/counts both reflect the selected pair
   - selecting only `Reykjavík` or only `Egilsstaðir` still filters to the
     place-focused station behavior, not a full route
   - selecting route pills does not open station cards
7. Regression check:
   - `/vedrid` should not call Google just to filter a route-memory pair
   - no new migration should be required
   - no route-memory UI should show raw addresses

## Release Stance

Do not release v188 as-is if route-memory filtering on `/vedrid` is part of the
release promise. The required fix is small: union variants on the client (and
preferably raise/document the backend cap).

After that targeted fix, this looks releaseable from Codex's perspective, with
normal Stebbi localhost checks.

## Uncertainty / Needs Confirmation

- I did not inspect live Supabase rows, so I am inferring from code and
  screenshots that both Reykjavík -> Egilsstaðir variants have already been
  written to route memory. If only one variant was written, Claude Code should
  inspect `weather_route_memory_routes`/`weather_route_memory_stations` with a
  read-only query before changing behavior further.
