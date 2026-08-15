# SQL130 — customizable booking workflows

SQL130 is one additive, transactional and forward-only migration. It gives
every booking service its own default five-state published workflow, pins every
booking request to an immutable published version/state, adds provider-owned
draft/save/publish/transition operations, and turns cancellation into a typed
global terminal action.

No SQL in this package was run while it was authored. Static/application
verification is not DB-backed verification.

## Exact manual order

1. Confirm the intended local Supabase project and database. Do not infer it
   from a previously open SQL Editor tab.
2. Run `preflight.sql` exactly as-is. It is read-only and returns one row.
3. Stop unless `prerequisites_ok=true`, both SQL129 flags are true, every
   collision array is empty, and all four scope/cancellation error counts are
   zero. Preserve the complete row, including service/request/event/message
   counts.
4. Only after separate explicit approval, run
   `sql/130_booking_custom_workflows.sql` exactly once. Do not rerun after an
   ambiguous client/network error; first inspect transaction state read-only.
5. Run `postflight.sql` exactly as-is. It is read-only and returns one row.
6. Stop unless `postconditions_ok=true`, every granular `*_ok` flag is true,
   every error count is zero, and service/request/event/message counts exactly
   match the preserved preflight row.
7. Preserve both complete result rows for review before starting localhost
   testing. The required order is therefore: **preflight → SQL130 migration →
   postflight → localhost**.

The migration guard deliberately fails closed if SQL125/126/129 has drifted,
or any existing booking has null, missing or cross-scoped live service data.
It never guesses a provider/workflow and never leaves a request unpinned.

## Security and data effects

- Five new private tables are owned by `postgres`, have RLS and FORCE RLS,
  have no policies, and grant no table/column access to `PUBLIC`, `anon`,
  `authenticated` or `service_role`.
- New and replaced functions are `SECURITY DEFINER`, fixed to empty
  `search_path`, and owned by `postgres`. Only the exact app-facing RPCs are
  executable by `service_role`; internal graph/provisioning/projection helpers
  are not. Browser roles receive no function execution.
- The old five-argument cancel RPC and old six-argument provider-list RPC lose
  API execution so they cannot bypass typed reason/filter contracts.
- SQL129's wrapper/base signatures, owner, `SECURITY DEFINER`, empty search
  path and service-role-only ACL are checked before and after SQL130 and are
  not replaced.
- Existing service, request, message and event row counts are preserved.
  Existing cancelled bookings/events receive only the migration-only
  `legacy_unspecified` reason. No auth user, contact value or message body is
  rewritten.
- Published versions, workflow event identity and mutation receipts are
  immutable. Existing requests remain pinned when later versions publish.

## Recovery and retention

An error before `COMMIT` rolls back the entire migration. Preserve the exact
error and rerun only the read-only preflight; never try to finish individual
statements manually.

After `COMMIT`, recovery is forward-only. Do not drop workflow tables, delete
versions/states/transitions/events, rewrite pinned requests, clear typed
cancellation reasons, or re-grant an old bypass RPC. Disable the app-side
workflow rollout, run `recovery.sql` read-only, preserve its count/catalog
inventory, then author a separately reviewed next-numbered corrective
migration.

## Localhost checks for Stebbi

Run these only after the three SQL steps above are green on the intended local
database and matching app code is present. Use disposable test accounts and no
real customer contact data.

1. Open `/auth-mvp/bokanir` as a confirmed space owner with `bokanir` access.
   Confirm every service shows the five-state default and system labels switch
   correctly between Icelandic and English.
2. Create a booking as guest and as a signed-in contact owner. Confirm each
   starts at the published initial state; customer detail shows only the safe
   customer label/attention and never provider labels, graph IDs, logical keys
   or allowed targets.
3. As provider, move a booking through allowed edges, including backtracking.
   Confirm revision-conflict refresh is visible, exact retry does not duplicate
   an event, disallowed/cross-version target fails, and confirmed has no normal
   outgoing action while chat remains open.
4. Cancel from confirmed and from an earlier state. Provider must choose one of
   the three typed reasons. Guest/customer owner is forced to “customer
   cancelled”; an ordinary added member cannot cancel. Confirm cancellation is
   terminal, closes chat, has `attention=none`, and disappears from active
   state/attention facets.
5. Open the workflow editor on mobile width. Rename a default state (which
   becomes custom text for both audiences), add/reorder/delete an eligible
   state, edit edges/attention, save a draft and publish. Confirm no horizontal
   overflow, keyboard/focus jump, hidden actions or silent navigation wait.
6. Create a new booking after publish and confirm it uses the new version.
   Confirm older bookings retain their previous labels/edges/version and remain
   usable. A second service must retain an independent workflow.
7. Retry save/publish/transition/cancel with the same idempotency key and exact
   payload; expect the same bounded acknowledgement. Reuse the key with a
   changed graph, target or reason; expect conflict and no duplicate mutation.

Do not casually test auth-user deletion, provider/space deletion, production
data, RLS/grant changes or manual row edits. Those affect authorization and
retained user history and require separate explicit approval plus reviewed
fixtures.
