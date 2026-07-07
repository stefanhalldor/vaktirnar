# 2026-07-07 22:28 - TODO-067 v156 - Codex review of v155 + auth rate-limit hotfix

Timezone: Atlantic/Reykjavik

## Context

Stebbi asked Codex to review `2026-07-07-2215-todo-067-v155-claude-phase-d-saved-places` and also raised an urgent production issue:

> "Of margir kóðar hafa verið sendir. Prófaðu aftur kl. 00:00" appears for every email tested after Facebook traffic started.

This review covers both:

1. Phase D saved places from v155.
2. Emergency login-code rate-limit adjustment needed before more public beta traffic.

## Findings

### High - Public beta login is blocked by a shared IP/day limit, not email-specific throttling

Current auth flow checks IP rate limiting before parsing the email:

- `app/api/auth-mvp/request-code/route.ts:15-27`
- `lib/auth/ip-rate-limit.ts:5-7`

The IP limit is currently:

```ts
const MAX_REQUESTS = 10
```

The email-specific limit is separate and much higher:

- `lib/auth/user-codes.ts:6`
- `lib/auth/user-codes.ts:26-41`

```ts
const MAX_CODES_PER_HOUR = 20
```

So Stebbi's observation is expected: many different emails can be blocked if requests share the same IP bucket. The `"00:00"` retry time comes from the Reykjavik calendar-day IP window, not the per-email hourly limit.

This is too strict for a public beta, especially because multiple people can share an IP through homes, workplaces, mobile networks, NAT, VPNs, or carrier routing.

Recommended hotfix:

- Do not clear production DB rows unless Stebbi explicitly approves it.
- Do not weaken the email-specific hourly limit.
- Change the IP/day limit from a hardcoded 10 to a higher env-configurable value.
- Use a safe default high enough for the current Facebook test traffic, for example 250/day/IP.
- Add an upper bound so a misconfigured env value cannot accidentally make the limit unbounded.

Suggested implementation shape:

```ts
const DEFAULT_IP_DAILY_LIMIT = 250
const MAX_IP_DAILY_LIMIT = 5000

export function getIpDailyLimit(): number {
  const raw = Number(process.env.AUTH_CODE_IP_DAILY_LIMIT)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_IP_DAILY_LIMIT
  return Math.min(Math.floor(raw), MAX_IP_DAILY_LIMIT)
}
```

Then pass:

```ts
p_max_requests: getIpDailyLimit()
```

Why this is safe for ASAP:

- It is code-only.
- It does not require a SQL migration.
- Existing IP buckets with count above 10 become allowed again after deploy as long as they are below the new max.
- The per-email `20/hour` rule remains the real abuse brake.
- The existing RPC still owns the atomic increment behavior.

If Claude Code needs the smallest possible emergency patch, a one-line `MAX_REQUESTS = 250` would also unblock the beta, but the env-based version is better and still small.

### Medium - Saved places POST can silently hide DB write failures

`app/api/teskeid/weather/saved-places/route.ts:98-149` ignores insert/update errors and returns `200` with `place: null` if the DB write fails.

This is risky during prerelease because a missing migration, bad grant, RLS issue, or unique race can look like success from the client side. Best-effort UX is good, but the API should not pretend a failed write succeeded.

Recommended fix:

- Keep client UX best-effort.
- In the API route, if insert/update returns `error`, log a generic message and return `500 { error: 'save_failed' }`.
- In `savePlaceBestEffort`, keep ignoring non-ok responses so the route flow is not blocked.
- Add tests for insert failure and update failure.
- Consider a unique-race fallback: if insert fails with a unique conflict, reselect/update the existing row once.

### Medium - Saved-place cap queries should explicitly scope by user_id

The cap logic relies on RLS to count and delete only the current user's rows:

- `app/api/teskeid/weather/saved-places/route.ts:129-146`

RLS should protect this, but the query should still explicitly include:

```ts
.eq('user_id', user.id)
```

on the count, oldest-row select, and delete criteria where applicable.

Reasons:

- Clearer intent.
- Easier testability.
- Better query planning.
- Less surprising if this route is refactored later.

RLS remains the hard boundary either way.

### Medium - SQL static test overclaims update/delete policy coverage

`lib/__tests__/sql-saved-places.test.ts:46-54` names tests as if they verify `USING` and `WITH CHECK`, but the update test only checks policy name and `FOR UPDATE`; the delete test only checks policy name and `FOR DELETE`.

The migration itself currently has the right policy clauses:

- `sql/69_weather_saved_places.sql:73-84`

But the test should actually assert them.

Recommended fix:

- For update, assert both:
  - `USING (user_id = auth.uid())`
  - `WITH CHECK (user_id = auth.uid())`
- For delete, assert:
  - `USING (user_id = auth.uid())`
- Prefer scoped regex around each policy block rather than broad file-level matches, because broad matches can pass due to another policy.

### Low - Optimistic delete is not repaired if DELETE fails

`app/auth-mvp/vedrid/FerdalagidClient.tsx:240-249` removes a saved place optimistically and does not refetch or restore if the DELETE call fails.

This does not leak data, but it can make the UI lie until the next reload.

Recommended fix:

- On non-ok response or catch, refetch saved places, or restore the previous list.
- Keep the flow non-blocking.

### Low - Saved place label may hide the friendly name

