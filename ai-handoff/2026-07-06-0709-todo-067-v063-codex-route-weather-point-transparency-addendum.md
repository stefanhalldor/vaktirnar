# TODO 067 - Route weather point transparency addendum

Created: 2026-07-06 07:09  
Timezone: Atlantic/Reykjavik

## Context

This addendum builds on:

- `2026-07-06-0013-todo-067-v060-codex-v059-decisions-for-implementation.md`
- `2026-07-06-0016-todo-067-v061-claude-v060-review.md`
- `2026-07-06-0700-todo-067-v062-codex-weather-point-auditability-addendum.md`

Stebbi wants the Ferðalagið MVP to build trust while the deterministic weather
model is being validated. The app should make it possible to see which route
weather points are used, not just the one worst point.

Important wording:

- Avoid calling these "veðurstöðvar" unless they are actual observation stations.
- In this feature they are route forecast points / spápunktar from met.no/VÍ,
  sampled along the selected route.

## Product Direction

For this beta/testing phase, show a more detailed explanation of how the route
weather decision was made.

Recommended UI model:

1. Keep the normal user answer first.
2. Add an expandable "Hvernig er þetta reiknað?" or "Spápunktar á leiðinni"
   section.
3. In that section, show the selected route like a maps route and show all
   weather forecast points used in the analysis.
4. Highlight:
   - the decisive/worst point
   - the forecast point closest to destination
   - optionally origin and destination points
5. Make it clear this is a beta/trust-building view:

```txt
Við erum að þróa þetta mat og sýnum spápunktana á leiðinni svo auðveldara sé
að sannreyna niðurstöðuna.
```

This should not sound apologetic. It should feel transparent and confident.

## Required Route Forecast Point Metadata

The API/result should expose the sampled route points used for weather analysis.

Recommended shape under `travelPlan`:

```ts
routeWeatherPoints?: Array<{
  id: string
  routeIndex: number
  totalRouteWeatherPoints: number
  lat: number
  lon: number
  forecastLat: number
  forecastLon: number
  distanceFromOriginM: number
  routeFraction: number
  isOrigin?: boolean
  isDestinationClosest?: boolean
  isHighlightedIssue?: boolean
  googleMapsUrl: string
  metnoUrl: string
  summaryForWindow?: {
    status: WeatherStatus
    worstWindMs: number
    worstGustMs: number
    worstPrecipMmPerHour: number
    decisiveMetric?: 'wind' | 'gust' | 'precipitation' | 'data'
    decisiveTimeIso?: string
  }
}>
```

Do not include huge raw forecast payloads in the normal API response. Include
links and compact summaries.

## Map / Visual Requirement

For local testing and trust-building, the result should show the route and the
sampled weather points as clearly as possible.

Preferred:

- Google-rendered map or static map with:
  - route path
  - origin marker
  - destination marker
  - all sampled weather points
  - highlighted worst point in a distinct color
  - destination-nearest forecast point in another distinguishable marker

Acceptable MVP if full marker map is too much:

- route summary card with point list
- each point row has:
  - point number, e.g. `8/15`
  - distance from origin
  - worst value summary
  - "Opna á korti"
  - "Skoða met.no spá"

Important: because the route geometry comes from Google, avoid mixing Google
route data into a non-Google map without confirming the provider terms. If using
Google route geometry for display, keep the visualization in Google Maps/Static
Maps or make this a text/list fallback until provider terms are reviewed.

## UI Copy

Suggested labels:

- `Spápunktar á leiðinni`
- `Versti punkturinn`
- `Næsti spápunktur við áfangastað`
- `Punktur {n} af {total}`
- `Um {km} km frá {origin}`
- `Opna punkt á korti`
- `Skoða hrá spágögn frá met.no`

Suggested beta transparency copy:

```txt
Við sýnum spápunktana á leiðinni á meðan við fínstillum ferðaveðrið. Þannig er
hægt að sjá hvaða gögn réðu niðurstöðunni.
```

Keep the main result concise; put this in a details/disclosure area.

## Destination-Nearest Point

The destination-nearest route weather point should be explicitly marked because
users often care about the destination conditions too, even when lodging/stay
analysis is deferred.

This does not reintroduce lodging/stay analysis. It is only transparency:

- "Næsti spápunktur við áfangastað"
- show the point and compact forecast summary for the travel window

Do not imply this is a full destination/stay forecast unless that phase is
implemented later.

## Testing Requirements

Add/update tests for:

- route weather points are present in `travelPlan`
- each route weather point includes route index, total count, distance, raw
  route coords, rounded forecast coords, Google Maps URL, and met.no URL
- exactly one point is marked as destination-nearest when points exist
- highlighted issue point matches one of the route weather points when the issue
  is route-based
- API response does not include full raw met.no forecast payloads
- UI can render the route point list/details without overflowing on mobile

## Localhost checks for Stebbi

After implementation:

1. Open `/auth-mvp/vedrid`.
2. Run a route such as Reykjavík -> Húsafell or Akranes -> Apavatn.
3. Open result details / "Spápunktar á leiðinni".
4. Verify all sampled weather points appear.
5. Verify one point is marked as the worst/decisive point when applicable.
6. Verify one point is marked as closest to destination.
7. Open several "Opna punkt á korti" links and confirm the points sit on or very
   near the chosen route.
8. Open the met.no link for the highlighted point and confirm the timestamp/value
   can be manually inspected.
9. Verify the main result remains readable and the detailed section does not
   overwhelm the first screen.
10. Check mobile viewport for overflow, cramped buttons, and accidental zoom.

Do not change production keys, deploy, commit, push, SQL, Supabase, Vercel, or
billing settings for this addendum unless Stebbi separately approves it.

## Why This Matters

This turns Ferðalagið from a black-box weather answer into a verifiable
decision-support tool.

During beta/local testing, transparency is valuable:

- Stebbi can validate deterministic behavior.
- Users can see that the app is checking the actual route, not a vague place.
- The worst point can be challenged and debugged.
- Trust grows because the answer shows its work.

This should be treated as a beta trust layer, not permanent debug clutter.
