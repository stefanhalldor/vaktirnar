# TODO 086 / v210 - Codex handoff - Multiple route variants show blank map

## Status

Post-release hotfix candidate. Do not deploy until this is fixed and checked on localhost.

Stebbi reports that `/vedrid` works when route memory returns exactly one route, but when there are multiple route variants the map can become completely blank. Screenshot case:

- From: `Dalvik`
- To: `Gardabaer`
- Variant pills visible: `Allar leidir`, `Hringurinn`, `Leid 2`
- `Allar leidir` selected
- Map shows the basemap but no station markers

## Main finding

This is very likely not a SQL82/preferences issue. It matches a route-filter/provider-mode mismatch in `components/weather/WeatherOverviewClient.tsx`.

Relevant code:

- `routeMemory` stores provider-specific station sets:
  - `vedurstofanStationIds`
  - `vegagerdinStationIds`
- `Allar leidir` unions those sets separately:
  - `routeMemory.vedurstofanIds`
  - `routeMemory.vegagerdinIds`
- Active source controls which provider layer is visible:
  - `activeMode === 'now'` shows Vegagerdin
  - `typeof activeMode === 'number'` shows Vedurstofan forecast
- Current fallback only switches away from Vegagerdin when Vegagerdin is globally unavailable:
  - `vegagerdinHasNoUsableLayer(...)`
- It does not switch when Vegagerdin is available globally but empty after the selected route filter.

So if a multi-variant route has usable Vedurstofan station IDs but `vegagerdinStationIds` is empty, and `activeMode` is still `'now'`, the UI applies an empty Vegagerdin filter and the map correctly-but-badly shows no markers.

Do not fix this by turning an empty route filter into `null`. `null` means unfiltered and would show all Vegagerdin stations, which breaks the route-memory promise.

## Required fix

Make the source/time selection route-aware:

1. Compute whether the active route/variant has usable stations for the currently visible provider.
   - Prefer actual filtered marker counts over raw set size when possible:
     - `filteredVegagerdinStations.length`
     - a similar `filteredVedurstofanStationCount` based on `data.stations`, `vedurstofanRouteFilterIds`, non-null lat/lon, and active forecast slot.
2. If a route or route variant is selected and active mode has zero route-visible markers, but another provider/time has markers, switch to a usable mode.
   - Example: `activeMode === 'now'`, `filteredVegagerdinStations.length === 0`, `filteredVedurstofanStationCount > 0` -> `setActiveMode(forecastSlotStatuses[0].timeMs)`.
   - This should happen on route pair change and variant change, even if the user previously touched the source selector, because the selected route has changed the valid marker universe.
3. Disable or visually de-emphasize source/time options that would produce zero route-visible markers for the selected route.
   - At minimum, disable `Nuna` when the selected route has no Vegagerdin markers but has forecast markers.
   - Avoid adding large explanatory UI. If text is needed, keep it near the selector and short.
4. When a route variant has zero total station IDs and at least one sibling variant has station IDs, do not expose that empty variant as a clickable pill on `/vedrid`.
   - This can be done server-side in `dedupeRouteVariants()` or client-side before rendering pills.
   - Server-side is cleaner because all consumers avoid meaningless variants.
   - Preserve a true total miss as `miss` or empty state; do not invent station IDs.

## Suggested implementation points

Primary file:

- `components/weather/WeatherOverviewClient.tsx`

Likely additions:

- Add a memo similar to `filteredVegagerdinStations` for route-visible Vedurstofan stations/count.
- Add a route-aware `useEffect` after both provider counts and `forecastSlotStatuses` are known:
  - if active route filter exists
  - if current active source count is zero
  - if alternate source count is greater than zero
  - switch to alternate source
- Ensure dependencies include selected route/variant filter sets and provider data.
- Consider passing route-aware disabled state into `WeatherSourceTimeSelector`.

Secondary file if empty variants are exposed:

- `lib/iceland-routes/routeMemory.server.ts`

Current behavior intentionally keeps empty non-curated variants:

```ts
// Keep empty-station non-curated variants (nothing to compare).
if (genericSet.size === 0) return true
```

For `/vedrid`, that is now risky because it creates selectable route pills with no markers. Suggested rule:

