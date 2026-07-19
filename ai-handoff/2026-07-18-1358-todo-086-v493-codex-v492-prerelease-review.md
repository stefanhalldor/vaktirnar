# 2026-07-18 13:58 - TODO 086 v493 - Codex review of v492 prerelease

Reviewed handoff:
- `ai-handoff/2026-07-18-1308-todo-086-v492-claude-v491-done-prerelease.md`

Review stance: prerelease review. No code, SQL, env, commit, push, deploy, or production action was performed.

## Findings

No blocking findings.

1. **Low: test fixture naming can confuse future readers**

   `lib/__tests__/windObservationStatus.test.ts:8` defines `defaultThresholds` as `15/25`, while production driving defaults are now `10/15`. The new tests also define `tightThresholds` at `10/15` and explicitly use that for production boundary checks, so behavior is covered. This is not a product bug, but the name `defaultThresholds` now reads like production defaults even though it is really a generic/legacy fixture.

   Optional cleanup: rename `defaultThresholds` to something like `legacyWideThresholds` or `wideThresholds` in this test file only.

2. **Low: SQL 82 helper-function comment is slightly overstated**

   `sql/82_weather_user_preferences.sql:68` says the migration reuses a shared function “if available, otherwise fall back,” but the SQL always creates and uses `public.set_weather_user_preferences_updated_at()`. The migration is still safe directionally; this is just documentation drift.

   Optional cleanup: either reuse the existing shared `public.teskeid_set_updated_at()` if that is the project preference, or adjust the comment to say this migration uses its own small trigger function.

## What Looks Good

- v492 adds deterministic tests for `classifyNowAnchoredForecastWindDisplayStatus` using fake timers.
- The tests cover the important edges: empty forecasts, null closest row, past/future closest selection, single row, calm wind, and 10/15 boundary behavior.
- v490's main parity change still looks directionally correct: `/vedrid` overview now classifies Veðurstofan markers by forecast wind status rather than freshness, and both providers feed the same status-pill component.
- SQL 82 is still not run, which is correct for this phase.

## SQL 82 Answer, Still Current

Do **not** run SQL 82 just to test v492.

SQL 82 only prepares a future table for authenticated users to save their default wind thresholds. It does not enable the current `/vedrid` color/status/filter behavior, and it will not produce visible UI changes until GET/PUT API routes and client persistence are implemented.

When the saved-default-threshold phase starts, SQL 82 can be run as the DB prerequisite, after Stebbi explicitly approves running it.

## Commands Run

```bash
npm run type-check
```

Result: exit 0.

```bash
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```

Result: exit 0. 8 files passed, 322 tests passed, 5 skipped.

## Release / Testing Stance

Ready for Stebbi localhost testing.

I would not block this on the two low notes above. They can be cleaned up opportunistically, or rolled into the saved-threshold preferences phase.

Do not run SQL 82 yet unless Stebbi explicitly decides to begin saved threshold preferences.

## Localhost Checks For Stebbi

1. Open `http://localhost:3004/vedrid`.
2. Confirm both provider pills are visible where expected: `Vegagerðin (núna)` and `Veðurstofan (spá)`.
3. Confirm marker colors are driven by wind thresholds, not freshness:
   - calm stale Veðurstofan stations should not become orange just because data is stale
   - high-wind Veðurstofan forecasts should become amber/orange/red based on the same labels as `/ferdalagid`
4. Confirm the status filter pills under the map match `/vedrid/ferdalagid` labels and colors.
5. Toggle provider pills and confirm the status counts update.
6. Change thresholds from 10/15 to stricter/looser values and click `Setja`; confirm map colors and counts update without reload.
7. Open a station detail, then filter out that station's status; the detail card should disappear cleanly.
8. Open `/vedrid/ferdalagid` and confirm the status pills/colors still match the overview.

