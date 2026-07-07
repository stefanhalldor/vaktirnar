# TODO 067 - Ferdalagid result clarity review

Created: 2026-07-05 23:32  
Timezone: Atlantic/Reykjavik

## Context

Stebbi tested the Ferðalagið flow on localhost after Google Places started working.
The flow technically returns a result, but the result card is not good enough for
real user confidence.

Example observed:

- Route: Akranes -> Apavatn
- Status label: "Meðgótt"
- Main answer: "Gæta þarf á ferðinni Akranes -> Apavatn (99 km, um 1.4 klst.)."
- Details:
  - "Brottferð - vindur: 5.8 m/s (hviður: 5.8 m/s), úrkoma: 7.6 mm/klst"

Stebbi's concerns are valid:

- "Meðgótt" is not natural Icelandic and should not ship.
- The user cannot tell whether 5.8 m/s is at origin, destination, one route point,
  the highest value on the route, or a generic average.
- The user cannot tell where or when the 7.6 mm/hour precipitation happens.
- The card does not say clearly whether the assessment is based on leaving now or
  on the selected departure time.
- Orange/yellow without a clear cause feels arbitrary.

## Findings

### 1. Result status text is poor

`messages/is.json` contains:

```json
"statusGult": "Meðgótt"
```

This should be replaced. Recommended labels for the travel flow:

- Green: "Gott ferðaveður"
- Yellow: "Varúð"
- Red: "Ekki mælt með ferð"

If the same status keys are reused by old Grill/Golf/chat surfaces, either verify
those surfaces are fully hidden or introduce travel-specific labels under
`teskeid.vedrid.ferdalagid`.

### 2. The current deterministic result loses the source of worst weather values

`lib/weather/travel.ts` currently aggregates worst conditions like this:

- max wind across all sampled route points and all forecast hours in the leg
- max gust across all sampled route points and all forecast hours in the leg
- max precipitation across all sampled route points and all forecast hours in the leg

But `worstConditions()` only returns numeric maxima:

```ts
type LegConditions = {
  worstWindMs: number
  worstGustMs: number
  worstPrecipMmPerHour: number
  hasData: boolean
}
```

It does not retain:

- which route point produced the value
- when the forecast point happens
- whether the value belongs to outbound, stay, or return
- distance from origin / approximate route position
- coordinates for showing the point on a map

So the UI cannot honestly answer Stebbi's questions without enriching the data
model.

### 3. "Af hverju?" is technically true but not product-ready

Current facts are written as raw aggregate data:

```txt
Brottferð - vindur: 5.8 m/s (hviður: 5.8 m/s), úrkoma: 7.6 mm/klst
```

For a travel user, this needs to be reframed as a decision explanation:

- "Miðað við brottför kl. 15:30 og áætlaða komu kl. 16:55..."
- "Versta gildið á útleið er úrkoma 7.6 mm/klst..."
- "...um kl. 16:00..."
- "...á leiðarpunkti um 62 km frá Akranesi / nálægt miðri leið."

If there is no reverse geocoding yet, do not invent place names. Use distance
from origin and optionally show coordinates in the expanded technical details.

### 4. Result map should explain the route, not only confirm places

The earlier map confirmation solves place ambiguity, but the final result needs
a route-oriented visual:

- route line from origin to destination
- origin and destination markers
- marker for the worst weather point, if available
- optional badge/caption: "Mesta úrkoman á útleið" or "Mesti vindur á heimleið"

For MVP, a Google Static Map is enough if it can show route path + markers. An
interactive map is nicer but not required for this fix.

## Recommended implementation plan

### A. Fix copy immediately

Replace "Meðgótt" with "Varúð" at minimum. Prefer travel-specific labels so old
surfaces do not constrain this UX.

Also change the main yellow answer from:

```txt
Gæta þarf á ferðinni Akranes -> Apavatn (99 km, um 1.4 klst.).
```

to something closer to:

```txt
Varúð á þessari leið. Miðað við brottför kl. HH:mm er mesta athyglin úrkoma á útleið.
```

Use reason-specific copy:

- `precipitation`: "mesta athyglin er úrkoma á útleið/heimleið/dvöl"
- `caution_wind_driving`: "vindur nær varúðarmörkum á útleið/heimleið"
- `caution_wind_trailer`: "vindur er orðinn varasamur fyrir eftirvagn"
- `too_windy_*`: stronger red copy
- `no_data`: explicitly say forecast coverage is incomplete

### B. Enrich route weather metadata

Extend route sampling data so each sampled point has metadata:

```ts
type RouteWeatherPoint = {
  lat: number
  lon: number
  routeIndex: number
  distanceFromOriginM?: number
  routeFraction?: number
  hours: HourPoint[]
}
```

Then change `worstConditions()` to return per-metric maxima with source:

