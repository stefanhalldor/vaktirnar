-- Emergency SQL147 recovery: restore the exact SQL133/134 function sources.
-- This deliberately restores the old email-attempt gate and should be used
-- only if SQL147 consent behavior must be rolled back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $sql147_recovery$
DECLARE
  v_target record;
  v_oid oid;
  v_md5 text;
  v_source text;
  v_qualified_name text;
  v_arguments text;
  v_marker constant text := '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY';
BEGIN
  FOR v_target IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_list_for_actor(uuid)', '4ccf01e6251a7e7ee187fcba21a88c36', 'b932c0d12fdb09e4ea184ead2607e4ff'),
      ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)', 'e268003d1f916f6a987e8d47dbef5971', '347c46a906dd1e1ce57807e2b399e80d'),
      ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)', '45bab121e346e77fa4a4035b7cf88f16', '6a9c34c368384415aa0a8ac4545b8f07'),
      ('public.teskeid_event_list_my_pending_invitations(uuid)', '295ca440e9caa334986f664ce2bc7398', '9b7a49a9f84649656045e6a2120e2f43')
    ) AS expected(signature, new_md5, old_md5)
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_target.signature);
    SELECT procedure_row.prosrc,
           pg_catalog.md5(pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')),
           pg_catalog.format('%I.%I', namespace_row.nspname, procedure_row.proname),
           pg_catalog.pg_get_function_arguments(procedure_row.oid)
    INTO v_source, v_md5, v_qualified_name, v_arguments
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE procedure_row.oid = v_oid;
    v_source := pg_catalog.replace(v_source, E'\r\n', E'\n');
    IF v_md5 = v_target.old_md5 THEN CONTINUE; END IF;
    IF pg_catalog.strpos(v_source, v_marker) = 0
       OR pg_catalog.md5(pg_catalog.replace(
         v_source, v_marker || E'\n', ''
       )) IS DISTINCT FROM v_target.new_md5 THEN
      RAISE EXCEPTION 'sql147_recovery_drift:%:%', v_target.signature, v_md5;
    END IF;
    CASE v_target.signature
      WHEN 'public.teskeid_event_list_for_actor(uuid)' THEN
        v_source := pg_catalog.replace(v_source,
          E'\n          AND candidate.recipient_email_canonical = v_actor_email',
          E'\n          AND candidate.attempt_number > 0\n          AND candidate.recipient_email_canonical = v_actor_email');
      WHEN 'public.teskeid_event_get_guest_attendance_preview(uuid,uuid)' THEN
        v_source := pg_catalog.replace(v_source,
          E'\n    AND invitation.recipient_email_canonical = v_actor_email',
          E'\n    AND invitation.attempt_number > 0\n    AND invitation.recipient_email_canonical = v_actor_email');
      WHEN 'public.teskeid_event_list_my_pending_invitations(uuid)' THEN
        v_source := pg_catalog.replace(v_source,
          E'\n      AND candidate.recipient_email_canonical = v_actor_email',
          E'\n      AND candidate.attempt_number > 0\n      AND candidate.recipient_email_canonical = v_actor_email');
      WHEN 'public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)' THEN
        v_source := pg_catalog.replace(v_source,
          E'\n    AND invitation.recipient_email_canonical = v_actor_email',
          E'\n    AND invitation.attempt_number > 0\n    AND invitation.recipient_email_canonical = v_actor_email');
        v_source := pg_catalog.replace(v_source,
          E'\n      AND invitation.recipient_email_canonical = v_actor_email',
          E'\n      AND invitation.attempt_number > 0\n      AND invitation.recipient_email_canonical = v_actor_email');
        v_source := pg_catalog.regexp_replace(v_source,
          'OR[[:space:]]+v_probe_owner_user_id[[:space:]]+IS'
            || '[[:space:]]+NULL[[:space:]]+THEN',
          E'OR v_probe_owner_user_id IS NULL\n     OR v_probe_actor_recipient_rate_hash IS NULL THEN');
        v_source := pg_catalog.regexp_replace(v_source,
          'invitation[.]actor_recipient_rate_hash[[:space:]]+IS'
            || '[[:space:]]+NOT[[:space:]]+DISTINCT[[:space:]]+FROM'
            || '[[:space:]]+v_probe_actor_recipient_rate_hash',
          E'invitation.actor_recipient_rate_hash =\n        v_probe_actor_recipient_rate_hash');
        v_source := pg_catalog.regexp_replace(v_source,
          'IF[[:space:]]+v_probe_actor_recipient_rate_hash[[:space:]]+IS'
            || '[[:space:]]+NOT[[:space:]]+NULL[[:space:]]+THEN'
            || '[[:space:]]+PERFORM[[:space:]]+'
            || 'pg_catalog[.]pg_advisory_xact_lock[(]'
            || 'pg_catalog[.]hashtextextended[(][[:space:]]*'
            || '''teskeid:event-attendance:actor-recipient-cooldown:'''
            || '[[:space:]]*[|][|][[:space:]]*'
            || 'v_probe_actor_recipient_rate_hash,[[:space:]]*13305'
            || '[[:space:]]*[)][)][;][[:space:]]+END[[:space:]]+IF[;]',
          E'PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n'
            || E'    ''teskeid:event-attendance:actor-recipient-cooldown:''\n'
            || E'      || v_probe_actor_recipient_rate_hash,\n    13305\n  ));');
    END CASE;
    v_source := pg_catalog.replace(v_source, v_marker || E'\n', '');
    IF pg_catalog.md5(v_source) IS DISTINCT FROM v_target.old_md5 THEN
      RAISE EXCEPTION 'sql147_recovery_rewrite_mismatch:%:%',
        v_target.signature, pg_catalog.md5(v_source);
    END IF;
    EXECUTE pg_catalog.format(
      'CREATE OR REPLACE FUNCTION %s(%s) RETURNS jsonb '
        || 'LANGUAGE plpgsql SECURITY DEFINER SET search_path = '''' AS %L',
      v_qualified_name, v_arguments, v_source
    );
    SELECT prosrc
    INTO v_source FROM pg_catalog.pg_proc
    WHERE oid = pg_catalog.to_regprocedure(v_target.signature);
    v_source := pg_catalog.replace(v_source, E'\r\n', E'\n');
    IF pg_catalog.md5(v_source) IS DISTINCT FROM v_target.old_md5
       OR pg_catalog.strpos(v_source, v_marker) > 0
       OR pg_catalog.strpos(v_source, 'attempt_number > 0') = 0 THEN
      RAISE EXCEPTION 'sql147_recovery_shape_mismatch:%', v_target.signature;
    END IF;
  END LOOP;
END;
$sql147_recovery$;

COMMIT;