`components/weather/PlaceSearch.tsx:247` renders:

```tsx
{p.formattedAddress ?? p.name}
```

If `formattedAddress` exists, the saved list may hide the friendlier name. Consider rendering name first and smaller address underneath, especially on mobile. This is not a blocker for Phase D.

## Review of v155 saved places

The overall shape is good:

- The table is private user data.
- RLS is enabled.
- The API uses the authenticated Supabase server client rather than service role.
- `user_id` is server-derived on insert.
- The feature is optional in `PlaceSearch`, so existing search usage is not forced into saved-place behavior.
- The row cap exists, which addresses the previous Codex note.

Do not run `sql/69_weather_saved_places.sql` until the API error handling and tests above are tightened, unless Stebbi explicitly accepts the prerelease risk.

## Required hotfix handoff for Claude Code

Claude Code, if Stebbi explicitly asks you to execute this, do the auth hotfix first. It is more urgent than saved places because it blocks public beta login.

Scope:

1. Update `lib/auth/ip-rate-limit.ts`.
2. Replace the hardcoded `MAX_REQUESTS = 10` with an env-configurable daily IP limit.
3. Default to `250`.
4. Cap the env value at `5000`.
5. Keep fail-open behavior for missing IP, missing/short secret, RPC error, and unexpected exception.
6. Keep per-email `MAX_CODES_PER_HOUR = 20` unchanged.
7. Add/update unit tests for:
   - default value is used when env is missing
   - env override is used when valid
   - env override is floored when decimal
   - env override is capped at max
   - invalid env values fall back to default
8. Run:
   - `npm run type-check`
   - `npm run test:run`
   - `npm run build`

Do not:

- Run SQL.
- Delete rows from `otp_ip_rate_limit`.
- Change email-specific limits.
- Commit, push, or deploy without Stebbi explicitly approving those actions.

Suggested user-facing note after deploy:

> Við hækkuðum sameiginlega IP-takmörkun á innskráningarkóðum fyrir prófanaútgáfuna. Netfangatakmörkun er áfram virk til að verja kerfið gegn misnotkun.

## Follow-up handoff for saved places

After auth hotfix is done, Claude Code should tighten Phase D:

1. Make saved-place POST return `500` on insert/update failure.
2. Keep client save best-effort.
3. Add `.eq('user_id', user.id)` to cap count/select/delete queries.
4. Add tests for DB write failures.
5. Strengthen SQL static tests for update/delete RLS clauses.
6. Refetch or rollback saved places if delete fails.
7. Consider better saved-place list labels: primary `name`, secondary `formattedAddress`.

Only after this should Stebbi decide whether to run `sql/69_weather_saved_places.sql`.

## Commands run by Codex

```txt
git diff --check
```

Result: exit code 0. Only CRLF warnings for `TODO.md` and `messages/is.json`.

```txt
npm run type-check
```

Result: exit code 0.

```txt
npm run test:run
```

Result: exit code 0. 58 test files passed, 1845 tests passed, 27 skipped, 8 todo.

```txt
npm run build
```

Result: exit code 0. Existing lint warnings remain:

- `app/s/[sessionId]/page.tsx`: existing hook dependency warnings.
- `components/landing/Avatar.tsx`: existing `<img>` warning.
- `components/weather/TravelAuditMap.tsx`: existing hook dependency warning.

## Files inspected

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-07-2215-todo-067-v155-claude-phase-d-saved-places.md`
- `app/api/auth-mvp/request-code/route.ts`
- `lib/auth/ip-rate-limit.ts`
- `lib/auth/user-codes.ts`
- `sql/42_ip_rate_limit.sql`
- `components/teskeid/TeskeidLoginForm.tsx`
- `sql/69_weather_saved_places.sql`
- `lib/weather/savedPlaces.ts`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`
- `components/weather/PlaceSearch.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `lib/__tests__/sql-saved-places.test.ts`
- `lib/__tests__/weather-saved-places-api.test.ts`

## Localhost checks for Stebbi

### After auth hotfix

Use localhost only after Claude Code has implemented the auth hotfix and you have restarted the dev server yourself.

1. Open the login flow.
2. Request login code for a normal test email.
3. Confirm the UI moves to the code-entry step.
4. Request codes for several different test emails from the same network/browser session.
5. Expected: you should not hit `"Prófaðu aftur kl. 00:00"` after only a few attempts.
6. Do not deliberately spam a real production email 20+ times unless you want to test the per-email limit.
7. If testing production, do not clear or edit rate-limit DB rows unless you have decided that explicitly.

Regression checks:

- Invalid email should not leak whether a user exists.
- If email sending fails, the UI should show the generic failure state, not expose internals.
- Existing login with a valid code should still work.

### After saved places fixes and migration

Only test saved places after the migration has been run in the relevant Supabase environment.

1. Log in as a user with access to Veðrið.
2. Open `/auth-mvp/vedrid`.
3. Select a `Frá` place and a `Til` place.
4. Return to the place input.
5. Expected: selected places appear as saved/recent options.
6. Delete one saved place with `X`.
7. Expected: it disappears and does not reappear after refresh.
8. Log in as a different user.
9. Expected: the first user's saved places are not visible.

Regression checks:

- Google Places and server fallback search still work.
- Route selection and ferry handling still work.
- Saved places should never block route selection if the saved-place API fails.

