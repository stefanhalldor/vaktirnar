# 2026-07-06-1700-todo-067-v087-claude-v086-full-milestone-done

Created: 2026-07-06 ~17:00
Timezone: Atlantic/Reykjavik
Author: Claude Code
Scope: Full milestone executed per Stebbi's instruction and Codex v086 review. All four stop-points implemented.

---

## What was done

This pass implements the full "alla leið" milestone requested by Stebbi and reviewed by Codex in v086.

### Stop-point 1: Threshold data model + deterministic explanation

**`lib/weather/types.ts`**
- Added `thresholdValue?: number` and `thresholdUnit?: 'm/s' | 'mm/klst'` to `TravelIssue`

**`lib/weather/thresholds.ts`**
- Added `deriveThreshold(metric, reasonCode)` export function that returns the relevant threshold based on metric and reasonCode. Used by both server (travel.ts) and client (DepartureHeatmap.tsx).

**`lib/weather/travel.ts`**
- `buildHighlightedIssue()`: now populates `thresholdValue` + `thresholdUnit` via `deriveThreshold()` for all issue types (precipitation, wind, gust)
- `buildRouteWeatherPoints()`: fixed `decisiveMetric` derivation to correctly set `'gust'` when gust exceeds the red threshold (was always `'wind'` before), and `'data'` for no_data

**`components/weather/travelAuditMap.helpers.ts`**
- Added `decisiveMetric?: 'wind' | 'gust' | 'precipitation' | 'data'` to `PointSummary` type
- `buildPointSummary()` now passes `pt.summaryForWindow?.decisiveMetric`

---

### Stop-point 1 continued: BFF reverse geocode + TravelAuditMap fixes

**`app/api/place/reverse-geocode/route.ts`** (NEW)
- Server-side BFF endpoint that proxies Nominatim with correct User-Agent header, 24h Cache-Control, server-side in-memory cache per process

**`lib/weather/reverseGeocode.client.ts`** (rewritten)
- Now calls `/api/place/reverse-geocode` instead of Nominatim directly
- Added inflight-promise deduplication: concurrent calls for same coordinate share one fetch
- No more direct browser-to-Nominatim calls (privacy, User-Agent, CORS issues all resolved)

**`components/weather/TravelAuditMap.tsx`**
- Race condition fixed: `PointDetailsPanel` useEffect now has `cancelled = false` flag; stale geocode responses are discarded
- Labels now fetched for ALL non-origin/destination points (not just `hasSeparateForecastPoint`)
- `hasSeparateForecastPoint` now only gates the extra coordinate lines and explanation — not the place label
- Gust display rule fixed: `Hviður` only shown when `gustMs > windMs`
- Gust warning indicator `↑` shown only when `decisiveMetric === 'gust'` (not when status !== graent)

**`components/weather/PlaceSearch.tsx`**
- Added `autoFocus?: boolean` prop (default true) for use in RouteSelectionStep where two search fields coexist
- Added `placeholder?: string` prop override

---

### Stop-point 2: DepartureHeatmap

**`components/weather/DepartureHeatmap.tsx`** (NEW)
- Horizontal scrollable departure slot timeline over `outbound.candidates[]`
- Each slot: colored circle (green/amber/red), departure time label
- No-data slots: gray, visually distinct from green
- Best window slots: subtle ring + "Besti" label
- Selected slot click: shows detail card with departure, arrival, metric, value, threshold (via `deriveThreshold`), distance from origin
- Color legend row below
- Mobile-first, works at 360px with horizontal scroll
- Shown in result step only when `windowMode && candidates.length > 1`

---

### Stop-point 3: Breyta forsendum (assumptions editing)

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**
- Added `'assumptions'` wizard step (not in STEP_ORDER, accessible via "Breyta forsendum" button)
- New `returnToStep` state: when set, `goNext`/`goBack` return to `returnToStep` after the next action
- Assumptions screen shows: origin, destination, departure, latest arrival, latest home, trailer — each with an "Breyta" link
- Clicking "Breyta" navigates to the relevant step with `returnToStep = 'assumptions'`
- After completing the edit (Next/Submit), wizard returns to assumptions
- "Reikna aftur" button calls `handleSubmit()` from assumptions screen
- "Byrja aftur" also available from assumptions

---

### Stop-point 4: Interactive origin/destination selection

