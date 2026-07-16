# Handoff: TODO #73 - Veður við komu á áfangastað

Created: 2026-07-08 18:02  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Target: Claude Code  
TODO: #73 - Veður: veður við komu á áfangastað  
Status at handoff time: Í vinnslu

## Stebbi request

Stebbi wants Ferðaveður to show weather at the destination arrival time in the top result card above the map. This can sit near or below the existing disclaimer:

> Þetta er veðurspá og við búum á Íslandi. Fylgist vel með færðinni til öryggis, t.d. á vef Vegagerðarinnar.

Stebbi also asked for a small checkmark or slightly polished `Mættur` / arrival look so it feels useful and alive, not just dead text.

## Important workflow boundary

This is a handoff/implementation plan only. Claude Code should not edit code, run tests, commit, push, deploy, or run migrations unless Stebbi explicitly asks Claude Code to execute this TODO.

No SQL, RLS, auth, Supabase policy, deployment, route-provider, analytics, or migration work is expected for this item.

## Why this item

I picked #73 because it is weather-related, user-visible, and more contained than the route-provider/Mapbox investigation in #70. It also complements the recent #71 work: the top card already has selected-slot weather for the most demanding point, and arrival weather should follow the same selected-slot discipline.

## Current code observations

- `app/api/teskeid/weather/travel/route.ts` already fetches destination forecast in parallel with route-point forecasts and passes it into `checkTravelWeather`.
- `lib/weather/travel.ts` declares `destinationForecast?: { hours: HourPoint[] }` in `TravelWeatherInput`, with a comment saying it is reserved for future lodging use.
- `checkTravelWeather` currently does not appear to destructure or emit destination-arrival weather into `TravelPlan` or `TravelCandidate`.
- `TravelCandidate` already carries `departureIso`, `arrivalIso`, `status`, point status deltas, and `displayPoint`; this is probably the safest place to attach arrival weather so the top card changes correctly when Stebbi clicks another departure slot.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` renders the combined top card and already has `activeOutboundCandidate`.
- `messages/is.json` and `messages/en.json` already hold related strings such as `weatherDisclaimer`, `heatmapSlotArrival`, `slotDetailWeatherSummary`, `metricWind`, `metricPrecip`, and `metricTemp`.
- `Design.md` says this UI should stay mobile-first, quiet, practical, avoid card-in-card, avoid horizontal overflow, and use canonical light card/border patterns.

## Recommended implementation shape

### 1. Add a small typed arrival summary

Prefer adding a small type in `lib/weather/types.ts`, for example:

```ts
export type CandidateArrivalWeather = {
  forecastTimeIso: string
  windMs: number
  gustMs: number
  precipMmPerHour: number
  airTemperatureC?: number
  status: WeatherStatus
  reasonCode?: string
}
```

Then add `arrivalWeather?: CandidateArrivalWeather` to `TravelCandidate`.

Rationale: the arrival weather depends on the selected departure candidate because `arrivalIso` changes when the user clicks another heatmap slot. A single `travelPlan.arrivalWeather` would be too easy to make stale.

### 2. Populate it inside `checkTravelWeather`

In `lib/weather/travel.ts`:

- Destructure `destinationForecast` from input.
- Add a small helper that selects the destination forecast hour closest to `candidate.arrivalIso`, ideally within the same tolerance pattern already used for route ETA weather (`ETA_WINDOW_MS`, currently +/- 1 hour).
- Evaluate the selected destination hour with existing threshold logic, probably `evalDrivingLeg(hour.windSpeedMs, hour.windGustMs, hour.precipitationMmPerHour, trailerKind, resolved)`.
- Attach the resulting summary to outbound candidates.
- Keep return candidates out of scope for v1 unless the implementation naturally supports them with a clearly named field. The user request is destination arrival for the outbound trip.

Important: if no destination forecast or no nearby hour exists, leave `arrivalWeather` undefined. Do not manufacture values from current weather or a mismatched forecast hour.

### 3. Render a compact arrival block in the top card

In `app/auth-mvp/vedrid/FerdalagidClient.tsx`, inside the combined top card:

- Read from `activeOutboundCandidate?.arrivalWeather`.
- Display it near/below the disclaimer or immediately before it, whichever feels less crowded.
- Suggested mobile-first layout:

```text
✓ Mættur á Akranes kl. 09:36
Veður við komu kl. 10:00: Vindur 4 m/s · Úrkoma 0,2 mm/klst · Hiti 11°C
```

Copy is not final; put final strings in `messages/is.json` and `messages/en.json`.

Use a subtle surface, not a nested heavy card. For example:

- `rounded-lg`
- `border border-primary/15`
- `bg-primary/5` or another very quiet semantic/tailwind blend already used nearby
- `text-xs`
- small checkmark can be plain text or an existing icon if the app already imports an icon library in this area. Do not introduce a new icon dependency.

### 4. Copy suggestions

Icelandic:

- Label: `Mættur`
- Line: `Mættur á {destination} kl. {arrivalTime}`
- Forecast line: `Veður við komu kl. {forecastTime}: Vindur: {wind} · Úrkoma: {precipitation} · Hiti: {temperature}`
- Optional fallback if `arrivalWeather` is absent and you decide not to hide the block: `Veður við komu er ekki tiltækt fyrir þennan brottfarartíma.`

English:

- Label: `Arrived`
- Line: `Arriving in {destination} at {arrivalTime}`
- Forecast line: `Weather on arrival at {forecastTime}: Wind: {wind} · Precipitation: {precipitation} · Temperature: {temperature}`
- Fallback: `Weather on arrival is not available for this departure time.`

My preference: hide the block when `arrivalWeather` is absent in v1. That avoids clutter and false confidence.

### 5. Tests

Add focused tests in `lib/__tests__/weather-travel.test.ts`:

- A candidate gets `arrivalWeather` when `destinationForecast` has an hour near `arrivalIso`.
- `arrivalWeather.forecastTimeIso` is the selected destination forecast hour, not the departure time.
- Candidate status/reason reflects wind/gust/precip thresholds.
- `arrivalWeather` is omitted when `destinationForecast` is missing.
- `arrivalWeather` is omitted when there is no forecast hour near arrival.
- In window mode, two outbound candidates with different arrivals can receive different arrival weather values.

If there are component tests for `FerdalagidClient` or practical UI tests nearby, add one only if the existing test setup makes it cheap. Otherwise keep this to deterministic tests plus manual localhost checks.

## Files likely to inspect

- `Design.md`
- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `lib/__tests__/weather-travel.test.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`
- Possibly `components/weather/DepartureHeatmap.tsx` only for formatting/status pattern reference.

## Files likely to change

- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `lib/__tests__/weather-travel.test.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`

## Out of scope

- Do not change Google Routes/Mapbox/provider behavior.
- Do not change route sampling.
- Do not change weather thresholds except using existing resolved thresholds to classify arrival weather.
- Do not add SQL, migrations, Supabase tables, RLS, auth, admin analytics, or persisted arrival forecast storage.
- Do not reopen lodging/stay logic. Existing skipped lodging tests can be read for context only.
- Do not create a large new design surface or another big card under the top card.

## Edge cases to handle

- `destinationForecast` fetch fails but route-point forecasts succeed: no arrival block, no crash.
- Forecast coverage ends before `arrivalIso`: no arrival block, no fake value.
- User clicks another departure slot: arrival block should update from `activeOutboundCandidate`, not stay on the first candidate.
- `arrivalIso` is between forecast hours: choose nearest hour within the accepted tolerance and show its `forecastTimeIso`.
- Vestmannaeyjar/ferry flow: current travel API route may use the ferry port as effective destination. Do not label ferry-port weather as final island weather unless that is actually what the data represents. Prefer `effectiveDestinationName` / actual route destination naming already used in the result UI.
- No-data outbound candidate: arrival weather may still exist, but be careful. If showing it would confuse "not enough data to assess route" with "arrival weather exists", hide it or make the copy explicitly arrival-only.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid` on localhost while signed in.
2. Calculate a normal route, for example Garðabær -> Akranes.
3. Expected: the top card above the map shows a compact `Mættur` / arrival-weather block with destination name, arrival time, forecast time, wind, precipitation, and temperature.
4. Click another departure slot in the heatmap.
5. Expected: arrival time and arrival weather update with the selected slot.
6. Pick a route/slot where route weather is yellow but arrival weather is calm if possible.
7. Expected: the arrival block does not override or soften the main route assessment; it only answers what the destination weather looks like on arrival.
8. Test a long route where forecast coverage may be near the limit.
9. Expected: if arrival forecast is unavailable, the UI does not crash and does not show made-up arrival values.
10. Test mobile widths 360, 390, and 460 px.
11. Expected: no horizontal overflow, no overlap, no nested-card heaviness, and the disclaimer/link to Vegagerðin remains visible and usable.

No Supabase, auth, RLS, secrets, production data, billing, deployment, or migration checks are required for this TODO.

## Questions for Codex review after Claude implementation

- Is `arrivalWeather` candidate-scoped, so selected-slot changes cannot show stale weather?
- Does missing destination forecast fail closed without false confidence?
- Are all new user-visible strings in `messages/is.json` and `messages/en.json`?
- Does the UI follow `Design.md`: mobile-first, compact, no card-in-card, no overflow?
- Are tests focused on deterministic data behavior rather than brittle presentation details?

## Óvissa / þarf að staðfesta

- I have not run the app or tests for this handoff.
- I assume `destinationForecast` contains the met.no forecast for the effective route destination, because `app/api/teskeid/weather/travel/route.ts` fetches `fetchForecast(destCandidate.lat, destCandidate.lon)`.
- I assume attaching arrival weather to outbound `TravelCandidate` is acceptable for the current response payload size. It is small, but Claude Code should sanity-check that candidate arrays do not become noisy.
- Copy for `Mættur` may need Stebbi taste-check; implement with messages so it is easy to adjust.
