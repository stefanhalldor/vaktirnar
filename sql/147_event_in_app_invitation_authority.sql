-- SQL147: make the durable in-app Event invitation authoritative.
-- Email delivery remains best-effort and never gates visibility or consent.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('teskeid:sql147:event-in-app-invitations', 14701)
);

DO $sql147$
DECLARE
  v_target record;
  v_oid oid;
  v_source text;
  v_source_md5 text;
  v_original_source text;
  v_qualified_name text;
  v_arguments text;
  v_marker constant text := '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY';
BEGIN
  FOR v_target IN
    SELECT * FROM (VALUES
      (
        'public.teskeid_event_list_for_actor(uuid)',
        'b932c0d12fdb09e4ea184ead2607e4ff',
        '4ccf01e6251a7e7ee187fcba21a88c36'
      ),
      (
        'public.teskeid_event_get_guest_attendance_preview(uuid,uuid)',
        '347c46a906dd1e1ce57807e2b399e80d',
        'e268003d1f916f6a987e8d47dbef5971'
      ),
      (
        'public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)',
        '6a9c34c368384415aa0a8ac4545b8f07',
        '45bab121e346e77fa4a4035b7cf88f16'
      ),
      (
        'public.teskeid_event_list_my_pending_invitations(uuid)',
        '9b7a49a9f84649656045e6a2120e2f43',
        '295ca440e9caa334986f664ce2bc7398'
      )
    ) AS expected(signature, old_source_md5, new_source_md5)
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_target.signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'sql147_prerequisite_missing:%', v_target.signature;
    END IF;
    SELECT procedure_row.prosrc,
           pg_catalog.md5(pg_catalog.replace(
             procedure_row.prosrc, E'\r\n', E'\n'
           )),
           pg_catalog.format('%I.%I', namespace_row.nspname, procedure_row.proname),
           pg_catalog.pg_get_function_arguments(procedure_row.oid)
    INTO v_source, v_source_md5, v_qualified_name, v_arguments
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE procedure_row.oid = v_oid;

    -- The applied SQL133/134 bodies may be stored with CRLF. Hash checks have
    -- always normalized line endings, so the rewrite input must do the same.
    v_source := pg_catalog.replace(v_source, E'\r\n', E'\n');

    IF pg_catalog.strpos(v_source, v_marker) = 0 THEN
      IF v_source_md5 IS DISTINCT FROM v_target.old_source_md5 THEN
        RAISE EXCEPTION 'sql147_function_drift:%:%',
          v_target.signature, v_source_md5;
      END IF;

      v_original_source := v_source;

      CASE v_target.signature
      WHEN 'public.teskeid_event_list_for_actor(uuid)' THEN
        v_source := pg_catalog.replace(
          v_source,
          E'\n          AND candidate.attempt_number > 0',
          ''
        );
      WHEN 'public.teskeid_event_get_guest_attendance_preview(uuid,uuid)' THEN
        v_source := pg_catalog.replace(
          v_source,
          E'\n    AND invitation.attempt_number > 0',
          ''
        );
      WHEN 'public.teskeid_event_list_my_pending_invitations(uuid)' THEN
        v_source := pg_catalog.replace(
          v_source,
          E'\n      AND candidate.attempt_number > 0',
          ''
        );
      WHEN 'public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)' THEN
        v_source := pg_catalog.replace(
          v_source,
          E'\n    AND invitation.attempt_number > 0',
          ''
        );
        v_source := pg_catalog.replace(
          v_source,
          E'\n      AND invitation.attempt_number > 0',
          ''
        );
        v_source := pg_catalog.regexp_replace(
          v_source,
          'OR[[:space:]]+v_probe_owner_user_id[[:space:]]+IS[[:space:]]+NULL'
            || '[[:space:]]+OR[[:space:]]+v_probe_actor_recipient_rate_hash'
            || '[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN',
          'OR v_probe_owner_user_id IS NULL THEN'
        );
        v_source := pg_catalog.regexp_replace(
          v_source,
          'invitation[.]actor_recipient_rate_hash[[:space:]]*='
            || '[[:space:]]*v_probe_actor_recipient_rate_hash',
          E'invitation.actor_recipient_rate_hash IS NOT DISTINCT FROM\n'
            || E'        v_probe_actor_recipient_rate_hash'
        );
        v_source := pg_catalog.regexp_replace(
          v_source,
          'PERFORM[[:space:]]+pg_catalog[.]pg_advisory_xact_lock[(]'
            || 'pg_catalog[.]hashtextextended[(][[:space:]]*'
            || '''teskeid:event-attendance:actor-recipient-cooldown:'''
            || '[[:space:]]*[|][|][[:space:]]*'
            || 'v_probe_actor_recipient_rate_hash,[[:space:]]*13305'
            || '[[:space:]]*[)][)][;]',
          E'IF v_probe_actor_recipient_rate_hash IS NOT NULL THEN\n'
            || E'    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n'
            || E'      ''teskeid:event-attendance:actor-recipient-cooldown:''\n'
            || E'        || v_probe_actor_recipient_rate_hash,\n'
            || E'      13305\n'
            || E'    ));\n'
            || E'  END IF;'
        );
        ELSE
          RAISE EXCEPTION 'sql147_unhandled_target:%', v_target.signature;
      END CASE;

      IF v_source = v_original_source THEN
        RAISE EXCEPTION 'sql147_rewrite_missing:%', v_target.signature;
      END IF;
      v_source := pg_catalog.replace(
        v_source,
        E'\nDECLARE',
        E'\n' || v_marker || E'\nDECLARE'
      );
      IF pg_catalog.strpos(v_source, v_marker) = 0 THEN
        RAISE EXCEPTION 'sql147_marker_insert_failed:%', v_target.signature;
      END IF;

      EXECUTE pg_catalog.format(
        'CREATE OR REPLACE FUNCTION %s(%s) RETURNS jsonb '
          || 'LANGUAGE plpgsql SECURITY DEFINER SET search_path = '''' AS %L',
        v_qualified_name, v_arguments, v_source
      );

      SELECT procedure_row.prosrc
      INTO v_source
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(v_target.signature);
      v_source := pg_catalog.replace(v_source, E'\r\n', E'\n');
    END IF;

    IF (
      pg_catalog.length(v_source)
        - pg_catalog.length(pg_catalog.replace(v_source, v_marker, ''))
    ) / pg_catalog.length(v_marker) <> 1 THEN
      RAISE EXCEPTION 'sql147_marker_mismatch:%', v_target.signature;
    END IF;

    CASE v_target.signature
      WHEN 'public.teskeid_event_list_for_actor(uuid)' THEN
        IF v_source ~ 'candidate[.]attempt_number[[:space:]]*>[[:space:]]*0'
           OR v_source !~ 'candidate[.]recipient_email_canonical[[:space:]]*=[[:space:]]*v_actor_email'
           OR v_source !~ 'candidate_guest[.]status[[:space:]]*=[[:space:]]*''active''' THEN
          RAISE EXCEPTION 'sql147_applied_shape_mismatch:%', v_target.signature;
        END IF;
      WHEN 'public.teskeid_event_get_guest_attendance_preview(uuid,uuid)' THEN
        IF v_source ~ 'invitation[.]attempt_number[[:space:]]*>[[:space:]]*0'
           OR v_source !~ 'invitation[.]recipient_email_canonical[[:space:]]*=[[:space:]]*v_actor_email'
           OR v_source !~ 'guest[.]status[[:space:]]*=[[:space:]]*''active''' THEN
          RAISE EXCEPTION 'sql147_applied_shape_mismatch:%', v_target.signature;
        END IF;
      WHEN 'public.teskeid_event_list_my_pending_invitations(uuid)' THEN
        IF v_source ~ 'candidate[.]attempt_number[[:space:]]*>[[:space:]]*0'
           OR v_source !~ 'candidate[.]recipient_email_canonical[[:space:]]*=[[:space:]]*v_actor_email'
           OR v_source !~ 'guest[.]status[[:space:]]*=[[:space:]]*''active''' THEN
          RAISE EXCEPTION 'sql147_applied_shape_mismatch:%', v_target.signature;
        END IF;
      WHEN 'public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)' THEN
        IF v_source ~ 'invitation[.]attempt_number[[:space:]]*>[[:space:]]*0'
           OR v_source !~ 'invitation[.]recipient_email_canonical[[:space:]]*=[[:space:]]*v_actor_email'
           OR v_source !~ 'actor_recipient_rate_hash[[:space:]]+IS[[:space:]]+NOT[[:space:]]+DISTINCT[[:space:]]+FROM'
           OR v_source !~ 'IF[[:space:]]+v_probe_actor_recipient_rate_hash[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL[[:space:]]+THEN'
           OR v_source ~ 'OR[[:space:]]+v_probe_actor_recipient_rate_hash[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN' THEN
          RAISE EXCEPTION
            'sql147_applied_shape_mismatch:%:attempt_gate=%:email_guard=%:null_safe=%:conditional_lock=%:old_null_rejection=%',
            v_target.signature,
            v_source ~ 'invitation[.]attempt_number[[:space:]]*>[[:space:]]*0',
            v_source ~ 'invitation[.]recipient_email_canonical[[:space:]]*=[[:space:]]*v_actor_email',
            v_source ~ 'actor_recipient_rate_hash[[:space:]]+IS[[:space:]]+NOT[[:space:]]+DISTINCT[[:space:]]+FROM',
            v_source ~ 'IF[[:space:]]+v_probe_actor_recipient_rate_hash[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL[[:space:]]+THEN',
            v_source ~ 'OR[[:space:]]+v_probe_actor_recipient_rate_hash[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN';
        END IF;
      ELSE
        RAISE EXCEPTION 'sql147_unhandled_target:%', v_target.signature;
    END CASE;

    IF pg_catalog.md5(pg_catalog.replace(
      v_source,
      v_marker || E'\n',
      ''
    )) IS DISTINCT FROM v_target.new_source_md5 THEN
      RAISE EXCEPTION 'sql147_exact_body_mismatch:%:%',
        v_target.signature,
        pg_catalog.md5(pg_catalog.replace(v_source, v_marker || E'\n', ''));
    END IF;
  END LOOP;
END;
$sql147$;

COMMIT;
