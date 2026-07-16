# TODO 046 - Auth email code delivery diagnostics

Created: 2026-07-10 15:39  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Handoff for Claude Code  
Status: Ready for Claude Code implementation planning and execution if Stebbi gives explicit implementation approval

## Context

Stebbi tested the Teskeið login flow with his own email address.

Observed production-ish behavior:

- First request waited through the full 120 second UI countdown and no email arrived.
- Stebbi reloaded the page and requested a new code immediately after that.
- Second request delivered an email in roughly 2 seconds and login succeeded.

DB rows Stebbi pasted for the same address show this relevant pattern:

| created_at | used_at | attempts |
| --- | --- | --- |
| 2026-07-10 15:33:36.651958+00 | 2026-07-10 15:33:47.383969+00 | 1 |
| 2026-07-10 15:31:05.477623+00 | null | 1 |

Interpretation:

- The 15:31 code existed but was not successfully used.
- The 15:33 code was used 11 seconds after creation.
- Current DB rows do not prove whether the 15:31 email was actually sent, accepted by Resend, delayed by Gmail, bounced, blocked, or suppressed by our dedupe path.

This is an important auth reliability issue. We need enough non-sensitive diagnostics to distinguish:

1. Code row was inserted.
2. Email send was attempted.
3. Resend accepted the email and returned a provider message id.
4. Resend returned an error or threw.
5. Request was suppressed because a recent active code already existed.
6. User entered an old/new/wrong code.

## Current Code Pointers

Inspected by Codex:

- `app/api/auth-mvp/request-code/route.ts`
- `lib/auth/user-codes.ts`
- `lib/auth/email.ts`
- `components/teskeid/TeskeidLoginForm.tsx`
- `sql/72_auth_email_code_request_idempotency.sql`

Current behavior worth noting:

- `lib/auth/user-codes.ts` has `DEDUPE_WINDOW_SECONDS = 120`.
- `components/teskeid/TeskeidLoginForm.tsx` has `RESEND_COOLDOWN = 120`.
- `request-code/route.ts` returns `{ success: true }` for `recentActive`, without telling the client that no new email was sent.
- `lib/auth/email.ts` currently ignores the return value from `resend.emails.send(...)`.
- `lib/auth/email.ts` returns without throwing when `RESEND_API_KEY` is missing in production, after logging an error. That can create "code exists but no email can be sent" behavior.

Critical edge case:

- If a code row is inserted and the email send fails after insertion, current code can leave an active unused code in the table.
- A retry inside the 120 second dedupe window may then return `recent_active_suppressed`, which means no new email is sent.
- The client still proceeds as though a code was sent.
- This can trap the user in the exact kind of confusing state Stebbi saw.

## Goal

Add reliable, privacy-safe diagnostics for OTP email delivery so Stebbi can tell, for any login attempt:

- whether a code was created,
- whether an email was attempted,
- whether Resend accepted it,
- what provider message id Resend returned,
- whether send failed,
- whether a retry was suppressed by dedupe,
- and whether verification attempts hit the expected active code.

Do not log or store plaintext OTP codes.

Do not leak raw email addresses or OTP hashes in application logs.

## Recommended Implementation

### 1. Make email sending return a structured result

Change `lib/auth/email.ts` so `sendUserLoginCode(...)` does not return `void`.

Suggested return shape:

```ts
type EmailSendResult =
  | {
      ok: true
      mode: 'provider_accepted'
      provider: 'resend'
      providerMessageId: string | null
    }
  | {
      ok: true
      mode: 'dev_logged'
      provider: 'console'
      providerMessageId: null
    }
  | {
      ok: false
      provider: 'resend' | 'config'
      errorCode: string
      errorMessage: string
    }
```

Important:

- Confirm actual Resend SDK behavior in the installed version. Some Resend SDKs return `{ data, error }` instead of throwing. Handle both thrown exceptions and returned `error`.
- If `RESEND_API_KEY` is missing in production, treat it as `ok: false`, not as a successful no-op.
- Do not include the plaintext OTP or raw email in the result.
- Sanitize any provider error text before storing or logging. Keep it short.

### 2. Add request-level correlation id

In `app/api/auth-mvp/request-code/route.ts`, create a short `requestId` per POST.

Example:

```ts
const requestId = crypto.randomUUID()
```

Use it in all server logs for that request:

- `ip_rate_limited`
- `db_error`
- `rate_limited`
- `recent_active_suppressed`
- `created_send_attempted`
- `created_send_accepted`
- `created_send_failed`

Log JSON only. Do not log raw email or code.

Example log fields:

```json
{
  "requestId": "...",
  "result": "created_send_accepted",
  "codeId": "...",
  "provider": "resend",
  "providerMessageId": "...",
  "ipRateLimitMs": 12,
  "createCodeMs": 90,
  "sendEmailMs": 430,
  "totalMs": 560
}
```

### 3. Persist send diagnostics, not just console logs

Console logs alone are not enough for this exact class of problem because the useful question often comes after the fact.

Recommended simple schema: add columns to `public.auth_email_codes` in a new migration, probably `sql/73_auth_email_code_send_diagnostics.sql`.

Suggested columns:

```sql
ALTER TABLE public.auth_email_codes
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS email_send_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_provider text,
  ADD COLUMN IF NOT EXISTS email_provider_message_id text,
  ADD COLUMN IF NOT EXISTS email_send_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_send_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_send_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_send_error_code text,
  ADD COLUMN IF NOT EXISTS email_send_error_message text;
```

Add checks:

- `email_send_status in ('pending', 'dev_logged', 'provider_accepted', 'failed')`
- `char_length(request_id) <= 80`
- `char_length(email_provider) <= 40`
- `char_length(email_provider_message_id) <= 200`
- `char_length(email_send_error_code) <= 80`
- `char_length(email_send_error_message) <= 500`

Security notes:

- Do not store plaintext OTP.
- Do not store provider response bodies wholesale.
- This table already stores email addresses, so do not broaden grants.
- Confirm existing RLS/grants remain service-role-only or equivalently restricted.

### 4. Return code id from the create RPC

Update `sql/72_auth_email_code_request_idempotency.sql` with a new migration or `CREATE OR REPLACE FUNCTION` in `sql/73...` so `create_user_otp_code_if_allowed(...)` returns the inserted code row id when status is inserted.

Suggested JSON:

```json
{ "status": "inserted", "code_id": "uuid" }
```

Also consider returning safe metadata for `recent_active`, for internal server use:

```json
{
  "status": "recent_active",
  "recent_created_at": "...",
  "retry_after": "..."
}
```

Do not return email, code hash, or plaintext code.

`lib/auth/user-codes.ts` should return:

```ts
{ code: string, codeId: string }
```

instead of just the plaintext `string` for inserted codes.

### 5. Mark send status after send attempt

In `request-code/route.ts`, once the code id is available:

1. Mark `email_send_attempted_at = now()`, `request_id = requestId`, `email_send_status = 'pending'`.
2. Call `sendUserLoginCode`.
3. If accepted:
   - set `email_send_status = 'provider_accepted'`
   - set `email_provider = 'resend'`
   - set `email_provider_message_id`
   - set `email_send_accepted_at = now()`
4. If dev mode console:
   - set `email_send_status = 'dev_logged'`
   - set `email_provider = 'console'`
   - set `email_send_accepted_at = now()`
5. If failed:
   - set `email_send_status = 'failed'`
   - set `email_send_failed_at = now()`
   - set sanitized error fields
   - return 500/generic error as today.

Important retry safety:

- A failed send must not leave the user stuck behind a recent active unsent code.
- Either invalidate the failed-send code row (`used_at = now()` with a clear status is awkward but effective) or update the dedupe RPC so failed-send rows are not treated as suppressing future sends.
- Prefer a clean schema-aware rule: dedupe should not suppress on rows where `email_send_status = 'failed'`.
- Be careful with concurrency: a code that is still `pending` during the same request should still suppress simultaneous duplicate requests briefly, or the advisory lock should continue to prevent duplicates. Claude Code should reason this through before coding.

### 6. Expose better server-side diagnostics without user enumeration

The client should still avoid leaking whether an account exists.

But server logs and DB diagnostics should be enough for Stebbi to answer:

- Did we call Resend?
- Did Resend accept?
- Which Resend message id should be checked in dashboard?
- Did we suppress the retry?
- Did the user type against an older code?

