# TODO #19 - Codex response to Nýlegt event-log design review

Reviewed:
`ai-handoff/2026-06-09-2200-todo-019-v007-codex-nylegt-event-log-design-review.md`

## Findings

### Medium - v007 assumes migration 45 is already in DB, but v006 says SQL was only written

`2026-06-09-2200...v007` says:

- lines 13-21: current implementation is after TODO #19
- line 118: `loan_recent_read_state` is "til staðar í DB"

But `2026-06-09-2145...v006` says:

- SQL was only written, not run.

Before Stebbi applies `sql/45_recent_read_state.sql`, decide whether to keep the
loan-specific read-state path or pivot to an event-feed foundation. Do not let
Claude Code or Codex treat migration 45 as production state unless Stebbi says it
has been applied.

### Medium - The product framing has changed enough that #19 should not grow further as loan-only state

If `Nýlegt` is meant to become a cross-Teskeiðar feed, then
`loan_recent_read_state` is a narrow tactical fix, not the durable architecture.
It can still be an acceptable transitional implementation, but it should not be
extended into separate per-domain read-state tables.

### Low - Event table proposal needs idempotency and ordering primitives

The v007 event-table sketch is directionally right, but it should explicitly
include:

- deterministic tie-break ordering;
- idempotency key to avoid duplicate events on retry;
- bounded payload schema;
- service-role-only access model;
- explicit decision that `Lesið` marks exactly visible event IDs, not "all before
  timestamp".

## Recommended Path

Codex recommends **Leið A-lite**:

Use a single user-scoped event table with per-event acknowledgement:

- one event row per receiving user;
- `ack_at` on the event row;
- service-role-only reads/writes;
- typed event fields plus small `payload jsonb`;
- start with loan events only, but design the table for future Teskeiðar.

This is closer to Leið A than C. Codex does **not** recommend timestamp-only
"last seen" state because it can accidentally mark newly-arrived events as read
if an event arrives during/just before the mark-read request.

## What Happens To `loan_recent_read_state`

Decision depends on whether migration 45 has been applied:

### If migration 45 has not been applied

Preferred:

- pause applying `sql/45_recent_read_state.sql`;
- ask Claude Code for a small revised plan that either:
  - replaces migration 45 with `recent_events`, or
  - explicitly keeps migration 45 as a temporary tactical #19 fix.

Codex leans toward replacing it now if Stebbi accepts a slightly bigger first
event-feed foundation.

### If migration 45 has already been applied

Do not drop it immediately.

- Keep it as harmless transitional state.
- Introduce `recent_events` in a later migration.
- Stop writing new feature logic around `loan_recent_read_state`.
- After event-feed is stable, add a cleanup migration or leave the old table
  dormant until there is a safe maintenance window.

## Suggested Table Shape

Prefer a deterministic numeric primary key for ordering:

```sql
CREATE TABLE public.recent_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid        NOT NULL,
  source       text        NOT NULL,
  event_type   text        NOT NULL,
  entity_type  text        NOT NULL,
  entity_id    uuid        NULL,
  event_key    text        NOT NULL,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  href         text        NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  ack_at       timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);

CREATE INDEX recent_events_unread_user_idx
  ON public.recent_events (user_id, occurred_at DESC, id DESC)
  WHERE ack_at IS NULL;

ALTER TABLE public.recent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_events TO service_role;
```

Names can change, but the semantics should stay:

- `id` gives stable tie-break ordering.
- `event_key` prevents duplicate events under retries.
- `payload` is bounded and typed by `event_type`, not arbitrary dumping ground.
- `href` lets `Nýlegt` click through without reverse-engineering destination.

## Payload Schema

Do not store secrets, emails, or broad raw records.

For first loan events, payload should be minimal snapshots, for example:

```json
{
  "item_name": "Borvél",
  "other_display_name": "Stefán",
  "role": "borrower",
  "due_at": "2026-06-09"
}
```

UI text should still come from `messages/is.json` and `messages/en.json`.
Payload provides variables, not full localized prose.

## Where Events Should Be Written

First phase: write events from server actions after successful mutations.

Avoid DB triggers for the first version:

- triggers do not know product-level visibility as clearly;
- per-user event targeting is easier in server code;
- messages/payload shape belongs closer to app logic;
- tests are simpler.

RPC-level writes can be considered later if duplicated action logic becomes a
real problem.

## Ordering

Order unread events by:

```sql
ORDER BY occurred_at DESC, id DESC
```

Use `id` as deterministic tie-breaker. Do not rely on UUID ordering.

## Limit

Keep the first UI limit at 3 unread events to preserve current home layout.

Add "Sjá allt" later only when there is a dedicated all-events view. Do not build
that in the first pass.

## Read/Ack Behavior

First pass:

- `Lesið` marks exactly the visible event IDs as read.
- No global timestamp ack.
- No per-Teskeið ack yet.
- No individual per-row dismiss unless Stebbi asks later.

This avoids race conditions where new unseen events accidentally become read.

## Minimal First Scope

First event-feed foundation should do only this:

1. Create `recent_events` table or revise migration 45 if not yet applied.
2. Add helper for inserting user-scoped loan events with idempotency.
3. Wire `Nýlegt` to unread `recent_events`.
4. Mark visible events read via server action.
5. Emit events for a very small loan event set:
   - loan created;
   - loan returned / return undone;
   - invitation received or accepted/declined only if it is already safe with
     current flows.
6. Keep existing `Lánað og skilað` behavior otherwise unchanged.

Do not try to implement all possible loan event types in one pass.

## What Not To Do In First Pass

- Do not implement all #27 soft acknowledgement.
- Do not build a full notification center.
- Do not add client-side global event state.
- Do not add grants to `anon` or `authenticated`.
- Do not store emails in event payload.
- Do not translate prose into payload.
- Do not make `Nýlegt` depend on reconstructing events from deleted rows.

## Top Three Risks

1. **Duplicate or missing events.**
   Retried server actions or partial failures can create duplicates unless every
   event has an idempotency key.

2. **Data leakage via payload.**
   A generic JSONB payload is tempting to overfill. Keep it whitelisted and
   event-type-specific.

3. **Scope creep into full #27.**
   Pending invitation visibility, `get_my_loans` UNION changes, and soft
   acknowledgement are separate production-sensitive changes. Event-feed
   foundation should support them, not silently implement them.

## Codex Recommendation To Stebbi

If `sql/45_recent_read_state.sql` has not been applied yet, pause before applying
it and ask Claude Code for a revised event-feed foundation plan.

If Stebbi wants the fastest safe path today, keep the already-written #19
loan-specific read-state as tactical, but treat it as temporary and do not build
future Teskeiðar on per-domain read-state tables.
