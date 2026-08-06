-- Read-only SQL111 preflight. Stebbi runs this; Codex never executes it.
WITH target_functions AS (
  SELECT procedure.oid
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'expense_list_my_private_drafts'
), required_columns AS (
  SELECT unnest(ARRAY[
    'id', 'actor_user_id', 'context_type', 'group_id', 'expense_id',
    'current_step', 'payload', 'version', 'updated_at'
  ]) AS column_name
), present_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'expense_private_drafts'
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  to_regclass('public.expense_private_drafts') IS NOT NULL
    AND to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NOT NULL
    AND to_regprocedure('public.expense_active_member_role(uuid,uuid)') IS NOT NULL
    AND to_regclass('public.expenses') IS NOT NULL
    AND to_regclass('public.expense_groups') IS NOT NULL
    AND to_regclass('public.expense_repayments') IS NOT NULL AS prerequisites_ok,
  ARRAY(
    SELECT required.column_name
    FROM required_columns AS required
    WHERE NOT EXISTS (
      SELECT 1 FROM present_columns AS present
      WHERE present.column_name = required.column_name
    )
    ORDER BY required.column_name
  ) AS missing_required_columns,
  (SELECT count(*) FROM target_functions) AS existing_target_functions,
  (
    SELECT count(*)
    FROM information_schema.role_routine_grants
    WHERE specific_schema = 'public'
      AND routine_name = 'expense_list_my_private_drafts'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) AS browser_execute_grants,
  (
    SELECT count(*)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND xact_start < now() - interval '5 minutes'
      AND pid <> pg_backend_pid()
  ) AS transactions_older_than_five_minutes;
