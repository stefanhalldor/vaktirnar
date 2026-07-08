# Codex handoff - TODO #71 selected-slot/detail mismatch

Created: 2026-07-08 15:58
Timezone: Atlantic/Reykjavik

Related prior files:

- `ai-handoff/2026-07-08-1655-todo-071-v009-claude-v008-copy-and-card-bg-done.md`
- `ai-handoff/2026-07-08-1554-todo-071-v010-codex-v009-review.md`

## Stebbi's new localhost finding

Stebbi tested Garðabær -> Akranes and saw:

- Heatmap/top card selected slot: `Ófullnægjandi gögn (78)` and selected slot says `Ekki nóg gögn til að meta þennan brottfarartíma.`
- But `Allir spápunktarnir á leiðinni` shows many/all visible point cards as `Gott veður`, with concrete wind/precip/temp and forecast times.
- Example from screenshot: top selected departure is around `08:52 -> 09:36`, but route-point cards near the destination show ETA around `16:34` and forecast time `16:00`.

This is confusing and looks wrong to the user. I agree: this is a real state mismatch, not merely copy.

## Diagnosis

The heatmap and top selected-slot card are driven by the active selected `TravelCandidate`.

The route-point detail list is not.

In `app/auth-mvp/vedrid/FerdalagidClient.tsx`:

- active selected candidate is derived at `activeCandidate` (`~497` to `~504`);
- `selectedCandidatePointStatuses` is passed into `TravelAuditMap` (`~898`);
- but the explainer/detail list renders `<RoutePointRow key={pt.id} pt={pt} />` (`~942` to `~943`);
- `RoutePointRow` reads only `pt.summaryForWindow` (`~1147`, `~1174`, `~1182`, `~1185`).

`summaryForWindow` is built once on the server from `summaryCandidate`, usually the best/default candidate:

- `lib/weather/travel.ts:748` to `lib/weather/travel.ts:760`

That means route-point rows can show weather for a different departure window than the selected heatmap slot.

This contradicts the user's mental model after v009, because the visible page now implies:

- heatmap selected slot = selected time being explained;
- `Allir spápunktarnir á leiðinni` = all forecast points for that selected time.

Currently that is not true.

## Important nuance

`CandidatePointStatus` currently stores only a delta status:

- `lib/weather/types.ts:92` to `lib/weather/types.ts:96`

It does not store per-point ETA, forecast hour, wind, gust, precip, or temperature for every selected slot.

So Claude Code should not simply recolor `RoutePointRow` from `selectedCandidatePointStatuses` while continuing to show `summaryForWindow` metrics. That would still mix selected-slot status with stale/default metrics.

## Recommendation

Fix this as a data-consistency issue.

Preferred UX:

When a heatmap departure slot is selected, `Allir spápunktarnir á leiðinni` should reflect that selected slot.

For each row under the selected slot:

- ETA should be estimated from the selected candidate, not from `summaryForWindow`.
- Status/badge/background should come from selected candidate per-point assessment.
- If the selected slot has no forecast data for that point, the row should be muted/gray and say something like `Ekki nóg gögn fyrir þennan brottfarartíma á þessum punkti.` or reuse a concise existing key if appropriate.
- Do not show wind/precip/temp from `summaryForWindow` when a selected candidate is active unless those values are for the same selected candidate/time.
- Forecast time should match the selected slot's ETA-near forecast hour if values are shown.

If no heatmap slot is selected, using `summaryForWindow` remains okay.

## Implementation options

### Option A - smallest safe bug fix

Make `RoutePointRow` active-candidate-aware and suppress stale metrics.

Steps:

1. Pass `activeCandidate`, `activeLeg`, and `selectedCandidatePointStatuses` into `RoutePointRow`.
2. When `activeCandidate` is present:
   - derive ETA with the existing `estimatePointEtaIso(activeCandidate, pt, activeLeg)`;
   - derive status from `selectedCandidatePointStatuses` where present, with absent entries meaning green because the server currently delta-encodes non-green statuses;
   - if status is `no_data`, show no-data copy and gray background;
   - if status is green/amber/red but there are no active-candidate metrics for that point, do not show the old `summaryForWindow` wind/precip/temp line.
