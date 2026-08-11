# SQL124 recovery

Any error before `COMMIT` rolls back the function replacement and all grant
changes. Preserve the complete error and run the read-only preflight again; do
not rerun SQL123 or SQL124 blindly.

After a successful commit, do not restore the SQL123 proposal body: that would
reopen the review-state gap. If postflight is not fully green, keep the batch
UI undeployed, inspect `pg_get_functiondef`, owner and ACL state read-only,
rerun the canonical SQL123 postflight, and prepare a new forward-only migration.
SQL124 creates no tables and rewrites no settlement data, so destructive table
recovery is neither required nor appropriate.
