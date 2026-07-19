# 2026-07-18 23:14 - TODO 086 v524 - Claude: v523 hardening done, prerelease

Created: 2026-07-18 23:14
Timezone: Atlantic/Reykjavik

## What was done

All six findings from v523 Codex review addressed.

### Finding 1 (High / release blocker): TDZ crash on routeFilterIds

**Root cause**: `routeFilterIds` was declared at line 339 but directly read (not via closure) at lines 186 and 321 inside `vedurstofanLayer` and `vegagerdinLayer`. In a React function component, `const` declarations in the TDZ throw `ReferenceError` at runtime when the enclosing conditional evaluates to truthy.

**Fix**:
- Restructured `WeatherOverviewClient.tsx` so all route filter sets are declared before any map layer construction.
- Moved `vegagerdinUnavailableReason`, `vegagerdinNewestMeasuredAtIso`, `vegagerdinWorstStatus`, and auto-fallback `useEffect` to before the filter sets (they depend only on `vegagerdinData` which is already declared).
- Moved `vedurstofanLayer` + `vedurstofanProvider` config to after the filter sets.
- `vegagerdinLayer` and `overviewStatusCounts` follow immediately after.

New order within the component:
1. State declarations (both providers)
2. Fetch effects
3. Thresholds + forecast memos
4. Title/subtitle
5. Conditions feed
6. Vegagerðin memos + auto-fallback
7. **Route filter sets** (`vedurstofanRouteFilterIds`, `vegagerdinRouteFilterIds`)
8. **Veðurstofan layer + provider config**
9. **Vegagerðin layer**
10. `overviewStatusCounts`
11. `vegagerdinProvider` config
12. Return

### Finding 2 (Medium): provider-safe route filter sets

**Fix**: Replaced single shared `routeFilterIds: Set<string> | null` with two separate memos:
- `vedurstofanRouteFilterIds` — computed from Veðurstofan stations only
- `vegagerdinRouteFilterIds` — computed from Vegagerðin stations only

Each layer checks only its own filter set, so a Veðurstofan station "123" and a Vegagerðin station "123" at different coordinates are filtered independently.

Added regression test: same station ID in both providers, only one coordinate is on the route — confirms both filters return the correct independent result.

### Finding 3 (Medium): detail card hid marker but stayed visible

**Fix**: Both `vedurstofanProvider.renderPostMap` and `vegagerdinProvider.renderPostMap` now gate detail card visibility on the route filter BEFORE checking status filters:

```ts
// Veðurstofan
const isOnRoute = vedurstofanRouteFilterIds === null || vedurstofanRouteFilterIds.has(selectedStation.stationId)
showStationDetail = isOnRoute && (visibleStatuses.size === 0 || visibleStatuses.has(selectedStatus))

// Vegagerðin
const isOnRoute = vegagerdinRouteFilterIds === null || vegagerdinRouteFilterIds.has(selectedStation.stationId)
if (!isOnRoute) return null
```

### Finding 4 (Medium): alias matching too permissive

**Fix in `lensResolver.ts`**: Removed `alias.startsWith(normalized)` from `matchesAny`. The previous rule allowed any prefix of an alias to match (e.g. "v" → "vik", "vest" → "vestfirdir"). Now only two conditions:
1. `normalized === alias` — exact match
2. `alias.startsWith(normalized + ' ')` — input is a recognized prefix of a multi-word alias (e.g. "vik i" matches "vik i myrdal")

**Fix in `routeFamilies.ts`**:
- Removed `'land'` and `'sudurland'` from south-coast to-aliases (too broad)
- Removed duplicate `'isafjordur'` entry in westfjords to-aliases

Added negative tests: `'v'`, `'vi'`, `'land'`, `'Landmannalaugar'`, `'Akranes'` all return `cache_miss`.

### Finding 5 (Low): "cache-only" wording

Updated `lensResolver.ts` header comment to say "Curated corridor route lens resolver" and clarify it is a local registry lookup, not a cache of previously computed Google routes.

### Finding 6 (Low): label style

Removed `uppercase tracking-wide font-medium text-[10px]` from both labels in `OverviewRouteLensPanel`. Now use `text-xs text-muted-foreground` which matches normal Teskeið label style.

## Route intelligence check

- Route/domain area: curated corridor families, provider-neutral filter sets
- No Google Routes API calls
- No SQL, migration, Supabase, or personal data
- Privacy unchanged

## Files changed

- `components/weather/WeatherOverviewClient.tsx` — restructured: filter sets before layers, two separate filter memos, detail card visibility fixed
- `components/weather/OverviewRouteLensPanel.tsx` — label style fix
- `lib/iceland-routes/lensResolver.ts` — tightened matchesAny, updated comment
- `lib/iceland-routes/routeFamilies.ts` — removed 'land', 'sudurland', duplicate 'isafjordur'
- `lib/__tests__/iceland-routes-lens.test.ts` — 5 new negative alias tests, 1 provider collision test

## Commands and exit codes

```
npm run type-check    exit 0

npx vitest run lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/iceland-routes-segments.test.ts lib/__tests__/vegagerdinFallback.test.ts lib/__tests__/windObservationStatus.test.ts
  80 passed (4 test files)
```

## SQL status

No SQL run.

## Localhost checks for Stebbi

1. Open `/vedrid` as public user at 360, 390, 460 px widths. Confirm no crash and no horizontal overflow.
2. Confirm page loads with all Iceland stations visible (no route filter active).
3. Try `Frá: Reykjavík`, `Til: Akureyri`:
   - Map filters to north corridor stations only
   - Status pill counts match filtered points
   - Open a station on the north route, apply a different route that excludes it: detail card should close
4. Try `Frá: Reykjavík`, `Til: Vík` → south coast corridor
5. Try `Frá: Reykjavík`, `Til: Höfn` → east iceland corridor
6. Try `Frá: Reykjavík`, `Til: Ísafjörður` → westfjords corridor
7. Try `Frá: Reykjavík`, `Til: Landmannalaugar` → cache_miss, no false south match
8. Try `Frá: Reykjavík`, `Til: land` → cache_miss (removed alias)
9. Clear (×) button resets to all Iceland
10. Toggle source time selector with route filter active → filter stays
11. Click Ferðalagið CTA → navigates with from/to prefilled

No Supabase migration, Vercel change, commit, push, or deploy is part of this pass.
