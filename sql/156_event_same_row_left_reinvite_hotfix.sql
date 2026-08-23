-- SQL156: same-row left-participant reinvite hotfix.
--
-- A claimed participant can remain bound to the canonical user after using
-- "Hætta þátttöku", while the legacy guest row intentionally remains
-- name-only.  Owner-side "Endurbjóða" therefore has no guest.linked_user_id
-- from which to derive the access-only recipient.  Permit that derivation
-- only from the exact same participation row when it is left, user-bound and
-- claimed.  Current confirmed auth email is locked by the public wrapper and
-- revalidated by the private creator.  Revoked or conflicting identities stay
-- closed.
--
-- Also stamp the invitation after the Event FOR UPDATE serialization point.
-- SQL155 freshness checks therefore follow actual Event-lock order instead of
-- transaction-start time.  No application rows are updated by installation;
-- no RLS, policy, table, trigger, index or broad grant changes are made.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_catalog.pg_advisory_xact_lock(15001);
SELECT pg_catalog.pg_advisory_xact_lock(15301);
SELECT pg_catalog.pg_advisory_xact_lock(15401);
SELECT pg_catalog.pg_advisory_xact_lock(15501);
SELECT pg_catalog.pg_advisory_xact_lock(15601);

DO $sql156$
DECLARE
  v_create_oid oid;
  v_invite_oid oid;
  v_create_source text;
  v_invite_source text;
  v_create_fixed text;
  v_invite_fixed text;
  v_create_declaration_old constant text := pg_catalog.replace($sql156_fragment$
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_email text := public.normalize_email_canonical(p_recipient_email);$sql156_fragment$, E'\r\n', E'\n');
  v_create_declaration_new constant text := pg_catalog.replace($sql156_fragment$
  v_guest public.teskeid_event_guests%ROWTYPE;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_effective_user_id uuid;
  v_created_at timestamptz;
  v_email text := public.normalize_email_canonical(p_recipient_email);$sql156_fragment$, E'\r\n', E'\n');
  v_create_eligibility_old constant text := pg_catalog.replace($sql156_fragment$
  IF (p_invitation_kind = 'access_only' AND v_guest.linked_user_id IS NULL)
     OR (
       p_invitation_kind = 'identity_and_access'
       AND v_guest.linked_user_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;
  IF p_invitation_kind = 'access_only' AND NOT EXISTS (
    SELECT 1 FROM auth.users AS recipient
    WHERE recipient.id = v_guest.linked_user_id
      AND recipient.email_confirmed_at IS NOT NULL
      AND public.normalize_email_canonical(recipient.email) = v_email
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;$sql156_fragment$, E'\r\n', E'\n');
  v_create_eligibility_new constant text := pg_catalog.replace($sql156_fragment$
  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
  FOR UPDATE;

  IF v_participation.access_state = 'revoked'
     OR (
       v_guest.linked_user_id IS NOT NULL
       AND v_participation.recipient_user_id IS NOT NULL
       AND v_participation.recipient_user_id IS DISTINCT FROM
         v_guest.linked_user_id
     )
     OR (
       v_participation.identity_claimed_at IS NOT NULL
       AND v_participation.recipient_user_id IS NULL
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;

  IF p_invitation_kind = 'access_only' THEN
    v_effective_user_id := CASE
      WHEN v_guest.linked_user_id IS NOT NULL
        THEN v_guest.linked_user_id
      WHEN v_participation.access_state = 'left'
        AND v_participation.recipient_user_id IS NOT NULL
        AND v_participation.identity_claimed_at IS NOT NULL
        THEN v_participation.recipient_user_id
      ELSE NULL
    END;
    IF v_effective_user_id IS NULL THEN
      RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
    END IF;
  ELSIF v_guest.linked_user_id IS NOT NULL
     OR v_participation.recipient_user_id IS NOT NULL
     OR v_participation.identity_claimed_at IS NOT NULL
     OR v_participation.access_state = 'left' THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  END IF;

  IF p_invitation_kind = 'access_only' AND NOT EXISTS (
    SELECT 1 FROM auth.users AS recipient
    WHERE recipient.id = v_effective_user_id
      AND recipient.email_confirmed_at IS NOT NULL
      AND public.normalize_email_canonical(recipient.email) = v_email
  ) THEN
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;$sql156_fragment$, E'\r\n', E'\n');
  v_create_insert_old constant text := pg_catalog.replace($sql156_fragment$
  INSERT INTO public.teskeid_event_guest_invitations (
    event_id, event_guest_id, invited_by, invitation_kind,
    recipient_email_canonical, recipient_label_snapshot,
    event_name_snapshot, guest_display_name_snapshot,
    inviter_display_name_snapshot
  ) VALUES (
    p_event_id, p_event_guest_id, p_actor_id, p_invitation_kind,
    v_email, public.teskeid_event_attendance_mask_email(v_email),
    v_event.name, v_safe_guest_label, v_inviter_name
  )$sql156_fragment$, E'\r\n', E'\n');
  v_create_insert_new constant text := pg_catalog.replace($sql156_fragment$
  v_created_at := pg_catalog.clock_timestamp();
  INSERT INTO public.teskeid_event_guest_invitations (
    event_id, event_guest_id, invited_by, invitation_kind,
    recipient_email_canonical, recipient_label_snapshot,
    event_name_snapshot, guest_display_name_snapshot,
    inviter_display_name_snapshot, expires_at, created_at, updated_at
  ) VALUES (
    p_event_id, p_event_guest_id, p_actor_id, p_invitation_kind,
    v_email, public.teskeid_event_attendance_mask_email(v_email),
    v_event.name, v_safe_guest_label, v_inviter_name,
    v_created_at + interval '30 days', v_created_at, v_created_at
  )$sql156_fragment$, E'\r\n', E'\n');
  v_invite_declaration_old constant text := pg_catalog.replace($sql156_fragment$
  v_probe_linked_user_id uuid;
  v_probe_source_kind text;
  v_probe_email text;
  v_linked_email_snapshot jsonb := '{}'::jsonb;$sql156_fragment$, E'\r\n', E'\n');
  v_invite_declaration_new constant text := pg_catalog.replace($sql156_fragment$
  v_probe_linked_user_id uuid;
  v_probe_source_kind text;
  v_probe_email text;
  v_probe_participation_user_id uuid;
  v_probe_participation_access_state text;
  v_probe_participation_claimed_at timestamptz;
  v_effective_user_id uuid;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_linked_email_snapshot jsonb := '{}'::jsonb;$sql156_fragment$, E'\r\n', E'\n');
  v_invite_probe_old constant text := pg_catalog.replace($sql156_fragment$
  SELECT guest.linked_user_id, guest.source_kind, guest.email_canonical
  INTO v_probe_linked_user_id, v_probe_source_kind, v_probe_email
  FROM public.teskeid_events AS event_row
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = event_row.id
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active';$sql156_fragment$, E'\r\n', E'\n');
  v_invite_probe_new constant text := pg_catalog.replace($sql156_fragment$
  SELECT guest.linked_user_id, guest.source_kind, guest.email_canonical,
    participation.recipient_user_id, participation.access_state,
    participation.identity_claimed_at
  INTO v_probe_linked_user_id, v_probe_source_kind, v_probe_email,
    v_probe_participation_user_id, v_probe_participation_access_state,
    v_probe_participation_claimed_at
  FROM public.teskeid_events AS event_row
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = event_row.id
  LEFT JOIN public.teskeid_event_participations AS participation
    ON participation.event_id = guest.event_id
   AND participation.event_guest_id = guest.id
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = p_actor_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active';$sql156_fragment$, E'\r\n', E'\n');
  v_invite_probe_locks_old constant text := pg_catalog.replace($sql156_fragment$
  IF v_probe_linked_user_id IS NULL THEN
    v_probe_email := CASE
      WHEN v_probe_source_kind = 'manual_email' THEN v_probe_email
      WHEN v_probe_source_kind = 'manual_name'
        THEN public.normalize_email_canonical(p_recipient_email)
      ELSE NULL
    END;
    IF v_probe_email IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_probe_email, 9702)
      );
    END IF;
  END IF;
  IF v_probe_linked_user_id IS NOT NULL THEN
    v_linked_email_snapshot :=
      public.teskeid_event_attendance_lock_user_emails(
        ARRAY[v_probe_linked_user_id]
      );
  END IF;$sql156_fragment$, E'\r\n', E'\n');
  v_invite_probe_locks_new constant text := pg_catalog.replace($sql156_fragment$
  v_effective_user_id := v_probe_linked_user_id;
  IF v_effective_user_id IS NULL
     AND v_probe_participation_access_state = 'left'
     AND v_probe_participation_user_id IS NOT NULL
     AND v_probe_participation_claimed_at IS NOT NULL THEN
    v_effective_user_id := v_probe_participation_user_id;
  END IF;
  IF v_effective_user_id IS NULL THEN
    v_probe_email := CASE
      WHEN v_probe_source_kind = 'manual_email' THEN v_probe_email
      WHEN v_probe_source_kind = 'manual_name'
        THEN public.normalize_email_canonical(p_recipient_email)
      ELSE NULL
    END;
    IF v_probe_email IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_probe_email, 9702)
      );
    END IF;
  ELSE
    v_linked_email_snapshot :=
      public.teskeid_event_attendance_lock_user_emails(
        ARRAY[v_effective_user_id]
      );
  END IF;$sql156_fragment$, E'\r\n', E'\n');
  v_invite_resolution_old constant text := pg_catalog.replace($sql156_fragment$
  IF v_guest.linked_user_id IS NOT NULL THEN
    IF v_guest.linked_user_id IS DISTINCT FROM v_probe_linked_user_id THEN
      RAISE EXCEPTION 'teskeid_event_roster_conflict';
    END IF;
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_linked_email_snapshot->>v_guest.linked_user_id::text;
    v_kind := 'access_only';
  ELSIF v_guest.source_kind = 'manual_email' THEN
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_guest.email_canonical;
    v_kind := 'identity_and_access';
  ELSIF v_guest.source_kind = 'manual_name' THEN
    v_email := public.normalize_email_canonical(p_recipient_email);
    v_kind := 'identity_and_access';
  ELSE
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;$sql156_fragment$, E'\r\n', E'\n');
  v_invite_resolution_new constant text := pg_catalog.replace($sql156_fragment$
  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
  FOR UPDATE;

  IF v_guest.linked_user_id IS NOT NULL THEN
    IF v_guest.linked_user_id IS DISTINCT FROM v_probe_linked_user_id THEN
      RAISE EXCEPTION 'teskeid_event_roster_conflict';
    END IF;
    IF v_participation.access_state = 'revoked'
       OR (
         v_participation.recipient_user_id IS NOT NULL
         AND v_participation.recipient_user_id IS DISTINCT FROM
           v_guest.linked_user_id
       )
       OR (
         v_participation.identity_claimed_at IS NOT NULL
         AND v_participation.recipient_user_id IS NULL
       ) THEN
      RAISE EXCEPTION 'teskeid_event_invitation_conflict';
    END IF;
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_linked_email_snapshot->>v_guest.linked_user_id::text;
    v_kind := 'access_only';
  ELSIF v_participation.access_state = 'left'
     AND v_participation.recipient_user_id IS NOT NULL
     AND v_participation.identity_claimed_at IS NOT NULL THEN
    IF v_probe_linked_user_id IS NOT NULL
       OR v_participation.recipient_user_id IS DISTINCT FROM
         v_probe_participation_user_id
       OR v_participation.access_state IS DISTINCT FROM
         v_probe_participation_access_state
       OR v_participation.identity_claimed_at IS DISTINCT FROM
         v_probe_participation_claimed_at THEN
      RAISE EXCEPTION 'teskeid_event_roster_conflict';
    END IF;
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_linked_email_snapshot
      ->>v_participation.recipient_user_id::text;
    v_kind := 'access_only';
  ELSIF v_participation.recipient_user_id IS NOT NULL
     OR v_participation.identity_claimed_at IS NOT NULL
     OR v_participation.access_state IN ('left', 'revoked') THEN
    RAISE EXCEPTION 'teskeid_event_invitation_conflict';
  ELSIF v_guest.source_kind = 'manual_email' THEN
    IF p_recipient_email IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_invalid_input';
    END IF;
    v_email := v_guest.email_canonical;
    v_kind := 'identity_and_access';
  ELSIF v_guest.source_kind = 'manual_name' THEN
    v_email := public.normalize_email_canonical(p_recipient_email);
    v_kind := 'identity_and_access';
  ELSE
    RAISE EXCEPTION 'teskeid_event_invitation_recipient_unavailable';
  END IF;$sql156_fragment$, E'\r\n', E'\n');
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql156_executor_mismatch';
  END IF;

  v_create_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)'
  );
  v_invite_oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)'
  );
  IF v_create_oid IS NULL OR v_invite_oid IS NULL THEN
    RAISE EXCEPTION 'sql156_predecessor_missing';
  END IF;
  IF EXISTS (
    WITH expected(signature, source_md5, service_execute) AS (VALUES
      ('public.teskeid_event_private_claim_scoped_v3(uuid,uuid)',
        '41487888c688c3280904d78772443b07',false),
      ('public.teskeid_event_list_scoped_participations_v3(uuid)',
        'f0c26c4743874f680239a5b3d2f1ca38',true),
      ('public.teskeid_event_leave_attendance(uuid,uuid,uuid)',
        '5b4206f25cfeb04311fbbeab5ebc72da',true),
      ('public.teskeid_event_leave_participation_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)',
        'b2767b261eaa909d064c6f5fe4b737fd',true),
      ('public.teskeid_event_private_cleanup_opt_out_email_targets_v3(text,uuid,uuid)',
        'fcdbc2930ca742fa4452f20a83ce0114',false)
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS procedure_row
      ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    WHERE procedure_row.oid IS NULL
       OR pg_catalog.md5(pg_catalog.replace(
         procedure_row.prosrc, E'\r\n', E'\n'
       )) <> expected.source_md5
       OR owner_role.rolname IS DISTINCT FROM 'postgres'
       OR NOT COALESCE(procedure_row.prosecdef, false)
       OR procedure_row.provolatile IS DISTINCT FROM 'v'
       OR procedure_row.proconfig IS DISTINCT FROM
         ARRAY['search_path=""']::text[]
       OR COALESCE(pg_catalog.has_function_privilege(
         'service_role', procedure_row.oid, 'EXECUTE'
       ), false) <> expected.service_execute
       OR COALESCE(pg_catalog.has_function_privilege(
         'anon', procedure_row.oid, 'EXECUTE'
       ), false)
       OR COALESCE(pg_catalog.has_function_privilege(
         'authenticated', procedure_row.oid, 'EXECUTE'
       ), false)
  ) THEN
    RAISE EXCEPTION 'sql156_sql155_predecessor_mismatch';
  END IF;
  IF EXISTS (
    WITH expected(signature,source_md5) AS (VALUES
      ('public.teskeid_event_private_guard_bound_invitation_v2()',
       '18c2e356417113e8e06cfc568f763713'),
      ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)',
       'ee8872c3b0d91786993e4ffbfb266293'),
      ('public.teskeid_event_private_v1_participation_bridge_v2()',
       'f2901d82fd392cd406a5dfbfc3173759'),
      ('public.teskeid_event_private_bump_generation_rsvp_v3()',
       '9f7c2be934e4e3db5be808e4b0800e42'),
      ('public.teskeid_event_private_sync_rsvp_v3()',
       '7126c130f7f17ad07d443a39d9aa57de'),
      ('public.teskeid_event_private_anchor_sync_v3()',
       'db82578fc700fc64590c0b1d65b0ab00')
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS procedure_row
      ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    WHERE procedure_row.oid IS NULL
       OR pg_catalog.md5(pg_catalog.replace(
         procedure_row.prosrc,E'\r\n',E'\n'
       )) <> expected.source_md5
       OR owner_role.rolname IS DISTINCT FROM 'postgres'
       OR NOT COALESCE(procedure_row.prosecdef,false)
       OR procedure_row.provolatile IS DISTINCT FROM 'v'
       OR procedure_row.proconfig IS DISTINCT FROM
         ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'sql156_helper_dependency_mismatch';
  END IF;
  IF EXISTS (
    WITH expected(
      trigger_name,relation_name,function_signature,trigger_type,
      is_deferrable,initially_deferred,update_columns,definition_md5
    ) AS (VALUES
      ('teskeid_event_guest_invitations_sql149_bound_guard',
       'public.teskeid_event_guest_invitations',
       'public.teskeid_event_private_guard_bound_invitation_v2()',
       23,false,false,ARRAY[]::text[],
       '4140321dd7400e9f0678e83519d1928b'),
      ('teskeid_event_guest_invitations_sql149_participation_deferred',
       'public.teskeid_event_guest_invitations',
       'public.teskeid_event_private_v1_participation_bridge_v2()',
       29,true,true,ARRAY[]::text[],
       'c64f7878dc0c9680b752f67cd3736547'),
      ('teskeid_event_participations_sql153_generation_rsvp_bump',
       'public.teskeid_event_participations',
       'public.teskeid_event_private_bump_generation_rsvp_v3()',
       19,false,false,ARRAY['identity_generation']::text[],
       '79dd9233e23f7c3ca18405df5c00f62b'),
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
    RAISE EXCEPTION 'sql156_trigger_boundary_mismatch';
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
    RAISE EXCEPTION 'sql156_unique_boundary_mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation_row.relowner
    WHERE relation_row.oid IN (
      pg_catalog.to_regclass('public.teskeid_events'),
      pg_catalog.to_regclass('public.teskeid_event_guests'),
      pg_catalog.to_regclass('public.teskeid_event_guest_invitations'),
      pg_catalog.to_regclass('public.teskeid_event_participations')
    )
      AND (
        owner_role.rolname <> 'postgres'
        OR NOT relation_row.relrowsecurity
        OR NOT relation_row.relforcerowsecurity
      )
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_class AS relation_row
    WHERE relation_row.oid IN (
      pg_catalog.to_regclass('public.teskeid_events'),
      pg_catalog.to_regclass('public.teskeid_event_guests'),
      pg_catalog.to_regclass('public.teskeid_event_guest_invitations'),
      pg_catalog.to_regclass('public.teskeid_event_participations')
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'sql156_relation_security_mismatch';
  END IF;
  IF NOT COALESCE((
    SELECT pg_catalog.count(*) = 3 AND pg_catalog.bool_and(
      attribute_row.attnotnull
      AND pg_catalog.format_type(
        attribute_row.atttypid, attribute_row.atttypmod
      ) = 'timestamp with time zone'
      AND pg_catalog.regexp_replace(pg_catalog.lower(
        pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid
        )
      ), '[()[:space:]]|::interval', '', 'g') = CASE attribute_row.attname
        WHEN 'expires_at' THEN 'now+''30days'''
        ELSE 'now'
      END
    )
    FROM pg_catalog.pg_attribute AS attribute_row
    JOIN pg_catalog.pg_attrdef AS default_row
      ON default_row.adrelid = attribute_row.attrelid
     AND default_row.adnum = attribute_row.attnum
    WHERE attribute_row.attrelid = pg_catalog.to_regclass(
        'public.teskeid_event_guest_invitations'
      )
      AND attribute_row.attname IN (
        'expires_at', 'created_at', 'updated_at'
      )
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
  ), false) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
        'public.teskeid_event_guest_invitations'
      )
      AND constraint_row.conname =
        'teskeid_event_guest_invitations_expiry_check'
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
      AND NOT constraint_row.connoinherit
      AND pg_catalog.regexp_replace(pg_catalog.lower(
        pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid
        )
      ), '[()[:space:]]', '', 'g') = 'expires_at>created_at'
  ) THEN
    RAISE EXCEPTION 'sql156_invitation_time_shape_mismatch';
  END IF;

  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_create_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = v_create_oid;
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_invite_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = v_invite_oid;

  IF pg_catalog.md5(v_create_source) = '98031fa21f1f710a8df822849edf80c5'
     AND pg_catalog.md5(v_invite_source) = '1120d176c335185f258d8ef824ef1f05' THEN
    RETURN;
  END IF;
  IF pg_catalog.md5(v_create_source) <>
       '68881d52023265e7edd893f727a16381'
     OR pg_catalog.md5(v_invite_source) <>
       '23eea91f0b5ec29c50b3615c9cadcdfe' THEN
    RAISE EXCEPTION 'sql156_predecessor_body_mismatch';
  END IF;

  IF (
    pg_catalog.length(v_create_source)
      - pg_catalog.length(pg_catalog.replace(
        v_create_source, v_create_declaration_old, ''
      ))
  ) <> pg_catalog.length(v_create_declaration_old)
  OR (
    pg_catalog.length(v_create_source)
      - pg_catalog.length(pg_catalog.replace(
        v_create_source, v_create_eligibility_old, ''
      ))
  ) <> pg_catalog.length(v_create_eligibility_old)
  OR (
    pg_catalog.length(v_create_source)
      - pg_catalog.length(pg_catalog.replace(
        v_create_source, v_create_insert_old, ''
      ))
  ) <> pg_catalog.length(v_create_insert_old) THEN
    RAISE EXCEPTION 'sql156_create_fragment_count_mismatch';
  END IF;
  IF (
    pg_catalog.length(v_invite_source)
      - pg_catalog.length(pg_catalog.replace(
        v_invite_source, v_invite_declaration_old, ''
      ))
  ) <> pg_catalog.length(v_invite_declaration_old)
  OR (
    pg_catalog.length(v_invite_source)
      - pg_catalog.length(pg_catalog.replace(
        v_invite_source, v_invite_probe_old, ''
      ))
  ) <> pg_catalog.length(v_invite_probe_old)
  OR (
    pg_catalog.length(v_invite_source)
      - pg_catalog.length(pg_catalog.replace(
        v_invite_source, v_invite_probe_locks_old, ''
      ))
  ) <> pg_catalog.length(v_invite_probe_locks_old)
  OR (
    pg_catalog.length(v_invite_source)
      - pg_catalog.length(pg_catalog.replace(
        v_invite_source, v_invite_resolution_old, ''
      ))
  ) <> pg_catalog.length(v_invite_resolution_old) THEN
    RAISE EXCEPTION 'sql156_invite_fragment_count_mismatch';
  END IF;

  v_create_fixed := pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.replace(
        v_create_source,
        v_create_declaration_old, v_create_declaration_new
      ),
      v_create_eligibility_old, v_create_eligibility_new
    ),
    v_create_insert_old, v_create_insert_new
  );
  v_invite_fixed := pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(
          v_invite_source,
          v_invite_declaration_old, v_invite_declaration_new
        ),
        v_invite_probe_old, v_invite_probe_new
      ),
      v_invite_probe_locks_old, v_invite_probe_locks_new
    ),
    v_invite_resolution_old, v_invite_resolution_new
  );
  IF pg_catalog.md5(v_create_fixed) <> '98031fa21f1f710a8df822849edf80c5'
     OR pg_catalog.md5(v_invite_fixed) <> '1120d176c335185f258d8ef824ef1f05' THEN
    RAISE EXCEPTION 'sql156_rewrite_hash_mismatch';
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.teskeid_event_attendance_create_pending(p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_recipient_email text, p_invitation_kind text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '', v_create_fixed
  );
  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.teskeid_event_invite_guest_attendance(p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_expected_roster_revision bigint, p_request_id uuid, p_recipient_email text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '', v_invite_fixed
  );
