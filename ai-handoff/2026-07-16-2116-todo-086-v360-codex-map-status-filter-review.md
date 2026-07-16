# Codex Review / Handoff — Map status filters must use the same status source as weather cards

Created: 2026-07-16 21:16  
Timezone: Atlantic/Reykjavik  
TODO: 086  
Previous context: v358/v359 provider/date work, current localhost screenshot where the worst card shows `Nálgast hættumörk` but the map filters only show `Innan marka`, `Nálgast óþægindi`, and `Óþægilegt`.

## User-visible issue

On `/vedrid`, the summary/worst point card correctly shows a route point with:

- `Nálgast hættumörk`
- wind around `13.1 m/s`
- user threshold text indicating `Vindur (3,1 yfir 10 m/s mörkum)`

But the map filter chips under the map do not include `Nálgast hættumörk`, so the user cannot filter to that state even though the selected/worst card confirms that such a point exists.

Stebbi's product direction is right: we should not be reinventing status logic in multiple places. The same status taxonomy and resolver should drive:

- map marker color
- map filter chips and counts
- selected/worst route point card badge
- all route point cards
- scrubber/status chips where applicable

## Findings

### High: `TravelAuditMap` counts/filter chips use a different status path than the detail card

`components/weather/TravelAuditMap.tsx` already has the canonical status list:

- `ALL_WIND_DISPLAY_STATUSES`
- `classifyPointWindDisplayStatus`
- `WindStatusBadge`

The status list itself is fine. `lib/weather/windDisplayStatus.ts` includes:

- `innan-marka`
- `nalgast-othaegindi`
- `othaegilegt`
- `nalgast-haettumork`
- `haettulegt`
- `no_data`

So the problem is not that `Nálgast hættumörk` is missing from the taxonomy.

The bug is that `TravelAuditMap` calculates map filter counts in `mapStatusCounts` using this mode gate:

```ts
const isSlotMode = activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined
```

If `selectedCandidatePointStatuses` is `undefined`, the map falls back to:

```ts
pt.summaryForWindow?.worstWindMs
```

That means the map filter chips can be based on static `summaryForWindow`, even while the selected/worst detail card is based on `activeCandidate`.

Meanwhile the selected card calls `buildPointSummary(selectedPoint, highlightedIssue, activeCandidate, activeLeg)`, and `buildPointSummary` prefers `activeCandidate.displayPoint` values when the selected point is the candidate display point. That path can correctly show `13.1 m/s` and `Nálgast hættumörk`.

So today:

- detail card can say `Nálgast hættumörk`
- map filter counts can still be computed from older/static summary values
- the `Nálgast hættumörk` chip disappears

This exactly matches Stebbi's screenshot.

### Medium: `selectedCandidatePointStatuses` is not a fine-grained status source

`CandidatePointStatus.status` is currently typed as:

```ts
'gult' | 'rautt' | 'no_data'
```

It is a coarse internal `WeatherStatus`-style delta list, not the fine UI taxonomy. It cannot directly tell us whether a point is:

- `nalgast-othaegindi`
- `othaegilegt`
- `nalgast-haettumork`
- `haettulegt`

So the fix should not simply render `selectedCandidatePointStatuses.status` as the map chip status. It should use a shared fine-grained resolver that can look at the same active-candidate weather values used by the point card.

### Medium: marker visibility, marker color, selected replacement, and counts duplicate the same resolver logic

In `TravelAuditMap.tsx`, the following paths independently derive status:

- marker icon update around the marker effect
- `mapStatusCounts`
- selected point replacement inside `toggleMapStatus`
- `SelectedPointDetailsPanel` badge

These should all call one local/helper resolver, e.g.:

```ts
resolveRoutePointDisplayStatus({
  point,
  activeCandidate,
  activeLeg,
  thresholds,
})
```

The resolver should return at least:

```ts
{
  status: WindDisplayStatus
  windMs: number | undefined
  hasData: boolean
}
```

It should use the same priority as `buildPointSummary`:

1. `activeCandidate.displayPoint` when `routeIndex` matches.
2. Nearest forecast row to ETA when `activeCandidate` exists and the point has forecast rows.
3. `summaryForWindow` when no active candidate exists.

This keeps the map in lockstep with the selected/worst card.

## Recommended implementation plan for Claude Code

