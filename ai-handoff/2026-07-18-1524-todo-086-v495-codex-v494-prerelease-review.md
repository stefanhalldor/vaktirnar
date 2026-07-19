# 2026-07-18 15:24 - TODO 086 v495 - Codex review of v494 prerelease

Created: 2026-07-18 15:24
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `ai-handoff/2026-07-18-1522-todo-086-v494-claude-v493-done-prerelease.md`

Review stance: prerelease review only. No product code, SQL, env, commit, push, deploy, migration, Supabase, Vercel, or production action was performed.

## Findings

No blocking findings.

1. **Low / process: v494 handoff `Created` line is missing clock time**

   `ai-handoff/2026-07-18-1522-todo-086-v494-claude-v493-done-prerelease.md` has `Created: 2026-07-18`, while `WORKFLOW.md` asks for `Created: YYYY-MM-DD HH:MM`. This does not affect code, SQL, auth, or release safety. It is just a workflow hygiene note for future Claude Code handoffs.

2. **Low: SQL82 depends on `public.teskeid_set_updated_at()` existing**

   `sql/82_weather_user_preferences.sql:70-73` now correctly uses the shared `public.teskeid_set_updated_at()` function. That is the right project-local reuse pattern and matches prior migrations. The only caveat is sequencing: SQL82 must only run after the base schema migration that defines that function, which is already documented by the reference to `sql/04_teskeid_schema.sql`.

   No change requested unless Claude Code wants to add an explicit `Dependencies:` comment line for `sql/04_teskeid_schema.sql`.

## What Looks Good

- `lib/__tests__/windObservationStatus.test.ts:8-22` now clearly separates `wideThresholds` from the production-style `tightThresholds`.
- `lib/__tests__/windObservationStatus.test.ts:79-167` keeps the now-anchored forecast classifier pinned with deterministic fake-timer tests.
- `sql/82_weather_user_preferences.sql:68-73` now reuses the shared `public.teskeid_set_updated_at()` trigger function instead of creating a one-off duplicate.
- `sql/82_weather_user_preferences.sql:77-83` now avoids telling the rollback to drop a shared function. Good catch.
- No SQL was run, which is still the right call at this phase.

## SQL82 Status

Do **not** run SQL82 just for this v494 cleanup.

SQL82 is a schema prerequisite for a later saved-default-threshold feature. It creates `public.weather_user_preferences` so authenticated users can eventually persist their default wind thresholds. It has no visible product effect until the API/client persistence layer exists.

When Stebbi explicitly decides to begin the saved-threshold phase, SQL82 looks directionally ready to run, assuming `sql/04_teskeid_schema.sql` has been applied in that environment.

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

I would not block on the two low notes. The v494 changes are cleanup/hardening around v493 and do not widen access, change RLS behavior beyond SQL82's not-yet-run file, or alter production data.

Still: do not run SQL82 until the saved-threshold preferences phase is explicitly started.

## Localhost Checks For Stebbi

1. Open `http://localhost:3004/vedrid`.
2. Confirm the overview map still renders and provider pills behave as before.
3. Confirm Veðurstofan marker colors/status filter pills are driven by wind thresholds, not data freshness.
4. Change thresholds from the visible controls and click `Setja`; marker colors and status counts should update.
5. Open `http://localhost:3004/vedrid/ferdalagid` and confirm the route map still uses the same labels/colors as overview.
6. No SQL82-visible behavior should be expected yet. Do not test saved default threshold persistence until a later API/client phase exists.

## Óvissa / þarf að staðfesta

No blocking uncertainty. I did not run the full test suite or browser tests. The review is based on the v494 handoff, targeted file inspection, type-check, and targeted tests.
