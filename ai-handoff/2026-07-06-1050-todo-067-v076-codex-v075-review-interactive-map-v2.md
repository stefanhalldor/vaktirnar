# 2026-07-06-1050-todo-067-v076-codex-v075-review-interactive-map-v2

Created: 2026-07-06 10:50  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Scope: Review of `2026-07-06-0900-todo-067-v075-claude-v074-shipped.md` and next implementation handoff for Ferðalagið interactive audit map v2. Codex changed only this handoff file. No app code, SQL, Supabase, env, commit, push, deploy, or production changes were made.

## Bottom line

v075 looks technically sound enough to build on:

- `npm run type-check` passed.
- `npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-forecast.test.ts` passed: 56 passed, 5 skipped.
- `npm run build` passed.

The next product problem is not the deterministic weather logic. It is trust and comprehension. The static audit map is a dead image. It proves a route exists, but it does not let the user inspect the route, the sampled weather points, or the worst point in a way that feels like a modern map experience.

Recommendation: implement "audit map v2" as an interactive Google map in the Ferðalagið result view, using the route polyline and weather points we already return.

## v075 review findings

### No blocking issue found in v075

The v073/v074 goals appear implemented:

- Travel precipitation threshold is now travel-specific.
- `0.7 mm/klst` calm rain should stay green.
- `next_6_hours` precipitation fallback is divided by 6.
- Cross-leg highlighted issue tie-break is metric-aware.
- Return-leg issue distance has `distanceFromLegStartM` and `legStartName`.
- Deterministic-vs-AI explainer exists.
- Static map URL now uses `URLSearchParams`.
- Type-check, targeted tests and build are green in Codex verification.

### P2 - Static map is still a weak trust surface

Current UI shows an `<img>` from Google Static Maps when `travelPlan.route.auditMapUrl` exists. It is visually useful, but not enough for Stebbi's stated need:

- The user cannot tap a weather point.
- The user cannot inspect the worst point on the route.
- It does not show all sampled weather points clearly.
- It does not feel like "this is the actual route Teskeið assessed".

This is the main reason for v076.

### P2 - Static map URL test remains partly conditional

`weather-travel.test.ts` only verifies the static map URL if `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` exists in the test env. That is okay for v075, but v076 should avoid repeating this weakness.

Recommendation for v076:

- Put pure map helper logic behind exported functions that can be tested without a real Google key or browser.
- Unit test point styling, initial selected point, marker summary text, route-to-map coordinate conversion, and fallback selection.

### P3 - Audit details still show raw UTC time

`IssueAuditCard` currently renders:

```tsx
new Date(issue.timeIso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
```

This is not a blocker, but in the interactive map v2 bottom sheet use Icelandic/local display:

- `kl. 17:00`
- include date only when the point is not today in the user's flow

Keep raw ISO/UTC out of the main UX unless it is explicitly a debug detail.

## Pricing and billing check

Codex rechecked official Google pricing on 2026-07-06.

Sources:

- Google Maps Platform core services pricing list: `https://developers.google.com/maps/billing-and-pricing/pricing`
- Google Maps Platform pricing FAQ: `https://mapsplatform.google.com/pricing/`

Relevant current Google numbers:

- Dynamic Maps: 10,000 free monthly events, then `$7.00 / 1,000` up to 100,000 monthly events.
- Static Maps: 10,000 free monthly events, then `$2.00 / 1,000` up to 100,000 monthly events.
- Routes: Compute Routes Essentials: 10,000 free monthly events, then `$5.00 / 1,000` up to 100,000 monthly events.
- Google says requests are API calls or map/panorama load events. User interactions like zooming or panning are not charged.
- Google also says the old USD $200 monthly credit was replaced from 1 March 2025 with free monthly calls per SKU.

Important implication for Teskeið:

- The travel endpoint already calls Google Routes to calculate the route.
- Interactive map v2 should reuse `travelPlan.route.auditPolylinePoints` and `travelPlan.routeWeatherPoints`.
- Therefore v076 should not add another Routes API call.
- It will add one Dynamic Maps load when the interactive map is instantiated.
- If it replaces the static map, the incremental billing shape changes from Static Maps load to Dynamic Maps load for that result view.

