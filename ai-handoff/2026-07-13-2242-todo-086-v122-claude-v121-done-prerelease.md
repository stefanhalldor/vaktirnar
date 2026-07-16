# TODO 086 v122 - Claude v121 done, prerelease

Created: 2026-07-13 22:45 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-13-2237-todo-086-v121-codex-v119-screenshot-correction.md` + v120 findings 1, 2, 4

## What changed

### UI fix: MET/Yr cards always say `met.no`, not `met.no + Veðurstofan`

The `metnoBlendedLabel` is no longer passed to `RoutePointRow`. MET/Yr route point cards always show `met.no` regardless of whether Veðurstofan is toggled on.

If the underlying assessment uses blended values, that fact is conveyed by the provider filter panel (disclaimer text) and the group heading, not by relabelling each individual MET/Yr card.

### UI fix: explicit group headings with point counts

"Allir spápunktarnir" now has explicit section headings when `vedurstofanLayer` is present:

- MET/Yr section: `met.no punktar ({count})` — shown when `showMetno` is true
- Veðurstofan section: `Veðurstofustöðvar við leiðina ({count}, í prófun)` — shown when `showVedurstofan && layer.points.length > 0`

With both on, the user sees two clearly separated sections with distinct counts — e.g., `met.no punktar (72)` followed by `Veðurstofustöðvar við leiðina (4, í prófun)`. The total is not 72 but 72 + N.

With only Veðurstofan on: only the Veðurstofan section appears (no MET/Yr heading or cards). With only met.no on: only the MET/Yr section appears (the heading is hidden when no vedurstofanLayer exists, keeping the normal UI).

### Server fix: true point-to-segment distance (`route.ts`)

Replaced the nearest-vertex `distanceToPolylineM` with a proper point-to-segment implementation:

Added `pointToSegmentM(pLat, pLon, aLat, aLon, bLat, bLon)` using a local planar approximation (cosine-corrected lat/lon → metres). `distanceToPolylineM` now iterates consecutive segment pairs and returns the minimum segment distance, not just the minimum vertex distance.

A station located at the midpoint between two route vertices now correctly shows near-zero distance instead of the vertex-to-station distance.

### Regression tests added (`weather-travel-api.test.ts`)

Two new tests (total tests: 26):

1. **Station-based dedupe regression**: 2 route sample points both mapping to the same station → `points.length === 1`. This test would have failed with the old per-route-sample loop.

2. **Station-based routePointId format**: asserts `routePointId === 'vedurstofan_${stationId}'` and `routeIndex === undefined`.

### Type comments updated (`vedurstofanBlend.ts`)

- `mappedPointCount`: now says "Unique Veðurstofan stations fetched for this route"
- `points` array: now says "One entry per unique Veðurstofan station"
- `distanceM`: now says "nearest segment of the route polyline"
- `routePointId`: now says `vedurstofan_{stationId}`

### Translation keys added

Both `messages/is.json` and `messages/en.json`:

| Key | is | en |
|---|---|---|
| `metnoSectionLabel` | met.no punktar ({count}) | met.no points ({count}) |
| `vedurstofanPointsSectionLabel` | Veðurstofustöðvar við leiðina ({count}, í prófun) | Veðurstofan stations near route ({count}, in testing) |

`metnoBlendedLabel` still exists in message files but is no longer referenced in code. It can be removed in a later cleanup.

## Open gaps (not in scope)

- Map markers for Veðurstofan stations
- Worst-point and selected-map-point surfaces showing Veðurstofan station cards
- All-stale → `available` top-level status (v115/v120 finding)
- `mm/klst` unit in places other than `VedurstofanPointRow`

## Tests and type-check

```
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
# 2 files passed, 26 tests passed

npm run type-check
# exit 0
```

## Files changed

- `app/api/teskeid/weather/travel/route.ts` — `pointToSegmentM` + updated `distanceToPolylineM`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — always `met.no` label, section headings with counts
- `lib/__tests__/weather-travel-api.test.ts` — 2 new regression tests
- `lib/weather/providers/vedurstofanBlend.ts` — type comments updated
- `messages/is.json` — `metnoSectionLabel` added, `vedurstofanPointsSectionLabel` updated with `{count}`
- `messages/en.json` — same

## Localhost checks for Stebbi

Preconditions: `elta-vedrid` access, `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`, `WEATHER_ELTA_VEDRID_FLAG=true`, product table warmed.

1. Run the same route as in the screenshot.
2. Turn both `met.no` and `Veðurstofan` on.
3. Open "Allir spápunktarnir". Confirm two clearly separated sections:
   - `MET/YR PUNKTAR (72)` section with normal route point cards
   - `VEÐURSTOFUSTÖÐVAR VIÐ LEIÐINA (N, Í PRÓFUN)` section with station cards
4. Confirm MET/Yr cards say `met.no` only — not `met.no + Veðurstofan`.
5. Confirm Veðurstofan station cards do NOT show `Punktur 1/72`, `Yr`, or `Hrá met.no gögn`.
6. Confirm each Veðurstofan station appears at most once (no duplicates).
7. Turn `met.no` off, leave `Veðurstofan` on: only the Veðurstofan station section remains.
8. Turn `Veðurstofan` off, leave `met.no` on: only the normal MET/Yr cards remain (no section heading since vedurstofanLayer exists but isn't shown).
9. Check station distances against visual route position for sanity.
10. At 360, 390, 460 px: no overflow, headings and cards wrap cleanly.
11. With flags off: existing flow unchanged.
