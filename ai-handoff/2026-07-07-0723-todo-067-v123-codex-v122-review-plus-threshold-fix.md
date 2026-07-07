# todo-067 v123 - Codex review: Claude v122 Phase 1 + include Codex v122 threshold fix

Created: 2026-07-07 07:23  
Timezone: Atlantic/Reykjavik  
Relevant TODO: todo-067 - Veðrið / Ferðalagið

Reviewed:

- `ai-handoff/2026-07-07-0717-todo-067-v122-claude-phase1-done.md`
- `ai-handoff/2026-07-07-0708-todo-067-v122-codex-threshold-explanation-bug.md`

Codex did not modify app code. This is a review/handoff file for Claude Code.

## Findings

### P1 - Threshold explanation bug is still present and must be fixed next

Claude v122 implemented the v121 Phase 1 map/timeline work, but it did not implement Codex v122, the threshold explanation correctness bug.

The current code still derives UI thresholds from defaults in the timeline detail path:

- `components/weather/DepartureHeatmap.tsx:21-35` - `DepartureHeatmapProps` has no `thresholdsUsed`.
- `components/weather/DepartureHeatmap.tsx:242-256` - `SlotDetail` uses default `WEATHER_THRESHOLDS` for gust decisiveness and calls `deriveThreshold(metric, candidate.reasonCode)` without resolved thresholds.
- `components/weather/DepartureHeatmap.tsx:270-275` - renders `aboveThresholdShort` with that default-derived threshold.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:712-721` and `:730-740` - `DepartureHeatmap` is rendered without passing `result.travelPlan.thresholdsUsed`.
- `components/weather/travelAuditMap.helpers.ts:156-193` - `candidateToIssue` also calls `deriveThreshold(...)` without active thresholds.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:274-279` - `candidateToIssue(...)` feeds the highlighted issue used by the audit map/detail UI.

This directly explains Stebbi's screenshot: custom wind caution was `8 m/s`, selected slot wind was `8.7 m/s`, but the UI said `yfir mörkum 13.0 m/s`.

This must be treated as correctness, not polish. If the color/status says `Óþægilegt`, the explanatory text must use the exact metric and threshold that made it `Óþægilegt`.

### P1 - Timeline filter does not activate a candidate when no slot is selected