**`components/weather/RouteSelectionStep.tsx`** (NEW)
- Single screen with origin field, destination field, and interactive Google Map
- Two `PlaceSearch` instances with independent `autoFocus` control
- Green circle marker for origin, blue circle for destination on map
- Straight-line route preview polyline when both are selected
- Map auto-fits to show both points with padding
- "Change" button (X icon) per confirmed place to clear and re-search
- Map initializes on mount with Iceland center (lat 64.9, lng -18.8, zoom 6)
- Marker and polyline updates via separate useEffects keyed to lat/lon changes
- Confirm button appears only when both origin and destination are set

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**
- Wizard steps changed from `['origin', 'destination', 'times', 'trailer', 'result']` to `['route', 'times', 'trailer', 'result']`
- Removed `PlaceConfirmation`, `MapConfirmation`, `originMapUrl`, `destinationMapUrl` — replaced by `RouteSelectionStep`
- `origin` and `destination` are now `RoutePlace` from `RouteSelectionStep`
- Removed `showRoutePoints` state — route points now live inside the explainer collapse
- Layout reorder in result step: result card → heatmap (windowMode) → audit map → explainer (with route points inside)
- `nextCaution` now shows: time · metric: value unit yfir mörkum threshold unit · distance km frá origin
- "Breyta forsendum" button added to result step action row
- `IssueAuditCard` and `RoutePointRow` now use `useTranslations` directly instead of `tf` prop

---

### i18n keys added

Both `messages/is.json` and `messages/en.json`:
- `nextCautionLine`: period removed (appended conditionally in JSX)
- `aboveThresholdShort`: "yfir mörkum {threshold} {unit}" / "above threshold {threshold} {unit}"
- `heatmapTitle`, `heatmapNoData`, `heatmapBestSlot`, `heatmapSlotDeparture`, `heatmapSlotArrival`
- `heatmapLegendGreen`, `heatmapLegendYellow`, `heatmapLegendRed`
- `editAssumptions`, `assumptionsTitle`, `recompute`
- `assumptionFrom`, `assumptionTo`, `assumptionDeparture`, `assumptionLatestArrival`, `assumptionLatestHome`, `assumptionTrailer`, `assumptionNotSet`
- `edit`, `stepRouteTitle`, `routeSelectOriginPrompt`, `routeSelectDestinationPrompt`

---

## Verification

```
npm run type-check   → exit 0
npm run test:run     → 52 files passed, 1699 tests passed
npm run build        → exit 0
```

---

## Localhost QA checklist (for Stebbi)

Restart dev server + hard refresh (Ctrl+Shift+R) after message file changes.

### Interactive route selection
1. Route step shows origin + destination fields and a Google Map in one view
2. Select origin → green pin appears on map; map centers on it
3. Select destination → blue pin appears; straight-line preview drawn; map fits both
4. X button on each place clears it and re-opens that search field
5. "Áfram" button appears only when both are set
6. Try same-name places (e.g. "Laugarvatn" vs "Laugarás") — map disambiguates visually

### Departure heatmap (window mode only)
7. Set a latest arrival time to trigger window mode
8. Heatmap shows below result card — horizontal scrollable slots
9. Green/amber/red/gray slots with hour labels
10. Best window slot has ring + "Besti" label
11. Click a slot → detail card shows departure, arrival, metric, value, threshold, distance
12. No-data slots are gray, not green
13. Mobile 360px: slots scroll horizontally, no overflow

### nextCaution with threshold
14. Green single-departure result shows next caution line
15. If nc.issue has metric + value + threshold: "Næst verður varasamt um kl. 17:00 · Úrkoma: 1.4 mm/klst yfir mörkum 1.0 mm/klst · 45 km frá Reykjavík"
16. If no issue data: "Næst verður varasamt um kl. 17:00."
17. If no caution found: "Engin varúð fannst á leiðinni næstu X klst."

### Gust display
18. Select a map point where wind ≥ gust (or gust == wind) — "Hviður" does NOT appear
19. Select a point where gust > wind — "Hviður: X m/s" appears
20. "↑" indicator only appears when decisiveMetric === 'gust'
21. Yellow/red status due to precipitation: no gust indicator

### Place labels
22. Select a middle route point — "Spápunktur met.no nálægt {place}" appears after brief fetch
23. While loading: "Spápunktur met.no" (no flicker/empty state)
24. Origin/destination show their known names immediately, no loading
25. Network tab: requests go to /api/place/reverse-geocode (not nominatim.openstreetmap.org)
26. Race test: click quickly between 3-4 points — label always matches selected point

### Breyta forsendum
27. Result screen shows "Breyta forsendum" button next to "Byrja aftur"
28. Clicking it goes to assumptions screen showing all current values
29. Click "Breyta" next to trailer → goes to trailer step
30. Change trailer → back to assumptions (no extra steps in between)
31. "Reikna aftur" recomputes with new trailer selection
32. "Byrja aftur" from assumptions resets all

### Layout
33. Result order: result card → heatmap (windowMode) → audit map → explainer → buttons
34. Explainer collapse contains route points — no separate route points section
35. Mobile 390px: all sections fit, no overflow, map is accessible

---

## Notes

- Straight-line route preview in RouteSelectionStep is geographic only (not road-following). This is intentional — no Directions API billing. Road routing is available on the result audit map.
- Nominatim is now server-side only. No `NEXT_PUBLIC_ENABLE_REVERSE_GEOCODE` flag needed.
- `deriveThreshold` in thresholds.ts is shared by both server (travel.ts) and client (DepartureHeatmap.tsx).
- The `assumptions` step is not in STEP_ORDER so it doesn't affect the normal wizard flow — only reached via "Breyta forsendum".
