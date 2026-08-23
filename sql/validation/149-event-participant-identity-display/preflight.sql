-- Read-only SQL149 preflight. Every boolean and prerequisites_ok must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH protected_direct(
  signature, exact_arguments, return_type, volatility,
  service_execute, expected_md5
) AS (
  VALUES
    ('public.teskeid_event_assert_actor(uuid)', 'p_actor_id uuid',
      'void', 's', false,
      '9dd7c34f6cc6c78131e7ebbb9a718ea4'),
    ('public.teskeid_event_uuid_from_text(text)', 'p_value text',
      'uuid', 'i', false,
      '27229cbc71c621e5a8592265b07f874d'),
    ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)',
      'p_source_kind text, p_display_name_snapshot text, p_linked_user_id uuid',
      'text', 's', false,
      '2377be525ed29f2d4bc26d453fa8cf51'),
    ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)',
      'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb',
      'jsonb', 'v', true,
      '0022e19d8853709247583b7ddb38ef45'),
    ('public.expense_prepare_account_deletion(uuid)',
      'p_user_id uuid', 'jsonb', 'v', true,
      '0562edbfaa608cead23d23d49ec36a66'),
    ('public.teskeid_event_get_expense_source(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid', 'jsonb', 's', true,
      '3d01501bdb03f0f6bca83e0817688006'),
    ('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)',
      'p_actor_id uuid, p_group_id uuid, p_member_id uuid, p_target_user_id uuid, p_proof_kind text, p_relationship_id uuid, p_event_id uuid, p_event_participant_id uuid, p_cancel_pending_invitations boolean',
      'bigint', 'v', false,
      '819b2e024aac1e00c7e14145b0d6b373'),
    ('public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)',
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_expected_financial_version bigint',
      'jsonb', 'v', true,
      '7e6426c8e43efa3bb7d725bf6b1c807c'),
    ('public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)',
      'p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer',
      'jsonb', 's', true,
      'a31fc1caa0cf009e4daad9c3e3ed1875'),
    ('public.teskeid_event_get_person_source_roster_v1(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid', 'jsonb', 's', true,
      'ae418825a7d7f8ebe056272dde9448fd')
), protected_direct_check AS (
  SELECT pg_catalog.count(procedure_row.oid) = 10
    AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = expected.expected_md5
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prosecdef
      AND procedure_row.prokind = 'f'
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = expected.volatility::"char"
      AND procedure_row.proparallel = 'u'
      AND procedure_row.prorettype =
        pg_catalog.to_regtype(expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = expected.service_execute
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND (
               NOT expected.service_execute
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      )
    ) AS protected_direct_exact_ok
  FROM protected_direct AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), protected_additional(
  signature, exact_arguments, return_type, volatility,
  security_definer, is_strict, parallel_safety, service_execute, expected_md5
) AS (
  VALUES
    ('public.normalize_email_canonical(text)', 'p_email text',
      'text','i',false,true,'s',true,
      '3083103976aa8cb3780937b9da1be236'),
    ('public.teskeid_event_normalize_text(text)', 'p_value text',
      'text','i',true,false,'u',false,
      'ced5cfb2427fe7331f4416497614f7d1'),
    ('public.teskeid_event_valid_text(text,integer,integer)',
      'p_value text, p_minimum integer, p_maximum integer',
      'boolean','i',true,false,'u',false,
      '28c80b083a90683f15fd04f4d7d547d1'),
    ('public.teskeid_event_assert_financial_actor(uuid)', 'p_actor_id uuid',
      'void','s',true,false,'u',false,
      '7f6ced4f5e7472aff27d9a6d5c624355'),
    ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)',
      'p_invitation_ids uuid[], p_status text',
      'integer','v',true,false,'u',false,
      'a2a85bca2a456177ab67b7817dc6e19d'),
    ('public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)',
      'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text',
      'jsonb','v',true,false,'u',true,
      '3e1b846ec2a4540e6ee51becb2590ec2')
), protected_additional_check AS (
  SELECT pg_catalog.count(procedure_row.oid) = 6
    AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = expected.expected_md5
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef = expected.security_definer
      AND procedure_row.proisstrict = expected.is_strict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = expected.volatility::"char"
      AND procedure_row.proparallel = expected.parallel_safety::"char"
      AND procedure_row.prorettype =
        pg_catalog.to_regtype(expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = expected.service_execute
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND (
               NOT expected.service_execute
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      )
    ) AS protected_additional_exact_ok
  FROM protected_additional AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), protected_sql147(
  signature, exact_arguments, return_type, service_execute, expected_md5
) AS (
  VALUES
    ('public.teskeid_event_list_for_actor(uuid)',
      'p_actor_id uuid', 'jsonb', true,
      '4ccf01e6251a7e7ee187fcba21a88c36'),
    ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)',
      'p_actor_id uuid, p_invitation_id uuid', 'jsonb', true,
      'e268003d1f916f6a987e8d47dbef5971'),
    ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)',
      'p_actor_id uuid, p_invitation_id uuid, p_action text, p_request_id uuid',
      'jsonb', true,
      '45bab121e346e77fa4a4035b7cf88f16'),
    ('public.teskeid_event_list_my_pending_invitations(uuid)',
      'p_actor_id uuid', 'jsonb', true,
      '295ca440e9caa334986f664ce2bc7398')
), protected_sql147_check AS (
  SELECT pg_catalog.count(procedure_row.oid) = 4
    AND pg_catalog.bool_and(
      pg_catalog.md5(pg_catalog.replace(
        pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'),
        '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY' || E'\n', ''
      )) = expected.expected_md5
      AND owner_role.rolname = 'postgres'
      AND procedure_row.prosecdef
      AND procedure_row.prokind = 'f'
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proparallel = 'u'
      AND procedure_row.prorettype =
        pg_catalog.to_regtype(expected.return_type)
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        expected.return_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        expected.exact_arguments
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND pg_catalog.has_function_privilege(
        'service_role', procedure_row.oid, 'EXECUTE'
      ) = expected.service_execute
      AND NOT pg_catalog.has_function_privilege(
        'anon', procedure_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', procedure_row.oid, 'EXECUTE'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             privilege.grantee <> procedure_row.proowner
             AND (
               NOT expected.service_execute
               OR grantee.rolname IS DISTINCT FROM 'service_role'
             )
           )
      )
    ) AS protected_sql147_exact_ok
  FROM protected_sql147 AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
), relation_check AS (
  SELECT
    pg_catalog.to_regclass('auth.users') IS NOT NULL
      AND pg_catalog.to_regclass('public.profiles') IS NOT NULL
      AND pg_catalog.to_regclass('public.relationships') IS NOT NULL
      AND pg_catalog.to_regclass('public.relationship_tags') IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.relationship_label_definitions'
      ) IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.relationship_label_assignments'
      ) IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_events') IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_guests') IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_guest_invitations'
      ) IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_attendance_memberships'
      ) IS NOT NULL
      AND pg_catalog.to_regclass('public.teskeid_event_details') IS NOT NULL
      AS relations_ok
), dependency_check AS (
  SELECT
    pg_catalog.to_regprocedure(
      'public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.teskeid_event_attendance_terminalize_invitations(uuid[],text)'
      ) IS NOT NULL
      AS dependency_functions_ok,
    pg_catalog.to_regclass(
      'public.teskeid_event_guests_active_position_uidx'
    ) IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_guest_invitations_pending_guest_uidx'
      ) IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_guest_invitations_pending_email_uidx'
      ) IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_attendance_memberships_guest_uidx'
      ) IS NOT NULL
      AS supporting_indexes_ok
), rls_check AS (
  SELECT pg_catalog.count(*) = 4 AND pg_catalog.bool_and(
    class_row.relrowsecurity AND class_row.relforcerowsecurity
  ) AS rls_posture_ok
  FROM (VALUES
    ('public.teskeid_events'),
    ('public.teskeid_event_guests'),
    ('public.teskeid_event_guest_invitations'),
    ('public.teskeid_event_attendance_memberships')
  ) AS expected(signature)
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass(expected.signature)
), target_check AS (
  SELECT
    pg_catalog.to_regclass('public.teskeid_event_person_labels') IS NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_participations'
      ) IS NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_participation_mutation_requests'
      ) IS NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_participation_invitation_terminalizations'
      ) IS NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_guest_invitations_sql149_identity_uidx'
      ) IS NULL
      AND pg_catalog.to_regclass(
        'public.teskeid_event_v1_bridge_observation_seq'
      ) IS NULL AS target_relations_clear,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = procedure_row.pronamespace
      WHERE namespace_row.nspname = 'public'
        AND procedure_row.proname = ANY(ARRAY[
          'teskeid_event_private_normalize_shared_name_v2',
          'teskeid_event_private_format_utc_timestamp_v2',
          'teskeid_event_private_valid_shared_name_v2',
          'teskeid_event_private_valid_canonical_email_v2',
          'teskeid_event_private_begin_participation_request_v2',
          'teskeid_event_private_finish_participation_request_v2',
          'teskeid_event_private_guard_participation_request_v2',
          'teskeid_event_private_ensure_person_v2',
          'teskeid_event_private_expire_bound_invitations_v2',
          'teskeid_event_private_guard_bound_invitation_v2',
          'teskeid_event_private_auth_email_invitations_v2',
          'teskeid_event_private_participation_unlink_v2',
          'teskeid_event_private_auth_delete_participations_v2',
          'teskeid_event_private_apply_participation_v2',
          'teskeid_event_private_v1_participation_bridge_v2',
          'teskeid_event_private_claim_participations_v2',
          'teskeid_event_private_assert_viewer_v2',
          'teskeid_event_private_safe_profile_name_v2',
          'teskeid_event_private_viewer_relationship_v2',
          'teskeid_event_private_person_projection_v2',
          'teskeid_event_private_organizer_projection_v2',
          'teskeid_event_private_people_projection_v2',
          'teskeid_event_list_for_actor_v2',
          'teskeid_event_get_actor_view_v2',
          'teskeid_event_get_roster_management_v2',
          'teskeid_event_list_person_source_events_v2',
          'teskeid_event_get_person_source_roster_v2',
          'teskeid_event_private_legacy_person_v2',
          'teskeid_event_private_legacy_people_v2',
          'teskeid_event_list_legacy_expense_sources_v2',
          'teskeid_event_get_legacy_expense_source_v2',
          'teskeid_event_private_canonical_roster_input_v2',
          'teskeid_event_private_legacy_roster_input_v2',
          'teskeid_event_create_with_details_and_participations_v2',
          'teskeid_event_replace_roster_with_participations_v2',
          'teskeid_event_repair_person_label_v2',
          'teskeid_event_set_rsvp_v2'
        ])
    ) AS target_functions_clear,
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgname LIKE '%sql149%'
         OR trigger_row.tgname IN (
           'teskeid_event_participation_requests_mutation_guard',
           'teskeid_event_participations_account_unlink'
         )
    ) AS target_triggers_clear
), derived_identity AS (
  SELECT guest.event_id, guest.id AS event_guest_id, guest.status,
    guest.source_kind, guest.email_canonical,
    COALESCE(
      membership.user_id,
      CASE WHEN invitation.status IN ('accepted', 'left', 'revoked')
        THEN invitation.accepted_user_id ELSE NULL END,
      guest.linked_user_id
    ) AS recipient_user_id,
    invitation.status AS invitation_status,
    invitation.recipient_email_canonical AS invitation_email
  FROM public.teskeid_event_guests AS guest
  LEFT JOIN LATERAL (
    SELECT membership.user_id
    FROM public.teskeid_event_attendance_memberships AS membership
    WHERE membership.event_id = guest.event_id
      AND membership.event_guest_id = guest.id
    ORDER BY membership.accepted_at DESC, membership.user_id
    LIMIT 1
  ) AS membership ON true
  LEFT JOIN LATERAL (
    SELECT invitation.status, invitation.recipient_email_canonical,
      invitation.accepted_user_id
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.event_id = guest.event_id
      AND invitation.event_guest_id = guest.id
    ORDER BY invitation.created_at DESC, invitation.id DESC
    LIMIT 1
  ) AS invitation ON true
), derived_targets AS (
  SELECT derived.event_id, derived.event_guest_id,
    derived.status AS guest_status,
    derived.recipient_user_id,
    CASE
      WHEN derived.recipient_user_id IS NOT NULL THEN NULL
      WHEN derived.status = 'removed'
        OR derived.invitation_status IN ('cancelled', 'revoked', 'left')
        THEN NULL
      WHEN derived.invitation_status = 'pending'
        THEN derived.invitation_email
      WHEN derived.source_kind = 'manual_email'
        THEN derived.email_canonical
      ELSE NULL
    END AS recipient_email_canonical,
    CASE
      WHEN derived.status = 'removed' THEN 'revoked'
      WHEN derived.recipient_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.teskeid_event_attendance_memberships AS membership
          WHERE membership.event_id = derived.event_id
            AND membership.event_guest_id = derived.event_guest_id
        ) THEN 'active'
      WHEN derived.invitation_status = 'left' THEN 'left'
      WHEN derived.invitation_status IN ('revoked', 'cancelled')
        THEN 'revoked'
      ELSE 'active'
    END AS access_state
  FROM derived_identity AS derived
), source_data AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.teskeid_event_guests)
      AS guest_backfill_count,
    (SELECT pg_catalog.count(*)
      FROM public.teskeid_event_guests AS guest
      WHERE guest.source_kind = 'manual_email'
        AND guest.linked_user_id IS NULL) AS manual_email_label_repair_count,
    (SELECT pg_catalog.count(*)
      FROM public.teskeid_events AS event_row
      LEFT JOIN public.teskeid_event_details AS details
        ON details.event_id = event_row.id
      WHERE NOT pg_catalog.isfinite(event_row.created_at)
         OR event_row.created_at NOT BETWEEN
           timestamptz '0001-01-01 00:00:00+00'
           AND timestamptz '9999-12-31 23:59:59.999999+00'
         OR NOT pg_catalog.isfinite(event_row.updated_at)
         OR event_row.updated_at NOT BETWEEN
           timestamptz '0001-01-01 00:00:00+00'
           AND timestamptz '9999-12-31 23:59:59.999999+00'
         OR (details.event_date IS NOT NULL
           AND (
             NOT pg_catalog.isfinite(details.event_date)
             OR details.event_date NOT BETWEEN
               date '0001-01-01' AND date '9999-12-31'
           ))
         OR (details.event_time IS NOT NULL AND (
           details.event_time >= time '24:00:00'
           OR details.event_time IS DISTINCT FROM details.event_time::time(0)
         ))
    ) AS invalid_event_temporal_count,
    (SELECT pg_catalog.count(*)
      FROM public.teskeid_events AS event_row
      LEFT JOIN public.teskeid_event_details AS details
        ON details.event_id = event_row.id
      CROSS JOIN LATERAL (
        SELECT
          pg_catalog.normalize(pg_catalog.regexp_replace(
            event_row.name,
            U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
            '', 'g'
          )) AS event_name,
          NULLIF(pg_catalog.normalize(pg_catalog.regexp_replace(
            pg_catalog.replace(pg_catalog.replace(
              details.description, E'\r\n', E'\n'
            ), E'\r', E'\n'),
            U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
            '', 'g'
          )), '') AS description,
          NULLIF(pg_catalog.normalize(pg_catalog.regexp_replace(
            pg_catalog.replace(pg_catalog.replace(
              details.agenda, E'\r\n', E'\n'
            ), E'\r', E'\n'),
            U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
            '', 'g'
          )), '') AS agenda
      ) AS normalized
      WHERE NOT public.teskeid_event_valid_text(
          normalized.event_name, 1, 160
        )
         OR (normalized.description IS NOT NULL AND (
           pg_catalog.char_length(normalized.description) > 2000
           OR pg_catalog.replace(normalized.description, E'\n', '')
             ~ '[[:cntrl:]]'
           OR normalized.description
             ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
         ))
         OR (normalized.agenda IS NOT NULL AND (
           pg_catalog.char_length(normalized.agenda) > 4000
           OR pg_catalog.replace(normalized.agenda, E'\n', '')
             ~ '[[:cntrl:]]'
           OR normalized.agenda
             ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
         ))
    ) AS invalid_event_text_projection_count,
    (SELECT pg_catalog.count(*)
      FROM public.teskeid_event_guests AS guest
      JOIN LATERAL (
        SELECT invitation.invitation_kind
        FROM public.teskeid_event_guest_invitations AS invitation
        WHERE invitation.event_id = guest.event_id
          AND invitation.event_guest_id = guest.id
          AND invitation.status = 'pending'
        ORDER BY invitation.created_at DESC, invitation.id DESC
        LIMIT 1
      ) AS pending_invitation ON true
      WHERE pending_invitation.invitation_kind = 'identity_and_access'
        AND (
          guest.linked_user_id IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM public.teskeid_event_attendance_memberships AS membership
            WHERE membership.event_id = guest.event_id
              AND membership.event_guest_id = guest.id
          )
        )
    ) AS bound_identity_pending_invitation_count,
    (SELECT pg_catalog.count(*)
      FROM derived_targets AS target
      JOIN public.teskeid_events AS event_row
        ON event_row.id = target.event_id
      LEFT JOIN auth.users AS owner_account
        ON owner_account.id = event_row.owner_user_id
      WHERE target.guest_status = 'active'
        AND (
          target.recipient_user_id = event_row.owner_user_id
          OR (
            target.access_state = 'active'
            AND target.recipient_user_id IS NULL
            AND
            owner_account.email_confirmed_at IS NOT NULL
            AND target.recipient_email_canonical =
              public.normalize_email_canonical(owner_account.email)
          )
        )) AS owner_self_collision_count,
    (SELECT pg_catalog.count(*)
      FROM (
        SELECT target.event_id, target.recipient_user_id
        FROM derived_targets AS target
        WHERE target.access_state = 'active'
          AND target.recipient_user_id IS NOT NULL
        GROUP BY target.event_id, target.recipient_user_id
        HAVING pg_catalog.count(*) > 1
      ) AS duplicate_group
    ) AS derived_active_user_duplicate_group_count,
    (SELECT pg_catalog.count(*)
      FROM (
        SELECT target.event_id, target.recipient_email_canonical
        FROM derived_targets AS target
        WHERE target.access_state = 'active'
          AND target.recipient_user_id IS NULL
          AND target.recipient_email_canonical IS NOT NULL
        GROUP BY target.event_id, target.recipient_email_canonical
        HAVING pg_catalog.count(*) > 1
      ) AS duplicate_group
    ) AS derived_active_email_duplicate_group_count,
    (SELECT pg_catalog.count(*)
      FROM derived_targets AS target
      WHERE target.access_state = 'active'
        AND target.recipient_user_id IS NULL
        AND target.recipient_email_canonical IS NOT NULL
        AND NOT COALESCE(
          pg_catalog.char_length(target.recipient_email_canonical)
            BETWEEN 3 AND 320
          AND public.normalize_email_canonical(
            target.recipient_email_canonical
          ) = target.recipient_email_canonical
          AND target.recipient_email_canonical
            ~ '^(?!\.)(?!.*\.\.)([A-Za-z0-9_''+\-\.]*)[A-Za-z0-9_+\-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$',
          false
        )
    ) AS invalid_active_unbound_email_count,
    NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_guests AS guest
      WHERE guest.status NOT IN ('active', 'removed')
         OR guest.source_kind NOT IN (
           'relationship', 'manual_name', 'manual_email'
         )
    ) AS source_data_ok
), checks AS (
  SELECT
    current_database() AS database_name,
    current_user AS database_user,
    pg_catalog.now() AS checked_at,
    pg_catalog.current_setting('server_version_num')::integer >= 150000
      AS server_version_ok,
    current_user IN ('postgres', 'supabase_admin') AS executor_ok,
    relation_check.*,
    dependency_check.*,
    rls_check.*,
    target_check.*,
    protected_direct_check.*,
    protected_additional_check.*,
    protected_sql147_check.*,
    source_data.*
  FROM relation_check
  CROSS JOIN dependency_check
  CROSS JOIN rls_check
  CROSS JOIN target_check
  CROSS JOIN protected_direct_check
  CROSS JOIN protected_additional_check
  CROSS JOIN protected_sql147_check
  CROSS JOIN source_data
)
SELECT checks.*,
  checks.server_version_ok
    AND checks.executor_ok
    AND checks.relations_ok
    AND checks.dependency_functions_ok
    AND checks.supporting_indexes_ok
    AND checks.rls_posture_ok
    AND checks.target_relations_clear
    AND checks.target_functions_clear
    AND checks.target_triggers_clear
    AND checks.protected_direct_exact_ok
    AND checks.protected_additional_exact_ok
    AND checks.protected_sql147_exact_ok
    AND checks.source_data_ok
    AND checks.owner_self_collision_count = 0
    AND checks.invalid_event_temporal_count = 0
    AND checks.invalid_event_text_projection_count = 0
    AND checks.bound_identity_pending_invitation_count = 0
    AND checks.derived_active_user_duplicate_group_count = 0
    AND checks.derived_active_email_duplicate_group_count = 0
    AND checks.invalid_active_unbound_email_count = 0
    AS prerequisites_ok
FROM checks;

ROLLBACK;
