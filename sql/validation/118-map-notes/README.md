# SQL118 validation

All three SQL files are read-only. Run `preflight.sql` before any separately
approved migration and `postflight.sql` afterwards. Expected counters for
browser grants, browser policies and violations are `0`; all `*_ok` values
must be `true`.

`recovery.sql` only measures rollback impact. The safe first rollback is to
remove/disable the application surface while retaining rows and columns.
Dropping map scopes, columns or user content requires separate approval.