Claude v122 says filter auto-selection is implemented, but current behavior only auto-selects when an already-selected slot becomes hidden:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:201-218` returns early when `selectedHeatmapIdx === null`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:220-237` has the same pattern for return candidates.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:281-286` only sends `selectedCandidatePointStatuses` to the map when a selected index exists.
- `components/weather/TravelAuditMap.tsx:282-294` otherwise colors markers from `pt.summaryForWindow`, not from the filtered timeline candidate.

This is still a UX/correctness gap from v119/v121: when the default filter hides green and leaves yellow/red slots visible, the map can still represent the summary/leavingAt context until the user manually selects a slot. That means the filter can look like it affects the scrubber while the map is not actually showing the same candidate.

Minimum fix:

- When a filter change leaves `selectedHeatmapIdx === null`, auto-select the first visible `rautt`, then first visible `gult`, then first visible candidate.
- Do the same for return heatmap.
- This makes the selected candidate, map marker colors, map marker opacity, time chips, and detail panel all refer to the same timeline slot.

This should happen after every filter change, not only when a selected slot is hidden.

### P1 - Point detail uses stale `summaryForWindow` forecast time after departure slot changes

Stebbi found a concrete mismatch:

- Screenshot 1:
  - selected departure slot: `23:19`
  - selected map point: `Punktur 30/80`
  - point detail says:
    - `Áætlað á leið: 00:38`
    - `Spágildi notað: 09:00`
    - `Næsta spá: Verri kl. 10:00`
- Screenshot 2:
  - selected departure slot: `00:19`
  - selected/worst map point: `Punktur 31/80`
  - point detail still says:
    - `Spágildi notað: 09:00`
    - `Næsta spá: Verri kl. 10:00`

This is very likely caused by mixed data sources:

- `components/weather/travelAuditMap.helpers.ts:218-220` correctly derives dynamic `etaIso` from `activeCandidate`.
- But `components/weather/travelAuditMap.helpers.ts:245-246` still takes `forecastTimeIso` and `nextForecast` from `pt.summaryForWindow`.
- `pt.summaryForWindow` is the server-computed summary context, not necessarily the currently selected departure candidate/time.

So the UI can show an ETA for the active departure slot but a forecast hour from a different summary context. That is misleading.

Required behavior:

- When a departure slot / active candidate is selected, the selected point panel must show the forecast hour used for that specific route point under that specific active candidate.
- `Spágildi notað` must not come from stale `pt.summaryForWindow` when `activeCandidate` is present.
- `Næsta spá` must also be calculated relative to the same active candidate and selected route point.
- If the app cannot currently compute this from client data, do not show stale `Spágildi notað`; either hide it or add the necessary server data.

Recommended data model fix:

- Extend per-candidate point data beyond the current `CandidatePointStatus` shape.
- Current `CandidatePointStatus` only has:
  - `routeIndex`
  - `status`
- It needs enough data for the selected route point panel:
  - `routeIndex`
  - `status`
  - `etaIso`
  - `forecastTimeIso`
  - `nextForecast`
  - `worstWindMs`
  - `worstGustMs`
  - `worstPrecipMmPerHour`
  - `decisiveMetric`
  - optionally `reasonCode` / threshold issue fields if needed.

Claude Code should decide whether to:

1. Enrich `pointStatuses` for all route points for the displayed candidates, or
2. Add a separate `pointAssessments` array keyed by `routeIndex`, or
3. Use a lightweight on-demand lookup if payload size becomes too high.

For MVP correctness, prefer deterministic local data in the result over an extra user-visible loading round-trip.

Important: if only non-green point assessments are sent, green selected points may still lack correct `Spágildi notað`. If the panel shows forecast time for green selected points, it must be correct too. Otherwise hide that line for points without active-candidate assessment rather than showing stale summary data.

### P1 - Changing departure time should preserve a user-selected map point

Stebbi's expectation:

- If the user has selected a map point, they are explicitly inspecting that point.
- Changing the selected departure time should update the weather/time data for that same route point.
- It should not automatically jump to the worst point unless the user asks it to.

Concrete case from screenshots:

- User selected `Punktur 30/80`.
- Then user selected departure slot `00:19`.
- The UI automatically focused `Punktur 31/80` because it is the worst point.
- That breaks the user's inspection flow: the user was looking at point 30 and wants to see how point 30 changes under the new departure time.

Required behavior:

- Preserve the selected route point across departure slot changes when the user has manually selected a point.
- Recompute/update that point's detail values for the newly active departure slot.
- Do not auto-jump to highlighted/worst point after the user has manually selected a route point.
- If no user-selected point exists, it is acceptable to default to the worst/highlighted point for a warning slot.

Add an explicit UI affordance:

- Show a small action such as `Fara á versta punkt` / `Sýna versta punkt` when the active candidate has a worst point and the selected point is not already that point.
- Clicking it selects the worst point and updates the panel/map.
- This gives Stebbi/the user control instead of surprising auto-navigation.

Implementation note:

- Separate `userSelectedRouteIndex` from `highlightedIssue.routeIndex`.
- `highlightedIssue` can still mark the worst point visually.
- `selectedIndex` should follow `userSelectedRouteIndex` when present.
- Changing `activeCandidate` should not overwrite `userSelectedRouteIndex`.
- Clicking `Fara á versta punkt` can set `userSelectedRouteIndex` to the active issue's route index.

### P2 - `Veðurmörk` dirty navigation does not appear to track draft edits

Claude v122 says `submittedThresholds` tracking makes `Niðurstaða` dirty when thresholds change. The current implementation compares submitted overrides against committed `thresholdOverrides`:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:40-42` holds draft input state.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:151-182` only writes to `thresholdOverrides` when `handleThresholdSubmit()` runs.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:301-303` calculates `thresholdsDirty` from `thresholdOverrides` vs `submittedThresholds`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:440-443` edits only draft values.

So if Stebbi is on `Veðurmörk`, changes a draft value, and clicks `Niðurstaða` before recalculating, the result tab can still be enabled because `thresholdOverrides` has not changed yet.

Recommended behavior:

- While on the thresholds step, compute dirty from the draft values compared with the last submitted resolved thresholds.
- If draft values differ from the last submitted result, `Niðurstaða` should be disabled or clearly marked as stale until `Reikna ferðina` is pressed.
- If draft values are restored to the submitted values, `Niðurstaða` can become clickable again without recalculation.

This matters because the stepper should not allow a stale result to look valid after visible threshold edits.

### P2 - Threshold explanation strings still use old vague wording

The current messages are still:

- `messages/is.json:690` - `aboveThresholdShort`: `yfir mörkum {threshold} {unit}`
- `messages/en.json:686` - `aboveThresholdShort`: `above threshold {threshold} {unit}`

That string cannot express the key part Stebbi asked for: how far above the active threshold the value is.

Preferred Icelandic pattern:

`Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`

This should be implemented via message keys, not hardcoded in components.

### P2 - Map time chips must be clickable like route points

Stebbi's expectation: clicking the time chip on the map should behave the same as clicking the route point marker underneath it. The user should get the point details panel for that point.

Current Claude v122 implementation says:

- "Chips eru ekki clickable — click fer í gegnum til route marker undir"

But the current code uses marker chips with `clickable: false`:

- `components/weather/TravelAuditMap.tsx:332-344` creates the chip marker with `clickable: false`.

This is too fragile in practice. The chip visually looks like the tappable target, especially on mobile, and the route point underneath can be partially or fully obscured. If the user taps the visible time label and nothing obvious happens, the map feels broken.

Required behavior:

- Clicking/tapping a time chip selects the same point as clicking the underlying route marker.
- Time chips should have a pointer cursor / tappable affordance where Google Maps permits it.
- The selected point detail panel should update.
- The map should not require pixel-perfect tapping on the small dot behind the chip.
- Clicking the same selected route point or its time chip again should deselect it.
- Deselecting should clear the point-specific emphasis/detail state and return the map to the active timeline/route overview state.

Implementation note:

- Store the route point index when creating a chip and add a click listener:
  - `chip.addListener('click', () => setSelectedIndex(current => current === idx ? null : idx))`
- If Google marker event handling makes this awkward, use `clickable: true` on chip markers and keep the same `zIndex`, but confirm the route marker still remains selectable.
- `TravelAuditMap` may need `selectedIndex: number | null` instead of assuming an always-selected point. If so, handle `null` explicitly:
  - no selected point detail panel,
  - no selected marker halo,
  - warning/status markers remain visible according to the active timeline/filter state.

### P2 - Timeline/scrubber copy should describe the interaction, not generic weather trend

Current UI title from the screenshot:

`Veðurþróun á næstu klukkustundum`

This is technically descriptive, but it does not explain the interaction. The component is not just showing general weather development; it is the departure-time selector for Teskeið's route analysis.

Requested copy:

- Title: `Brottfarartíminn í Teskeið`
- Subtitle/help text: `Prófaðu að smella á brottfarartíma hér að neðan og sjáðu kortið breytast`

Requirements:

- Put this in `messages/is.json` and `messages/en.json`, not hardcoded.
- Keep the title short and scannable.
- Put the helper text under the title in small muted text.
- This should be shown above the filter chips / scrubber.

English suggestion:

- Title: `Departure time in Teskeið`
- Subtitle: `Try tapping a departure time below and watch the map update`

### P2 - Selected map point must not turn red unless the weather status is red

In the screenshot, clicking an orange point appears to turn the marker red. That is confusing because red already means `Hættulegt`.

Current likely cause:

- `components/weather/travelAuditMap.helpers.ts:61-69` returns red for any highlighted point:
  - `if (isHighlighted) return { color: '#dc2626', scale: 1.6, zIndex: 10 }`

That makes selection and danger share the same visual language.

Required behavior:

- Selection should not override status color.
- A selected green point stays green.
- A selected yellow point stays yellow.
- A selected red point stays red.
- Selection should be shown with a different affordance:
  - thicker white/primary ring,
  - slightly larger scale,
  - higher z-index,
  - subtle halo/background,
  - or another non-red treatment.

Do not use red merely to indicate selection.

### P2 - Weather attribution footer should credit MET Norway / met.no, not Veðurstofa Íslands unless verified

Current footer in screenshots:

`Veðurgögn frá Veðurstofu Íslands í gegnum met.no`

This is probably not the safest wording.

Official met.no licensing says credit should be given to The Norwegian Meteorological Institute, shortened `MET Norway`, as the source of data. Their suggested wording includes `Data from MET Norway` or `Based on data from MET Norway`. The Locationforecast API is also documented as a MET Weather API endpoint for forecasts by coordinate.

Required change:

- Do not claim `Veðurstofa Íslands` as the source unless Claude Code can verify that this exact product/data path is sourced from Veðurstofa Íslands and that this attribution is required/accurate.
- For MVP, prefer one of these:
  - `Veðurgögn frá MET Norway (met.no)`
  - `Byggt á gögnum frá MET Norway (met.no)`
  - `Veðurspá frá MET Norway (met.no)`
- Since Teskeið adds its own route/weather-threshold interpretation, `Byggt á gögnum frá MET Norway (met.no)` is probably the most honest wording.
- Keep the deterministic explainer separate:
  - `Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`

Implementation requirements:

- Update `messages/is.json` and `messages/en.json`, not hardcoded components.
- Consider linking `met.no` / `MET Norway` in the footer or explainer if the current UI pattern supports links without clutter.
- Do not use `Yr` branding or logo unless the license/terms and UI wording are deliberately reviewed.

Sources Codex checked:

- `https://api.met.no/doc/License`
- `https://api.met.no/doc/TermsOfService`
- `https://api.met.no/weatherapi/locationforecast/2.0/documentation`

