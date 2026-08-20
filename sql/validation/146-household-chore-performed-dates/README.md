# SQL146 validation and operator runbook

SQL146 adds authoritative date-only work dates (`performed_on`), immutable
correction/reversal audit fields, event-sealed priority tokens and v2 read/mutation
RPCs. It replaces exactly two existing SQL145 function bodies:

- `household_chore_get_priority_dashboard(uuid,uuid)`
- `household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)`

It does not replace any SQL142 function or any other SQL145 function. A new
`household_chore_get_priority_dashboard_v2` carries the richer Phase 2 payload;
the old dashboard function is a strict legacy-shape wrapper. The old completion
RPC remains callable and defaults work date to Reykjavík today, so the currently
deployed app remains usable between SQL and app rollout.

## Manual operator order

Run one file at a time in the same target database and privileged role. Do not run
the migration until the preflight output has been reviewed.

1. `preflight.sql` — read-only.
2. Review every boolean; `prerequisites_ok` must be `true`.
3. Review both diagnostic rows:
   - completed assignment/event backfill counts;
   - missing timestamps must be zero;
   - `ambiguous_reversal_mapping_count` must be zero;
   - Reykjavík-versus-UTC date-shift counts are informational but must be sent
     back for review when nonzero;
   - min/max timestamps must look plausible.
4. Only after explicit review/approval, run
   `../../146_household_chore_performed_dates.sql`.
5. Run `postflight.sql` — read-only.
6. Every boolean and `postconditions_ok` must be `true`.
7. In postflight diagnostics, all missing/unexpected counts must be zero. The
   correction-event count should be zero before the Phase 2 app is used.

Stop on any false value or SQL error. The migration is transactional. Do not
blindly retry after an unknown client/network outcome; run postflight first to
determine whether the transaction committed.

## Expected rollout effect

Priority tokens created before SQL146 become stale because the token state gains
an append-only assignment-event seal. This is expected. An already-open browser
tab should receive one bounded stale result and refresh; it must not double-credit
points. No old/new token compatibility layer is installed.

## Data and security effects

- Existing completed assignments/events are backfilled from their best available
  server audit timestamp in `Atlantic/Reykjavik`.
- The existing assignment-event immutability trigger is paused only around the
  one-time event-column backfill and restored inside the same transaction. A
  failure rolls both data and trigger state back together; postflight verifies
  that the exact guard is enabled again.
- No points, actors, performers or completion sequences are rewritten.
- Existing RLS, policies and table grants are unchanged.
- New public RPCs are callable only by `service_role`.
- New private/trigger helpers are not executable by `anon`, `authenticated` or
  `service_role`.
- Child reads are strict own-participant projections.
- Feature entitlements and per-user flags are unchanged.

## Recovery posture

There is no automatic destructive down-migration. Once Phase 2 writes corrections
or custom work dates, dropping SQL146 columns would destroy authoritative audit
data. Preferred recovery is a reviewed forward fix while the existing feature
flag limits exposure.

`recovery.sql` is read-only. It reports whether any v2 mutation/correction activity
exists and whether the old compatibility RPC/catalog is still available. Send its
output with the exact error and transaction outcome before any recovery action.
Do not copy SQL145 function bodies back or drop SQL146 objects without a new,
explicitly reviewed recovery plan.
