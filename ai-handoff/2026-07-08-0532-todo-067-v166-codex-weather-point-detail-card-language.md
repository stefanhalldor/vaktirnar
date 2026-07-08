# TODO-067 v166 - Codex handoff - Ferðaveður point detail card semantics and wording

Created: 2026-07-08 05:32  
Updated: 2026-07-08 05:32 - added combined departure summary/scrubber card above map  
Updated: 2026-07-08 06:04 - added arrival time, green-threshold copy rule, departure selection reset, and independent map visibility pills  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Recipient: Claude Code

## Context

Stebbi wants the lower point-detail cards on the Ferðaveður result screen to be more understandable and consistent.

Current issue:

- The lower card currently reads like a technical selected-point/debug panel.
- It uses wording such as `frá leiðinni`, while Stebbi prefers clearer user language: `frá veginum`.
- It can imply "weather station" language in user thinking, but met.no `locationforecast` is a forecast for coordinates / forecast grid point, not necessarily an observation station.
- The default panel should explain the most relevant forecast point across the available forecast horizon, not just show whichever route point happens to be selected.
- The current result summary card and departure-time scrubber card feel like separate boxes that should be one coherent control/summary block.
- The small departure-time detail box currently contains useful `Komutími`; that needs to survive in the new combined card.
- When a green/good departure is selected, threshold-delta text must not say negative values like `-18,6 yfir 25 m/s mörkum`.
- Map point visibility should be controlled on the map itself, not by the departure scrubber filters.

This handoff should be treated as a UI/content clarity pass. Do not change the weather model, thresholds, route sampling, Supabase, SQL, RLS, auth, or Google Maps provider logic.

## Relevant files inspected by Codex

- `ai-handoff/README.md`
- `Design.md`
- `ai-handoff/2026-07-08-0521-todo-067-v165-claude-v164-done-prerelease.md`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`

## Design.md constraints to follow

This touches cards, copy, mobile layout and accessibility:

- Mobile-first.
- Cards should have one clear purpose and clear text hierarchy.
- Text and controls must not overlap or create horizontal overflow.
- All user-facing text must be in `messages/is.json` and `messages/en.json`.
- Do not rely on color alone to communicate selected/worst/warning state.
- Keep touch targets and links usable on mobile.
- Test at 360 px, 390 px and 460 px.

## Important terminology decision

Use this exact Icelandic wording for the distance between route coordinate and met.no forecast coordinate:

```txt
Spápunktur er um 240 m frá veginum
```

Do not use:

```txt
Veðurstöð er ...
```

Reason:

- met.no Locationforecast gives forecasts for coordinates / forecast points.
- We are not necessarily displaying an observation station.
- `frá veginum` is more natural user language than `frá leiðinni`, even though the implementation computes distance from the route polyline/route point.

If the point is effectively on the route, use a similarly natural phrase:

```txt
Spápunktur er nánast á veginum
```

English equivalents can be concise:

- `Forecast point is about {meters} m from the road`
- `Forecast point is almost on the road`

Avoid adding long explanatory copy like "because forecasts are provided on a grid" in the visible card unless it is hidden in an explainer. It makes the card feel too technical.

## Requested behaviour

### 1. Combine the result summary and departure scrubber into one card above the map

Replace the current split structure:

1. top result summary card,
2. map,
3. `Brottfarartíminn í Teskeið` scrubber card below the map,

with a single combined card above the map:

```txt
Brottfarartíminn þinn í Teskeið

Ferðin frá kl. 05:34 lítur vel út veðurfarslega.
Komutími: kl. 13:18
Notuð viðmið: vindur 15/25 m/s, hviður 45 m/s, úrkoma 5 mm/klst

Allir veðurpunktar á valdri leið miðað við brottfarartíma á klukkutíma fresti
hafa verið sóttir næstu X daga.