Rough cost shape after free caps:

- Existing result with route calculation + static map: roughly `$5 + $2 = $7 / 1,000` after free caps.
- Interactive result reusing existing route calculation: roughly `$5 + $7 = $12 / 1,000` after free caps.
- Under 10,000 monthly Dynamic Maps events and under 10,000 monthly Routes Essentials events, expected Google bill for these SKUs is still `$0`.

This is simplified. Real billing depends on actual SKU triggers and account-level monthly usage.

## Product goal for v076

Replace the "dead screenshot" feeling with a compact interactive route audit map:

- Actual driving route as a blue line.
- Origin and destination pins.
- Every sampled weather point along the route.
- Worst/decisive point as a stronger marker.
- Tap/click a point to see time, wind, gusts, precipitation, distance and links.
- Bottom-sheet style summary for selected point.
- Initial selected point should be the worst/decisive point if present.
- Still show deterministic explainer: AI does not decide the weather status.

This should make the user feel:

> "I can see exactly which route Teskeið assessed, where the weather points are, and why this point matters."

## Recommended scope

Do v076 as a UI/audit upgrade only.

Do not change the weather decision model again unless a small type/data addition is needed for the map.

Do not implement alternate route recommendations in this pass. Alternate routes are a later step.

## Recommended implementation plan

### Step 1 - Extend Google Maps client helper

File: `lib/weather/googleMaps.client.ts`

Current helper only loads Places:

- `loadPlacesLibrary()`

Add map-loading helpers using the existing `@googlemaps/js-api-loader` v2 pattern:

- `loadMapsLibrary(): Promise<google.maps.MapsLibrary>`
- `loadMarkerLibrary(): Promise<google.maps.MarkerLibrary>`

Keep:

- browser-only guard
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`
- `language: 'is'`
- `region: 'IS'`

Do not introduce a second Google loader pattern.

### Step 2 - Add a focused interactive map component

Recommended file:

- `components/weather/TravelAuditMap.tsx`

Alternative if Claude Code wants tighter scope:

- `app/auth-mvp/vedrid/TravelAuditMap.tsx`

Recommendation: use `components/weather/TravelAuditMap.tsx`, because this is a feature component and keeps `FerdalagidClient.tsx` from becoming too large.

Component props:

```ts
type TravelAuditMapProps = {
  originName: string
  destinationName: string
  routePoints: Array<{ lat: number; lon: number }>
  weatherPoints: RouteWeatherPoint[]
  highlightedIssue?: TravelIssue
  staticMapUrl?: string
}
```

Behavior:

- If Google Maps JS loads successfully:
  - render interactive map.
- If Google Maps JS fails or key is missing:
  - render existing static map fallback if `staticMapUrl` exists.
- If no map can render:
  - render a compact text fallback and keep route point list available.

### Step 3 - Draw the route and points

Use existing data:

- `travelPlan.route.auditPolylinePoints`
- `travelPlan.routeWeatherPoints`
- `travelPlan.highlightedIssue`

Do not call Routes API from the browser.

Map elements:

- `google.maps.Map`
- `google.maps.Polyline` for the route
- `google.maps.LatLngBounds` to fit the route
- `AdvancedMarkerElement` from the marker library if practical
- If AdvancedMarker adds too much complexity, use classic markers for this pass and note the tradeoff

Marker styling:

- Origin: simple green/dark marker, label "Frá"
- Destination: simple green marker, label "Til"
- Weather point green/yellow/red based on `summaryForWindow.status`
- Highlighted issue: larger red marker or red outlined marker
- Destination closest point can have a subtle distinct marker if separate from destination

Important: status color must not be the only meaning. The selected point sheet must also state the status/metric in text.

### Step 4 - Bottom-sheet point details

On tap/click marker, set `selectedPoint`.

Default `selectedPoint`:

1. highlighted issue point if present
2. destination closest point
3. first weather point

Show a compact bottom-sheet style panel below or over the lower edge of the map:

- `Versti punktur` if selected is highlighted issue
- `Punktur {n}/{total}`
- distance: `um X km frá {originName}` or for return/highlighted issue use `distanceFromLegStartM`/`legStartName` when applicable
- time: `kl. HH:mm`
- wind: `Vindur X m/s`
- gust: `Hviður X m/s`
- precipitation: `Úrkoma X mm/klst`
- links:
  - `Skoða veðurspá`
  - `Opna á korti`
  - `Hrá met.no gögn` as muted debug link

Suggested copy for highlighted point:

- `Versti punktur er hér`
- `Um {km} km frá {place}`
- `Mest: {metricLabel} {value} {unit} um kl. {time}`

Keep the sheet small. No wall of text.

### Step 5 - Replace static map placement in result UI

File:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Current placement:

- static map is shown above the result card.

Recommended placement:

1. Route summary
2. Result/status card
3. Deterministic/AI explainer
4. Interactive audit map
5. Collapsible route point list/details

Reasoning:

- The result should answer first.
- The map should then explain and let the user inspect.
- The old static image above the result makes the first viewport feel like a map page before the user sees the answer.

Keep the existing route point list but make it secondary/collapsible. The interactive map becomes the primary audit surface.

### Step 6 - Mobile-first layout

Per `Design.md`:

- Map height mobile: 240-280 px.
- Desktop/tablet: up to 320-360 px.
- Border radius 8-12 px.
- No nested card inside card.
- No horizontal overflow.
- Touch targets at least 40 px.
- Do not disable user zoom.
- Do not let bottom sheet cover essential Google controls.

Suggested layout:

```tsx
<section className="flex flex-col gap-2">
  <div className="relative overflow-hidden rounded-xl border border-border">
    <div ref={mapRef} className="h-[260px] sm:h-[320px] w-full" />
  </div>
  <div className="rounded-xl border border-border bg-card px-3 py-3">
    selected point summary
  </div>
