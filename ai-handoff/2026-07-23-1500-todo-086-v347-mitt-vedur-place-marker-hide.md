# TODO-086 v347 - Post-release handoff: Mitt veður rename + place marker hide

## Context

Stebbi reported (Skjámynd 2026-07-23 130833) that DOM place name markers (green pill buttons) were still visible on the map while "Mitt veður" was active with selected items. These labels duplicated the station labels already shown by the weather cards.

Stebbi also requested renaming "Elta veðrið" to "Mitt veður" because the panel serves general weather browsing, not only chasing.

Stebbi gave explicit execution permission. Committed and pushed to production.

## Root cause of place marker issue

The chase markers useEffect (managing `weatherChaseActiveRef`) did not hide `placeMarkersRef` DOM markers when weather chase was active. The existing `updateRoadMapPlaceMarkerVisibility()` function -- which runs on map zoom -- also did not know about chase mode and would re-show markers on zoom changes.

## What was changed

### 1. Place markers hidden when Mitt veður is active

File: `components/weather/RoadMapPrototypeMap.tsx`

In the chase markers useEffect:
- When showing markers: set `weatherChaseActiveRef.current = true` and immediately set `element.style.display = 'none'` on all `placeMarkersRef.current` items.
- In cleanup: set `weatherChaseActiveRef.current = false` and restore place marker visibility using the same zoom-based logic as the route cancel flow (importance 3 always visible, importance 2 at zoom >= 5.8, others at zoom >= 7.2) -- but only if `routeActiveRef.current` is false.

In `updateRoadMapPlaceMarkerVisibility()` (the zoom listener inside `map.on('load')`): added `if (weatherChaseActiveRef.current) return` so zoom events do not re-show place markers while chase markers are active.

Note: `weatherChaseActiveRef` already existed (line ~1146) but was unused. It now has a purpose.

### 2. Rename Elta veðrið -> Mitt veður

Files: `messages/is.json`, `messages/en.json`

Changed user-visible strings only. The JSON namespace key `eltaVedrid` was left unchanged because it is used as a translation namespace in multiple files and changing it would require touching many unrelated components.

Strings changed:

| File | Key | Old | New |
|------|-----|-----|-----|
| is.json | `weatherCompareSection` | Fyrir þá sem eru að elta veðrið | Veldu staði og berðu saman veðrið |
| is.json | `eltaVedrid.title` | Elta veðrið | Mitt veður |
| is.json | `roadMapPrototypeWeatherChaseTitle` | Elta veðrið | Mitt veður |
| en.json | `eltaVedrid.title` | Chase the weather | My weather |
| en.json | `roadMapPrototypeWeatherChaseTitle` | Chase the weather | My weather |

The 🌦️ button aria-label in the map uses `t('roadMapPrototypeWeatherChaseTitle')` so it will automatically show "Mitt veður" in IS / "My weather" in EN.

## What was NOT changed

- The JSON namespace key `eltaVedrid` was not renamed (too many callers, no user-facing impact).
- The route `/auth-mvp/vedrid/elta-vedrid/` was not renamed (separate feature flag, out of scope).
- The `eltaVedrid` feature flag name was not changed.
- Raster tile basemap labels (from CartoDB Voyager tiles) remain visible -- these are baked into the tile images and cannot be suppressed individually. Only our DOM place markers are hidden.

## Commit

`cd65fa0` -- pushed to `main`.

## TypeScript check

Exit code `0`. No errors.

## Localhost checks for Stebbi

Page: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

1. Confirm the 🌦️ panel is now titled "Mitt veður" (not "Elta veðrið").
2. Add 2-3 stations in Mitt veður.
3. Confirm the green place name pill buttons (Akureyri, Reykjavík etc.) disappear when items are selected.
4. Zoom in and out -- confirm place markers do not reappear while Mitt veður items are selected.
5. Remove all stations from Mitt veður -- confirm place markers reappear at appropriate zoom levels.
6. Calculate a route -- confirm place markers stay hidden (handled by route mode, unchanged).
7. Cancel route with Mitt veður items still selected -- confirm place markers remain hidden (chase mode takes over).
8. Cancel route with no Mitt veður items -- confirm place markers reappear.
