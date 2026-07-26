# Prerelease handoff — OTP delivery reliability and retry reuse

Created: 2026-07-26 12:59
Timezone: Atlantic/Reykjavik
TODO: #46 — auth reliability stream
Agent: Codex
Status: Prerelease, ready for Claude Code review and Stebbi localhost verification

## Findings and release risks

No blocking code or test finding remains in Codex's local review.

Residual risks to review before release:

1. There is a short non-atomic interval between storing a new OTP, asking Resend to send it, and invalidating it after a definitive provider rejection. A concurrent retry inside that interval can observe the still-active row and be deduplicated. The direct invalidation is exact and idempotent, but the three operations are not one transaction because email delivery is external.
2. If the service-role invalidation request itself fails after Resend definitively rejects the email, the unsent code can remain active and suppress another send for at most the existing 120-second dedupe window. The route returns a generic error and the privacy-safe log records that the invalidation attempt did not succeed.
3. A thrown provider/network call is deliberately classified as `uncertain`, not `failed`: the request may have reached Resend even if the response did not return. The code therefore remains valid and the UI asks the user to check email. This avoids invalidating a code that may already have been delivered, at the cost of a possible 120-second wait when it was not delivered.
4. The browser also treats a rejected fetch as uncertain, because the server may have completed the send before the connection failed. A definite HTTP non-2xx remains a real failure and does not start a fake resend cooldown.
5. The shared admin/waitlist email wrappers now fail closed when delivery is failed or uncertain. That preserves the earlier thrown-error behavior and additionally catches Resend's returned `{ error }` result, but Claude Code should verify the outer admin/waitlist route behavior remains appropriate.
6. TODO #46 is nominally the larger user+password fallback item. This patch only hardens the current email-code path and does not complete or close that TODO.

Confidence: high for the local code paths and automated tests; medium for the exact original production incident because production Vercel log access was not approved and was not retried.

## Plan for this phase

- Preserve the intended 120-second OTP dedupe so an immediately repeated request does not invalidate a code already in transit.
- Distinguish confirmed provider acceptance, definitive provider rejection, and uncertain delivery.
- Keep a possibly delivered code valid when the outcome is uncertain.
- Invalidate only the exact newly-created code after a definitive rejection.
- Make the code screen explain that a recently received code remains reusable.
- Remove the fake-success resend countdown after a definite request failure.
- Add privacy-safe correlation logs and regression tests.
- Do not change SQL, RLS, auth schema, environment variables, production, deploys, or dev-server state.

## What Codex actually changed

### Server delivery contract

`lib/auth/email.ts` now reports one of three states for the user OTP path:

- `accepted`: Resend returned a message id and no error.
- `failed`: configuration is definitely missing in production or Resend returned an explicit error.
- `uncertain`: the provider call threw, or returned neither an id nor an explicit error.

Provider details, email addresses, and OTP values are not logged. The legacy/admin and waitlist wrappers throw the sanitized `email_delivery_failed` error unless delivery is confirmed accepted.

### OTP lifecycle

`lib/auth/user-codes.ts` now has `invalidateUserCodeAfterSendFailure(email, code)`. It recomputes the HMAC hash and marks only rows matching normalized email, exact code hash, and `used_at IS NULL` as used. Database errors and thrown requests are converted to `false` with static privacy-safe logs.

`app/api/auth-mvp/request-code/route.ts` now:

- keeps existing `recent_active` dedupe behavior;
- returns a generic 500 after a definitive provider rejection;
- attempts exact invalidation before returning that 500;
- preserves the code and returns `{ success: true, delivery: "uncertain" }` for uncertain provider outcomes;
- emits a random request correlation id and categorical timing/result fields without email or plaintext code.

### Client behavior and copy

`components/teskeid/TeskeidLoginForm.tsx` now:

- proceeds to the code screen after a browser/network-uncertain outcome;
- shows a polite amber status explaining that delivery could not be confirmed and the user should check email;
- remains on the email screen after a definite server failure;
- does not start the resend countdown after a definite resend failure;
- explains that a recently received code can still be used;
- clears stale notice/error state on resend and back navigation;
- gives the code-step secondary actions 40 px minimum touch height.

The new user-facing strings are in both `messages/is.json` and `messages/en.json`.

