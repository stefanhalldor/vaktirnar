-- SQL105 expense participant/consent repair preflight — READ ONLY.
-- Run against the intended Supabase project before SQL105. Expected before
-- the first run: prerequisites_ok=true, target_configuration_ok=true,
-- member_reference_repair_needed=true, already_repaired=false, every grants
-- or unexpected counter=0, and no old transaction.

WITH required(signature) AS (
  VALUES
    ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)'),
    ('public.expense_respond_group_invitation(uuid,uuid,text,uuid)'),
    ('public.expense_report_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)'),
    ('public.expense_transition_repayment(uuid,uuid,text,uuid)'),
    ('public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'),
    ('public.expense_cancel_expense(uuid,uuid,uuid)'),
    ('public.expense_set_group_status(uuid,uuid,text,uuid)'),
    ('public.expense_link_guest_member_email(uuid,uuid,uuid,text,uuid)'),
    ('public.expense_get_my_member_invitations(uuid)'),
    ('public.expense_reserve_member_invitation_send(uuid,uuid)'),
    ('public.expense_sync_my_member_invitation_events(uuid)'),
    ('public.expense_respond_member_invitation(uuid,uuid,text,uuid)'),
    ('public.expense_cancel_member_invitation(uuid,uuid,uuid)')
), targets AS (
  SELECT signature, to_regprocedure(signature) AS oid,
    split_part(split_part(signature, '.', 2), '(', 1) AS function_name
  FROM required
), function_state AS (
  SELECT target.signature, target.function_name, target.oid,
    procedure.prosrc, procedure.prosecdef,
    EXISTS (
      SELECT 1
      FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting ~ '^search_path=(""|)$'
    ) AS fixed_empty_search_path
  FROM targets AS target
  LEFT JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = target.oid
), source AS (
  SELECT
    max(prosrc) FILTER (WHERE function_name = 'expense_update_expense') AS update_expense,
    max(prosrc) FILTER (WHERE function_name = 'expense_report_repayment') AS report_repayment,
    max(prosrc) FILTER (WHERE function_name = 'expense_transition_repayment') AS transition_repayment,
    max(prosrc) FILTER (WHERE function_name = 'expense_set_group_status') AS set_group_status,
    max(prosrc) FILTER (WHERE function_name = 'expense_link_guest_member_email') AS link_guest,
    max(prosrc) FILTER (WHERE function_name = 'expense_respond_member_invitation') AS respond_member
  FROM function_state
), operator_state AS (
  SELECT
    pg_catalog.strpos(update_expense, '''existing:'' || payment.value->>''member_id''') > 0
      AS broken_payment_form,
    pg_catalog.strpos(update_expense, '''existing:'' || share.value->>''member_id''') > 0
      AS broken_share_form,
    pg_catalog.strpos(update_expense, '''existing:'' || (payment.value->>''member_id'')') > 0
      AS fixed_payment_form,
    pg_catalog.strpos(update_expense, '''existing:'' || (share.value->>''member_id'')') > 0
      AS fixed_share_form
  FROM source
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  (SELECT count(*) = 13 AND count(oid) = 13 FROM targets)
    AND to_regprocedure('public.expense_valid_revision_snapshot(jsonb)') IS NOT NULL
    AND to_regclass('public.expense_revisions') IS NOT NULL
    AND to_regclass('public.expense_member_invitations') IS NOT NULL
    AS prerequisites_ok,
  (SELECT count(*) FROM function_state) AS target_function_count,
  (SELECT count(*) = 13 FROM function_state
    WHERE oid IS NOT NULL AND prosecdef AND fixed_empty_search_path)
    AS target_configuration_ok,
  coalesce((SELECT broken_payment_form AND broken_share_form
    FROM operator_state), false) AS member_reference_repair_needed,
  coalesce((SELECT
    pg_catalog.strpos(update_expense, 'member.status IN (''active'', ''invited'')') = 0
    OR pg_catalog.strpos(report_repayment, 'member.status IN (''active'', ''invited'')') = 0
    OR pg_catalog.strpos(transition_repayment, 'v_from.status NOT IN (''active'', ''invited'')') = 0
    FROM source), true) AS invited_financial_repair_needed,
  coalesce((SELECT
    pg_catalog.strpos(set_group_status, 'expense_member_invitations') > 0
    OR pg_catalog.strpos(link_guest, 'v_group.status <> ''active''') > 0
    OR pg_catalog.strpos(respond_member, 'v_group.status <> ''active''') > 0
    FROM source), true) AS identity_lifecycle_repair_needed,
  coalesce((SELECT fixed_payment_form AND fixed_share_form
    AND NOT broken_payment_form AND NOT broken_share_form
    FROM operator_state), false)
    AND coalesce((SELECT
      pg_catalog.strpos(update_expense, 'member.status IN (''active'', ''invited'')') > 0
      AND pg_catalog.strpos(report_repayment, 'v_from.status = ''invited''') > 0
      AND pg_catalog.strpos(set_group_status, 'expense_member_invitations') = 0
      AND pg_catalog.strpos(link_guest, 'v_group.status NOT IN (''active'', ''settling'', ''settled'')') > 0
      FROM source), false) AS already_repaired,
  coalesce((SELECT NOT (
    (broken_payment_form AND broken_share_form)
    OR (fixed_payment_form AND fixed_share_form
      AND NOT broken_payment_form AND NOT broken_share_form)
  ) FROM operator_state), true) AS unexpected_operator_form,
  (SELECT count(*)
   FROM pg_catalog.pg_proc AS procedure
   JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'public'
     AND procedure.proname IN (SELECT function_name FROM targets)
     AND procedure.oid NOT IN (SELECT oid FROM targets WHERE oid IS NOT NULL))
    AS unexpected_target_overloads,
  (SELECT count(*) FROM targets
   WHERE oid IS NOT NULL AND (
     pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
   )) AS browser_execute_grants,
  (SELECT count(*) FROM targets
   WHERE oid IS NOT NULL
     AND NOT pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE'))
    AS missing_service_role_execute,
  (SELECT count(DISTINCT member.id)
   FROM public.expense_group_members AS member
   WHERE member.status = 'invited'
     AND (
       EXISTS (SELECT 1 FROM public.expense_payments AS payment WHERE payment.member_id = member.id)
       OR EXISTS (SELECT 1 FROM public.expense_shares AS share WHERE share.member_id = member.id)
       OR EXISTS (SELECT 1 FROM public.expense_repayments AS repayment
         WHERE member.id IN (repayment.from_member_id, repayment.to_member_id))
     )) AS invited_financial_member_rows,
  (SELECT count(*) FROM public.expense_member_invitations AS invitation
   WHERE invitation.status = 'pending') AS pending_identity_invitation_rows,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
   WHERE datname = current_database()
     AND pid <> pg_backend_pid()
     AND xact_start IS NOT NULL
     AND xact_start < now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;