### P2 - Weather flow is missing the app menu / hamburger in the header

Stebbi notes that the hamburger/menu is missing in the weather screenshots.

Current weather header shows back arrow + `Veðrið`, but no standard app menu affordance. This makes the flow feel disconnected from the rest of the app and removes access to app-level navigation/settings while the user is deep in the weather wizard.

Required behavior:

- Add the standard Teskeið app menu/hamburger affordance to all weather wizard screens:
  - route selection
  - trailer
  - thresholds
  - results
  - assumptions/edit flow if still reachable
- Use the existing app menu/header pattern if one exists; do not invent a new menu style unless no reusable pattern exists.
- Keep the current back arrow behavior.
- Header should remain mobile-first and not create horizontal overflow at 360px.
- Menu button needs an accessible label and visible focus state.
- If this MVP route intentionally bypasses the app shell, Claude Code should call that out and implement the smallest compatible menu button/header integration.

### P3 - Claude v122 test pass is useful but does not cover this bug

Claude reports:

- `npm run type-check` pass
- `npm run test:run` pass: `1743 passed | 27 skipped | 8 todo`

Codex did not rerun these commands. The existing pass is still useful, but it does not prove the threshold explanation issue is fixed, because the issue is still visible in current code paths and no v122 threshold tests appear to have been added.