[scrubber/timeline]
```

Product rules:

- The combined card must sit above the interactive map.
- The map should no longer have the departure scrubber inserted below it via the current `belowMap` placement.
- Keep the `Af hverju?` explainer either inside this combined card or directly under it, but do not make the result feel like separate unrelated boxes.
- Show both selected departure time and arrival time in the combined card. The arrival time is useful and should not be lost when removing the old small detail box.
- The old small detail box under the scrubber currently shows `Brottför ... Komutími ...`. In the new design, that information should be represented in the combined card, not duplicated in a separate nested box.
- The heading should be:

```txt
Brottfarartíminn þinn í Teskeið
```

- The explanatory line should communicate that the app has evaluated route weather points for hourly departure times across the available forecast horizon:

```txt
Allir veðurpunktar á valdri leið m.v. brottfarartíma á klukkutíma fresti hafa verið sóttir næstu X daga.
```

- Do not hard-code `9 dagar` unless the actual candidate data covers that horizon. met.no Locationforecast documentation describes forecasts for the next nine days, but the UI should display the actual available horizon from our generated candidates / forecast coverage. If we only have 7.5 usable days for a long route, say the actual value.
- If showing "X days" is awkward for partial days, use a natural fallback such as:

```txt
... fram að {date/time}
```

or:

```txt
... á tímabilinu sem spáin nær yfir.
```

but prefer concrete user-facing time coverage where possible.

### 2. Scrubber defaults: show everything, no `Allt` filter

The departure-time scrubber inside the combined card should show all statuses by default, including green.

Changes from current behaviour:

- Green / `Gott veður` must be visible by default.
- Remove the `Allt` filter chip. It becomes redundant if all statuses are visible by default.
- Keep individual status filters if useful, e.g. `Gott veður (49)`, `Óþægilegt (3)`, `Hættulegt (0)`, but default all of them to visible.
- If the user manually filters statuses out, the scrubber may show a short empty state and a `Sýna allt`/reset option. But the first impression must not be "nothing is shown unless you know to click Show all".

Reason:

- This scrubber is now the main explanation of "what did Teskeið look at?".
- Hiding green by default made sense when the scrubber was a warning-only diagnostic, but now it is part of the primary result and should build confidence by showing the full evaluated time range.

### 3. Green/good departures must not show negative threshold deltas

Current bad example:

```txt
Vindur: 6,4 m/s (-18,6 yfir 25 m/s mörkum)
```

If the selected departure has `Gott veður` / green status, do not show the parenthetical threshold delta at all.

Rules:

- Only show `({excess} yfir {threshold} mörkum)` when `value > thresholdValue`.
- Do not show negative excess values.
- Do not show a threshold-overage parenthesis for green/good candidates just because a threshold value exists.
- For green candidates, concise weather values are enough:

```txt
Vindur: 6,4 m/s
```

or, if there is precipitation:

```txt
Vindur: 6,4 m/s · Úrkoma: 0,2 mm/klst
```

This applies to both:

- the new combined departure card,
- any selected slot/detail card that remains or is reused internally.

### 4. Selected departure time changes the whole result screen

When the user selects a departure time in the scrubber:

- The main result copy inside the combined card updates to match that selected departure.
- The combined card shows the selected departure time and corresponding arrival time.
- The map updates to show weather points/statuses for that departure.
- The lower point detail panel resets to the weather-worst / most-relevant point for that newly selected departure.
- If the user had manually selected a point for the previous departure time, clear that manual selection when the departure time changes.
- The entire result screen should now be understood as "result for the selected departure time", not "static original result plus a separate timeline toy".

Example:

```txt
Ferðin frá kl. 05:34 lítur vel út veðurfarslega.
```

becomes:

```txt
Ferðin frá kl. 12:34 er óþægileg á einum kafla.
```

or similar, based on existing deterministic status text.

Remove/avoid this old line from the primary result copy:

```txt
Engin varúð fannst á leiðinni næstu 48 klst.
```

Reason:

- The scrubber now shows the evaluated time range directly.
- We are no longer only talking about 48 hours.
- The result copy should focus on the currently selected departure time, not summarise a hidden separate future window.

### 5. Add independent map point visibility controls

The map should have its own visibility controls for which weather-point statuses are visible on the map.

Do not let the map point visibility be controlled by the filter state in the new combined departure scrubber.

Rules:

- The departure scrubber filters control the departure-time scrubber only.
- The map visibility controls control the map points only.
- Changing scrubber filters must not hide/show map points.
- Changing map visibility filters must not hide/show departure-time options.
- The deterministic result must not change when either filter changes.

UI:

- Use pill-shaped controls with counts in parentheses, similar to the combined departure card.
- Suggested labels:
  - `Gott veður (49)`
  - `Óþægilegt (3)`
  - `Hættulegt (0)`
  - `Engin gögn (0)` if relevant
- No need for an `Allt` pill if all individual status pills are visible by default.
- If all statuses are manually hidden, show a small `Sýna allt` reset action.
- Put the map visibility controls close to the map, preferably above the map canvas or immediately below it, before the point detail card.
- Counts should reflect the active selected departure time/candidate, not the whole multi-day scrubber.

Default:

- Show all map statuses by default unless there is a strong existing product reason not to.
- Endpoint markers should remain visible even if their status category is filtered out, unless Claude Code has a cleaner UX reason and documents it.

Selection behaviour:

- If the currently selected point becomes hidden by a map visibility filter, clear manual point selection and show the default worst/most-relevant visible point if possible.
- If all non-endpoint points are hidden, keep the map usable and show a clear empty/filter message.

### 6. Lower detail panel has two semantic modes

The bottom detail card in/under `TravelAuditMap` should have two modes:

#### A. Default mode: most relevant/worst point across available forecast horizon

When the user has not manually clicked a specific weather point, the panel should open by default as:

```txt
Versti veðurpunkturinn næstu X daga
```

or, if that reads too negative when everything is green:

```txt
Mesti veðurálagspunkturinn næstu X daga
```

Preferred product direction: use `Mesti veðurálagspunkturinn næstu X daga` if the status is green, and reserve `Versti veðurpunkturinn næstu X daga` for caution/red states. If keeping one title is simpler for this pass, use `Mesti veðurálagspunkturinn næstu X daga`.

If exact days are not cleanly available, use `á skoðuðu tímabili` rather than reintroducing `48 klst.`.

This mode should represent the point that best answers:

> "Hvar og hvenær á þessari leið er veðrið mest til skoðunar á spátímabilinu sem Teskeið skoðaði?"

It must include the departure time that causes the user to encounter this point.

#### B. Manual selection mode: selected point

When the user clicks/taps a weather point on the map, the panel title changes to:

```txt
Valinn veðurpunktur á leiðinni
```

This is now an inspection panel for the selected point, not the default/worst-point panel.

Clicking/tapping another point updates the panel. Existing deselect behaviour should remain if already implemented. If deselect returns to default mode, it should return to the most relevant/worst point panel.

### 7. Keep `Punktur x/y` in every bottom card

Even when the title is changed to a human-readable semantic title, keep the counter:

```txt
Punktur 30/80
```

The counter should appear in all lower point cards:

- default most-relevant/worst-point panel,
- manually selected point panel,
- any repeated/listed point cards shown lower on the result page.

Reason:

- The counter is useful for auditability and makes map/route correspondence clearer.
- It should be secondary metadata, not the whole title.

Suggested hierarchy:

```txt
Mesti veðurálagspunkturinn næstu X daga
Punktur 30/80

