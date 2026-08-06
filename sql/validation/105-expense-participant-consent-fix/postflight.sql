-- SQL105 expense participant/consent repair postflight — READ ONLY.
-- Run only after SQL105 reports success. Expected: every *_ok=true and every
-- grants / unexpected / missing counter=0. Row counters are informational.

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
    max(prosrc) FILTER (WHERE function_name = 'expense_create_expense') AS create_expense,
    max(prosrc) FILTER (WHERE function_name = 'expense_respond_group_invitation') AS respond_group,
    max(prosrc) FILTER (WHERE function_name = 'expense_report_repayment') AS report_repayment,
    max(prosrc) FILTER (WHERE function_name = 'expense_transition_repayment') AS transition_repayment,
    max(prosrc) FILTER (WHERE function_name = 'expense_update_expense') AS update_expense,
    max(prosrc) FILTER (WHERE function_name = 'expense_cancel_expense') AS cancel_expense,
    max(prosrc) FILTER (WHERE function_name = 'expense_set_group_status') AS set_group_status,
    max(prosrc) FILTER (WHERE function_name = 'expense_link_guest_member_email') AS link_guest,
    max(prosrc) FILTER (WHERE function_name = 'expense_get_my_member_invitations') AS invitation_inbox,
    max(prosrc) FILTER (WHERE function_name = 'expense_reserve_member_invitation_send') AS reserve_send,
    max(prosrc) FILTER (WHERE function_name = 'expense_sync_my_member_invitation_events') AS sync_events,
    max(prosrc) FILTER (WHERE function_name = 'expense_respond_member_invitation') AS respond_member,
    max(prosrc) FILTER (WHERE function_name = 'expense_cancel_member_invitation') AS cancel_invitation
  FROM function_state
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  (SELECT count(*) = 13 AND count(oid) = 13 FROM targets)
    AS target_signatures_ok,
  (SELECT count(*) = 13 FROM function_state
    WHERE oid IS NOT NULL AND prosecdef AND fixed_empty_search_path)
    AS target_configuration_ok,
  (SELECT
    pg_catalog.strpos(update_expense, '''existing:'' || payment.value->>''member_id''') = 0
    AND pg_catalog.strpos(update_expense, '''existing:'' || share.value->>''member_id''') = 0
    AND pg_catalog.strpos(update_expense, '''existing:'' || (payment.value->>''member_id'')') > 0
    AND pg_catalog.strpos(update_expense, '''existing:'' || (share.value->>''member_id'')') > 0
    FROM source) AS member_reference_precedence_ok,
  ('existing:' || (jsonb_build_object('member_id', 'probe')->>'member_id')) = 'existing:probe'
    AS member_reference_probe_ok,
  (SELECT
    pg_catalog.strpos(create_expense, 'member.status IN (''active'', ''invited'')') > 0
    AND pg_catalog.strpos(update_expense, 'member.status IN (''active'', ''invited'')') > 0
    AND pg_catalog.strpos(update_expense, 'member.status NOT IN (''active'', ''invited'')') > 0
    AND pg_catalog.strpos(cancel_expense, 'member.status NOT IN (''active'', ''invited'')') > 0
    AND pg_catalog.strpos(report_repayment, 'member.status IN (''active'', ''invited'')') > 0
    AND pg_catalog.strpos(transition_repayment, 'v_from.status NOT IN (''active'', ''invited'')') > 0
    AND pg_catalog.strpos(transition_repayment, 'v_to.status NOT IN (''active'', ''invited'')') > 0
    FROM source) AS invited_financial_participation_ok,
  (SELECT
    pg_catalog.strpos(report_repayment, '(v_from.status = ''active'' AND v_from.user_id = p_actor_id)') > 0
    AND pg_catalog.strpos(report_repayment, '(v_from.user_id IS NULL OR v_from.status = ''invited'')') > 0
    AND pg_catalog.strpos(report_repayment, 'v_from.user_id = p_actor_id') > 0
    AND pg_catalog.strpos(transition_repayment, '(v_to.status = ''active'' AND v_to.user_id = p_actor_id)') > 0
    AND pg_catalog.strpos(transition_repayment, '(v_to.user_id IS NULL OR v_to.status = ''invited'')') > 0
    FROM source) AS manager_repayment_proxy_ok,
  (SELECT
    pg_catalog.strpos(update_expense, 'OR v_role IS NULL') > 0
    AND pg_catalog.strpos(cancel_expense, 'OR v_role IS NULL') > 0
    AND pg_catalog.strpos(reserve_send, 'v_invitation.id IS NULL OR v_role IS NULL') > 0
    AND pg_catalog.strpos(cancel_invitation, 'OR v_role IS NULL') > 0
    FROM source) AS active_actor_boundary_ok,
  (SELECT
    pg_catalog.strpos(set_group_status, 'expense_member_invitations') = 0
    AND pg_catalog.strpos(set_group_status, 'expense_group_not_settled') > 0
    AND pg_catalog.strpos(link_guest, 'v_group.status NOT IN (''active'', ''settling'', ''settled'')') > 0
    FROM source) AS pending_identity_survives_settlement_ok,
  (SELECT
    pg_catalog.strpos(invitation_inbox, 'group_row.status IN (''active'', ''settling'', ''settled'')') > 0
    AND pg_catalog.strpos(reserve_send, 'v_group.status NOT IN (''active'', ''settling'', ''settled'')') > 0
    AND (length(sync_events) - length(replace(sync_events,
      'group_row.status IN (''active'', ''settling'', ''settled'')', '')))
      / length('group_row.status IN (''active'', ''settling'', ''settled'')') = 2
    AND pg_catalog.strpos(respond_member, 'v_group.status NOT IN (''active'', ''settling'', ''settled'')') > 0
    AND pg_catalog.strpos(respond_member, 'WHERE member.id = v_member_id AND member.group_id = v_group_id') > 0
    FROM source) AS post_settlement_identity_link_ok,
  (SELECT
    pg_catalog.strpos(respond_group, 'v_group.kind NOT IN (''group'', ''one_off'')') > 0
    AND pg_catalog.strpos(respond_group, 'v_group.status NOT IN (''active'', ''settling'', ''settled'')') > 0
    AND pg_catalog.strpos(respond_group, 'public.expense_member_can_exit') > 0
    AND pg_catalog.strpos(respond_group, 'SET user_id = NULL') > 0
    FROM source) AS direct_invitation_lifecycle_ok,
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
  (SELECT count(*) FROM public.expense_member_invitations AS invitation
   WHERE invitation.status = 'pending') AS pending_identity_invitation_rows,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
   WHERE datname = current_database()
     AND pid <> pg_backend_pid()
     AND xact_start IS NOT NULL
     AND xact_start < now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;
