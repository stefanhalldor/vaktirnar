# Codex review: v200 prerelease - selected/worst met.no status mismatch

Created: 2026-07-15 08:48
Timezone: Atlantic/Reykjavik

TODO reference: todo-086

## Findings

### Blocker - Selected/worst MET/Yr point panel still computes `no_data` while the same point is classified correctly elsewhere

Files:
- `components/weather/TravelAuditMap.tsx:508-510`
- `components/weather/TravelAuditMap.tsx:835`
- `components/weather/travelAuditMap.helpers.ts:386-390`
- Compare with `app/auth-mvp/vedrid/FerdalagidClient.tsx:2312-2315`

Stebbi's screenshot confirms the bug:

- map/status pills show all 72 route points as `Nálgast óþægindi`;
- "Allir spápunktar" rows show the correct `Nálgast óþægindi` labels;
- but the selected/worst panel under the map shows `Ófullnægjandi gögn`.

Root cause:

`PointDetailsPanel` in `TravelAuditMap` gets a `summary` from:

```ts
buildPointSummary(selectedPoint, highlightedIssue, activeCandidate, activeLeg)
```

When `activeCandidate` is present, `buildPointSummary` intentionally sets `summary.status` to `undefined`:

```ts
status: dp ? undefined : derived ? undefined : activeCandidate ? undefined : pt.summaryForWindow?.status
```

Then `PointDetailsPanel` classifies the chip with:

```ts
classifyPointWindDisplayStatus(summary.windMs, summary.status !== undefined, ...)
```

So even when `summary.windMs` is valid, `hasData` becomes false because `summary.status` is undefined. That produces `no_data`.

This diverges from `RoutePointRow`, which uses the correct has-data logic:

```ts
const ptHasData = isActiveMode
  ? activeCandidate!.displayPoint?.routeIndex === pt.routeIndex || (pt.forecastRows?.length ?? 0) > 0
  : pt.summaryForWindow !== undefined
const windStatus = classifyPointWindDisplayStatus(summary.windMs, ptHasData, th)
```

Recommended fix:

Create one shared helper for MET/Yr point display status and use it in all three places:

- route markers/status counts in `TravelAuditMap`
- selected/worst `PointDetailsPanel`
- "Allir spápunktar" `RoutePointRow`

The helper should take the same source facts everywhere:

```ts
resolveMetnoPointDisplayStatus({
  pt,
  summary,
  activeCandidate,
  activeLeg,
  thresholdsUsed,
})
```

It should treat active-candidate mode as having data when:

- this is the active `displayPoint`, or
- a nearest forecast row can be derived from `pt.forecastRows` for the active ETA.

Avoid using `summary.status !== undefined` as the data-presence test in active-candidate mode, because `buildPointSummary` deliberately leaves `status` undefined for dynamic ETA-derived values.

Minimum acceptable fix:

- Change `PointDetailsPanel` to receive `selectedPoint`, `activeCandidate`, and `activeLeg`, then compute has-data using the same logic as `RoutePointRow`.

Better fix:

- Extract a helper so the map, selected panel, and all-points row cannot diverge again.

### Medium - Map status counts/visibility may have a related false-data assumption

File:
- `components/weather/TravelAuditMap.tsx:521-532`

Map status counts currently use:

```ts
hasData = (pt.forecastRows?.length ?? 0) > 0
```

This is better than the selected panel, but it can still count a point as having data even if no nearest row can be selected for the active ETA. The practical bug Stebbi sees is the selected panel, but while fixing this, prefer a single shared helper that bases has-data on the actual selected/derived value, not only raw `forecastRows.length`.

This is especially important now because we are trying to make `met.no`, `Veðurstofan`, and later `Vegagerðin` provider behavior generic and trustworthy.

### Low - v200 handoff format is still not fully compliant with workflow

File:
- `ai-handoff/2026-07-15-0840-todo-086-v200-claude-prerelease.md`

The handoff has `Dags: 2026-07-15`, but it does not include:

- `Created: YYYY-MM-DD HH:MM`
- `Timezone: Atlantic/Reykjavik`

It does include `Localhost checks fyrir Stebbi`, which is good. This is not a product blocker, but Claude Code should keep the required header format in future handoffs.

## What Looks Good In v200

- The previous Codex blocker from v199 appears fixed in the intended direction:
  - `stillStale` now hides the refresh button.
  - UI shows a retry-after/cooldown message.
  - unused `WIND_STATUS_META` import/variables were removed from `VedurstofanPointCard`.
- No new SQL is needed for this v200 fix.
- SQL77 is already confirmed present from Stebbi's read-only screenshot and should not be run again.

## Recommended Next Step For Claude Code

Do not prerelease v200 as-is. Fix the selected/worst MET/Yr status chip first.

Implementation guidance:

1. Create or reuse a single status resolver for MET/Yr route point cards.
2. Use it in:
   - `TravelAuditMap` selected/worst panel,
   - `TravelAuditMap` route marker/status count paths if practical,
   - `RoutePointRow`.
3. Add focused test coverage if there is an existing helper-level test surface. At minimum, cover:
   - active candidate present,
   - `summary.status` undefined,
   - `summary.windMs` valid,
   - resulting status is `nalgast-othaegindi` or equivalent, not `no_data`.
4. Re-run:
   - typecheck
   - focused tests touching travel map/helpers/status rendering.

## Localhost checks for Stebbi

After Claude fixes this:

1. Open `/auth-mvp/vedrid` on localhost as a user with weather access.
2. Use the same route as in the screenshot.
3. Leave only `met.no` enabled.
4. Confirm the pill under the map says `Nálgast óþægindi (72)` or similar for the selected departure.
5. Confirm the "Mest krefjandi" card under the map does **not** say `Ófullnægjandi gögn`.
6. Click a route point manually on the map.
7. Confirm the "Valin veðurspá" card also shows the same style/status as the corresponding row in "Allir spápunktar".
8. Expand "Allir spápunktar" and compare:
   - same point,
   - same provider,
   - same status chip family,
   - no selected/worst chip drift.
9. Repeat with both `met.no` and `Veðurstofan` enabled to ensure the shared status helper did not break provider overlay points.
10. Repeat with only `Veðurstofan` enabled to ensure Veðurstofan-specific cards are unaffected.

Do not run SQL77 again.
Do not deploy until this visual/status mismatch is fixed and checked.

## Commands Run By Codex

Read-only inspection only:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-0840-todo-086-v200-claude-prerelease.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- targeted reads/searches in:
  - `components/weather/TravelAuditMap.tsx`
  - `components/weather/travelAuditMap.helpers.ts`
  - `components/weather/RouteWeatherPointDetailCard.tsx`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `.eslintrc.json`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

No tests were run by Codex.
No SQL was run by Codex.
No app/source files were changed by Codex, except this review document.

## Óvissa / þarf að staðfesta

Confidence is high on the selected/worst root cause because the code path directly explains Stebbi's screenshots.

I did not run the app in a browser and did not run tests, so Claude Code should verify the exact visual behavior locally after the fix.
