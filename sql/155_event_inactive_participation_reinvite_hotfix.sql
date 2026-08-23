-- SQL155: consent-safe Event reinvite after opt-out.
--
-- Phase 1 hardens both deployed leave RPCs before inactive historical rows
-- stop acting as current claim collisions. A leave closes every other pending
-- invitation and active unbound email target for the actor's confirmed email
-- in the Event, under the Event row lock. V3 request replay is resolved before
-- its claim helper can mutate a later reinvite.
--
-- Phase 2 drains predecessor writers, changes claim/list collisions to active
-- bindings, and retains a freshness gate for pre-SQL155 historical rows.
-- Runtime ordering after SQL155 comes from phase-1 Event-lock cleanup.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';

SELECT pg_catalog.pg_advisory_xact_lock(15001);
SELECT pg_catalog.pg_advisory_xact_lock(15301);
SELECT pg_catalog.pg_advisory_xact_lock(15401);
SELECT pg_catalog.pg_advisory_xact_lock(15501);

DO $sql155_phase1_preflight$
DECLARE
  v_legacy_source text;
  v_v3_source text;
  v_helper_source text;
  v_private_source text;
  v_list_source text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql155_executor_mismatch';
  END IF;

  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_legacy_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_leave_attendance(uuid,uuid,uuid)'
  );
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_v3_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_leave_participation_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)'
  );
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_helper_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_private_cleanup_opt_out_email_targets_v3(text,uuid,uuid)'
  );
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_private_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_private_claim_scoped_v3(uuid,uuid)'
  );
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_list_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_list_scoped_participations_v3(uuid)'
  );

  IF v_legacy_source IS NULL OR v_v3_source IS NULL
     OR pg_catalog.md5(v_legacy_source) NOT IN (
       'adc9e9bb4bb79081112c69dd00a6cdff', '5b4206f25cfeb04311fbbeab5ebc72da'
     )
     OR pg_catalog.md5(v_v3_source) NOT IN (
       '49b11bb0f39c308b5eacfe01e0fcd47b', 'b2767b261eaa909d064c6f5fe4b737fd'
     )
     OR (v_helper_source IS NOT NULL
       AND pg_catalog.md5(v_helper_source) <> 'fcdbc2930ca742fa4452f20a83ce0114')
     OR v_private_source IS NULL OR v_list_source IS NULL
     OR NOT (
       (
         pg_catalog.md5(v_private_source) =
           '5b7eecb3f7e9aebb6a376ffd312989be'
         AND pg_catalog.md5(v_list_source) =
           '0269211156c600c6411ecf0590eff295'
       ) OR (
         pg_catalog.md5(v_private_source) =
           '41487888c688c3280904d78772443b07'
         AND pg_catalog.md5(v_list_source) =
           'f0c26c4743874f680239a5b3d2f1ca38'
       )
     ) THEN
    RAISE EXCEPTION 'sql155_phase1_predecessor_body_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('auth.users'),
      ('public.teskeid_event_attendance_mutation_requests'),
      ('public.teskeid_event_participation_mutation_requests_v3'),
      ('public.teskeid_events'),
      ('public.teskeid_event_guests'),
      ('public.teskeid_event_guest_invitations'),
      ('public.teskeid_event_attendance_memberships'),
      ('public.teskeid_event_participations'),
      ('public.teskeid_event_participation_invitation_terminalizations'),
      ('public.teskeid_event_participation_rsvp_v3'),
      ('public.teskeid_event_participation_invitation_generations_v3')
    ) AS expected(relation_name)
    WHERE pg_catalog.to_regclass(expected.relation_name) IS NULL
  ) THEN
    RAISE EXCEPTION 'sql155_phase2_relation_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)',
        'a2a85bca2a456177ab67b7817dc6e19d'),
      ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)',
        'ee8872c3b0d91786993e4ffbfb266293'),
      ('public.teskeid_event_private_v1_participation_bridge_v2()',
        'f2901d82fd392cd406a5dfbfc3173759'),
      ('public.teskeid_event_private_sync_rsvp_v3()',
        '7126c130f7f17ad07d443a39d9aa57de'),
      ('public.teskeid_event_private_anchor_sync_v3()',
        'db82578fc700fc64590c0b1d65b0ab00')
    ) AS expected(signature,source_md5)
    LEFT JOIN pg_catalog.pg_proc AS procedure_row
      ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
    WHERE procedure_row.oid IS NULL
       OR pg_catalog.md5(pg_catalog.replace(
         procedure_row.prosrc,E'\r\n',E'\n')) <> expected.source_md5
  ) THEN
    RAISE EXCEPTION 'sql155_dependency_body_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indexrelid = pg_catalog.to_regclass(
        'public.teskeid_event_participations_active_user_uidx')
      AND index_row.indrelid = pg_catalog.to_regclass(
        'public.teskeid_event_participations')
      AND index_row.indisunique AND index_row.indisvalid
      AND index_row.indisready AND index_row.indislive
      AND index_row.indnkeyatts = 2 AND index_row.indexprs IS NULL
      AND pg_catalog.pg_get_indexdef(index_row.indexrelid,1,true) = 'event_id'
      AND pg_catalog.pg_get_indexdef(index_row.indexrelid,2,true) =
        'recipient_user_id'
      AND pg_catalog.regexp_replace(pg_catalog.lower(
        pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid)
      ), '[()[:space:]]|::text', '', 'g') =
        'access_state=''active''andrecipient_user_idisnotnull'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indexrelid = pg_catalog.to_regclass(
        'public.teskeid_event_participations_active_email_uidx')
      AND index_row.indrelid = pg_catalog.to_regclass(
        'public.teskeid_event_participations')
      AND index_row.indisunique AND index_row.indisvalid
      AND index_row.indisready AND index_row.indislive
      AND index_row.indnkeyatts = 2 AND index_row.indexprs IS NULL
      AND pg_catalog.pg_get_indexdef(index_row.indexrelid,1,true) = 'event_id'
      AND pg_catalog.pg_get_indexdef(index_row.indexrelid,2,true) =
        'recipient_email_canonical'
      AND pg_catalog.regexp_replace(pg_catalog.lower(
        pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid)
      ), '[()[:space:]]|::text', '', 'g') =
        'access_state=''active''andrecipient_email_canonicalisnotnull'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indexrelid = pg_catalog.to_regclass(
        'public.teskeid_event_guest_invitations_pending_email_uidx')
      AND index_row.indrelid = pg_catalog.to_regclass(
        'public.teskeid_event_guest_invitations')
      AND index_row.indisunique AND index_row.indisvalid
      AND index_row.indisready AND index_row.indislive
      AND index_row.indnkeyatts = 2 AND index_row.indexprs IS NULL
      AND pg_catalog.pg_get_indexdef(index_row.indexrelid,1,true) = 'event_id'
      AND pg_catalog.pg_get_indexdef(index_row.indexrelid,2,true) =
        'recipient_email_canonical'
      AND pg_catalog.regexp_replace(pg_catalog.lower(
        pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid)
      ), '[()[:space:]]|::text', '', 'g') = 'status=''pending'''
  ) THEN
    RAISE EXCEPTION 'sql155_unique_boundary_missing';
  END IF;

  IF EXISTS (
    WITH expected(
      trigger_name,relation_name,function_signature,trigger_type,
      is_deferrable,initially_deferred,update_columns,definition_md5
    ) AS (VALUES
      ('teskeid_event_guest_invitations_sql149_participation_deferred',
       'public.teskeid_event_guest_invitations',
       'public.teskeid_event_private_v1_participation_bridge_v2()',
       29,true,true,ARRAY[]::text[],
       'c64f7878dc0c9680b752f67cd3736547'),
      ('teskeid_event_participations_sql153_rsvp_sync',
       'public.teskeid_event_participations',
       'public.teskeid_event_private_sync_rsvp_v3()',
       21,false,false,ARRAY[]::text[],
       '5aac98d0010360050b49f3ae294e2f77'),
      ('teskeid_event_guest_invitations_sql153_anchor_deferred',
       'public.teskeid_event_guest_invitations',
       'public.teskeid_event_private_anchor_sync_v3()',
       21,true,true,ARRAY[]::text[],
       'd9b51df3760832dc2a0c872b3098ec42')
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgname = expected.trigger_name
     AND trigger_row.tgrelid = pg_catalog.to_regclass(expected.relation_name)
    LEFT JOIN LATERAL (
      SELECT COALESCE(pg_catalog.array_agg(
        attribute_row.attname::text ORDER BY attribute_row.attname
      ),ARRAY[]::text[]) AS update_columns
      FROM pg_catalog.unnest(COALESCE(
        trigger_row.tgattr::smallint[],ARRAY[]::smallint[]
      )) AS trigger_attribute(attnum)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid = trigger_row.tgrelid
       AND attribute_row.attnum = trigger_attribute.attnum
    ) AS actual_columns ON true
    WHERE trigger_row.oid IS NULL OR trigger_row.tgisinternal
       OR trigger_row.tgenabled <> 'O'
       OR trigger_row.tgtype <> expected.trigger_type
       OR trigger_row.tgdeferrable <> expected.is_deferrable
       OR trigger_row.tginitdeferred <> expected.initially_deferred
       OR trigger_row.tgqual IS NOT NULL OR trigger_row.tgnargs <> 0
       OR pg_catalog.octet_length(trigger_row.tgargs) <> 0
       OR trigger_row.tgfoid <>
          pg_catalog.to_regprocedure(expected.function_signature)
       OR actual_columns.update_columns <> expected.update_columns
       OR trigger_row.tgoldtable IS NOT NULL
       OR trigger_row.tgnewtable IS NOT NULL
       OR pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
          pg_catalog.regexp_replace(pg_catalog.regexp_replace(
            pg_catalog.pg_get_triggerdef(trigger_row.oid),
            '::[a-z0-9_]+(\[\])?', '', 'g'
          ), '[[:space:]()''"]', '', 'g'), 'public.', ''
       ))) <> expected.definition_md5
       OR (expected.is_deferrable AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_constraint AS trigger_constraint
         WHERE trigger_constraint.oid = trigger_row.tgconstraint
           AND trigger_constraint.conname = expected.trigger_name
           AND trigger_constraint.contype = 't'
           AND trigger_constraint.conrelid = trigger_row.tgrelid
           AND trigger_constraint.condeferrable
           AND trigger_constraint.condeferred
           AND trigger_constraint.convalidated
       ))
       OR (NOT expected.is_deferrable AND trigger_row.tgconstraint <> 0)
  ) THEN
    RAISE EXCEPTION 'sql155_trigger_boundary_missing';
  END IF;
