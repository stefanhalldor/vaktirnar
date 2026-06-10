# TODO #19 / #37 - Phase B: expanded SQL (Option B) + all findings addressed

## Based on

Codex review: `2026-06-10-0818-todo-019-037-v022-codex-phaseB-sql-review.md`

Stebbi decision: **Option B** — include both `update_loan_with_diff` and `update_loan_item_details_with_diff` in the same SQL migration and deploy.

---

## Part 1 — SQL file updated

`sql/48_update_loan_with_diff.sql` now contains both RPCs in one `BEGIN; ... COMMIT;` block.

### `update_loan_with_diff(uuid, uuid, text, text, date, date)`

Same authorization as `update_loan` (sql/32):
- `auth.users` existence check
- creator-only (`created_by = p_actor_id`)
- no accepted invitation
- item_name length/empty validation
- due_at >= loaned_at validation

Returns `TABLE(status text, before_item_name text, before_note text, before_loaned_at date, before_due_at date)`.

Before-values are captured from the locked row after authorization, before the UPDATE.

### `update_loan_item_details_with_diff(uuid, uuid, text, text)`

Same authorization as `update_loan_item_details` (sql/44):
- `auth.users` existence check
- `created_by OR lender_user_id` — borrower-only actors get `not_found`
- item_name length/empty validation (with trim)
- note nullable, trimmed, max 1000 chars validation
- UPDATE uses `trim(p_item_name)` and `NULLIF(trim(p_note), '')` (matches sql/44 exactly)

Returns `TABLE(status text, before_item_name text, before_note text)`.

Both functions:
- `SET search_path = ''`
- `GRANT EXECUTE TO service_role`
- `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`
- `CREATE OR REPLACE FUNCTION` — idempotent
- Leave existing `update_loan` and `update_loan_item_details` untouched

**Rollback:**
```sql
DROP FUNCTION IF EXISTS public.update_loan_with_diff(uuid,uuid,text,text,date,date);
DROP FUNCTION IF EXISTS public.update_loan_item_details_with_diff(uuid,uuid,text,text);
```

---

## Part 2 — PostgREST verification (finding 2 fixed)

The `curl -o /dev/null` command from v021 discarded the response body. Fixed: verify both HTTP 200 and `status = unauthenticated` in the body.

Run after applying SQL, before deploying app code. Uses environment variables — do not paste real keys anywhere.

```bash
# Set env vars in your shell before running (do not commit or log these)
# SUPABASE_PROJECT_REF=your-project-ref
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

verify_rpc() {
  local fn="$1"
  local body="$2"
  local response
  response=$(curl -s \
    -X POST \
    "https://${SUPABASE_PROJECT_REF}.supabase.co/rest/v1/rpc/${fn}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body")
  echo "${fn}: $response"
  echo "$response" | grep -q '"unauthenticated"' && echo "OK" || echo "FAIL - not visible yet"
}

verify_rpc update_loan_with_diff \
  '{"p_actor_id":"00000000-0000-0000-0000-000000000000","p_loan_id":"00000000-0000-0000-0000-000000000000","p_item_name":"verify","p_note":null,"p_loaned_at":"2026-01-01","p_due_at":null}'

verify_rpc update_loan_item_details_with_diff \
  '{"p_actor_id":"00000000-0000-0000-0000-000000000000","p_loan_id":"00000000-0000-0000-0000-000000000000","p_item_name":"verify","p_note":null}'
```

Expected output for each: body contains `"unauthenticated"` and script prints `OK`.

If either prints `FAIL`: reload schema cache in Supabase dashboard (API settings > Reload) and retry before deploying app code.

The nil UUID actor always returns `unauthenticated` before any row lookup — no real data is touched.

---

## Part 3 — No-op update behavior (finding 3)

If `computeLoanChanges` returns an empty array (user saved without changing any user-visible field), **no `loan_updated` event is recorded**. The action still returns `{ ok: true }`.