Suggested post-implementation diagnostic query:

```sql
select
  created_at,
  expires_at,
  used_at,
  attempts,
  request_id,
  email_send_status,
  email_provider,
  email_provider_message_id,
  email_send_attempted_at,
  email_send_accepted_at,
  email_send_failed_at,
  email_send_error_code,
  email_send_error_message
from public.auth_email_codes
where email = lower(trim('SETJA_NETFANG_HER'))
order by created_at desc
limit 10;
```

Do not paste real user email addresses into handoff or public logs.

### 7. Optional Phase 2 - Resend webhooks

This handoff only requires "we know whether Resend accepted the message."

For true delivery evidence, add Resend webhook handling later:

- `delivered`
- `bounced`
- `complained`
- `delivery_delayed` if available

This needs endpoint signature verification and explicit production env setup, so keep it out of this first phase unless Stebbi approves.

## Product / UX Notes

The current UI says or implies a code was sent whenever `/request-code` returns success.

That is okay for anti-enumeration, but it is bad if the backend actually suppressed sending due to `recent_active`.

Potential later UX improvement:

- After 30-60 seconds, allow "Senda nýjan kóða".
- If a new code is requested, tell the user: "Notaðu nýjasta kóðann ef fleiri en einn berst."
- Keep server-side dedupe only for immediate double-click/concurrent submit protection, not as a full 120-second user-visible resend blocker.

Do not implement this UX change in the diagnostics task unless Stebbi explicitly asks. First priority is observability and retry safety.

## Files Likely To Change

Likely:

- `lib/auth/email.ts`
- `lib/auth/user-codes.ts`
- `app/api/auth-mvp/request-code/route.ts`
- new SQL migration, likely `sql/73_auth_email_code_send_diagnostics.sql`

Possibly:

- `app/api/auth-mvp/verify-code/route.ts` if adding request ids or better verification logs.
- tests around auth code creation/send failure if existing test structure supports it.

## Tests / Checks Claude Code Should Run

Run relevant checks if available:

- `npm run type-check`
- targeted Vitest tests if auth tests exist
- `npm run test:run` if targeted tests are not available and runtime is reasonable

If SQL migration is written:

- Do not run it unless Stebbi explicitly approves.
- Clearly state that the migration was written but not run.
- Include rollback notes.

## Localhost checks for Stebbi

After Claude Code implements and before release:

1. Start from `/innskraning` on localhost.
2. Use a test email address.
3. Request a code.
4. Expected in local dev without `RESEND_API_KEY`:
   - the dev email/code appears in the terminal as before,
   - the UI moves to the code step,
   - the DB row shows `email_send_status = 'dev_logged'` or the equivalent chosen status.
5. Enter the code.
6. Expected:
   - login still works,
   - `used_at` is populated,
   - `attempts` increments as expected.
7. If Claude Code adds a safe local failure simulation:
   - simulate email send failure locally only,
   - confirm the row is marked failed,
   - confirm immediate retry is not suppressed by a failed unsent code.

Production/staging caution:

- Do not spam real email addresses.
- Do not test invalid Resend keys in production.
- Do not paste raw email addresses, OTP codes, code hashes, API keys, or full provider error bodies into handoff files or public logs.
- SQL migration must be explicitly approved before running.

## Review Questions For Codex

When Claude Code returns implementation:

1. Does the send function correctly handle the installed Resend SDK return shape?
2. Can a failed send still leave an active code that suppresses retries?
3. Are raw emails, codes, hashes, and secrets kept out of app logs?
4. Are SQL changes idempotent?
5. Are grants/RLS unchanged or still appropriately restricted?
6. Does the diagnostic query answer Stebbi's concrete question: "was the email actually handed to Resend?"
7. Is the difference between "provider accepted" and "delivered to inbox" clear in naming and UI/log comments?

## Risks / Open Questions

- Resend acceptance is not the same as mailbox delivery. Full delivery proof requires webhooks.
- Reducing dedupe/cooldown is a product/security tradeoff and should be separate from diagnostics unless Stebbi asks for it now.
- The safest retry fix depends on how Claude Code chooses to model `pending` vs `failed` rows under concurrency.
- Need to confirm existing `auth_email_codes` RLS/grants before adding columns or helper functions.