- If any returned variant has station IDs, drop variants with zero total station IDs.
- If all variants are empty, return miss/empty behavior rather than several blank route pills.

Add or update tests in:

- `lib/__tests__/weather-route-memory-migration.test.ts`

## Acceptance criteria

- Dalvik -> Gardabaer with multiple route variants never shows a blank marker layer when at least one provider has route-memory stations.
- `Allar leidir` shows the union of all usable route stations.
- Choosing `Hringurinn` or `Leid 2` either shows that variant's stations or does not expose the variant if it has no station IDs.
- If Vegagerdin has no route markers but Vedurstofan has route markers, `/vedrid` automatically shows the first forecast slot.
- If Vedurstofan has no route markers but Vegagerdin has route markers, `/vedrid` can stay on or switch to `Nuna`.
- Status pills and safnpuls stay in sync with the map-filtered station set.
- No Google call is introduced on `/vedrid`.
- No SQL migration is required for this UI hotfix unless Claude Code finds a separate data-shape bug.

## Route intelligence check

- Route family affected: general `/vedrid` route-memory filtering, specifically multi-variant routes such as Dalvik -> Gardabaer.
- This is provider-neutral behavior: the UI must pick a usable provider/time for the chosen route rather than assuming Vegagerdin current observations always exist.
- No new canonical segment/control point is required for this bug.
- If the diagnostic data shows empty route variants are being stored for real routes, update `lib/iceland-routes/routeMemory.server.ts` dedupe behavior rather than adding special-case place names.
- Privacy remains unchanged: no user IDs, raw addresses, Google geometry, or place IDs should be surfaced.

## Design.md check

Relevant Design.md rules read:

- Mobile-first at 360-460 px.
- Controls must not cause horizontal overflow.
- Input text must stay at least 16 px on mobile.
- Mutually exclusive small option sets can use segmented/pill-style controls.
- Empty/loading/error states must be explicit and not cause layout shift.

This hotfix should not add a large panel or overlay. Keep the route pills and source/time selector compact, stable, and mobile-safe.

## Localhost checks for Stebbi

Before release, test on localhost in a mobile-width viewport and desktop:

1. Open `/vedrid`.
2. Select `Dalvik` as `Fra` and `Gardabaer` as `Til`.
3. Confirm route variant pills appear.
4. With `Allar leidir` selected, confirm the map shows station markers.
5. Tap each visible route pill.
6. Confirm each selected pill either shows route-specific markers or is not shown if it has no stations.
7. Confirm `Nuna` is not allowed to leave the map blank when only forecast stations exist.
8. Confirm status filter pills still filter the visible route markers only.
9. Confirm the safnpuls/feed remains above the map and filters to the same route station set.
10. Confirm the `Ferdalagid` button still opens the detailed trip flow with the selected from/to.

Also regression-test:

- Reykjavik -> Siglufjordur
- Reykjavik -> Egilsstadir with multiple route variants
- A one-route pair that already worked
- Public user and authenticated user

Do not test by running migrations or modifying production data. This should be verified locally first and deployed only after Stebbi explicitly approves deployment.

## Commands Codex ran

Read-only inspection only:

- `rg -n "routeMemory|selectedVariantKey|activeVariant|vegagerdinRouteFilterIds|vedurstofanRouteFilterIds|activeMode|vegagerdinHasNoUsableLayer" "components/weather/WeatherOverviewClient.tsx"`
- `rg -n "route-memory/lookup|variants|vegagerdinStationIds|vedurstofanStationIds|routeVariant" app lib components -g "*.ts" -g "*.tsx"`
- `Get-Content WORKFLOW.md`
- `Get-Content ai-handoff/README.md`
- `rg -n "mobile|kort|map|pill|filter|empty|loading|input|overflow|zoom|route|leid" Design.md`
- `rg -n "route memory|leid|variant|station|provider|control|Vegagerdin|Vedurstofan|route-family" IcelandRoadmap.md`
- Targeted `Get-Content` snippets from `WeatherOverviewClient.tsx`, `routeMemory.server.ts`, and the route-memory lookup API.

No code, SQL, migration, production, commit, push, or deploy action was performed by Codex.
