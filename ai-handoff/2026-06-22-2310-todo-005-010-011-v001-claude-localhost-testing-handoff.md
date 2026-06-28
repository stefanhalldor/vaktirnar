# Handoff: Localhost Testing — v005/v010/v011

**Date:** 2026-06-22
**TODOs:** 043 (Gmail canonical), 049 v010 (dynamic directory), 049 v011 (UUID display fix)
**Status:** Committed + pushed. SQL migration not yet run in Supabase.

---

## What was shipped

### v010 — Dynamic tengsl directory
`/stillingar/tengsl` now shows **all people you have shared activity with**, not just those with manually persisted relationship rows. Counterparts are inferred from `loan_items` (direct loans) and `loan_invitations` (pending email invites + soft-ack reverse). Missing rows are lazy-upserted on first load.

### v011 — UUID display fix
Previously, lazy-upserted rows with only `counterpart_user_id` (no name/email) fell through and showed a raw UUID. Now `counterpart_display_name` is batch-fetched from `profiles` and used as fallback: `private_display_name ?? counterpart_display_name ?? email_canonical ?? "Óþekktur tengiliður"`.

### v005 — Gmail canonical (SQL)
New SQL helper `normalize_email_canonical()` applied to both sides of every email comparison in: `get_my_loans`, `claim_loan_invitation`, `create_loan`, `add_loan_invitation`, `get_my_pending_invitations`, `get_invitation_for_claim`, `decline_invitation`.

**Effect:** `bob.smith@gmail.com` and `bobsmith@gmail.com` are now treated as the same address throughout.

---

## Before testing: run SQL migration in Supabase

1. Open Supabase dashboard > SQL editor
2. Run `sql/56_normalize_email_canonical.sql` (full contents, single transaction)
3. Click **"Reload schema cache"** (or restart PostgREST)

**Preflight check** (optional, run before migration to see impact):
```sql
-- How many existing non-canonical gmail addresses in invitations?
SELECT COUNT(*) FROM loan_invitations
WHERE lower(trim(recipient_email_normalized)) LIKE '%gmail.com'
  AND recipient_email_normalized != replace(split_part(lower(trim(recipient_email_normalized)), '@', 1), '.', '') || '@gmail.com';

-- How many relationship rows have non-canonical email_canonical?
SELECT COUNT(*) FROM relationships
WHERE lower(trim(email_canonical)) LIKE '%gmail.com'
  AND email_canonical != replace(split_part(lower(trim(email_canonical)), '@', 1), '.', '') || '@gmail.com';
```

---

## Localhost testing checklist

### 1. Tengsl list shows all counterparts (v010)

- [ ] Log in as a user who has sent or received loans
- [ ] Go to `/stillingar/tengsl`
- [ ] Confirm **all counterparts appear** — both those you created manually and those inferred from loan activity
- [ ] If a counterpart was missing before, they should now appear after first load (lazy-upsert)

### 2. No UUID entries in list (v011)

- [ ] Scan the tengsl list for any raw UUID strings (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
- [ ] All entries should show a name, email, or "Óþekktur tengiliður" as the display label
- [ ] Counterparts who have a profile display name should show that name

### 3. Gmail dotted/undotted shows as one contact (v005 + v011)

Setup: You need two accounts where one uses `bob.smith@gmail.com` and the other uses `bobsmith@gmail.com` (same Gmail inbox).

- [ ] Log in as lender, create a loan and send invitation to `bob.smith@gmail.com`
- [ ] Log in as `bobsmith@gmail.com` (the same Gmail inbox, undotted form)
- [ ] Go to `/auth-mvp/heim` — the pending loan should appear
- [ ] Claim the loan (Þekki málið) — should succeed, no "invitation not found" error
- [ ] Go to `/stillingar/tengsl` as lender — borrower should appear **once** (not two entries)

### 4. Pending loans visible across Gmail variants (v005)

- [ ] Loan sent to `fyrri.seinni@gmail.com`
- [ ] Log in as `fyrriseinni@gmail.com`
- [ ] Loan appears in home page pending list
- [ ] Claim works

### 5. Soft-ack reverse direction (v010)

- [ ] Log in as a user who was **invited** (not the lender)
- [ ] Go to `/stillingar/tengsl`
- [ ] The lender should appear in their tengsl list (not just the lender's list)

---

## Known limitations / post-v005 notes

- **Existing non-canonical data in DB:** Invitations created before sql/56 may still have dotted gmail addresses stored. The SQL migration normalises the comparison functions but does NOT backfill stored data. A future data migration could canonicalise stored `recipient_email_normalized` and `email_canonical` columns, but it is not required for correctness — the SQL functions now normalise both sides at query time.

- **auth_mvp_allowlist:** If any allowlist entries use dotted Gmail form, they will still work because `guardFeatureAccess` uses `normalizeEmailForAccess()` in TypeScript, which is already canonical-aware.

- **Profile display names:** If a counterpart has not set a display name in their profile, `counterpart_display_name` will be null and the entry will fall back to `email_canonical` or "Óþekktur tengiliður". This is expected.
