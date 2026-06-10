# TODO #19 / #27 - Nýlegt event-feed final plan

## Relevant TODO items

- TODO #19: Lesnir hlutir birtist ekki aftur sem `Nýlegt`
- TODO #27: Mýkra lánaboðsflæði

## Why this handoff exists

Stebbi clarified on 2026-06-09 that Codex and Claude Code should think this
through fully and avoid temporary fixes. Therefore Codex recommends stopping
the narrow `loan_recent_read_state` direction as the future foundation.

`Nýlegt` should become a small, reliable, server-side event feed for all
Teskeiðar, starting with `Lánað og skilað`.

This handoff supersedes:

- `2026-06-09-2122-todo-019-027-v005-codex-recent-read-state-foundation-plan.md`
- `2026-06-09-2200-todo-019-v007-codex-nylegt-event-log-design-review.md`
- `2026-06-09-2327-todo-019-v008-codex-nylegt-event-log-design-response.md`
- Any plan to deploy `sql/45_recent_read_state.sql` as-is, unless Stebbi has
  already applied it and Claude Code is explicitly writing a follow-up recovery
  migration.

## Critical instruction before implementation

Claude Code should not ask Stebbi to run `sql/45_recent_read_state.sql` as-is.

If migration 45 has not been applied to Supabase, Claude Code should replace
the unrun migration direction with a `recent_events` foundation. Prefer either:

- rename/rework the unrun migration into `sql/45_recent_events.sql`, or
- replace the contents of `sql/45_recent_read_state.sql` before it is run.

Claude Code must state clearly in the post-implementation handoff which path
was used.

If migration 45 has already been applied to Supabase, Claude Code must not drop
or rename the table ad hoc. In that case:

- keep production data safe,
- create a new numbered migration, likely `sql/46_recent_events.sql`,
- leave `loan_recent_read_state` unused or plan a later cleanup migration after
  Stebbi confirms,
- document the production state clearly.

## Product decision

`Nýlegt` is not a loan-specific read-state widget. It is a user-scoped event
feed.

The first implementation can be small, but the data model should be durable:

- one row per event per target user,
- unread/read is stored per event,
- event rows can represent future Teskeiðar without schema redesign,
- app code decides what events to write,
- client never receives emails, secrets, or raw internal authorization details.

## Recommended database model

Use a service-role-only table similar to this shape:

```sql
CREATE TABLE IF NOT EXISTS public.recent_events (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid        NOT NULL,
  source      text        NOT NULL,
  event_type  text        NOT NULL,
  entity_type text        NOT NULL,
  entity_id   uuid        NULL,
  event_key   text        NOT NULL,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  href        text        NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ack_at      timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT recent_events_event_key_length CHECK (char_length(event_key) <= 200),
  CONSTRAINT recent_events_source_length CHECK (char_length(source) BETWEEN 1 AND 60),
  CONSTRAINT recent_events_event_type_length CHECK (char_length(event_type) BETWEEN 1 AND 80),
  CONSTRAINT recent_events_entity_type_length CHECK (char_length(entity_type) BETWEEN 1 AND 60),
  CONSTRAINT recent_events_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT recent_events_href_local CHECK (href LIKE '/%'),
  CONSTRAINT recent_events_user_event_key_unique UNIQUE (user_id, event_key)
);

CREATE INDEX IF NOT EXISTS recent_events_unread_user_idx
  ON public.recent_events (user_id, occurred_at DESC, id DESC)
  WHERE ack_at IS NULL;

CREATE INDEX IF NOT EXISTS recent_events_user_occurred_idx
  ON public.recent_events (user_id, occurred_at DESC, id DESC);

ALTER TABLE public.recent_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.recent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_events TO service_role;
```

Codex does not require a foreign key to `auth.users` unless the existing
project pattern supports it. Avoid cross-schema FK churn if it adds migration
risk without real product value.

Use `BEGIN; ... COMMIT;` for the final migration unless Claude Code has a
specific reason not to.

## Access and RLS rules

- No direct `anon` or `authenticated` grants.
- RLS enabled.
- No public policies.
- Only service-role server code reads and writes events.
- Every server action must verify the current actor server-side before reading,
  inserting, or acknowledging events.
- Client-sent event IDs are never trusted without checking `user_id = actor.id`.

## Event payload rules

Payload is not a place for user-facing prose. It should contain small,
whitelisted variables only, for example:

```json
{
  "itemName": "Borvél",
  "counterpartyName": "Stebbi"
}
```

Do not store in payload:

- recipient email,
- auth identifiers other than entity IDs already safe for server-side use,
- secrets,
- raw RPC responses,
- private notes not intended for the target user,
- long rendered strings that belong in `messages/is.json` and `messages/en.json`.

User-facing text should be rendered from `event_type` plus payload variables.

## First implementation scope

Keep the first implementation intentionally small but architecturally final.

Claude Code should implement:

1. A `recent_events` migration as the foundation.
2. A small typed helper module, for example `lib/recent-events/*`, with:
   - event type definitions,
   - safe payload construction,
   - `recordRecentEvent(...)`,
   - `getUnreadRecentEventsForUser(...)`,
   - `ackRecentEventsForUser(...)`.
3. `/auth-mvp/heim` should render unread events from `recent_events`, not from
   a loan-specific read-state table.
4. The `Lesið` action should mark exactly the currently visible event IDs as
   read after verifying ownership.
