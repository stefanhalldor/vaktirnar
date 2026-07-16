# TODO 086 v132 - Codex addendum: Veðurstofan must enter scrubber, worst point, and selected point

Created: 2026-07-14 06:54
Timezone: Atlantic/Reykjavik
Agent: Codex
Builds on: `2026-07-14-0652-todo-086-v131-codex-v130-prerelease-review.md`
User evidence: Stebbi screenshot after v130 showing only Veðurstofan selected, but Veðurstofan values are not reflected in the scrubber, worst point, or selected point model.

## Bottom line

Do not send v131 alone as the final instruction. This v132 addendum sharpens the main issue:

> Veðurstofan data must become part of the same active point/candidate model that feeds the scrubber, worst point, selected point, map, and all-points list.

The current v130/v131 state is closer to an overlay:

- Veðurstofan station cards appear.
- Veðurstofan station markers appear.
- The summary can show a Veðurstofan worst-station branch.

But Veðurstofan values are still not first-class inputs to:

- the departure scrubber,
- the "worst point" / decisive point model,
- selected point details,
- route point selection state,
- provider-aware assessment candidates.

That is why Stebbi sees the flow as "near right, but not there".

## Product requirement

When the provider selection is:

### `met.no` only

Use current MET/Yr route-point model:

- scrubber = MET/Yr candidates,
- worst point = MET/Yr route point,
- selected point = MET/Yr point,
- map = MET/Yr points,
- all-points = MET/Yr section.

### `Veðurstofan` only

Use Veðurstofan station model:

- scrubber = Veðurstofan-derived candidate/status data,
- worst point = Veðurstofan station + decisive forecast row,
- selected point = selected Veðurstofan station,
- map = Veðurstofan station points only,
- all-points = Veðurstofan section only.

No MET/Yr values, labels, hidden candidates, best windows, or selected point state should remain in the active assessment when `met.no` is off.

### Both selected

For now, safest semantics:

- MET/Yr remains baseline assessment if Claude Code does not implement combined provider candidates yet.
- Veðurstofan appears as a clearly marked comparison/validation layer.
- Do not silently blend or max providers.

Eventually we can build explicit combined-provider assessment, but it needs provenance and conflict rules.

### No provider selected

Do not show any weather assessment. Show a small empty/provider-required state, or prevent disabling the last provider.

## Implementation direction

The next patch should not be another isolated branch inside the current summary card. It should introduce a normalized active provider assessment shape.

Suggested model:

```ts
type WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'

type ProviderForecastRow = {
  timeIso: string
  windSpeedMs: number | null
  precipitationMmPerHour: number | null
  temperatureC: number | null
  windDirectionText?: string | null
  weatherText?: string | null
  provider: WeatherProviderKey
}

type ActiveWeatherPoint = {
  id: string
  provider: WeatherProviderKey
  label: string
  lat: number
  lon: number
  distanceFromRouteM: number | null
  distanceFromOriginM: number | null
  routeFraction: number | null
  sourceUrl?: string | null
  forecastRows: ProviderForecastRow[]
  provenance?: {
    forecastGeneratedAtIso?: string | null
    fetchedAtIso?: string | null
    expiresAtIso?: string | null
  }
}

type ActiveProviderCandidate = {
  providerMode: 'metno' | 'vedurstofan' | 'mixed'
  departureIso: string
  arrivalIso?: string
  status: WeatherStatus
  displayPoint: {
    pointId: string
    provider: WeatherProviderKey
    label: string
    etaIso: string | null
    forecastTimeIso: string | null
    windMs: number | null
    precipitationMmPerHour: number | null
    temperatureC: number | null
  } | null
  pointStatuses: Array<{
    pointId: string
    provider: WeatherProviderKey
    status: WeatherStatus | 'no_data'
  }>
}
```

Do not overbuild this in one go if it becomes large. But the UI needs one active model that can be fed by either MET/Yr or Veðurstofan.

## Minimum viable Veðurstofan-only candidate

For the current prerelease, Claude Code can implement a smaller version:

1. Keep one reference departure time.
   - In fixed/now route mode, use current selected/default departure.
   - In window mode, if Veðurstofan slot optimization is not ready, do not claim "Teskeið has found best departure slots"; instead show "Miðað við valinn brottfarartíma".

2. For every Veðurstofan station near the route:
   - estimate ETA using `routeFraction`,
   - find forecast row nearest that ETA,
   - classify wind using the same thresholds,
   - store station + row + ETA + status.

