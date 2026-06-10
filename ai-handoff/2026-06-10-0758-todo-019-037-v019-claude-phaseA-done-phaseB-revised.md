# TODO #19 / #37 - Phase A done + revised Phase B plan

## Based on

Codex review: `2026-06-10-0752-todo-019-027-037-v018-codex-phase1-revised-plan-review.md`

---

## Part 1 — Phase A: DONE

### What was implemented

**`lib/recent-events/helpers.server.ts`**

`getUnreadRecentEventsForUser` now takes `limit?: number`. When no limit is given, `.limit()` is not called — all unread rows are fetched. When a limit is passed explicitly, `.limit(n)` is applied. Old callers that passed `3` explicitly still work.

**`app/auth-mvp/heim/page.tsx`**

Changed `getUnreadRecentEventsForUser(user.id, 3)` → `getUnreadRecentEventsForUser(user.id)`. No limit.

**`app/auth-mvp/heim/RecentSection.tsx`**

Split the single `overflow-hidden` container into outer + inner:
- Outer div: `bg-card border border-border rounded-xl overflow-hidden` (border-radius clip)
- Inner div: `flex flex-col divide-y divide-border` + conditional `max-h-72 overflow-y-auto` when `displayedRows.length > 5`

No conflicting overflow classes. `data-testid="recent-list"` added to inner div for test targeting.

**`lib/__tests__/home-page.test.tsx`**

Mock chain updated: `mockAdminOrder2` now returns a thenable node that also has `.limit()`. Both paths delegate to `mockAdminLimit` so `setupRecentEvents` is unchanged.

Three new tests added:
- All 4 rows rendered when > 3 exist
- Scroll container classes present when 6 rows
- No scroll container when 5 rows

### Test results

```
npx vitest run
960 passed | 22 skipped | 8 todo
npx tsc --noEmit
(no errors)
```

### `Allt lesið` behavior with all rows fetched

`RecentSection.handleMarkAll` sends `rows.map(r => r.id)`. Since all unread rows are now fetched, this correctly acks every unread event. No new `ackAll` server action needed.

---

## Part 2 — Revised Phase B plan

Addresses Codex findings 1 and 2 from v018:
- Do not modify `update_loan` — add a new `update_loan_with_diff` RPC
- Write exact SQL before implementation

### New RPC: `update_loan_with_diff`

Leave `update_loan` completely unchanged. Add a new function `update_loan_with_diff` with the same authorization logic but returning before/after values on success.

**Function signature:**

```sql
CREATE OR REPLACE FUNCTION public.update_loan_with_diff(
  p_actor_id   uuid,
  p_loan_id    uuid,
  p_item_name  text,
  p_note       text,
  p_loaned_at  date,
  p_due_at     date
)
RETURNS TABLE (
  status          text,
  before_item_name text,
  before_note      text,
  before_loaned_at date,
  before_due_at    date
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  IF v_loan.created_by IS DISTINCT FROM p_actor_id THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.loan_invitations
    WHERE loan_id = p_loan_id AND status = 'accepted'
  ) THEN
    RETURN QUERY SELECT 'not_editable'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  IF char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200 THEN
    RETURN QUERY SELECT 'invalid_item_name'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  IF p_due_at IS NOT NULL AND p_due_at < p_loaned_at THEN
    RETURN QUERY SELECT 'invalid_due_date'::text, NULL::text, NULL::text, NULL::date, NULL::date;
    RETURN;
  END IF;

  -- Authorization confirmed. Capture before values from v_loan (already locked).
  UPDATE public.loan_items
  SET item_name  = p_item_name,
      note       = p_note,
      loaned_at  = p_loaned_at,
      due_at     = p_due_at,
      updated_at = now()
  WHERE id = p_loan_id;

  RETURN QUERY SELECT
    'ok'::text,
    v_loan.item_name,
    v_loan.note,
    v_loan.loaned_at,
    v_loan.due_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_loan_with_diff(uuid,uuid,text,text,date,date)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_loan_with_diff(uuid,uuid,text,text,date,date)
  FROM PUBLIC, anon, authenticated;
```

**Migration file:** `sql/48_update_loan_with_diff.sql`

