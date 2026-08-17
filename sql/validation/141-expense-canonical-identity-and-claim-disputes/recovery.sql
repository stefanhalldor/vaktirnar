-- SQL141 read-only recovery inventory. It never changes schema or data.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

SELECT pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  pg_catalog.to_regclass('public.expense_member_identity_bindings')
    AS identity_binding_relation,
  pg_catalog.to_regclass('public.expense_claim_disputes')
    AS dispute_relation,
  pg_catalog.to_regprocedure(
    'public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint)'
  ) AS event_repair_function,
  pg_catalog.to_regprocedure(
    'public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)'
  ) AS dispute_function,
  pg_catalog.to_regprocedure('public.expense_guard_disputed_settlement()')
    AS settlement_guard_function,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'expense_repayments_dispute_guard'
      AND NOT trigger_row.tgisinternal
  ) AS settlement_guard_trigger_present;
ROLLBACK;
