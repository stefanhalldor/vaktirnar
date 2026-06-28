# TODO #43 v017 - Gmail canonical + soft-ack closeout

**Fra:** Codex  
**Til:** Claude Code  
**Dagsetning:** 2026-06-23 07:53  
**Stada:** Plan/handoff til ad loka fyrsta atridi i nyju TODO-rodinni.  
**Markmid:** Loka #43 ef raunprof stadfesta ad SQL56/latest app code leysi Gmail-punkta og pending soft-ack claim, eda skila mjog afmarkadu fix-plan ef eitthvad stendur eftir.

## Context

#43 er nuna efsta atridi i TODO. Stebbi hefur keyrt `sql/56_normalize_email_canonical.sql` og einnig `NOTIFY pgrst, 'reload schema';`.

Sidasta Claude commit sem Codex ryndi:

- `896fe4f fix: Tengsl recipient picker dedup + Icelandic loan dates + badge source (#43 #49)`

Codex review nidurstada a `896fe4f`:

- Engin blocking findings.
- `getRelationshipLoanActivity()` saekir owner-visible loans fyrst og filterar invitations med `normalizeEmailForAccess()` i TypeScript.
- `getRelationship()` skilar nu `resolvedCounterpartUserId`.
- Heim badge notar `get_my_loans` og telur bara `requires_acknowledgement && invitation_status === 'pending'`.
- Target tests og type-check voru graen:
  - `npm run test:run -- lib/__tests__/tengsl-actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/loan-card.test.tsx`
  - `npm run type-check`

Thessi handoff er ekki beidni um ad skrifa stóra nyja lausn. Byrja a ad stadfesta hvort #43 se i raun lokid.

## Scope for Claude

Fyrst gera verification/closeout:

1. Stadfesta ad repo/app code og SQL56 seu samstillt fyrir Gmail canonicalization.
2. Stadfesta ad pending soft-ack row birtist i `Lánað og skilað` fyrir dotted/undotted Gmail actor.
3. Stadfesta ad `Þekki málið` claim virki fyrir pending invitation eftir email-link expiry ef status er enn `pending`.
4. Stadfesta ad wrong-email notandi geti ekki sed eda claim-ad bod.
5. Stadfesta ad event/badge state se ekki bersynilega rangt eftir claim/decline.

Ekki taka #52/#37 event-feed vinnuna inn i thessa lotu nema hun se bein orsok fyrir #43 blocker. #52/#37 eru naesti pakki.

## Known desired behavior

Use synthetic data only in tests/handoff/logs. Ekki nota raunnetfong Stebba.

Examples:

- `fyrri.seinni@gmail.com`
- `fyrriseinni@gmail.com`
- `fyrri.seinni@googlemail.com`
- `annad@example.com`

Gmail/Googlemail canonical rules:

- local-part dots are ignored for Gmail/Googlemail only
- `googlemail.com` normalizes to `gmail.com`
- non-Gmail domains keep dots significant
- compare canonical-to-canonical on read paths
- write new invitations in canonical form

Soft-ack product rule:

- Pending invitation-derived row may remain visible/actionable in app even if old email-link `expires_at` has passed.
- `claim_loan_invitation` should not reject solely because `expires_at <= now()` while status is still `pending`.
- Expired/cancelled/declined/accepted statuses still need clear behavior.

## Files to inspect

Primary:

