# todo-067 v127 - Codex prerelease review of Claude v126 + forecast-point distance handoff

Created: 2026-07-07 08:56  
Timezone: Atlantic/Reykjavik  
Relevant TODO: todo-067 - Veðrið / Ferðalagið  
Reviewed handoff: `2026-07-07-0840-todo-067-v126-claude-prerelease.md`

## Findings

### No blocking findings for the v126 prerelease cleanup

Claude v126 appears to have fixed the immediate v126 Codex prerelease findings:

- `WeatherBetaBanner` is now rendered in both `FerdalagidClient` and `VedridClient`.
- The beta banner body now includes the screenshot/explanation instruction.
- The outbound departure scrubber title/subtitle now use:
  - `Brottfarartíminn í Teskeið`
  - `Prófaðu að smella á brottfarartíma hér að neðan og sjáðu kortið breytast`
  in both window mode and single-departure/timeline mode.
- Remaining `aboveThresholdShort` use in `FerdalagidClient` was replaced with `aboveThresholdWithExcess` + `formatNum`.
- `TeskeidMenu` includes `/auth-mvp/vedrid` in the active prefixes.

Validation:

- `npm run type-check` passed.
- `npm run test:run` passed: 53 files, 1756 passed, 27 skipped, 8 todo.

Recommendation:

- This part is ready for Stebbi localhost testing.
- No commit, push, deploy or production work should happen until Stebbi explicitly asks for it.

### Known remaining product gap from v119/v121: active-candidate forecast time

Claude v126 correctly keeps this as a known gap:

- map chips currently show ETA only, not `ETA (spátími)`
- `buildPointSummary` hides `forecastTimeIso` and `nextForecast` when `activeCandidate` exists to avoid stale data
- full active-candidate per-point forecast time/trend still requires a larger data-model pass

This is acceptable as a known limitation for this prerelease cleanup, but it should not be described as fully solved.

## New handoff: show met.no forecast point distance from the route

Stebbi asked:

> Getum við ekki bara reiknað í metrum hversu langt frá veginum þessi punktur er?

Yes. We already have both coordinate pairs in the selected point summary:

- route point / road coordinate:
  - `summary.routeLat`
  - `summary.routeLon`
- met.no forecast grid coordinate:
  - `summary.forecastLat`
  - `summary.forecastLon`

Current UI text is too vague:

`Veðurmatið notar spá fyrir þennan met.no punkt. Hann getur verið örlítið frá veginum því spáin er á hnitaneti.`

That should become concrete and measurable.

### Required behavior

In the selected point details panel, show the approximate distance between the road/route point and the met.no forecast point.

Preferred Icelandic copy:

- If distance is very small, for example `< 50 m`:
  - `Spápunkturinn er nánast á leiðinni.`
- If distance is below 1000 m:
  - `Spápunkturinn er um {meters} m frá leiðinni. Veðurmatið notar þennan met.no punkt vegna þess að spáin er á hnitaneti.`
- If distance is 1000 m or more:
  - `Spápunkturinn er um {kilometers} km frá leiðinni. Veðurmatið notar þennan met.no punkt vegna þess að spáin er á hnitaneti.`

English:

- `< 50 m`:
  - `The forecast point is almost on the route.`
- `< 1000 m`:
  - `The forecast point is about {meters} m from the route. The assessment uses this met.no point because forecasts are provided on a grid.`
- `>= 1000 m`:
  - `The forecast point is about {kilometers} km from the route. The assessment uses this met.no point because forecasts are provided on a grid.`

### Recommended implementation

Files likely involved:

- `components/weather/travelAuditMap.helpers.ts`
- `components/weather/TravelAuditMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/travelAuditMap.helpers.test.ts`

Implementation outline:

1. Expose or reuse the existing Haversine calculation.
   - `travelAuditMap.helpers.ts` already has a private `haversineMeters(...)`.
   - Either export it or add a narrower helper:
     - `forecastDistanceFromRouteMeters(pt: RouteWeatherPoint): number`
2. Add a field to `PointSummary`, for example:
   - `forecastDistanceFromRouteM: number`
3. In `buildPointSummary(...)`, calculate:
   - route coordinate: `getRoutePointLatLng(pt)`
   - forecast coordinate: `getForecastPointLatLng(pt)`
   - distance: `Math.round(haversineMeters(route, forecast))`
4. In `TravelAuditMap.tsx`, replace the current generic `forecastPointExplanation` text with a distance-aware message.
5. Add message keys instead of hardcoding text.

Suggested message keys:

```json
"forecastPointOnRoute": "Spápunkturinn er nánast á leiðinni.",
"forecastPointDistanceMeters": "Spápunkturinn er um {meters} m frá leiðinni. Veðurmatið notar þennan met.no punkt vegna þess að spáin er á hnitaneti.",
"forecastPointDistanceKilometers": "Spápunkturinn er um {kilometers} km frá leiðinni. Veðurmatið notar þennan met.no punkt vegna þess að spáin er á hnitaneti."
```

