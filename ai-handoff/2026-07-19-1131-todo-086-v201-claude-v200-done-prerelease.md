# 2026-07-19 11:31 - TODO 086 v201 - Claude done: v200 dirty-flag fix, pre-release

Created: 2026-07-19 11:31
Timezone: Atlantic/Reykjavik

## Samþykki

Workflow + "framkvæma": afmarkað við kóðabreytingu samkvæmt v200.
Engin commit, push, deploy eða migration.

## What Was Fixed

### Save button dirty-flag (`WeatherThresholdBar.tsx`)

v200 flagged: for users with no saved defaults (`savedThresholds = null`),
`draftDiffersFromSaved` was always true, so the button appeared immediately on
page load before the user had edited anything.

Fix: added `dirty` state (boolean, false on mount). Set to true on any input
`onChange`. Reset to false when thresholds sync externally (after Reset or
server-loaded preference update via the `useEffect`).

`showSaveButton` now requires all four conditions:
- `onSaveDefault` is provided
- draft values are valid
- draft differs from saved defaults (or no saved defaults exist)
- user has touched at least one input (`dirty === true`)

**Resulting behavior for all user types:**

| Situation | Button visible? |
|---|---|
| Page load, no saved defaults (public or logged-in) | No — not edited yet |
| Page load, saved defaults loaded and auto-applied | No — not edited yet |
| User types valid different value | Yes |
| User types then reverts to saved default | No |
| After clicking save (savedThresholds updates, external sync resets dirty) | No — until next edit |

## Answers to v200 Questions

1. **Varasöm leið wired now?**
   No — deferred. sql/87 is prepared but not run. Upsert does not write
   `route_caution_ids`. Lookup returns `routeCautionIds: []`. The UI code is
   ready but the label cannot appear until sql/87 is run and SELECT is updated
   atomically in a future pass.

2. **Save button before user edits?**
   Fixed with dirty flag above. Button hidden until user touches an input.

3. **Hide generic variants that are subsets of curated?**
   Post-release. Current dedupe (Phase 1+2) collapses curated duplicates and
   prevents new ones. Subset-dominance logic deferred to next quality pass.

## Release Stance (from v200)

Conditional yes. Code is releasable for:
- route-memory collection and `/vedrid` route filter
- save-default button (public + authenticated)
- Vegagerðin cron on 3-minute schedule

Not yet complete:
- `Varasöm leið` labels in variant pills
- Generic `Leið 1` hiding when subset of curated variant

## Migration Gate (unchanged)

- sql/82: required for saved wind thresholds
- sql/83: required for Vegagerðin history fallback
- sql/86: required for route-memory
- sql/87: prepared, NOT required, safe to run after sql/86 when Stebbi approves
- sql/85: do not run

## Test Results

- `npm run type-check`: exit 0
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts`
  3 files, 76 tests, exit 0

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
