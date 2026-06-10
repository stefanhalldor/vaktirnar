# TODO #19 / #27 - Nýlegt drawer + Codex findings — post-implementation handoff

## Based on

Codex review: `2026-06-09-2358-todo-019-027-v011-codex-nylegt-event-feed-post-review`

## Summary

All three Codex findings addressed. Nýlegt now has per-event drawers with "Skoða" and per-event "Lesið".

Migration 47 written (not yet run) — must be applied to production.

## Changes per finding

### Finding 1 — upsert error not checked (FIXED)

`lib/recent-events/helpers.server.ts`

Destructure `{ error }` from `admin.from(TABLE).upsert(...)` and log it:

```ts
const { error } = await admin.from(TABLE).upsert(...)
if (error) {
  console.error('[recent-events] recordRecentEvent failed')
}
```

### Finding 2 — state-upsert vs. true event log (RESOLVED as B)

Stebbi chose B: one row per event, with drawers showing the change.

State-change event keys now include an ISO timestamp:
- `loans:loan:{id}:updated:{timestamp}` (updateLoan, updateLoanItemDetails)
- `loans:loan:{id}:returned:{timestamp}` (markReturned)
- `loans:loan:{id}:return-undone:{timestamp}` (undoReturn)

`loan_created` and `loan_deleted` keep static keys (first-write-wins unchanged).

### Finding 3 — protocol-relative href (PARTIALLY FIXED)

Code-level: `recordRecentEvent` rejects hrefs starting with `//` before upserting.

DB-level: `sql/47_fix_href_constraint.sql` — **written, not run**. Stebbi must apply.

```sql
ALTER TABLE public.recent_events
  DROP CONSTRAINT IF EXISTS recent_events_href_local,
  ADD CONSTRAINT recent_events_href_local CHECK (
    href LIKE '/%' AND href NOT LIKE '//%'
  );
```

## New product feature: per-event drawer

Each row in Nýlegt is now a button that opens a bottom drawer. The drawer shows:
- Event label (e.g., "Breytt: Borvél")
- "Skoða" link — navigates to `/auth-mvp/lanad-og-skilad/breyta/{entity_id}` (non-deleted events only)
- "Lesið" button — acks that single event, closes drawer, removes from list optimistically

The header "Allt lesið" button still acks all visible events at once.

`RecentEventDisplay` now carries `viewHref: string | null` and `isDeleted: boolean`.
`viewHref` is null for `loan_deleted` events (no edit page for deleted items).

## New i18n keys

| Key | IS | EN |
|-----|----|----|
| `recentMarkAllRead` | Allt lesið | Mark all done |
| `recentView` | Skoða | View |
| `recentClose` | Loka | Close |

## Files changed

### New files
- `sql/47_fix_href_constraint.sql` — must be applied

### Modified files
- `lib/recent-events/helpers.server.ts` — finding 1 + 3 (code-level href guard)
- `lib/recent-events/types.ts` — `viewHref`, `isDeleted` on `RecentEventDisplay`
- `lib/loans/actions.ts` — timestamp-based keys for updateLoan, markReturned, undoReturn, updateLoanItemDetails
- `app/auth-mvp/heim/page.tsx` — compute `viewHref`/`isDeleted`; new label keys
- `app/auth-mvp/heim/RecentSection.tsx` — drawer UI; per-event ack; "Allt lesið" header
- `messages/is.json` + `messages/en.json` — 3 new keys each
- `lib/__tests__/sql-migration.test.ts` — migration 47 describe block; updated finding 3 label
- `lib/__tests__/home-page.test.tsx` — new i18n keys in mock; drawer tests; "Allt lesið" assertion

## Commands run

```
npx vitest run
# 34 files, 972 tests (942 passed, 22 skipped, 8 todo), all passed
```

## Rollout

1. Stebbi applies `sql/47_fix_href_constraint.sql`
2. Deploy

## Pending (#27)

- `loan_invitation_received` event for invitation recipient
- `loan_invitation_acknowledged` / `loan_invitation_declined` events
