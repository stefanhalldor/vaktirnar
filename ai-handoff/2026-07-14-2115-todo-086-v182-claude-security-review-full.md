# TODO 086 v182 - Claude Code: Full Teskeið Security Review

Created: 2026-07-14 22:00
Timezone: Atlantic/Reykjavik

Mode:
- Read-only security review. No app code changed.
- No SQL written or run.
- No Supabase, production, commit, push, or deploy action.

Requested by Stebbi: "Gerðu öryggisrannsókn á allri teskeiðinni"

## Scope

All API route handlers in `app/api/**/*.ts` were read and assessed.
Middleware (`middleware.ts`), feature guards (`lib/legacy/guard.ts`),
and relevant SQL migrations were also read for context.

Total routes reviewed: 49 route files.

---

## Overall Assessment

**No critical vulnerabilities found in production-active routes.**

The production surface (AUTH_MVP_ENABLED=true, LEGACY_ENABLED=false) is well-structured:
- All admin routes are behind `requireAdmin`.
- All auth-mvp routes require `supabase.auth.getUser()` plus feature-access checks.
- Cron routes require `CRON_SECRET` Bearer header.
- Input validation uses Zod throughout new code.
- No SQL injection vectors found (all queries use Supabase client parameterization).
- No IDOR found in production-active routes that is not RLS-protected.
- Sensitive tables (`loan_items`, `loan_invitations`, `relationships`, `recent_events`, `feature_access`) revoke direct `authenticated`/`anon` grants and are service-role-only.

Two items require Supabase environment verification before increasing user exposure (see Flags 1 and 2).
Several low-risk notes exist in the legacy (LEGACY_ENABLED) surface.

---

## Flags

### Flag 1 — MEDIUM: Profiles RLS drift (carried from Codex v181)

**File:** `sql/01_schema.sql:183-185`

The base schema creates `profiles_select` as `USING (true)`, which allows any
authenticated user to read all profile rows including phone numbers.

Migration `sql/41_profiles_select_own.sql` hardens this to `USING (id = auth.uid())`.

**Risk:** If migration 41 has NOT been applied to the target Supabase environment,
any authenticated user can read all other users' profile rows.

**Action required:** Confirm migration 41 is applied before broadening user access.

Read-only Supabase check:
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';
```
Expected: `profiles_select` qual should be `(id = auth.uid())` or equivalent.

---

### Flag 2 — LOW: `weather_saved_places` DELETE relies entirely on RLS

**File:** `app/api/teskeid/weather/saved-places/[id]/route.ts:30`

The DELETE handler uses `.eq('id', id)` without an explicit `.eq('user_id', user.id)`
application-layer ownership check. The comment says "RLS ensures..." and this is correct
IF migration 69 has been applied.

Migration `sql/69_weather_saved_places.sql:83-85` defines `weather_saved_places_delete_own`
policy. The policy exists in the migration file.

**Action required:** Confirm migration 69 is applied to target Supabase environment.

Read-only Supabase check:
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'weather_saved_places';
```
Expected: `weather_saved_places_delete_own` should be present with `USING (user_id = auth.uid())`.

---

### Flag 3 — LOW (legacy-gated): Mass-assignment in chats PATCH

**File:** `app/api/chats/[id]/route.ts:42`

```ts
const { data, error } = await supabase
  .from('chats')
  .update({ ...body, updated_at: new Date().toISOString() })
  .eq('id', id)
```

Raw request body is spread directly into the update call with no Zod schema.
An attacker could attempt to set arbitrary fields on the `chats` row (e.g. `status`,
`created_by`, internal flags).

**Mitigated by:** `LEGACY_ENABLED !== 'true'` blocks this entire route at middleware
and at the `legacyGuard()` in the handler. Additionally, RLS on `chats` would
limit what the authenticated user can update.

**Status:** Not exploitable in production (LEGACY_ENABLED=false). Flag for future
legacy revival work.

---

### Flag 4 — LOW (legacy-gated): Mass-assignment in children PATCH

**File:** `app/api/children/[id]/route.ts:83-88`

Same pattern: `supabase.from('children').update(body).eq('id', id)` with raw body,
no Zod validation outside the `toggle_custody` branch.

**Status:** Same gate as Flag 3. Not exploitable in production.

---

### Flag 5 — LOW (legacy-gated): Message `type` field not validated