</section>
```

If using an overlay bottom sheet inside the map container, test carefully on mobile so map controls remain usable. A separate panel below the map is safer.

### Step 7 - Message keys

Add user-facing text to both `messages/is.json` and `messages/en.json`.

Suggested Icelandic keys:

- `interactiveMapTitle`: `Leiðin og veðurpunktar`
- `interactiveMapLoading`: `Hleð kort...`
- `interactiveMapUnavailable`: `Kortið náði ekki að hlaðast.`
- `selectedPointTitle`: `Valinn veðurpunktur`
- `worstPointTitle`: `Versti punktur er hér`
- `originMarkerLabel`: `Frá`
- `destinationMarkerLabel`: `Til`
- `pointStatusGraent`: `Í lagi`
- `pointStatusGult`: `Varúð`
- `pointStatusRautt`: `Ekki mælt með`
- `pointDistanceFrom`: `um {km} km frá {place}`
- `pointWeatherLine`: `Vindur {wind} m/s, hviður {gust} m/s, úrkoma {precip} mm/klst`
- `pointTimeLine`: `kl. {time}`

Use existing keys where possible:

- `viewForecast`
- `openOnMap`
- `viewMetnoRaw`
- `metricWind`
- `metricGust`
- `metricPrecip`

### Step 8 - Tests

Do not try to fully render Google Maps in Vitest. Keep Google Maps integration thin and test pure helpers.

Recommended pure helper file:

- `components/weather/travelAuditMap.helpers.ts`

or local exported helpers if preferred.

Test:

- converts `{ lat, lon }` to Google `LatLngLiteral` shape `{ lat, lng }`
- picks highlighted issue point as initial selected point
- falls back to destination closest point, then first point
- maps `graent/gult/rautt` to stable marker styles
- formats `kl. HH:mm` for selected point
- builds selected point summary values from `RouteWeatherPoint`
- no helper requires Google Maps JS or a browser key

Add component smoke test only if existing test setup can mock the Google loader cleanly. Do not overbuild this.

### Step 9 - Preserve cost controls

Keep map loading lazy:

- Do not import/load Google Maps at module load time.
- Load it only when the result exists and the map component mounts.
- Do not create multiple map instances on every render.
- Clean up markers/listeners on unmount or when result changes.

Optional, if Claude Code thinks this is easy and low-risk:

- Add `WEATHER_INTERACTIVE_MAP_ENABLED` or similar env gate.

But do not block v076 on a new admin toggle. The browser key and provider gating already give a natural fallback.

## Non-goals

- No alternate routes.
- No Mapbox implementation.
- No provider bakeoff UI.
- No changes to weather thresholds or decision logic unless required for map display.
- No SQL, Supabase, RLS, auth, billing config, production data, env edits, commit, push, or deploy.
- Do not start, stop or restart Stebbi's dev server.

## Commands Claude Code should run

After implementation:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-forecast.test.ts
npm run test:run
npm run build
```

