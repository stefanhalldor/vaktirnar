-- SQL131 owner-private expense events recovery inventory -- READ ONLY.
-- This is not a rollback. Disable EVENTS_ENABLED outside SQL under separate
-- authority, inspect this row, and ship a new additive forward fix.

BEGIN;
SET TRANSACTION READ ONLY;

DO $expense_event_recovery_guard$
BEGIN
  IF pg_catalog.to_regclass('public.expense_event_contexts') IS NULL
     OR pg_catalog.to_regclass('public.expense_event_participants') IS NULL THEN
    RAISE EXCEPTION 'expense_event_recovery_schema_missing';
  END IF;
END;
$expense_event_recovery_guard$;

WITH relation_inventory AS (
  SELECT
    pg_catalog.to_regclass('public.expense_event_contexts') IS NOT NULL
      AS contexts_present,
    pg_catalog.to_regclass('public.expense_event_participants') IS NOT NULL
      AS participants_present
), function_inventory AS (
  SELECT
    pg_catalog.to_regprocedure(
      'public.expense_create_event_context(uuid,uuid,text,jsonb)'
    ) IS NOT NULL AS create_rpc_present,
    pg_catalog.to_regprocedure(
      'public.expense_list_event_contexts(uuid)'
    ) IS NOT NULL AS list_rpc_present,
    pg_catalog.to_regprocedure(
      'public.expense_get_event_context(uuid,uuid)'
    ) IS NOT NULL AS detail_rpc_present,
    pg_catalog.to_regprocedure(
      'public.expense_is_event_context(uuid,uuid)'
    ) IS NOT NULL AS classifier_rpc_present,
    pg_catalog.to_regprocedure(
      'public.expense_prepare_account_deletion(uuid)'
    ) IS NOT NULL AS account_cleanup_present
), counts AS (
  SELECT
    CASE WHEN pg_catalog.to_regclass('public.expense_event_contexts') IS NULL
      THEN NULL
      ELSE (SELECT pg_catalog.count(*) FROM public.expense_event_contexts)
    END AS context_rows,
    CASE WHEN pg_catalog.to_regclass('public.expense_event_participants') IS NULL
      THEN NULL
      ELSE (SELECT pg_catalog.count(*) FROM public.expense_event_participants)
    END AS participant_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_groups) AS group_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_group_members) AS member_rows,
    (SELECT pg_catalog.count(*) FROM public.expenses) AS expense_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_activity) AS activity_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_mutation_requests) AS receipt_rows
), invariant_inventory AS (
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_participants AS participant
      LEFT JOIN public.expense_event_contexts AS context_row
        ON context_row.group_id = participant.group_id
      LEFT JOIN public.expense_group_members AS member
        ON member.group_id = participant.group_id
       AND member.id = participant.member_id
      WHERE context_row.group_id IS NULL
         OR member.id IS NULL
         OR member.user_id IS NOT NULL
         OR member.role <> 'member'
         OR member.status <> 'active'
    ) AS participant_mapping_shape_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_contexts AS context_row
      JOIN public.expense_member_invitations AS invitation
        ON invitation.group_id = context_row.group_id
    ) AS no_event_invitations_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_participants AS participant
      JOIN public.expense_group_members AS financial_member
        ON financial_member.group_id = participant.group_id
       AND financial_member.user_id = participant.linked_user_id
       AND financial_member.status IN ('active', 'invited')
      WHERE participant.linked_user_id IS NOT NULL
    ) AS linked_users_not_financial_members_ok
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  relation_inventory.contexts_present,
  relation_inventory.participants_present,
  function_inventory.create_rpc_present,
  function_inventory.list_rpc_present,
  function_inventory.detail_rpc_present,
  function_inventory.classifier_rpc_present,
  function_inventory.account_cleanup_present,
  counts.context_rows,
  counts.participant_rows,
  counts.group_rows,
  counts.member_rows,
  counts.expense_rows,
  counts.activity_rows,
  counts.receipt_rows,
  invariant_inventory.participant_mapping_shape_ok,
  invariant_inventory.no_event_invitations_ok,
  invariant_inventory.linked_users_not_financial_members_ok,
  'Do not drop or rewrite event, member, expense, activity, receipt, or ledger rows. Disable EVENTS_ENABLED outside SQL and ship a new additive migration.'
    AS forward_only_recovery_instruction
FROM relation_inventory
CROSS JOIN function_inventory
CROSS JOIN counts
CROSS JOIN invariant_inventory;

ROLLBACK;
