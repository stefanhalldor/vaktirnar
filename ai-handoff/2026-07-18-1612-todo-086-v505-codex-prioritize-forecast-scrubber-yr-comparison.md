# 2026-07-18 16:12 - TODO 086 v505 - Codex handoff: prioritize forecast scrubber and Yr comparison

Created: 2026-07-18 16:12  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Mode: planning / implementation handoff only, no product code changes

## Stutt Mannamál

Já, við vorum búin að setja þetta aftarlega:

- 3-klst spátíma-scrubber fyrir Veðurstofuspár á kortinu.
- Litun á Veðurstofustöðvum eftir völdum spátíma, ekki bara "núna".
- Yr/met.no spá á sömu hnitum og Veðurstofustöðvar til samanburðar.
- Möguleg samanburðarviðmót eins og `Varfærnasta matið`, `Mildara matið` eða `Samanburður`.

Miðað við hvað `/vedrid` er orðin miðlæg síða núna myndi ég færa **scrubberinn mjög framarlega, helst sem næsta pre-release skref**. Yr-samanburðurinn á líka að færast upp, en hann má ekki kalla í met.no fyrir allar 280 Veðurstofustöðvar sjálfkrafa. Hann þarf lazy/cache nálgun.

## Why This Moves Up Now

Núverandi `/vedrid` overview er orðið nógu gott til að fólk geti notað það sem stöðukort. En Veðurstofan er spá, ekki bara punktalisti. Ef kortið getur hoppað milli 3-klst spátíma verður það miklu gagnlegra áður en notandi reiknar ferðalag.

Þetta er líka góð leið til að gera `/vedrid` og `/vedrid/ferdalagid` meira unified:

- `/vedrid` = yfirlit yfir landið og spátíma.
- `/vedrid/ferdalagid` = sama veðurmat sett niður á leið og brottfarartíma.

## Current Code Observations

Relevant files already in play:

- `components/weather/WeatherOverviewClient.tsx`
  - Builds `/vedrid` provider layers.
  - Uses `classifyNowAnchoredForecastWindDisplayStatus(s.forecasts, thresholds)` for Veðurstofan marker colors.
  - Uses `classifyObservationWindDisplayStatus({ meanWindMs }, thresholds)` for Vegagerðin current markers.
  - Already uses shared `WeatherThresholdBar` and `WindStatusFilterPills`.

- `lib/weather/windDisplayStatus.ts`
  - `classifyNowAnchoredForecastWindDisplayStatus()` currently anchors to `Date.now()`.
  - This should become a wrapper around a new reusable helper that accepts an explicit anchor time.

- `components/weather/DepartureHeatmap.tsx`
  - Already has the right visual DNA for a time scrubber: day grouping, compact dots, status colors, horizontal scroll.
  - Do not copy-paste the whole thing into overview. Extract/reuse the relevant primitive if the current component is too trip-candidate-specific.

- `components/weather/WindStatusFilterPills.tsx`
  - Already the shared filter-pillu component. Keep using it.

- `ai-handoff/2026-07-16-2224-todo-086-v368-codex-v367-route-selection-provider-layers-review.md`
  - First clear note that threshold coloring + time scrubber should come after provider station layer.
  - Also defines Yr-at-station comparison idea.

- `ai-handoff/2026-07-17-0619-todo-086-v381-codex-route-geometry-and-overview-phases.md`
  - Put this as Phase D. That ordering should now be updated.

- `ai-handoff/2026-07-18-1145-todo-086-v487-codex-vedrid-ferdalagid-map-parity-thresholds.md`
  - Defines the principle that `/vedrid` and `/ferdalagid` must share the same status taxonomy, colors, threshold logic, and filter pills.

## Updated Priority Order

### P0 - Do Not Start Another Side Quest

Before release polish, avoid adding new unrelated surfaces. The next visible leap should be the forecast-time scrubber on `/vedrid`.

Keep these separate:

- Vegagerðin cache/history/cron reliability from v504/v503.
- Favorites for stations.
- Route interest heatmap.
- Campsites/rivers/golf/hiking layers.
- Vík/Reynisfjall section-model cleanup.

Those still matter, but they should not displace the scrubber unless current data is broken enough to block testing.

### P1 - Immediate: 3-Hour Forecast Scrubber On `/vedrid`

Goal:

Let the user move the overview map through Veðurstofan forecast time in 3-hour steps. Marker colors, status counts, status pills, and selected station forecast preview must all reflect the selected forecast time.

Behavior:

1. Derive available forecast slots from loaded Veðurstofan station forecasts.
2. Show a compact horizontal scrubber in the same spirit as `/ferdalagid`.
3. Step size is 3 hours because Veðurstofan forecast rows are 3-hour slots.
4. Default selected slot should be the latest forecast valid time at or before now.
   - If no past/current slot exists, use the first future slot.
   - Iceland time is UTC, but still use existing formatting helpers so labels stay consistent.