Brottfarartími: 23:19
Áætlað á leið: 08:34
Fjarlægð frá Garðabæ: 112 km
Vindur: 3,3 m/s · Úrkoma: 0,3 mm/klst
Spápunktur er um 240 m frá veginum

Skoða veðurspá   Opna á korti
```

For selected mode:

```txt
Valinn veðurpunktur á leiðinni
Punktur 30/80

Brottfarartími: 23:19
Áætlað á leið: 08:34
Fjarlægð frá Garðabæ: 112 km
Vindur: 3,3 m/s · Úrkoma: 0,3 mm/klst
Spápunktur er um 240 m frá veginum

Skoða veðurspá   Opna á korti
```

### 8. Use the same information order on all lower point cards

Stebbi wants the information on these cards to be consistent. Use the same ordering everywhere lower on the result page, including `PointDetailsPanel` and any route point list/detail cards if they remain visible.

Required order:

1. Semantic title:
   - `Mesti veðurálagspunkturinn næstu X daga` / `Versti veðurpunkturinn næstu X daga`
   - or `Valinn veðurpunktur á leiðinni`
2. Counter:
   - `Punktur x/y`
3. `Brottfarartími:`
4. `Áætlað á leið:`
5. `Fjarlægð frá {origin/legStartName}:`
6. Weather values:
   - `Vindur: X m/s · Úrkoma: Y mm/klst`
   - include `Hviður: X m/s` only when gust is greater than wind, consistent with earlier product decision.
7. Forecast-point distance:
   - `Spápunktur er um X m frá veginum`
   - or `Spápunktur er nánast á veginum`
8. Links:
   - `Skoða veðurspá`
   - `Opna á korti`
   - keep `Hrá met.no gögn` only if we still want the technical audit link; if kept, it should stay visually secondary.

Avoid putting raw coordinates in the main visible hierarchy unless needed for debugging. If coordinates remain, place them behind a secondary details disclosure or make them very muted. The primary user-facing truth is the forecast point distance from the road.

### 9. Brottfarartími must be explicit in the lower panel

For the default most-relevant/worst-point mode, the card must say which departure time causes the user to encounter that point.

Use:

```txt
Brottfarartími: 23:19
Áætlað á leið: 08:34
```

If the candidate spans a date boundary, include the date where needed:

```txt
Brottfarartími: mið. 8. júl. kl. 23:19
Áætlað á leið: fim. 9. júl. kl. 08:34
```

Do not show only `kl. 08:34` if the date can be ambiguous on long drives or overnight candidates.

### 10. Decide source of the default "worst/most relevant" point carefully

Current implementation anchor:

- `TravelAuditMap` receives `highlightedIssue={heatmapHighlightedIssue}` from `FerdalagidClient`.
- `heatmapHighlightedIssue` is derived from selected heatmap candidate when there is one, otherwise `result.travelPlan?.highlightedIssue`.
- `initialSelectedIndex()` prioritizes highlighted issue, then destination-closest point, then first point.

Desired behaviour:

- If no manual map point is selected, the displayed lower panel should correspond to the currently highlighted issue / active candidate worst point.
- If all candidate statuses are green and there is no issue, choose the "most loaded" point for the current/default candidate if available, or destination-closest as fallback.
- Do not falsely label a destination fallback as "worst" if no actual worst metric is available. In that case use the softer title `Mesti veðurálagspunkturinn næstu X daga` or `Mesti veðurálagspunkturinn á skoðuðu tímabili`.

If this requires a small helper to distinguish:

- auto-selected issue point,
- auto-selected fallback point,
- manually selected point,

add that state explicitly rather than inferring everything from `selectedIndex`.

### 11. Keep map/timeline interactions intact

Do not regress:

- click/tap on point selects it,
- click/tap again deselects it if v123/v124 behaviour exists,
- `Jump to worst point` still works,
- heatmap slot click still changes active candidate and map statuses,
- departure scrubber filter state still filters only the scrubber,
- map visibility filter state filters only map point visibility,
- route endpoints remain visible.

When the user changes departure time in the scrubber:

- clear any manually selected map point from the previous departure time,
- update the whole result screen to the newly selected candidate,
- show the worst/most-relevant point for that new selected departure time in the lower detail card.

### 12. Translation keys likely needed

Add or update in `messages/is.json` and `messages/en.json`.

Suggested Icelandic:

```json
"departureControlTitle": "Brottfarartíminn þinn í Teskeið",
"departureCoverageLine": "Allir veðurpunktar á valdri leið m.v. brottfarartíma á klukkutíma fresti hafa verið sóttir næstu {days} daga.",
"departureCoverageUntilLine": "Allir veðurpunktar á valdri leið m.v. brottfarartíma á klukkutíma fresti hafa verið sóttir fram að {dateTime}.",
"arrivalTimeLabel": "Komutími",
"mapPointVisibilityTitle": "Punktar á korti",
"mapPointVisibilityShowAll": "Sýna allt",
"pointDetailWorstTitle": "Versti veðurpunkturinn næstu {days} daga",
"pointDetailLoadTitle": "Mesti veðurálagspunkturinn næstu {days} daga",
"pointDetailWorstPeriodTitle": "Versti veðurpunkturinn á skoðuðu tímabili",
"pointDetailLoadPeriodTitle": "Mesti veðurálagspunkturinn á skoðuðu tímabili",
"pointDetailSelectedTitle": "Valinn veðurpunktur á leiðinni",
"pointDepartureTimeLabel": "Brottfarartími",
"pointDistanceFromLabel": "Fjarlægð frá {place}",
"forecastPointOnRoad": "Spápunktur er nánast á veginum",
"forecastPointDistanceMetersRoad": "Spápunktur er um {meters} m frá veginum",
"forecastPointDistanceKilometersRoad": "Spápunktur er um {kilometers} km frá veginum"
```

Suggested English:

```json
"departureControlTitle": "Your departure time in Teskeið",
"departureCoverageLine": "All forecast points on the selected route have been checked for hourly departure times over the next {days} days.",
"departureCoverageUntilLine": "All forecast points on the selected route have been checked for hourly departure times until {dateTime}.",
"arrivalTimeLabel": "Arrival time",
"mapPointVisibilityTitle": "Map points",
"mapPointVisibilityShowAll": "Show all",
"pointDetailWorstTitle": "Worst forecast point in the next {days} days",
"pointDetailLoadTitle": "Most exposed forecast point in the next {days} days",
"pointDetailWorstPeriodTitle": "Worst forecast point in the checked period",
"pointDetailLoadPeriodTitle": "Most exposed forecast point in the checked period",
"pointDetailSelectedTitle": "Selected forecast point on the route",
"pointDepartureTimeLabel": "Departure time",
"pointDistanceFromLabel": "Distance from {place}",
"forecastPointOnRoad": "Forecast point is almost on the road",
"forecastPointDistanceMetersRoad": "Forecast point is about {meters} m from the road",
"forecastPointDistanceKilometersRoad": "Forecast point is about {kilometers} km from the road"
```

If names differ, keep the meaning.

### 13. Existing strings to replace

Current Icelandic strings around `messages/is.json` include:

- `forecastPointOnRoute`: `Spápunkturinn er nánast á leiðinni.`
- `forecastPointDistanceMeters`: `Spápunkturinn er um {meters} m frá leiðinni...`
- `forecastPointDistanceKilometers`: `Spápunkturinn er um {kilometers} km frá leiðinni...`

Replace visible usage with the new road wording:

- `Spápunktur er nánast á veginum`
- `Spápunktur er um {meters} m frá veginum`
- `Spápunktur er um {kilometers} km frá veginum`

Do not use `veðurstöð`.

## Testing guidance for Claude Code

Run at least:

```bash
npm run type-check
npm run test:run
```

If there are tests around `travelAuditMap.helpers.ts` or `TravelAuditMap`, add focused coverage for:

- auto/default panel title vs manual selected panel title,
- `Punktur x/y` preserved,
- road wording used for forecast distance,
- gust hidden when gust <= wind and shown when gust > wind,
- departure time and ETA both present when active candidate exists.
- combined departure card above the map renders the scrubber with green shown by default.
- `Allt` filter chip is absent.
- selected departure time updates result copy and map candidate state.
- green/good candidate weather text does not show negative threshold excess.
- selected departure time displays arrival time.
- selected departure time resets any manual map point selection to the worst/most-relevant point for that departure.
- map point visibility controls are independent from departure scrubber filters.

If component tests are too heavy, extract display-shaping helpers and test those.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost with weather enabled and maps working.

1. Calculate a route with many points, for example `Garðabær -> Egilsstaðir`.
2. Confirm the top of the result area.
   - Expected: one combined card above the map, headed `Brottfarartíminn þinn í Teskeið`.
   - Expected: the old separate top summary + separate scrubber-under-map structure is gone.
   - Expected: the card explains that all route forecast points have been checked for hourly departure times across the available forecast horizon.
   - Expected: the text does not say `næstu 48 klst.`.
3. Inspect the scrubber in the combined card.
   - Expected: green/good departures are visible by default.
   - Expected: there is no `Allt` filter chip.
   - Expected: status filters/counts still work if present.
4. Select a different departure time in the scrubber.
   - Expected: the result sentence in the combined card changes to that selected departure time.
   - Expected: the combined card shows both selected departure time and `Komutími`.
   - Expected: map point colours/details update for that selected time.
   - Expected: if the selected time is green/good, text does not show negative "yfir mörkum" values.
5. Select a point on the map, then select a different departure time in the scrubber.
   - Expected: the manually selected point is cleared.
   - Expected: the lower card shows the worst/most-relevant point for the newly selected departure time.
6. Inspect map point visibility controls.
   - Expected: map has its own pill-shaped controls with counts, e.g. `Gott veður (49)`, `Óþægilegt (3)`.
   - Expected: changing map visibility affects only map points, not the departure-time scrubber.
   - Expected: changing departure scrubber filters affects only the scrubber, not map point visibility.
7. Do not click any map point.
   - Expected: lower card opens as `Mesti veðurálagspunkturinn næstu X daga`, `Versti veðurpunkturinn næstu X daga`, or a clean `á skoðuðu tímabili` equivalent depending on final wording/status.
   - Expected: card still shows `Punktur x/y`.
   - Expected: card shows `Brottfarartími`, `Áætlað á leið`, `Fjarlægð frá ...`, weather values and `Spápunktur er um X m frá veginum`.
8. Click/tap a point on the map.
   - Expected: card title changes to `Valinn veðurpunktur á leiðinni`.
   - Expected: `Punktur x/y` remains visible.
   - Expected: same information order is preserved.
9. Click/tap another point.
   - Expected: card updates, same format.
10. If deselect-on-second-tap exists, tap the selected point again.
   - Expected: card returns to default most-relevant/worst point mode.
11. Click a different departure time in `Brottfarartíminn þinn í Teskeið`.
   - Expected: lower card values update for the active candidate/time.
   - Expected: if a manual point was selected, it is cleared and the worst/most-relevant point for the new departure is shown.
12. Check a green/all-clear route.
   - Expected: wording does not make the situation sound dangerous if everything is green.
13. Check a yellow/red route if available.
   - Expected: default panel clearly explains the actual worst point and why it matters.
14. Check at 360 px, 390 px and 460 px.
   - Expected: no horizontal overflow, link wrapping is OK, and text hierarchy is readable.

No Supabase, SQL, RLS, auth, production data, secrets, billing, or migration changes are needed for this handoff.

## Commands Codex ran

Read-only:

```powershell
Get-Content -Encoding UTF8 'ai-handoff/README.md'
Select-String -Path 'Design.md' -Pattern 'Card|text|mobile|overflow|Navigation|Accessibility|Icons' -Context 1,3 -Encoding UTF8
rg -n "Punktur|point|forecast|spápunkt|routePoint|weatherPoint|Hrá met.no|Skoða veðurspá|Opna á korti|selected|highlightedIssue|candidateToIssue|TravelAuditMap" app/auth-mvp/vedrid components/weather lib/weather messages/is.json messages/en.json
$p='components/weather/TravelAuditMap.tsx'; $c=Get-Content -Encoding UTF8 $p; $c[365..620]
$p='components/weather/travelAuditMap.helpers.ts'; $c=Get-Content -Encoding UTF8 $p; $c[0..235]
$p='app/auth-mvp/vedrid/FerdalagidClient.tsx'; $c=Get-Content -Encoding UTF8 $p; $c[960..1065]; $c[1230..1315]
Get-ChildItem -File 'ai-handoff' | Select-Object Name,Length | Sort-Object Name | Select-Object -Last 10
Get-Content -Encoding UTF8 'ai-handoff/2026-07-08-0521-todo-067-v165-claude-v164-done-prerelease.md'
Get-Date -Format "yyyy-MM-dd HH:mm"
Get-Content -Encoding UTF8 'ai-handoff/2026-07-08-0532-todo-067-v166-codex-weather-point-detail-card-language.md'
Select-String -Path 'Design.md' -Pattern 'Cards|mobile|overflow|text|Navigation|Controls|Accessibility' -Context 1,2 -Encoding UTF8
Select-String -Path 'ai-handoff/2026-07-08-0532-todo-067-v166-codex-weather-point-detail-card-language.md' -Pattern '48|Brottfarartíminn þinn|Allt|næstu X|frá veginum' -Context 1,2 -Encoding UTF8
Get-Date -Format "yyyy-MM-dd HH:mm"
```

No tests were run by Codex. No app code, SQL, env, production data or migrations were changed by Codex.
