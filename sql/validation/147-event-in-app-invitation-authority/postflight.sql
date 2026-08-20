-- Read-only SQL147 postflight. Every boolean and postconditions_ok must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH expected(signature, new_md5) AS (
  VALUES
    ('public.teskeid_event_list_for_actor(uuid)', '4ccf01e6251a7e7ee187fcba21a88c36'),
    ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)', 'e268003d1f916f6a987e8d47dbef5971'),
    ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)', '45bab121e346e77fa4a4035b7cf88f16'),
    ('public.teskeid_event_list_my_pending_invitations(uuid)', '295ca440e9caa334986f664ce2bc7398')
), function_checks AS (
  SELECT
    pg_catalog.count(*) = 4 AND pg_catalog.bool_and(
      (
        pg_catalog.length(procedure_row.prosrc)
          - pg_catalog.length(pg_catalog.replace(
            procedure_row.prosrc,
            '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY',
            ''
          ))
      ) / pg_catalog.length('-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY') = 1
    ) AS function_sources_sql147_ok,
    pg_catalog.count(*) = 4 AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(
        pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'),
        '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY' || E'\n',
        ''
      )) = expected.new_md5
    ) AS function_sources_exact_ok,
    pg_catalog.count(*) = 4 AND pg_catalog.bool_and(
      procedure_row.prosecdef
      AND pg_catalog.cardinality(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND owner_role.rolname = 'postgres'
      AND pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
    ) AS function_security_ok
  FROM expected
  JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure_row.proowner
), sources AS (
  SELECT
    (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid =
      'public.teskeid_event_list_for_actor(uuid)'::pg_catalog.regprocedure) AS dashboard,
    (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid =
      'public.teskeid_event_list_my_pending_invitations(uuid)'::pg_catalog.regprocedure) AS unread_feed,
    (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid =
      'public.teskeid_event_get_guest_attendance_preview(uuid,uuid)'::pg_catalog.regprocedure) AS preview,
    (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid =
      'public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)'::pg_catalog.regprocedure) AS response
), shape_checks AS (
  SELECT
    dashboard !~ 'attempt_number[[:space:]]*>[[:space:]]*0'
      AND unread_feed !~ 'attempt_number[[:space:]]*>[[:space:]]*0'
      AND preview !~ 'attempt_number[[:space:]]*>[[:space:]]*0'
        AS visibility_email_independent_ok,
    dashboard ~ 'candidate[.]recipient_email_canonical[[:space:]]*=[[:space:]]*v_actor_email'
      AND dashboard ~ 'candidate_guest[.]status[[:space:]]*=[[:space:]]*''active'''
      AND unread_feed ~ 'candidate[.]recipient_email_canonical[[:space:]]*=[[:space:]]*v_actor_email'
      AND unread_feed ~ 'guest[.]status[[:space:]]*=[[:space:]]*''active'''
      AND preview ~ 'invitation[.]recipient_email_canonical[[:space:]]*=[[:space:]]*v_actor_email'
      AND preview ~ 'guest[.]status[[:space:]]*=[[:space:]]*''active'''
        AS projection_identity_guards_ok,
    response !~ 'invitation[.]attempt_number[[:space:]]*>[[:space:]]*0'
      AND response ~ 'actor_recipient_rate_hash[[:space:]]+IS[[:space:]]+NOT[[:space:]]+DISTINCT[[:space:]]+FROM'
      AND response ~ 'IF[[:space:]]+v_probe_actor_recipient_rate_hash[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL[[:space:]]+THEN'
      AND response ~ 'recipient_email_canonical[[:space:]]*=[[:space:]]*v_actor_email'
      AND response !~ 'OR[[:space:]]+v_probe_actor_recipient_rate_hash[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN'
        AS response_email_independent_ok
  FROM sources
), diagnostics AS (
  SELECT pg_catalog.count(*) FILTER (
    WHERE invitation.status = 'pending'
      AND invitation.expires_at > pg_catalog.now()
      AND invitation.attempt_number = 0
  )::integer AS pending_zero_attempt_count
  FROM public.teskeid_event_guest_invitations AS invitation
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  function_checks.*,
  shape_checks.*,
  diagnostics.*,
  function_checks.function_sources_sql147_ok
    AND function_checks.function_sources_exact_ok
    AND function_checks.function_security_ok
    AND shape_checks.visibility_email_independent_ok
    AND shape_checks.projection_identity_guards_ok
    AND shape_checks.response_email_independent_ok AS postconditions_ok
FROM function_checks CROSS JOIN shape_checks CROSS JOIN diagnostics;

ROLLBACK;
