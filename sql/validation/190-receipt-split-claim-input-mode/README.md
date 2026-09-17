# SQL190 claim input mode

Run in this order and stop unless each gate has the exact expected state:

1. `preflight.sql` → `READY` and every boolean `true`.
2. `../../190_receipt_split_claim_input_mode.sql` → `Success. No rows returned`.
3. `postflight.sql` → `EXACT_INSTALLED` and every boolean `true`.

Stebbi runs every SQL step manually. Never rerun the migration after success.
