# 2026-07-18 15:29 - TODO 086 v497 - Codex review of v496 prerelease

Created: 2026-07-18 15:29
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `ai-handoff/2026-07-18-1527-todo-086-v496-claude-v495-done-prerelease.md`

Review stance: prerelease review only. No product code, SQL, env, commit, push, deploy, migration, Supabase, Vercel, or production action was performed.

## Findings

No blocking findings.

1. **Low: SQL82 dependency comment points `profiles` at the wrong migration**

   `sql/82_weather_user_preferences.sql:21-24` now has a helpful `Dependencies:` block, but line 23 says `sql/04_teskeid_schema.sql` defines `public.profiles`. In this repo, `public.profiles` is created by `sql/01_schema.sql`; `sql/04_teskeid_schema.sql` defines `public.teskeid_set_updated_at()`.

   This is documentation drift only, not a runtime bug in the migration body. Because SQL82 is not being run yet, I would not block localhost testing on this. Before Stebbi runs SQL82, Claude Code should adjust the comment to:

   - `sql/01_schema.sql` — defines `public.profiles`
   - `sql/04_teskeid_schema.sql` — defines `public.teskeid_set_updated_at()`

## What Looks Good

- v496 fixed the workflow hygiene issue for future handoffs by using `Created: 2026-07-18 15:27`.
- v496 did not retroactively edit old handoffs, which is the right call.
- SQL82 still correctly uses `public.teskeid_set_updated_at()` in the trigger body.
- SQL82 was still not run. Good.
- No code behavior changed in v496; this is comment/documentation cleanup only.

## SQL82 Status

Do **not** run SQL82 yet for `/vedrid` localhost testing.

SQL82 is still a future migration for saved authenticated user weather thresholds. It is not required for current threshold controls, overview map colors, provider pills, or `/ferdalagid` parity.

Before actually running SQL82, fix the dependency comment described above so the runbook is accurate. The migration body itself still looks directionally safe: dedicated table, explicit grants, RLS enabled, own-row policy, and shared updated-at trigger.

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

I would not block the current UI testing on the low dependency-comment finding. I would fix that comment before SQL82 is run in any environment.

## Localhost Checks For Stebbi

1. Open `http://localhost:3004/vedrid`.
2. Confirm both provider pills still render and toggle correctly.
3. Confirm the overview map uses the same status colors and status filter pills as `/vedrid/ferdalagid`.
4. Adjust weather thresholds in the overview and click `Setja`; marker colors and counts should update.
5. Open `http://localhost:3004/vedrid/ferdalagid` and confirm the route map still matches the overview status language and colors.
6. Do not expect saved default threshold persistence yet. SQL82 and the preference API/client work are still a later phase.

## Óvissa / þarf að staðfesta

No blocking uncertainty. I did not run browser tests or the full test suite. The review is based on v496, SQL82 file inspection, repo migration search, type-check, and targeted tests.