**File:** `app/api/chats/[id]/messages/route.ts:40`

```ts
const { content, type = 'text' } = await request.json()
```

`type` is accepted from request body without enum validation. An attacker could
set `type` to arbitrary values (e.g. `'system'`, `'activity'`).

Also: `content` has no max length limit at the application layer (only DB constraint).

**Status:** Legacy-gated. Not exploitable in production.

---

### Flag 6 — LOW (legacy-gated): Invite codes use Math.random

**Files:**
- `app/api/children/route.ts:60`
- `app/api/children/[id]/invite-code/route.ts:19`

```ts
const code = Math.random().toString(36).substring(2, 8).toUpperCase()
```

`Math.random()` is not a CSPRNG. A determined attacker with multiple code samples
could statistically narrow down future codes. Entropy is ~30 bits (base-36, 6 chars).

**Status:** Legacy-gated. Not exploitable in production. Note for if legacy is ever
re-enabled: replace with `crypto.randomBytes(4).toString('base36')` or similar.

---

### Flag 7 — LOW (legacy-gated): Chat and contacts access relies entirely on RLS

**Files:**
- `app/api/chats/[id]/route.ts:18-25` (GET — no ownership check, only `.eq('id', id)`)
- `app/api/chats/[id]/messages/route.ts:17-25` (GET — only `.eq('chat_id', id)`)
- `app/api/contacts/[id]/route.ts:18` (DELETE — only `.eq('id', id)`)

These rely on RLS policies on `chats`, `messages`, and `contacts` tables for
cross-user isolation. If RLS policies are not correct, any authenticated user
could read or delete another user's chats/messages/contacts.

**Status:** Legacy-gated. Not exploitable in production with LEGACY_ENABLED=false.
Before re-enabling legacy, verify RLS policies on those tables.

---

### Flag 8 — INFO: Middleware PUBLIC_PATHS includes API routes with own auth

`middleware.ts:23-31` lists these in PUBLIC_PATHS (middleware does not enforce auth):
- `/api/teskeid/profile` — route handler enforces `supabase.auth.getUser()`.
- `/api/teskeid/weather/travel` (and sub-paths) — handler enforces auth or guest rate limit.
- `/api/votes`, `/api/followers`, `/api/submissions`, `/api/analytics` — public by design.

This is intentional architecture. The middleware is the first layer; handlers are
second. No issue, but documents the intentional design.

---

## What Is Clean

Every production-active route was reviewed. The following areas are clean:

| Area | Why clean |
|------|-----------|
| Admin routes (`/api/admin/*`) | All gated by `requireAdmin` (Supabase auth + ADMIN_EMAILS) |
| Cron routes | CRON_SECRET Bearer header check |
| Auth OTP routes (`/api/auth-mvp/request-code`, `verify-code`) | IP rate limit, always `{success:true}`, strict code regex |
| Waitlist/admin auth routes (`/api/auth/request-code`, `verify-code`, `unsubscribe`) | HMAC token, constant-time error response |
| Feature-gated weather routes | Double-gated: env kill switch + per-user `checkFeatureAccess` |
| Saved places GET/POST | validateIcelandicCoords + user_id scoped + feature gate |
| Saved places DELETE | Feature gate + user-scoped client + RLS (Flag 2 — verify migration applied) |
| Loan/lánað-og-skilað routes | `guardLoanAccess()` + service-role RPCs + cross-user 404 |
| Recent events | `user_id` scoped at all read/ack points |
| Relationships | `owner_id` scoped; service-role-only table grants |
| Votes | HMAC voter token, httpOnly cookie, DB unique constraint |
| Analytics (public) | z.enum event_type, path length cap, in-memory rate limit |
| Submissions | Zod validation, honeypot field |
| Followers | Zod validation, unique-violation swallowed silently (no email leak) |
| Facebook unlink | AUTH_MVP_ENABLED + facebook-oauth feature gate |
| Weather ask | vedrid gate, question.slice(0,500), validateIcelandicCoords |
| Travel routes | vedrid gate or guest IP rate limit, validateConfirmedPlace |
| All legacy routes | Double-gated: middleware LEGACY_ENABLED block + in-handler `legacyGuard()` |

No XSS vectors found (server-rendered HTML only in unsubscribe page, which is static).
No SQL injection vectors (all queries via Supabase JS client parameterization).
No secrets exposed in responses.
No SSRF vectors (external URLs only via curated place resolution and met.no, both server-side only).

