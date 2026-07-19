# 2026-07-18 15:32 - TODO 086 v499 - Codex review of v498 prerelease

Created: 2026-07-18 15:32
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `ai-handoff/2026-07-18-1530-todo-086-v498-claude-v497-done-prerelease.md`

Review stance: prerelease review only. No product code, SQL, env, commit, push, deploy, migration, Supabase, Vercel, or production action was performed.

## Findings

No blocking findings.

1. **Low / process: v498 handoff is missing `Localhost checks for Stebbi`**

   `ai-handoff/2026-07-18-1530-todo-086-v498-claude-v497-done-prerelease.md` does not include the required `Localhost checks for Stebbi` section. For a comment-only SQL documentation change, the section can simply say there is nothing product-visible to test and SQL82 should not be run casually.

   This does not affect code safety, but Claude Code should keep this section in every handoff.

2. **Low: SQL82 still describes `sql/81` as a dependency even though the migration body does not depend on chat**

   `sql/82_weather_user_preferences.sql:21-24` now correctly says:

   - `sql/01_schema.sql` defines `public.profiles`
   - `sql/04_teskeid_schema.sql` defines `public.teskeid_set_updated_at()`

   Good.

   The same block also says `sql/81 (or later) — chat target types; must already exist.` I do not see a hard SQL dependency from `weather_user_preferences` to chat target types. This is probably just because SQL82 comes after SQL81 in migration order, but as written it sounds like a functional dependency.

   Optional cleanup before running SQL82: change that line to something like `Migration order: numbered after sql/81; no chat-table dependency.` Or remove it entirely.

## What Looks Good

- The incorrect `profiles` dependency source is fixed in `sql/82_weather_user_preferences.sql:22`.
- The shared trigger function dependency is now accurate in `sql/82_weather_user_preferences.sql:23`.
- The SQL body still uses explicit grants, RLS, own-row policy, and the shared `public.teskeid_set_updated_at()` trigger.
- SQL82 was still not run. Correct.
- v498 is comment-only and did not introduce product behavior changes.

## SQL82 Status

Do **not** run SQL82 yet for current `/vedrid` testing.

SQL82 is for the later saved default weather-threshold preferences feature. It is not required for the current overview map, provider pills, wind-status colors, or `/ferdalagid` parity.

Before running SQL82 in any environment, I would clean up the optional `sql/81` dependency wording so the migration header does not imply an unnecessary chat dependency.

## Commands Run

No tests or type-check were run for this v498 review because the claimed change is comment-only in `sql/82_weather_user_preferences.sql`.

Inspected:

```bash
Get-Content -Encoding UTF8 'ai-handoff/2026-07-18-1530-todo-086-v498-claude-v497-done-prerelease.md'
Get-Content -Encoding UTF8 'sql/82_weather_user_preferences.sql'
rg -n "sql/01_schema|sql/04_teskeid_schema|profiles|teskeid_set_updated_at|Localhost checks" ...
git status --short 'sql/82_weather_user_preferences.sql' 'ai-handoff/2026-07-18-1530-todo-086-v498-claude-v497-done-prerelease.md'
```

## Release / Testing Stance

Ready for Stebbi localhost testing.

This v498 comment-only cleanup does not need to block UI testing. I would still avoid running SQL82 until the saved-threshold phase starts, and I would clean the `sql/81` wording before that migration is executed.

## Localhost Checks For Stebbi

There is nothing new to verify in the browser from v498 itself because it only corrects a SQL comment.

For the broader current feature state:

1. Open `http://localhost:3004/vedrid`.
2. Confirm overview marker colors and filter pills still match `/vedrid/ferdalagid`.
3. Confirm threshold changes still update marker colors/counts.
4. Do not expect saved default threshold persistence yet.
5. Do not run SQL82 unless Stebbi explicitly decides to start the saved preferences phase.

## Óvissa / þarf að staðfesta

No blocking uncertainty. I did not run tests because v498 is comment-only. The only uncertainty is whether Claude Code intentionally wants SQL82 to be sequenced after SQL81 for project-history reasons; if so, the comment should say "migration order" rather than "dependency."
