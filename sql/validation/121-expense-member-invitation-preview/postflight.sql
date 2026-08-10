WITH functions AS (
  SELECT
    to_regprocedure('public.expense_get_scoped_member_invitation_preview(uuid,uuid)') IS NOT NULL AS preview_present_ok,
    to_regprocedure('public.expense_member_invitation_exact_expense(uuid)') IS NOT NULL AS helper_present_ok,
    to_regprocedure('public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)') IS NOT NULL AS responder_present_ok,
    to_regprocedure('public.expense_respond_scoped_member_invitation_v120(uuid,uuid,text,uuid)') IS NOT NULL AS preserved_responder_present_ok
), definitions AS (
  SELECT
    lower(pg_get_functiondef('public.expense_get_scoped_member_invitation_preview(uuid,uuid)'::regprocedure)) AS preview,
    lower(pg_get_functiondef('public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)'::regprocedure)) AS responder
), grants AS (
  SELECT
    has_function_privilege('service_role', 'public.expense_get_scoped_member_invitation_preview(uuid,uuid)', 'EXECUTE') AS service_preview_execute_ok,
    NOT has_function_privilege('authenticated', 'public.expense_get_scoped_member_invitation_preview(uuid,uuid)', 'EXECUTE') AS no_browser_preview_execute_ok,
    has_function_privilege('service_role', 'public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)', 'EXECUTE') AS service_responder_execute_ok,
    NOT has_function_privilege('authenticated', 'public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)', 'EXECUTE') AS no_browser_responder_execute_ok,
    NOT has_function_privilege('service_role', 'public.expense_respond_scoped_member_invitation_v120(uuid,uuid,text,uuid)', 'EXECUTE') AS legacy_not_directly_executable_ok
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  functions.*,
  grants.*,
  definitions.preview LIKE '%recipient_email_canonical is not distinct from v_actor_email%'
    AND definitions.preview LIKE '%i.status = ''pending''%'
    AND definitions.preview LIKE '%i.expires_at > now()%'
    AND definitions.preview NOT LIKE '%paymentinstruction%'
    AND definitions.preview NOT LIKE '%''recipientemail''%'
    AND definitions.preview NOT LIKE '%''userid''%'
    AND definitions.preview NOT LIKE '%''memberid''%'
    AS exact_recipient_preview_scope_ok,
  definitions.responder LIKE '%expense_respond_scoped_member_invitation_v120%'
    AND definitions.responder LIKE '%expense_id%'
    AND definitions.responder LIKE '%expense_invitation_conflict%'
    AS exact_response_redirect_contract_ok,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role') AS service_role_bypasses_rls_ok,
  (SELECT count(*) FROM public.expense_member_invitations) AS invitation_rows,
  (SELECT count(*) FROM pg_stat_activity WHERE xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes
FROM functions, definitions, grants;
