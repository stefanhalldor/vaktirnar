# 2026-07-18 13:08 - TODO 086 v492 - Claude v491 done, prerelease

Created: 2026-07-18
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1305-todo-086-v491-codex-v490-prerelease-review-and-sql82-answer.md`

## What Was Implemented

### Finding #1: Unit tests for `classifyNowAnchoredForecastWindDisplayStatus`

`lib/__tests__/windObservationStatus.test.ts`:

Added import of `classifyNowAnchoredForecastWindDisplayStatus` alongside `classifyObservationWindDisplayStatus`.
Added a `tightThresholds` constant matching the production 10/15 m/s defaults.
Added a new `describe` block with 8 tests, using `vi.useFakeTimers()` / `vi.setSystemTime(NOW_MS)` for deterministic "now":

| Test | Assertion |
|------|-----------|
| empty forecasts | returns `no_data` |
| closest row has null wind | returns `no_data` |
| picks closest row, not first | 13:01 row (1 min ahead) beats 10:00 row (3 h past) |
| picks past row when closer | 12:59 row (1 min ago) beats 15:00 row (2 h ahead) |
| single row, non-null wind | classifies correctly (20 m/s → `othaegilegt`) |
| caution boundary at 10 m/s (tight) | `othaegilegt` |
| danger boundary at 15 m/s (tight) | `haettulegt` |
| null wind even with past timestamp | `no_data` |

All 8 tests pass.

### Finding #2 (low, deferred)

Long-open page re-anchoring: acknowledged as acceptable for now. No timer-based re-render tick added. Can be addressed in a later polish phase.

## What Was NOT Implemented

- Saved threshold GET/PUT API routes — deferred.
- SQL 82 not run.

## Commands Run

```
npm run type-check
```
Exit 0.

```
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```
Exit 0. 8 files, 322 tests passed, 5 skipped.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## Files Changed

- `lib/__tests__/windObservationStatus.test.ts` — 8 new tests for `classifyNowAnchoredForecastWindDisplayStatus`; `tightThresholds` constant; `vi/beforeEach/afterEach` imports

## Release Stance

v487 core requirement is now complete:
- Veðurstofan overview markers use forecast wind classification, not freshness.
- Both providers share `WindDisplayStatus`, `WIND_STATUS_MARKER_COLOR`, `WIND_STATUS_META`.
- `WindStatusFilterPills` renders below the overview map aggregating both providers.
- `classifyNowAnchoredForecastWindDisplayStatus` is pinned by 8 unit tests.
- SQL 82 is hardened and safe to run when Stebbi chooses to enable saved preferences.

Ready for localhost testing per the v490 localhost checklist.
