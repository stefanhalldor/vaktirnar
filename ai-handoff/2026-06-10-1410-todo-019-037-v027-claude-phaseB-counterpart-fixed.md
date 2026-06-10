# TODO #19 / #37 - Phase B: counterpart logic fixed, all v026 findings addressed

## Based on

Codex review: `2026-06-10-1402-todo-019-037-v026-codex-phaseB-counterpart-plan-review.md`

---

## Part 1 — SQL fix: counterpart_user_id (finding 1)

`sql/48_update_loan_with_diff.sql` updated.

### Bug that was fixed

v025 returned `counterpart_user_id = v_loan.borrower_user_id` unconditionally. This is wrong for borrower-created loans: when `created_by = borrower_user_id`, the actor is the borrower. The CASE would return `borrower_user_id = p_actor_id`, which the app skips (`counterpart = actor`), leaving the real lender with no inbox event.

### Fix

```sql
CASE
  WHEN v_loan.lender_user_id IS NOT NULL
       AND v_loan.lender_user_id IS DISTINCT FROM p_actor_id
    THEN v_loan.lender_user_id
  WHEN v_loan.borrower_user_id IS NOT NULL
       AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id
    THEN v_loan.borrower_user_id
  ELSE NULL::uuid
END
```

For lender actor: `lender_user_id = p_actor_id` so first branch skips, second branch returns `borrower_user_id`.
For borrower-created actor: `lender_user_id IS DISTINCT FROM p_actor_id` so first branch returns `lender_user_id`.
For no counterpart (single-party loan): both NULL, returns NULL.

### Comments updated

- Removed "actor is always lender side" language.
- Changed "Authorization before any data access" to "Before-values captured after authorization."
- Added direction examples to the counterpart comment.

---

## Part 2 — i18n keys updated: Skiladagur / Return date (finding 2)

Key names changed from `eventDetailDueDate*` to `eventDetailReturnDate*`. All user-facing wording changed. Internal `due_at` field name stays unchanged.

| Key | IS | EN |
|-----|----|----|
| `eventDetailReturnDateRemoved` | `Skiladagur fjarlægður: {date}` | `Return date removed: {date}` |
| `eventDetailReturnDateChanged` | `Skiladagur breytt: {oldDate} -> {newDate}` | `Return date changed: {oldDate} -> {newDate}` |
| `eventDetailReturnDateAdded` | `Skiladagur bætt við: {date}` | `Return date added: {date}` |
| `eventDetailItemNameChanged` | `Nafn breytt: {oldName} -> {newName}` | `Name changed: {oldName} -> {newName}` |
| `eventDetailLoanedAtChanged` | `Lánsdagur breytt: {oldDate} -> {newDate}` | `Loan date changed: {oldDate} -> {newDate}` |
| `eventDetailNoteAdded` | `Athugasemd bætt við` | `Note added` |
| `eventDetailNoteRemoved` | `Athugasemd fjarlægð` | `Note removed` |
| `eventDetailNoteChanged` | `Athugasemd breytt` | `Note changed` |

Arrow style: `->` (ASCII, consistent with Codex recommendation, avoids UTF-8 glyph in message values).

---

## Part 3 — Verification script (finding 3 tightened)

grep changed from `'"unauthenticated"'` to `'"status"[[:space:]]*:[[:space:]]*"unauthenticated"'` to avoid false positives from unexpected error text.

```bash
verify_rpc() {
  local fn="$1"
  local body="$2"
  local full_response http_code response_body

  full_response=$(curl -s -w '\n%{http_code}' \
    -X POST \
    "https://${SUPABASE_PROJECT_REF}.supabase.co/rest/v1/rpc/${fn}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body")

  http_code=$(printf '%s' "$full_response" | tail -1)
  response_body=$(printf '%s' "$full_response" | head -n -1)

  if [ "$http_code" != "200" ]; then
    echo "FAIL ${fn}: expected HTTP 200, got ${http_code}"
    return 1
  fi

  if ! printf '%s' "$response_body" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"unauthenticated"'; then
    echo "FAIL ${fn}: HTTP 200 but status!=unauthenticated. Body: ${response_body}"
    return 1
  fi

  echo "OK ${fn}: HTTP 200, status=unauthenticated confirmed"
  return 0
}

verify_rpc update_loan_with_diff \
  '{"p_actor_id":"00000000-0000-0000-0000-000000000000","p_loan_id":"00000000-0000-0000-0000-000000000000","p_item_name":"verify","p_note":null,"p_loaned_at":"2026-01-01","p_due_at":null}' \
  || exit 1

verify_rpc update_loan_item_details_with_diff \
  '{"p_actor_id":"00000000-0000-0000-0000-000000000000","p_loan_id":"00000000-0000-0000-0000-000000000000","p_item_name":"verify","p_note":null}' \
  || exit 1

echo "Both RPCs verified. Safe to deploy app code."
```

**Preconditions before running:** `SUPABASE_PROJECT_REF` and `SUPABASE_SERVICE_ROLE_KEY` set in shell. `set -x` must be OFF. Do not paste key in chat, files, screenshots, or logs.

---

## Part 4 — One eventKey per mutation (finding 5)

App generates `eventKey` once per `updateLoanItemDetails` call and reuses it for both actor and counterpart `recordRecentEvent` calls. Because `recent_events` uniqueness is `(user_id, event_key)`, the same key is safe for two different user rows.

```ts
const eventKey = `loans:loan:${loanId}:updated:${new Date().toISOString()}`

await recordRecentEvent({ userId: user.id, eventKey, ... })

if (row.counterpart_user_id && row.counterpart_user_id !== user.id) {
  await recordRecentEvent({ userId: row.counterpart_user_id, eventKey, ... })
}
```

---

## Part 5 — Defensive data[0] parsing (finding 6)

```ts
const row = (data as Array<{ status: string; ... }>)?.[0]
const status = row?.status ?? 'save_failed'
```

If `data` is null/empty/malformed, `status` falls to `'save_failed'` and the action returns `{ ok: false, error: 'save_failed' }`. No crash.

---

## Part 6 — Updated tests (both counterpart directions)

### `lib/__tests__/event-diff.test.ts`

Direct unit tests for `computeLoanChanges` (unchanged from v025 plan).

### `lib/__tests__/actions.test.ts`

New tests for `updateLoanItemDetails`:
- **lender actor, borrower counterpart**: counterpart row is `borrower_user_id`, `recordRecentEvent` called twice with same `eventKey`, different `userId`
- **borrower-created actor, lender counterpart**: counterpart row is `lender_user_id`, same pattern
- **no counterpart (null)**: `recordRecentEvent` called once (actor only)
- **counterpart = actor edge case**: `recordRecentEvent` called once (actor only)
- **no changes**: `recordRecentEvent` not called at all

---

## Deploy order (unchanged from v025)

1. Apply `sql/48_update_loan_with_diff.sql` to Supabase.
2. Run verification script — confirm both RPCs return `status=unauthenticated`.
3. If either FAIL: reload schema cache in Supabase dashboard (API settings > Reload) and retry.
4. Only after both OK: deploy app code.
5. Old app continues using `update_loan` / `update_loan_item_details` until deploy completes.

**Rollback (if app already deployed):**
1. Redeploy previous app version.
2. Verify edits work against old RPCs.
3. Drop new functions.
4. Reload schema cache if needed.

---

## What Codex should confirm before Stebbi applies SQL

1. `sql/48_update_loan_with_diff.sql` — counterpart CASE logic correct for both loan directions
2. Verification script grep pattern
3. One `eventKey` per mutation reused for actor + counterpart
4. `Skiladagur` / `Return date` wording and key names