## Required next implementation: include Codex v122 threshold fix

The following is the Codex v122 requirement that should be implemented next by Claude Code.

### Problem

When a point, timeline slot, next caution, audit map card, or issue card explains why something is `Óþægilegt` or `Hættulegt`, it must use the exact threshold that triggered that status.

Screenshot case:

- active thresholds:
  - `Óþægilegt ef vindur fer yfir 8 m/s`
  - `Hættulegt ef vindur fer yfir 15 m/s`
  - `Hættulegt ef hviður fara yfir 18 m/s`
  - `Óþægilegt ef úrkoma fer yfir 2 mm/klst`
- selected orange slot:
  - wind `8.7 m/s`
- current wrong text:
  - `Vindur: 8.7 m/s yfir mörkum 13.0 m/s`
- correct text:
  - `Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`

### Data-flow requirements

Use `result.travelPlan.thresholdsUsed` as the source of truth for the rendered result.

Implement at least:

1. Add `thresholdsUsed: ResolvedTravelThresholds` to `DepartureHeatmap`.
2. Pass `result.travelPlan.thresholdsUsed` from `FerdalagidClient` into outbound and return `DepartureHeatmap`.
3. Pass `thresholdsUsed` into `SlotDetail`.
4. In `SlotDetail`, replace default threshold derivation:
   - from `deriveThreshold(metric, candidate.reasonCode)`
   - to `deriveThreshold(metric, candidate.reasonCode, thresholdsUsed)`