```ts
type WorstMetric = {
  value: number
  timeIso: string
  lat?: number
  lon?: number
  routeIndex?: number
  distanceFromOriginM?: number
  routeFraction?: number
}

type LegConditions = {
  hasData: boolean
  worstWind: WorstMetric | null
  worstGust: WorstMetric | null
  worstPrecip: WorstMetric | null
}
```

Keep numeric convenience values if useful, but do not discard the source point.

Important: the max wind, max gust, and max precipitation may happen at different
points/times. The UI should highlight the metric that actually caused the
status/reason, not always list all three as equal.

### C. Add result detail structure instead of only `facts: string[]`

Add a structured travel details field to `DeterministicResult`, for example:

```ts
travelDetails?: {
  route: {
    originName: string
    destinationName: string
    distanceKm: number
    durationMinutes: number
  }
  legs: Array<{
    kind: 'outbound' | 'stay' | 'return'
    fromIso: string
    toIso: string
    status: WeatherStatus
    reasonCode?: string
    worstWind?: WorstMetric
    worstGust?: WorstMetric
    worstPrecip?: WorstMetric
  }>
  highlightedIssue?: {
    legKind: 'outbound' | 'stay' | 'return'
    metric: 'wind' | 'gust' | 'precipitation' | 'data'
    value?: number
    unit?: 'm/s' | 'mm/klst'
    timeIso?: string
    lat?: number
    lon?: number
    distanceFromOriginM?: number
    routeFraction?: number
    reasonCode?: string
  }
}
```

Keep `facts` temporarily if needed for old tests, but render the travel result
from `travelDetails`.

### D. Render a clearer result card

Recommended card structure:

1. Status row:
   - Green/yellow/red dot
   - label: "Gott ferðaveður" / "Varúð" / "Ekki mælt með ferð"

2. Main explanation:
   - one clear sentence based on `highlightedIssue`
   - include departure time and whether it applies to útleið / heimleið / dvöl

3. Key facts:
   - "Brottför: HH:mm"
   - "Áætluð koma: HH:mm"
   - "Leið: 99 km, um 1 klst. 25 mín."

4. Cause block:
   - "Mesta úrkoma: 7.6 mm/klst um kl. HH:mm, um 62 km frá Akranesi"
   - or "Mesti vindur: X m/s, hviður Y m/s..."

5. Map:
   - route line if feasible
   - marker at highlighted issue point if available

6. Collapsible technical details:
   - all legs and worst values
   - disclaimer: "Þetta er veðurmat byggt á spápunktum, ekki umferðar- eða farartrygging."

### E. Re-check precipitation thresholds

The current logic makes precipitation above `WEATHER_THRESHOLDS.dry.maxPrecipMmPerHour`
yellow, but apparently never red for driving. `7.6 mm/klst` may feel more severe
than a mild yellow depending on road/weather context.

Do not overstate safety. But Claude Code should review whether travel needs:

- yellow precipitation threshold
- red heavy-precipitation threshold
- different handling for rain vs snow/sleet when `symbolCode` indicates winter conditions

If this is too much for the immediate pass, at least explain heavy precipitation
clearly in the yellow card.

## Suggested acceptance criteria

- No user-facing label says "Meðgótt".
- Result always states the selected departure time and estimated arrival time.
- The yellow/red reason is specific, not generic.
- If the reason is precipitation, the UI shows where and when the max precipitation
  occurs.
- If the reason is wind/gust, the UI shows where and when the max wind/gust occurs.
- If location cannot be named, the UI uses distance from origin or route fraction,
  not a fake place name.
- Details distinguish útleið, dvöl, and heimleið.
- Result map visually confirms the route and the highlighted weather issue if
  route-point metadata is available.
- Tests cover at least:
  - precipitation source point is retained
  - wind source point is retained
  - displayed highlighted issue matches `reasonCode`
  - yellow label copy is not "Meðgótt"

## Localhost checks for Stebbi

After Claude Code implements this pass, Stebbi should test:

1. Open `/auth-mvp/vedrid` on localhost.
2. Choose Akranes as origin and Apavatn as destination.
3. Choose a departure time today or tomorrow.
4. Choose no trailer and no lodging first.
5. Submit and verify:
   - status label is natural Icelandic
   - result says what time the assessment is based on
   - result says why the status is yellow/green/red
   - wind and precipitation values say where and when they apply
   - the route/destination names are still correct
   - no horizontal overflow or mobile zoom issue appears
6. Repeat with:
   - caravan/trailer selected
   - return time selected
   - tent/camper lodging selected
7. Verify that útleið, dvöl, and heimleið are not mixed together.
8. Keep DevTools Console open and check that no new API errors appear.

Do not test production or change production Google keys for this pass unless
Stebbi explicitly approves that separately.

## Notes for Codex/Stebbi

This is not just a cosmetic issue. The current result is too opaque for a
decision-support tool. It should not be considered ready for broader testing
until it explains the cause, time, and approximate location of the weather risk.
