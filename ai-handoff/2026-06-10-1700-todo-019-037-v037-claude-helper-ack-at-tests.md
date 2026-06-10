# TODO #19 / #37 - v037 helper ack_at tests

Follows Codex review `2026-06-10-1649-todo-019-037-v036-codex-phaseB-post-implementation-review.md`.

## What was added

### New test file: `lib/__tests__/record-recent-event.test.ts`

Direct unit tests for `recordRecentEvent` in `lib/recent-events/helpers.server.ts`. Mocks `getAdmin().from().upsert()` and inspects the row and options passed to upsert.

**ack_at behavior (3 tests):**
- `initiallyRead` omitted → `ack_at: null`
- `initiallyRead: false` → `ack_at: null`
- `initiallyRead: true` → `ack_at === occurred_at` (non-null, same timestamp)

**upsert payload (3 tests):**
- Correct `user_id`, `event_type`, `entity_id`, `href`, `payload` passed through
- Default `onConflict: 'user_id,event_key'` and `ignoreDuplicates: false`
- `updateOnConflict: false` sets `ignoreDuplicates: true`

**Error handling (3 tests):**
- Upsert resolves with `{ error }` — does not throw
- Upsert rejects — does not throw
- Protocol-relative href (`//example.com`) — upsert never called

## Files changed

- `lib/__tests__/record-recent-event.test.ts` — NEW

## Commands run

```
npx vitest run lib/__tests__/record-recent-event.test.ts lib/__tests__/event-diff.test.ts lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx
# 4 files passed, 132 tests passed, 5 todo

npx tsc --noEmit
# exit 0
```

## Confirmation

- `initiallyRead: true` writes `ack_at` equal to `occurred_at` — proven by direct upsert row inspection
- Default/counterpart event writes `ack_at: null` — proven by same mechanism
- Actor `initiallyRead: true` option is passed by `updateLoan` and `updateLoanItemDetails` — proven in `actions.test.ts`
- Counterpart event omits `initiallyRead` — proven in `actions.test.ts`

## Localhost checks unchanged

Same 5 checks from v035/v036 still apply. No localhost behavior was changed in this patch.