3. Keep `summaryForWindow` behavior only when no selected/active candidate is being displayed.

This fixes the misleading contradiction quickly, but the selected-slot detail rows become less rich for green/non-decisive points because we do not have per-point active-candidate metrics.

### Option B - fuller product fix

Extend the candidate data model with per-point summaries for the selected-slot UI.

Possible type shape:

```ts
export type CandidatePointAssessment = {
  routeIndex: number
  status: WeatherStatus | 'no_data'
  etaIso: string
  forecastTimeIso?: string
  windMs?: number
  gustMs?: number
  precipMmPerHour?: number
  airTemperatureC?: number
}
```

Then `evaluateCandidate` can build point assessments using the same `getHoursNearEta` loop it already runs at `lib/weather/travel.ts:111` to `lib/weather/travel.ts:131`.

Tradeoff: this increases response payload because candidates are many. Be deliberate:

- If payload remains reasonable for max route point count and forecast horizon, this is the best UX.
- If payload gets too large, start with Option A and open a later TODO for on-demand per-slot detail.

### Do not do this

Do not only rename `Ófullnægjandi gögn` or hide the `(78)` count. The core bug is that two parts of the screen are explaining different time windows.

Do not color the detail rows from selected-candidate status while leaving the old `summaryForWindow` metrics in place. That creates a subtler version of the same bug.

## Tests to add or adjust

At minimum:

1. A unit/helper test that selected active candidate row rendering does not use `summaryForWindow` metric/time values.
2. A no-data selected slot test:
   - selected candidate has `reasonCode: 'no_data'`;
   - relevant `pointStatuses` entry is `no_data`;
   - row shows no-data copy and does not show stale wind/precip/temp from `summaryForWindow`.
3. A default/no-selected-slot test that existing `summaryForWindow` rows still render as before.

If implementing Option B, add tests around candidate point assessments:

- candidate point with forecast hours gets ETA, forecastTimeIso, metrics and status;
- candidate point without hours gets `status: 'no_data'` and no metrics;
- absent/delta assumptions are removed or documented clearly.

## Localhost checks for Stebbi

Use a route that reproduces the current mismatch, e.g. Garðabær -> Akranes.

1. Open `/auth-mvp/vedrid`.
2. Calculate Garðabær -> Akranes.
3. Select a heatmap slot that says `Ekki nóg gögn til að meta þennan brottfarartíma.`
4. Open `Allir spápunktarnir á leiðinni`.
5. Expected after fix:
   - rows no longer show ETA/forecast times from a totally different time window, e.g. a selected `08:52 -> 09:36` slot should not show all row ETA values around `16:34`;
   - rows with missing data for the selected slot are gray/muted and say that data is missing for that selected departure time;
   - no row shows wind/precip/temp values unless those values belong to the selected slot's forecast hour;
   - green rows, if shown, are green because that selected slot has usable data for that point, not because `summaryForWindow` from another slot was green.
6. Select a normal green slot with enough data.
7. Expected:
   - point rows use that selected slot's ETA/time context;
   - no stale `summaryForWindow` values leak in.
8. Clear/change selection if the UI supports it, or calculate a fresh route.
9. Expected:
   - default summary behavior still works when no explicit selected slot is being explained.
10. Check mobile widths 360, 390 and 460 px for wrapping and no horizontal overflow.

No Supabase, auth, RLS, migration, billing, secrets, commit, push or deploy should be touched for this fix.

## Suggested next step

Claude Code should implement Option A unless the payload impact of Option B is checked and clearly acceptable. If Option A is chosen, explicitly document in the UI/handoff that selected-slot rows avoid stale metrics and may show less metric detail until a richer per-slot point assessment model is added.