---

## Files Reviewed

### API Routes
- `app/api/admin/analytics/route.ts`
- `app/api/admin/feature-access/route.ts`
- `app/api/admin/ideas/route.ts`
- `app/api/admin/ideas/[id]/route.ts`
- `app/api/admin/submissions/route.ts`
- `app/api/admin/submissions/[id]/route.ts`
- `app/api/admin/submissions/[id]/create-idea/route.ts`
- `app/api/admin/teskeid-usage/route.ts`
- `app/api/admin/weather/project-vedurstofan/route.ts`
- `app/api/admin/weather/warm-vedurstofan/route.ts`
- `app/api/analytics/route.ts`
- `app/api/auth/request-code/route.ts`
- `app/api/auth/unsubscribe/route.ts`
- `app/api/auth/verify-code/route.ts`
- `app/api/auth-mvp/request-code/route.ts`
- `app/api/auth-mvp/verify-code/route.ts`
- `app/api/chats/route.ts`
- `app/api/chats/[id]/route.ts`
- `app/api/chats/[id]/activity/route.ts`
- `app/api/chats/[id]/messages/route.ts`
- `app/api/children/route.ts`
- `app/api/children/[id]/route.ts`
- `app/api/children/[id]/invite-code/route.ts`
- `app/api/children/join/route.ts`
- `app/api/contacts/route.ts`
- `app/api/contacts/[id]/route.ts`
- `app/api/cron/cleanup-chats/route.ts`
- `app/api/cron/warm-vedurstofan/route.ts`
- `app/api/dashboard/route.ts`
- `app/api/followers/route.ts`
- `app/api/place/reverse-geocode/route.ts`
- `app/api/place/search/route.ts`
- `app/api/push/subscribe/route.ts`
- `app/api/sessions/route.ts`
- `app/api/sessions/[id]/route.ts`
- `app/api/sessions/[id]/kids/route.ts`
- `app/api/sessions/[id]/logs/route.ts`
- `app/api/sessions/[id]/logs/[logId]/route.ts`
- `app/api/submissions/route.ts`
- `app/api/teskeid/profile/route.ts`
- `app/api/teskeid/profile/facebook/route.ts`
- `app/api/teskeid/weather/ask/route.ts`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- `app/api/votes/route.ts`

### Supporting Files
- `middleware.ts`
- `lib/legacy/guard.ts`
- `lib/loans/guard.ts` (checkFeatureAccess, guardLoanAccess)
- `lib/teskeid/admin-auth.ts` (requireAdmin)
- `lib/supabase/admin.ts` (getAdmin)
- `lib/supabase/server.ts` (createClient)
- `sql/01_schema.sql` (base profiles RLS)
- `sql/41_profiles_select_own.sql` (profiles hardening)
- `sql/69_weather_saved_places.sql` (saved places RLS)

---

## Pre-Release Checklist

Before broadening user access or deploying:

- [ ] Confirm `sql/41_profiles_select_own.sql` applied in target Supabase (Flag 1)
- [ ] Confirm `sql/69_weather_saved_places.sql` applied in target Supabase (Flag 2)
- [ ] Confirm `sql/75_weather_fetch_runs_metadata.sql` applied (weather refresh metadata)
- [ ] Stebbi approves and runs `sql/76_feature_access_weather_provider_vedurstofan.sql`
- [ ] Set `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` in env
- [ ] Grant `weather-provider-vedurstofan` to test users via `/admin`
- [ ] Run targeted tests: `npx vitest run lib/__tests__/loans.test.ts lib/__tests__/loan-pages.test.tsx lib/__tests__/profiles-14a.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/guard.test.ts lib/__tests__/middleware.test.ts`

---

## Next Steps

1. Stebbi reviews this handoff and confirms whether the two Supabase environment checks
   (Flag 1 and Flag 2) are already known to be applied.

2. If confirmed, security posture is acceptable for continued rollout.

3. Legacy surface (Flags 3-7) does not block release since LEGACY_ENABLED is off.
   These are documented for future reference if legacy is ever re-enabled.

4. Continue TODO-086 weather work: localhost testing of `weather-provider-vedurstofan`
   feature once Stebbi has reviewed this document and confirmed Supabase state.
