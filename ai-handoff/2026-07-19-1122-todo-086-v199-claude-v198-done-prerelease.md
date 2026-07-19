# 2026-07-19 11:22 - TODO 086 v199 - Claude done: v198 save-button fix, pre-release

Created: 2026-07-19 11:22
Timezone: Atlantic/Reykjavik

## What Was Fixed

### Save-default button visibility now correct for all users (v198 blocker)

Files: `components/weather/WeatherThresholdBar.tsx`, `components/weather/WeatherOverviewClient.tsx`

**Root cause of the bug**: The button compared draft values against the live
applied `thresholds`. But `onApply` fires immediately on valid typing, updating
`thresholds` to match the draft. So `draftDiffersFromApplied` became false
instantly after typing, hiding the button before the user could click it.

**Fix**: Added `savedThresholds?: { cautionWindMs, redWindMs } | null` prop to
`WeatherThresholdBar`. Button visibility now compares draft against
`savedThresholds` (the server-persisted defaults), not against the live session
thresholds.

**Visibility rules**:

| Situation | Button visible? |
|---|---|
| Public user, valid values typed | Yes — `savedThresholds` is null, any valid draft shows the button |
| Logged-in, no saved defaults yet | Yes — same, `savedThresholds` is null |
| Logged-in, saved defaults exist, draft differs from saved | Yes |
| Logged-in, saved defaults exist, draft matches saved | No — already saved |
| Any user, invalid or unchanged values | No |

`showSaveButton = onSaveDefault != null && draftIsValid && draftDiffersFromSaved`

Public users see the button for any valid edit and are redirected to login on
click. Authenticated users see it when their draft differs from what's already
saved. Both cases behave correctly.

`WeatherOverviewClient` passes `savedThresholds={savedDefaultThresholds}` to
the bar.

## Test Results

- `npm run type-check`: exit 0
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts`
  3 files, 76 tests, exit 0

## Localhost Checks for Stebbi

### Save-default button

**Public / logged-out:**
1. Open `/vedrid`
2. Type a valid value into Óþægilegt or Hættulegt
3. Expected: map updates immediately, save button appears
4. Click save button — expected: redirect to `/innskraning` only now

**Logged-in, no saved defaults:**
1. Open `/vedrid`
2. Type valid values
3. Expected: map updates, save button appears
4. Click save — expected: saves once, button stays visible until reload
5. Reload — expected: saved values auto-apply, button hidden (draft matches saved)

**Logged-in, saved defaults already exist:**
1. Reload page — expected: saved values loaded and applied, button hidden
2. Change Óþægilegt to something else — expected: button appears
3. Change it back to the saved value — expected: button disappears again
4. Click save with a different value — expected: saves the new value

## Migration Status (unchanged)

- sql/82: required for saved wind thresholds
- sql/83: required for Vegagerðin history fallback
- sql/86: required for route-memory
- sql/87: prepared, NOT required, safe to run after sql/86 when Stebbi approves
- sql/85: do not run

## All Files Changed This Session

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherThresholdBar.tsx`
- `lib/iceland-routes/routeMemory.server.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `lib/__tests__/weather-route-memory-migration.test.ts`
- `vercel.json`
- `messages/is.json`
- `messages/en.json`
- `sql/87_weather_route_memory_route_cautions.sql` (new, not run)