Design.md alignment: the existing email input remains 16 px on mobile, the new status is wrapping/non-blocking with `role="status"`, the touched secondary controls have at least 40 px height, and no fixed positioning, horizontal overflow, or forced zoom behavior was introduced.

## Files inspected

- `AGENTS.md`
- `WORKFLOW.md`
- `Design.md`
- `TODO.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-26-1235-todo-046-v013-codex-otp-retry-reuse-diagnostic.md`
- `app/api/auth-mvp/request-code/route.ts`
- `app/api/auth/request-code/route.ts`
- `components/teskeid/TeskeidLoginForm.tsx`
- `lib/auth/codes.ts`
- `lib/auth/email.ts`
- `lib/auth/user-codes.ts`
- related OTP, email, logging, and UI tests
- Icelandic and English auth message namespaces

## Files changed by Codex

- `app/api/auth-mvp/request-code/route.ts`
- `components/teskeid/TeskeidLoginForm.tsx`
- `lib/auth/email.ts`
- `lib/auth/user-codes.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/auth-log.test.ts`
- `lib/__tests__/login-form.test.tsx`
- `lib/__tests__/request-code.test.ts`
- `lib/__tests__/user-codes.test.ts`
- `lib/__tests__/auth-email-delivery.test.ts` (new)
- this prerelease handoff

Also present but not modified as part of this implementation:

- `.obsidian/workspace.json` — pre-existing/user-owned working-tree change, preserved.
- `ai-handoff/2026-07-26-1235-todo-046-v013-codex-otp-retry-reuse-diagnostic.md` — diagnostic handoff created before implementation.

## Commands run and results

- `npm run test:run -- lib/__tests__/login-form.test.tsx --reporter=dot`
  - First two runs: exit 1 because the newly added fake-timer test did not advance the chained one-second React timers as assumed. This was a test implementation issue; product code was unchanged for that failure.
  - Final run: exit 0, 14/14 tests passed.
- `npm run type-check`
  - Exit 0.
- `npm run test:run -- lib/__tests__/auth-email-delivery.test.ts lib/__tests__/request-code.test.ts lib/__tests__/user-codes.test.ts lib/__tests__/login-form.test.tsx lib/__tests__/auth-log.test.ts lib/__tests__/otp-verification.test.ts --reporter=dot`
  - Exit 0, 6 files and 135 tests passed.
- `git diff --check`
  - Exit 0. Only existing Windows LF/CRLF warnings were printed.
- `npm run test:run -- --reporter=dot`
  - Exit 0; full Vitest suite passed in 58.3 seconds.
- Read-only inspection commands: `rg`, `Get-Content`, `Select-String`, `git diff`, `git status`.
  - Exit 0 where used. Git printed a sandbox warning for the user-level global ignore path; repository inspection still completed.

## What failed, was skipped, or was not done

- A read-only attempt to access production Vercel logs was rejected by the approval boundary. Codex did not retry or work around that restriction.
- `npm run build` was not run. Stebbi controls the localhost/dev server and a Next build can contend for the same `.next` state. A clean build remains a release check after the active dev session can safely yield it.
- No browser automation was run and no dev server was started, stopped, or restarted.
- No SQL or migration was written or run.
- No Supabase console/API mutation was performed by Codex.
- No environment variable or secret was read or changed.
- No commit, push, deploy, Vercel change, or production change was made.
- `TODO.md` and `DONE.md` were not changed; TODO #46 remains open.

## Decisions taken

- Keep the existing 120-second dedupe. The lack of a second email on an immediate retry is intentional protection against replacing an in-flight code.
- Treat provider exceptions and client fetch failures as uncertain, because delivery may have completed before the connection failed.
- Treat Resend's explicit returned error as definitive failure; the old implementation ignored that result.
- Keep uncertain codes active and invalidate only definitely rejected codes.
- Use a direct, server-only, exact-row service-role update rather than introduce a migration for this narrow fix.
- Return only generic user errors and log categorical correlation data without PII, OTP, provider payload, or secret material.
- Do not broaden this patch into the larger user+password fallback scope.

## Supabase, auth, RLS, and data impact

