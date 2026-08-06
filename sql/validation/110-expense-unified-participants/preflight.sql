-- READ ONLY. Run before SQL110 and share the single result row with Codex.
WITH required_functions(name) AS (VALUES
  ('expense_create_expense_with_known_members'),('expense_update_expense'),
  ('expense_add_group_member'),('expense_terminalize_member_invitations'),
  ('expense_update_member_invitation_delivery')
), target_functions(name) AS (VALUES
  ('expense_create_unified_participant_invitation'),
  ('expense_create_expense_with_participants'),('expense_update_expense_with_participants'),
  ('expense_invite_existing_participant'),('expense_add_participant'),
  ('expense_get_scoped_member_invitation'),('expense_reserve_scoped_member_invitation_send'),
  ('expense_respond_scoped_member_invitation')
)
SELECT current_database() AS database_name, current_user AS database_user,
  now() AS checked_at,
  to_regclass('public.expense_member_invitations') IS NOT NULL
    AND to_regclass('public.expense_group_members') IS NOT NULL
    AND to_regclass('public.relationships') IS NOT NULL AS prerequisites_ok,
  ARRAY(SELECT name FROM required_functions r WHERE NOT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=r.name)) AS missing_required_functions,
  ARRAY(SELECT name FROM target_functions t WHERE EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=t.name)) AS existing_target_functions,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='expense_member_invitations' AND column_name='participant_source') AS already_applied,
  (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
    AND xact_start < now()-interval '5 minutes') AS transactions_older_than_five_minutes;