5. `Nýlegt` rows should be clickable through their server-generated `href`.
6. The first event source should be `loans`.
7. The first target UI can still show only the latest 3 unread events.

Do not implement full #27 in this phase.

## Loan events for phase 1

The exact event set should be conservative. The goal is reliable foundation,
not a notification center.

Recommended phase 1 events:

- `loan_created`: actor creates a loan item.
- `loan_updated`: actor changes item name, note, dates, or other visible
  details.
- `loan_returned`: actor marks an item returned.
- `loan_return_undone`: actor reopens a returned item.
- `loan_deleted`: actor deletes/removes an item, if that action exists.

For each event:

- write only after the underlying loan action succeeds,
- target only users who are allowed to see the event,
- start with the actor if counterpart targeting is not already safe and simple,
- add counterpart targeting only when the server code can prove the counterpart
  user ID and visibility without leaking emails or pending invitation data.

For deletes, capture the display snapshot before deletion, then write the event
after the delete succeeds using only safe snapshot fields.

For #27 later, pending invitation-derived rows can write events to the recipient
only after the server can safely match the authenticated user's normalized email
to the invitation without exposing that email to the client.

## Event key strategy

`event_key` must prevent duplicate rows on retry while still allowing later
events on the same entity.

Recommended examples:

- `loans:loan:{loan_id}:created`
- `loans:loan:{loan_id}:updated:{updated_at_iso_or_epoch_ms}`
- `loans:loan:{loan_id}:returned:{returned_at_iso_or_epoch_ms}`
- `loans:loan:{loan_id}:return-undone:{updated_at_iso_or_epoch_ms}`
- `loans:loan:{loan_id}:deleted`

If a mutation does not expose the timestamp needed for a deterministic key,
Claude Code should fetch the visible row after the successful mutation and use
its authoritative `updated_at` or `returned_at`. Avoid random keys for normal
mutations because retries can create duplicates.

## Rendering and UX

On `/auth-mvp/heim`, `Nýlegt` should:

- render events newest first using `occurred_at DESC, id DESC`,
- show no more than 3 unread events initially,
- use event-specific text from translations,
- link to the relevant app surface via `href`,
- keep the UI quiet and compact,
- avoid horizontal overflow on mobile,
- leave future #27 room for links that can highlight or scroll to a loan card.

For loan events, a safe first `href` is likely:

- `/auth-mvp/lanad-og-skilad`

If Claude Code already has a stable detail/highlight URL, it may use that, but
it should not create a large routing project inside this phase.

## Interaction with #27

This phase should prepare #27 without implementing it.

The future #27 flow can then add events such as:

- `loan_invitation_received`
- `loan_invitation_acknowledged`
- `loan_invitation_declined`

Those should use the same `recent_events` table and the same read/ack flow.

Do not mark invitations as accepted at creation time. Do not set
`loan_items.lender_user_id` or `loan_items.borrower_user_id` for the recipient
until the recipient chooses `Þekki málið`.

## Migration and production safety

Before asking Stebbi to run SQL, Claude Code must state:

- exact migration filename,
- whether it creates a table, indexes, grants, or policies,
- whether it modifies existing rows,
- whether it affects auth, RLS, policies, functions, or production data,
- rollback plan,
- whether an older migration 45 was already applied.

Expected safety profile for the preferred path:

- creates a new service-role-only table,
- enables RLS,
- grants only service_role,
- no existing rows modified,
- no existing RLS weakened,
- rollback is dropping the new table if no production dependency exists.

## Tests Claude Code should add or update

At minimum:

- SQL migration static test:
  - table exists,
  - RLS enabled,
  - anon/authenticated revoked,
  - service_role granted,
  - payload is JSON object,
  - unread index exists,
  - no `loan_recent_read_state` dependency remains if migration 45 was reworked.
- Event helper tests:
  - deterministic event keys,
  - duplicate event upsert/ignore behavior,
  - payload sanitization,
  - no email leakage.
- Home page tests:
  - unread events render,
  - read events do not render,
  - events are ordered by `occurred_at DESC, id DESC`,
  - max 3 events shown,
  - empty state works.
- Action tests:
  - `Lesið` only acknowledges actor-owned events,
  - foreign event IDs are ignored or rejected safely,
  - unauthenticated actor cannot acknowledge events.
- Regression:
  - marking one visible event read and creating another event does not make the
    old event reappear.

Run the focused tests and then the broader test suite if feasible.

## Stop conditions

Claude Code should stop and return to Stebbi/Codex before implementation if:

- migration 45 has already been applied and there is uncertainty about cleanup,
- implementing counterpart events requires broad changes to invitation privacy,
- the event feed requires direct client access to `recent_events`,
- any part of the plan would weaken RLS, grants, auth, or service-role bounds.

## Required post-implementation handoff

After implementation, Claude Code should create a new handoff file for Codex,
for example:

`2026-06-09-HHMM-todo-019-027-v010-claude-nylegt-event-feed-post-implementation.md`

It must include:

1. Whether `sql/45_recent_read_state.sql` was replaced, renamed, left in place,
   or already applied.
2. Exact migration filename and whether SQL was run.
3. Files changed.
4. Commands run and exit codes.
5. How RLS/grants/auth were preserved.
6. How event payloads avoid leaking emails or secrets.
7. Which events are emitted in phase 1.
8. What remains for #27.
9. Any risk Claude Code wants Codex to review.