END;
$sql155_phase1_preflight$;

CREATE OR REPLACE FUNCTION
  public.teskeid_event_private_cleanup_opt_out_email_targets_v3(
    p_actor_email text,
    p_event_id uuid,
    p_current_event_guest_id uuid
  )
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_invitation_ids uuid[] := ARRAY[]::uuid[];
  v_target public.teskeid_event_participations%ROWTYPE;
  v_terminalized_count integer := 0;
BEGIN
  IF p_event_id IS NULL OR p_current_event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  IF p_actor_email IS NULL THEN RETURN 0; END IF;
  v_email := public.normalize_email_canonical(p_actor_email);
  IF v_email IS DISTINCT FROM p_actor_email
     OR NOT public.teskeid_event_private_valid_canonical_email_v2(v_email) THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND (
      guest.id = p_current_event_guest_id
      OR EXISTS (
        SELECT 1
        FROM public.teskeid_event_guest_invitations AS invitation
        WHERE invitation.event_id = guest.event_id
          AND invitation.event_guest_id = guest.id
          AND invitation.event_guest_id <> p_current_event_guest_id
          AND invitation.status = 'pending'
          AND invitation.recipient_email_canonical = v_email
      )
      OR EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS participation
        WHERE participation.event_id = guest.event_id
          AND participation.event_guest_id = guest.id
          AND participation.event_guest_id <> p_current_event_guest_id
          AND participation.access_state = 'active'
          AND participation.recipient_user_id IS NULL
          AND participation.recipient_email_canonical = v_email
      )
    )
  ORDER BY guest.id
  FOR UPDATE OF guest;

  SELECT COALESCE(pg_catalog.array_agg(
    candidate.id ORDER BY candidate.event_guest_id,candidate.id
  ), ARRAY[]::uuid[]) INTO v_invitation_ids
  FROM (
    SELECT invitation.id,invitation.event_guest_id
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.event_id = p_event_id
      AND invitation.event_guest_id <> p_current_event_guest_id
      AND invitation.status = 'pending'
      AND invitation.recipient_email_canonical = v_email
    ORDER BY invitation.event_guest_id,invitation.id
    LIMIT 2
    FOR UPDATE OF invitation
  ) AS candidate;
  IF pg_catalog.cardinality(v_invitation_ids) > 1 THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  SELECT participation.* INTO v_target
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id <> p_current_event_guest_id
    AND participation.access_state = 'active'
    AND participation.recipient_user_id IS NULL
    AND participation.recipient_email_canonical = v_email
  ORDER BY participation.event_guest_id
  LIMIT 2
  FOR UPDATE OF participation;
  IF v_target.event_guest_id IS NOT NULL AND (
       v_target.identity_version = 9223372036854775807
       OR v_target.access_version = 9223372036854775807
     ) THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  IF pg_catalog.cardinality(v_invitation_ids) > 0 THEN
    v_terminalized_count :=
      public.teskeid_event_attendance_terminalize_invitations(
        v_invitation_ids,'cancelled'
      );
    IF v_terminalized_count <> pg_catalog.cardinality(v_invitation_ids)
       OR EXISTS (
         SELECT 1
         FROM public.teskeid_event_guest_invitations AS invitation
         WHERE invitation.id = ANY(v_invitation_ids)
           AND (invitation.status <> 'cancelled'
             OR invitation.recipient_email_canonical IS NOT NULL
             OR invitation.terminal_at IS NULL)
       ) THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
  END IF;

  IF v_target.event_guest_id IS NOT NULL THEN
    PERFORM public.teskeid_event_private_apply_participation_v2(
      p_event_id,v_target.event_guest_id,'clear_target',
      NULL,NULL,NULL,false,'revoked',NULL
    );
    IF NOT EXISTS (
      SELECT 1
      FROM public.teskeid_event_participations AS cleared_target
      WHERE cleared_target.event_id = p_event_id
        AND cleared_target.event_guest_id = v_target.event_guest_id
        AND cleared_target.identity_generation = v_target.identity_generation
        AND cleared_target.identity_version = v_target.identity_version + 1
        AND cleared_target.access_version = v_target.access_version + 1
        AND cleared_target.recipient_user_id IS NULL
        AND cleared_target.recipient_email_canonical IS NULL
        AND cleared_target.access_state = 'revoked'
    ) THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.event_id = p_event_id
      AND invitation.event_guest_id <> p_current_event_guest_id
      AND invitation.status = 'pending'
      AND invitation.recipient_email_canonical = v_email
  ) OR EXISTS (
    SELECT 1 FROM public.teskeid_event_participations AS participation
    WHERE participation.event_id = p_event_id
      AND participation.event_guest_id <> p_current_event_guest_id
      AND participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
  ) THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  RETURN v_terminalized_count
    + CASE WHEN v_target.event_guest_id IS NULL THEN 0 ELSE 1 END;