If Google Maps component tests are added:

```bash
npm run test:run -- components/weather
```

## Localhost checks for Stebbi

After Claude Code implements v076 and Stebbi restarts localhost if needed:

1. Open `/auth-mvp/vedrid`.
2. Run a normal route, e.g. Reykjavík to Selfoss or Reykjavík to Húsafell.
3. Expected:
   - Result/status appears first.
   - Interactive map appears in the result view.
   - Route line follows the actual driving route.
   - Origin and destination markers are visible.
   - Weather points are visible along the route.
4. Tap/click several weather points.
5. Expected:
   - Selected point details update.
   - Details show wind, gusts, precipitation, time and distance.
   - `Skoða veðurspá`, `Opna á korti`, and muted `Hrá met.no gögn` links work.
6. Test a route/time with a highlighted issue.
7. Expected:
   - Worst point is visibly emphasized.
   - The initial selected point is the worst point.
   - The text says why that point matters.
8. Test a calm `0.7 mm/klst` rain case.
9. Expected:
   - Overall status stays green.
   - Map may show the rain value in details, but it does not frame it as a problem.
10. Test mobile widths 360, 390 and 460 px.
11. Expected:
   - No horizontal overflow.
   - Map height feels app-like, not huge.
   - Bottom details are readable and tappable.
   - Google controls and Teskeið controls do not overlap badly.
12. Temporarily test missing/invalid browser key locally if practical.
13. Expected:
   - Static map fallback or text fallback appears.
   - The result card still works.

Do not test production billing casually. Use Google Cloud usage/budget alerts outside this implementation pass.

## Questions for Claude Code to answer in the next handoff

1. Did v076 reuse existing `auditPolylinePoints`, or did it introduce any new Google Routes calls?
2. Which Google Maps JS libraries are loaded?
3. Does the map fallback work when the browser key is missing or Google Maps JS fails?
4. Did the interactive map add measurable bundle size to `/auth-mvp/vedrid`, and is it loaded lazily?
5. Were mobile 360/390/460 px layouts checked?
6. Were Google billing implications kept to one Dynamic Maps load per rendered interactive map?

## Suggested single message for Stebbi to send Claude Code

Claude Code, lestu og framkvæmdu `ai-handoff/2026-07-06-1050-todo-067-v076-codex-v075-review-interactive-map-v2.md`.

Markmiðið er að byggja interactive audit map v2 fyrir Ferðalagið: ekki dauða static mynd, heldur Google Maps kort í niðurstöðunni með raunverulegri keyrsluleið, frá/til pinnum, öllum veðurpunktum, versta punktinum og tappable/clickable point details. Notaðu núverandi `auditPolylinePoints` og `routeWeatherPoints`; ekki bæta við nýju Routes API kalli ef hægt er að komast hjá því.

Ekki breyta veðurákvörðunarlógík, thresholds, SQL, Supabase, env, production, commit, push eða deploy. Keyrðu type-check, targeted weather tests, full tests og build, og skilaðu handoff með nákvæmum localhost checks.
