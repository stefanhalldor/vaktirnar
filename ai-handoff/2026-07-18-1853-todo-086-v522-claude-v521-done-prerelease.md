# 2026-07-18 18:53 - TODO 086 v522 - Claude: v521 done, prerelease

Created: 2026-07-18 18:53
Timezone: Atlantic/Reykjavik

## What was done

Implemented the lightweight cache-only route lens for `/vedrid` as specified in v521.

### New files

**`lib/iceland-routes/lensTypes.ts`**
- `OverviewRouteLensQuery` — from/to strings from user
- `OverviewRouteLensRouteFamily` — corridor waypoints + radius for haversine filter
- `OverviewRouteLensResult` — discriminated union: `idle | resolved | cache_miss`

**`lib/iceland-routes/routeFamilies.ts`**
- `ROUTE_FAMILIES` — 4 curated route families with pre-normalized aliases:
  - `capital-south-coast` (Reykjavík to Vík, Selfoss, Kirkjubæjarklaustur)
  - `capital-east-iceland` (to Höfn, Egilsstaðir, Djúpivogur)
  - `capital-north-iceland` (to Akureyri, Mývatn, Húsavík)
  - `capital-westfjords` (to Hólmavík, Ísafjörður)
- Capital-region aliases shared: reykjavik, keflavik, kopavogur, gardabaer, etc.
- Corridor waypoints every 60-80 km; 60 km radius (70 km for westfjords)
- `getRouteFamily(id)` lookup helper

**`lib/iceland-routes/lensResolver.ts`**
- `normalizePlaceName(s)` — lowercase, ð→d, þ→th, æ→ae, NFD+strip combining marks, trim
- `resolveOverviewRouteLensCacheOnly(query)` — pure, never calls Google:
  - Returns `idle` when either input is empty
  - Tries both directions (from→origin/to→dest and reverse)
  - Returns first matching family as `resolved`
  - Returns `cache_miss` if no match

**`lib/iceland-routes/lensFilter.ts`**
- `filterStationIdsForRouteLens(stations, lensResult)` — haversine-based corridor filter:
  - Returns `null` when not resolved (show all stations)
  - Returns `Set<string>` of on-route station IDs

**`components/weather/OverviewRouteLensPanel.tsx`**
- `Frá` and `Til` text inputs with `text-base` (16px) to prevent iOS zoom
- Resolves on blur and Enter
- When `resolved`: "Bráðabirgðaniðurstöður" badge + route family label + Ferðalagið CTA
- When `cache_miss`: calm message + Ferðalagið CTA
- Clear button (×) appears when a query is active
- Ferðalagið CTA prefills `?from=...&to=...` URL params when query exists

**`lib/__tests__/iceland-routes-lens.test.ts`**
- 26 tests: normalizePlaceName (5), resolveOverviewRouteLensCacheOnly (13), filterStationIdsForRouteLens (8)
- All pass

### Modified files

**`lib/iceland-routes/index.ts`**
- Version bumped to `0.3.0`
- Exports all new types and functions from lensTypes, lensResolver, lensFilter, routeFamilies

**`components/weather/WeatherOverviewShell.tsx`**
- Added `renderRouteLens?: () => React.ReactNode` prop to `WeatherOverviewShellProps`
- Renders between source selector and degraded state / feed content

**`components/weather/WeatherOverviewClient.tsx`**
- Added `routeLensResult` state (`OverviewRouteLensResult`, default `idle`)
- Added `routeFilterIds` memo (after both providers' data is declared):
  - Combines Veðurstofan + Vegagerðin stations into one flat list for the filter
  - Returns `Set<string> | null` from `filterStationIdsForRouteLens`
- Applied `routeFilterIds` to `vedurstofanLayer` marker visibility
- Applied `routeFilterIds` to `vegagerdinLayer` marker visibility
- Applied `routeFilterIds` to `overviewStatusCounts` (status pills reflect filtered stations)
- Added `renderRouteLens` with `OverviewRouteLensPanel` to shell render call
- Ferðalagið CTA prefills `from/to` from active query

**`messages/is.json` + `messages/en.json`**
- Added under `teskeid.vedrid.overview`:
  - `routeLensAriaLabel`, `routeLensFrom`, `routeLensFromPlaceholder`
  - `routeLensTo`, `routeLensToPlaceholder`
  - `routeLensProvisional` ("Bráðabirgðaniðurstöður")
  - `routeLensCacheMiss`, `routeLensOpenTrip`, `routeLensClear`

**`IcelandRoadmap.md`**
- R5 section updated with "Byrjað" block describing v521 implementation
- Kóðalendingarstaður section updated to list current files

## Route intelligence check

- Route families added for the 4 main travel corridors from capital
- Provider-neutral: same `routeFilterIds` applies to both Veðurstofan and Vegagerðin
- No Google Routes API called — pure local lookup
- No SQL, no migration, no raw address storage
- Privacy: only place-name text is typed by the user; not stored

## Commands and exit codes

```
npm run type-check    exit 0

npx vitest run lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/iceland-routes-segments.test.ts lib/__tests__/vegagerdinFallback.test.ts lib/__tests__/windObservationStatus.test.ts
  75 passed (4 test files)
```

## SQL status

No SQL run.

## Localhost checks for Stebbi

1. Open `/vedrid` at 360, 390, 460 px widths. Confirm no horizontal overflow.
2. Confirm Frá/Til inputs appear below the Núna/forecast selector.
3. With inputs empty: confirm all Iceland stations show normally.
4. Enter `Reykjavík` → `Akureyri` (or `Akureyri` → `Reykjavík`):
   - Expect "Bráðabirgðaniðurstöður" badge + "Reykjavík — Norðurland / Akureyri" label
   - Expect map filters to stations along the north corridor
   - Expect both Vegagerðin and Veðurstofan stations to obey the same filter
   - Expect WindStatusFilterPills counts to reflect filtered stations only
5. Try `Reykjavík` → `Vík`: south coast family
6. Try `Reykjavík` → `Höfn`: east iceland family
7. Try `Reykjavík` → `Ísafjörður` or `Hólmavík`: westfjords family
8. Try an unknown route (e.g. `Akureyri` → `Selfoss`):
   - Expect cache_miss message
   - Expect map remains usable (all stations)
   - Expect Ferðalagið CTA with from/to prefilled
9. Press clear (×) button: confirm filter resets and all stations return
10. Toggle Núna / forecast slots with route filter active: confirm filter stays
11. Confirm inputs are min 16px (no iOS Safari zoom on focus)
12. Confirm Ferðalagið CTA at bottom of page is unchanged

No Supabase migration, Vercel change, commit, push, or deploy is part of this pass.
