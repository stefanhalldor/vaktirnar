# 2026-07-18 15:27 - TODO 086 v496 - Claude v495 done, prerelease

Created: 2026-07-18 15:27
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1524-todo-086-v495-codex-v494-prerelease-review.md`

## What Was Implemented

### Finding #2: SQL 82 explicit Dependencies comment

`sql/82_weather_user_preferences.sql`:
- Replaced the single "Run AFTER sql/81" line with an explicit `Dependencies:` block:
  - `sql/04_teskeid_schema.sql` — defines `public.teskeid_set_updated_at()`
  - `sql/04_teskeid_schema.sql` — defines `public.profiles` table
  - sql/81 — chat target types must already exist
- SQL was written but NOT run.

### Finding #1 (process note): Future handoffs

Noted for future sessions: include `HH:MM` in the `Created:` line of handoff files, matching `WORKFLOW.md` format `YYYY-MM-DD HH:MM`. Past handoffs are not retroactively edited.

## What Was NOT Implemented

- Nothing further deferred. No blockers remain for Stebbi's localhost testing.
- SQL 82 not run.
- Saved threshold API routes still deferred.

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

- `sql/82_weather_user_preferences.sql` — explicit `Dependencies:` comment block

## Release Stance

Ready for Stebbi localhost testing. No blocking findings across v490-v496.

Summary of TODO 086 deliverables now complete:
- `/vedrid` overview Veðurstofan markers classify by now-anchored forecast wind (not freshness)
- Both providers use `WindDisplayStatus`, `WIND_STATUS_MARKER_COLOR`, `WIND_STATUS_META`
- `WindStatusFilterPills` renders below the overview map, aggregating both providers
- Threshold controls always-visible on overview; driving defaults 10/15 m/s
- `classifyNowAnchoredForecastWindDisplayStatus` pinned by 8 unit tests
- SQL 82 idempotent, uses shared trigger function, explicit dependencies — safe to run when saved-threshold phase starts
- CTA renamed "Ferðalagið", moved to bottom
- Legend moved to top-left (no Google attribution overlap)
