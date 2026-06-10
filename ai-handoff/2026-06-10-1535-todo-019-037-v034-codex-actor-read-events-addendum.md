# TODO #19 / #37 - Addendum: own changes must log as read events

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. This addendum follows `2026-06-10-1532-todo-019-037-v033-codex-phaseB-execution-handoff.md`.

Stebbi caught a missing acceptance requirement:

> Eigin breytingar eiga að loggast sem read event.

Codex agrees. v033 says actor/counterpart events are recorded, but does not clearly require actor events to be created as already read. That would make Stebbi unable to test the expected behavior cleanly.

## Decision

When a user changes a loan:

- The actor's own event should be recorded for history, but it should be already read.
- The counterpart event should be recorded as unread.
- No-op saves still record no event.

In practice:

- actor event: `ack_at` is set immediately
- counterpart event: `ack_at` is `NULL`

This means the actor's own change does not appear as unread in `Nýlegt`, while the counterpart sees an unread event.

## Implementation Requirement

Current `recordRecentEvent` always writes `ack_at: null`.

Claude Code should extend it with a small explicit option, for example:

```ts
export interface RecordEventArgs {
  // existing fields...
  initiallyRead?: boolean
}
```

Then inside `recordRecentEvent`:

```ts
const occurredAt = new Date().toISOString()

const row = {
  // existing fields...
  occurred_at: occurredAt,
  ack_at: args.initiallyRead ? occurredAt : null,
}
```

Use this option only when the event owner is the actor who just made the change:

```ts
await recordRecentEvent({
  userId: user.id,
  eventKey,
  payload,
  initiallyRead: true,
  // ...
})
```

For counterpart event:

```ts
await recordRecentEvent({
  userId: row.counterpart_user_id,
  eventKey,
  payload,
  // initiallyRead omitted/default false
})
```

The same one-eventKey-per-mutation rule still applies.

## Product Behavior

Actor own change:

- Stored in `recent_events`
- Has `ack_at` set
- Does not show in unread `Nýlegt`

Counterpart change:

- Stored in `recent_events`
- Has `ack_at = NULL`
- Shows in unread `Nýlegt`

Important limitation:

- If there is no UI for read event history yet, Stebbi may not be able to visually inspect the actor's already-read event in the product.
- The product-level localhost test is that the actor does not get a new unread `Nýlegt` item after their own edit.
- Automated tests should verify that the actor event is still recorded with `ack_at` set.

If Stebbi wants a visible "all event history including read events" view, that should be a separate follow-up, not silently added to Phase B.

## Required Automated Tests

Add tests that prove:

- Actor event calls `recordRecentEvent` with `initiallyRead: true`.
- Counterpart event calls `recordRecentEvent` without `initiallyRead: true`.
- `recordRecentEvent` writes `ack_at` when `initiallyRead` is true.
- `recordRecentEvent` writes `ack_at: null` by default.
- No-op save records no event at all.

For `updateLoanItemDetails`:

- actor row is already read
- counterpart row is unread
- actor and counterpart use the same `eventKey`

For `updateLoan`:

- actor event is already read if actor self-history is recorded
- no counterpart event is expected in pre-acceptance flow

## Localhost checks for Stebbi

These checks must be added to the Phase B localhost checklist before release.

### 1. Own edit does not create unread Nýlegt item

Setup:

- Use a test user.
- Open `/auth-mvp/heim` and clear current unread events with `Allt lesið`.
- Go to `Lánað og skilað`.

Action:

- Edit a loan field, for example item name, return date, loan date, or note.
- Return to `/auth-mvp/heim`.

Expected:

- The actor does not see a new unread `Nýlegt` item for their own change.
- This confirms the own event is not being treated as unread.

### 2. Counterpart still gets unread Nýlegt item

Setup:

- Use two test users or two browser profiles.
- User A and User B share an accepted loan.

Action:

- User A edits item name or note.
- User B opens `/auth-mvp/heim`.

Expected:

- User B sees an unread `Nýlegt` item.
- The drawer shows the correct before/after details.
- If User B marks it read, it disappears and does not come back after refresh.

### 3. No-op save

Action:

- Save a loan without changing anything.

Expected:

- No unread event appears for actor.
- No unread event appears for counterpart.

### 4. Optional technical confirmation

If Claude Code provides a safe local-only way to inspect test DB rows, Stebbi can confirm:

- actor event row has `ack_at` set
- counterpart event row has `ack_at = NULL`

Do not inspect production data casually. Do not use service-role keys in screenshots, chat, logs, or committed scripts.

## Update v033 Before Execution

Claude Code should treat this addendum as part of v033.

Required changes to v033 implementation scope:

- actor events are not merely "if self-history is implemented"
- actor self-history is required and must be initially read
- counterpart events are unread
- localhost checklist must include the actor-read behavior above

## Suggested Message For Claude Code

```text
Claude Code, Stebbi caught one missing Phase B requirement:

Own changes should log as read events.

Please treat this addendum as part of v033:
ai-handoff/2026-06-10-1535-todo-019-037-v034-codex-actor-read-events-addendum.md

Implementation expectation:
- actor/self event is recorded with `ack_at` already set
- counterpart event is recorded unread with `ack_at = NULL`
- no-op save records no event
- use one `eventKey` per mutation for actor + counterpart rows

Please add an explicit option to `recordRecentEvent`, for example `initiallyRead?: boolean`, and tests proving actor events are stored as read while counterpart events remain unread.

Also update the localhost checklist so Stebbi can test:
1. own edit does not create unread `Nýlegt`
2. counterpart still gets unread `Nýlegt`
3. no-op save creates no event
```
