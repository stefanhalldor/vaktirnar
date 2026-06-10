# Post-release review: #23 #24 #25 — narrow item-details edit, CTA rename/move

**Commit:** fcdc316
**Date:** 2026-06-09
**Reviewer target:** Codex
**Status:** Shipped. DB migration (sql/44) still needs to be applied to Supabase.

---

## What shipped

### #25 — CTA rename and move
- `messages/is.json`: `"newItem": "Skrá hlut"` → `"Skrá hlut í láni"`
- `messages/en.json`: `"newItem": "Add item"` → `"Add loaned item"`
- CTA link moved from bottom of `LoanList.tsx` (client) to top of `lanad-og-skilad/page.tsx` (server), before pending invitations
- `LoanList.tsx`: removed `Link` import and the add-button section

### #24 — canEditItemDetails flag
- `lib/loans/types.ts`: added `EditLoanItemDetailsSchema` (item_name + note only), `EditLoanItemDetailsInput`, `canEditItemDetails` field to `LoanCardControls`, and `my_role` to `getLoanCardControls` Pick
- `canEditItemDetails = item.is_creator || item.my_role === 'lender'`
- `components/loans/LoanCard.tsx`: pencil now gated on `canEditItemDetails` instead of `canEdit`

### #23 — narrow edit route and action
- `components/loans/LoanItemDetailsForm.tsx`: new client form for item_name + note only
- `lib/loans/actions.ts`: `updateLoanItemDetails(loanId, input)` — validates via `EditLoanItemDetailsSchema`, calls `update_loan_item_details` RPC, revalidates both `/auth-mvp/lanad-og-skilad` and `/auth-mvp/heim`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`: split routing
  - `canEdit` (creator + pre-acceptance) → `LoanForm` + `updateLoan`
  - `canEditItemDetails` but not `canEdit` → `LoanItemDetailsForm` + `updateLoanItemDetails`
  - neither → `notFound()`
- `sql/44_loan_item_details_edit.sql`: `update_loan_item_details` RPC (REVOKE PUBLIC/anon/authenticated, GRANT service_role)

---

## Key invariants Codex should verify

### Snapshot immutability (highest priority)
`sql/44` MUST NOT update `loan_invitations.item_name_snapshot`. Verify:
```sql
-- The UPDATE in update_loan_item_details should only touch loan_items, not loan_invitations
-- Expected: UPDATE public.loan_items SET item_name = ..., note = ..., updated_at = now()
-- NOT expected: any UPDATE on loan_invitations
```
The email idempotency contract requires that `invitationId + attemptNumber` always maps to the same payload. Updating the snapshot would break retries.

### Permission model
`update_loan_item_details` should return `'not_found'` (not a permissions error) for borrowers who are not creators. This conceals whether the loan exists at all. Verify the SQL CASE/IF structure:
```sql
-- Should: check created_by = p_actor_id OR lender_user_id = p_actor_id
-- If neither matches: RETURN 'not_found'
-- NOT: RETURN 'forbidden' or RAISE EXCEPTION
```

### Input validation defense-in-depth
SQL must validate independently of Zod:
```sql
-- item_name: char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200 → 'invalid_item_name'
-- note: char_length(trim(p_note)) > 1000 → 'invalid_note'
-- note output: NULLIF(trim(p_note), '')
```

### Service_role grants
```sql
REVOKE EXECUTE ON FUNCTION public.update_loan_item_details(...) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_loan_item_details(...) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_loan_item_details(...) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.update_loan_item_details(...) TO service_role;
```

---

## Files changed (commit fcdc316)

```
app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx  (modified)
app/auth-mvp/lanad-og-skilad/page.tsx              (modified)
components/loans/LoanCard.tsx                       (modified)
components/loans/LoanItemDetailsForm.tsx            (new)
components/loans/LoanList.tsx                       (modified)
lib/__tests__/actions.test.ts                       (modified)
lib/__tests__/loan-pages.test.tsx                   (modified)
lib/__tests__/loans.test.ts                         (modified)
lib/loans/actions.ts                                (modified)
lib/loans/types.ts                                  (modified)
messages/en.json                                    (modified)
messages/is.json                                    (modified)
sql/44_loan_item_details_edit.sql                   (new)
```

---

## What Codex should do

1. **Read `sql/44_loan_item_details_edit.sql`** and verify:
   - No snapshot update (see above)
   - Correct permission model (not_found for unauthorized, not forbidden)
   - SQL-level input validation matches spec
   - REVOKE/GRANT pattern matches other sql/* files
   - BEGIN/COMMIT transaction wrapper

2. **Apply sql/44 to Supabase** (this is the only remaining deployment step)

3. **Optional regression check**: run `npx vitest run` locally to confirm green

---

## Test coverage added

- `loans.test.ts`: `canEditItemDetails` matrix (8 cases), `EditLoanItemDetailsSchema` (8 cases)
- `actions.test.ts`: `updateLoanItemDetails` — happy path, schema rejection, RPC errors (6 cases)
- `loan-pages.test.tsx`: CTA exact-match, edit page routing (5 cases: LoanForm, LoanItemDetailsForm x2, notFound x2)

All 179 tests pass, `tsc --noEmit` clean.
