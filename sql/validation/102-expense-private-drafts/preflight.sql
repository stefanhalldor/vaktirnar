-- Read-only preflight for SQL102. Stebbi runs this in production before SQL102.
WITH required_relations(name) AS (
  VALUES
    ('expense_groups'), ('expense_group_members'), ('expenses'),
    ('expense_repayments'), ('feature_access'), ('relationships'), ('profiles')
), required_functions(name) AS (
  VALUES ('expense_assert_beta_actor'), ('expense_active_member_role')
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  NOT EXISTS (
    SELECT 1 FROM required_relations
    WHERE to_regclass('public.' || name) IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM required_functions
    WHERE to_regprocedure('public.' || name || '(uuid)') IS NULL
      AND name = 'expense_assert_beta_actor'
  ) AND to_regprocedure('public.expense_active_member_role(uuid,uuid)') IS NOT NULL
    AS prerequisites_ok,
  to_regclass('public.expense_private_drafts') AS existing_target_relation,
  ARRAY(
    SELECT routine.routine_name
    FROM information_schema.routines AS routine
    WHERE routine.routine_schema = 'public'
      AND routine.routine_name IN (
        'expense_assert_private_draft_context',
        'expense_save_private_draft',
        'expense_get_private_draft',
        'expense_delete_private_draft',
        'expense_create_expense_with_known_members'
      )
    ORDER BY routine.routine_name
  ) AS existing_target_functions,
  (
    SELECT count(*)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state <> 'idle'
      AND xact_start < now() - interval '5 minutes'
      AND pid <> pg_backend_pid()
  ) AS transactions_older_than_five_minutes;