English:

```json
"forecastPointOnRoute": "The forecast point is almost on the route.",
"forecastPointDistanceMeters": "The forecast point is about {meters} m from the route. The assessment uses this met.no point because forecasts are provided on a grid.",
"forecastPointDistanceKilometers": "The forecast point is about {kilometers} km from the route. The assessment uses this met.no point because forecasts are provided on a grid."
```

Formatting:

- meters: whole number, rounded to nearest meter or nearest 10 m if preferred
- kilometers: one decimal at most, locale-aware
  - Icelandic: `1,2 km`
  - English: `1.2 km`
- Reuse `formatNum` for km if available.

### UI guidance

- Keep the coordinate lines visible for auditability.
- Place the distance sentence directly under the forecast point coordinate line.
- This should replace the vague explanatory sentence, not add another paragraph below it.
- Keep the text muted and compact; this is audit detail, not a primary warning.
- Do not make it red/yellow. Distance from forecast grid point is explanatory, not a weather danger status.

### Tests to add

Add focused helper tests:

1. Same coordinate pair returns `0`.
2. A known nearby coordinate pair returns an approximate expected meter distance.
3. `buildPointSummary` includes `forecastDistanceFromRouteM`.
4. Optional formatting helper tests:
   - `45 m` -> meter message
   - `120 m` -> meter message
   - `1250 m` -> `1,3 km` in Icelandic / `1.3 km` in English

Do not overbuild this. A small helper test is enough.

## Localhost checks for Stebbi

After Claude Code implements the forecast-point distance change:

1. Open `/auth-mvp/vedrid`.
2. Run a Ferðalagið route that shows the interactive audit map.
3. Click a route weather point.
4. In the point detail panel, check the `Punktur á leið` and `Spápunktur met.no` section.
5. Expected:
   - Coordinates still show for both route point and met.no forecast point.
   - The old generic sentence is gone:
     - `Hann getur verið örlítið frá veginum því spáin er á hnitaneti.`
   - A concrete distance sentence appears:
     - `Spápunkturinn er um 58 m frá leiðinni...`
     - or `Spápunkturinn er nánast á leiðinni.`
     - or `Spápunkturinn er um 1,2 km frá leiðinni...`
6. Click several points along the route.
7. Expected:
   - Distance changes per selected point.
   - If route and forecast point are almost identical, the UI does not show noisy tiny numbers.
8. Check mobile widths 360px, 390px and 460px.
9. Expected:
   - No horizontal overflow.
   - Coordinates and distance text wrap cleanly.
   - Map controls and point detail card remain usable.

Regression checks:

- Route map still renders.
- Point selection still works.
- `Skoða veðurspá`, `Opna á korti`, and raw met.no link still work.
- No Supabase, SQL, auth, env, billing, API key, deployment, commit, push or production behavior is touched.

## Commands Codex ran

Read-only / review-only:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-0840-todo-067-v126-claude-prerelease.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-0821-todo-067-v126-codex-v125-prerelease-review.md'`
- `git status --short`
- `rg -n "WeatherBetaBanner|TeskeidMenu|activePrefixes|/auth-mvp/vedrid|heatmapDeparturePickerTitle|heatmapDeparturePickerSubtitle|timelineSingleDepartureTitle|aboveThresholdShort|aboveThresholdWithExcess|formatNum|betaBannerBody|Byggt á gögnum|MET Norway" app\auth-mvp\vedrid components\weather components\teskeid messages\is.json messages\en.json`
- targeted snippet reads from:
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `app/auth-mvp/vedrid/VedridClient.tsx`
  - `components/teskeid/TeskeidMenu.tsx`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Select-String -Path 'Design.md' -Pattern 'mobile|navigation|header|banner|overflow|button|focus|text|app|Touch targets|User-facing' -Context 1,2 -Encoding UTF8`
- `rg -n "spáin er á hnitaneti|forecast.*grid|forecastPoint|grid|hnitaneti|Spápunktur|routePointCoord|forecastPointCoord|forecastGrid" components\weather messages\is.json messages\en.json`
- `Get-Date -Format 'yyyy-MM-dd HHmm'`

Validation commands:

- `npm run type-check` - pass
- `npm run test:run` - pass, 53 files, 1756 passed, 27 skipped, 8 todo

Codex did not change app code, SQL, env variables, Supabase, auth, deployment, commits or production. This file is a review/handoff only.

## Óvissa / þarf að staðfesta

- I did not browser-test because Stebbi runs localhost/dev server.
- I did not inspect every weather file in full; the review focused on v126 changes and the forecast-point distance area.
- Exact threshold for "nánast á leiðinni" can be tuned. Codex suggests `< 50 m` as a reasonable MVP default.
