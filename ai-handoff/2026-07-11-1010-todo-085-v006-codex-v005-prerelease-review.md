# TODO 085 - Codex review of Claude v005 prerelease

Created: 2026-07-11 10:10
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Prerelease review
Reviewed handoff: `2026-07-11-1010-todo-085-v005-claude-v004-prerelease.md`

## Findings

### P0 - Hidden neutral gust threshold is rejected by the API, so weather calculation can fail

`app/auth-mvp/vedrid/FerdalagidClient.tsx:397-425` now always submits:

- `redGustMs = 100`
- `cautionPrecipMmPerHour = 100`

But `app/api/teskeid/weather/travel/route.ts:32-44` validates:

- `redGustMs` max `50`
- `cautionPrecipMmPerHour` max `20`

This explains Stebbi's localhost screenshot where pressing `Reikna ferðina` lands on the result step with `Ógilt gildi í veðurmörkum.` The client sends the hidden values, the API rejects them as `thresholds_invalid`, and `FerdalagidClient.tsx:331-385` has already moved to `result`, leaving a mostly empty result screen with only `Til baka` and the error.

Required fix before release:

- Either raise the API validation max for these hidden neutral values to match the chosen neutral constants, preferably via shared constants, or stop sending `100` and introduce a safer server-side way to ignore gust/precip in this phase.
- My recommendation for this phase: create shared constants like `NEUTRAL_GUST_THRESHOLD_MS = 100` and `NEUTRAL_PRECIP_THRESHOLD_MM_PER_HOUR = 100`, use them in both client and API validation, and add a test that `thresholdOverrides: { redGustMs: 100, cautionPrecipMmPerHour: 100 }` is accepted.
- Also improve the failure UX: if the API still returns `thresholds_invalid`, return the user to the threshold step or keep them there with field-level error. Do not show an empty result shell.

### P1 - Weather threshold fields must be empty by default and required

Stebbi clarified after v005: the two wind threshold fields should be blank by default, and the user must fill both.

Current behavior pre-fills defaults in `app/auth-mvp/vedrid/FerdalagidClient.tsx:149-155`:

```ts
const effective = resolveThresholds('none', thresholdOverrides)
setDraftCautionWind(String(effective.cautionWindMs))
setDraftRedWind(String(effective.redWindMs))
```

Required fix:

- On first entry to `Veðurmörk`, show both inputs empty.
- Require both values before submit.
- Use a clear validation message if either is empty.
- Do not show `15/25` in the step nav before the user has explicitly submitted thresholds. Use something like `Veldu mörk` / `Choose limits`.
- If the user goes back after a successful calculation, preserve their explicit submitted values.
- If we keep a "reset/default" affordance, it should be an explicit action like `Nota tillögu 15/25`, not silent prefill.

### P1 - Visible gust values still appear in multiple UI surfaces

The task direction is that gusts are not configurable and should not be used/displayed as measured decision values in this phase. It is fine to warn users to check gusts at Vegagerðin, but v005 still displays actual gust values in several user-facing places:

- Arrival card: `app/auth-mvp/vedrid/FerdalagidClient.tsx:982-983`
- Origin/destination comparison strip: `app/auth-mvp/vedrid/FerdalagidClient.tsx:1047-1077`
- Detailed comparison drawer: `app/auth-mvp/vedrid/FerdalagidClient.tsx:1316-1341`
- Forecast point details: `app/auth-mvp/vedrid/FerdalagidClient.tsx:1742-1761`
- Audit map point summary: `components/weather/TravelAuditMap.tsx:719-720`
- Departure heatmap fallback can still choose/display gust as decisive metric: `components/weather/DepartureHeatmap.tsx:371-393`

Required fix:

- Remove displayed gust metrics from the main result, arrival destination block, comparison strip/drawer, audit map, and route point rows for this phase.
- Keep wind, precipitation, and temperature.
- Keep a warning/disclaimer about checking gusts and road conditions at Vegagerðin, but do not show "Hviður: X m/s" values unless we explicitly re-enable gust support later.
- Ensure no route point or candidate can label gust as the "mest krefjandi" metric while gusts are neutralized.