END;
$function$;

DO $sql155_phase1_rewrite$
DECLARE
  v_legacy_source text;
  v_v3_source text;
  v_legacy_fixed text;
  v_v3_fixed text;
  v_legacy_declare_old constant text :=
    E'  v_replay jsonb;\n  v_membership public.teskeid_event_attendance_memberships%ROWTYPE;';
  v_legacy_declare_new constant text :=
    E'  v_replay jsonb;\n  v_actor_email text;\n  v_membership public.teskeid_event_attendance_memberships%ROWTYPE;';
  v_legacy_replay_old constant text :=
    E'  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;\n  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);';
  v_legacy_replay_new constant text :=
    E'  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;\n'
      || E'  SELECT CASE\n'
      || E'    WHEN account.email_confirmed_at IS NOT NULL\n'
      || E'     AND public.teskeid_event_private_valid_canonical_email_v2(\n'
      || E'       public.normalize_email_canonical(account.email)\n'
      || E'     )\n'
      || E'    THEN public.normalize_email_canonical(account.email)\n'
      || E'    ELSE NULL\n'
      || E'  END INTO v_actor_email\n'
      || E'  FROM auth.users AS account\n'
      || E'  WHERE account.id = p_actor_id\n'
      || E'  FOR SHARE OF account;\n'
      || E'  IF NOT FOUND THEN RAISE EXCEPTION ''teskeid_event_not_found''; END IF;\n'
      || E'  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);';
  v_legacy_event_old constant text :=
    E'  IF NOT FOUND THEN RAISE EXCEPTION ''teskeid_event_not_found''; END IF;\n  PERFORM guest.id FROM public.teskeid_event_guests AS guest';
  v_legacy_event_new constant text :=
    E'  IF NOT FOUND THEN RAISE EXCEPTION ''teskeid_event_not_found''; END IF;\n'
      || E'  PERFORM public.teskeid_event_private_cleanup_opt_out_email_targets_v3(\n'
      || E'    v_actor_email,p_event_id,v_probe_guest_id\n'
      || E'  );\n'
      || E'  PERFORM guest.id FROM public.teskeid_event_guests AS guest';
  v_v3_declare_old constant text :=
    E'  v_replay jsonb;\n  v_participation public.teskeid_event_participations%ROWTYPE;';
  v_v3_declare_new constant text :=
    E'  v_replay jsonb;\n  v_actor_email text;\n  v_participation public.teskeid_event_participations%ROWTYPE;';
  v_v3_early_old constant text :=
    E'  PERFORM public.teskeid_event_private_claim_scoped_v3(\n'
      || E'    p_actor_id, p_event_id\n'
      || E'  );\n'
      || E'  PERFORM account.id\n'
      || E'  FROM auth.users AS account\n'
      || E'  WHERE account.id = p_actor_id\n'
      || E'  FOR SHARE OF account;\n'
      || E'  IF NOT FOUND THEN RAISE EXCEPTION ''teskeid_event_not_found''; END IF;\n'
      || E'  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);\n'
      || E'  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(\n'
      || E'    ''event_id'', p_event_id,\n'
      || E'    ''event_guest_id'', p_event_guest_id,\n'
      || E'    ''identity_generation'', p_identity_generation,\n'
      || E'    ''expected_identity_version'', p_expected_identity_version,\n'
      || E'    ''expected_access_version'', p_expected_access_version\n'
      || E'  )::text);\n'
      || E'  v_replay := public.teskeid_event_private_begin_request_v3(\n'
      || E'    p_actor_id, p_request_id, ''leave_v3'', v_fingerprint\n'
      || E'  );\n'
      || E'  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;';
  v_v3_early_new constant text :=
    E'  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);\n'
      || E'  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(\n'
      || E'    ''event_id'', p_event_id,\n'
      || E'    ''event_guest_id'', p_event_guest_id,\n'
      || E'    ''identity_generation'', p_identity_generation,\n'
      || E'    ''expected_identity_version'', p_expected_identity_version,\n'
      || E'    ''expected_access_version'', p_expected_access_version\n'
      || E'  )::text);\n'
      || E'  v_replay := public.teskeid_event_private_begin_request_v3(\n'
      || E'    p_actor_id, p_request_id, ''leave_v3'', v_fingerprint\n'
      || E'  );\n'
      || E'  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;\n\n'
      || E'  -- A replay must return before a fresh invitation can be claimed.\n'
      || E'  PERFORM public.teskeid_event_private_claim_scoped_v3(\n'
      || E'    p_actor_id,p_event_id\n'
      || E'  );\n'
      || E'  SELECT CASE\n'
      || E'    WHEN account.email_confirmed_at IS NOT NULL\n'
      || E'     AND public.teskeid_event_private_valid_canonical_email_v2(\n'
      || E'       public.normalize_email_canonical(account.email)\n'
      || E'     )\n'
      || E'    THEN public.normalize_email_canonical(account.email)\n'
      || E'    ELSE NULL\n'
      || E'  END INTO v_actor_email\n'
      || E'  FROM auth.users AS account\n'
      || E'  WHERE account.id = p_actor_id\n'
      || E'  FOR SHARE OF account;\n'
      || E'  IF NOT FOUND THEN RAISE EXCEPTION ''teskeid_event_not_found''; END IF;';
  v_v3_event_old constant text :=
    E'  IF NOT FOUND THEN RAISE EXCEPTION ''teskeid_event_not_found''; END IF;\n  PERFORM guest.id\n  FROM public.teskeid_event_guests AS guest';
  v_v3_event_new constant text :=
    E'  IF NOT FOUND THEN RAISE EXCEPTION ''teskeid_event_not_found''; END IF;\n'
      || E'  PERFORM public.teskeid_event_private_cleanup_opt_out_email_targets_v3(\n'
      || E'    v_actor_email,p_event_id,p_event_guest_id\n'
      || E'  );\n'
      || E'  PERFORM guest.id\n'
      || E'  FROM public.teskeid_event_guests AS guest';
