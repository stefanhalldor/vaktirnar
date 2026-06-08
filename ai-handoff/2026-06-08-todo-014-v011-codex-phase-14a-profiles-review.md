# TODO #14 - Codex Review Of Phase 14A Profiles Handoff

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v011  
**Reviews:** `2026-06-08-todo-014-v010-claude-phase-14a-profiles-handoff.md`

## Findings

No blocking findings.

Phase 14A is approved for Stebbi-controlled SQL/application rollout.

## Verification Performed By Codex

Codex reviewed:

- `ai-handoff/2026-06-08-todo-014-v010-claude-phase-14a-profiles-handoff.md`
- `sql/41_profiles_select_own.sql`
- `app/(app)/children/[id]/page.tsx`
- `lib/__tests__/profiles-14a.test.ts`

Codex also ran:

- `npm run type-check` - passed.
- `npm run test:run` - passed: 26 test files, 739 passed, 22 skipped, 8 todo.
- `git diff --check` for Phase 14A files - passed.

## Review Notes

`sql/41_profiles_select_own.sql` is appropriately scoped:

- It drops and recreates only `public.profiles` policy `profiles_select`.
- It changes authenticated profile reads from broad `USING (true)` to
  `USING (id = auth.uid())`.
- It does not mutate existing data rows.
- It leaves service-role RPC paths unaffected.

The legacy Path A defensive change is appropriate:

- `app/(app)/children/[id]/page.tsx` now handles `row.parent` being null.
- The fallback key uses `parent-${idx}` rather than one repeated `unknown` key.
- Co-parent display names may disappear under `LEGACY_ENABLED=true`, which
  Stebbi accepted as Path A.

The tests are static regression tests, not live Supabase/RLS integration tests.
That is acceptable for this phase as long as Stebbi runs the SQL preflight before
applying `sql/41`.

## Operational Note

V010 lists deployment order as preflight, apply `sql/41`, then deploy app. Since
the app optional-chaining change does not depend on `sql/41`, the lowest-risk
order is:

1. Deploy the app optional-chaining fix.
2. Run the read-only preflight.
3. Apply `sql/41`.

If Stebbi has confirmed `LEGACY_ENABLED=false` in production, V010's SQL-first
order is also acceptable because the affected legacy page is middleware-blocked.
The app-first order simply removes an avoidable crash window if the flag is ever
different from expected.

## SQL Preflight For Stebbi

Before applying `sql/41`, Stebbi should run:

```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';
```

Expected current state: `profiles_select` exists and has broad `qual = true`,
unless production has already been hardened.

## Codex Decision

Codex approves Phase 14A.

Claude Code should not start Phase 14C until Stebbi confirms how Phase 14A will
be rolled out and whether `sql/41` has been applied.

