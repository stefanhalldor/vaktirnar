# 2026-07-18 15:34 - TODO 086 v501 - Codex review of v500 prerelease

Created: 2026-07-18 15:34
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `ai-handoff/2026-07-18-1534-todo-086-v500-claude-v499-done-prerelease.md`

Review stance: prerelease review only. No product code, SQL, env, commit, push, deploy, migration, Supabase, Vercel, or production action was performed.

## Findings

No findings.

## What Looks Good

- `sql/82_weather_user_preferences.sql:21-24` now has accurate dependency wording:
  - `sql/01_schema.sql` for `public.profiles`
  - `sql/04_teskeid_schema.sql` for `public.teskeid_set_updated_at()`
  - `sql/81` described only as migration ordering, not a functional chat-table dependency
- v500 includes `Localhost Checks For Stebbi`, including the correct note that this comment-only SQL update has no direct browser-visible effect.
- SQL82 remains unrun. Good.
- The migration body still looks directionally safe for the later saved-threshold phase: explicit grants, RLS enabled, own-row policy, shared updated-at trigger, and rollback note that does not drop shared functions.

## SQL82 Status

SQL82 is now clean enough as a migration file for the future saved-threshold phase, but it is still not needed for current `/vedrid` testing.

Do **not** run SQL82 unless Stebbi explicitly starts the saved weather-threshold preferences phase and asks to run the migration.

## Commands Run

No type-check or tests were run for this v500 review because the change is comment-only in `sql/82_weather_user_preferences.sql`.

Inspected:

```bash
Get-Content -Encoding UTF8 'ai-handoff/2026-07-18-1534-todo-086-v500-claude-v499-done-prerelease.md'
Get-Content -Encoding UTF8 'ai-handoff/README.md'
Get-Content -Encoding UTF8 'sql/82_weather_user_preferences.sql'
git diff -- 'sql/82_weather_user_preferences.sql' 'ai-handoff/2026-07-18-1534-todo-086-v500-claude-v499-done-prerelease.md'
```

## Release / Testing Stance

Ready for Stebbi localhost testing of the broader v490+ UI behavior.

v500 itself is documentation cleanup only and should not block anything.

## Localhost Checks For Stebbi

No new browser behavior is expected from v500 itself.

For the broader current state:

1. Open `http://localhost:3004/vedrid`.
2. Confirm the map markers use wind-threshold status colors, not freshness colors.
3. Confirm the status filter pills under the overview map match `/vedrid/ferdalagid`.
4. Change thresholds and click `Setja`; marker colors and counts should update.
5. Do not expect saved threshold persistence yet.
6. Do not run SQL82 until the saved-threshold preferences phase is explicitly started.

## Óvissa / þarf að staðfesta

No blocking uncertainty. I did not run browser tests or full test suite because v500 is comment-only.
