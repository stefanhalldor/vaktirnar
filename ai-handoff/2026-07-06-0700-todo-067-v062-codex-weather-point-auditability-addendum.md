# TODO 067 - Weather point auditability addendum

Created: 2026-07-06 07:00  
Timezone: Atlantic/Reykjavik

## Context

Stebbi has already sent Claude Code into implementation based on
`2026-07-06-0016-todo-067-v061-claude-v060-review.md`.

This addendum should be treated as an additional requirement for the same
implementation pass if Claude Code has not moved past the result model/UI yet.
If implementation is already far along, Claude Code should either incorporate it
now or explicitly list it as a follow-up blocker before broader localhost
testing.

Stebbi's concern:

> I want to be able to verify the worst point manually by opening the forecast
> and seeing that the point is in the forecast and is on the road section I am
> going to drive.

This is the right bar for a travel decision-support tool. It is not enough for
Teskeið to say "worst point is about 62 km from Reykjavík" unless the user can
inspect where that point is and which forecast value was used.

## Requirement: auditability of the decisive weather point

For every yellow/red result, and ideally every result, the UI must expose an
auditable "decisive weather point" when one exists.

Minimum data shown:

- leg: outbound or return
- metric that drove the result: wind, gust, precipitation, or missing data
- value and unit
- forecast timestamp used
- route position:
  - distance from origin, e.g. "um 62 km frá Reykjavík"
  - route fraction if helpful, e.g. "um 63% leiðarinnar"
- coordinates:
  - raw route point coordinates if available
  - met.no coordinates actually queried
- whether the value comes from the selected route weather point forecast
- a direct way to open/check the point manually

## Important implementation detail: met.no uses rounded coordinates

Current code in `lib/weather/metno.server.ts` builds met.no URLs using
`roundCoord()` from `lib/weather/places.ts`.

`roundCoord()` rounds to 3 decimals:

```ts
export function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000
}
```

Therefore the auditable point must expose the same coordinates used for the
forecast request, not only the original Google route geometry point.

Recommended WorstMetric extension:

```ts
type WorstMetric = {
  value: number
  timeIso: string
  lat?: number
  lon?: number
  forecastLat?: number
  forecastLon?: number
  routeIndex?: number
  distanceFromOriginM?: number
  routeFraction?: number
  metnoUrl?: string
}
```

`forecastLat/forecastLon` should be the rounded coordinates used by met.no.
`lat/lon` can remain the route geometry point from Google if useful.

## Manual forecast link

Add a generated link for the exact met.no compact forecast point:

```txt
https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={forecastLat}&lon={forecastLon}
```

This link is for audit/debug/manual verification, not a polished consumer
forecast page.

UI copy can label it as:

```txt
Opna spágögn fyrir þennan punkt
```

or under technical details:

```txt
Skoða hrá spágögn frá met.no fyrir þennan punkt
```

Do not expose internal cache keys or secrets.

## Route map verification

The result UI should help Stebbi/user verify that the point is on the driven
route.

MVP options, ordered by preference:

1. Result map with route line, origin/destination markers, and highlighted worst
   weather point marker.
2. Static map centered on worst point with origin/destination labels and a text
   line saying "Punktur er úr leiðarpunkti #N af M".
3. Text-only fallback with coordinates, route index, distance from origin, and
   a link to open Google Maps at the point.

If full route-line rendering is too big for the current pass, do not block on
it. But at minimum show a point marker link and coordinates so the point can be
checked manually.

Suggested links:

```txt
Google Maps point:
https://www.google.com/maps/search/?api=1&query={lat},{lon}

met.no compact forecast:
https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={forecastLat}&lon={forecastLon}
```

## Result UI placement

Keep the main card human-friendly, then put audit details behind disclosure.

Main result example:

```txt
Varúð. Mesta úrkoman á útleið er 7.6 mm/klst um kl. 15:00,
um 62 km frá Reykjavík.
```

Expanded "Af hverju?" / "Tæknileg gögn" example:

```txt
Punktur á leið: #8 af 15
Staðsetning: 64.123, -21.456
Spápunktur met.no: 64.123, -21.456
Tími í spá: 2026-07-06T15:00:00Z
Gildi sem réð stöðu: úrkoma 7.6 mm/klst
[Opna punkt á korti]
[Skoða hrá spágögn frá met.no]
```

## Testing requirements

Add/update tests so this does not regress:

- WorstMetric includes raw route coords and rounded forecast coords.
- met.no URL is generated from rounded coords, not display-only raw coords.
- highlighted issue references the same point/time as the candidate evaluation.
- when result is yellow/red, `highlightedIssue` is present unless the reason is
  explicitly `no_data`.
- route point metadata includes `routeIndex`, total point count if available,
  and `distanceFromOriginM`.
- UI renders technical/audit details when `travelPlan.highlightedIssue` exists.

## Localhost checks for Stebbi

After Claude Code implements this, Stebbi should test:

1. Open `/auth-mvp/vedrid`.
2. Run a route that produces yellow/red, e.g. Akranes -> Apavatn or Reykjavík ->
   Húsafell depending on live weather.
3. Open the details section.
4. Verify the decisive point shows:
   - route leg
   - time
   - value
   - approximate distance from origin
   - coordinates
   - link to map point
   - link to met.no raw forecast point
5. Open the map point and verify it is on or very near the driven route.
6. Open the met.no raw forecast link and search/inspect the timestamp/value used
   by Teskeið.
7. Confirm the hnit in the link match the displayed met.no forecast coordinates.

Do not change production keys, deploy, commit, push, SQL, Supabase, Vercel, or
billing settings for this addendum unless Stebbi separately approves it.

## Why this matters

Without auditability, the app can feel like a black box. For route weather,
especially with trailers or family travel, the user needs confidence that:

- the point is actually on the route,
- the value came from the forecast data,
- the time aligns with their expected travel window,
- and the app is not making up a vague "worst point" explanation.

This should be considered part of making Ferðalagið testable, not a nice-to-have
polish item.
