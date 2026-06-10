# TODO #19 / #27 / #37 - Nýlegt all unread events and event detail plan

## Relevant TODO items

- TODO #19: Lesnir hlutir birtist ekki aftur sem `Nýlegt`
- TODO #27: Mýkra lánaboðsflæði
- TODO #37: `Nýlegt` sýni öll ólesin events og breytingasamhengi

## Trigger

Stebbi asked on 2026-06-10 whether `Nýlegt` currently shows only three items and
said the desired behavior is:

- `Nýlegt` should show all events the user has not read yet, not only three.
- When an event represents a change, the user should be able to see the actual
  change, for example that a due date was removed and what the previous due date
  was.
- This should be recorded in TODO and used as continuation context for #27.

## Current assessment

`2026-06-10-0030-todo-027-v013-claude-invitation-received-event.md` is useful
foundation for #27, but it only covers the `loan_invitation_received` event path
for `Nýlegt`. It is not the full #27 implementation.

The likely current limit is in the home page fetch path:

- `app/auth-mvp/heim/page.tsx` calls `getUnreadRecentEventsForUser(user.id, 3)`.
- `lib/recent-events/helpers.server.ts` also has a default limit of `3`.

Claude Code should verify this before changing behavior.

## Product decision now captured

`Nýlegt` should be treated as an unread inbox, not merely a three-item preview.

That means:

- all unread events must be visible or reachable from `Nýlegt`;
- hiding older unread events behind an implicit hard limit is not acceptable;
- if a technical cap is needed for safety, the UI must clearly expose the
  remaining unread count and let the user open the rest;
- pending invitation events from #27 must not be lost because they are older
  than the top three unread rows.

## Important design constraint: event detail must be captured at write time

For change events, do not rely on reconstructing the old value later from the
current database row. The old value may already be gone.

The event payload should include a safe, typed summary of what changed, for
example:

```ts
{
  itemName: "Borrvél",
  changes: [
    {
      field: "due_at",
      oldValue: "2026-06-20",
      newValue: null,
      changeType: "removed"
    }
  ]
}
```

This shape is illustrative, not final. Claude Code should propose the actual
typed payload contract before implementation.

## Production risks Codex wants reviewed first

### 1. Authorization and old-value reads

To show old/new diffs, the system needs the old loan values before mutation.
The safest approach is likely to have the SQL/RPC perform the authorized row
lock, mutation, and return a safe before/after summary to the server action.

Avoid a casual service-role pre-read in app code unless Claude Code proves it is
still authorization-safe, race-safe, and does not leak fields on failed writes.

### 2. Payload privacy

Event payloads are client-visible to the event owner. Do not store or return
unnecessary private data.

Especially:

- never include recipient email in `recent_events.payload`;
- do not log recipient email;
- do not include another user's private profile data beyond display text already
  allowed elsewhere;
- keep note payloads conservative if notes may contain sensitive free text.

### 3. Many unread events

Showing all unread events can be heavy if a user accumulates many rows.

Claude Code should propose a mobile-first UI rule:

- render all if the expected count is small;
- or use an explicit "show all unread" drawer/list with count;
- if a backend cap is retained, it must be explicit and not silently hide unread
  events.

### 4. #27 pending invitation state

For #27, pending invitations need two surfaces to line up:

- pending invitation-derived row in the normal loan list;
- unread `loan_invitation_received` event in `Nýlegt`.

When the recipient chooses `Þekki málið` or `Kannast ekki við þetta`, the related
unread event should be acked or otherwise stop showing as actionable unread.

## Recommended next step

Do not jump straight into a large implementation.

Claude Code should first create a short Phase 1 technical plan for Codex review
covering:

1. Where the current three-item limit is applied.
2. Proposed `Nýlegt` UI behavior for all unread events on mobile.
3. Exact `recent_events.payload` contract for loan diffs.
4. Which loan mutations will emit diff events in the first pass:
   - item name changed,
   - note changed,
   - loaned date changed,
   - due date changed/removed/added,
   - returned/return undone,
   - invitation received/accepted/declined.
5. Whether SQL/RPC changes are needed to return authorized before/after values.
6. Migration plan if `recent_events` constraints or payload assumptions change.
7. How this feeds into #27 pending invitation rows in the normal loan list.
8. Tests and manual checks.

## Suggested implementation sequence after review

### Phase A - Make all unread events visible

- Remove or replace the silent `3` limit.
- Keep query scoped by `user_id` and `ack_at IS NULL`.
- Preserve newest-first ordering.
- Add tests with more than three unread rows.
- Confirm `Lesið` only acks rows owned by the current user.

### Phase B - Add safe event detail payloads

- Define typed payloads in `lib/recent-events/types.ts`.
- Emit before/after summaries for a narrow set of loan updates first.
- Prefer RPC-returned before/after data for correctness under concurrency.
- Add translation keys in `messages/is.json` and `messages/en.json`.
- Add tests for due date removed, due date changed, and no sensitive data in
  payload.

### Phase C - Tie into #27

- Make pending invitation-derived rows appear in the normal loan list.
- Use `claim_loan_invitation` as the authoritative transition for `Þekki málið`.
- Use `decline_invitation` as the authoritative transition for `Kannast ekki við
  þetta`.
- Ack or resolve the `loan_invitation_received` event after claim/decline.
- Avoid duplicate pending-invitation UI surfaces.

## SQL and production notes

- SQL has not been run by Codex.
- `sql/46_recent_events.sql` and `sql/47_fix_href_constraint.sql` are central to
  this foundation; Claude Code should explicitly state whether they are only
  written or have been applied before any rollout decision.
- Do not weaken RLS, grants, service-role boundaries, auth checks, or invitation
  ownership checks.
- Any migration should be idempotent where practical and include a recovery
  plan.

## Minimum test expectations

- More than three unread events are visible or explicitly reachable.
- Marking one/all read only affects the current user's events.
- Due date removed event shows previous due date and new empty state.
- Due date changed event shows old and new dates.
- Pending invitation event opens the correct pending invitation context.
- Claim/decline removes or resolves the related unread invitation event.
- No recipient email appears in client payload, logs, or rendered UI.
- Mobile 360-460 px has no overlap, horizontal overflow, or unusable long list.