Wrapped in `BEGIN; ... COMMIT;`. Idempotent: `CREATE OR REPLACE FUNCTION`. No `DROP` needed. The new function is a separate name — `update_loan` is untouched.

**Rollback:** `DROP FUNCTION IF EXISTS public.update_loan_with_diff(uuid,uuid,text,text,date,date);`

No data affected. No existing grants changed. No PostgREST schema cache flush required for the old function (it is unchanged). New function appears in schema cache after deploy.

**Deploy ordering:**
1. Apply `sql/48` on Supabase (new function added, old function unchanged).
2. Deploy app code that calls `update_loan_with_diff` for diff events.
3. Old app still works — it calls `update_loan`, which is unaffected.
4. If rollback needed: drop new function, redeploy old app (which never calls new function).

### `updateLoan` change in app code

`lib/loans/actions.ts`: Call `update_loan_with_diff` instead of `update_loan`. Parse the returned row array (first row). Status handling is identical. Additionally, read before values and compute `changes` array for `recordRecentEvent`.

```ts
const { data, error } = await admin.rpc('update_loan_with_diff', { ... })
// data is Array<{ status, before_item_name, before_note, before_loaned_at, before_due_at }>
const row = (data as Array<{
  status: string
  before_item_name: string | null
  before_note: string | null
  before_loaned_at: string | null
  before_due_at: string | null
}>)[0]

const status = row?.status ?? 'save_failed'
// ... same status checks as before ...

// On ok: compute diff
const changes = computeLoanChanges(
  { item_name: row.before_item_name, note: row.before_note, loaned_at: row.before_loaned_at, due_at: row.before_due_at },
  { item_name: p_item_name, note: p_note, loaned_at: p_loaned_at, due_at: p_due_at },
)
```

`computeLoanChanges` is a pure helper function in `lib/loans/actions.ts`, not exported. It compares before/after and returns `LoanFieldChange[]`.

### Payload types (revised per finding 4)

In `lib/recent-events/types.ts`:

```ts
export type LoanFieldChangeType = 'changed' | 'added' | 'removed'

export interface LoanFieldChange {
  field: 'item_name' | 'loaned_at' | 'due_at' | 'note'
  changeType: LoanFieldChangeType
  oldValue?: string | null   // item_name, loaned_at, due_at only — not note
  newValue?: string | null   // item_name, loaned_at, due_at only — not note
}

export interface RecentEventPayload {
  itemName?: string
  changes?: LoanFieldChange[]
}
```

Note field: only `{ field: 'note', changeType: 'added' | 'removed' | 'changed' }`. No content.

### Display contract (finding 5)

In `lib/recent-events/types.ts`:

```ts
export interface RecentEventDisplay {
  id: number
  label: string
  href: string
  viewHref: string | null
  isDeleted: boolean
  detailLines?: string[]   // localized, server-computed in heim/page.tsx
}
```

`heim/page.tsx` computes `detailLines` from payload. Example i18n keys:

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

Drawer renders `detailLines` as small muted text rows below `drawerEvent.label`.

### `updateLoanItemDetails` scope (finding 2)

Phase B covers only `updateLoan` (creator pre-acceptance edits). `updateLoanItemDetails` (post-acceptance narrow edits for lender/creator) is deferred to Phase B2.

This means: if the most common edit flow for accepted loans is via `updateLoanItemDetails`, users won't see diff in Nýlegt for those edits until Phase B2. Stebbi should confirm if this is acceptable or if B2 should be included in the same migration.

### Tests Phase B

- `computeLoanChanges` unit tests: due_at removed, due_at changed, item_name changed, note changed without content, no changes when all fields same
- `updateLoan` action test: mock `update_loan_with_diff` RPC, confirm `recordRecentEvent` receives correct `changes`
- `heim/page.tsx` test: `detailLines` present for `loan_updated` event with diff payload
- No email, no note content, no foreign data in any payload or rendered output
- Unauthorized loanId: `not_found` from RPC, no before/after values in event

---

## What needs Stebbi/Codex approval before Phase B

1. SQL `sql/48_update_loan_with_diff.sql` — exact SQL above, Stebbi applies to Supabase
2. Scope decision: include `updateLoanItemDetails` in same phase or defer to B2
3. i18n keys list above — confirm labels are acceptable
