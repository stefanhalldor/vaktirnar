# TODO 046 — OTP retry/reuse diagnostic

Created: 2026-07-26 12:35
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Read-only diagnostic

## Findings

### P1 — The missing second email is intentional 120-second deduplication, but the UI does not explain it

`lib/auth/user-codes.ts` sets `DEDUPE_WINDOW_SECONDS = 120`. If an unused, unexpired code exists inside that window, the RPC returns `recent_active`; `app/api/auth-mvp/request-code/route.ts` then logs `recent_active_suppressed`, sends no new email and returns ordinary `{ success: true }`.

This exactly explains why the earlier code remained valid and no second email arrived. The design prevents rapid retries from creating a newer row that would invalidate a code already in transit.

The client cannot distinguish “new email sent” from “existing code still active”, so the behavior is confusing even though the security/correctness invariant works.

### P1 — The red generic error and the delivered email indicate two different outcomes

On the email step, `TeskeidLoginForm` displays the generic error only when `/api/auth-mvp/request-code` returns non-2xx or `fetch` rejects. The notification in Stebbi's screenshot shows that a login email was nevertheless delivered.

The most likely sequence is:

1. First request inserted a code and the email provider delivered it.
2. The browser did not receive/parse the final 2xx response, for example because of a transient network or function-response failure.
3. Stebbi retried immediately.
4. The server found the still-unused code younger than 120 seconds, suppressed a new email and returned success.
5. The code from the first email remained the newest active code and therefore verified successfully.

Confidence is high for steps 3–5 and medium for the exact reason the first response did not reach the browser. Production request logs are required to distinguish a dropped/late response from a server 500.

### P1 — Current email wrapper ignores returned Resend errors

`lib/auth/email.ts` awaits `resend.emails.send(...)` but ignores its `{ data, error }` result. It only propagates thrown exceptions. A provider error returned as data can therefore be treated as successful by the route.

This did not prevent delivery in Stebbi's screenshot, but it leaves the auth flow unable to reliably distinguish provider acceptance from failure and was already identified in v012.

### P2 — Resend handler hides non-rate-limit failures

`handleResend()` only displays an error when a failed request is explicitly rate-limited. A generic non-2xx/network failure falls through, starts another 120-second countdown and focuses the code field as if resend succeeded.

This is separate from the screenshot's initial email-step error, but it can reproduce similar confusion from the resend button.

## Files inspected

- `components/teskeid/TeskeidLoginForm.tsx`
- `app/api/auth-mvp/request-code/route.ts`
- `app/api/auth-mvp/verify-code/route.ts`
- `lib/auth/user-codes.ts`
- `lib/auth/codes.ts`
- `lib/auth/email.ts`
- `sql/27_auth_email_codes.sql`
- `sql/38_atomic_otp_verification.sql`
- `sql/72_auth_email_code_request_idempotency.sql`
- Relevant auth tests and TODO 046 handoffs, especially v012

## Commands run

- Read-only `rg`, `Get-Content`, `git status` and `Get-Date`.
- `vercel.cmd --version` and `vercel.cmd logs --help` locally.
- A tightly filtered, read-only production log request was proposed but rejected because production auth logs may contain sensitive operational data and Stebbi had not explicitly approved that access. It was not worked around or retried.

No tests were run because no files or behavior were changed.

## Files changed

- Only this diagnostic handoff file.

No application code, SQL, TODO/DONE state, env, Supabase, auth state, production data or deployment was changed. No commit, push or deploy was performed.

## Recommended fix plan for Claude Code

Do not remove the invariant that only the newest code verifies. Prefer a small UX/observability fix:

1. Make `sendUserLoginCode` inspect both thrown errors and Resend's returned `error`, and return a typed provider-accepted/provider-failed result without email or OTP data.
2. Preserve short server-side dedupe for double-submit/concurrency safety.
3. Return a privacy-safe delivery state from request-code, such as `created` versus `existing_active`, if this does not undermine the chosen anti-enumeration contract.
4. On `existing_active`, show a truthful neutral message such as: “Kóði er þegar á leiðinni. Notaðu síðasta kóðann sem þú fékkst.” Do not imply a new email was sent.
5. Fix `handleResend()` so every `ok:false` path displays either rate-limit or generic failure and does not start the success countdown.
6. Add a request/correlation ID to privacy-safe logs so a client error can be matched to `created_and_sent`, `recent_active_suppressed`, `email_error` or `db_error` without logging email or OTP.
7. Add tests for the `recentActive` route branch and generic resend failure; current request-code tests do not directly cover suppression behavior.

Whether the visible resend cooldown should remain 120 seconds or become shorter is a product decision. A short double-click dedupe plus a later explicit resend may be a clearer experience, but must not reintroduce delayed-email invalidation.

## Supabase / security review

- The 120-second dedupe is implemented atomically by `create_user_otp_code_if_allowed` under a per-email advisory transaction lock.
- Verification selects only the newest row and does not fall back to older codes. This is the correct security invariant.
- No RLS, grants, policies, auth data or production rows were read or modified in this diagnostic.
- Any future SQL change requires separate execution authorization and review of service-role-only grants.
- Production logs must remain free of plaintext OTP, raw email, secrets and provider payloads.

## Localhost checks for Stebbi

These are proposed checks after a future authorized fix; nothing changed in this diagnostic.

1. Open `/innskraning` on localhost with a real test mailbox and correct local auth env.
2. Request one code and verify that the UI enters the code step only after a successful response.
3. Trigger an immediate duplicate request and confirm no newer code invalidates the first one.
4. Confirm the UI says an existing code is still active rather than implying a second email was sent.
5. After the allowed resend interval, request a genuinely new code and confirm the UI tells the user to use the newest email.
6. Simulate a generic resend failure in tests and confirm no success countdown starts.
7. Verify wrong, expired, already-used and more-than-five-attempt codes still fail.

Do not casually test this against production mailboxes or mutate production `auth_email_codes`. Production logs, Supabase rows, env and Resend state require explicit authorization.

## Óvissa / þarf að staðfesta

- Exact first-request failure mode remains unconfirmed without a specifically authorized, time-bounded production log review.
- It is not confirmed whether v012's fuller send-diagnostics plan was intentionally deferred or simply never implemented.
- Confidence: high that the second send was suppressed by intended dedupe; medium that the first response was lost after successful send rather than another transient server/client failure.