BEGIN
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_legacy_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_leave_attendance(uuid,uuid,uuid)'
  );
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_v3_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_leave_participation_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)'
  );

  IF pg_catalog.md5(v_legacy_source) = '5b4206f25cfeb04311fbbeab5ebc72da' THEN
    v_legacy_fixed := v_legacy_source;
  ELSE
    IF pg_catalog.md5(v_legacy_source) <> 'adc9e9bb4bb79081112c69dd00a6cdff'
       OR pg_catalog.strpos(v_legacy_source,v_legacy_declare_old) = 0
       OR pg_catalog.strpos(v_legacy_source,v_legacy_replay_old) = 0
       OR pg_catalog.strpos(v_legacy_source,v_legacy_event_old) = 0 THEN
      RAISE EXCEPTION 'sql155_legacy_leave_fragment_mismatch';
    END IF;
    v_legacy_fixed := pg_catalog.replace(pg_catalog.replace(
      pg_catalog.replace(v_legacy_source,
        v_legacy_declare_old,v_legacy_declare_new),
        v_legacy_replay_old,v_legacy_replay_new),
        v_legacy_event_old,v_legacy_event_new);
  END IF;

  IF pg_catalog.md5(v_v3_source) = 'b2767b261eaa909d064c6f5fe4b737fd' THEN
    v_v3_fixed := v_v3_source;
  ELSE
    IF pg_catalog.md5(v_v3_source) <> '49b11bb0f39c308b5eacfe01e0fcd47b'
       OR pg_catalog.strpos(v_v3_source,v_v3_declare_old) = 0
       OR pg_catalog.strpos(v_v3_source,v_v3_early_old) = 0
       OR pg_catalog.strpos(v_v3_source,v_v3_event_old) = 0 THEN
      RAISE EXCEPTION 'sql155_v3_leave_fragment_mismatch';
    END IF;
    v_v3_fixed := pg_catalog.replace(pg_catalog.replace(
      pg_catalog.replace(v_v3_source,
        v_v3_declare_old,v_v3_declare_new),
        v_v3_early_old,v_v3_early_new),
        v_v3_event_old,v_v3_event_new);
  END IF;

  IF pg_catalog.md5(v_legacy_fixed) <> '5b4206f25cfeb04311fbbeab5ebc72da'
     OR pg_catalog.md5(v_v3_fixed) <> 'b2767b261eaa909d064c6f5fe4b737fd' THEN
    RAISE EXCEPTION 'sql155_phase1_rewrite_hash_mismatch';
  END IF;
  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.teskeid_event_leave_attendance(p_actor_id uuid, p_event_id uuid, p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '',v_legacy_fixed
  );
  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.teskeid_event_leave_participation_v3(p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_identity_generation bigint, p_expected_identity_version bigint, p_expected_access_version bigint, p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '',v_v3_fixed
  );