- SQL file: none.
- SQL/migration executed: no.
- Schema, grants, policies, RLS, auth users, and sessions: unchanged.
- New runtime write: on a definitive email-provider rejection only, the server-only service-role client updates `auth_email_codes.used_at` for rows matching normalized email, HMAC code hash, and unused state.
- Plaintext OTP is never written to Supabase and is not logged.
- The direct service-role write bypasses RLS by design but remains confined to the existing server-only auth helper and exact HMAC-scoped filter.
- No user profile or unrelated auth row is read or mutated.
- Normal acceptance and uncertain-delivery paths do not add extra database writes beyond existing code creation.

## Questions for Claude Code to review

1. Does the accepted/failed/uncertain classification match the installed Resend SDK contract in all relevant response shapes?
2. Is keeping thrown provider calls in the uncertain branch the safest tradeoff for delivered-but-response-lost cases?
3. Is the exact service-role invalidation sufficiently scoped, and should a later migration/RPC make creation + invalidation state more explicit?
4. Is the short insert/send/invalidate concurrency window acceptable for prerelease, given the maximum 120-second suppression?
5. Should invalidation failure gain a bounded retry, or is the current privacy-safe log plus temporary dedupe window preferable?
6. Are the changed admin/waitlist wrapper semantics correctly caught by their existing routes?
7. Does any HTTP failure occur after a confirmed send elsewhere in the request path that should also be exposed to the client as uncertain?
8. Do the new client status text and touch targets satisfy Design.md without introducing layout issues at 360–460 px?
9. Is the anti-enumeration boundary preserved for email existence and dedupe state?
10. Should TODO #46 remain the tracking item for this auth-reliability subphase, or should a narrower follow-up TODO be created later?

## Localhost checks for Stebbi

Use a dedicated test mailbox and `/innskraning`. Do not test provider rejection or secret failure against production casually; changing/removing `RESEND_API_KEY`, `AUTH_CODE_SECRET`, Supabase rows, or provider configuration requires separate explicit approval.

1. Open `http://localhost:3004/innskraning` with the current local auth environment and a mailbox Stebbi controls.
2. Submit the email once.
   - Expected: the code screen appears.
   - Expected copy: a code is on the way and a recently received code remains usable.
   - Expected: a 120-second resend countdown appears.
3. Enter the delivered code.
   - Expected: login succeeds and redirect behavior is unchanged.
4. Repeat with a fresh logged-out browser state, then immediately navigate back/retry the same email inside 120 seconds.
   - Expected: a second email may intentionally not be sent.
   - Expected: the previously delivered, unused code still works for its 10-minute lifetime.
   - Regression to watch: no generic red error should appear solely because the browser lost certainty after the send.
5. After the countdown reaches zero, use `Senda aftur`.
   - Expected: the action is responsive, clears any old code/error notice, and starts a new countdown only after a non-definitive-success outcome.
6. If a genuine connection interruption occurs after submit:
   - Expected: the UI moves to the code screen with the amber “could not confirm delivery” notice.
   - Expected: if the email arrives, that code remains valid.
7. At 360 px, 390 px, and 460 px width, test email submit, keyboard open/close, code entry, back, and resend.
   - Expected: no iOS-style input zoom, horizontal overflow, overlap, or clipped status/error text.
   - Expected: `Til baka` and `Senda aftur` have comfortable touch height.
8. Regression check the admin login and any waitlist flow locally if available.
   - Expected: confirmed sends behave as before; failed/uncertain sends produce the route's existing generic failure handling rather than a false success.

For deterministic failure/uncertainty branches, rely primarily on the automated mocks already added. Do not alter production Resend, Supabase, auth secrets, or real user data merely to force those branches.

## Recommended next step

Claude Code should perform a focused prerelease review of the listed questions and diff. If no blocker is found, Stebbi should run the localhost checks above. After localhost approval, run a clean Next build when the dev server can safely release `.next`; commit/push/deploy still require separate explicit permission.

## Óvissa / þarf að staðfesta

- The exact production-side cause of the original generic red error is unconfirmed because production Vercel logs were unavailable.
- Local unit coverage confirms response-lost and provider-error behavior, but only Stebbi's mailbox/browser test can confirm the end-to-end Resend and mobile experience.
- No evidence currently indicates a need for SQL or RLS changes.