### P2 - Threshold summary still mentions hidden gust/precip values in shared components

`components/weather/DepartureHeatmap.tsx:124-135` still formats `thresholdSummaryLine` with `gust` and `precip`, and messages still have:

- `messages/is.json:823-825`
- `messages/en.json:819-821`

If that summary is visible anywhere in this flow, it will leak the hidden `100/100` implementation detail or keep explaining disabled controls.

Required fix:

- For the travel-weather flow in this phase, threshold summary should only show wind thresholds.
- If other products still need the old copy, split the message keys or make the component accept a `thresholdSummaryMode="wind-only"` prop.

### P2 - Fine-grained five-status labels are only partially applied

The "Á leiðinni" summary now uses `classifyWindDistance()`, but filter chips/detail labels still mostly use the coarse internal statuses:

- `DepartureHeatmap.tsx:143-145` only maps `graent/gult/rautt`
- `TravelAuditMap.tsx:495-497` only maps `graent/gult/rautt`
- `RoutePointRow` still maps `gult` to `Óþægilegt` and `rautt` to `Hættulegt` at `FerdalagidClient.tsx:1703-1706`

This may be acceptable as a small phase if Stebbi agrees, but it is not the full "system" label change requested. If the UI now has labels like `Nálgast óþægindi` and `Nálgast hættumörk`, they should ideally be available wherever a selected point/slot is explained, not only in one summary row.

Suggestion:

- For this release, at minimum ensure the selected slot and point detail cards use the fine-grained label.
- Leave aggregate filter chips as coarse if splitting counts is too much, but document that explicitly.

## What Looks Good

- Removing the `Eftirvagn` step from the wizard shape is directionally right.
- `classifyWindDistance()` is small, pure, and has useful boundary tests.
- Keeping internal `WeatherStatus = graent | gult | rautt` unchanged is sensible for now.
- Accessibility direction with text + icon + color is good, but should not rely on color alone.

## Tests Run

- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- lib/__tests__/weather-wind-distance.test.ts`
  - Exit code: 0
  - 1 file passed, 9 tests passed
- `npm run test:run`
  - Exit code: 0
  - 69 files passed
  - 2129 tests passed, 27 skipped, 8 todo
  - Console included existing JSDOM noise: `Not implemented: navigation to another Document`

## Recommended Next Step

Do not release v005 as-is.

Please patch #85 before continuing refactor work:

1. Fix the neutral hidden threshold API/client mismatch.
2. Make the two visible wind threshold inputs empty by default and required.
3. Remove visible gust values from the UI while keeping the Vegagerðin warning copy.
4. Re-run `npm run type-check` and `npm run test:run`.
5. Return a new prerelease handoff for Codex review.

## Localhost Checks For Stebbi

After Claude patches this:

1. Open `/vedrid` on localhost in mobile width.
2. Select origin and destination.
3. Confirm `Veðurmörk` shows two empty inputs, not `15` and `25`.
4. Press `Reikna ferðina` with both empty.
   - Expected: stays on `Veðurmörk` and shows a clear required-fields message.
5. Fill only one field and press `Reikna ferðina`.
   - Expected: stays on `Veðurmörk` and asks for the missing value.
6. Fill both fields with valid ordered values, e.g. `15` and `25`, and submit.
   - Expected: result calculates successfully. No `Ógilt gildi í veðurmörkum`.
7. Scan result, arrival block, `Allir spápunktarnir`, map/audit detail, and weather comparison.
   - Expected: no actual gust value like `Hviður: 12 m/s` or `hvið. 12`.
   - Expected: warning/disclaimer still tells user to check gusts and road conditions at Vegagerðin.
8. Test edge labels by choosing thresholds close to the observed wind.
   - Expected: `Innan marka`, `Nálgast óþægindi`, `Óþægilegt`, `Nálgast hættumörk`, and `Hættulegt` can be produced where applicable.

No Supabase, SQL, RLS, auth, billing, secrets, or production data changes are required for this patch.
