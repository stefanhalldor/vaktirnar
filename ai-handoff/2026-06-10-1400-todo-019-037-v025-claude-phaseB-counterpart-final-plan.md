# TODO #19 / #37 - Phase B final plan: counterpart events + all v024 findings addressed

## Based on

Codex review: `2026-06-10-1351-todo-019-037-v024-codex-phaseB-expanded-sql-review.md`

---

## Part 1 — SQL updated: counterpart support added

`sql/48_update_loan_with_diff.sql` is revised. Both RPCs remain in one `BEGIN; ... COMMIT;` block.

### What changed from v023

`update_loan_item_details_with_diff` now returns a fourth column:

```
counterpart_user_id  uuid
```

This is `v_loan.borrower_user_id` — the party who cannot perform this edit but should receive an inbox event when the lender side changes item name or note.

For error statuses, `counterpart_user_id` returns `NULL::uuid` (same as before-values columns).

### Why `borrower_user_id` is the correct counterpart

`update_loan_item_details` authorization allows `created_by OR lender_user_id`. Because borrower-only actors get `not_found`, the actor is always on the lender side. The counterpart who needs the inbox event is therefore always the borrower.

App guard: record counterpart event only when `counterpart_user_id IS NOT NULL AND counterpart_user_id !== user.id`. This protects against edge cases (null borrower, or an unlikely scenario where borrower = actor).

### `update_loan_with_diff` is unchanged

Pre-acceptance: actor-only events are acceptable (counterpart identity may not be settled). No `counterpart_user_id` column added.

### Full safety posture preserved (finding 5)

Both RPCs:
- `SET search_path = ''`
- `FOR UPDATE` row lock before returning before-values
- Authorization before any data access
- Unauthorized actors receive `not_found` (not a distinguishable error)
- `GRANT EXECUTE TO service_role` only
- `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`
- No emails, no profile data, no unrelated columns returned

---

## Part 2 — Rollback order (finding 3)

If rollback is needed after app code has deployed:

1. Redeploy previous app version (the one that calls `update_loan` and `update_loan_item_details`)
2. Verify edits succeed against old RPCs (spot-check in production)
3. Drop new functions:
   ```sql
   DROP FUNCTION IF EXISTS public.update_loan_with_diff(uuid,uuid,text,text,date,date);
   DROP FUNCTION IF EXISTS public.update_loan_item_details_with_diff(uuid,uuid,text,text);
   ```
4. If Supabase API still shows stale metadata, reload PostgREST schema cache (API settings > Reload)

If rollback happens before app deploy (SQL-only rollback): only step 3 is needed — old app never called new RPCs.

---

## Part 3 — PostgREST verification script (finding 2 fixed)

Verifies both HTTP 200 and `status = unauthenticated` in response body. Exits non-zero on failure.

**Set env vars in shell before running. Do not paste keys into chat, files, screenshots, or logs. Ensure `set -x` / shell debug mode is OFF.**

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

  if ! printf '%s' "$response_body" | grep -q '"unauthenticated"'; then
    echo "FAIL ${fn}: HTTP 200 but body does not contain unauthenticated. Body: ${response_body}"
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

The nil UUID actor returns `unauthenticated` before any row lookup — no real data touched.

---

## Part 4 — Updated i18n keys (finding 4)

`eventDetailLoanedAtChanged` now includes old/new dates, matching due_at detail level:

| Key | IS | EN |
|-----|----|----|
| `eventDetailDueDateRemoved` | `Gjalddagi fjarlægður: {date}` | `Due date removed: {date}` |
| `eventDetailDueDateChanged` | `Gjalddagi breytt: {oldDate} → {newDate}` | `Due date changed: {oldDate} → {newDate}` |
| `eventDetailDueDateAdded` | `Gjalddagi bætt við: {date}` | `Due date added: {date}` |
| `eventDetailItemNameChanged` | `Nafn breytt: {oldName} → {newName}` | `Name changed: {oldName} → {newName}` |
| `eventDetailLoanedAtChanged` | `Lánsdagur breytt: {oldDate} → {newDate}` | `Loan date changed: {oldDate} → {newDate}` |
| `eventDetailNoteAdded` | `Athugasemd bætt við` | `Note added` |
| `eventDetailNoteRemoved` | `Athugasemd fjarlægð` | `Note removed` |
| `eventDetailNoteChanged` | `Athugasemd breytt` | `Note changed` |

---

## Part 5 — Full app implementation plan

### `lib/loans/event-diff.ts` (new file)

Exported pure function, directly unit-tested in `lib/__tests__/event-diff.test.ts`.

