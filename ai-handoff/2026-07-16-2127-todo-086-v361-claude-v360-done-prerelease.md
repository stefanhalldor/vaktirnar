# TODO 086 v361 - Claude handoff: v360 done, prerelease

Created: 2026-07-16 21:30
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-2116-todo-086-v360-codex-map-status-filter-review.md`

## Status

v360 implemented locally. 91/91 tests pass. Type-check clean. NOT committed or pushed.

---

## Changes in this pass

### 1. `resolveRoutePointWindDisplayStatus` added to `travelAuditMap.helpers.ts`

New export that uses the same value priority as `buildPointSummary`:

1. `activeCandidate.displayPoint` when `routeIndex` matches (server-computed decisive values)
2. Nearest forecast row to ETA when `activeCandidate` is present and `forecastRows` exist
3. `summaryForWindow` when no `activeCandidate` is present
4. `no_data` when `activeCandidate` is present but no data is available

Also added the import:
```ts
import { type WindDisplayStatus, classifyPointWindDisplayStatus } from '@/lib/weather/windDisplayStatus'
```

### 2. `TravelAuditMap.tsx` updated

- Removed local `getPointWindMsForCandidate` function (no longer needed)
- Removed `estimatePointEtaIso` from helpers import (was only used by the removed function)
- Added `resolveRoutePointWindDisplayStatus` to helpers import
- Replaced all three status derivation sites with the new resolver:

**Marker update effect** (was using `isSlotMode` gate, now uses resolver):
```ts
const { status: windDisplayStatus } = resolveRoutePointWindDisplayStatus({
  point: pt,
  activeCandidate,
  activeLeg,
  thresholds: thresholdsForClassify,
})
```

**`mapStatusCounts`** (critical fix -- gate removed):
```ts
// Before: isSlotMode = activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined
// After: always uses activeCandidate when present
const { status } = resolveRoutePointWindDisplayStatus({ point: pt, activeCandidate, activeLeg, thresholds: th })
counts[status] = (counts[status] ?? 0) + 1
```
`selectedCandidatePointStatuses` removed from the `useMemo` deps array since it is no longer used here.

**`toggleMapStatus`** selected-point/first-visible checks now also use the resolver, removing the last two `isSlotMode` uses in the component.

### 3. Tests added

5 new tests in `lib/__tests__/travelAuditMap.helpers.test.ts` under `resolveRoutePointWindDisplayStatus`:

1. displayPoint windMs within 2 of redWindMs resolves to `nalgast-haettumork` (the screenshot scenario)
2. Without activeCandidate falls back to summaryForWindow (`innan-marka`)
3. Non-displayPoint with forecastRows uses nearest row to ETA
4. Non-displayPoint with no forecastRows under activeCandidate resolves to `no_data`
5. Point with no summaryForWindow and no activeCandidate resolves to `no_data`

---

## Root cause fixed

`mapStatusCounts` previously gated active-candidate mode on:
```ts
const isSlotMode = activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined
```

When `selectedCandidatePointStatuses` was undefined (common case when the provider doesn't send it), the counts fell back to `summaryForWindow`, while the detail card correctly used `activeCandidate.displayPoint`. This caused the `Nálgast hættumörk` filter chip to disappear even when the worst card showed it.

The fix removes the `selectedCandidatePointStatuses` gate entirely from the fine-grained status paths. `selectedCandidatePointStatuses` is still used for the coarse `markerStatus`/`isHighlighted` logic in the marker effect (unchanged).

---

## Pending localhost verification

1. Open `/vedrid` and select a route/time that produces a point with `Nálgast hættumörk` in the worst point card.
2. Confirm the map filter chips include `Nálgast hættumörk (N)` with a non-zero count.
3. Click only `Nálgast hættumörk` -- the near-danger marker stays visible, others filter out, the card still says `Nálgast hættumörk`.
4. Clear the filter and confirm original counts return.
5. Also verify a normal green route and a route with only `Óþægilegt` to confirm no regression.

Also still pending from v357/v358 (not yet committed):
- Icelandic month names in `CDT_IS_MONTH` and `DepartureHeatmap.tsx`
- `VedurstofanPointCard` forecast rows always show date (`showDate` always true)
- `formatCompactDateTime` date labels on weather cards

No Supabase, SQL, auth, RLS, secrets, Vercel, production data, or migration changes required.
