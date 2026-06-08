# TODO #14 - Phase 14A Handoff

**TODO item:** #14 - Öryggisforsendur fyrir opna beta
**Author:** Claude Code
**Date:** 2026-06-08
**Version:** v010
**Phase:** 14A - Profiles hardening
**Implements:** Path A as confirmed by Stebbi in v009

---

## 1. Exact files changed

| File | Status | Description |
|------|--------|-------------|
| `sql/41_profiles_select_own.sql` | New | Migration: replaces `profiles_select` policy |
| `app/(app)/children/[id]/page.tsx` | Modified | Defensive optional chaining on `row.parent` |
| `lib/__tests__/profiles-14a.test.ts` | New | 10 static regression tests |

No other files were touched.

---

## 2. Full SQL effects of sql/41

**Type:** Schema change only. No INSERT, UPDATE, DELETE, DROP TABLE, or ALTER TABLE on
any data table. No existing rows modified or deleted.

**What changes:**

```sql
-- Before (sql/01_schema.sql line 184, unchanged since project start):
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);

-- After (sql/41):
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
```

**Rollback (paste into Supabase SQL Editor if needed):**
```sql
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);
```

---

## 3. Was SQL run?

**No.** `sql/41_profiles_select_own.sql` has been written and is ready but has not been
applied to Supabase production. Stebbi runs SQL migrations manually after Codex review,
as established.

---

## 4. RLS, grants, auth impact

| Role | Before | After |
|------|--------|-------|
| `authenticated` | Can read any profile row | Can only read own profile row (`id = auth.uid()`) |
| `service_role` (BYPASSRLS) | Full access | Full access (unchanged) |
| `anon` | No access (no grant) | No access (unchanged) |

**All loan RPCs unaffected.** `get_my_loans`, `get_my_pending_invitations`,
`get_invitation_for_claim` all join `profiles` inside service_role functions that bypass
RLS. Confirmed in `sql/32_loan_functions.sql` lines 301-302, 357, 409.

**All Teskeid app code unaffected.** Both authenticated-client reads of `profiles` in
Teskeid code scope to the calling user's own row:
- `app/auth-mvp/heim/page.tsx`: `.from('profiles').select('display_name').eq('id', user.id)`
- `app/api/teskeid/profile/route.ts`: `.from('profiles').select('display_name').eq('id', user.id)`

---

## 5. Legacy Path A impact and optional chaining

**The problem this addresses:**
`app/(app)/children/[id]/page.tsx` reads co-parent display names via the authenticated
client with an embedded relation join. After sql/41, Supabase returns `null` for the
`parent` object on any co-parent row that is not the calling user. Without defensive
coding, `row.parent.id` on line 52 would throw:
`TypeError: Cannot read properties of null (reading 'id')`

**The fix (3 lines changed):**

```tsx
// Before:
{parents.map((row: any) => (
  <div key={row.parent.id} ...>
    <Avatar name={row.parent.display_name || '?'} size="sm" />
    <p>{row.parent.display_name || '—'}</p>

// After:
{parents.map((row: any, idx: number) => (
  <div key={row.parent?.id ?? `parent-${idx}`} ...>
    <Avatar name={row.parent?.display_name || '?'} size="sm" />
    <p>{row.parent?.display_name || '—'}</p>
```

- `row.parent?.id ?? 'parent-${idx}'`: index fallback prevents duplicate React keys
  if multiple co-parents have null profiles.
- `row.parent?.display_name || '?'` and `|| '—'`: renders fallback text, no crash.

**Production impact:** None. `LEGACY_ENABLED=false` is the production setting.
Middleware blocks all `/children/*` routes when `LEGACY_ENABLED` is not `true`.
The optional chaining protects local dev and any future `LEGACY_ENABLED=true` scenario.

---

## 6. Tests run and results

**New test file:** `lib/__tests__/profiles-14a.test.ts` — 10 static regression tests.

```
Test suite: sql/41_profiles_select_own.sql (5 tests)
  ✓ drops the old profiles_select policy
  ✓ creates profiles_select with USING (id = auth.uid())
  ✓ does not contain USING (true) in the CREATE POLICY line
  ✓ targets authenticated role only
  ✓ is wrapped in a transaction

Test suite: app/(app)/children/[id]/page.tsx — defensive optional chaining (3 tests)
  ✓ uses optional chaining on row.parent.id (key prop)
  ✓ uses optional chaining on row.parent.display_name
  ✓ uses index-based fallback key to avoid duplicate React keys

Test suite: app/auth-mvp/heim/page.tsx — own-profile read is scoped (1 test)
  ✓ scopes the profiles select to the calling user

Test suite: app/api/teskeid/profile/route.ts — own-profile read is scoped (1 test)
  ✓ scopes the profiles select to the calling user
```

**Full test suite:** 769 tests (739 passing, 22 skipped, 8 todo), 26 test files.
No regressions. All pre-existing tests pass.

---

## 7. git status --short

```
 M DONE.md
 M TODO.md
 M app/(app)/children/[id]/page.tsx
?? .obsidian/
?? ai-handoff/
?? app/preview/favicons/
?? app/preview/teskeid-logo/
?? lib/__tests__/profiles-14a.test.ts
?? public/favicon-options/
?? scripts/
?? sql/41_profiles_select_own.sql
?? sql/preflight/
```

Phase 14A changes are unstaged (`??` for new files, `M` for modified).
`DONE.md` and `TODO.md` are locally modified by Stebbi — not touched by Claude Code.

---

## 8. Remaining risks and questions for Codex

**No blocking risks identified.**

**One minor open point:**
The `profiles_update` policy from `sql/26` uses `USING (id = auth.uid())` and the
`profiles_insert_own` policy uses `WITH CHECK (id = auth.uid())`. After sql/41, all
three policies (SELECT, UPDATE, INSERT) are now consistent. Claude Code notes this
for completeness — it is not a risk, it is the intended result.

**Preflight reminder for Stebbi:**
Before applying sql/41 in Supabase, run:
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';
```
Confirm `profiles_select` shows `qual = true` (the current state). Then apply sql/41.
Then deploy the app with the optional chaining fix.

**Ready for Codex review.** Claude Code does not start Phase 14C until Codex approves
this handoff.
