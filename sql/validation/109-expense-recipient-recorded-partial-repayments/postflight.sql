-- SQL109 read-only postflight. This file performs no writes.
WITH target AS (
  SELECT to_regprocedure(
    'public.expense_record_received_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)'
  ) AS procedure_oid
), definitions AS (
  SELECT
    pg_get_functiondef(target.procedure_oid) AS target_definition,
    pg_get_functiondef(to_regprocedure('public.expense_attach_encrypted_payment_snapshot()')) AS snapshot_definition
  FROM target
  WHERE target.procedure_oid IS NOT NULL
), overloads AS (
  SELECT count(*)::bigint AS count
  FROM pg_proc AS procedure_row
  JOIN pg_namespace AS namespace_row ON namespace_row.oid = procedure_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND procedure_row.proname = 'expense_record_received_repayment'
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  (SELECT procedure_oid IS NOT NULL FROM target) AS target_signature_ok,
  coalesce((SELECT count = 1 FROM overloads), false) AS exact_overload_count_ok,
  coalesce((SELECT target_definition LIKE '%SECURITY DEFINER%' AND target_definition LIKE '%SET search_path TO %' FROM definitions), false) AS target_configuration_ok,
  coalesce((SELECT target_definition LIKE '%expense_begin_request%' AND target_definition LIKE '%expense_finish_request%' FROM definitions), false) AS idempotency_ok,
  coalesce((SELECT target_definition LIKE '%FOR UPDATE%' AND target_definition LIKE '%financial_version%' FROM definitions), false) AS cas_and_lock_ok,
  coalesce((SELECT target_definition LIKE '%v_to.user_id = p_actor_id%' FROM definitions), false) AS exact_recipient_authorization_ok,
  coalesce((SELECT target_definition LIKE '%expense_simplified_settlement(p_group_id, p_currency, true)%' FROM definitions), false) AS bounded_partial_payment_ok,
  coalesce((SELECT target_definition LIKE '%' || quote_literal('confirmed') || '%' AND target_definition LIKE '%expense_repayment_confirmed%' FROM definitions), false) AS confirmed_audit_ok,
  coalesce((SELECT snapshot_definition LIKE '%NEW.status <> %' || quote_literal('reported') || '%' FROM definitions), false) AS confirmed_snapshot_minimization_ok,
  coalesce(has_function_privilege('anon', (SELECT procedure_oid FROM target), 'EXECUTE'), false)::int
    + coalesce(has_function_privilege('authenticated', (SELECT procedure_oid FROM target), 'EXECUTE'), false)::int
    AS browser_execute_grants,
  coalesce(has_function_privilege('service_role', (SELECT procedure_oid FROM target), 'EXECUTE'), false) AS service_role_execute_ok,
  coalesce((
    SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database()
      AND xact_start < now() - interval '5 minutes'
      AND pid <> pg_backend_pid()
  ), 0)::bigint AS transactions_older_than_five_minutes;
