# 2026-07-17 13:30 — TODO-086 v419 — Claude Code: R1 marker title prerelease

Created: 2026-07-17 13:30
Timezone: Atlantic/Reykjavik

Source reviewed:
- `ai-handoff/2026-07-17-1215-todo-086-v418-codex-v417-hover-copy-and-vedrid-routing-plan.md`

## Phase R1 implemented — marker hover/title copy only

No routing changes. No env changes.

### Changes

| File | Change |
|------|--------|
| `components/weather/IcelandOverviewMap.tsx` | `markerTitle`: long dash → parentheses format |
| `messages/is.json` | 4 new `eltaVedrid` marker-title keys |
| `messages/en.json` | 4 new `eltaVedrid` marker-title keys |
| `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` | `statusLabel` uses dedicated title keys |

### Result

| Status | Title shown on hover |
|--------|----------------------|
| `ok` | `Festarfjall (ný spágögn)` |
| `stale` with `atimeIso` | `Festarfjall (spá útgefin kl. 09:00, ný á leiðinni)` |
| `stale` without `atimeIso` | `Festarfjall (eldri spá, ný á leiðinni)` |
| `unavailable` | `Festarfjall (engin spágögn til í Veðurstofuþjónustunni)` |

**Time extraction**: Iceland is always UTC+0, so `atimeIso.slice(11, 16)` gives correct local `HH:MM` with no timezone conversion needed.

**Filter labels unchanged**: `Ný gögn / Gömul gögn / Vantar gögn` remain in the filter tabs and station list summary strip. Only the marker tooltip uses the longer accessible descriptions.

### New i18n keys (`teskeid.vedrid.eltaVedrid`)

```json
"statusOkTitle":           "ný spágögn"                                         (IS)
                           "current forecast"                                    (EN)

"statusStaleTitle":        "spá útgefin kl. {time}, ný á leiðinni"              (IS)
                           "forecast from {time}, update on the way"             (EN)

"statusStaleTitleNoTime":  "eldri spá, ný á leiðinni"                           (IS)
                           "older forecast, update on the way"                   (EN)

"statusUnavailableTitle":  "engin spágögn til í Veðurstofuþjónustunni"         (IS)
                           "no forecast data available"                          (EN)
```

## Routing plan acknowledged (not implemented)

v418 proposes phases R2–R4 for routing `/vedrid` as the new overview landing and moving the trip wizard to `/vedrid/ferdalagid`. This is a separate, larger change that touches public/auth routing, saved places, restore state, `login-next`, and Púls `returnTo`. Not touched in this pass.

## Tests and type-check

- `npx tsc --noEmit`: clean
- `npx vitest run`: 96 test files, 2890 passed, 27 skipped, 8 todo

## Localhost checks for Stebbi

1. `/auth-mvp/vedrid/elta-vedrid`
   - Hover a green marker: title shows `Stöðvarheiti (ný spágögn)`
   - Hover an amber marker: title shows `Stöðvarheiti (spá útgefin kl. HH:MM, ný á leiðinni)` or `(eldri spá, ný á leiðinni)` if time unavailable
   - Hover a gray marker: title shows `Stöðvarheiti (engin spágögn til í Veðurstofuþjónustunni)`
   - Filter labels in tabs and summary strip unchanged

2. Close X still removes `stationId` from URL (v417 fix intact)

3. Route wizard station preview card unchanged

## Changes not committed

All changes are uncommitted. Commit and push require separate approval from Stebbi.