- `sql/56_normalize_email_canonical.sql`
- `lib/auth/normalizeEmailForAccess` or equivalent helper
- `lib/loans/actions.ts`
- `lib/loans/types.ts`
- `app/auth-mvp/lanad-og-skilad/page.tsx`
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`
- `components/loans/LoanCard.tsx`
- `components/loans/LoanList.tsx`
- `lib/relationships/actions.ts`
- `lib/__tests__/sql-migration.test.ts`
- `lib/__tests__/loan-pages.test.tsx`
- `lib/__tests__/loans.test.ts`
- `lib/__tests__/actions.test.ts`

Also check, but do not over-expand:

- old email claim route if still reachable: `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx`
- home badge/event only if it affects #43 closeout directly.

## Verification tasks

### 1. Static SQL and helper parity

Confirm:

- SQL helper `public.normalize_email_canonical(text)` matches TS `normalizeEmailForAccess()` for:
  - dotted Gmail
  - undotted Gmail
  - Googlemail
  - mixed case and whitespace
  - non-Gmail dotted local-part
- `get_my_loans` Branch 2 uses canonical compare on both sides.
- `claim_loan_invitation`, `create_loan`, `add_loan_invitation`, `get_my_pending_invitations`, `get_invitation_for_claim`, `decline_invitation` use canonical helper where appropriate.
- Execute grants remain service-role only where intended. Do not broaden grants.

### 2. Tests to add or strengthen if missing

Add focused regression tests only if current tests do not already pin this:

- SQL static test for `normalize_email_canonical()` behavior in `sql/56`.
- TS helper parity tests for Gmail/Googlemail and non-Gmail dot significance.
- `get_my_loans` static SQL test that Branch 2 canonicalizes stored `recipient_email_normalized`.
- `claim_loan_invitation` static SQL test: no `expires_at` rejection in pending claim path.
- App/server-action test or mocked RPC test showing dotted invitation + undotted actor resolves to visible pending row.
- Wrong-email test: unrelated canonical email cannot claim.

Avoid false-positive mocks. If a mock returns a loan regardless of `.in()`/filter arguments, update it so the test would fail if canonical matching regresses.

### 3. Runtime/manual verification plan

If Stebbi can provide local/Supabase state, guide him through the localhost checks below. Claude should not run production SQL or mutate production data without explicit Stebbi approval.

If local Supabase is available and safe test data can be created, use only synthetic emails and test users. Do not use real user emails in logs, fixtures, screenshots, or handoff.

## SQL/Supabase rules

- Do not write a SQL57 migration unless verification finds a concrete remaining DB-side defect.
- Do not run SQL, Supabase dashboard actions, production data correction, or schema-cache commands unless Stebbi explicitly asks.
- If SQL needs to be run, prepare:
  - exact SQL
  - whether it is read-only or mutating
  - affected functions/tables/grants
  - RLS/auth/grant impact
  - rollback plan
  - localhost/prod verification steps
- Never weaken RLS or broaden function grants to `anon`/`authenticated`.
- Do not log recipient emails, invitation ids paired with real emails, auth user emails, secrets, or tokens.

## Expected implementation outcome

Preferred outcome:

- No code changes needed except maybe tests/docs.
- #43 can be marked ready for Stebbi localhost/prod confirmation, then moved to DONE after confirmation.

Acceptable outcome if bug remains:

- Small, targeted fix in SQL or TS with tests.
- Handoff back to Codex before any production SQL/deploy if migration or data correction is required.

Not acceptable in this phase:

- Broad rewrite of loan invitation model.
- Folding #52/#37 full event-feed work into this closeout.
- Changing auth/session behavior.
- Changing RLS/grants broadly.
- Adding new user-visible route structure from #22.

## Suggested commands

Run targeted tests first:

```bash
npm run test:run -- lib/__tests__/sql-migration.test.ts lib/__tests__/loans.test.ts lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts
npm run type-check
```

If those pass and no code changes are made, report that clearly. If broader confidence is needed before handoff:

```bash
npm run test:run
```

## Localhost checks for Stebbi

Use only safe synthetic users/emails unless Stebbi intentionally tests his own account.

### A. Dotted Gmail invitation is visible to undotted Gmail login

Setup:

- Sender user: any test sender.
- Recipient/login user: `fyrriseinni@gmail.com`.
- Invitation email typed by sender: `fyrri.seinni@gmail.com`.

Steps:

1. Sender creates a loan with recipient email `fyrri.seinni@gmail.com`.
2. Recipient logs in as `fyrriseinni@gmail.com`.
3. Open `/auth-mvp/lanad-og-skilad`.

Expected:

- The pending loan appears for recipient.
- It is marked as needing acknowledgement.
- No unrelated loans appear.
- No recipient email leaks in UI where it should not.

### B. Undotted Gmail invitation is visible to dotted Gmail login

Setup:

- Recipient/login user: `fyrri.seinni@gmail.com`.
- Invitation email typed by sender: `fyrriseinni@gmail.com`.

Expected:

- Same as A, but in reverse.
- This confirms read paths normalize both stored and actor email.

### C. Googlemail maps to Gmail

Setup:

- Invitation email: `fyrri.seinni@googlemail.com`.
- Login: `fyrriseinni@gmail.com`.

Expected:

- Pending row is visible and claimable.
- Stored/new invitation should use canonical `@gmail.com` where write path applies.

### D. Non-Gmail dots remain significant

Setup:

- Invitation email: `fyrri.seinni@example.com`.
- Login: `fyrriseinni@example.com`.

Expected:

- Pending row is not visible and cannot be claimed.
- This protects non-Gmail dot semantics.

### E. Pending soft-ack claim after email-link expiry

Setup:

- A pending invitation whose `expires_at` is in the past, but `status = 'pending'`.
- Actor email canonically matches recipient email.

Steps:

1. Recipient opens `/auth-mvp/lanad-og-skilad`.
2. Click `Þekki málið`.

Expected:

- Claim succeeds.
- Loan becomes normal shared loan for both parties.
- No `expired` / `not_claimable` error solely because `expires_at` passed.

Do not casually mutate production rows to create this state. If needed, ask Stebbi for explicit approval and provide a read-only preflight plus exact update/rollback plan.

### F. Wrong-email safety

Setup:

- Invitation belongs to `fyrri.seinni@gmail.com` canonical recipient.
- Login as `annad@example.com`.

Expected:

- Pending row is not visible.
- Direct claim attempt, if tested through UI/API, fails safely as wrong email/not found.
- No private loan details or recipient email leak.

## Handoff back to Codex

Claude should send back:

1. Whether #43 is ready to close or still needs a fix.
2. Files inspected.
3. Files changed, if any.
4. Tests run and exact results.
5. Whether any SQL was written or run.
6. Whether schema cache/reload was touched.
7. Remaining risks.
8. Localhost checks Stebbi completed or still needs to complete.
9. If asking to move #43 to DONE, list the concrete evidence.