END;
$sql155_phase1_rewrite$;

ALTER FUNCTION
  public.teskeid_event_private_cleanup_opt_out_email_targets_v3(text,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_leave_attendance(uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_leave_participation_v3(
  uuid,uuid,uuid,bigint,bigint,bigint,uuid
) OWNER TO postgres;

-- Commit a callable gate before active-only claim semantics. If phase 2 fails,
-- rerunning this file is safe and restores the grants only after cutover.
REVOKE ALL ON FUNCTION
  public.teskeid_event_private_cleanup_opt_out_email_targets_v3(text,uuid,uuid),
  public.teskeid_event_leave_attendance(uuid,uuid,uuid),
  public.teskeid_event_leave_participation_v3(
    uuid,uuid,uuid,bigint,bigint,bigint,uuid
  ) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;

BEGIN;

SET LOCAL lock_timeout = '30s';
SET LOCAL statement_timeout = '120s';

SELECT pg_catalog.pg_advisory_xact_lock(15001);
SELECT pg_catalog.pg_advisory_xact_lock(15301);
SELECT pg_catalog.pg_advisory_xact_lock(15401);
SELECT pg_catalog.pg_advisory_xact_lock(15501);

-- Phase 1 is committed and both leave entry points are temporarily closed.
-- Drain predecessor writers in the established auth -> Event child order.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_attendance_mutation_requests
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_participation_mutation_requests_v3
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_events IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_guests IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_guest_invitations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_attendance_memberships IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_participations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE
  public.teskeid_event_participation_invitation_terminalizations
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_participation_rsvp_v3
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_participation_invitation_generations_v3
  IN SHARE ROW EXCLUSIVE MODE;

DO $sql155_phase2$
DECLARE
  v_private_source text;
  v_list_source text;
  v_private_fixed text;
  v_list_fixed text;
  v_private_early_old constant text :=
    E'WHERE participation.event_id = p_event_id\n      AND participation.recipient_user_id = p_actor_id';
  v_private_early_new constant text :=
    v_private_early_old || E'\n      AND participation.access_state = ''active''';
  v_private_other_old constant text :=
    E'WHERE bound_self.event_id = participation.event_id\n        AND bound_self.event_guest_id <> participation.event_guest_id\n        AND bound_self.recipient_user_id = p_actor_id';
  v_private_other_new constant text :=
    v_private_other_old || E'\n        AND bound_self.access_state = ''active''';
  v_private_freshness_anchor constant text :=
    E'  IF v_invitation.id IS NULL THEN';
  v_private_freshness_block constant text :=
    E'  IF EXISTS (\n'
      || E'    SELECT 1\n'
      || E'    FROM public.teskeid_event_participations AS historical_self\n'
      || E'    WHERE historical_self.event_id = p_event_id\n'
      || E'      AND historical_self.event_guest_id <> v_candidate.event_guest_id\n'
      || E'      AND historical_self.recipient_user_id = p_actor_id\n'
      || E'      AND historical_self.access_state <> ''active''\n'
      || E'      AND (\n'
      || E'        v_invitation.id IS NULL\n'
      || E'        OR v_invitation.created_at <= historical_self.access_updated_at\n'
      || E'      )\n'
      || E'  ) THEN\n'
      || E'    RETURN 0;\n'
      || E'  END IF;\n';
  v_list_latest_old constant text :=
    E'SELECT invitation.id,invitation.status';
  v_list_latest_new constant text :=
    E'SELECT invitation.id,invitation.status,\n          invitation.created_at';
  v_list_candidate_old constant text :=
    E'WHERE bound_self.event_id = participation.event_id\n            AND bound_self.recipient_user_id = p_actor_id';
  v_list_candidate_new constant text :=
    v_list_candidate_old
      || E'\n            AND (\n'
      || E'              bound_self.access_state = ''active''\n'
      || E'              OR latest_invitation.id IS NULL\n'
      || E'              OR latest_invitation.created_at <=\n'
      || E'                bound_self.access_updated_at\n'
      || E'            )';
  v_list_remaining_old constant text :=
    E'WHERE bound_self.event_id = remaining.event_id\n                AND bound_self.recipient_user_id = p_actor_id';
  v_list_remaining_new constant text :=
    v_list_remaining_old
      || E'\n                AND (\n'
      || E'                  bound_self.access_state = ''active''\n'
      || E'                  OR latest_invitation.id IS NULL\n'
      || E'                  OR latest_invitation.created_at <=\n'
      || E'                    bound_self.access_updated_at\n'
      || E'                )';
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql155_executor_mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.teskeid_event_private_cleanup_opt_out_email_targets_v3(text,uuid,uuid)')
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc,E'\r\n',E'\n')) = 'fcdbc2930ca742fa4452f20a83ce0114'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.teskeid_event_leave_attendance(uuid,uuid,uuid)')
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc,E'\r\n',E'\n')) = '5b4206f25cfeb04311fbbeab5ebc72da'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.teskeid_event_leave_participation_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)')
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc,E'\r\n',E'\n')) = 'b2767b261eaa909d064c6f5fe4b737fd'
  ) THEN
    RAISE EXCEPTION 'sql155_phase1_postcondition_missing';
  END IF;

  SELECT pg_catalog.replace(procedure_row.prosrc,E'\r\n',E'\n')
  INTO v_private_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_private_claim_scoped_v3(uuid,uuid)');
  SELECT pg_catalog.replace(procedure_row.prosrc,E'\r\n',E'\n')
  INTO v_list_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_list_scoped_participations_v3(uuid)');

  IF pg_catalog.md5(v_private_source) = '41487888c688c3280904d78772443b07'
     AND pg_catalog.md5(v_list_source) = 'f0c26c4743874f680239a5b3d2f1ca38' THEN
    RETURN;
  END IF;
  IF pg_catalog.md5(v_private_source) <> '5b7eecb3f7e9aebb6a376ffd312989be'
     OR pg_catalog.md5(v_list_source) <> '0269211156c600c6411ecf0590eff295' THEN
    RAISE EXCEPTION 'sql155_phase2_predecessor_body_mismatch';
  END IF;

  v_private_fixed := pg_catalog.replace(pg_catalog.replace(
    pg_catalog.replace(v_private_source,
      v_private_early_old,v_private_early_new),
      v_private_other_old,v_private_other_new),
      v_private_freshness_anchor,
      v_private_freshness_block || v_private_freshness_anchor);
  v_list_fixed := pg_catalog.replace(pg_catalog.replace(
    pg_catalog.replace(v_list_source,
      v_list_latest_old,v_list_latest_new),
      v_list_candidate_old,v_list_candidate_new),
      v_list_remaining_old,v_list_remaining_new);
  IF pg_catalog.md5(v_private_fixed) <> '41487888c688c3280904d78772443b07'
     OR pg_catalog.md5(v_list_fixed) <> 'f0c26c4743874f680239a5b3d2f1ca38' THEN
    RAISE EXCEPTION 'sql155_phase2_rewrite_hash_mismatch';
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.teskeid_event_private_claim_scoped_v3(p_actor_id uuid, p_event_id uuid) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '',v_private_fixed
  );
  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.teskeid_event_list_scoped_participations_v3(p_actor_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '',v_list_fixed
  );