END;
$sql156$;

ALTER FUNCTION public.teskeid_event_attendance_create_pending(
  uuid,uuid,uuid,text,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_invite_guest_attendance(
  uuid,uuid,uuid,bigint,uuid,text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.teskeid_event_invite_guest_attendance(
    uuid,uuid,uuid,bigint,uuid,text
  ) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.teskeid_event_invite_guest_attendance(
    uuid,uuid,uuid,bigint,uuid,text
  ) TO service_role;

DO $sql156_postflight$
DECLARE
  v_create_source text;
  v_invite_source text;
BEGIN
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_create_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)'
  );
  SELECT pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n')
  INTO v_invite_source
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)'
  );
  IF pg_catalog.md5(v_create_source) <> '98031fa21f1f710a8df822849edf80c5'
     OR pg_catalog.md5(v_invite_source) <> '1120d176c335185f258d8ef824ef1f05'
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure_row
       JOIN pg_catalog.pg_roles AS owner_role
         ON owner_role.oid = procedure_row.proowner
       JOIN pg_catalog.pg_language AS language_row
         ON language_row.oid = procedure_row.prolang
       WHERE procedure_row.oid IN (
         pg_catalog.to_regprocedure(
           'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)'
         ),
         pg_catalog.to_regprocedure(
           'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)'
         )
       )
       AND (
         owner_role.rolname <> 'postgres'
         OR language_row.lanname <> 'plpgsql'
         OR procedure_row.prokind <> 'f'
         OR procedure_row.prorettype <> 'jsonb'::pg_catalog.regtype
         OR NOT procedure_row.prosecdef
         OR procedure_row.provolatile <> 'v'
         OR procedure_row.proisstrict
         OR procedure_row.proleakproof
         OR procedure_row.proparallel <> 'u'
         OR procedure_row.proconfig IS DISTINCT FROM
           ARRAY['search_path=""']::text[]
       )
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'sql156_postconditions_failed';
  END IF;
END;
$sql156_postflight$;

COMMIT;
