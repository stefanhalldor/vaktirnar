# TODO 085 - Codex review of v010 prerelease

Created: 2026-07-11 10:57
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Prerelease review
Related TODO: #85 Wind threshold simplification and fine-grained wind labels
Reviewed handoff: `2026-07-11-1045-todo-085-v010-claude-v009-done-prerelease.md`

## Findings

### P1 - Map pills/markers may still use the wrong time window for fine-grained status

`TravelAuditMap` now renders five-level pills, but the fine-grained map classification uses `pt.summaryForWindow?.worstWindMs` even when a specific heatmap/scrubber slot is selected:

- `components/weather/TravelAuditMap.tsx:342`
- `components/weather/TravelAuditMap.tsx:411`
- `components/weather/TravelAuditMap.tsx:454`
- `components/weather/TravelAuditMap.tsx:461`

At the same time, the component explicitly receives `selectedCandidatePointStatuses` and `activeCandidate` for selected-slot mode:

- `components/weather/TravelAuditMap.tsx:46`
- `components/weather/TravelAuditMap.tsx:104`
- `components/weather/TravelAuditMap.tsx:325`

This means map marker color/visibility/counts can still be based on the route's summary window, not the currently selected departure slot. That is close to the exact mismatch Stebbi reported: the selected summary can say `Nálgast óþægindi` while the map pill still counts points as `Innan marka`.

Recommended fix before release:

- For selected-slot mode, classify each map point from the active candidate's ETA and that point's forecast rows, not from `summaryForWindow`.
- Reuse the same source used by `RoutePointRow`/forecast drawer:
  - `activeCandidate`
  - `activeLeg`
  - `estimatePointEtaIso(...)`
  - nearest/decisive forecast row for that ETA
  - `classifyPointWindDisplayStatus(...)`
- If this is too large, at minimum add a very explicit localhost acceptance check proving map pills/counts change to `Nálgast óþægindi` for the same selected slot shown in the summary.

### P1 - Detail point cards still show coarse badges

The detail rows under "Allir spápunktarnir" still derive badge text and card classes from coarse `graent/gult/rautt/no_data` status:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1664`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1669`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1676`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1681`

So a point near the uncomfortable wind threshold may still be labeled `Innan marka` in the detail card even though the selected summary and scrubber use `Nálgast óþægindi`.

This is not necessarily a backend bug, but it is a UI consistency regression from the product requirement: "nýju mörkin skila sér í pillurnar líka" should apply anywhere the user sees a weather status label.

Recommended fix before release:

- Pass `thresholdsUsed` into `RoutePointRow`.
- In active-candidate mode, classify the display point wind (where available) with `classifyWindDistance` / `classifyPointWindDisplayStatus`.
- For non-active summary mode, classify `pt.summaryForWindow?.worstWindMs`.
- Use `WIND_STATUS_META` for badge label/color instead of coarse `heatmapLegendGreen/Yellow/Red`.

## What Looks Good

- `DepartureHeatmap` now counts and filters with `classifyCandidateWindDisplayStatus`, not old coarse `candidate.status`:
  - `components/weather/DepartureHeatmap.tsx:83`
  - `components/weather/DepartureHeatmap.tsx:87`
  - `components/weather/DepartureHeatmap.tsx:136`
- The shared helper `lib/weather/windDisplayStatus.ts` is a good direction. It keeps this as a display/filter layer instead of rewriting the backend status model.
- `messages/is.json` and `messages/en.json` no longer show the old "Good weather" heatmap green label; they use "Innan marka" / "Within limits".
- The previous v008 loader/how-assessed copy concerns are addressed.

## Verification Run By Codex

Commands run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-wind-distance.test.ts
npm run test:run
```

Results:

- `npm run type-check`: exit 0
- `npm run test:run -- lib/__tests__/weather-wind-distance.test.ts`: exit 0, 1 file passed, 9 tests passed
- `npm run test:run`: exit 0, 69 files passed, 2129 tests passed, 27 skipped, 8 todo

## Release Recommendation

Do not release solely based on the main summary card looking correct.

Release is okay only if localhost specifically confirms all of these:

1. The selected summary says `Nálgast óþægindi`.
2. The scrubber pill count also has `Nálgast óþægindi` and does not count that slot under `Innan marka`.
3. The map pills/counts for the same selected departure also show `Nálgast óþægindi` where applicable.
4. Map marker colors match the same fine-grained status.
5. Detail cards under `Allir spápunktarnir` do not show `Innan marka` for points that are actually `Nálgast óþægindi`.

If any of 3-5 fail, ask Claude Code for one more small patch before release.

## Localhost Checks for Stebbi

1. Open `/vedrid` on localhost.
2. Use the same kind of route/threshold setup as the screenshot, e.g. uncomfortable wind threshold around `9.5 m/s` where the selected route point wind is around `7.8 m/s`.
3. Confirm the `Á leiðinni` row says `😬 Nálgast óþægindi`.
4. Confirm the scrubber/filter pills include `😬 Nálgast óþægindi` with a count, and that the selected slot is not counted under `Innan marka`.
5. Open the map section.
6. Confirm the map pills/counts also include `😬 Nálgast óþægindi` for the selected departure.
7. Confirm map dots/markers use the near-discomfort color, not green, for those points.
8. Open `Allir spápunktarnir á leiðinni`.
9. Confirm point-card badges use `Nálgast óþægindi` where point wind is less than 2 m/s below the uncomfortable threshold.
10. Confirm no measured gust values are shown in the result card, map detail, point cards, comparison strip, or drawer.

No SQL, RLS, auth, Supabase, production data, billing, secrets, or deployment changes are involved in this review.

## Óvissa / þarf að staðfesta

- I did not browser-test the UI. The likely map/detail issues are based on code inspection.
- If `summaryForWindow` is intentionally meant to be the displayed map status even while a user-selected slot is active, that should be explicitly confirmed as a product decision. It currently looks inconsistent with the active-candidate behavior already used for ETA and selected point details.
