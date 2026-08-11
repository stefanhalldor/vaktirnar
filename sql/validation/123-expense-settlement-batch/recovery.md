# SQL123 recovery

Before `COMMIT`, any migration error rolls back the complete migration.

After a successful commit, do not drop the batch tables, item links or repayment
metadata: they may contain immutable financial history and reported
reservations. Disable the Pay-All batch UI and deploy a forward-only corrective
migration. Proposed batches must first be cancelled through the authoritative
transition/account-deletion path; confirmed or terminal rows are never erased.

If preflight detects an old draft under the same table names, inspect it
read-only. Renaming, dropping or transforming even an apparently empty draft
requires separate approval and a dedicated recovery migration.
