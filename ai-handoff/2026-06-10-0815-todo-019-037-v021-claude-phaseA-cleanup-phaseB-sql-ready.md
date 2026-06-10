# TODO #19 / #37 - Phase A cleanup done, Phase B SQL ready

## Based on

Codex review: `2026-06-10-0807-todo-019-037-v020-codex-phaseA-phaseB-review.md`

---

## Part 1 — Phase A cleanup: DONE

Addressed all three items from finding 3.

### Test renamed

`lib/__tests__/home-page.test.tsx:453`

Old: `'shows at most 3 events (server limits to 3)'`
New: `'renders all unread events when 3 events exist'`

The behavior is not "at most 3" — the server now fetches all unread. The new title accurately describes what the test covers.

### New test added

In `describe('HeimPage — Lesið / ack events')`:

```ts
it('clicking "Allt lesið" sends all fetched event IDs to ackRecentEvents', async () => {
  setupGuard()
  setupProfile(null)
  setupRpcs([])
  setupRecentEvents([
    makeEvent({ id: 1, payload: { itemName: 'Item 1' } }),
    makeEvent({ id: 2, payload: { itemName: 'Item 2' } }),
    makeEvent({ id: 3, payload: { itemName: 'Item 3' } }),
    makeEvent({ id: 4, payload: { itemName: 'Item 4' } }),
  ])
  render(await HeimPage())
  fireEvent.click(screen.getByText('Allt lesið'))
  expect(mockAckRecentEvents).toHaveBeenCalledWith({ event_ids: [1, 2, 3, 4] })
})
```

This directly asserts that `ackRecentEvents` receives every fetched event ID when "Allt lesið" is clicked.

### Test results

```
npx vitest run lib/__tests__/home-page.test.tsx
49 passed (was 46 before Phase A + cleanup)
```

Full suite will be run before commit.

---

## Part 2 — Phase B SQL file created

`sql/48_update_loan_with_diff.sql` is created with the exact SQL from v019, wrapped in `BEGIN; ... COMMIT;`.

**Rollback:** `DROP FUNCTION IF EXISTS public.update_loan_with_diff(uuid,uuid,text,text,date,date);`

The file is ready for Codex review. Stebbi should not apply it to Supabase until Codex has reviewed the SQL file.

---

## Part 3 — Phase B updated deploy order with PostgREST verification

Addressing finding 1 from v020.

Before deploying app code that calls `update_loan_with_diff`, perform a non-mutating verification call:

```bash
# Replace SERVICE_ROLE_KEY and PROJECT_REF with actual values
curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  "https://<PROJECT_REF>.supabase.co/rest/v1/rpc/update_loan_with_diff" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "p_actor_id":  "00000000-0000-0000-0000-000000000000",
    "p_loan_id":   "00000000-0000-0000-0000-000000000000",
    "p_item_name": "verify",
    "p_note":      null,
    "p_loaned_at": "2026-01-01",
    "p_due_at":    null
  }'
```

Expected: HTTP `200` with `[{"status":"unauthenticated",...}]` — the function exists and auth check fires.
If HTTP `404` or PostgREST error: schema cache has not refreshed yet. Reload the schema cache in Supabase dashboard (API settings > Reload) before deploying app code.

No real user data is touched — the nil UUID will always return `unauthenticated` before any row lookup.

**Updated deploy order:**

1. Apply `sql/48_update_loan_with_diff.sql` on Supabase.
2. Run the verification curl — confirm `unauthenticated` response.
3. If verification fails: reload schema cache in Supabase, retry step 2.
4. Only after step 2 succeeds: deploy app code.
5. Old app still calls `update_loan` (unchanged) — safe throughout.

---

## Part 4 — `computeLoanChanges` test strategy

Addressing finding 4 from v020.

Codex's recommendation: move to a small exported module if diff logic grows; otherwise, test indirectly through `updateLoan`.

Decision: **move to `lib/loans/event-diff.ts`**, export `computeLoanChanges`, and unit-test it directly there. Reasons:

- The diff logic has 4 fields with 3 change types each — it benefits from focused unit tests that do not need to mock the full RPC.
- Keeping the function in `actions.ts` non-exported would make tests awkward.
- A single-function pure helper module is not premature abstraction — it is the minimal clean split.

This means Phase B implementation will create `lib/loans/event-diff.ts` with the exported function, and `lib/__tests__/event-diff.test.ts` with direct unit tests.

---

## Part 5 — Scope question for Stebbi: Phase B vs B2

Addressing finding 2 from v020.

**Background:**

- `updateLoan` = creator edits before any invitation is accepted. This is the pre-acceptance path.
- `updateLoanItemDetails` = creator or lender edits item name / note after the loan is accepted (narrow edit).

Phase B as planned covers `updateLoan` only. `updateLoanItemDetails` would be deferred to B2.

**Codex leans toward including `updateLoanItemDetails` soon** because the accepted/narrow edit path may be the most common edit scenario for #37 (event history clarity).

**Options:**

- **Option A (current plan):** Phase B = `update_loan_with_diff` + app changes for `updateLoan` only. Phase B2 = `update_loan_item_details_with_diff` + `updateLoanItemDetails` app changes. Two SQL migrations, two deploys.
- **Option B (expanded):** Include both `update_loan_with_diff` and `update_loan_item_details_with_diff` in a single SQL migration and deploy them together. One migration, one deploy.

Both options leave all existing RPCs (`update_loan`, `update_loan_item_details`) completely unchanged.

Stebbi, please decide:

> **A or B?**

If B: Claude Code will add `update_loan_item_details_with_diff` to the same SQL file before Stebbi applies it to Supabase.

---

## What Codex should review before Stebbi applies SQL

1. `sql/48_update_loan_with_diff.sql` — confirm SQL is correct.
2. This document — confirm deploy order with PostgREST verification is acceptable.
3. `computeLoanChanges` → `lib/loans/event-diff.ts` decision.

Stebbi decision needed: Option A or B for scope.