5. In `SlotDetail`, replace default gust decisiveness:
   - from `WEATHER_THRESHOLDS.caravan/driving.redGustMs`
   - to `thresholdsUsed.redGustMs`
6. Update `candidateToIssue(...)` to accept `thresholdsUsed` in its options and pass it through from `FerdalagidClient`.
7. In `candidateToIssue(...)`, use `deriveThreshold(metric, reasonCode, thresholdsUsed)` when available.
8. Ensure `TravelAuditMap` and `IssueAuditCard` receive `TravelIssue.thresholdValue` derived from active thresholds, not defaults.

Do not use `WEATHER_THRESHOLDS.*` directly in UI explanation paths when `thresholdsUsed` exists.

### Text and formatting requirements

Add a small helper or localized formatting path for threshold explanations.

Rules:

- Icelandic UI uses decimal comma.
- Whole-number thresholds should avoid unnecessary decimal noise: `8 m/s`, not `8,0 m/s`.
- Compute `excess = value - threshold`.
- Only show the parenthetical when `excess > 0`.
- Do not show `yfir mörkum X` if the value is not actually above X.

Suggested Icelandic examples:

- `Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`
- `Úrkoma: 2,4 mm/klst (0,4 yfir 2 mm/klst mörkum)`
- `Hviður: 19,1 m/s (1,1 yfir 18 m/s hættumörkum)`

Suggested English examples:

- `Wind: 8.7 m/s (0.7 above the 8 m/s limit)`
- `Precipitation: 2.4 mm/h (0.4 above the 2 mm/h limit)`
- `Gusts: 19.1 m/s (1.1 above the 18 m/s danger limit)`

All user-facing strings must live in `messages/is.json` and `messages/en.json`.

### Metric rules

Use the triggering metric:

1. If wind triggers yellow / `Óþægilegt`, compare wind against `thresholdsUsed.cautionWindMs`.
2. If wind triggers red / `Hættulegt`, compare wind against `thresholdsUsed.redWindMs`.
3. If gusts trigger red / `Hættulegt`, compare gusts against `thresholdsUsed.redGustMs`.
4. If precipitation triggers yellow / `Óþægilegt`, compare precipitation against `thresholdsUsed.cautionPrecipMmPerHour`.
5. If multiple metrics trigger, show the strongest/worst trigger first. Secondary metrics can remain plain context unless they also get their own threshold explanation.

### Tests to add

Add focused tests for:

1. Custom wind caution threshold:
   - thresholds: `cautionWindMs = 8`, `redWindMs = 15`, `redGustMs = 18`, `cautionPrecipMmPerHour = 2`
   - candidate wind: `8.7`
   - expected threshold: `8`
   - expected excess: `0.7`
2. Custom red wind threshold:
   - wind above `redWindMs`
   - expected threshold is `redWindMs`, not caution threshold.
3. Custom gust threshold:
   - gust above `redGustMs`
   - expected metric is gust and threshold is `redGustMs`.
4. Precipitation threshold:
   - precip `2.4`, threshold `2`
   - expected excess `0.4`.
5. No contradictory explanation:
   - If value is below threshold, do not show `yfir mörkum`.

Good homes:

- `lib/__tests__/weather-travel.test.ts` for server/data correctness.
- `lib/__tests__/travelAuditMap.helpers.test.ts` if `candidateToIssue` is updated.
- A pure formatting helper test if Claude extracts one.

## Scope recommendation for Claude Code

Do this as a small follow-up, not a broad refactor:

