WITH roles AS (
  SELECT
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) AS execution_role_bypasses_rls,
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) AS service_role_bypasses_rls
), prerequisites AS (
  SELECT
    to_regclass('auth.users') IS NOT NULL AS auth_users_ok,
    to_regclass('public.expense_member_invitations') IS NOT NULL AS invitations_ok,
    to_regclass('public.expense_share_collaborators') IS NOT NULL AS collaborators_ok,
    to_regclass('public.expenses') IS NOT NULL AS expenses_ok,
    to_regclass('public.expense_payments') IS NOT NULL AS payments_ok,
    to_regclass('public.expense_shares') IS NOT NULL AS shares_ok,
    (SELECT count(*) = 3
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'expense_member_invitations'
        AND column_name IN ('participant_source', 'shared_expense_id', 'shared_share_member_id')) AS sql113_invitation_columns_ok,
    to_regprocedure('public.normalize_email_canonical(text)') IS NOT NULL AS normalizer_ok,
    COALESCE(
      to_regprocedure('public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)'),
      to_regprocedure('public.expense_respond_scoped_member_invitation_v120(uuid,uuid,text,uuid)')
    ) IS NOT NULL AS responder_ok
), collisions AS (
  SELECT
    to_regprocedure('public.expense_get_scoped_member_invitation_preview(uuid,uuid)')::text AS preview_collision,
    to_regprocedure('public.expense_member_invitation_exact_expense(uuid)')::text AS helper_collision,
    to_regprocedure('public.expense_respond_scoped_member_invitation_v120(uuid,uuid,text,uuid)')::text AS legacy_collision
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  inet_server_addr() AS server_address,
  now() AS checked_at,
  pg_is_in_recovery() AS is_read_replica,
  prerequisites.*,
  roles.*,
  collisions.*,
  collisions.preview_collision IS NULL
    AND collisions.helper_collision IS NULL
    AND collisions.legacy_collision IS NULL AS target_objects_absent,
  NOT pg_is_in_recovery()
    AND prerequisites.auth_users_ok AND prerequisites.invitations_ok
    AND prerequisites.collaborators_ok AND prerequisites.expenses_ok
    AND prerequisites.payments_ok AND prerequisites.shares_ok
    AND prerequisites.sql113_invitation_columns_ok
    AND prerequisites.normalizer_ok AND prerequisites.responder_ok
    AND roles.execution_role_bypasses_rls AND roles.service_role_bypasses_rls
    AND collisions.preview_collision IS NULL
    AND collisions.helper_collision IS NULL
    AND collisions.legacy_collision IS NULL AS prerequisites_ok,
  (SELECT count(*) FROM pg_stat_activity WHERE xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes
FROM prerequisites, roles, collisions;