END;
$sql155_phase2$;

ALTER FUNCTION public.teskeid_event_private_claim_scoped_v3(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_scoped_participations_v3(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_leave_attendance(uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_leave_participation_v3(
  uuid,uuid,uuid,bigint,bigint,bigint,uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.teskeid_event_private_claim_scoped_v3(uuid,uuid),
  public.teskeid_event_private_cleanup_opt_out_email_targets_v3(text,uuid,uuid),
  public.teskeid_event_list_scoped_participations_v3(uuid),
  public.teskeid_event_leave_attendance(uuid,uuid,uuid),
  public.teskeid_event_leave_participation_v3(
    uuid,uuid,uuid,bigint,bigint,bigint,uuid
  ) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION
  public.teskeid_event_list_scoped_participations_v3(uuid),
  public.teskeid_event_leave_attendance(uuid,uuid,uuid),
  public.teskeid_event_leave_participation_v3(
    uuid,uuid,uuid,bigint,bigint,bigint,uuid
  ) TO service_role;

DO $sql155_postflight$
DECLARE
  v_expected record;
  v_oid oid;
BEGIN
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_private_claim_scoped_v3(uuid,uuid)',
        '41487888c688c3280904d78772443b07',false),
      ('public.teskeid_event_list_scoped_participations_v3(uuid)',
        'f0c26c4743874f680239a5b3d2f1ca38',true),
      ('public.teskeid_event_private_cleanup_opt_out_email_targets_v3(text,uuid,uuid)',
        'fcdbc2930ca742fa4452f20a83ce0114',false),
      ('public.teskeid_event_leave_attendance(uuid,uuid,uuid)',
        '5b4206f25cfeb04311fbbeab5ebc72da',true),
      ('public.teskeid_event_leave_participation_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)',
        'b2767b261eaa909d064c6f5fe4b737fd',true)
    ) AS expected(signature,source_md5,service_execute)
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_expected.signature);
    IF v_oid IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = procedure_row.proowner
      WHERE procedure_row.oid = v_oid
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc,E'\r\n',E'\n')) = v_expected.source_md5
        AND owner_role.rolname = 'postgres'
        AND procedure_row.prosecdef
        AND procedure_row.provolatile = 'v'
        AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
    ) OR pg_catalog.has_function_privilege(
      'service_role',v_expected.signature,'EXECUTE'
    ) IS DISTINCT FROM v_expected.service_execute
      OR pg_catalog.has_function_privilege(
        'anon',v_expected.signature,'EXECUTE')
      OR pg_catalog.has_function_privilege(
        'authenticated',v_expected.signature,'EXECUTE') THEN
      RAISE EXCEPTION 'sql155_postconditions_failed:%',v_expected.signature;
    END IF;
  END LOOP;
END;
$sql155_postflight$;

COMMIT;