5. Moving the scrubber must not refetch Google routes or reload the map.
6. Moving the scrubber should only recalculate local station status from already-loaded forecast rows.

Recommended placement:

- Keep provider toggles and threshold controls above the map.
- Put the scrubber close to the map and status filters, using the same visual rhythm as `/ferdalagid`.
- Suggested order:
  - provider pills
  - threshold controls
  - conditions drawer
  - map
  - `WindStatusFilterPills`
  - forecast-time scrubber
  - selected station detail

If the UI feels better with scrubber above the map, that is acceptable, but test mobile carefully. The key is that it controls the map and is not hidden inside a drawer.

### P2 - Refactor The Classifier, Do Not Fork Logic

Add a reusable helper in `lib/weather/windDisplayStatus.ts`, for example:

```ts
export function classifyForecastWindDisplayStatusAt(
  forecasts: ReadonlyArray<{ ftimeIso: string; windSpeedMs: number | null }>,
  thresholds: ResolvedTravelThresholds,
  anchorTimeIso: string | Date | number,
): WindDisplayStatus
```

Then make:

```ts
classifyNowAnchoredForecastWindDisplayStatus(...)
```

a tiny wrapper around the new helper.

This keeps existing tests and consumers safe while letting `/vedrid` pass the selected scrubber time.

Acceptance:

- No new status taxonomy.
- No overview-only pill component.
- No separate marker-color mapping.
- `WIND_STATUS_MARKER_COLOR`, `WIND_STATUS_META`, `WindStatusFilterPills`, and `WeatherThresholdBar` remain the shared core.

### P3 - Selected Station Preview Should Follow The Selected Time

When a Veðurstofan station is selected on `/vedrid`, the preview should not always show only the first/current rows.

Recommended display:

- Show `Spá gefin út kl. HH:mm`.
- Show forecast rows around selected scrubber time:
  - two slots back when available
  - selected/current slot
  - two slots forward when available
- Highlight or mark the row used for the map status.
- Keep `Sjá öll spágildi` for the full list if it already exists.

This matches Stebbi's earlier example: at 09:43, show roughly 06:00, 09:00, 12:00, 15:00.

### P4 - Vegagerðin Must Not Time-Travel Yet

Vegagerðin is current observations, not forecast. The scrubber should not pretend Vegagerðin has future values.

Behavior when Vegagerðin is visible:

- Vegagerðin markers stay based on current measurements and user thresholds.
- Veðurstofan markers change with the selected forecast time.
- Status counts should be clear and not misleading:
  - Either aggregate current Vegagerðin + selected-time Veðurstofan, or
  - show a small text such as `Vegagerðin sýnir núverandi mælingar` if needed.

Do not make Vegagerðin affect departure scrubber, trip risk, worst point, or future route forecast in this phase.

### P5 - Yr/Met.no At Veðurstofan Station Coordinates

Move this up, but treat it as the next step after the scrubber unless Claude Code can implement it safely without broadening risk.

Goal:

For a Veðurstofan station, compare:

- Veðurstofan forecast at the station.
- Yr/met.no forecast at the exact same station coordinates.

Cost guardrails:

- Do not fetch Yr for all 280 Veðurstofan stations on page load.
- Do not fetch Yr for hidden providers.
- Prefer lazy fetch when a station is selected.
- If route-scoped later, cap and cache.
- Reuse existing met.no cache layer if available.
- Add a cache key based on rounded lat/lon + forecast time/window if needed.

Initial UI:

- On selected station detail, show comparison rows only for the selected time window.
- Label clearly:
  - `Veðurstofan`
  - `Yr`
- Keep it framed as comparison, not truth.

Possible product modes later:

- `Varfærnasta matið` - safest default, use worst/highest-risk status across providers.
- `Samanburður` - show both side by side.
- `Mildara matið` - optional lens, not recommendation.

Avoid using `Jákvæðasta spáin` as a default safety mode. It can be playful copy later, but the main decision support should stay conservative.

### P6 - Later, Bring The Same Time Model Into Route Selection

After `/vedrid` overview has a stable forecast-time scrubber:

- route-selection provider markers can use the same selected time concept
- `/ferdalagid` can keep its departure-driven scrubber
- both should share the same lower-level `ForecastTimeScrubber` or slot primitives where practical

Do not destabilize the existing trip calculation to finish the overview scrubber.

## Implementation Handoff For Claude Code