```ts
export type LoanFieldChangeType = 'changed' | 'added' | 'removed'

export interface LoanFieldChange {
  field: 'item_name' | 'loaned_at' | 'due_at' | 'note'
  changeType: LoanFieldChangeType
  oldValue?: string | null   // item_name, loaned_at, due_at only
  newValue?: string | null   // item_name, loaned_at, due_at only
}

export function computeLoanChanges(
  before: { item_name: string | null; note: string | null; loaned_at?: string | null; due_at?: string | null },
  after:  { item_name: string | null; note: string | null; loaned_at?: string | null; due_at?: string | null },
): LoanFieldChange[]
```

Note field: only `changeType` (`added`/`removed`/`changed`) — no content.

### `lib/recent-events/types.ts`

Add `LoanFieldChange`, `LoanFieldChangeType` to exports. Add to `RecentEventPayload`:

```ts
export interface RecentEventPayload {
  itemName?: string
  changes?: LoanFieldChange[]
}
```

Add `detailLines?: string[]` to `RecentEventDisplay`.

### `lib/loans/actions.ts`

**`updateLoan`:**
- Call `update_loan_with_diff` instead of `update_loan`
- Parse `data[0]` row
- Status checks identical to current
- On `ok`: `computeLoanChanges(before, after)`
  - If `changes.length > 0`: record `loan_updated` event with `payload: { itemName, changes }`
  - If `changes.length === 0`: skip event, return `{ ok: true }`

**`updateLoanItemDetails`:**
- Call `update_loan_item_details_with_diff` instead of `update_loan_item_details`
- Parse `data[0]` row
- Status checks identical to current
- On `ok`: `computeLoanChanges(before, after)` (item_name + note only)
  - If `changes.length > 0`:
    - Record actor event: `recordRecentEvent({ userId: user.id, ... payload: { itemName, changes } })`
    - If `row.counterpart_user_id && row.counterpart_user_id !== user.id`:
      - Record counterpart event: `recordRecentEvent({ userId: row.counterpart_user_id, ... payload: { itemName, changes } })`
      - Same payload, different `userId` — no email, no note content
  - If `changes.length === 0`: skip all events, return `{ ok: true }`

Both actions: `recordRecentEvent` is best-effort (never throws to caller).

### `app/auth-mvp/heim/page.tsx`

After building `label`, compute `detailLines: string[]` from `event.payload.changes` using the i18n keys above. Pass as `detailLines` on the `RecentEventDisplay` object.

### `app/auth-mvp/heim/RecentSection.tsx`

Render `detailLines` below `drawerEvent.label` as small muted wrapped text:
```tsx
{drawerEvent.detailLines?.map((line, i) => (
  <p key={i} className="text-sm text-muted-foreground break-words">{line}</p>
))}
```

---

## Part 6 — Tests (all phases)

### `lib/__tests__/event-diff.test.ts`

Direct unit tests for `computeLoanChanges`:
- All fields identical → `[]`
- `due_at` null → non-null: `added`
- `due_at` non-null → null: `removed`
- `due_at` changed: `changed` with `oldValue`/`newValue`
- `item_name` changed: `changed` with `oldValue`/`newValue`
- `loaned_at` changed: `changed` with `oldValue`/`newValue`
- `note` null → non-null: `added` (no content)
- `note` non-null → null: `removed` (no content)
- `note` changed: `changed` (no content)
- Multiple fields changed: all in array

### `lib/__tests__/actions.test.ts`

For `updateLoan`:
- Mock `update_loan_with_diff` RPC, confirm `recordRecentEvent` receives `changes` on ok
- No changes: `recordRecentEvent` not called, returns `{ ok: true }`
- `not_found` / `not_editable` / `invalid_*`: same as before

For `updateLoanItemDetails`:
- Mock `update_loan_item_details_with_diff` RPC
- Changes present, counterpart set: `recordRecentEvent` called twice
- Changes present, no counterpart (null): `recordRecentEvent` called once (actor only)
- Changes present, counterpart = actor: `recordRecentEvent` called once (actor only)
- No changes: `recordRecentEvent` not called, returns `{ ok: true }`

### `lib/__tests__/home-page.test.tsx`

- `detailLines` rendered in drawer for `loan_updated` event with `changes` payload

---

## What Codex should review before Stebbi applies SQL

1. `sql/48_update_loan_with_diff.sql` — counterpart_user_id column added to `update_loan_item_details_with_diff`
2. Rollback order (Part 2)
3. Verification script (Part 3) — HTTP status check + non-zero exit
4. Counterpart event recording logic (Part 5)
5. No-op skip logic (Part 5)

Stebbi applies SQL only after Codex approves.