1. Fix threshold source and threshold explanation text.
2. Fix auto-select when filter changes and no heatmap slot is selected.
3. Fix selected point details so `Spágildi notað` and `Næsta spá` are based on the active departure candidate, not stale `summaryForWindow`.
4. Preserve user-selected map point across departure slot changes; add `Fara á versta punkt` / `Sýna versta punkt`.
5. Fix `Veðurmörk` dirty-state to include draft edits.
6. Make map time chips clickable and equivalent to clicking the route point.
7. Make clicking the same selected map point/time chip again deselect it.
8. Rename the timeline/scrubber section to `Brottfarartíminn í Teskeið` and add the requested helper text.
9. Stop turning selected non-red map points red; selection must preserve the point's weather status color.
10. Replace the footer attribution with accurate MET Norway / met.no wording.
11. Add the standard app menu/hamburger to the weather flow header.
12. Add focused tests where practical.
13. Run:
   - `npm run type-check`
   - targeted tests first if possible
   - `npm run test:run` if time is reasonable

Do not touch:

- Supabase
- SQL or migrations
- auth/RLS
- env variables
- Google/Mapbox billing or API keys
- deployment
- commit/push
- production

## Notes on Claude v122 Phase 1

What looks directionally good:

- `etaIso`, `forecastTimeIso`, and `nextForecast` are now part of route point summaries.
- `TravelAuditMap` receives `activeCandidate` and can compute dynamic ETA.
- Filter state is lifted to `FerdalagidClient`.
- Map marker opacity now responds to hidden statuses.
- Top stepper allows returning to `Niðurstöður` when result exists and thresholds are not dirty.
- Tests were reportedly run and passed.

Main remaining issue: the map/timeline context can still become disconnected unless a candidate is actively selected. That is why auto-select-on-filter-with-null-selection should be part of the next fix.

## Commands Codex ran

Read-only commands:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-0717-todo-067-v122-claude-phase1-done.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-0708-todo-067-v122-codex-threshold-explanation-bug.md'`
- `git status --short`
- `rg -n "thresholdsUsed|hiddenStatuses|activeCandidate|activeLeg|submittedThresholds|thresholdsDirty|pointEtaLabel|pointForecastTimeLabel|makeTimeLabelSvg|estimatePointEtaIso|nextForecast|forecastTimeIso|etaIso|aboveThresholdShort|deriveThreshold\\(" app\\auth-mvp\\vedrid\\FerdalagidClient.tsx components\\weather lib\\weather messages\\is.json messages\\en.json`
- Snippet reads from:
  - `components/weather/DepartureHeatmap.tsx`
  - `components/weather/travelAuditMap.helpers.ts`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `components/weather/TravelAuditMap.tsx`
  - `lib/weather/travel.ts`
  - `lib/weather/types.ts`
  - `lib/__tests__/weather-travel.test.ts`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

Codex did not run tests and did not modify app code.

## Localhost checks for Stebbi

After Claude Code implements the follow-up fix:

### Threshold explanation

1. Open `/auth-mvp/vedrid`.
2. Choose a route that produces timeline warnings.
3. Go to `Veðurmörk`.
4. Set:
   - `Óþægilegt ef vindur fer yfir`: `8`
   - `Hættulegt ef vindur fer yfir`: `15`
   - `Hættulegt ef hviður fara yfir`: `18`
   - `Óþægilegt ef úrkoma fer yfir`: `2`
5. Recalculate.
6. Filter/select `Óþægilegt`.
7. Select an orange slot where wind is around `8.7 m/s`.
8. Expected:
   - Text says equivalent of `Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`.
   - It must not say `13.0 m/s`, `13,0 m/s`, `15.0 m/s`, or any threshold that did not trigger the status.

### Filter and map sync

1. Recalculate a route where timeline has both green and yellow/red slots.
2. With no timeline slot selected, filter out green.
3. Expected:
   - The UI auto-selects the first visible warning slot, preferably red before yellow.
   - Map point colors, de-emphasis, time chips, and the detail panel all correspond to that selected slot.
4. Toggle filters back to `Allt`.
5. Expected:
   - All points return to full context and selected slot remains understandable.

### Map time chips and selected marker color

1. Recalculate a route where time chips appear above several map points.
2. Tap/click a time chip directly, not the dot underneath.
3. Expected:
   - The selected point changes to that route point.
   - The point detail panel updates to that point.
   - The behavior matches clicking the route marker itself.
4. Tap/click the same selected time chip again.
5. Expected:
   - The point is deselected.
   - The point detail panel closes or returns to the non-selected route overview state.
   - The map still shows the active timeline/filter context.