This keeps `Nýlegt` trustworthy — every `loan_updated` row in the feed means something actually changed.

Tests will cover:
- `computeLoanChanges` returns `[]` when all fields are identical
- `updateLoan` with no changes: RPC called, `recordRecentEvent` NOT called, returns `{ ok: true }`
- `updateLoanItemDetails` with no changes: same pattern

---

## Part 4 — Counterpart scope decision (finding 4)

**This phase: actor only.**

For both `updateLoan` and `updateLoanItemDetails`, the `loan_updated` diff event is recorded only for `user.id` (the actor). The counterpart does not receive an event from these edits in this phase.

Reasoning:
- Counterpart visibility (`lender_user_id` or `borrower_user_id` receiving events about the other party's edits) is #38/#39 scope.
- Pulling that in here would require looking up the counterpart user ID after the RPC, adding a second `recordRecentEvent` call, and deciding per-field privacy rules for what the counterpart sees.
- That is out of scope for #37 and would delay a clean Phase B ship.

This is a deliberate product decision for Stebbi to confirm: **only the actor sees their own edit events in `Nýlegt`** until #38/#39.

---

## Part 5 — `lib/loans/event-diff.ts` (confirmed)

`computeLoanChanges` moves to `lib/loans/event-diff.ts` as an exported pure function. Direct unit tests in `lib/__tests__/event-diff.test.ts`.

---

## App implementation plan (after SQL verified)

### `lib/loans/event-diff.ts` (new file)

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
): LoanFieldChange[] { ... }
```

### `lib/recent-events/types.ts`

Add `LoanFieldChange`, `LoanFieldChangeType` re-exports, and `detailLines?: string[]` to `RecentEventDisplay`.

Payload type extended:
```ts
export interface RecentEventPayload {
  itemName?: string
  changes?: LoanFieldChange[]
}
```

### `lib/loans/actions.ts`

`updateLoan`:
- Call `update_loan_with_diff` instead of `update_loan`
- Parse row array
- Status checks identical
- On `ok`: call `computeLoanChanges`; if `changes.length > 0`, call `recordRecentEvent` with `payload: { itemName, changes }`; if `changes.length === 0`, skip event

`updateLoanItemDetails`:
- Call `update_loan_item_details_with_diff` instead of `update_loan_item_details`
- Same no-op guard

### `app/auth-mvp/heim/page.tsx`

Compute `detailLines` from `event.payload.changes` after building `label`. Pass as `detailLines` on `RecentEventDisplay`.

### `app/auth-mvp/heim/RecentSection.tsx`

Render `detailLines` below `drawerEvent.label` as small muted text rows with `break-words`.

### i18n keys

| Key | IS | EN |
|-----|----|----|
| `eventDetailDueDateRemoved` | `Gjalddagi fjarlægður: {date}` | `Due date removed: {date}` |
| `eventDetailDueDateChanged` | `Gjalddagi breytt: {oldDate} → {newDate}` | `Due date changed: {oldDate} → {newDate}` |
| `eventDetailDueDateAdded` | `Gjalddagi bætt við: {date}` | `Due date added: {date}` |
| `eventDetailItemNameChanged` | `Nafn breytt: {oldName} → {newName}` | `Name changed: {oldName} → {newName}` |
| `eventDetailLoanedAtChanged` | `Lánsdagur breytt` | `Loan date changed` |
| `eventDetailNoteAdded` | `Athugasemd bætt við` | `Note added` |
| `eventDetailNoteRemoved` | `Athugasemd fjarlægð` | `Note removed` |
| `eventDetailNoteChanged` | `Athugasemd breytt` | `Note changed` |

---

## What Codex should review

1. `sql/48_update_loan_with_diff.sql` — both RPCs, same safety posture
2. No-op event skip decision (Part 3)
3. Actor-only scope decision (Part 4)
4. App implementation plan above — confirm before Claude Code starts coding

Stebbi should apply SQL only after Codex approves the final migration file.
