# SQL115 validation

`preflight.sql` and `postflight.sql` are read-only. `recovery.sql` is destructive,
requires a separately approved empty-beta rollback, and was not run. SQL115 adds
owner-only question-bank and immutable template-snapshot storage; no existing
rows are backfilled or imported from preview/CrowdSync.

The personal-space foundation must first pass
`../29-spaces-foundation/README.md`. Stebbi's production SQL29 postflight was
green on 2026-08-09, with zero space and membership rows. Before SQL115, run
only this directory's `preflight.sql` and share its full single result row with
Codex. Stop unless `prerequisites_ok=true`,
`target_objects_absent=true`, all dependency objects are present, both role
capability fields are true, the collision fields are null and the long-running
transaction count is zero. SQL115 still needs a separate review and apply
decision.

SQL115 is one-time and collision-guarded. It grants `service_role` direct
`SELECT` only; question/template writes must use the three mutation RPCs. Kviss
authoring rows cascade with their personal space or auth creator so account
deletion is not blocked by this migration.

After a separately approved SQL115 apply, run `postflight.sql` immediately and
share its complete single row. Every `*_ok` field must be true,
`transactions_older_than_five_minutes` must be zero, and the three row counts
should be zero before the first creator visit. Do not continue to SQL116 until
Codex has reviewed that result.

`../kviss-non-production/README.md` applies only to a separately named
non-production project. It must not be used as authorization against the
production project.