3. The Veðurstofan-only "worst point" should be:
   - station with worst status / highest wind at ETA-nearest row,
   - not max wind across all rows,
   - not MET/Yr display point.

4. The selected point should be:
   - the selected Veðurstofan station if user taps a station marker/card,
   - otherwise the worst Veðurstofan station.

5. The scrubber:
   - If Claude Code cannot implement full Veðurstofan departure-slot coloring yet, hide the scrubber and explicitly say Veðurstofan-only mode is showing the route at the selected/reference departure time.
   - Do not leave the MET/Yr scrubber semantics in place.
   - If implementing a simple Veðurstofan scrubber, derive each hour slot from Veðurstofan station ETA-nearest rows and classify the worst station per slot.

## What must disappear when `met.no` is unchecked

In Veðurstofan-only mode, the UI must not show:

- `Yr`
- `Hrá met.no gögn`
- `Punktur 26/72`
- MET/Yr route point counts
- MET/Yr selected point details
- MET/Yr "best departure" or "Teskeið hefur metið brottfarartíma" copy unless that calculation is actually provider-aware
- MET/Yr coverage text that implies the active assessment is from MET/Yr candidates

## What should appear in Veðurstofan-only mode

The summary should show:

- provider badge: `Veðurstofan (í prófun)`
- station name, e.g. `Sandskeið`
- station id
- distance from route and/or distance along route
- estimated ETA at station
- forecast row time used, e.g. `spá kl. 06:00`
- wind, precipitation, temperature, weather text from that decisive row
- provenance:
  - `Spá frá kl. HH:MM`
  - `Sótt kl. HH:MM`

The all-points station cards can still list all rows, but the summary and selected point must show the exact decisive row used.

## Suggested user-facing copy semantics

Use safer wording until full provider-native slot optimization exists:

- `Veðurstofan (í prófun)`
- `Miðað við valinn brottfarartíma`
- `Mest krefjandi Veðurstofustöð við leiðina`
- `Spágildi næst áætluðum komutíma við stöðina`

Avoid:

- `Teskeið hefur metið brottfarartíma...` in Veðurstofan-only mode unless the scrubber/candidate calculation is actually provider-native.

## Localhost checks for Stebbi

Preconditions:
- Stebbi runs localhost himself.
- `elta-vedrid` access is enabled.
- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- Veðurstofan product table has been warmed.
- No migrations, Supabase changes, production cron, deploy, push or commit for these checks unless Stebbi gives explicit separate approval.

After Claude Code patches this:

1. Open the same route as in the latest screenshot.
2. Select only `Veðurstofan`.
   - Map shows only Veðurstofan station markers.
   - Scrubber is either Veðurstofan-derived or hidden with clear reference-time copy.
   - Worst point is a Veðurstofan station, not a MET/Yr point.
   - Selected point details are Veðurstofan station details.
   - No MET/Yr labels, raw links, point counts, or hidden best-window wording remains.
3. Confirm Sandskeið:
   - If Sandskeið is the worst station at ETA-nearest row, it appears in summary/worst point.
   - Summary shows the forecast row time used and the estimated station ETA.
4. Toggle `met.no` back on.
   - MET/Yr points and UI return.
   - Veðurstofan remains clearly marked as comparison/testing unless a true combined mode has been implemented.
5. Toggle both providers off if allowed.
   - No assessment remains visible.
   - UI asks for a provider or prevents the action.
6. Mobile check at 360, 390, 460 px:
   - station summary wraps cleanly,
   - no horizontal overflow,
   - toggles remain tappable.

## Recommended message to Claude Code

Send Claude Code v131 plus this v132 addendum. The actionable instruction is:

> Please do not only patch text. Make Veðurstofan a first-class active provider model for Veðurstofan-only mode, at minimum for worst point and selected point, and either implement a Veðurstofan-derived scrubber or hide the scrubber with honest reference-time copy. Remove all MET/Yr-derived assessment artifacts when `met.no` is unchecked.

## Óvissa / þarf að staðfesta

- I did not re-run code inspection after Stebbi's latest screenshot beyond reading v131. This addendum is based on the user-visible behavior and the prior v130 review.
- The exact size of the implementation may be larger than one small patch if Claude Code chooses to build a fully generic provider model immediately. A small interim is acceptable if it is honest in the UI.
