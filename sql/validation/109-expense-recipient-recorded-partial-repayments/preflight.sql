-- SQL109 read-only preflight. This file performs no writes.
WITH required_relations(name) AS (
  VALUES
    ('public.expense_groups'),
    ('public.expense_group_members'),
    ('public.expense_obligations'),
    ('public.expense_repayments'),
    ('public.expense_repayment_allocations'),
    ('public.expense_mutation_requests'),
    ('public.expense_activity')
), required_functions(signature) AS (
  VALUES
    ('public.expense_assert_beta_actor(uuid)'),
    ('public.expense_begin_request(uuid,uuid,text,text)'),
    ('public.expense_finish_request(uuid,uuid,jsonb)'),
    ('public.expense_active_member_role(uuid,uuid)'),
    ('public.expense_simplified_settlement(uuid,text,boolean)'),
    ('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)'),
    ('public.expense_attach_encrypted_payment_snapshot()')
), target AS (
  SELECT to_regprocedure(
    'public.expense_record_received_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)'
  ) AS procedure_oid
), overloads AS (
  SELECT count(*)::bigint AS count
  FROM pg_proc AS procedure_row
  JOIN pg_namespace AS namespace_row ON namespace_row.oid = procedure_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND procedure_row.proname = 'expense_record_received_repayment'
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  NOT EXISTS (
    SELECT 1 FROM required_relations WHERE to_regclass(name) IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM required_functions WHERE to_regprocedure(signature) IS NULL
  ) AS prerequisites_ok,
  (SELECT procedure_oid IS NOT NULL FROM target) AS already_applied,
  (SELECT count FROM overloads) AS existing_target_functions,
  coalesce((
    SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database()
      AND xact_start < now() - interval '5 minutes'
      AND pid <> pg_backend_pid()
  ), 0)::bigint AS transactions_older_than_five_minutes;
