# SQL148 — Event person-source authority

SQL148 adds two Event-only, browse-only RPCs for the future canonical people
picker. It does not enable the picker UI yet and does not use the Expense
entitlement. The directory is paged to 50 Events and each roster is loaded
separately with at most 50 people.

The package creates no tables, updates no data, changes no RLS policy and
alters no SQL132–147 function. Both new functions are `STABLE`,
`SECURITY DEFINER`, empty-search-path functions owned by `postgres`, executable
only by `service_role`.

## Manual operator order for Stebbi

Do not run this package until the Phase 2 completion handoff has been reviewed.

1. Run `preflight.sql`. Every boolean and `prerequisites_ok` must be `true`.
2. Run `sql/148_event_person_source_authority.sql` once.
3. Run `postflight.sql`. Every boolean and `postconditions_ok` must be `true`.
4. Send both result rows to Codex before any Phase 3 UI work begins.

`recovery.sql` is an emergency rollback only. It refuses partial or drifted
function shapes and removes only the two exact SQL148 functions.

## Localhost checks for Stebbi

There is intentionally nothing new to click in Phase 2. No existing Event,
Expense or Verkefnin UI imports the new repository. After green manual SQL,
the safe check is therefore existing regression behavior only:

1. Open Events as an Event-enabled user and confirm the current dashboard and
   Event detail still load.
2. Open Expenses under its existing flag and confirm its current Event source
   still behaves exactly as before.
3. Do not try to exercise SQL148 through browser devtools or direct RPC calls;
   Phase 3 will add the authorized server/UI entry point.

Do not use accounts or Events belonging to unrelated users when validating
visibility. Owner and accepted-attendee isolation is server-authoritative.
