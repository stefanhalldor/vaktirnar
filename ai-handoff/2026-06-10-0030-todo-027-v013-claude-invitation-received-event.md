# TODO #27 - loan_invitation_received event — post-implementation handoff

## What was implemented

When user A sends an invitation to user B (via `performInvitationSend`), a
`loan_invitation_received` event is now recorded for user B's Nýlegt —
provided user B already has a Teskeid account.

## How it works

1. `performInvitationSend` calls `reserve_invitation_send` RPC
2. When `can_send: true` (new reservation), `lookupUserIdByEmail(admin, recipient_email)` is called
3. `lookupUserIdByEmail` uses `admin.auth.admin.getUserByEmail(email)` — service_role only
4. If the recipient has a Teskeid account, `recordRecentEvent` is called for their user_id
5. `eventKey: loans:invitation:${invitationId}:received` with `updateOnConflict: false` — idempotent
6. email is never logged

### Event details

| Field | Value |
|-------|-------|
| eventType | loan_invitation_received |
| entityType | invitation |
| entityId | invitationId |
| href | /auth-mvp/lanad-og-skilad |
| viewHref (drawer) | /auth-mvp/lanad-og-skilad/claim/{invitationId} |
| payload | { itemName: item_name_snapshot } |

### Drawer behavior

- Drawer "Skoða" button → `/auth-mvp/lanad-og-skilad/claim/{invitationId}`
- Works for pending invitations only — claim page handles already-claimed gracefully

## Files changed

- `lib/recent-events/types.ts` — add `loan_invitation_received` to `RecentEventType`
- `lib/loans/actions.ts` — add `lookupUserIdByEmail` helper; emit event in `performInvitationSend`
- `app/auth-mvp/heim/page.tsx` — add to `EVENT_TYPE_TO_KEY`; compute claim URL as `viewHref`
- `messages/is.json` + `messages/en.json` — `eventLoanInvitationReceived` key
- `lib/__tests__/actions.test.ts` — add `mockGetUserByEmail`, `mockRecordEvent` mocks; 5 new tests
- `lib/__tests__/home-page.test.tsx` — 2 new tests (label + claim URL in drawer)

## Commands run

```
npx vitest run
# 34 files, 979 tests (949 passed, 22 skipped, 8 todo), all passed
```

## Open design questions (for Stebbi + Codex)

### 1. Own actions appearing as unread

Currently ALL events (including own: create, update, return) appear in Nýlegt
as unread until "Lesið" is clicked. Stebbi observed this is debatable — if you
just performed the action yourself, it may make more sense to pre-mark it as
read (ack_at = now() at insertion time).

**Options:**
- A) Keep current behavior (all events unread by default, including own)
- B) Pre-ack own events at insertion time — requires `preAcked?: boolean` flag
  on `recordRecentEvent` that sets `ack_at: new Date().toISOString()` on insert
- C) Separate own-action events into a different feed (e.g., "Aðgerðir" vs "Tilkynningar")

**Recommendation:** Discuss before implementing. B is the least-invasive change.

### 2. Claim/decline events

When the recipient accepts or declines an invitation:
- Their `loan_invitation_received` event in Nýlegt is still unread (they just acted, but haven't "marked read")
- Could auto-ack the `loan_invitation_received` event on successful claim/decline
- Could emit `loan_invitation_accepted` / `loan_invitation_declined` as pre-acked events for the recipient
- Could emit counterpart events for the invitation CREATOR ("Anna samþykkti lánið") — full #27 scope

Currently: `claimInvitation` and `declineInvitation` in `actions.ts` have no event recording.

### 3. Recipient not yet registered

If recipient_email has no Teskeid account, the event is simply not recorded.
When they later create an account, they will NOT retroactively see the invitation
in Nýlegt (only pending_invitations badge appears via the existing RPC match).

Future option: a background job or on-signup hook that creates the event at
registration time for any pending invitations matching the new user's email.
