# Handoff: Interactive Audit Map v2 — Done

**From:** Claude (v076 execution)
**To:** Codex (review) or Stebbi (localhost QA)
**Date:** 2026-07-06 ~11:15
**TODO:** #067 — Ferðalagið weather AI
**Previous input:** `2026-07-06-1050-todo-067-v076-codex-v075-review-interactive-map-v2.md`

---

## What was done

All 7 steps from the v074 review plan and all interactive map tasks from the v076 plan are complete.

### v074 fixes (recap)

1. Travel precipitation threshold: `WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour = 1.0` — golf/grill unaffected
2. `next_6_hours` parser: divide by 6 before storing as mm/h
3. Cross-leg tie-break in `buildHighlightedIssue`: status rank → `candidateSeverity` → outbound preference on full tie
4. `distanceFromLegStartM` / `legStartName` precomputed on `TravelIssue` in `checkTravelWeather`
5. Deterministic-vs-AI explainer in `FerdalagidClient` (short trust line + expandable section)
6. `buildAuditMapUrl` switched to `URLSearchParams`
7. Tests hardened throughout

### v076 interactive map (new)

**New files:**
- `components/weather/TravelAuditMap.tsx` — `'use client'` component: Google Maps JS API, classic `Marker` (CIRCLE symbol), `Polyline` for route, `fitBounds` to full route, click-to-select point details panel
- `components/weather/travelAuditMap.helpers.ts` — pure helpers with zero Google Maps dependency: `toLngLat`, `markerStyleForStatus`, `initialSelectedIndex`, `formatKlTime`, `buildPointSummary`
- `lib/__tests__/travelAuditMap.helpers.test.ts` — 25 unit tests, all passing

**Modified files:**
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — replaced static `<img>` with `<TravelAuditMap>`, passing `auditPolylinePoints`, `routeWeatherPoints`, `highlightedIssue`, `staticMapUrl` (fallback), `originName`, `destinationName`
- `messages/is.json` + `messages/en.json` — added all map i18n keys: `interactiveMapLoading`, `interactiveMapUnavailable`, `auditMapAlt`, `worstPointTitle`, `pointTimeLine`, `pointLabel`, `originMarkerLabel`, `destinationMarkerLabel`, `kmFrom`, `viewForecast`, `openOnMap`, `viewMetnoRaw`, `coordinatesLabel`, `howAssessedShort`, `howAssessedTitle`, `howAssessedBody`
- `lib/weather/googleMaps.client.ts` — added `loadMapsLibrary()` returning `Promise<google.maps.MapsLibrary>`

**Build fix:** Removed 3 invalid `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments from `TravelAuditMap.tsx`. The `@typescript-eslint` plugin is not configured in this project — those comments caused `"Definition for rule not found"` ESLint ERRORS that failed the build. The `any` casts themselves are fine (no `no-explicit-any` rule configured).

---

## Test results

```
Test Files  3 passed (3)
      Tests  81 passed | 5 skipped (86)
```

Build: passed (no errors, no ESLint errors)

---

## Localhost QA checklist

1. `/vedrid` — submit a route (e.g. Reykjavik → Akureyri)
2. After result loads: interactive Google Map should appear above the result card
   - Route polyline drawn in blue
   - Weather point markers: green = ok, amber = gult, red = rautt
   - Worst-point marker: red regardless of status, larger, zIndex 10
   - Origin marker: labeled "Upph." (IS) / "Dep." (EN)
   - Destination marker: labeled "Áfang." (IS) / "Dest." (EN)
3. Click any marker: point details panel updates below map
   - Shows point index, distance from origin/leg-start, time, wind/gust/precip values
   - Worst point gets red badge "Versti punktur"
   - Links: yr.no forecast, Google Maps, met.no raw
4. If `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` not set or JS fails: falls back to static map image (if `staticMapUrl` present) or short "map unavailable" text
5. Map loading state: shows "Hleður korti..." while JS initializes
6. Return route: if highlighted issue is on return leg, distance in point details shows km from destination (not from origin)
7. Deterministic explainer: short trust line visible; "Hvernig er þetta metið?" expander works

---

## Codex review questions

1. **`useEffect([], [])` — empty deps array**: The map init effect intentionally has empty deps (`[]`) and a lint warning about missing deps. The component remounts on new results (parent key change), so this is correct. The warning is suppressed with `// eslint-disable-next-line react-hooks/exhaustive-deps`. This IS a valid configured rule — no issue.

2. **`new google.maps.LatLngBounds()` global**: `LatLngBounds` is in `CoreLibrary`, not `MapsLibrary`. Using the global directly after `loadMapsLibrary()` is loaded works because `@googlemaps/js-api-loader` makes all globals available after any `importLibrary()` call. Is this acceptable or should we explicitly import CoreLibrary too?

3. **Classic Marker vs AdvancedMarker**: Classic `google.maps.Marker` is deprecated but requires no `mapId`. AdvancedMarker needs `mapId` which requires a billable Maps Platform setup. Current choice avoids that dependency. Confirm this is acceptable for now.

4. **`staticMapUrl` prop**: The static map URL is still generated server-side and passed as a fallback. The `<img>` is only shown if JS map fails entirely. Is this fallback needed or can it be removed to simplify?

5. **Point details panel**: Currently shows `mm/klst` hardcoded (not i18n). Should this be extracted to a translation key?

6. **`pointTimeLine` wording**: Currently `"kl. {time}"` (IS) / `"at {time}"` (EN). Is this the right format, or should it include the date when the forecast is for a different day?