1. Add a shared status resolver for `TravelAuditMap`

   Best place is likely `components/weather/travelAuditMap.helpers.ts`, because it already owns:

   - `buildPointSummary`
   - `estimatePointEtaIso`
   - active-candidate display-point behavior
   - route point helper tests

   Suggested shape:

   ```ts
   export function resolveRoutePointWindDisplayStatus({
     point,
     activeCandidate,
     activeLeg,
     thresholds,
   }: {
     point: RouteWeatherPoint
     activeCandidate?: TravelCandidate
     activeLeg?: 'outbound' | 'return'
     thresholds: ResolvedTravelThresholds
   }): { status: WindDisplayStatus; windMs: number | undefined; hasData: boolean }
   ```

   Internally it should reuse the same active-candidate value selection semantics as `buildPointSummary`. If possible, avoid copying logic by extracting a lower-level helper used by both `buildPointSummary` and the new status resolver.

2. Change all `TravelAuditMap` status decisions to use the resolver

   Replace local status derivations in:

   - marker update effect
   - marker visibility
   - `mapStatusCounts`
   - `toggleMapStatus` selected-point replacement
   - selected card badge if it can share the same resolver cleanly

   Important: do not keep `activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined` as the gate for active-candidate status calculation. If `activeCandidate` is present, map filters should reflect the active departure candidate, even when `selectedCandidatePointStatuses` is undefined.

3. Keep `selectedCandidatePointStatuses` only for what it can safely do

   It may still be useful as a coarse/delta signal for no-data or legacy marker emphasis, but it should not be the primary gate for fine-grained map filters. If Claude Code finds it is no longer needed in `TravelAuditMap`, simplify carefully, but do not broaden the change beyond this bug.

4. Add focused tests

   Add unit tests in `lib/__tests__/travelAuditMap.helpers.test.ts` or a nearby test file:

   - active candidate display point has `windMs = redWindMs - 1.9` and resolves to `nalgast-haettumork`
   - same point without active candidate falls back to `summaryForWindow`
   - non-displayPoint active candidate point uses nearest forecast row to ETA
   - no forecast rows under active candidate resolves to `no_data` or the existing intended fallback, but make the intended behavior explicit

   If practical, add a component/helper test that proves `mapStatusCounts` would include `nalgast-haettumork` for the screenshot scenario. If direct component testing is too heavy, make `buildMapStatusCounts` a small pure helper and test that.

5. Do not change the status labels/design unless needed

   `WIND_STATUS_UI_META` and `messages/is.json` already support `statusNearDanger = Nálgast hættumörk`. This handoff is about data flow consistency, not new labels.

## Acceptance criteria

- In the screenshot scenario, the map filter chips include:
  - `Nálgast hættumörk (1)` or the correct count.
- Toggling `Nálgast hættumörk` shows/hides the matching marker without changing the card to a mismatched status.
- The worst/selected point card and map marker/filter status agree for:
  - `Innan marka`
  - `Nálgast óþægindi`
  - `Óþægilegt`
  - `Nálgast hættumörk`
  - `Hættulegt`
  - `Ófullnægjandi gögn`
- The fix does not duplicate status thresholds or labels in yet another place.
- Existing Veðurstofan overlay provider points still count/filter by their `ProviderMapPoint.status`.

## Suggested commands

Run at least:

```bash
npm run type-check
npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts
```

If Claude Code adds a pure helper for map counts, include its test file in the same command.

## Localhost checks for Stebbi

1. Open `/vedrid`.
2. Use a route/time setup that produces one point with `Nálgast hættumörk` in the worst point card, like the screenshot case.
3. Confirm the map chips under the map include `Nálgast hættumörk` with a non-zero count.
4. Click only `Nálgast hættumörk`.
5. Expected:
   - the near-danger marker remains visible
   - other non-endpoint statuses are filtered out
   - the selected/worst card still says `Nálgast hættumörk`
6. Clear the filter and confirm the original counts return.
7. Also check a normal green route and a route with only `Óþægilegt` to ensure existing filters did not regress.

No Supabase, SQL, auth, RLS, secrets, Vercel, production data, or migration changes should be required for this fix.

## Óvissa / þarf að staðfesta

Confidence is high on the primary root cause: `TravelAuditMap` is using `summaryForWindow` for filter counts when the card is using `activeCandidate.displayPoint`.

One detail for Claude Code to confirm in code: whether no-forecast-row active-candidate points should resolve to `no_data` or retain the existing "green by absence" behavior. The current UI has had both patterns historically, so the chosen behavior should be explicit in tests.
