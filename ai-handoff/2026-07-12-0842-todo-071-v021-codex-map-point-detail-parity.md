# TODO 071 - Map point detail parity and remove map timestamp chips

Created: 2026-07-12 08:42  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Implementation handoff for Claude Code  
Related TODO: #71 Veður: allir spápunktar og fjarlægð frá vegi

Status: Plan/handoff only. No implementation approval for Codex. Intended for Claude Code.

## Context From Stebbi

Stebbi reported two issues in the Ferðaveður route audit map:

1. The map itself now shows timestamp chips on some point markers. This is confusing and should be removed from the map canvas.
2. When a user taps a point on the map, the detail panel does not show the same rich information as the "Mest krefjandi á leiðinni" panel. The selected point and the worst point should show the same kind of data.

User-facing requirement:

> Taka timestampið út úr kortinu sjálfu. Þegar smellt er á punkt þarf að sýna nákvæmlega sömu gögn fyrir valinn punkt og versta punkt.

## Codex Review / Likely Root Cause

This looks concentrated in the existing #71 map/detail code:

- `components/weather/TravelAuditMap.tsx`
  - `makeTimeLabelSvg()`
  - `chipMarkersRef`
  - effect comment: "Update marker icons, opacity (filter de-emphasis), and time chips when state changes"
  - block that creates a Google Maps `Marker` using `makeTimeLabelSvg(formatKlTime(timeIso))`
- `components/weather/travelAuditMap.helpers.ts`
  - `buildPointSummary()`
  - currently suppresses metrics for active-candidate non-displayPoint route points.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `RoutePointRow`
  - currently shows active-candidate-safe full weather details only when `pt.routeIndex === activeCandidate.displayPoint?.routeIndex`; other points return `null` unless no-data.
- `lib/__tests__/travelAuditMap.helpers.test.ts`
  - currently includes a test named like "hides summaryForWindow metrics for a non-matching point when activeCandidate present". That old expectation now conflicts with Stebbi's new requirement.

The earlier suppression was understandable because `summaryForWindow` can belong to a different/default departure window. But the right fix is not to hide data. The right fix is to compute the selected point's active-slot forecast from `pt.forecastRows` nearest to the active candidate ETA for that point.

## Implementation Requirement

### 1. Remove timestamp chips from the map canvas

Remove the timestamp chip markers from `TravelAuditMap`.

Expected behavior:

- Route point dots/markers remain visible.
- Selected point marker remains visually selected.
- Best/worst non-color labels (`✓`, `!`) remain if still intended.
- No black/dark `HH:mm` chip should float over the map itself.
- Point details below the map may still show times. The requirement is only to remove timestamps from the map canvas.

Likely implementation:

- Remove or disable:
  - `makeTimeLabelSvg()`
  - `chipMarkersRef`
  - clearing/creating chip markers
  - related cleanup if no longer needed
- Keep marker click handling intact.
- Do not remove the selected marker state or the "jump to worst point" behavior.

### 2. Selected map point must show the same rich data shape as worst point

The selected point panel and the worst point panel should use the same data shape and field order:

1. Semantic label/title:
   - worst point: `Mest krefjandi á leiðinni`
   - manually selected point: existing `Valinn punktur`/manual title is okay
2. `Punktur x/y`
3. `Brottfarartími: kl. HH:MM` when active candidate is known
4. `Áætlaður tími ...: kl. HH:MM`
5. `Spápunktur um X m frá veginum.`
6. `Veðurspá á þessum stað kl. HH:MM`
7. `Vindur: X m/s · Úrkoma: Y mm/klst · Hiti: Z°C`
8. Existing links/buttons:
   - `Spá 🥄`
   - `Skoða veðurspá`
   - `Opna á korti`
   - `Hrá met.no gögn`

Important:

- Do not fall back to stale `summaryForWindow` values when active candidate/selected departure exists.
- Do not show only the decisive metric for worst point if full values are available.
- Do not hide full values for manually selected non-displayPoint points if `forecastRows` are available.
- No-data points may keep a calm no-data message.

### 3. Add one shared helper for active point values

To avoid the same bug returning, prefer one helper used by both:

- `TravelAuditMap` selected point panel
- `RoutePointRow` in `Allir spápunktarnir á leiðinni`

Suggested helper shape, exact name optional:

```ts
derivePointWeatherForCandidate(pt, activeCandidate, activeLeg)
```

It should:

- compute ETA with existing `estimatePointEtaIso(activeCandidate, pt, activeLeg)`;
- find nearest row in `pt.forecastRows`;
- return:
  - `forecastTimeIso`
  - `windMs`
  - `precipMmPerHour`
  - `airTemperatureC`
  - optional `gustMs` internally if needed, but do not add hviður to UI in this task unless already shown in the same panel;
  - `etaIso`
  - no-data marker if no rows exist.

Then `buildPointSummary()` can use:

- active-candidate row for any selected/active point when available;
- `activeCandidate.displayPoint` as a source of truth only for the decisive point if it already carries the exact same row values;
- `summaryForWindow` only when there is no active candidate.

### 4. Update tests

Required test updates:

- Remove/replace the old expectation that non-displayPoint active-candidate points hide metrics.
- Add tests that:
  - `buildPointSummary()` uses nearest `forecastRows` to active ETA for a non-displayPoint selected point.
  - `buildPointSummary()` continues to use `displayPoint` for the worst/decisive point.
  - it does not use stale `summaryForWindow` when active candidate is present.
  - no-data/empty `forecastRows` returns no-data/empty values without crashing.
- If `TravelAuditMap` chip behavior is covered, update/remove the chip-related test expectation.

Run at least:

```bash
npm run type-check
npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts
```

If there are broader weather UI tests, run those too.

## Design.md Notes

Relevant constraints already checked by Codex:

- Mobile-first, no horizontal overflow.
- Text must not overlap controls.
- Selected-state summary panels should use stable compact rows, not card-in-card complexity.
- Colors alone must not communicate state.

This change should make the map visually calmer by removing floating timestamp chips and move the time context into the detail panel where it is easier to read.

## Out Of Scope

Do not include in this task:

- Veðurstofa Íslands source work.
- Route-provider changes.
- Route option ranking.
- SQL, RLS, Supabase, auth, admin analytics, or public quota changes.
- Reintroducing hviður in the UI.
- Changing the forecast drawer itself except preserving/opening it from the selected point.

## Localhost Checks For Stebbi

Prerequisite:

- Run localhost as usual.
- Use `/vedrid` public or `/auth-mvp/vedrid` logged-in, whichever is easiest.
- Pick a route that renders many route weather points on the map, for example Garðabær -> Stóra-borg, Garðabær -> Akranes, or a longer route.

Checks:

1. Reikna ferð og klára niðurstöðu.
2. Horfa á kortið sjálft.
3. Expected: no black/dark `HH:mm` timestamp chip appears on top of map markers.
4. Expected: route point dots remain visible and clickable.
5. Click the automatically selected/worst point.
6. Expected: detail panel shows full rich data:
   - `Punktur x/y`
   - departure time when available
   - ETA/distance from origin
   - forecast point distance from road
   - forecast time
   - wind, precipitation, temperature
   - existing links/buttons
7. Click a different map point that is not the worst point.
8. Expected: selected point panel shows the same kind of rich data, not just sparse location/time info.
9. Change departure slot in scrubber.
10. Expected: selected point details update to the active departure time and do not reuse stale `summaryForWindow` values from a different/default window.
11. Open `Allir spápunktarnir á leiðinni`.
12. Expected: `Punktur x/y` rows use the same active-slot weather details for all points with data.
13. Test mobile width 360-460 px.
14. Expected: no horizontal overflow, no map/detail overlap, links wrap naturally.

No Supabase, SQL, auth, RLS, secrets, billing, or production data changes are expected for this task.

## Codex Bottom Line

This is a good quick cleanup, but it should not be fixed by only deleting the visible chip. The deeper issue is data parity: selected map points need active-candidate-safe point weather just like the worst point. The safest implementation is a shared point-summary helper that derives the forecast row nearest to the selected point ETA and is used by both the map detail panel and the all-points rows.
