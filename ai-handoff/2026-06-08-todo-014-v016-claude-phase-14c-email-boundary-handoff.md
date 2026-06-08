# Handoff v016 — Claude Code: Phase 14C email-boundary fix

**Date:** 2026-06-08
**Author:** Claude Code
**Phase:** 14C follow-up (email boundary on profile API route)
**For:** Codex — approving Phase 14B start

---

## Files changed

- `app/api/teskeid/profile/route.ts` — email boundary fix
- `lib/__tests__/teskeid-profile-route.test.ts` — 4 new tests

No SQL was written or run.

---

## What changed in `app/api/teskeid/profile/route.ts`

Both `GET` and `PATCH` handlers now check `if (!user?.email)` instead of `if (!user)`:

```typescript
if (!user?.email) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

The `email` field in the response bodies no longer has a `?? ''` fallback — it is now `user.email` (guaranteed non-null after the guard above).

This aligns the API route session boundary with `guardTeskeidSession()`, which already enforces `if (!user?.email) redirect('/innskraning')`.

---

## Confirmed invariants

- `GET /api/teskeid/profile` returns `401` when the Supabase user has no email (null or undefined). Supabase DB is not queried in that case.
- `PATCH /api/teskeid/profile` returns `401` when the Supabase user has no email. `upsert` is not called in that case.
- Both return `404` when `AUTH_MVP_ENABLED !== 'true'`.
- `email` field in response is now a non-optional string (no fallback).

---

## Tests added (4 new, all passing)

In `lib/__tests__/teskeid-profile-route.test.ts`:

| Test | Verifies |
|---|---|
| `GET` returns 401 when user exists but email is null | email boundary |
| `GET` returns 401 when user exists but email is undefined | email boundary |
| `PATCH` returns 401 when user exists but email is null, does not upsert | email boundary + no DB write |
| `PATCH` returns 401 when user exists but email is undefined, does not upsert | email boundary + no DB write |

---

## Test results

```
Test Files  27 passed (27)
Tests       764 passed | 22 skipped | 8 todo (794)
```

(Up from 760 before Phase 14C, up from 760 after v014. All 4 new tests are the email-boundary tests above.)

---

## git status --short

```
 M DONE.md
 M TODO.md
 M app/api/teskeid/profile/route.ts
 M app/auth-mvp/heim/page.tsx
 M lib/__tests__/guard.test.ts
 M lib/__tests__/home-page.test.tsx
 M lib/auth/guard.ts
 M lib/loans/guard.ts
?? .obsidian/
?? ai-handoff/2026-06-08-todo-014-v012-claude-phase-14c-ready.md
?? ai-handoff/2026-06-08-todo-014-v013-codex-phase-14c-ready-review.md
?? ai-handoff/2026-06-08-todo-014-v014-claude-phase-14c-session-feature-handoff.md
?? ai-handoff/2026-06-08-todo-014-v015-codex-phase-14c-review.md
?? app/auth-mvp/minn-profill/layout.tsx
?? app/preview/favicons/
?? app/preview/teskeid-logo/
?? lib/__tests__/teskeid-profile-route.test.ts
?? public/favicon-options/
?? scripts/
?? sql/preflight/
```

Untracked paths like `.obsidian/`, `app/preview/`, `public/favicon-options/`, `scripts/`, and `sql/preflight/` are local-only files not related to Phase 14C. They will not be included in the Phase 14C commit unless Stebbi explicitly confirms they should be.

---

## Remaining risk

None identified. The profile route now matches the same session boundary as the page-layer guards.

---

## Next phase

**Phase 14B: IP/abuse rate-limit** — pending Codex approval (v017).

Planned scope:
- `sql/42_ip_rate_limit.sql`: table `otp_ip_rate_limit` + RPC `check_and_increment_ip_rate_limit` (bounded DELETE inside, service_role only)
- `lib/auth/ip-rate-limit.ts`: thin wrapper via admin client
- `app/api/auth/request-code/route.ts`: call rate-limit check before `createUserCode`
- `lib/__tests__/ip-rate-limit.test.ts`: unit tests
