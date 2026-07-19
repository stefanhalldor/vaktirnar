# 2026-07-19 10:15 - TODO 086 v189 - Claude: v189 done, prerelease

Created: 2026-07-19 10:15
Timezone: Atlantic/Reykjavik

## Context

Response to v189 Codex review:
`ai-handoff/2026-07-19-1004-todo-086-v189-codex-v188-prerelease-review.md`

## What was fixed

### Finding 1 (HIGH): variant union in WeatherOverviewClient

`components/weather/WeatherOverviewClient.tsx:148-155`

Before:
```ts
const v = data.variants[0]
setRouteMemory({
  vedurstofanIds: new Set(v.vedurstofanStationIds),
  vegagerdinIds: new Set(v.vegagerdinStationIds),
})
```

After:
```ts
const variants = data.variants
setRouteMemory({
  vedurstofanIds: new Set(variants.flatMap(v => v.vedurstofanStationIds)),
  vegagerdinIds: new Set(variants.flatMap(v => v.vegagerdinStationIds)),
})
```

Both providers are unioned independently across all returned variants for the
exact normalized pair. No kilometer guessing, no Google call.

### Finding 2 (MEDIUM-LOW): raise lookup cap

`lib/iceland-routes/routeMemory.server.ts`: `.limit(5)` -> `.limit(20)`

Also updated JSDoc comment from "Callers should use variants[0] as the most
recent variant" to "Callers should union station IDs across all returned
variants".

### Finding 3 (LOW): stale comment

`app/api/teskeid/weather/travel/routes/route.ts:159-161`

Updated from:
```
// Fire-and-forget — does not block the response to the client.
```
To:
```
// Awaited best-effort — uses only already-returned route geometry, no additional Google calls.
// The helper swallows all errors internally so this does not affect the response.
```

## Tests added

New describe block in `lib/__tests__/weather-route-memory-migration.test.ts`:
`route-memory variant union — overview station aggregation`

5 focused tests:
- unions vedurstofan IDs across two disjoint variants
- unions vegagerdin IDs across two disjoint variants
- providers remain independent (no cross-contamination)
- deduplicates IDs that appear in multiple variants
- single variant behaves identically to before

## Test results

- `npm run type-check`: clean.
- `lib/__tests__/weather-route-memory-migration.test.ts`: 5/5 new + 18 existing = 23 passed.
- `lib/__tests__/weather-travel-api.test.ts`: 24/24 passed.
- `lib/__tests__/route-observation.test.ts`: 22/22 passed.
- Total: 3 files, 69 tests passed.

## Commit

`eaa23ac` — fix: union all route-memory variants in /vedrid overview, raise lookup cap to 20 (#86)

## Release stance

All three v189 findings addressed. Type-check clean, tests clean.

The Reykjavik -> Egilsstadir multi-route scenario should now correctly show
stations from all known route variants in /vedrid, not just the most recent one.

Ready for Stebbi's localhost check per the v189 review checklist.
