-- SQL141 read-only preflight. Stop unless prerequisites_ok is true.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

WITH checks AS (
  SELECT
    (current_user = 'postgres' OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = current_user AND role_row.rolsuper
    )) AS executor_ok,
    pg_catalog.to_regclass('public.expense_groups') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_group_members') IS NOT NULL
      AND pg_catalog.to_regclass('public.expenses') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_payments') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_shares') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_obligations') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_repayments') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_activity') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_activity_audience') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_mutation_requests') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_member_invitations') IS NOT NULL
      AND pg_catalog.to_regclass('public.expense_share_collaborators') IS NOT NULL
      AND pg_catalog.to_regclass('public.relationships') IS NOT NULL
      AND pg_catalog.to_regclass('public.profiles') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_events') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_guests') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_guest_invitations') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_expense_participant_sources') IS NOT NULL
      AND pg_catalog.to_regclass('public.recent_events') IS NOT NULL
      AND pg_catalog.to_regclass('auth.users') IS NOT NULL
      AS relations_ok,
    pg_catalog.to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NOT NULL
      AND pg_catalog.to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NOT NULL
      AND pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NOT NULL
      AND pg_catalog.to_regprocedure('public.expense_has_beta_access(uuid)') IS NOT NULL
      AND pg_catalog.to_regprocedure('public.expense_active_member_role(uuid,uuid)') IS NOT NULL
      AND pg_catalog.to_regprocedure('public.normalize_email_canonical(text)') IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure('public.expense_add_group_member(uuid,uuid,uuid,jsonb)') IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_terminalize_member_invitations(uuid[],text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure('public.teskeid_event_finish_request(uuid,uuid,jsonb)') IS NOT NULL
      AND pg_catalog.to_regprocedure('public.teskeid_event_uuid_from_text(text)') IS NOT NULL
      AND pg_catalog.to_regprocedure('public.expense_resolve_recent_targets(uuid,uuid[])') IS NOT NULL
      AS functions_ok,
    EXISTS (
      SELECT 1 FROM public.teskeid_event_expense_participant_sources
    ) AS historical_participant_sources_present,
    pg_catalog.to_regclass('public.expense_member_identity_bindings') IS NULL
      AND pg_catalog.to_regclass('public.expense_claim_disputes') IS NULL
      AND pg_catalog.to_regprocedure('public.expense_get_claim_context(uuid,uuid)') IS NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_get_event_identity_candidates(uuid,uuid)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint)'
      ) IS NULL
      AND pg_catalog.to_regprocedure('public.expense_identity_request_id(text,uuid)') IS NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)'
      ) IS NULL
      AND pg_catalog.to_regprocedure(
        'public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)'
      ) IS NULL
      AND pg_catalog.to_regprocedure('public.expense_guard_disputed_settlement()') IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
        WHERE trigger_row.tgname = 'expense_repayments_dispute_guard'
          AND NOT trigger_row.tgisinternal
      ) AS targets_clear
)
SELECT pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  executor_ok,
  relations_ok,
  functions_ok,
  historical_participant_sources_present,
  targets_clear,
  executor_ok AND relations_ok AND functions_ok
    AND targets_clear AS prerequisites_ok
FROM checks;
ROLLBACK;
