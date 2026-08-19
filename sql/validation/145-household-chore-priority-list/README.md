# SQL145 validation

Run manually in the same target database and role, one file at a time:

1. `preflight.sql` — read-only; every boolean and `prerequisites_ok` must be true.
2. `../../145_household_chore_priority_list.sql` — schema/function migration.
3. `postflight.sql` — read-only; every boolean and `postconditions_ok` must be true.

Stop on any false value or SQL error. Do not retry the migration after an
unknown partial execution; the migration is transactional, so first verify the
catalog with postflight or request a reviewed recovery step.
