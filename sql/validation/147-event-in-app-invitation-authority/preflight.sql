-- Read-only SQL147 preflight. Every boolean and prerequisites_ok must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH expected(signature, old_md5, new_md5) AS (
  VALUES
    ('public.teskeid_event_list_for_actor(uuid)', 'b932c0d12fdb09e4ea184ead2607e4ff', '4ccf01e6251a7e7ee187fcba21a88c36'),
    ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)', '347c46a906dd1e1ce57807e2b399e80d', 'e268003d1f916f6a987e8d47dbef5971'),
    ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)', '6a9c34c368384415aa0a8ac4545b8f07', '45bab121e346e77fa4a4035b7cf88f16'),
    ('public.teskeid_event_list_my_pending_invitations(uuid)', '9b7a49a9f84649656045e6a2120e2f43', '295ca440e9caa334986f664ce2bc7398')
), checks AS (
  SELECT
    pg_catalog.current_setting('server_version_num')::integer >= 150000 AS server_version_ok,
    current_user IN ('postgres', 'supabase_admin') AS executor_ok,
    pg_catalog.to_regclass('public.teskeid_event_guest_invitations') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_guests') IS NOT NULL
      AND pg_catalog.to_regclass('public.recent_events') IS NOT NULL AS relations_ok,
    pg_catalog.bool_and(procedure_row.oid IS NOT NULL) AS functions_exist_ok,
    pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'))
        = expected.old_md5
      OR (
        pg_catalog.strpos(procedure_row.prosrc,
          '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY') > 0
        AND pg_catalog.md5(pg_catalog.replace(
          pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'),
          '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY' || E'\n',
          ''
        )) = expected.new_md5
      )
    ) AS function_sources_expected_ok,
    pg_catalog.bool_and(
      procedure_row.prosecdef
      AND pg_catalog.cardinality(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND owner_role.rolname = 'postgres'
      AND pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
    ) AS function_security_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), diagnostics AS (
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE invitation.status = 'pending'
        AND invitation.expires_at > pg_catalog.now()
        AND invitation.attempt_number = 0
    )::integer AS pending_zero_attempt_count,
    pg_catalog.count(*) FILTER (
      WHERE invitation.status = 'pending'
        AND invitation.expires_at > pg_catalog.now()
        AND invitation.attempt_number = 0
        AND account.email_confirmed_at IS NOT NULL
        AND public.normalize_email_canonical(account.email)
          = invitation.recipient_email_canonical
    )::integer AS confirmed_recipient_zero_attempt_count
  FROM public.teskeid_event_guest_invitations AS invitation
  LEFT JOIN auth.users AS account
    ON public.normalize_email_canonical(account.email)
      = invitation.recipient_email_canonical
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  checks.*,
  diagnostics.*,
  checks.server_version_ok AND checks.executor_ok AND checks.relations_ok
    AND checks.functions_exist_ok AND checks.function_sources_expected_ok
    AND checks.function_security_ok AS prerequisites_ok
FROM checks CROSS JOIN diagnostics;

ROLLBACK;