```text
Workflow

Lestu og rýndu fyrst með gagnrýnum augum:
ai-handoff/2026-07-18-1612-todo-086-v505-codex-prioritize-forecast-scrubber-yr-comparison.md

Markmið næsta skrefs:
Færa 3-klst Veðurstofu forecast-time scrubber framar og útfæra hann á /vedrid áður en við förum í fleiri hliðarlög. Þetta á að gera /vedrid miklu gagnlegra fyrir útgáfu.

Ef þú sérð blocking spurningar, stoppaðu og skilaðu handoff/review.
Ef ekkert blokkerar, framkvæmdu eins stórt öruggt skref og þú treystir þér til, en haltu scope-inu við P1-P3 hér að ofan.

Framkvæmdarkröfur:
1. Bættu við reusable forecast-time classifier í lib/weather/windDisplayStatus.ts sem tekur explicit anchor time.
2. Haltu classifyNowAnchoredForecastWindDisplayStatus sem wrapper svo eldri consumerar brotni ekki.
3. Bættu við compact reusable ForecastTimeScrubber eða extract-aðu relevant primitive úr DepartureHeatmap ef það er raunverulega reusable.
4. Settu scrubber á /vedrid þannig að Veðurstofan marker colors, marker labels, status counts og WindStatusFilterPills miðist við selected forecast time.
5. Uppfærðu selected Veðurstofan station preview þannig að rows fylgi selected time og sýni helst tvö til baka og tvö áfram þegar þau eru til.
6. Vegagerðin á áfram að sýna núverandi mælingar og má ekki time-travel-a.
7. Ekki bæta Yr/met.no samanburði í sama skref nema þú sért viss um að hann verði lazy/cached og ekki fetchi fyrir allar stöðvar.
8. Ekki búa til nýtt overview-only status/pillu/marker-color kerfi. Nota sameiginlega WindDisplayStatus, WindStatusFilterPills, WeatherThresholdBar og marker metadata.
9. Allur nýr notendatexti fer í messages/is.json og messages/en.json.
10. Ekki commit-a, ekki push-a, ekki deploy-a og ekki keyra SQL.

Próf:
- npm run type-check
- viðeigandi targeted tests, sérstaklega windDisplayStatus tests og WeatherOverviewClient/provider overview tests ef þau eru til
- bættu við unit tests fyrir explicit forecast-anchor classifier og slot selection ef það er lítið og afmarkað

Eftir framkvæmd skaltu strax skila handoff með:
- hvað var gert
- hvaða skrár breyttust
- hvaða próf voru keyrð og exit codes
- hvað var sleppt
- Localhost checks for Stebbi
```

## Acceptance Criteria

1. `/vedrid` has a visible 3-hour forecast-time scrubber when Veðurstofan forecasts are loaded.
2. Scrubber defaults to the most relevant current forecast slot.
3. Moving scrubber changes Veðurstofan marker colors without refetching route data.
4. Status filter pills update counts/statuses for the selected forecast time.
5. Selected Veðurstofan station detail shows rows around the selected time and clearly marks what the map is using.
6. Vegagerðin current marker behavior does not change with the scrubber.
7. No new one-off status UI is created.
8. Mobile width 360/390/460 px has no horizontal overflow.
9. Loading/empty states do not create layout shift.
10. No SQL, env, deploy, push, or production change happens in this phase.

## Localhost Checks For Stebbi

After Claude Code implements this phase:

1. Open `http://localhost:3004/vedrid` as public.
2. Confirm `Veðurstofan (spá)` is visible and selected.
3. Confirm a compact 3-hour forecast-time scrubber appears near the map/status pills.
4. Move the scrubber forward and backward.
5. Expected:
   - Veðurstofan marker colors change when wind status changes at the selected time.
   - Status pills under the map update counts.
   - Filtering by `Nálgast óþægindi`, `Óþægilegt`, etc. still filters the visible map points.
6. Click a Veðurstofan station.
7. Expected:
   - station preview shows forecast rows around the selected scrubber time.
   - selected/used row is obvious.
   - dates/times use Icelandic formatting and do not overflow.
8. Toggle Vegagerðin on/off.
9. Expected:
   - Vegagerðin markers remain current-observation based.
   - moving the forecast scrubber does not make Vegagerðin values/time labels change.
10. Open `http://localhost:3004/vedrid/ferdalagid`.
11. Confirm the existing trip/departure scrubber still behaves as before.
12. Test mobile widths 360, 390, and 460 px.
13. Watch for:
   - no horizontal overflow
   - no controls jumping in size
   - no dead navigation/button state
   - no map reload or route recalculation just because the scrubber moved

## Updated Later List

Keep these behind the scrubber phase:

1. Yr/met.no comparison at Veðurstofan station coordinates, lazy/cached.
2. Conservative comparison mode: `Varfærnasta matið`.
3. Route-selection station layer using the same selected forecast-time model.
4. Vegagerðin cache/history/3-minute cron reliability, unless it blocks current testing.
5. Route cache and Teskeið interest heatmap.
6. Favorite Veðurstofan/Vegagerðin stations for authenticated users.
7. Better route section model around Vík/Reynisfjall/Vatnsskarðshólar/Mýrdalssandur.
8. Optional public-interest layers: campsites, rivers, golf, hiking.

## Notes For Codex Review After Claude

Review especially:

- Did Claude avoid a second status system?
- Does the new classifier have deterministic tests?
- Does scrubber movement avoid network calls?
- Are Vegagerðin current observations clearly separate from Veðurstofan forecast time?
- Are all new strings in `messages/is.json` and `messages/en.json`?
- Does mobile still feel like an app, per `Design.md`?