6. Tap/click a route marker directly, then tap/click the same marker again.
7. Expected:
   - Direct marker selection has the same toggle behavior as the time chip.
8. Tap/click a yellow/orange point.
9. Expected:
   - The selected marker stays yellow/orange.
   - Selection is shown with a ring, halo, size, z-index, or similar non-red affordance.
   - Red is reserved for actual `Hættulegt` weather status.
10. Tap/click a green point if green points are visible.
11. Expected:
   - The selected marker stays green and does not become red.

### Selected point persistence and active forecast time

1. Recalculate a route with several warning departure slots.
2. Select a departure slot, for example `23:19`.
3. Click a specific map point that is not the worst point, for example `Punktur 30/80`.
4. Note the point details.
5. Select a different departure slot, for example `00:19`.
6. Expected:
   - The UI keeps `Punktur 30/80` selected.
   - The point detail values update for the new departure slot.
   - The UI does not automatically jump to the worst point, e.g. `Punktur 31/80`.
7. If the active slot has a worse/worst point elsewhere, click `Fara á versta punkt` / `Sýna versta punkt`.
8. Expected:
   - The selected point changes to the worst point.
   - The map and point panel update.
9. For any selected point, compare:
   - `Áætlað á leið`
   - `Spágildi notað`
   - `Næsta spá`
10. Expected:
   - `Spágildi notað` is the actual forecast hour used for that selected point and active departure slot.
   - It does not remain stuck on `09:00` if the selected point is reached around `00:38` / `01:41`.
   - `Næsta spá` is the hour after the actual forecast hour used for that same selected point.
11. If the app cannot calculate active-candidate forecast time for a point, it should hide that line rather than show stale data from another candidate.

### Timeline copy

1. Look at the scrubber/timeline card below the map.
2. Expected:
   - Title is `Brottfarartíminn í Teskeið`.
   - Subtitle/helper text is equivalent to `Prófaðu að smella á brottfarartíma hér að neðan og sjáðu kortið breytast`.
   - Text is in message files and appears naturally on 360px, 390px, and 460px mobile widths.

### Attribution footer

1. Check the footer on every weather wizard step.
2. Expected:
   - Footer no longer says `Veðurgögn frá Veðurstofu Íslands í gegnum met.no`.
   - Footer says something equivalent to `Byggt á gögnum frá MET Norway (met.no)` or `Veðurgögn frá MET Norway (met.no)`.
   - Wording does not imply Veðurstofa Íslands is the data source unless explicitly verified.
   - English locale has matching attribution.

### Header menu

1. Open every weather wizard step on mobile width.
2. Expected:
   - The standard app menu/hamburger is visible in the header.
   - Back arrow still works as before.
   - Menu button has an accessible label and visible focus state.
   - Header does not wrap awkwardly or cause horizontal overflow at 360px, 390px, or 460px.

### Veðurmörk dirty state

1. From a result, click `Veðurmörk`.
2. Edit a threshold input but do not press `Reikna ferðina`.
3. Expected:
   - `Niðurstaða` is disabled or clearly stale because the visible draft no longer matches the current result.
4. Restore the draft to the submitted value.
5. Expected:
   - `Niðurstaða` becomes clickable again without requiring recalculation.
6. Press `Reikna ferðina`.
7. Expected:
   - Result uses the new thresholds and is no longer dirty.

### Regression checks

- Default thresholds still work when Stebbi does not customize `Veðurmörk`.
- Return heatmap follows the same filter/selection behavior as outbound.
- Map still loads and markers/chips still render on mobile widths 360px, 390px, and 460px.
- No horizontal overflow.
- No Supabase, auth, billing, secrets, deployment, or production data should be touched.

## Óvissa / þarf að staðfesta

- Codex reviewed relevant snippets, not every line in the current uncommitted weather feature.
- Claude reported full type-check/test pass for v122 Phase 1; Codex did not independently rerun those commands.
- The threshold bug root cause is high confidence based on current code references.
- The filter-map sync and threshold dirty findings are medium/high confidence and should be verified by Claude in the current UI before patching.
