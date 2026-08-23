-- SQL153: opt-out Event access for exact active participants.
--
-- Adds a generation-bound four-state RSVP authority, a durable invitation
-- generation anchor, scoped reads and explicit self-leave.  SQL149-152 remain
-- byte-exact.  The one replaced predecessor is the public SQL149 RSVP v2 RPC;
-- its signature/result compatibility is retained while the considering ->
-- legacy no_response mirror no-op is closed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'teskeid:sql149:event-participant-identity-display', 14901
  )
);
SELECT pg_catalog.pg_advisory_xact_lock(15001);
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'teskeid:sql153:event-opt-out-scoped-participant-access', 15301
  )
);

DO $sql153_prerequisites$
DECLARE
  v_expected record;
  v_oid oid;
  v_source_md5 text;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'sql153_server_version_mismatch';
  END IF;
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql153_executor_mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('teskeid_event_participation_rsvp_v3'),
      ('teskeid_event_participation_invitation_generations_v3'),
      ('teskeid_event_participation_mutation_requests_v3'),
      ('teskeid_event_sql153_install_baseline'),
      ('teskeid_event_participation_rsvp_v3_pkey'),
      ('teskeid_event_participation_rsvp_v3_current_key'),
      ('teskeid_event_participation_invitation_gen_v3_pkey'),
      ('teskeid_event_participation_invitation_gen_v3_current_key'),
      ('teskeid_event_participation_requests_v3_pkey'),
      ('teskeid_event_participation_requests_v3_created_idx'),
      ('teskeid_event_sql153_install_baseline_pkey')
    ) AS target(name)
    WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL
  ) OR pg_catalog.to_regclass(
    'public.teskeid_event_sql153_write_observation_seq'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'sql153_targets_not_clear';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS catalog_object
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid=catalog_object.relnamespace
    WHERE namespace_row.nspname='public'
      AND (catalog_object.relname LIKE '%sql153%'
        OR catalog_object.relname LIKE 'teskeid_event%v3')
  ) THEN
    RAISE EXCEPTION 'sql153_targets_not_clear';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND procedure_row.proname LIKE 'teskeid_event%v3'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE NOT trigger_row.tgisinternal
      AND (trigger_row.tgname LIKE '%sql153%'
        OR trigger_row.tgname=ANY(ARRAY[
          'teskeid_event_participation_requests_v3_guard',
          'teskeid_event_rsvp_v3_integrity_deferred'
        ]::name[]))
  ) THEN
    RAISE EXCEPTION 'sql153_targets_not_clear';
  END IF;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_has_access(uuid)',
       'p_user_id uuid','boolean','sql','s',true,false,'u',
       '7b69311a107381a1891da01c32780f5f', false),
      ('public.teskeid_event_assert_actor(uuid)',
       'p_actor_id uuid','void','plpgsql','s',true,false,'u',
       '9dd7c34f6cc6c78131e7ebbb9a718ea4', false),
      ('public.teskeid_event_assert_session_actor(uuid)',
       'p_actor_id uuid','void','plpgsql','s',true,false,'u',
       '30238c0def94d573fd8265fd94da0757', false),
      ('public.teskeid_event_guard_event_update()',
       '','trigger','plpgsql','v',true,false,'u',
       'd536d617b6bc13a556c39ad2ec0948e7', false),
      ('public.normalize_email_canonical(text)',
       'p_email text','text','sql','i',false,true,'s',
       '3083103976aa8cb3780937b9da1be236', true),
      ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)',
       'p_invitation_ids uuid[], p_status text','integer','plpgsql','v',true,false,'u',
       'a2a85bca2a456177ab67b7817dc6e19d', false),
      ('public.teskeid_event_attendance_mask_email(text)',
       'p_email text','text','plpgsql','i',true,false,'u',
       '9eb6ce4530f4c816d4cc0c35ec022110',false),
      ('public.teskeid_event_attendance_lock_user_emails(uuid[])',
       'p_user_ids uuid[]','jsonb','plpgsql','v',true,false,'u',
       'a746f7835eba9f759e6ae8af0d51f46f',false),
      ('public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_recipient_email text, p_invitation_kind text',
       'jsonb','plpgsql','v',true,false,'u',
       '68881d52023265e7edd893f727a16381',false),
      ('public.teskeid_event_normalize_text(text)',
       'p_value text','text','sql','i',true,false,'u',
       'ced5cfb2427fe7331f4416497614f7d1',false),
      ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)',
       'p_source_kind text, p_display_name_snapshot text, p_linked_user_id uuid',
       'text','plpgsql','s',true,false,'u',
       '2377be525ed29f2d4bc26d453fa8cf51',false),
      ('public.teskeid_event_attendance_sweep_expired(integer,uuid)',
       'p_limit integer, p_exclude_invitation_id uuid','integer','plpgsql','v',
       true,false,'u','087ba1156dd8f01f25673dc6b11dd21b',false),
      ('public.teskeid_event_attendance_begin_response_request(uuid,uuid,text,text)',
       'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text',
       'jsonb','plpgsql','v',true,false,'u',
       '004d1a7505bf9eb03b9f06e1a265aed6',false),
      ('public.teskeid_event_attendance_finish_response_request(uuid,uuid,jsonb)',
       'p_actor_id uuid, p_request_id uuid, p_result jsonb',
       'void','plpgsql','v',true,false,'u',
       '3d9b5a2dc3cb0806802b48739169cb52',false),
      ('public.teskeid_event_assert_financial_actor(uuid)',
       'p_actor_id uuid','void','plpgsql','s',true,false,'u',
       '7f6ced4f5e7472aff27d9a6d5c624355',false),
      ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)',
       'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text, p_require_expenses boolean',
       'jsonb','plpgsql','v',true,false,'u',
       '4e70b62a5fa28cfe2b884d703935a16c',false),
      ('public.teskeid_event_finish_request(uuid,uuid,jsonb)',
       'p_actor_id uuid, p_request_id uuid, p_result jsonb',
       'void','plpgsql','v',true,false,'u',
       'eaa006157dc5377e0ae1f8979651f8aa',false),
      ('public.teskeid_event_assert_roster(uuid)',
       'p_event_id uuid','void','plpgsql','v',true,false,'u',
       '644432e94fb9b27e434403d84d32db4b',false),
      ('public.teskeid_event_roster_integrity_trigger()',
       '','trigger','plpgsql','v',true,false,'u',
       'e3f28f3ef917e7eca8766de4dc35bed0',false),
      ('public.teskeid_event_touch_updated_at()',
       '','trigger','plpgsql','v',true,false,'u',
       'bb0914d96897242328a9ade9661bf1a7',false),
      ('public.teskeid_event_guard_guest_update()',
       '','trigger','plpgsql','v',true,false,'u',
       'fc0f737a5c5757b621577e39e4f75b4e',false),
      ('public.teskeid_event_guard_receipt_mutation()',
       '','trigger','plpgsql','v',true,false,'u',
       'abbca6ba554f3a1d0d4d71b9918d2abd',false),
      ('public.teskeid_event_guard_identity_authorization_commit()',
       '','trigger','plpgsql','v',true,false,'u',
       '9b265d58159dadeb0ea1eb492aae085d',false),
      ('public.teskeid_event_guard_attendance_receipt_mutation()',
       '','trigger','plpgsql','v',true,false,'u',
       '2684938d7e8064656c58cc1f6e90ee53',false),
      ('public.teskeid_event_assert_attendance_integrity(uuid,uuid)',
       'p_event_id uuid, p_event_guest_id uuid','void','plpgsql','v',true,false,'u',
       '2870ed4aed519757199fbb19c0ce3975',false),
      ('public.teskeid_event_attendance_integrity_trigger()',
       '','trigger','plpgsql','v',true,false,'u',
       '776d0e3518021fb21bbcac1f8154ead9',false),
      ('public.teskeid_event_create(uuid,uuid,text,jsonb)',
       'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb',
       'jsonb','plpgsql','v',true,false,'u',
       '9129bb5800d742b5f3f9ab09c3f196fb',true),
      ('public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)',
       'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb',
       'jsonb','plpgsql','v',true,false,'u',
       'b6f8566f735fc02be284d17aeca68b62',true),
      ('public.teskeid_event_create_with_attendance_invitations(uuid,uuid,text,jsonb)',
       'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb',
       'jsonb','plpgsql','v',true,false,'u',
       '018e330369033e939d9ada7b08e18516',true),
      ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)',
       'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb',
       'jsonb','plpgsql','v',true,false,'u',
       '0022e19d8853709247583b7ddb38ef45',true),
      ('public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_expected_roster_revision bigint, p_request_id uuid, p_recipient_email text',
       'jsonb','plpgsql','v',true,false,'u',
       '23eea91f0b5ec29c50b3615c9cadcdfe',true),
      ('public.teskeid_event_cancel_guest_attendance_invitation(uuid,uuid,uuid,uuid,bigint,uuid)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_invitation_id uuid, p_expected_roster_revision bigint, p_request_id uuid',
       'jsonb','plpgsql','v',true,false,'u',
       'd9a5936ecafef2fb21e65bfd973f5405',true),
      ('public.teskeid_event_save_details(uuid,uuid,uuid,date,time without time zone,text,text)',
       'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text',
       'jsonb','plpgsql','v',true,false,'u',
       '3336e4f5c7a79ee887a46c7d98e09015',true),
      ('public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)',
       'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text',
       'jsonb','plpgsql','v',true,false,'u',
       '3e1b846ec2a4540e6ee51becb2590ec2',true),
      ('public.teskeid_event_private_normalize_shared_name_v2(text)',
       'p_value text','text','sql','i',true,false,'u',
       'd118ab08bc0346cdf31519344a2f65a7', false),
      ('public.teskeid_event_private_valid_shared_name_v2(text)',
       'p_value text','boolean','sql','i',true,false,'u',
       '7a3223263c138e04713dbc87e7dc6576', false),
      ('public.teskeid_event_private_safe_profile_name_v2(uuid)',
       'p_user_id uuid','text','plpgsql','s',true,false,'u',
       '53f29b4c6872d3e76d6c9cbc17a767e0', false),
      ('public.teskeid_event_valid_text(text,integer,integer)',
       'p_value text, p_minimum integer, p_maximum integer',
       'boolean','sql','i',true,false,'u',
       '28c80b083a90683f15fd04f4d7d547d1', false),
      ('public.teskeid_event_uuid_from_text(text)',
       'p_value text','uuid','sql','i',true,false,'u',
       '27229cbc71c621e5a8592265b07f874d', false),
      ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)',
       'p_value timestamp with time zone','text','sql','s',true,false,'u',
       '7017190619681901af3813e1fc3b305c', false),
      ('public.teskeid_event_private_valid_canonical_email_v2(text)',
       'p_value text','boolean','sql','i',true,false,'u',
       '3e64bc04485bc06cc544f59f46a2fb0e', false),
      ('public.teskeid_event_private_canonical_roster_input_v2(jsonb,boolean)',
       'p_guests jsonb, p_allow_retained boolean','jsonb','plpgsql','i',
       true,false,'u','cbede437498c588a385a6cb4bdd04610',false),
      ('public.teskeid_event_private_legacy_roster_input_v2(jsonb)',
       'p_canonical_guests jsonb','jsonb','sql','i',true,false,'u',
       '5332b4a24406be464bb51d2148578b75',false),
      ('public.teskeid_event_private_begin_participation_request_v2(uuid,uuid,text,text)',
       'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text','jsonb','plpgsql','v',true,false,'u',
       '2e1e7edc8401f395c8089b1769bc6496', false),
      ('public.teskeid_event_private_finish_participation_request_v2(uuid,uuid,jsonb)',
       'p_actor_id uuid, p_request_id uuid, p_result jsonb','void','plpgsql','v',true,false,'u',
       '7da1e4c2af949efc9434be98ace4eb7d', false),
      ('public.teskeid_event_private_guard_participation_request_v2()',
       '','trigger','plpgsql','v',true,false,'u',
       'abbca6ba554f3a1d0d4d71b9918d2abd',false),
      ('public.teskeid_event_private_ensure_person_v2(uuid,uuid)',
       'p_event_id uuid, p_event_guest_id uuid','void','plpgsql','v',
       true,false,'u','fa593d9afce6ceb40e3fd15f9f4a30ba',false),
      ('public.teskeid_event_private_expire_bound_invitations_v2(uuid,text)',
       'p_recipient_user_id uuid, p_confirmed_email_canonical text',
       'integer','plpgsql','v',true,false,'u',
       '23a268c468e1d61a508b16c80bd08daa',false),
      ('public.teskeid_event_private_guard_bound_invitation_v2()',
       '','trigger','plpgsql','v',true,false,'u',
       '18c2e356417113e8e06cfc568f763713',false),
      ('public.teskeid_event_private_auth_email_invitations_v2()',
       '','trigger','plpgsql','v',true,false,'u',
       'b7805535363aa4fc020668a71c5a5171',false),
      ('public.teskeid_event_private_participation_unlink_v2()',
       '','trigger','plpgsql','v',true,false,'u',
       '5fe72ac8d08536cde7229359023cbb08',false),
      ('public.teskeid_event_private_auth_delete_participations_v2()',
       '','trigger','plpgsql','v',true,false,'u',
       'f0444e3a30a939ee42ea528a09cd1e0e',false),
      ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)',
       'p_event_id uuid, p_event_guest_id uuid, p_identity_action text, p_recipient_user_id uuid, p_recipient_email_canonical text, p_claim_source_invitation_id uuid, p_increment_generation boolean, p_access_state text, p_rsvp_state text','void','plpgsql','v',true,false,'u',
       'ee8872c3b0d91786993e4ffbfb266293', false),
      ('public.teskeid_event_private_v1_participation_bridge_v2()',
       '','trigger','plpgsql','v',true,false,'u',
       'f2901d82fd392cd406a5dfbfc3173759', false),
      ('public.teskeid_event_private_claim_participations_v2(uuid)',
       'p_actor_id uuid','integer','plpgsql','v',true,false,'u',
       'b57bf9fa43754dfcd05cb7e063829bc6', false),
      ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid','text','plpgsql','s',true,false,'u',
       '211fbfb65b4edaa4b0307c2fb5878a60', false),
      ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_position integer, p_is_self boolean','jsonb','plpgsql','s',true,false,'u',
       'dd6d4f6b57c109fb46d6992ce66462e8', false),
      ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)',
       'p_actor_id uuid, p_event_id uuid, p_position integer','jsonb','plpgsql','s',true,false,'u',
       'd42c11caf87eaac45646535539029977', false),
      ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)',
       'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text','jsonb','plpgsql','s',true,false,'u',
       'cfb3afa33af8fd230e6c26930424387f', false),
      ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
       'p_actor_id uuid, p_event_id uuid, p_viewer_role text','jsonb','plpgsql','s',true,false,'u',
       '7a41340baed779873454dff86889ea9b', false),
      ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',true,false,'u',
       'df539138c44252719575a9d0d090968b', true),
      ('public.teskeid_event_list_for_actor_v2(uuid)',
       'p_actor_id uuid','jsonb','plpgsql','v',true,false,'u',
       '6d20e61af6c56e4c3c02d53340ff2bc6', true),
      ('public.teskeid_event_list_person_source_events_v2(uuid,timestamp with time zone,uuid,integer)',
       'p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer',
       'jsonb','plpgsql','v',true,false,'u',
       '0959d2725cd7db9b3510d123a81819eb', true),
      ('public.teskeid_event_get_person_source_roster_v2(uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',true,false,'u',
       '3c689e2f05035a67d58fbb8ca39dcd40', true),
      ('public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)',
       'p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer',
       'jsonb','plpgsql','s',true,false,'u',
       'a31fc1caa0cf009e4daad9c3e3ed1875', true),
      ('public.teskeid_event_get_person_source_roster_v1(uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','s',true,false,'u',
       'ae418825a7d7f8ebe056272dde9448fd', true),
      ('public.teskeid_event_create_with_details_and_participations_v2(uuid,uuid,text,jsonb,date,time without time zone,text,text)',
       'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text',
       'jsonb','plpgsql','v',true,false,'u',
       '3b72c4710731c6d467475665e6bb5d48',true),
      ('public.teskeid_event_replace_roster_with_participations_v2(uuid,uuid,uuid,bigint,jsonb)',
       'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb',
       'jsonb','plpgsql','v',true,false,'u',
       'c8738b2a21735bac895c3e25335f6ee8',true),
      ('public.teskeid_event_repair_person_label_v2(uuid,uuid,uuid,bigint,bigint,text,uuid)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_expected_roster_revision bigint, p_expected_label_version bigint, p_shared_display_name text, p_request_id uuid',
       'jsonb','plpgsql','v',true,false,'u',
       '3352c37bbf3883c991c658de37fde1d3',true),
      ('public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_rsvp_state text, p_expected_rsvp_version bigint, p_request_id uuid','jsonb','plpgsql','v',true,false,'u',
       '0b161601a4b91a521c42288b8279ff83', true),
      ('public.teskeid_event_leave_attendance(uuid,uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid, p_request_id uuid','jsonb','plpgsql','v',true,false,'u',
       'adc9e9bb4bb79081112c69dd00a6cdff', true)
      ,('public.teskeid_event_get_attendee_view(uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',true,false,'u',
       'd93ffd501b56cdab685208093199a999', true)
    ) AS expected(
      signature, exact_arguments, result_type, language_name, volatility,
      security_definer, is_strict, parallel_safety,
      source_md5, service_execute
    )
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_expected.signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'sql153_prerequisite_missing:%', v_expected.signature;
    END IF;
    SELECT pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc, E'\r\n', E'\n'
    )) INTO v_source_md5
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = v_oid
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = v_expected.language_name
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef = v_expected.security_definer
      AND procedure_row.proisstrict = v_expected.is_strict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = v_expected.volatility::"char"
      AND procedure_row.proparallel = v_expected.parallel_safety::"char"
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        v_expected.result_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        v_expected.exact_arguments
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = procedure_row.pronamespace
          AND overload.proname = procedure_row.proname
      ) = 1;
    IF v_source_md5 IS DISTINCT FROM v_expected.source_md5 THEN
      RAISE EXCEPTION 'sql153_protected_function_mismatch:%',
        v_expected.signature;
    END IF;
    IF pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege(
         'service_role', v_oid, 'EXECUTE'
       ) IS DISTINCT FROM v_expected.service_execute
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode(COALESCE(
           (SELECT procedure_row.proacl
            FROM pg_catalog.pg_proc AS procedure_row
            WHERE procedure_row.oid = v_oid),
           pg_catalog.acldefault('f', (
             SELECT procedure_row.proowner
             FROM pg_catalog.pg_proc AS procedure_row
             WHERE procedure_row.oid = v_oid
           ))
         )) AS exact_privilege
       ) <> (1 + v_expected.service_execute::integer)
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc AS procedure_row
         CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
           procedure_row.proacl,
           pg_catalog.acldefault('f', procedure_row.proowner)
         )) AS privilege
         LEFT JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE procedure_row.oid = v_oid
           AND (
              privilege.grantor <> procedure_row.proowner
              OR privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR (
               privilege.grantee <> procedure_row.proowner
               AND (
                 NOT v_expected.service_execute
                 OR grantee.rolname IS DISTINCT FROM 'service_role'
               )
             )
           )
       ) THEN
      RAISE EXCEPTION 'sql153_protected_acl_mismatch:%',
        v_expected.signature;
    END IF;
  END LOOP;

  -- SQL147 used a marker-preserving CREATE OR REPLACE rewrite.  Seal the
  -- normalized body after removing that exact one-time marker so this package
  -- proves legacy pending/preview/respond authority without changing SQL147.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_list_for_actor(uuid)',
       'p_actor_id uuid','4ccf01e6251a7e7ee187fcba21a88c36'),
      ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)',
       'p_actor_id uuid, p_invitation_id uuid',
       'e268003d1f916f6a987e8d47dbef5971'),
      ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)',
       'p_actor_id uuid, p_invitation_id uuid, p_action text, p_request_id uuid',
       '45bab121e346e77fa4a4035b7cf88f16'),
      ('public.teskeid_event_list_my_pending_invitations(uuid)',
       'p_actor_id uuid','295ca440e9caa334986f664ce2bc7398')
    ) AS expected(signature,exact_arguments,source_md5)
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_expected.signature);
    SELECT pg_catalog.md5(pg_catalog.replace(
      pg_catalog.replace(procedure_row.prosrc,E'\r\n',E'\n'),
      '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY' || E'\n',''
    )) INTO v_source_md5
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = v_oid
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = 'plpgsql'
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef
      AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = 'v'
      AND procedure_row.proparallel = 'u'
      AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        v_expected.exact_arguments
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        pg_catalog.length(procedure_row.prosrc) - pg_catalog.length(
          pg_catalog.replace(procedure_row.prosrc,
            '-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY','')
        )
      ) / pg_catalog.length('-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY') = 1
      AND (
        SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = procedure_row.pronamespace
          AND overload.proname = procedure_row.proname
      ) = 1;
    IF v_oid IS NULL OR v_source_md5 IS DISTINCT FROM v_expected.source_md5
       OR NOT pg_catalog.has_function_privilege('postgres',v_oid,'EXECUTE')
       OR pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
       OR NOT pg_catalog.has_function_privilege(
         'service_role',v_oid,'EXECUTE'
       ) OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_proc AS procedure_row
         CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
           procedure_row.proacl,
           pg_catalog.acldefault('f',procedure_row.proowner)
         )) AS privilege
         LEFT JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE procedure_row.oid = v_oid
           AND privilege.privilege_type = 'EXECUTE'
           AND NOT privilege.is_grantable
           AND (privilege.grantee = procedure_row.proowner
             OR grantee.rolname = 'service_role')
       ) <> 2 OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc AS procedure_row
         CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
           procedure_row.proacl,
           pg_catalog.acldefault('f',procedure_row.proowner)
         )) AS privilege
         LEFT JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE procedure_row.oid = v_oid
           AND (privilege.grantor <> procedure_row.proowner
             OR privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0 OR privilege.is_grantable
             OR (privilege.grantee <> procedure_row.proowner
               AND grantee.rolname IS DISTINCT FROM 'service_role'))
       ) THEN
      RAISE EXCEPTION 'sql153_sql147_function_mismatch:%',
        v_expected.signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.teskeid_events'),
      ('public.teskeid_event_details'),
      ('public.teskeid_event_guests'),
      ('public.teskeid_event_guest_invitations'),
      ('public.teskeid_event_attendance_memberships'),
      ('public.teskeid_event_person_labels'),
      ('public.teskeid_event_participations'),
      ('public.teskeid_event_participation_mutation_requests'),
      ('public.teskeid_event_participation_invitation_terminalizations'),
      ('public.teskeid_event_mutation_requests'),
      ('public.teskeid_event_attendance_mutation_requests'),
      ('public.teskeid_event_guest_identity_mutation_authorizations')
    ) AS expected(relation_name)
    LEFT JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = pg_catalog.to_regclass(expected.relation_name)
    LEFT JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation_row.relowner
    WHERE relation_row.oid IS NULL
       OR relation_row.relkind <> 'r'
       OR owner_role.rolname IS DISTINCT FROM 'postgres'
       OR NOT relation_row.relrowsecurity
       OR NOT relation_row.relforcerowsecurity
       OR EXISTS (
         SELECT 1 FROM pg_catalog.pg_policy AS policy
         WHERE policy.polrelid = relation_row.oid
       )
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode(COALESCE(
           relation_row.relacl,
           pg_catalog.acldefault('r', relation_row.relowner)
         ))
        ) <> CASE
          WHEN pg_catalog.current_setting('server_version_num')::integer >= 170000
            THEN 8
          ELSE 7
        END
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           relation_row.relacl,
           pg_catalog.acldefault('r', relation_row.relowner)
         )) AS privilege
         WHERE privilege.grantor <> relation_row.relowner
            OR privilege.grantee <> relation_row.relowner
            OR (
              privilege.privilege_type <> ALL(ARRAY[
              'INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES',
              'TRIGGER'
              ]::text[])
              AND NOT (
                pg_catalog.current_setting('server_version_num')::integer >= 170000
                AND privilege.privilege_type = 'MAINTAIN'
              )
            )
            OR privilege.is_grantable
       )
  ) THEN
    RAISE EXCEPTION 'sql153_source_relation_security_mismatch';
  END IF;
  IF EXISTS (
    WITH expected(
      trigger_name, relation_name, function_signature, trigger_type,
      is_deferrable, initially_deferred, update_columns
    ) AS (
      VALUES
        ('teskeid_event_participation_requests_mutation_guard',
          'public.teskeid_event_participation_mutation_requests',
          'public.teskeid_event_private_guard_participation_request_v2()',
          27,false,false,ARRAY[]::text[]),
        ('teskeid_event_guest_invitations_sql149_bound_guard',
          'public.teskeid_event_guest_invitations',
          'public.teskeid_event_private_guard_bound_invitation_v2()',
          23,false,false,ARRAY[]::text[]),
        ('teskeid_event_sql149_participation_account_email',
          'auth.users',
          'public.teskeid_event_private_auth_email_invitations_v2()',
          17,false,false,ARRAY['email','email_confirmed_at']::text[]),
        ('teskeid_event_participations_account_unlink',
          'public.teskeid_event_participations',
          'public.teskeid_event_private_participation_unlink_v2()',
          19,false,false,ARRAY['recipient_user_id']::text[]),
        ('teskeid_event_sql149_participation_account_delete',
          'auth.users',
          'public.teskeid_event_private_auth_delete_participations_v2()',
          11,false,false,ARRAY[]::text[]),
        ('teskeid_event_guests_sql149_participation_deferred',
          'public.teskeid_event_guests',
          'public.teskeid_event_private_v1_participation_bridge_v2()',
          29,true,true,ARRAY[]::text[]),
        ('teskeid_event_guest_invitations_sql149_participation_deferred',
          'public.teskeid_event_guest_invitations',
          'public.teskeid_event_private_v1_participation_bridge_v2()',
          29,true,true,ARRAY[]::text[]),
        ('teskeid_event_attendance_memberships_sql149_sync_deferred',
          'public.teskeid_event_attendance_memberships',
          'public.teskeid_event_private_v1_participation_bridge_v2()',
          29,true,true,ARRAY[]::text[]),
        ('teskeid_events_touch_updated_at','public.teskeid_events',
          'public.teskeid_event_touch_updated_at()',
          19,false,false,ARRAY[]::text[]),
        ('teskeid_event_guests_touch_updated_at','public.teskeid_event_guests',
          'public.teskeid_event_touch_updated_at()',
          19,false,false,ARRAY[]::text[]),
        ('teskeid_events_update_guard','public.teskeid_events',
          'public.teskeid_event_guard_event_update()',
          19,false,false,ARRAY[]::text[]),
        ('teskeid_event_guests_update_guard','public.teskeid_event_guests',
          'public.teskeid_event_guard_guest_update()',
          19,false,false,ARRAY[]::text[]),
        ('teskeid_event_receipts_mutation_guard',
          'public.teskeid_event_mutation_requests',
          'public.teskeid_event_guard_receipt_mutation()',
          27,false,false,ARRAY[]::text[]),
        ('teskeid_event_guests_roster_deferred','public.teskeid_event_guests',
          'public.teskeid_event_roster_integrity_trigger()',
          29,true,true,ARRAY[]::text[]),
        ('teskeid_event_guest_invitations_touch_updated_at',
          'public.teskeid_event_guest_invitations',
          'public.teskeid_event_touch_updated_at()',
          19,false,false,ARRAY[]::text[]),
        ('teskeid_event_attendance_receipts_mutation_guard',
          'public.teskeid_event_attendance_mutation_requests',
          'public.teskeid_event_guard_attendance_receipt_mutation()',
          27,false,false,ARRAY[]::text[]),
        ('teskeid_event_attendance_memberships_integrity_deferred',
          'public.teskeid_event_attendance_memberships',
          'public.teskeid_event_attendance_integrity_trigger()',
          29,true,true,ARRAY[]::text[]),
        ('teskeid_event_guest_invitations_integrity_deferred',
          'public.teskeid_event_guest_invitations',
          'public.teskeid_event_attendance_integrity_trigger()',
          29,true,true,ARRAY[]::text[]),
        ('teskeid_event_guests_attendance_integrity_deferred',
          'public.teskeid_event_guests',
          'public.teskeid_event_attendance_integrity_trigger()',
          25,true,true,ARRAY[]::text[]),
        ('teskeid_event_identity_authorizations_consumed_deferred',
          'public.teskeid_event_guest_identity_mutation_authorizations',
          'public.teskeid_event_guard_identity_authorization_commit()',
          21,true,true,ARRAY[]::text[])
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgname = expected.trigger_name
     AND trigger_row.tgrelid = pg_catalog.to_regclass(
       expected.relation_name
     )
    LEFT JOIN LATERAL (
      SELECT COALESCE(pg_catalog.array_agg(
        attribute_row.attname::text ORDER BY attribute_row.attname
      ), ARRAY[]::text[]) AS update_columns
      FROM pg_catalog.unnest(COALESCE(
        trigger_row.tgattr::smallint[], ARRAY[]::smallint[]
      )) AS trigger_attribute(attnum)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid = trigger_row.tgrelid
       AND attribute_row.attnum = trigger_attribute.attnum
    ) AS actual_columns ON true
    WHERE trigger_row.oid IS NULL
       OR trigger_row.tgisinternal
       OR trigger_row.tgenabled <> 'O'
       OR trigger_row.tgtype <> expected.trigger_type
       OR trigger_row.tgdeferrable <> expected.is_deferrable
       OR trigger_row.tginitdeferred <> expected.initially_deferred
       OR trigger_row.tgqual IS NOT NULL
       OR trigger_row.tgnargs <> 0
       OR pg_catalog.octet_length(trigger_row.tgargs) <> 0
       OR trigger_row.tgfoid <> pg_catalog.to_regprocedure(
         expected.function_signature
       )
       OR actual_columns.update_columns <> expected.update_columns
       OR trigger_row.tgoldtable IS NOT NULL
       OR trigger_row.tgnewtable IS NOT NULL
       OR pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
         pg_catalog.regexp_replace(pg_catalog.regexp_replace(
           pg_catalog.pg_get_triggerdef(trigger_row.oid),
           '::[a-z0-9_]+(\[\])?', '', 'g'
         ), '[[:space:]()''"]', '', 'g'), 'public.', ''
       ))) <> CASE expected.trigger_name
         WHEN 'teskeid_event_participation_requests_mutation_guard' THEN 'aed02c26ad3e4c256c07981f14190cfd'
         WHEN 'teskeid_event_guest_invitations_sql149_bound_guard' THEN '4140321dd7400e9f0678e83519d1928b'
         WHEN 'teskeid_event_sql149_participation_account_email' THEN '88d9bdcfcd4e60ac4422278632f7ff1c'
         WHEN 'teskeid_event_participations_account_unlink' THEN 'f874d0a2f672851bbe1d16d2a8d98215'
         WHEN 'teskeid_event_sql149_participation_account_delete' THEN 'a8ca80c2abb8da96d1b766a1ab2d7d8e'
         WHEN 'teskeid_event_guests_sql149_participation_deferred' THEN '7267787e96147dfe136cf6fda4657aac'
         WHEN 'teskeid_event_guest_invitations_sql149_participation_deferred' THEN 'c64f7878dc0c9680b752f67cd3736547'
         WHEN 'teskeid_event_attendance_memberships_sql149_sync_deferred' THEN 'd27ee6368491ea98fd4dac44d8548501'
         WHEN 'teskeid_events_touch_updated_at' THEN '573d2130576e33a2e0051aa5a53ee8da'
         WHEN 'teskeid_event_guests_touch_updated_at' THEN '6ab521c4a591f84b98ec4e9fcf510284'
         WHEN 'teskeid_events_update_guard' THEN '6f89ed31bd0f8ccd4287b2e45c52af60'
         WHEN 'teskeid_event_guests_update_guard' THEN 'c95d9d09d7ea3561f953ffb95cb811da'
         WHEN 'teskeid_event_receipts_mutation_guard' THEN '848754f56bd8a534919b139b3f0cc458'
         WHEN 'teskeid_event_guests_roster_deferred' THEN '4b8716b13b134e7d6832c117af96515c'
         WHEN 'teskeid_event_guest_invitations_touch_updated_at' THEN 'fa7142e0a8c566ccf190da63610cae40'
         WHEN 'teskeid_event_attendance_receipts_mutation_guard' THEN '9e63014a2603cbe3557a062a8811f5c7'
         WHEN 'teskeid_event_attendance_memberships_integrity_deferred' THEN '90339fbdfb6ca44a0561893ef7595c1c'
         WHEN 'teskeid_event_guest_invitations_integrity_deferred' THEN 'c3acb696a05b8ae943adae3861e810c0'
         WHEN 'teskeid_event_guests_attendance_integrity_deferred' THEN '1b19d5124b69fea189ffee1702be8217'
         WHEN 'teskeid_event_identity_authorizations_consumed_deferred' THEN '2fd977aeca18d003379f1ea0df746f5f'
         ELSE NULL END
       OR (expected.is_deferrable AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_constraint AS trigger_constraint
         WHERE trigger_constraint.oid=trigger_row.tgconstraint
           AND trigger_constraint.conname=expected.trigger_name
           AND trigger_constraint.contype='t'
           AND trigger_constraint.conrelid=trigger_row.tgrelid
           AND trigger_constraint.condeferrable
           AND trigger_constraint.condeferred
           AND trigger_constraint.convalidated
       ))
       OR (NOT expected.is_deferrable AND trigger_row.tgconstraint<>0)
  ) THEN
    RAISE EXCEPTION 'sql153_source_trigger_mismatch';
  END IF;
  CREATE TEMP TABLE sql153_source_trigger_seal(
    trigger_count integer NOT NULL,
    catalog_md5 text NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO sql153_source_trigger_seal(trigger_count,catalog_md5)
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      trigger_row.tgname::text || '|' || trigger_row.tgrelid::text || '|' ||
      trigger_row.tgfoid::text || '|' || trigger_row.tgtype::text || '|' ||
      trigger_row.tgenabled::text || '|' || trigger_row.tgconstraint::text ||
      '|' || trigger_row.tgdeferrable::text || '|' ||
      trigger_row.tginitdeferred::text || '|' ||
      pg_catalog.md5(pg_catalog.pg_get_triggerdef(trigger_row.oid)),
      E'\n' ORDER BY trigger_row.tgname
    ),''))
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgname=ANY(ARRAY[
    'teskeid_event_participation_requests_mutation_guard',
    'teskeid_event_guest_invitations_sql149_bound_guard',
    'teskeid_event_sql149_participation_account_email',
    'teskeid_event_participations_account_unlink',
    'teskeid_event_sql149_participation_account_delete',
    'teskeid_event_guests_sql149_participation_deferred',
    'teskeid_event_guest_invitations_sql149_participation_deferred',
    'teskeid_event_attendance_memberships_sql149_sync_deferred',
    'teskeid_events_touch_updated_at','teskeid_event_guests_touch_updated_at',
    'teskeid_events_update_guard','teskeid_event_guests_update_guard',
    'teskeid_event_receipts_mutation_guard',
    'teskeid_event_guests_roster_deferred',
    'teskeid_event_guest_invitations_touch_updated_at',
    'teskeid_event_attendance_receipts_mutation_guard',
    'teskeid_event_attendance_memberships_integrity_deferred',
    'teskeid_event_guest_invitations_integrity_deferred',
    'teskeid_event_guests_attendance_integrity_deferred',
    'teskeid_event_identity_authorizations_consumed_deferred'
  ]::name[]);
  IF EXISTS (
    WITH expected(
      index_name, table_name, is_unique, is_primary,
      column_names, normalized_predicate
    ) AS (
      VALUES
        ('teskeid_events_pkey',
          'public.teskeid_events',true,true,
          ARRAY['id']::text[],NULL),
        ('teskeid_event_guests_event_id_id_key',
          'public.teskeid_event_guests',true,false,
          ARRAY['event_id','id']::text[],NULL),
        ('teskeid_event_guest_invitations_pkey',
          'public.teskeid_event_guest_invitations',true,true,
          ARRAY['id']::text[],NULL),
        ('teskeid_event_guest_invitations_sql149_identity_uidx',
          'public.teskeid_event_guest_invitations',true,false,
          ARRAY['id','event_id','event_guest_id']::text[],NULL),
        ('teskeid_event_attendance_memberships_pkey',
          'public.teskeid_event_attendance_memberships',true,true,
          ARRAY['event_id','user_id']::text[],NULL),
        ('teskeid_event_participations_pkey',
          'public.teskeid_event_participations',true,true,
          ARRAY['event_id','event_guest_id']::text[],NULL),
        ('teskeid_event_participations_active_user_uidx',
          'public.teskeid_event_participations',true,false,
          ARRAY['event_id','recipient_user_id']::text[],
          'access_state=''active''andrecipient_user_idisnotnull'),
        ('teskeid_event_participations_active_email_uidx',
          'public.teskeid_event_participations',true,false,
          ARRAY['event_id','recipient_email_canonical']::text[],
          'access_state=''active''andrecipient_email_canonicalisnotnull')
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_index AS index_row
      ON index_row.indexrelid = pg_catalog.to_regclass(
        'public.' || expected.index_name
      )
    LEFT JOIN pg_catalog.pg_class AS index_class
      ON index_class.oid = index_row.indexrelid
    LEFT JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = index_class.relam
    WHERE index_row.indexrelid IS NULL
       OR index_row.indrelid <> pg_catalog.to_regclass(expected.table_name)
       OR index_row.indisunique <> expected.is_unique
       OR index_row.indisprimary <> expected.is_primary
       OR NOT index_row.indisvalid
       OR NOT index_row.indisready
       OR NOT index_row.indislive
       OR index_row.indcheckxmin
       OR index_row.indisexclusion
       OR index_row.indexprs IS NOT NULL
       OR index_row.indnkeyatts <>
         pg_catalog.cardinality(expected.column_names)
       OR index_row.indnatts <> index_row.indnkeyatts
       OR access_method.amname IS DISTINCT FROM 'btree'
       OR ARRAY(
         SELECT attribute_row.attname::text
         FROM pg_catalog.unnest(index_row.indkey)
           WITH ORDINALITY AS indexed(attnum, ordinal_position)
         JOIN pg_catalog.pg_attribute AS attribute_row
           ON attribute_row.attrelid = index_row.indrelid
          AND attribute_row.attnum = indexed.attnum
         ORDER BY indexed.ordinal_position
       ) <> expected.column_names
       OR pg_catalog.regexp_replace(
         COALESCE(pg_catalog.lower(pg_catalog.pg_get_expr(
           index_row.indpred, index_row.indrelid
         )), ''),
         '[()[:space:]]|::text', '', 'g'
       ) <> COALESCE(expected.normalized_predicate, '')
  ) THEN
    RAISE EXCEPTION 'sql153_source_index_mismatch';
  END IF;
  IF NOT EXISTS (
    WITH expected(
      index_name,table_name,is_unique,is_primary,column_names,
      operator_classes,collations,index_options,normalized_predicate
    ) AS (VALUES
      ('teskeid_events_pkey','public.teskeid_events',true,true,ARRAY['id']::text[],ARRAY['uuid_ops']::text[],ARRAY['']::text[],ARRAY[0]::smallint[],NULL::text),
      ('teskeid_event_guests_event_id_id_key','public.teskeid_event_guests',true,false,ARRAY['event_id','id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],NULL),
      ('teskeid_event_guest_invitations_pkey','public.teskeid_event_guest_invitations',true,true,ARRAY['id']::text[],ARRAY['uuid_ops']::text[],ARRAY['']::text[],ARRAY[0]::smallint[],NULL),
      ('teskeid_event_guest_invitations_sql149_identity_uidx','public.teskeid_event_guest_invitations',true,false,ARRAY['id','event_id','event_guest_id']::text[],ARRAY['uuid_ops','uuid_ops','uuid_ops']::text[],ARRAY['','','']::text[],ARRAY[0,0,0]::smallint[],NULL),
      ('teskeid_event_guest_invitations_pending_guest_uidx','public.teskeid_event_guest_invitations',true,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],'status=''pending'''),
      ('teskeid_event_guest_invitations_guest_history_idx','public.teskeid_event_guest_invitations',false,false,ARRAY['event_id','event_guest_id','created_at','id']::text[],ARRAY['uuid_ops','uuid_ops','timestamptz_ops','uuid_ops']::text[],ARRAY['','','','']::text[],ARRAY[0,0,3,3]::smallint[],NULL),
      ('teskeid_event_attendance_memberships_pkey','public.teskeid_event_attendance_memberships',true,true,ARRAY['event_id','user_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],NULL),
      ('teskeid_event_attendance_memberships_guest_uidx','public.teskeid_event_attendance_memberships',true,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],NULL),
      ('teskeid_event_attendance_memberships_invitation_uidx','public.teskeid_event_attendance_memberships',true,false,ARRAY['accepted_invitation_id']::text[],ARRAY['uuid_ops']::text[],ARRAY['']::text[],ARRAY[0]::smallint[],NULL),
      ('teskeid_event_attendance_memberships_user_idx','public.teskeid_event_attendance_memberships',false,false,ARRAY['user_id','accepted_at','event_id']::text[],ARRAY['uuid_ops','timestamptz_ops','uuid_ops']::text[],ARRAY['','','']::text[],ARRAY[0,3,0]::smallint[],NULL),
      ('teskeid_event_participations_pkey','public.teskeid_event_participations',true,true,ARRAY['event_id','event_guest_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],NULL),
      ('teskeid_event_participations_active_user_uidx','public.teskeid_event_participations',true,false,ARRAY['event_id','recipient_user_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],'access_state=''active''andrecipient_user_idisnotnull'),
      ('teskeid_event_participations_active_email_uidx','public.teskeid_event_participations',true,false,ARRAY['event_id','recipient_email_canonical']::text[],ARRAY['uuid_ops','text_ops']::text[],ARRAY['','default']::text[],ARRAY[0,0]::smallint[],'access_state=''active''andrecipient_email_canonicalisnotnull'),
      ('teskeid_event_person_labels_pkey','public.teskeid_event_person_labels',true,true,ARRAY['event_id','event_guest_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],NULL),
      ('teskeid_event_participation_requests_pkey','public.teskeid_event_participation_mutation_requests',true,true,ARRAY['actor_user_id','request_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],NULL),
      ('teskeid_event_participation_invitation_terminalizations_pkey','public.teskeid_event_participation_invitation_terminalizations',true,true,ARRAY['invitation_id']::text[],ARRAY['uuid_ops']::text[],ARRAY['']::text[],ARRAY[0]::smallint[],NULL),
      ('teskeid_event_participations_recipient_user_idx','public.teskeid_event_participations',false,false,ARRAY['recipient_user_id','access_state','event_id']::text[],ARRAY['uuid_ops','text_ops','uuid_ops']::text[],ARRAY['','default','']::text[],ARRAY[0,0,0]::smallint[],'recipient_user_idisnotnull'),
      ('teskeid_event_participations_recipient_email_idx','public.teskeid_event_participations',false,false,ARRAY['recipient_email_canonical','access_state','event_id','event_guest_id']::text[],ARRAY['text_ops','text_ops','uuid_ops','uuid_ops']::text[],ARRAY['default','default','','']::text[],ARRAY[0,0,0,0]::smallint[],'recipient_email_canonicalisnotnull')
    ), actual AS (
      SELECT expected.*,index_row.indexrelid,index_row.indrelid,index_row.indisunique,
        index_row.indisprimary,index_row.indisvalid,index_row.indisready,
        index_row.indislive,index_row.indimmediate,index_row.indcheckxmin,
        index_row.indisclustered,index_row.indisreplident,
        index_row.indnullsnotdistinct,index_row.indisexclusion,index_row.indexprs,
        index_row.indnkeyatts,index_row.indnatts,index_row.indpred,
        index_class.reltablespace,index_class.relacl,index_class.reloptions,
        index_owner.rolname AS owner_name,access_method.amname,
        ARRAY(SELECT attribute_row.attname::text FROM pg_catalog.unnest(index_row.indkey) WITH ORDINALITY AS keyed(attnum,ordinal_position) JOIN pg_catalog.pg_attribute AS attribute_row ON attribute_row.attrelid=index_row.indrelid AND attribute_row.attnum=keyed.attnum ORDER BY keyed.ordinal_position) AS actual_columns,
        ARRAY(SELECT operator_class.opcname::text FROM pg_catalog.unnest(index_row.indclass) WITH ORDINALITY AS keyed(opclass_oid,ordinal_position) JOIN pg_catalog.pg_opclass AS operator_class ON operator_class.oid=keyed.opclass_oid ORDER BY keyed.ordinal_position) AS actual_opclasses,
        ARRAY(SELECT COALESCE(collation_row.collname,'')::text FROM pg_catalog.unnest(index_row.indcollation) WITH ORDINALITY AS keyed(collation_oid,ordinal_position) LEFT JOIN pg_catalog.pg_collation AS collation_row ON collation_row.oid=keyed.collation_oid ORDER BY keyed.ordinal_position) AS actual_collations,
        ARRAY(SELECT option_value::smallint FROM pg_catalog.unnest(index_row.indoption) WITH ORDINALITY AS keyed(option_value,ordinal_position) ORDER BY keyed.ordinal_position) AS actual_options
      FROM expected
      LEFT JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid=pg_catalog.to_regclass('public.'||expected.index_name)
      LEFT JOIN pg_catalog.pg_class AS index_class ON index_class.oid=index_row.indexrelid
      LEFT JOIN pg_catalog.pg_roles AS index_owner ON index_owner.oid=index_class.relowner
      LEFT JOIN pg_catalog.pg_am AS access_method ON access_method.oid=index_class.relam
    )
    SELECT 1 FROM actual
    HAVING pg_catalog.count(indexrelid)=18 AND pg_catalog.bool_and(
      indrelid=pg_catalog.to_regclass(table_name)
      AND indisunique=is_unique AND indisprimary=is_primary
      AND indisvalid AND indisready AND indislive AND indimmediate
      AND NOT indcheckxmin AND NOT indisclustered AND NOT indisreplident
      AND NOT indnullsnotdistinct AND NOT indisexclusion AND indexprs IS NULL
      AND indnkeyatts=pg_catalog.cardinality(column_names)
      AND indnatts=indnkeyatts AND reltablespace=0 AND relacl IS NULL
      AND pg_catalog.cardinality(COALESCE(reloptions,ARRAY[]::text[]))=0
      AND owner_name='postgres' AND amname='btree'
      AND actual_columns=column_names AND actual_opclasses=operator_classes
      AND actual_collations=collations AND actual_options=index_options
      AND pg_catalog.regexp_replace(COALESCE(pg_catalog.lower(
        pg_catalog.pg_get_expr(indpred,indrelid)
      ),''),'[()[:space:]]|::text','','g')=COALESCE(normalized_predicate,''))
  ) THEN
    RAISE EXCEPTION 'sql153_source_index_catalog_mismatch';
  END IF;
  CREATE TEMP TABLE sql153_source_index_seal(
    index_count integer NOT NULL,catalog_md5 text NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO sql153_source_index_seal(index_count,catalog_md5)
  SELECT pg_catalog.count(*)::integer,pg_catalog.md5(COALESCE(
    pg_catalog.string_agg(index_class.relname::text||'|'||
      pg_catalog.pg_get_indexdef(index_row.indexrelid)||'|'||index_row::text,
      E'\n' ORDER BY index_class.relname),''))
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS index_class ON index_class.oid=index_row.indexrelid
  WHERE index_class.relname=ANY(ARRAY[
    'teskeid_events_pkey','teskeid_event_guests_event_id_id_key',
    'teskeid_event_guest_invitations_pkey',
    'teskeid_event_guest_invitations_sql149_identity_uidx',
    'teskeid_event_guest_invitations_pending_guest_uidx',
    'teskeid_event_guest_invitations_guest_history_idx',
    'teskeid_event_attendance_memberships_pkey',
    'teskeid_event_attendance_memberships_guest_uidx',
    'teskeid_event_attendance_memberships_invitation_uidx',
    'teskeid_event_attendance_memberships_user_idx',
    'teskeid_event_participations_pkey',
    'teskeid_event_participations_active_user_uidx',
    'teskeid_event_participations_active_email_uidx',
    'teskeid_event_person_labels_pkey',
    'teskeid_event_participation_requests_pkey',
    'teskeid_event_participation_invitation_terminalizations_pkey',
    'teskeid_event_participations_recipient_user_idx',
    'teskeid_event_participations_recipient_email_idx'
  ]::name[]);

  IF EXISTS (
    WITH expected(relation_name,constraint_name,normalized_expression) AS (VALUES
      ('teskeid_event_person_labels','teskeid_event_person_labels_state_check','label_state=anyarray[''resolved'',''needs_owner_input'']'),
      ('teskeid_event_person_labels','teskeid_event_person_labels_shape_check','label_state=''resolved''andteskeid_event_private_valid_shared_name_v2shared_display_nameorlabel_state=''needs_owner_input''andshared_display_nameisnull'),
      ('teskeid_event_person_labels','teskeid_event_person_labels_version_check','label_version>0'),
      ('teskeid_event_participations','teskeid_event_participations_email_check','recipient_email_canonicalisnullorrecipient_user_idisnullandteskeid_event_private_valid_canonical_email_v2recipient_email_canonical'),
      ('teskeid_event_participations','teskeid_event_participations_identity_version_check','identity_generation>0andidentity_version>0'),
      ('teskeid_event_participations','teskeid_event_participations_claim_shape_check','recipient_user_idisnotnullandrecipient_email_canonicalisnullandidentity_claimed_atisnotnullorrecipient_user_idisnullandrecipient_email_canonicalisnotnullandidentity_claimed_atisnullandclaim_source_invitation_idisnullorrecipient_email_canonicalisnullandidentity_claimed_atisnullandclaim_source_invitation_idisnulloridentity_claimed_atisnotnull'),
      ('teskeid_event_participations','teskeid_event_participations_access_check','access_state=anyarray[''active'',''left'',''revoked'']'),
      ('teskeid_event_participations','teskeid_event_participations_tombstone_access_check','notrecipient_user_idisnullandrecipient_email_canonicalisnullandidentity_claimed_atisnotnullandaccess_state=''active'''),
      ('teskeid_event_participations','teskeid_event_participations_rsvp_check','rsvp_state=anyarray[''no_response'',''attending'',''not_attending'']'),
      ('teskeid_event_participations','teskeid_event_participations_state_versions_check','access_version>0andrsvp_version>0'),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_operation_check','operation=anyarray[''create_with_participations_v2'',''replace_roster_with_participations_v2'',''repair_person_label_v2'',''set_rsvp_v2'']'),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_fingerprint_check','fingerprint~''^[0-9a-f]{32}$'''),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_result_check','resultisnullorjsonb_typeofresult=''object''andoctet_lengthresult<=32768'),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_generation_check','identity_generation>0'),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_reason_check','reason=''identity_claim''')
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid=pg_catalog.to_regclass('public.'||expected.relation_name)
     AND constraint_row.conname=expected.constraint_name
    WHERE constraint_row.oid IS NULL OR constraint_row.contype<>'c'
       OR NOT constraint_row.convalidated OR constraint_row.connoinherit
       OR constraint_row.condeferrable OR constraint_row.condeferred
       OR pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_expr(
         constraint_row.conbin,constraint_row.conrelid,true
       )),'public[.]|pg_catalog[.]|[()[:space:]]|::text','','g')<>
         expected.normalized_expression
  ) THEN
    RAISE EXCEPTION 'sql153_source_check_constraint_mismatch';
  END IF;
  IF EXISTS (
    WITH expected(
      relation_name,constraint_name,constraint_type,referenced_relation,
      delete_action,is_deferrable,initially_deferred,local_columns,
      referenced_columns
    ) AS (VALUES
      ('teskeid_event_person_labels','teskeid_event_person_labels_pkey','p',NULL::text,NULL::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY[]::text[]),
      ('teskeid_event_person_labels','teskeid_event_person_labels_guest_fk','f','public.teskeid_event_guests','c'::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
      ('teskeid_event_participations','teskeid_event_participations_pkey','p',NULL,NULL::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY[]::text[]),
      ('teskeid_event_participations','teskeid_event_participations_guest_fk','f','public.teskeid_event_guests','c'::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
      ('teskeid_event_participations','teskeid_event_participations_recipient_fk','f','auth.users','n'::"char",true,true,ARRAY['recipient_user_id']::text[],ARRAY['id']::text[]),
      ('teskeid_event_participations','teskeid_event_participations_claim_invitation_fk','f','public.teskeid_event_guest_invitations','n'::"char",true,true,ARRAY['claim_source_invitation_id']::text[],ARRAY['id']::text[]),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_pkey','p',NULL,NULL::"char",false,false,ARRAY['actor_user_id','request_id']::text[],ARRAY[]::text[]),
      ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_actor_fk','f','auth.users','c'::"char",true,true,ARRAY['actor_user_id']::text[],ARRAY['id']::text[]),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_invitation_terminalizations_pkey','p',NULL,NULL::"char",false,false,ARRAY['invitation_id']::text[],ARRAY[]::text[]),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_invitation_fk','f','public.teskeid_event_guest_invitations','c'::"char",false,false,ARRAY['invitation_id','event_id','event_guest_id']::text[],ARRAY['id','event_id','event_guest_id']::text[]),
      ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_guest_fk','f','public.teskeid_event_guests','c'::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
      ('teskeid_event_attendance_memberships','teskeid_event_attendance_memberships_pkey','p',NULL,NULL::"char",false,false,ARRAY['event_id','user_id']::text[],ARRAY[]::text[]),
      ('teskeid_event_attendance_memberships','teskeid_event_attendance_memberships_guest_fk','f','public.teskeid_event_guests','c'::"char",true,true,ARRAY['event_id','event_guest_id','user_id']::text[],ARRAY['event_id','id','linked_user_id']::text[]),
      ('teskeid_event_attendance_memberships','teskeid_event_attendance_memberships_user_fk','f','auth.users','c'::"char",false,false,ARRAY['user_id']::text[],ARRAY['id']::text[]),
      ('teskeid_event_attendance_memberships','teskeid_event_attendance_memberships_invitation_fk','f','public.teskeid_event_guest_invitations','c'::"char",true,true,ARRAY['accepted_invitation_id','event_id','event_guest_id','user_id']::text[],ARRAY['id','event_id','event_guest_id','accepted_user_id']::text[])
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid=pg_catalog.to_regclass('public.'||expected.relation_name)
     AND constraint_row.conname=expected.constraint_name
    LEFT JOIN LATERAL (
      SELECT ARRAY(SELECT attribute_row.attname::text FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY AS keyed(attnum,ordinal_position) JOIN pg_catalog.pg_attribute AS attribute_row ON attribute_row.attrelid=constraint_row.conrelid AND attribute_row.attnum=keyed.attnum ORDER BY keyed.ordinal_position) AS local_columns,
        ARRAY(SELECT attribute_row.attname::text FROM pg_catalog.unnest(constraint_row.confkey) WITH ORDINALITY AS keyed(attnum,ordinal_position) JOIN pg_catalog.pg_attribute AS attribute_row ON attribute_row.attrelid=constraint_row.confrelid AND attribute_row.attnum=keyed.attnum ORDER BY keyed.ordinal_position) AS referenced_columns
    ) AS actual ON true
    WHERE constraint_row.oid IS NULL
       OR constraint_row.contype<>expected.constraint_type::"char"
       OR NOT constraint_row.convalidated
       OR (expected.constraint_type='c' AND constraint_row.connoinherit)
       OR constraint_row.condeferrable<>expected.is_deferrable
       OR constraint_row.condeferred<>expected.initially_deferred
       OR actual.local_columns<>expected.local_columns
       OR (expected.constraint_type='f' AND (
         constraint_row.confrelid<>pg_catalog.to_regclass(expected.referenced_relation)
         OR actual.referenced_columns<>expected.referenced_columns
         OR constraint_row.confdeltype<>expected.delete_action
         OR constraint_row.confupdtype<>'a' OR constraint_row.confmatchtype<>'s'))
  ) OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS actual
    WHERE actual.conrelid=ANY(ARRAY[
      'public.teskeid_event_person_labels'::regclass,
      'public.teskeid_event_participations'::regclass,
      'public.teskeid_event_participation_mutation_requests'::regclass,
      'public.teskeid_event_participation_invitation_terminalizations'::regclass
    ]))<>26 OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS actual
      WHERE actual.conrelid=
        'public.teskeid_event_attendance_memberships'::regclass
        AND actual.contype<>'t')<>4 THEN
    RAISE EXCEPTION 'sql153_source_key_constraint_mismatch';
  END IF;

  IF EXISTS (
    WITH expected(
      relation_name,constraint_name,constraint_type,is_deferrable,
      initially_deferred,normalized_definition
    ) AS (VALUES
      ('teskeid_events','teskeid_events_id_owner_key','u',false,false,'uniqueid,owner_user_id'),
      ('teskeid_event_guests','teskeid_event_guests_event_id_id_linked_key','u',false,false,'uniqueevent_id,id,linked_user_id'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_pkey','p',false,false,'primarykeyid'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_event_guest_fk','f',false,false,'foreignkeyevent_id,event_guest_idreferencesteskeid_event_guestsevent_id,idondeletecascade'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_owner_fk','f',false,false,'foreignkeyevent_id,invited_byreferencesteskeid_eventsid,owner_user_idondeletecascade'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_accepted_user_fk','f',true,true,'foreignkeyaccepted_user_idreferencesauth.usersidondeletesetnulldeferrableinitiallydeferred'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_identity_key','u',false,false,'uniqueid,event_id,event_guest_id,accepted_user_id'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_owner_key','u',false,false,'uniqueid,invited_by'),
      ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_pkey','p',false,false,'primarykeyactor_user_id,request_id'),
      ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_actor_fk','f',false,false,'foreignkeyactor_user_idreferencesauth.usersidondeletecascade'),
      ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_mutation_authorizations_pkey','p',false,false,'primarykeyevent_id,event_guest_id'),
      ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_mutation_authorizations_guest_fk','f',false,false,'foreignkeyevent_id,event_guest_idreferencesteskeid_event_guestsevent_id,idondeletecascade'),
      ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_mutation_authorizations_actor_fk','f',false,false,'foreignkeyactor_user_idreferencesauth.usersidondeletecascade'),
      ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_mutation_authorizations_invite_fk','f',true,true,'foreignkeyaccepted_invitation_id,event_id,event_guest_id,new_linked_user_idreferencesteskeid_event_guest_invitationsid,event_id,event_guest_id,accepted_user_iddeferrableinitiallydeferred')
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid=pg_catalog.to_regclass(
        'public.'||expected.relation_name
      ) AND constraint_row.conname=expected.constraint_name
    WHERE constraint_row.oid IS NULL
       OR constraint_row.contype<>expected.constraint_type::"char"
       OR NOT constraint_row.convalidated
       OR (expected.constraint_type='c' AND constraint_row.connoinherit)
       OR constraint_row.condeferrable<>expected.is_deferrable
       OR constraint_row.condeferred<>expected.initially_deferred
       OR pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.pg_get_constraintdef(constraint_row.oid),
              '::[a-z0-9_]+(\[\])?','','g'
            ),'[[:space:]()''"]','','g'
          ),'public.',''))<>expected.normalized_definition
  ) OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS actual
    WHERE actual.conrelid=ANY(ARRAY[
      'public.teskeid_event_guest_invitations'::regclass,
      'public.teskeid_event_attendance_mutation_requests'::regclass,
      'public.teskeid_event_guest_identity_mutation_authorizations'::regclass
    ]) AND actual.contype IN ('c','f','p','u','x'))<>24 THEN
    RAISE EXCEPTION 'sql153_legacy_authority_key_constraint_mismatch';
  END IF;

  IF EXISTS (
    WITH expected(relation_name,constraint_name,definition_md5) AS (VALUES
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_kind_check','22b5d0993c33015d7700f92ab433ff33'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_status_check','b101d50b384d87a7b66cf42b80b735aa'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_hash_bundle_check','15455ec62890062c26c32bbab11cc600'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_snapshot_check','8ae89b572efc55831870967cb780be9e'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_template_check','6bac810125fe2b4f477b45b526dc83d4'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_attempt_check','c432e69fd0c55951c935d6d851a94728'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_expiry_check','81f15dca4d15c26bb132eb2e3d1ccf88'),
      ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_lifecycle_check','f35892a5ae13facf775a300ce9259de0'),
      ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_operation_check','043951bd32393961ac39a7c78d1f1007'),
      ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_fingerprint_check','db81247a30fe80e62823c7ae4ceccec2'),
      ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_result_check','63f8ecfd9306a01e17cac38793a3af1d'),
      ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_authorizations_shape_check','ea49cffc2ae6918ffd37dad725d2ea74')
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid=pg_catalog.to_regclass(
        'public.'||expected.relation_name
      ) AND constraint_row.conname=expected.constraint_name
    WHERE constraint_row.oid IS NULL OR constraint_row.contype<>'c'
       OR NOT constraint_row.convalidated OR constraint_row.connoinherit
       OR constraint_row.condeferrable OR constraint_row.condeferred
       OR pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
          pg_catalog.replace(pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.pg_get_constraintdef(constraint_row.oid),
              '::[a-z0-9_]+(\[\])?','','g'
            ),'[[:space:]()''"]','','g'
          ),'public.',''),'pg_catalog.','')))<>expected.definition_md5
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid='public.teskeid_event_guests'::regclass
      AND constraint_row.conname='teskeid_event_guests_identity_shape_check'
      AND constraint_row.contype='c' AND constraint_row.convalidated
      AND NOT constraint_row.connoinherit
      AND NOT constraint_row.condeferrable AND NOT constraint_row.condeferred
      AND pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '::[a-z0-9_]+(\[\])?','','g'
        ),'[[:space:]()''"]','','g'
      ),'public.',''))='checksource_kind=manual_nameandemail_canonicalisnullandrelationship_idisnullorsource_kind=manual_emailandemail_canonicalisnotnullandemail_canonical=normalize_email_canonicalemail_canonicalandteskeid_event_valid_textemail_canonical,3,320andemail_canonical~^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$andrelationship_idisnullorsource_kind=relationshipandemail_canonicalisnull'
  ) THEN
    RAISE EXCEPTION 'sql153_legacy_authority_check_constraint_mismatch';
  END IF;

  CREATE TEMP TABLE sql153_legacy_authority_constraint_seal(
    constraint_count integer NOT NULL,catalog_md5 text NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE sql153_legacy_authority_constraint_names(
    relation_oid oid NOT NULL,constraint_name name NOT NULL,
    PRIMARY KEY(relation_oid,constraint_name)
  ) ON COMMIT DROP;
  INSERT INTO sql153_legacy_authority_constraint_names(
    relation_oid,constraint_name
  ) VALUES
    ('public.teskeid_events'::regclass,'teskeid_events_id_owner_key'),
    ('public.teskeid_event_guests'::regclass,'teskeid_event_guests_event_id_id_linked_key'),
    ('public.teskeid_event_guests'::regclass,'teskeid_event_guests_identity_shape_check'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_pkey'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_event_guest_fk'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_owner_fk'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_accepted_user_fk'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_identity_key'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_owner_key'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_kind_check'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_status_check'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_hash_bundle_check'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_snapshot_check'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_template_check'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_attempt_check'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_expiry_check'),
    ('public.teskeid_event_guest_invitations'::regclass,'teskeid_event_guest_invitations_lifecycle_check'),
    ('public.teskeid_event_attendance_mutation_requests'::regclass,'teskeid_event_attendance_mutation_requests_pkey'),
    ('public.teskeid_event_attendance_mutation_requests'::regclass,'teskeid_event_attendance_mutation_requests_actor_fk'),
    ('public.teskeid_event_attendance_mutation_requests'::regclass,'teskeid_event_attendance_mutation_requests_operation_check'),
    ('public.teskeid_event_attendance_mutation_requests'::regclass,'teskeid_event_attendance_mutation_requests_fingerprint_check'),
    ('public.teskeid_event_attendance_mutation_requests'::regclass,'teskeid_event_attendance_mutation_requests_result_check'),
    ('public.teskeid_event_guest_identity_mutation_authorizations'::regclass,'teskeid_event_guest_identity_mutation_authorizations_pkey'),
    ('public.teskeid_event_guest_identity_mutation_authorizations'::regclass,'teskeid_event_guest_identity_mutation_authorizations_guest_fk'),
    ('public.teskeid_event_guest_identity_mutation_authorizations'::regclass,'teskeid_event_guest_identity_mutation_authorizations_actor_fk'),
    ('public.teskeid_event_guest_identity_mutation_authorizations'::regclass,'teskeid_event_guest_identity_mutation_authorizations_invite_fk'),
    ('public.teskeid_event_guest_identity_mutation_authorizations'::regclass,'teskeid_event_guest_identity_authorizations_shape_check');
  INSERT INTO sql153_legacy_authority_constraint_seal(
    constraint_count,catalog_md5
  )
  SELECT pg_catalog.count(*)::integer,pg_catalog.md5(COALESCE(
    pg_catalog.string_agg(constraint_row.conrelid::text||'|'||
      constraint_row.conname::text||'|'||constraint_row.contype::text||'|'||
      pg_catalog.pg_get_constraintdef(constraint_row.oid,true)||'|'||
      constraint_row.condeferrable::text||'|'||constraint_row.condeferred::text,
      E'\n' ORDER BY constraint_row.conrelid,constraint_row.conname),''))
  FROM sql153_legacy_authority_constraint_names AS expected
  JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid=expected.relation_oid
   AND constraint_row.conname=expected.constraint_name;
  CREATE TEMP TABLE sql153_source_constraint_seal(
    constraint_count integer NOT NULL,catalog_md5 text NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO sql153_source_constraint_seal(constraint_count,catalog_md5)
  SELECT pg_catalog.count(*)::integer,pg_catalog.md5(COALESCE(
    pg_catalog.string_agg(constraint_row.conrelid::text||'|'||
      constraint_row.conname::text||'|'||constraint_row.contype::text||'|'||
      pg_catalog.pg_get_constraintdef(constraint_row.oid,true)||'|'||
      constraint_row.condeferrable::text||'|'||constraint_row.condeferred::text,
      E'\n' ORDER BY constraint_row.conrelid,constraint_row.conname),''))
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid=ANY(ARRAY[
    'public.teskeid_event_person_labels'::regclass,
    'public.teskeid_event_participations'::regclass,
    'public.teskeid_event_participation_mutation_requests'::regclass,
    'public.teskeid_event_participation_invitation_terminalizations'::regclass,
    'public.teskeid_event_attendance_memberships'::regclass
  ]) AND constraint_row.contype<>'t';

  IF EXISTS (
    SELECT 1 FROM public.teskeid_event_participations AS participation
    WHERE participation.identity_generation < 1
       OR participation.identity_version < 1
       OR participation.access_version < 1
       OR participation.rsvp_version < 1
       OR (participation.identity_generation > 1
         AND participation.rsvp_version = 9223372036854775807)
       OR participation.rsvp_state NOT IN (
         'no_response', 'attending', 'not_attending'
       )
  ) THEN
    RAISE EXCEPTION 'sql153_source_data_mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_events AS event_row
    LEFT JOIN public.teskeid_event_details AS details
      ON details.event_id = event_row.id
    CROSS JOIN LATERAL (
      SELECT public.teskeid_event_private_normalize_shared_name_v2(
        event_row.name
      ) AS event_name,
      NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
        pg_catalog.replace(pg_catalog.replace(
          details.description, E'\r\n', E'\n'
        ), E'\r', E'\n')
      ), '') AS description,
      NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
        pg_catalog.replace(pg_catalog.replace(
          details.agenda, E'\r\n', E'\n'
        ), E'\r', E'\n')
      ), '') AS agenda
    ) AS normalized
    WHERE NOT pg_catalog.isfinite(event_row.created_at)
       OR event_row.created_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
       OR NOT pg_catalog.isfinite(event_row.updated_at)
       OR event_row.updated_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
       OR (details.event_date IS NOT NULL AND (
         NOT pg_catalog.isfinite(details.event_date)
         OR details.event_date NOT BETWEEN
           date '0001-01-01' AND date '9999-12-31'
       ))
       OR (details.event_time IS NOT NULL AND (
         details.event_time >= time '24:00:00'
         OR details.event_time IS DISTINCT FROM details.event_time::time(0)
       ))
       OR NOT public.teskeid_event_valid_text(
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
  ) THEN
    RAISE EXCEPTION 'sql153_source_projection_mismatch';
  END IF;

  CREATE TEMP TABLE sql153_protected_function_seal (
    function_count integer NOT NULL,
    catalog_md5 text NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO sql153_protected_function_seal(function_count,catalog_md5)
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      procedure_row.proname::text || '(' ||
      pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) ||
      ')|' || pg_catalog.pg_get_function_arguments(procedure_row.oid) ||
      '|' || pg_catalog.pg_get_function_result(procedure_row.oid) ||
      '|' || procedure_row.prokind::text || '|' ||
      procedure_row.prosecdef::text || '|' ||
      procedure_row.proisstrict::text || '|' ||
      procedure_row.proleakproof::text || '|' ||
      procedure_row.proretset::text || '|' ||
      procedure_row.pronargdefaults::text || '|' ||
      procedure_row.provolatile::text || '|' ||
      procedure_row.proparallel::text || '|' ||
      COALESCE(procedure_row.proconfig::text,'-') || '|' ||
      COALESCE(procedure_row.proacl::text,'-') || '|' ||
      owner_role.rolname || '|' || language_row.lanname || '|' ||
      pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc,E'\r\n',E'\n'
      )), E'\n' ORDER BY procedure_row.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure_row.oid)
    ),''))
  FROM pg_catalog.pg_proc AS procedure_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = procedure_row.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
  JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = procedure_row.prolang
  WHERE namespace_row.nspname = 'public'
    AND procedure_row.proname = ANY(ARRAY[
      'teskeid_event_has_access','teskeid_event_assert_actor',
      'teskeid_event_assert_session_actor','teskeid_event_guard_event_update',
      'normalize_email_canonical',
      'teskeid_event_attendance_terminalize_invitations',
      'teskeid_event_attendance_mask_email',
      'teskeid_event_attendance_lock_user_emails',
      'teskeid_event_attendance_create_pending',
      'teskeid_event_normalize_text',
      'teskeid_event_attendance_safe_guest_label',
      'teskeid_event_attendance_sweep_expired',
      'teskeid_event_attendance_begin_response_request',
      'teskeid_event_attendance_finish_response_request',
      'teskeid_event_assert_financial_actor','teskeid_event_begin_request',
      'teskeid_event_finish_request','teskeid_event_assert_roster',
      'teskeid_event_roster_integrity_trigger',
      'teskeid_event_touch_updated_at','teskeid_event_guard_guest_update',
      'teskeid_event_guard_receipt_mutation',
      'teskeid_event_guard_identity_authorization_commit',
      'teskeid_event_guard_attendance_receipt_mutation',
      'teskeid_event_assert_attendance_integrity',
      'teskeid_event_attendance_integrity_trigger',
      'teskeid_event_create','teskeid_event_replace_roster',
      'teskeid_event_create_with_attendance_invitations',
      'teskeid_event_replace_roster_with_attendance_invitations',
      'teskeid_event_invite_guest_attendance',
      'teskeid_event_cancel_guest_attendance_invitation',
      'teskeid_event_save_details',
      'teskeid_event_create_with_details_and_attendance_invitations',
      'teskeid_event_private_normalize_shared_name_v2',
      'teskeid_event_private_valid_shared_name_v2',
      'teskeid_event_private_safe_profile_name_v2',
      'teskeid_event_valid_text','teskeid_event_uuid_from_text',
      'teskeid_event_private_format_utc_timestamp_v2',
      'teskeid_event_private_valid_canonical_email_v2',
      'teskeid_event_private_canonical_roster_input_v2',
      'teskeid_event_private_legacy_roster_input_v2',
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
      'teskeid_event_private_person_projection_v2',
      'teskeid_event_private_organizer_projection_v2',
      'teskeid_event_private_viewer_relationship_v2',
      'teskeid_event_private_people_projection_v2',
      'teskeid_event_get_actor_view_v2','teskeid_event_list_for_actor_v2',
      'teskeid_event_list_person_source_events_v2',
      'teskeid_event_get_person_source_roster_v2',
      'teskeid_event_list_person_source_events_v1',
      'teskeid_event_get_person_source_roster_v1',
      'teskeid_event_create_with_details_and_participations_v2',
      'teskeid_event_replace_roster_with_participations_v2',
      'teskeid_event_repair_person_label_v2',
      'teskeid_event_leave_attendance','teskeid_event_get_attendee_view',
      'teskeid_event_list_for_actor',
      'teskeid_event_get_guest_attendance_preview',
      'teskeid_event_respond_guest_attendance',
      'teskeid_event_list_my_pending_invitations'
    ]::name[]);
  CREATE TEMP TABLE sql153_predecessor_rsvp_v2_source (
    source text NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO sql153_predecessor_rsvp_v2_source(source)
  SELECT procedure_row.prosrc
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)'
  );
END;
$sql153_prerequisites$;

CREATE SEQUENCE public.teskeid_event_sql153_write_observation_seq
  AS bigint MINVALUE 1 START WITH 1 INCREMENT BY 1 CACHE 1 NO CYCLE;
ALTER SEQUENCE public.teskeid_event_sql153_write_observation_seq
  OWNER TO postgres;
ALTER SEQUENCE public.teskeid_event_sql153_write_observation_seq
  OWNED BY NONE;
REVOKE ALL ON SEQUENCE public.teskeid_event_sql153_write_observation_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.teskeid_event_private_normalize_note_v3(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH normalized AS (
    SELECT NULLIF(pg_catalog.normalize(pg_catalog.regexp_replace(
      pg_catalog.replace(pg_catalog.replace(
        p_value, E'\r\n', E'\n'
      ), E'\r', E'\n'),
      U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
      '', 'g'
    )), '') AS value
  )
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN normalized.value IS NOT NULL
     AND pg_catalog.char_length(normalized.value) BETWEEN 1 AND 240
     AND pg_catalog.octet_length(normalized.value) <= 1920
     AND normalized.value !~ '[[:cntrl:]]'
     AND normalized.value !~
       U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
      THEN normalized.value
    ELSE NULL
  END
  FROM normalized;
$function$;

CREATE TABLE public.teskeid_event_participation_rsvp_v3 (
  event_id             uuid        NOT NULL,
  event_guest_id       uuid        NOT NULL,
  identity_generation  bigint      NOT NULL,
  effective_state      text        NOT NULL,
  private_note         text        NULL,
  decision_version     bigint      NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at           timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT teskeid_event_participation_rsvp_v3_pkey
    PRIMARY KEY (event_id, event_guest_id, identity_generation),
  CONSTRAINT teskeid_event_participation_rsvp_v3_current_key
    UNIQUE (event_id, event_guest_id),
  CONSTRAINT teskeid_event_participation_rsvp_v3_generation_check
    CHECK (identity_generation > 0),
  CONSTRAINT teskeid_event_participation_rsvp_v3_state_check
    CHECK (effective_state IN (
      'no_response', 'considering', 'attending', 'not_attending'
    )),
  CONSTRAINT teskeid_event_participation_rsvp_v3_version_check
    CHECK (decision_version > 0),
  CONSTRAINT teskeid_event_participation_rsvp_v3_note_shape_check
    CHECK (
      private_note IS NULL
      OR (
        effective_state = 'considering'
        AND public.teskeid_event_private_normalize_note_v3(
          private_note
        ) IS NOT NULL
        AND private_note IS NOT DISTINCT FROM
          public.teskeid_event_private_normalize_note_v3(
            private_note
          )
      )
    )
);

CREATE TABLE public.teskeid_event_participation_invitation_generations_v3 (
  invitation_id       uuid        NOT NULL,
  event_id            uuid        NOT NULL,
  event_guest_id      uuid        NOT NULL,
  identity_generation bigint      NOT NULL,
  anchored_at         timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT teskeid_event_participation_invitation_gen_v3_pkey
    PRIMARY KEY (invitation_id),
  CONSTRAINT teskeid_event_participation_invitation_gen_v3_current_key
    UNIQUE (event_id, event_guest_id, identity_generation),
  CONSTRAINT teskeid_event_participation_invitation_gen_v3_check
    CHECK (identity_generation > 0)
);

CREATE TABLE public.teskeid_event_participation_mutation_requests_v3 (
  actor_user_id uuid        NOT NULL,
  request_id    uuid        NOT NULL,
  operation     text        NOT NULL,
  fingerprint   text        NOT NULL,
  result        jsonb       NULL,
  created_at    timestamptz NOT NULL DEFAULT pg_catalog.now(),
  completed_at  timestamptz NULL,
  CONSTRAINT teskeid_event_participation_requests_v3_pkey
    PRIMARY KEY (actor_user_id, request_id),
  CONSTRAINT teskeid_event_participation_requests_v3_operation_check
    CHECK (operation IN ('set_rsvp_v3', 'leave_v3')),
  CONSTRAINT teskeid_event_participation_requests_v3_fingerprint_check
    CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  CONSTRAINT teskeid_event_participation_requests_v3_result_check
    CHECK (
      result IS NULL
      OR (
        pg_catalog.jsonb_typeof(result) = 'object'
        AND pg_catalog.octet_length(result::text) <= 8192
      )
    ),
  CONSTRAINT teskeid_event_participation_requests_v3_completion_check
    CHECK ((result IS NULL) = (completed_at IS NULL))
);

CREATE TABLE public.teskeid_event_sql153_install_baseline (
  singleton                    boolean     PRIMARY KEY DEFAULT true,
  sql149_last_value            bigint      NOT NULL,
  sql149_is_called             boolean     NOT NULL,
  participation_count          bigint      NOT NULL,
  rsvp_baseline_md5            text        NOT NULL,
  pre_fence_rsvp_md5           text        NOT NULL,
  decision_count               bigint      NOT NULL,
  decision_baseline_md5        text        NOT NULL,
  request_count                bigint      NOT NULL,
  invitation_anchor_count      bigint      NOT NULL,
  invitation_anchor_md5        text        NOT NULL,
  predecessor_rsvp_v2_source   text        NOT NULL,
  installed_at                 timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT teskeid_event_sql153_baseline_singleton_check
    CHECK (singleton),
  CONSTRAINT teskeid_event_sql153_baseline_hash_check
    CHECK (
      rsvp_baseline_md5 ~ '^[0-9a-f]{32}$'
      AND pre_fence_rsvp_md5 ~ '^[0-9a-f]{32}$'
      AND decision_baseline_md5 ~ '^[0-9a-f]{32}$'
      AND invitation_anchor_md5 ~ '^[0-9a-f]{32}$'
      AND predecessor_rsvp_v2_source <> ''
      AND pg_catalog.octet_length(predecessor_rsvp_v2_source) <= 65536
      AND participation_count >= 0
      AND decision_count >= 0
      AND request_count = 0
      AND invitation_anchor_count >= 0
    )
);

ALTER TABLE public.teskeid_event_participation_rsvp_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participation_rsvp_v3 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participation_invitation_generations_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participation_invitation_generations_v3 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participation_mutation_requests_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_participation_mutation_requests_v3 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_sql153_install_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teskeid_event_sql153_install_baseline FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public.teskeid_event_private_begin_request_v3(
  p_actor_id uuid,
  p_request_id uuid,
  p_operation text,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.teskeid_event_participation_mutation_requests_v3%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL
     OR p_operation NOT IN ('set_rsvp_v3', 'leave_v3')
     OR p_fingerprint !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  INSERT INTO public.teskeid_event_participation_mutation_requests_v3 (
    actor_user_id, request_id, operation, fingerprint
  ) VALUES (
    p_actor_id, p_request_id, p_operation, p_fingerprint
  ) ON CONFLICT (actor_user_id, request_id) DO NOTHING;
  SELECT request_row.* INTO v_row
  FROM public.teskeid_event_participation_mutation_requests_v3 AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id
  FOR UPDATE;
  IF v_row.operation IS DISTINCT FROM p_operation
     OR v_row.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'teskeid_event_fingerprint_mismatch';
  END IF;
  RETURN v_row.result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_finish_request_v3(
  p_actor_id uuid,
  p_request_id uuid,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL
     OR pg_catalog.jsonb_typeof(p_result) <> 'object'
     OR pg_catalog.octet_length(p_result::text) > 8192 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  UPDATE public.teskeid_event_participation_mutation_requests_v3 AS request_row
  SET result = p_result,
      completed_at = pg_catalog.now()
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id
    AND request_row.result IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_guard_request_v3()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id
     OR OLD.request_id IS DISTINCT FROM NEW.request_id
     OR OLD.operation IS DISTINCT FROM NEW.operation
     OR OLD.fingerprint IS DISTINCT FROM NEW.fingerprint
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.result IS NOT NULL
     OR NEW.result IS NULL
     OR NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_immutable_receipt';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_bump_generation_rsvp_v3()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.identity_generation IS DISTINCT FROM OLD.identity_generation THEN
    IF OLD.rsvp_version = 9223372036854775807 THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
    IF NEW.rsvp_version = OLD.rsvp_version THEN
      NEW.rsvp_version := OLD.rsvp_version + 1;
      NEW.rsvp_updated_at := pg_catalog.now();
      NEW.updated_at := pg_catalog.now();
    ELSIF NEW.rsvp_version <> OLD.rsvp_version + 1 THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_sync_rsvp_v3()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_effective_state text;
BEGIN
  PERFORM pg_catalog.nextval(
    'public.teskeid_event_sql153_write_observation_seq'::regclass
  );
  IF TG_OP = 'UPDATE'
     AND NEW.identity_generation IS DISTINCT FROM OLD.identity_generation THEN
    DELETE FROM public.teskeid_event_participation_rsvp_v3 AS decision
    WHERE decision.event_id = NEW.event_id
      AND decision.event_guest_id = NEW.event_guest_id;
  END IF;
  v_effective_state := NEW.rsvp_state;
  INSERT INTO public.teskeid_event_participation_rsvp_v3 (
    event_id, event_guest_id, identity_generation,
    effective_state, private_note, decision_version
  ) VALUES (
    NEW.event_id, NEW.event_guest_id, NEW.identity_generation,
    v_effective_state, NULL, NEW.rsvp_version
  )
  ON CONFLICT (event_id, event_guest_id) DO UPDATE
  SET identity_generation = EXCLUDED.identity_generation,
      effective_state = CASE
        WHEN public.teskeid_event_participation_rsvp_v3.decision_version
               = EXCLUDED.decision_version
         AND public.teskeid_event_participation_rsvp_v3.effective_state
               = 'considering'
         AND EXCLUDED.effective_state = 'no_response'
         AND NEW.identity_generation = OLD.identity_generation
         AND NEW.rsvp_state = OLD.rsvp_state
        THEN public.teskeid_event_participation_rsvp_v3.effective_state
        ELSE EXCLUDED.effective_state
      END,
      private_note = CASE
        WHEN NEW.identity_generation = OLD.identity_generation
         AND NEW.access_state = 'active'
         AND NEW.rsvp_state = OLD.rsvp_state
         AND public.teskeid_event_participation_rsvp_v3.decision_version
               = EXCLUDED.decision_version
        THEN public.teskeid_event_participation_rsvp_v3.private_note
        ELSE NULL
      END,
      decision_version = EXCLUDED.decision_version,
      updated_at = pg_catalog.now();
  PERFORM public.teskeid_event_private_anchor_invitation_v3(
    NEW.event_id, NEW.event_guest_id
  );
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_anchor_invitation_v3(
  p_event_id uuid,
  p_event_guest_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_invitation_id uuid;
BEGIN
  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = participation.event_id
   AND guest.id = participation.event_guest_id
   AND guest.status = 'active'
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
    AND participation.access_state = 'active';
  IF v_participation.event_guest_id IS NULL THEN RETURN; END IF;

  SELECT invitation.id INTO v_invitation_id
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.event_id = p_event_id
    AND invitation.event_guest_id = p_event_guest_id
  ORDER BY invitation.created_at DESC, invitation.id DESC
  LIMIT 1;
  IF v_invitation_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.id = v_invitation_id
      AND (
        invitation.status IN ('pending','accepted','declined','expired')
        OR (
          invitation.status = 'cancelled'
          AND EXISTS (
            SELECT 1
            FROM public.teskeid_event_participation_invitation_terminalizations
              AS terminalization
            WHERE terminalization.invitation_id = invitation.id
              AND terminalization.event_id = p_event_id
              AND terminalization.event_guest_id = p_event_guest_id
              AND terminalization.identity_generation =
                v_participation.identity_generation
              AND terminalization.reason = 'identity_claim'
          )
        )
      )
  ) THEN RETURN; END IF;

  INSERT INTO
    public.teskeid_event_participation_invitation_generations_v3 (
      invitation_id, event_id, event_guest_id, identity_generation
    ) VALUES (
      v_invitation_id, p_event_id, p_event_guest_id,
      v_participation.identity_generation
    )
  ON CONFLICT (invitation_id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_participation_invitation_generations_v3 AS anchor
    WHERE anchor.invitation_id = v_invitation_id
      AND anchor.event_id = p_event_id
      AND anchor.event_guest_id = p_event_guest_id
      AND anchor.identity_generation = v_participation.identity_generation
  ) THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_anchor_sync_v3()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_id uuid;
  v_event_guest_id uuid;
BEGIN
  PERFORM pg_catalog.nextval(
    'public.teskeid_event_sql153_write_observation_seq'::regclass
  );
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  v_event_guest_id := COALESCE(NEW.event_guest_id, OLD.event_guest_id);
  -- A first pending invitation can be a semantic no-op in SQL149 when the
  -- participation already carries this email/no_response.  If its current v3
  -- decision is considering, the old writer nevertheless explicitly chose
  -- no_response.  Reconcile exactly once after the SQL149 deferred bridge.
  IF TG_OP = 'INSERT' AND NEW.status = 'pending'
     AND EXISTS (
       SELECT 1
       FROM public.teskeid_event_participations AS participation
       JOIN public.teskeid_event_participation_rsvp_v3 AS decision
         ON decision.event_id = participation.event_id
        AND decision.event_guest_id = participation.event_guest_id
        AND decision.identity_generation = participation.identity_generation
        AND decision.decision_version = participation.rsvp_version
       WHERE participation.event_id = NEW.event_id
         AND participation.event_guest_id = NEW.event_guest_id
         AND participation.access_state = 'active'
         AND participation.rsvp_state = 'no_response'
         AND decision.effective_state = 'considering'
         AND NEW.id = (
           SELECT invitation.id
           FROM public.teskeid_event_guest_invitations AS invitation
           WHERE invitation.event_id = NEW.event_id
             AND invitation.event_guest_id = NEW.event_guest_id
           ORDER BY invitation.created_at DESC, invitation.id DESC
           LIMIT 1
         )
     ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.teskeid_event_participations AS participation
      WHERE participation.event_id = NEW.event_id
        AND participation.event_guest_id = NEW.event_guest_id
        AND participation.rsvp_version = 9223372036854775807
    ) THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
    UPDATE public.teskeid_event_participations AS participation
    SET rsvp_version = participation.rsvp_version + 1,
        rsvp_updated_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE participation.event_id = NEW.event_id
      AND participation.event_guest_id = NEW.event_guest_id
      AND participation.access_state = 'active'
      AND participation.rsvp_state = 'no_response';
  END IF;
  PERFORM public.teskeid_event_private_anchor_invitation_v3(
    v_event_id, v_event_guest_id
  );
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_assert_rsvp_integrity_v3(
  p_event_id uuid,
  p_event_guest_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    LEFT JOIN public.teskeid_event_participation_rsvp_v3 AS decision
      ON decision.event_id = participation.event_id
     AND decision.event_guest_id = participation.event_guest_id
     AND decision.identity_generation = participation.identity_generation
    WHERE participation.event_id = p_event_id
      AND participation.event_guest_id = p_event_guest_id
      AND (
        decision.event_guest_id IS NULL
        OR decision.decision_version <> participation.rsvp_version
        OR participation.rsvp_state <> CASE
          WHEN decision.effective_state = 'considering'
            THEN 'no_response'
          ELSE decision.effective_state
        END
        OR (participation.access_state <> 'active'
          AND decision.private_note IS NOT NULL)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participation_rsvp_v3 AS decision
    WHERE decision.event_id = p_event_id
      AND decision.event_guest_id = p_event_guest_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS participation
        WHERE participation.event_id = decision.event_id
          AND participation.event_guest_id = decision.event_guest_id
          AND participation.identity_generation = decision.identity_generation
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_rsvp_integrity_failed';
  END IF;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_rsvp_integrity_trigger_v3()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.teskeid_event_private_assert_rsvp_integrity_v3(
    COALESCE(NEW.event_id, OLD.event_id),
    COALESCE(NEW.event_guest_id, OLD.event_guest_id)
  );
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_claim_scoped_v3(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid;
  v_probe_email text;
  v_email text;
  v_candidate public.teskeid_event_participations%ROWTYPE;
  v_anchor public.teskeid_event_participation_invitation_generations_v3%ROWTYPE;
  v_invitation public.teskeid_event_guest_invitations%ROWTYPE;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  IF p_event_id IS NULL THEN RETURN 0; END IF;
  SELECT event_row.owner_user_id INTO v_owner_id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id <> p_actor_id;
  IF v_owner_id IS NULL THEN RETURN 0; END IF;
  IF EXISTS (
    SELECT 1 FROM public.teskeid_event_participations AS participation
    WHERE participation.event_id = p_event_id
      AND participation.recipient_user_id = p_actor_id
  ) THEN
    RETURN 0;
  END IF;
  SELECT public.normalize_email_canonical(account.email)
  INTO v_probe_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL;
  IF NOT public.teskeid_event_private_valid_canonical_email_v2(
    v_probe_email
  ) THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
     AND guest.status = 'active'
    WHERE participation.event_id = p_event_id
      AND participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_probe_email
  ) THEN
    RETURN 0;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_id::text, 13201)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_probe_email, 9702)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9602)
  );
  SELECT public.normalize_email_canonical(account.email)
  INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL
  FOR SHARE OF account;
  IF NOT public.teskeid_event_private_valid_canonical_email_v2(v_email)
     OR v_email IS DISTINCT FROM v_probe_email THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id = v_owner_id
    AND event_row.owner_user_id <> p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;

  SELECT participation.* INTO v_candidate
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = participation.event_id
   AND guest.id = participation.event_guest_id
   AND guest.status = 'active'
  WHERE participation.event_id = p_event_id
    AND participation.access_state = 'active'
    AND participation.recipient_user_id IS NULL
    AND participation.recipient_email_canonical = v_email
    AND NOT EXISTS (
      SELECT 1 FROM public.teskeid_event_participations AS bound_self
      WHERE bound_self.event_id = participation.event_id
        AND bound_self.event_guest_id <> participation.event_guest_id
        AND bound_self.recipient_user_id = p_actor_id
    )
  ORDER BY participation.event_guest_id
  LIMIT 2;
  IF v_candidate.event_guest_id IS NULL THEN RETURN 0; END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
     AND guest.status = 'active'
    WHERE participation.event_id = p_event_id
      AND participation.access_state = 'active'
      AND participation.recipient_user_id IS NULL
      AND participation.recipient_email_canonical = v_email
  ) <> 1 THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = v_candidate.event_guest_id
    AND guest.status = 'active'
  FOR UPDATE;

  SELECT invitation.* INTO v_invitation
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.event_id = p_event_id
    AND invitation.event_guest_id = v_candidate.event_guest_id
  ORDER BY invitation.created_at DESC,invitation.id DESC
  LIMIT 1;
  SELECT anchor.* INTO v_anchor
  FROM public.teskeid_event_participation_invitation_generations_v3 AS anchor
  WHERE anchor.event_id = p_event_id
    AND anchor.event_guest_id = v_candidate.event_guest_id
    AND anchor.identity_generation = v_candidate.identity_generation;
  IF v_invitation.id IS NULL THEN
    IF v_anchor.invitation_id IS NOT NULL THEN
      RAISE EXCEPTION 'teskeid_event_not_found';
    END IF;
  ELSIF (
       v_invitation.status IN ('pending','accepted','declined','expired')
       OR (v_invitation.status='cancelled' AND EXISTS (
         SELECT 1
         FROM public.teskeid_event_participation_invitation_terminalizations
           AS terminalization
         WHERE terminalization.invitation_id=v_invitation.id
           AND terminalization.event_id=p_event_id
           AND terminalization.event_guest_id=v_candidate.event_guest_id
           AND terminalization.identity_generation=v_candidate.identity_generation
           AND terminalization.reason='identity_claim'
       ))
     ) THEN
    IF v_anchor.invitation_id IS DISTINCT FROM v_invitation.id THEN
      RAISE EXCEPTION 'teskeid_event_not_found';
    END IF;
    SELECT locked_invitation.* INTO v_invitation
    FROM public.teskeid_event_guest_invitations AS locked_invitation
    WHERE locked_invitation.id=v_anchor.invitation_id
      AND locked_invitation.event_id=v_anchor.event_id
      AND locked_invitation.event_guest_id=v_anchor.event_guest_id
    FOR UPDATE;
  ELSE
    -- A terminal invitation is never bypassed as an anchorless manual row.
    -- Only a participation with no invitation history can use this path.
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;

  SELECT participation.* INTO v_candidate
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = v_candidate.event_guest_id
    AND participation.identity_generation = v_candidate.identity_generation
    AND participation.access_state = 'active'
    AND participation.recipient_user_id IS NULL
    AND participation.recipient_email_canonical = v_email
  FOR UPDATE;
  IF v_candidate.event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_candidate.identity_version = 9223372036854775807 THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  IF v_anchor.invitation_id IS NOT NULL THEN
    PERFORM anchor.invitation_id
    FROM public.teskeid_event_participation_invitation_generations_v3 AS anchor
    WHERE anchor.invitation_id = v_anchor.invitation_id
      AND anchor.event_id = p_event_id
      AND anchor.event_guest_id = v_candidate.event_guest_id
      AND anchor.identity_generation = v_candidate.identity_generation
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  END IF;

  IF v_invitation.status = 'pending' THEN
    IF v_invitation.recipient_email_canonical IS DISTINCT FROM v_email THEN
      RAISE EXCEPTION 'teskeid_event_not_found';
    END IF;
    INSERT INTO
      public.teskeid_event_participation_invitation_terminalizations (
        invitation_id, event_id, event_guest_id,
        identity_generation, reason
      ) VALUES (
        v_invitation.id, p_event_id, v_candidate.event_guest_id,
        v_candidate.identity_generation, 'identity_claim'
      ) ON CONFLICT (invitation_id) DO NOTHING;
    IF NOT EXISTS (
      SELECT 1
      FROM public.teskeid_event_participation_invitation_terminalizations
        AS terminalization
      WHERE terminalization.invitation_id = v_invitation.id
        AND terminalization.event_id = p_event_id
        AND terminalization.event_guest_id = v_candidate.event_guest_id
        AND terminalization.identity_generation =
          v_candidate.identity_generation
        AND terminalization.reason = 'identity_claim'
    ) THEN
      RAISE EXCEPTION 'teskeid_event_not_found';
    END IF;
  END IF;
  UPDATE public.teskeid_event_participations AS participation
  SET recipient_user_id = p_actor_id,
      recipient_email_canonical = NULL,
      identity_claimed_at = COALESCE(
        participation.identity_claimed_at, pg_catalog.now()
      ),
      claim_source_invitation_id = v_invitation.id,
      identity_version = participation.identity_version + 1,
      updated_at = pg_catalog.now()
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = v_candidate.event_guest_id
    AND participation.identity_generation = v_candidate.identity_generation
    AND participation.access_state = 'active'
    AND participation.recipient_user_id IS NULL
    AND participation.recipient_email_canonical = v_email;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  IF v_invitation.status = 'pending' THEN
    PERFORM public.teskeid_event_attendance_terminalize_invitations(
      ARRAY[v_invitation.id], 'cancelled'
    );
  END IF;
  RETURN 1;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_scope_v3(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid;
  v_participation public.teskeid_event_participations%ROWTYPE;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  SELECT event_row.owner_user_id INTO v_owner_id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  IF v_owner_id = p_actor_id THEN
    PERFORM public.teskeid_event_assert_actor(p_actor_id);
    RETURN pg_catalog.jsonb_build_object(
      'viewer_role', 'owner', 'event_guest_id', NULL,
      'identity_generation', NULL
    );
  END IF;
  PERFORM public.teskeid_event_private_claim_scoped_v3(
    p_actor_id, p_event_id
  );
  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = participation.event_id
   AND guest.id = participation.event_guest_id
   AND guest.status = 'active'
  JOIN public.teskeid_event_participation_rsvp_v3 AS decision
    ON decision.event_id = participation.event_id
   AND decision.event_guest_id = participation.event_guest_id
   AND decision.identity_generation = participation.identity_generation
   AND decision.decision_version = participation.rsvp_version
  WHERE participation.event_id = p_event_id
    AND participation.recipient_user_id = p_actor_id
    AND participation.access_state = 'active';
  IF v_participation.event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'viewer_role', 'attendee',
    'event_guest_id', v_participation.event_guest_id,
    'identity_generation', v_participation.identity_generation::text
  );
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_person_projection_v3(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_position integer,
  p_is_self boolean,
  p_include_private_note boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_base jsonb;
  v_decision public.teskeid_event_participation_rsvp_v3%ROWTYPE;
  v_result jsonb;
BEGIN
  v_base := public.teskeid_event_private_person_projection_v2(
    p_actor_id, p_event_id, p_event_guest_id, p_position, p_is_self
  );
  SELECT decision.* INTO v_decision
  FROM public.teskeid_event_participation_rsvp_v3 AS decision
  JOIN public.teskeid_event_participations AS participation
    ON participation.event_id = decision.event_id
   AND participation.event_guest_id = decision.event_guest_id
   AND participation.identity_generation = decision.identity_generation
   AND participation.rsvp_version = decision.decision_version
   AND participation.access_state = 'active'
  WHERE decision.event_id = p_event_id
    AND decision.event_guest_id = p_event_guest_id;
  IF v_decision.event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  v_base := v_base - 'rsvp_version';
  v_base := pg_catalog.jsonb_set(
    v_base, '{shared,rsvp_state}',
    pg_catalog.to_jsonb(v_decision.effective_state), false
  );
  v_base := pg_catalog.jsonb_set(
    v_base, '{shared,bulk_eligible}',
    pg_catalog.to_jsonb(
      (v_base->'shared'->>'disabled_reason') IS NULL
      AND v_decision.effective_state <> 'not_attending'
    ), false
  );
  v_result := v_base || pg_catalog.jsonb_build_object(
    'rsvp', pg_catalog.jsonb_build_object(
      'state', v_decision.effective_state,
      'decision_version', v_decision.decision_version::text
    )
  );
  IF p_include_private_note
     AND v_decision.effective_state = 'considering'
     AND v_decision.private_note IS NOT NULL THEN
    v_result := pg_catalog.jsonb_set(
      v_result, '{rsvp}',
      v_result->'rsvp' || pg_catalog.jsonb_build_object(
        'private_note', v_decision.private_note
      )
    );
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_private_people_projection_v3(
  p_actor_id uuid,
  p_event_id uuid,
  p_viewer_role text,
  p_self_event_guest_id uuid,
  p_include_rsvp_notes boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_people jsonb;
BEGIN
  IF p_viewer_role NOT IN ('owner','attendee') THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  WITH guest_positions AS (
    SELECT guest.id AS event_guest_id,
      (pg_catalog.row_number() OVER (
        ORDER BY guest.position, guest.id
      ))::integer AS position
    FROM public.teskeid_event_guests AS guest
    JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = guest.event_id
     AND participation.event_guest_id = guest.id
     AND participation.access_state = 'active'
    JOIN public.teskeid_event_participation_rsvp_v3 AS decision
      ON decision.event_id = participation.event_id
     AND decision.event_guest_id = participation.event_guest_id
     AND decision.identity_generation = participation.identity_generation
     AND decision.decision_version = participation.rsvp_version
    WHERE guest.event_id = p_event_id
      AND guest.status = 'active'
  ), projected AS (
    SELECT 0 AS position,
      public.teskeid_event_private_organizer_projection_v2(
        p_actor_id, p_event_id, 0
      ) AS person
    UNION ALL
    SELECT guest_position.position,
      public.teskeid_event_private_person_projection_v3(
        p_actor_id, p_event_id, guest_position.event_guest_id,
        guest_position.position,
        guest_position.event_guest_id IS NOT DISTINCT FROM
          p_self_event_guest_id,
        p_include_rsvp_notes AND (
          p_viewer_role = 'owner'
          OR guest_position.event_guest_id IS NOT DISTINCT FROM
            p_self_event_guest_id
        )
      ) AS person
    FROM guest_positions AS guest_position
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    projected.person ORDER BY projected.position
  ), '[]'::jsonb) INTO v_people
  FROM projected;
  IF pg_catalog.jsonb_array_length(v_people) < 1
     OR pg_catalog.jsonb_array_length(v_people) > 50 THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  RETURN v_people;
END;
$function$;

CREATE FUNCTION public.teskeid_event_resolve_invitation_v3(
  p_actor_id uuid,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_event_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  IF p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  SELECT public.normalize_email_canonical(account.email)
  INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL;
  SELECT anchor.event_id INTO v_event_id
  FROM public.teskeid_event_participation_invitation_generations_v3 AS anchor
  JOIN public.teskeid_event_participations AS participation
    ON participation.event_id = anchor.event_id
   AND participation.event_guest_id = anchor.event_guest_id
   AND participation.identity_generation = anchor.identity_generation
   AND participation.access_state = 'active'
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = anchor.event_id
   AND guest.id = anchor.event_guest_id
   AND guest.status = 'active'
  WHERE anchor.invitation_id = p_invitation_id
    AND (
      participation.recipient_user_id = p_actor_id
      OR (
        participation.recipient_user_id IS NULL
        AND public.teskeid_event_private_valid_canonical_email_v2(v_email)
        AND participation.recipient_email_canonical = v_email
      )
    );
  IF v_event_id IS NULL THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  PERFORM public.teskeid_event_private_claim_scoped_v3(
    p_actor_id, v_event_id
  );
  SELECT pg_catalog.jsonb_build_object(
    'status', CASE
      WHEN terminalization.invitation_id IS NOT NULL THEN 'claimed'
      ELSE invitation.status
    END,
    'event_id', anchor.event_id,
    'capability', 'active_participant'
  ) INTO v_result
  FROM public.teskeid_event_participation_invitation_generations_v3 AS anchor
  JOIN public.teskeid_event_participations AS participation
    ON participation.event_id = anchor.event_id
   AND participation.event_guest_id = anchor.event_guest_id
   AND participation.identity_generation = anchor.identity_generation
   AND participation.access_state = 'active'
   AND participation.recipient_user_id = p_actor_id
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = anchor.event_id
   AND guest.id = anchor.event_guest_id
   AND guest.status = 'active'
  JOIN public.teskeid_event_guest_invitations AS invitation
    ON invitation.id = anchor.invitation_id
   AND invitation.event_id = anchor.event_id
   AND invitation.event_guest_id = anchor.event_guest_id
  LEFT JOIN
    public.teskeid_event_participation_invitation_terminalizations
      AS terminalization
    ON terminalization.invitation_id = anchor.invitation_id
   AND terminalization.event_id = anchor.event_id
   AND terminalization.event_guest_id = anchor.event_guest_id
   AND terminalization.identity_generation = anchor.identity_generation
   AND terminalization.reason = 'identity_claim'
  WHERE anchor.invitation_id = p_invitation_id
    AND (
      invitation.status IN ('pending','accepted','declined','expired')
      OR (invitation.status = 'cancelled'
        AND terminalization.invitation_id IS NOT NULL)
    );
  IF v_result IS NULL THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_scoped_participations_v3(
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_locked_email text;
  v_candidate_count integer;
  v_candidate record;
  v_candidate_event_ids uuid[] := ARRAY[]::uuid[];
  v_candidate_owner_ids uuid[] := ARRAY[]::uuid[];
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  SELECT public.normalize_email_canonical(account.email)
  INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL;
  IF public.teskeid_event_private_valid_canonical_email_v2(v_email) THEN
    SELECT COALESCE(pg_catalog.array_agg(
      candidate.event_id ORDER BY candidate.owner_user_id, candidate.event_id
    ), ARRAY[]::uuid[]),
      COALESCE(pg_catalog.array_agg(
        candidate.owner_user_id
        ORDER BY candidate.owner_user_id, candidate.event_id
      ), ARRAY[]::uuid[])
    INTO v_candidate_event_ids, v_candidate_owner_ids
    FROM (
      SELECT participation.event_id, event_row.owner_user_id
      FROM public.teskeid_event_participations AS participation
      JOIN public.teskeid_event_guests AS guest
        ON guest.event_id = participation.event_id
       AND guest.id = participation.event_guest_id
       AND guest.status = 'active'
      JOIN public.teskeid_events AS event_row
        ON event_row.id = participation.event_id
       AND event_row.owner_user_id <> p_actor_id
      LEFT JOIN LATERAL (
        SELECT invitation.id,invitation.status
        FROM public.teskeid_event_guest_invitations AS invitation
        WHERE invitation.event_id=participation.event_id
          AND invitation.event_guest_id=participation.event_guest_id
        ORDER BY invitation.created_at DESC,invitation.id DESC
        LIMIT 1
      ) AS latest_invitation ON true
      LEFT JOIN
        public.teskeid_event_participation_invitation_generations_v3
          AS current_anchor
        ON current_anchor.event_id=participation.event_id
       AND current_anchor.event_guest_id=participation.event_guest_id
       AND current_anchor.identity_generation=
         participation.identity_generation
      WHERE participation.access_state = 'active'
        AND participation.recipient_user_id IS NULL
        AND participation.recipient_email_canonical = v_email
        AND NOT EXISTS (
          SELECT 1
          FROM public.teskeid_event_participations AS bound_self
          WHERE bound_self.event_id = participation.event_id
            AND bound_self.recipient_user_id = p_actor_id
        )
        AND (
          (latest_invitation.id IS NULL
            AND current_anchor.invitation_id IS NULL)
          OR (
            current_anchor.invitation_id=latest_invitation.id
            AND (
              latest_invitation.status IN (
                'pending','accepted','declined','expired'
              )
              OR (latest_invitation.status='cancelled' AND EXISTS (
                SELECT 1
                FROM
                  public.teskeid_event_participation_invitation_terminalizations
                    AS terminalization
                WHERE terminalization.invitation_id=latest_invitation.id
                  AND terminalization.event_id=participation.event_id
                  AND terminalization.event_guest_id=
                    participation.event_guest_id
                  AND terminalization.identity_generation=
                    participation.identity_generation
                  AND terminalization.reason='identity_claim'
              ))
            )
          )
        )
      ORDER BY event_row.owner_user_id, participation.event_id
      LIMIT 100
    ) AS candidate;
    v_candidate_count := pg_catalog.cardinality(v_candidate_event_ids);
    IF v_candidate_count > 0 THEN
      FOR v_candidate IN
        SELECT DISTINCT owner_id
        FROM pg_catalog.unnest(v_candidate_owner_ids)
          AS owner_values(owner_id)
        ORDER BY owner_id
      LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(v_candidate.owner_id::text, 13201)
        );
      END LOOP;
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_email, 9702)
      );
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_actor_id::text, 9602)
      );
      SELECT public.normalize_email_canonical(account.email)
      INTO v_locked_email
      FROM auth.users AS account
      WHERE account.id = p_actor_id
        AND account.email_confirmed_at IS NOT NULL
      FOR SHARE OF account;
      IF NOT public.teskeid_event_private_valid_canonical_email_v2(
        v_locked_email
      ) OR v_locked_email IS DISTINCT FROM v_email THEN
        RAISE EXCEPTION 'teskeid_event_not_found';
      END IF;
      PERFORM event_row.id
      FROM public.teskeid_events AS event_row
      WHERE event_row.id = ANY(v_candidate_event_ids)
      ORDER BY event_row.id
      FOR UPDATE;
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(
          v_candidate_event_ids,v_candidate_owner_ids
        ) AS expected_pair(event_id,owner_user_id)
        LEFT JOIN public.teskeid_events AS event_row
          ON event_row.id = expected_pair.event_id
         AND event_row.owner_user_id = expected_pair.owner_user_id
        WHERE event_row.id IS NULL
      ) THEN
        RAISE EXCEPTION 'teskeid_event_unavailable';
      END IF;
      FOR v_candidate IN
        SELECT DISTINCT candidate_event_id AS event_id
        FROM pg_catalog.unnest(v_candidate_event_ids)
          AS event_values(candidate_event_id)
        ORDER BY candidate_event_id
      LOOP
        PERFORM public.teskeid_event_private_claim_scoped_v3(
          p_actor_id, v_candidate.event_id
        );
      END LOOP;
    END IF;
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'participating', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_id', event_row.id,
        'name', public.teskeid_event_private_normalize_shared_name_v2(
          event_row.name
        ),
        'active_guest_count', (
          SELECT pg_catalog.count(*)::integer
          FROM public.teskeid_event_guests AS roster_guest
          JOIN public.teskeid_event_participations AS roster_participation
            ON roster_participation.event_id = roster_guest.event_id
           AND roster_participation.event_guest_id = roster_guest.id
           AND roster_participation.access_state = 'active'
          WHERE roster_guest.event_id = event_row.id
            AND roster_guest.status = 'active'
        ),
        'roster_revision', event_row.roster_revision::text,
        'viewer_role', 'attendee',
        'self_rsvp_state', decision.effective_state,
        'self_decision_version', decision.decision_version::text,
        'created_at', public.teskeid_event_private_format_utc_timestamp_v2(
          event_row.created_at
        ),
        'updated_at', public.teskeid_event_private_format_utc_timestamp_v2(
          event_row.updated_at
        )
      ) ORDER BY event_row.created_at DESC, event_row.id DESC)
      FROM (
        SELECT bounded_participation.*
        FROM public.teskeid_event_participations AS bounded_participation
        JOIN public.teskeid_event_guests AS bounded_guest
          ON bounded_guest.event_id = bounded_participation.event_id
         AND bounded_guest.id = bounded_participation.event_guest_id
         AND bounded_guest.status = 'active'
        JOIN public.teskeid_events AS bounded_event
          ON bounded_event.id = bounded_participation.event_id
         AND bounded_event.owner_user_id <> p_actor_id
        WHERE bounded_participation.recipient_user_id = p_actor_id
          AND bounded_participation.access_state = 'active'
        ORDER BY bounded_event.created_at DESC, bounded_event.id DESC
        LIMIT 100
      ) AS participation
      JOIN public.teskeid_event_participation_rsvp_v3 AS decision
        ON decision.event_id = participation.event_id
       AND decision.event_guest_id = participation.event_guest_id
       AND decision.identity_generation = participation.identity_generation
       AND decision.decision_version = participation.rsvp_version
      JOIN public.teskeid_event_guests AS self_guest
        ON self_guest.event_id = participation.event_id
       AND self_guest.id = participation.event_guest_id
       AND self_guest.status = 'active'
      JOIN public.teskeid_events AS event_row
        ON event_row.id = participation.event_id
       AND event_row.owner_user_id <> p_actor_id
    ), '[]'::jsonb),
    'participating_has_more', EXISTS (
        SELECT 1
        FROM public.teskeid_event_participations AS overflow_participation
        JOIN public.teskeid_event_guests AS overflow_guest
          ON overflow_guest.event_id = overflow_participation.event_id
         AND overflow_guest.id = overflow_participation.event_guest_id
         AND overflow_guest.status = 'active'
        JOIN public.teskeid_events AS overflow_event
          ON overflow_event.id = overflow_participation.event_id
         AND overflow_event.owner_user_id <> p_actor_id
        WHERE overflow_participation.recipient_user_id = p_actor_id
          AND overflow_participation.access_state = 'active'
        OFFSET 100
        LIMIT 1
      ),
    'claim_has_more', (
      public.teskeid_event_private_valid_canonical_email_v2(v_email)
      AND EXISTS (
          SELECT 1
          FROM public.teskeid_event_participations AS remaining
          JOIN public.teskeid_event_guests AS remaining_guest
            ON remaining_guest.event_id = remaining.event_id
           AND remaining_guest.id = remaining.event_guest_id
           AND remaining_guest.status = 'active'
          JOIN public.teskeid_events AS remaining_event
            ON remaining_event.id = remaining.event_id
           AND remaining_event.owner_user_id <> p_actor_id
          LEFT JOIN LATERAL (
            SELECT invitation.id,invitation.status
            FROM public.teskeid_event_guest_invitations AS invitation
            WHERE invitation.event_id=remaining.event_id
              AND invitation.event_guest_id=remaining.event_guest_id
            ORDER BY invitation.created_at DESC,invitation.id DESC
            LIMIT 1
          ) AS latest_invitation ON true
          LEFT JOIN
            public.teskeid_event_participation_invitation_generations_v3
              AS current_anchor
            ON current_anchor.event_id=remaining.event_id
           AND current_anchor.event_guest_id=remaining.event_guest_id
           AND current_anchor.identity_generation=
             remaining.identity_generation
          WHERE remaining.access_state = 'active'
            AND remaining.recipient_user_id IS NULL
            AND remaining.recipient_email_canonical = v_email
            AND NOT EXISTS (
              SELECT 1
              FROM public.teskeid_event_participations AS bound_self
              WHERE bound_self.event_id = remaining.event_id
                AND bound_self.recipient_user_id = p_actor_id
            )
            AND (
              (latest_invitation.id IS NULL
                AND current_anchor.invitation_id IS NULL)
              OR (
                current_anchor.invitation_id=latest_invitation.id
                AND (
                  latest_invitation.status IN (
                    'pending','accepted','declined','expired'
                  )
                  OR (latest_invitation.status='cancelled' AND EXISTS (
                    SELECT 1
                    FROM
                      public.teskeid_event_participation_invitation_terminalizations
                        AS terminalization
                    WHERE terminalization.invitation_id=latest_invitation.id
                      AND terminalization.event_id=remaining.event_id
                      AND terminalization.event_guest_id=
                        remaining.event_guest_id
                      AND terminalization.identity_generation=
                        remaining.identity_generation
                      AND terminalization.reason='identity_claim'
                  ))
                )
              )
            )
      )
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_actor_view_v3(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope jsonb;
  v_role text;
  v_self_guest_id uuid;
  v_self_identity_generation bigint;
  v_result jsonb;
BEGIN
  v_scope := public.teskeid_event_private_scope_v3(
    p_actor_id, p_event_id
  );
  v_role := v_scope->>'viewer_role';
  v_self_guest_id := (v_scope->>'event_guest_id')::uuid;
  v_self_identity_generation :=
    (v_scope->>'identity_generation')::bigint;
  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', public.teskeid_event_private_normalize_shared_name_v2(
      event_row.name
    ),
    'roster_revision', event_row.roster_revision::text,
    'viewer_role', v_role,
    'created_at', public.teskeid_event_private_format_utc_timestamp_v2(
      event_row.created_at
    ),
    'updated_at', public.teskeid_event_private_format_utc_timestamp_v2(
      event_row.updated_at
    ),
    'event_date', details.event_date,
    'event_time', CASE WHEN details.event_time IS NULL THEN NULL
      ELSE pg_catalog.to_char(
        date '2000-01-01' + details.event_time, 'HH24:MI:SS'
      ) END,
    'description', NULLIF(
      public.teskeid_event_private_normalize_shared_name_v2(
        pg_catalog.replace(pg_catalog.replace(
          details.description, E'\r\n', E'\n'
        ), E'\r', E'\n')
      ), ''
    ),
    'agenda', NULLIF(
      public.teskeid_event_private_normalize_shared_name_v2(
        pg_catalog.replace(pg_catalog.replace(
          details.agenda, E'\r\n', E'\n'
        ), E'\r', E'\n')
      ), ''
    ),
    'people', public.teskeid_event_private_people_projection_v3(
      p_actor_id, p_event_id, v_role, v_self_guest_id, true
    )
  ) || CASE WHEN current_self.event_guest_id IS NULL THEN '{}'::jsonb
       ELSE pg_catalog.jsonb_build_object(
         'self_rsvp', pg_catalog.jsonb_build_object(
           'state', current_self.effective_state,
           'decision_version', current_self.decision_version::text
         ) || CASE WHEN current_self.effective_state = 'considering'
                         AND current_self.private_note IS NOT NULL
           THEN pg_catalog.jsonb_build_object(
             'private_note', current_self.private_note
           ) ELSE '{}'::jsonb END
       ) END
  INTO v_result
  FROM public.teskeid_events AS event_row
  LEFT JOIN public.teskeid_event_details AS details
    ON details.event_id = event_row.id
  LEFT JOIN LATERAL (
    SELECT participation.event_guest_id, decision.effective_state,
      decision.private_note, decision.decision_version
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
     AND guest.status = 'active'
    JOIN public.teskeid_event_participation_rsvp_v3 AS decision
      ON decision.event_id = participation.event_id
     AND decision.event_guest_id = participation.event_guest_id
     AND decision.identity_generation = participation.identity_generation
     AND decision.decision_version = participation.rsvp_version
    WHERE v_role = 'attendee'
      AND participation.event_id = event_row.id
      AND participation.event_guest_id = v_self_guest_id
      AND participation.identity_generation =
        v_self_identity_generation
      AND participation.recipient_user_id = p_actor_id
      AND participation.access_state = 'active'
  ) AS current_self ON true
  WHERE event_row.id = p_event_id
    AND (
      (v_role = 'owner'
        AND event_row.owner_user_id = p_actor_id
        AND public.teskeid_event_has_access(p_actor_id))
      OR (v_role = 'attendee'
        AND event_row.owner_user_id <> p_actor_id
        AND current_self.event_guest_id IS NOT NULL)
    );
  IF v_result IS NULL THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_for_actor_v3(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scoped jsonb;
  v_result jsonb;
BEGIN
  v_scoped := public.teskeid_event_list_scoped_participations_v3(
    p_actor_id
  );
  SELECT pg_catalog.jsonb_build_object(
    'owned', CASE WHEN owner_authority.allowed THEN COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_id', event_row.id,
        'name', public.teskeid_event_private_normalize_shared_name_v2(
          event_row.name
        ),
        'active_guest_count', (
          SELECT pg_catalog.count(*)::integer
          FROM public.teskeid_event_guests AS guest
          JOIN public.teskeid_event_participations AS participation
            ON participation.event_id = guest.event_id
           AND participation.event_guest_id = guest.id
           AND participation.access_state = 'active'
          WHERE guest.event_id = event_row.id
            AND guest.status = 'active'
        ),
        'roster_revision', event_row.roster_revision::text,
        'viewer_role', 'owner',
        'created_at', public.teskeid_event_private_format_utc_timestamp_v2(
          event_row.created_at
        ),
        'updated_at', public.teskeid_event_private_format_utc_timestamp_v2(
          event_row.updated_at
        )
      ) ORDER BY event_row.created_at DESC, event_row.id DESC)
      FROM (
        SELECT candidate.*
        FROM public.teskeid_events AS candidate
        WHERE candidate.owner_user_id = p_actor_id
          AND owner_authority.allowed
        ORDER BY candidate.created_at DESC, candidate.id DESC
        LIMIT 100
      ) AS event_row
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'owned_has_more', owner_authority.allowed AND EXISTS (
      SELECT 1
      FROM public.teskeid_events AS overflow_event
      WHERE overflow_event.owner_user_id = p_actor_id
      OFFSET 100
      LIMIT 1
    ),
    'participating', v_scoped->'participating',
    'participating_has_more', v_scoped->'participating_has_more',
    'claim_has_more', v_scoped->'claim_has_more'
  ) INTO v_result
  FROM (
    SELECT public.teskeid_event_has_access(p_actor_id) AS allowed
  ) AS owner_authority;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_list_person_source_events_v3(
  p_actor_id uuid,
  p_before_sort_at timestamptz,
  p_before_event_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_list_scoped_participations_v3(p_actor_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
     OR ((p_before_sort_at IS NULL) <> (p_before_event_id IS NULL))
     OR (p_before_sort_at IS NOT NULL AND (
       NOT pg_catalog.isfinite(p_before_sort_at)
       OR p_before_sort_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
     )) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  WITH visible_candidates AS (
    SELECT event_row.id AS event_id, event_row.name,
      event_row.roster_revision, 'owner'::text AS viewer_role,
      event_row.created_at AS visible_sort_at, 0 AS role_priority,
      NULL::text AS self_rsvp_state,
      NULL::bigint AS self_decision_version
    FROM public.teskeid_events AS event_row
    WHERE event_row.owner_user_id = p_actor_id
      AND public.teskeid_event_has_access(p_actor_id)
    UNION ALL
    SELECT event_row.id, event_row.name, event_row.roster_revision,
      'attendee'::text, event_row.created_at, 1,
      decision.effective_state, decision.decision_version
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_participation_rsvp_v3 AS decision
      ON decision.event_id = participation.event_id
     AND decision.event_guest_id = participation.event_guest_id
     AND decision.identity_generation = participation.identity_generation
     AND decision.decision_version = participation.rsvp_version
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
     AND guest.status = 'active'
    JOIN public.teskeid_events AS event_row
      ON event_row.id = participation.event_id
    WHERE participation.recipient_user_id = p_actor_id
      AND participation.access_state = 'active'
      AND event_row.owner_user_id <> p_actor_id
  ), owner_precedence AS (
    SELECT DISTINCT ON (candidate.event_id) candidate.*
    FROM visible_candidates AS candidate
    ORDER BY candidate.event_id, candidate.role_priority
  ), bounded AS (
    SELECT candidate.*,
      1 + (
        SELECT pg_catalog.count(*)::integer
        FROM public.teskeid_event_guests AS guest
        JOIN public.teskeid_event_participations AS participation
          ON participation.event_id = guest.event_id
         AND participation.event_guest_id = guest.id
         AND participation.access_state = 'active'
        WHERE guest.event_id = candidate.event_id
          AND guest.status = 'active'
      ) AS active_person_count
    FROM owner_precedence AS candidate
    WHERE p_before_sort_at IS NULL
       OR (candidate.visible_sort_at, candidate.event_id)
          < (p_before_sort_at, p_before_event_id)
    ORDER BY candidate.visible_sort_at DESC, candidate.event_id DESC
    LIMIT p_limit + 1
  ), numbered AS (
    SELECT bounded.*,
      pg_catalog.row_number() OVER (
        ORDER BY bounded.visible_sort_at DESC, bounded.event_id DESC
      ) AS row_number
    FROM bounded
  )
  SELECT pg_catalog.jsonb_build_object(
    'events', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_id', page_row.event_id,
        'name', public.teskeid_event_private_normalize_shared_name_v2(
          page_row.name
        ),
        'roster_revision', page_row.roster_revision::text,
        'viewer_role', page_row.viewer_role,
        'active_person_count', page_row.active_person_count
      ) || CASE WHEN page_row.viewer_role = 'attendee' THEN
        pg_catalog.jsonb_build_object(
          'self_rsvp_state', page_row.self_rsvp_state,
          'self_decision_version', page_row.self_decision_version::text
        ) ELSE '{}'::jsonb END
      ORDER BY page_row.visible_sort_at DESC, page_row.event_id DESC)
      FROM numbered AS page_row
      WHERE page_row.row_number <= p_limit
    ), '[]'::jsonb),
    'next_cursor', CASE WHEN EXISTS (
      SELECT 1 FROM numbered AS extra_row
      WHERE extra_row.row_number = p_limit + 1
    ) THEN (
      SELECT pg_catalog.jsonb_build_object(
        'before_sort_at',
          public.teskeid_event_private_format_utc_timestamp_v2(
            cursor_row.visible_sort_at
          ),
        'before_event_id', cursor_row.event_id
      )
      FROM numbered AS cursor_row
      WHERE cursor_row.row_number = p_limit
    ) ELSE NULL END
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_get_person_source_roster_v3(
  p_actor_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope jsonb;
  v_role text;
  v_self_guest_id uuid;
  v_self_identity_generation bigint;
  v_result jsonb;
BEGIN
  v_scope := public.teskeid_event_private_scope_v3(
    p_actor_id, p_event_id
  );
  v_role := v_scope->>'viewer_role';
  v_self_guest_id := (v_scope->>'event_guest_id')::uuid;
  v_self_identity_generation :=
    (v_scope->>'identity_generation')::bigint;
  SELECT pg_catalog.jsonb_build_object(
    'event_id', event_row.id,
    'name', public.teskeid_event_private_normalize_shared_name_v2(
      event_row.name
    ),
    'roster_revision', event_row.roster_revision::text,
    'viewer_role', v_role,
    'people', public.teskeid_event_private_people_projection_v3(
      p_actor_id, p_event_id, v_role, v_self_guest_id, false
    )
  ) INTO v_result
  FROM public.teskeid_events AS event_row
  LEFT JOIN LATERAL (
    SELECT participation.event_guest_id
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
     AND guest.status = 'active'
    JOIN public.teskeid_event_participation_rsvp_v3 AS decision
      ON decision.event_id = participation.event_id
     AND decision.event_guest_id = participation.event_guest_id
     AND decision.identity_generation = participation.identity_generation
     AND decision.decision_version = participation.rsvp_version
    WHERE v_role = 'attendee'
      AND participation.event_id = event_row.id
      AND participation.event_guest_id = v_self_guest_id
      AND participation.identity_generation =
        v_self_identity_generation
      AND participation.recipient_user_id = p_actor_id
      AND participation.access_state = 'active'
  ) AS current_self ON true
  WHERE event_row.id = p_event_id
    AND (
      (v_role = 'owner'
        AND event_row.owner_user_id = p_actor_id
        AND public.teskeid_event_has_access(p_actor_id))
      OR (v_role = 'attendee'
        AND event_row.owner_user_id <> p_actor_id
        AND current_self.event_guest_id IS NOT NULL)
    );
  IF v_result IS NULL THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_set_rsvp_v3(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_identity_generation bigint,
  p_rsvp_state text,
  p_private_note text,
  p_expected_decision_version bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_note text;
  v_fingerprint text;
  v_replay jsonb;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_decision public.teskeid_event_participation_rsvp_v3%ROWTYPE;
  v_status text;
  v_result jsonb;
BEGIN
  PERFORM pg_catalog.nextval(
    'public.teskeid_event_sql153_write_observation_seq'::regclass
  );
  IF p_actor_id IS NULL OR p_event_id IS NULL
     OR p_event_guest_id IS NULL OR p_request_id IS NULL
     OR p_identity_generation IS NULL OR p_identity_generation < 1
     OR p_expected_decision_version IS NULL
     OR p_expected_decision_version < 1
     OR p_rsvp_state IS NULL
     OR p_rsvp_state NOT IN (
       'no_response','considering','attending','not_attending'
     ) OR pg_catalog.octet_length(COALESCE(p_private_note, '')) > 4096
     OR (p_private_note IS NOT NULL AND (
       p_private_note ~ '[[:cntrl:]]'
       OR p_private_note ~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
     )) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_note := public.teskeid_event_private_normalize_note_v3(p_private_note);
  IF (p_rsvp_state <> 'considering' AND p_private_note IS NOT NULL)
     OR (p_private_note IS NOT NULL AND v_note IS NULL
       AND p_private_note !~
         U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]*$')
     OR (v_note IS NOT NULL AND (
       pg_catalog.char_length(v_note) > 240
       OR pg_catalog.octet_length(v_note) > 1920
       OR v_note ~ '[[:cntrl:]]'
       OR v_note ~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
     )) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  PERFORM public.teskeid_event_private_claim_scoped_v3(
    p_actor_id, p_event_id
  );
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE OF account;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_allowed'; END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'identity_generation', p_identity_generation,
    'rsvp_state', p_rsvp_state,
    'private_note', v_note,
    'expected_decision_version', p_expected_decision_version
  )::text);
  v_replay := public.teskeid_event_private_begin_request_v3(
    p_actor_id, p_request_id, 'set_rsvp_v3', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id <> p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
    AND participation.identity_generation = p_identity_generation
    AND participation.recipient_user_id = p_actor_id
    AND participation.access_state = 'active'
  FOR UPDATE;
  IF v_participation.event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  SELECT decision.* INTO v_decision
  FROM public.teskeid_event_participation_rsvp_v3 AS decision
  WHERE decision.event_id = p_event_id
    AND decision.event_guest_id = p_event_guest_id
    AND decision.identity_generation = p_identity_generation
  FOR UPDATE;
  IF v_decision.event_guest_id IS NULL
     OR v_decision.decision_version <> v_participation.rsvp_version THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  IF v_decision.decision_version <> p_expected_decision_version THEN
    RAISE EXCEPTION 'teskeid_event_rsvp_version_conflict';
  END IF;
  IF v_decision.effective_state = p_rsvp_state
     AND v_decision.private_note IS NOT DISTINCT FROM v_note THEN
    v_status := 'unchanged';
  ELSE
    IF v_participation.rsvp_version = 9223372036854775807 THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
    UPDATE public.teskeid_event_participations AS participation
    SET rsvp_state = CASE WHEN p_rsvp_state = 'considering'
          THEN 'no_response' ELSE p_rsvp_state END,
        rsvp_version = participation.rsvp_version + 1,
        rsvp_updated_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE participation.event_id = p_event_id
      AND participation.event_guest_id = p_event_guest_id
    RETURNING participation.* INTO v_participation;
    UPDATE public.teskeid_event_participation_rsvp_v3 AS decision
    SET effective_state = p_rsvp_state,
        private_note = v_note,
        decision_version = v_participation.rsvp_version,
        updated_at = pg_catalog.now()
    WHERE decision.event_id = p_event_id
      AND decision.event_guest_id = p_event_guest_id
      AND decision.identity_generation = p_identity_generation;
    IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_unavailable'; END IF;
    v_status := 'updated';
  END IF;
  SELECT decision.* INTO v_decision
  FROM public.teskeid_event_participation_rsvp_v3 AS decision
  WHERE decision.event_id = p_event_id
    AND decision.event_guest_id = p_event_guest_id
    AND decision.identity_generation = p_identity_generation;
  v_result := pg_catalog.jsonb_build_object(
    'status', v_status,
    'request_id', p_request_id,
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'identity_generation', p_identity_generation::text,
    'access_state', v_participation.access_state,
    'access_version', v_participation.access_version::text,
    'rsvp_state', v_decision.effective_state,
    'decision_version', v_decision.decision_version::text
  );
  PERFORM public.teskeid_event_private_finish_request_v3(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.teskeid_event_leave_participation_v3(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_identity_generation bigint,
  p_expected_identity_version bigint,
  p_expected_access_version bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_membership_probe public.teskeid_event_attendance_memberships%ROWTYPE;
  v_membership public.teskeid_event_attendance_memberships%ROWTYPE;
  v_anchor_invitation_id uuid;
  v_invitation_ids uuid[] := ARRAY[]::uuid[];
  v_pending_ids uuid[] := ARRAY[]::uuid[];
  v_result jsonb;
BEGIN
  PERFORM pg_catalog.nextval(
    'public.teskeid_event_sql153_write_observation_seq'::regclass
  );
  IF p_actor_id IS NULL OR p_event_id IS NULL
     OR p_event_guest_id IS NULL OR p_request_id IS NULL
     OR p_identity_generation IS NULL OR p_identity_generation < 1
     OR p_expected_identity_version IS NULL
     OR p_expected_identity_version < 1
     OR p_expected_access_version IS NULL
     OR p_expected_access_version < 1 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  PERFORM public.teskeid_event_private_claim_scoped_v3(
    p_actor_id, p_event_id
  );
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE OF account;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'identity_generation', p_identity_generation,
    'expected_identity_version', p_expected_identity_version,
    'expected_access_version', p_expected_access_version
  )::text);
  v_replay := public.teskeid_event_private_begin_request_v3(
    p_actor_id, p_request_id, 'leave_v3', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
    AND event_row.owner_user_id <> p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;

  SELECT membership.* INTO v_membership_probe
  FROM public.teskeid_event_attendance_memberships AS membership
  WHERE membership.event_id = p_event_id
    AND membership.event_guest_id = p_event_guest_id
    AND membership.user_id = p_actor_id;
  SELECT anchor.invitation_id INTO v_anchor_invitation_id
  FROM public.teskeid_event_participation_invitation_generations_v3 AS anchor
  WHERE anchor.event_id = p_event_id
    AND anchor.event_guest_id = p_event_guest_id
    AND anchor.identity_generation = p_identity_generation;
  SELECT COALESCE(pg_catalog.array_agg(candidate.id ORDER BY candidate.id),
    ARRAY[]::uuid[]) INTO v_invitation_ids
  FROM (
    SELECT invitation.id
    FROM public.teskeid_event_guest_invitations AS invitation
    WHERE invitation.event_id = p_event_id
      AND invitation.event_guest_id = p_event_guest_id
      AND (
        invitation.status = 'pending'
        OR invitation.id = v_membership_probe.accepted_invitation_id
        OR invitation.id = v_anchor_invitation_id
      )
    ORDER BY invitation.id
    LIMIT 101
    FOR UPDATE
  ) AS candidate;
  IF pg_catalog.cardinality(v_invitation_ids) > 100 THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(
    invitation.id ORDER BY invitation.id
  ), ARRAY[]::uuid[]) INTO v_pending_ids
  FROM public.teskeid_event_guest_invitations AS invitation
  WHERE invitation.id = ANY(v_invitation_ids)
    AND invitation.status = 'pending';
  SELECT membership.* INTO v_membership
  FROM public.teskeid_event_attendance_memberships AS membership
  WHERE membership.event_id = p_event_id
    AND membership.event_guest_id = p_event_guest_id
    AND membership.user_id = p_actor_id
  FOR UPDATE;
  IF v_membership.event_id IS DISTINCT FROM v_membership_probe.event_id
     OR v_membership.accepted_invitation_id IS DISTINCT FROM
       v_membership_probe.accepted_invitation_id THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
    AND participation.recipient_user_id = p_actor_id
    AND participation.access_state = 'active'
  FOR UPDATE;
  IF v_participation.event_guest_id IS NULL
     OR v_participation.identity_generation <> p_identity_generation THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  IF v_participation.identity_version <> p_expected_identity_version
     OR v_participation.access_version <> p_expected_access_version THEN
    RAISE EXCEPTION 'teskeid_event_revision_conflict';
  END IF;
  IF v_participation.access_version = 9223372036854775807 THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  IF v_anchor_invitation_id IS NOT NULL THEN
    PERFORM anchor.invitation_id
    FROM public.teskeid_event_participation_invitation_generations_v3 AS anchor
    WHERE anchor.invitation_id = v_anchor_invitation_id
      AND anchor.event_id = p_event_id
      AND anchor.event_guest_id = p_event_guest_id
      AND anchor.identity_generation = p_identity_generation
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_unavailable'; END IF;
  END IF;
  PERFORM decision.event_guest_id
  FROM public.teskeid_event_participation_rsvp_v3 AS decision
  WHERE decision.event_id = p_event_id
    AND decision.event_guest_id = p_event_guest_id
    AND decision.identity_generation = p_identity_generation
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_unavailable'; END IF;

  IF pg_catalog.cardinality(v_pending_ids) > 0 THEN
    PERFORM public.teskeid_event_attendance_terminalize_invitations(
      v_pending_ids, 'expired'
    );
  END IF;
  IF v_membership.event_id IS NOT NULL THEN
    DELETE FROM public.teskeid_event_attendance_memberships AS membership
    WHERE membership.event_id = p_event_id
      AND membership.event_guest_id = p_event_guest_id
      AND membership.user_id = p_actor_id;
    UPDATE public.teskeid_event_guest_invitations AS invitation
    SET status = 'left',
        recipient_email_canonical = NULL,
        terminal_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE invitation.id = v_membership.accepted_invitation_id
      AND invitation.event_id = p_event_id
      AND invitation.event_guest_id = p_event_guest_id
      AND invitation.accepted_user_id = p_actor_id
      AND invitation.status = 'accepted';
    IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_unavailable'; END IF;
  END IF;
  UPDATE public.teskeid_event_participations AS participation
  SET access_state = 'left',
      access_version = participation.access_version + 1,
      access_updated_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
    AND participation.identity_generation = p_identity_generation
    AND participation.recipient_user_id = p_actor_id
    AND participation.access_state = 'active'
  RETURNING participation.* INTO v_participation;
  IF v_participation.event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  v_result := pg_catalog.jsonb_build_object(
    'status', 'left',
    'request_id', p_request_id,
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'identity_generation', p_identity_generation::text,
    'identity_version', v_participation.identity_version::text,
    'access_version', v_participation.access_version::text
  );
  PERFORM public.teskeid_event_private_finish_request_v3(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.teskeid_event_set_rsvp_v2(
  p_actor_id uuid,
  p_event_id uuid,
  p_event_guest_id uuid,
  p_rsvp_state text,
  p_expected_rsvp_version bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_participation public.teskeid_event_participations%ROWTYPE;
  v_decision public.teskeid_event_participation_rsvp_v3%ROWTYPE;
  v_status text;
  v_result jsonb;
BEGIN
  PERFORM pg_catalog.nextval(
    'public.teskeid_event_sql153_write_observation_seq'::regclass
  );
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  IF p_event_id IS NULL OR p_event_guest_id IS NULL
     OR p_request_id IS NULL OR p_rsvp_state IS NULL
     OR p_rsvp_state NOT IN ('no_response','attending','not_attending')
     OR p_expected_rsvp_version IS NULL OR p_expected_rsvp_version < 1 THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'rsvp_state', p_rsvp_state,
    'expected_rsvp_version', p_expected_rsvp_version
  )::text);
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE OF account;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_allowed'; END IF;
  PERFORM public.teskeid_event_assert_actor(p_actor_id);
  v_replay := public.teskeid_event_private_begin_participation_request_v2(
    p_actor_id, p_request_id, 'set_rsvp_v2', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  PERFORM public.teskeid_event_private_claim_participations_v2(p_actor_id);
  PERFORM event_row.id
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  PERFORM guest.id
  FROM public.teskeid_event_guests AS guest
  WHERE guest.event_id = p_event_id
    AND guest.id = p_event_guest_id
    AND guest.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_not_found'; END IF;
  SELECT participation.* INTO v_participation
  FROM public.teskeid_event_participations AS participation
  WHERE participation.event_id = p_event_id
    AND participation.event_guest_id = p_event_guest_id
    AND participation.recipient_user_id = p_actor_id
    AND participation.access_state = 'active'
  FOR UPDATE;
  IF v_participation.event_guest_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_not_found';
  END IF;
  SELECT decision.* INTO v_decision
  FROM public.teskeid_event_participation_rsvp_v3 AS decision
  WHERE decision.event_id = p_event_id
    AND decision.event_guest_id = p_event_guest_id
    AND decision.identity_generation = v_participation.identity_generation
  FOR UPDATE;
  IF v_decision.event_guest_id IS NULL
     OR v_decision.decision_version <> v_participation.rsvp_version THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;
  IF v_participation.rsvp_version <> p_expected_rsvp_version THEN
    RAISE EXCEPTION 'teskeid_event_rsvp_version_conflict';
  END IF;
  IF v_decision.effective_state = p_rsvp_state THEN
    v_status := 'unchanged';
  ELSE
    IF v_participation.rsvp_version = 9223372036854775807 THEN
      RAISE EXCEPTION 'teskeid_event_unavailable';
    END IF;
    UPDATE public.teskeid_event_participations AS participation
    SET rsvp_state = p_rsvp_state,
        rsvp_version = participation.rsvp_version + 1,
        rsvp_updated_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE participation.event_id = p_event_id
      AND participation.event_guest_id = p_event_guest_id
    RETURNING participation.* INTO v_participation;
    UPDATE public.teskeid_event_participation_rsvp_v3 AS decision
    SET effective_state = p_rsvp_state,
        private_note = NULL,
        decision_version = v_participation.rsvp_version,
        updated_at = pg_catalog.now()
    WHERE decision.event_id = p_event_id
      AND decision.event_guest_id = p_event_guest_id
      AND decision.identity_generation = v_participation.identity_generation;
    IF NOT FOUND THEN RAISE EXCEPTION 'teskeid_event_unavailable'; END IF;
    v_status := 'updated';
  END IF;
  v_result := pg_catalog.jsonb_build_object(
    'status', v_status,
    'request_id', p_request_id,
    'event_id', p_event_id,
    'event_guest_id', p_event_guest_id,
    'access_state', v_participation.access_state,
    'access_version', v_participation.access_version::text,
    'rsvp_state', v_participation.rsvp_state,
    'rsvp_version', v_participation.rsvp_version::text
  );
  PERFORM public.teskeid_event_private_finish_participation_request_v2(
    p_actor_id, p_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

-- Stage ownership and ACLs before the short source-table write-blocking window.
ALTER TABLE public.teskeid_event_participation_rsvp_v3 OWNER TO postgres;
ALTER TABLE public.teskeid_event_participation_invitation_generations_v3
  OWNER TO postgres;
ALTER TABLE public.teskeid_event_participation_mutation_requests_v3
  OWNER TO postgres;
ALTER TABLE public.teskeid_event_sql153_install_baseline OWNER TO postgres;
REVOKE ALL ON TABLE
  public.teskeid_event_participation_rsvp_v3,
  public.teskeid_event_participation_invitation_generations_v3,
  public.teskeid_event_participation_mutation_requests_v3,
  public.teskeid_event_sql153_install_baseline
  FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.teskeid_event_private_normalize_note_v3(text)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_begin_request_v3(
  uuid,uuid,text,text
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_finish_request_v3(
  uuid,uuid,jsonb
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_guard_request_v3()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_bump_generation_rsvp_v3()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_sync_rsvp_v3()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_anchor_invitation_v3(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_anchor_sync_v3()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_assert_rsvp_integrity_v3(
  uuid,uuid
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_rsvp_integrity_trigger_v3()
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_claim_scoped_v3(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_scope_v3(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_person_projection_v3(
  uuid,uuid,uuid,integer,boolean,boolean
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_private_people_projection_v3(
  uuid,uuid,text,uuid,boolean
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_resolve_invitation_v3(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_scoped_participations_v3(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_actor_view_v3(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_for_actor_v3(uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_list_person_source_events_v3(
  uuid,timestamp with time zone,uuid,integer
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_get_person_source_roster_v3(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_set_rsvp_v3(
  uuid,uuid,uuid,bigint,text,text,bigint,uuid
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_leave_participation_v3(
  uuid,uuid,uuid,bigint,bigint,bigint,uuid
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_set_rsvp_v2(
  uuid,uuid,uuid,text,bigint,uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.teskeid_event_private_normalize_note_v3(text),
  public.teskeid_event_private_begin_request_v3(uuid,uuid,text,text),
  public.teskeid_event_private_finish_request_v3(uuid,uuid,jsonb),
  public.teskeid_event_private_guard_request_v3(),
  public.teskeid_event_private_bump_generation_rsvp_v3(),
  public.teskeid_event_private_sync_rsvp_v3(),
  public.teskeid_event_private_anchor_invitation_v3(uuid,uuid),
  public.teskeid_event_private_anchor_sync_v3(),
  public.teskeid_event_private_assert_rsvp_integrity_v3(uuid,uuid),
  public.teskeid_event_private_rsvp_integrity_trigger_v3(),
  public.teskeid_event_private_claim_scoped_v3(uuid,uuid),
  public.teskeid_event_private_scope_v3(uuid,uuid),
  public.teskeid_event_private_person_projection_v3(
    uuid,uuid,uuid,integer,boolean,boolean
  ),
  public.teskeid_event_private_people_projection_v3(
    uuid,uuid,text,uuid,boolean
  )
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.teskeid_event_resolve_invitation_v3(uuid,uuid),
  public.teskeid_event_list_scoped_participations_v3(uuid),
  public.teskeid_event_get_actor_view_v3(uuid,uuid),
  public.teskeid_event_list_for_actor_v3(uuid),
  public.teskeid_event_list_person_source_events_v3(
    uuid,timestamp with time zone,uuid,integer
  ),
  public.teskeid_event_get_person_source_roster_v3(uuid,uuid),
  public.teskeid_event_set_rsvp_v3(
    uuid,uuid,uuid,bigint,text,text,bigint,uuid
  ),
  public.teskeid_event_leave_participation_v3(
    uuid,uuid,uuid,bigint,bigint,bigint,uuid
  ),
  public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Late, deterministic source freeze.  auth.users comes first to match the
-- approved SQL149 auth lifecycle boundary; Event sources then follow their
-- established parent-to-child order.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_events IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_details IN SHARE ROW EXCLUSIVE MODE;
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
LOCK TABLE public.teskeid_event_participation_mutation_requests_v3
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_sql153_install_baseline
  IN SHARE ROW EXCLUSIVE MODE;

-- The read-only preflight and the early prerequisite block are intentionally
-- repeated after the authoritative auth/Event write freeze.  No source fact
-- used by the token fence, RSVP backfill or invitation anchor may change
-- between this guard and the first source write below.
DO $sql153_locked_source_guard$
DECLARE
  v_expected record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    WHERE participation.identity_generation < 1
       OR participation.identity_version < 1
       OR participation.access_version < 1
       OR participation.rsvp_version < 1
       OR (participation.identity_generation > 1
         AND participation.rsvp_version = 9223372036854775807)
       OR participation.rsvp_state NOT IN (
         'no_response','attending','not_attending'
       )
       OR participation.access_state NOT IN ('active','left','revoked')
       OR (participation.recipient_email_canonical IS NOT NULL
         AND NOT public.teskeid_event_private_valid_canonical_email_v2(
           participation.recipient_email_canonical
         ))
       OR (participation.recipient_user_id IS NULL
         AND participation.recipient_email_canonical IS NULL
         AND participation.identity_claimed_at IS NOT NULL
         AND participation.access_state = 'active')
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_guests AS guest
    LEFT JOIN public.teskeid_event_person_labels AS label_row
      ON label_row.event_id = guest.event_id
     AND label_row.event_guest_id = guest.id
    LEFT JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = guest.event_id
     AND participation.event_guest_id = guest.id
    WHERE label_row.event_guest_id IS NULL
       OR participation.event_guest_id IS NULL
       OR (label_row.label_state = 'resolved') IS DISTINCT FROM
          (label_row.shared_display_name IS NOT NULL)
       OR (label_row.shared_display_name IS NOT NULL
         AND NOT public.teskeid_event_private_valid_shared_name_v2(
           label_row.shared_display_name
         ))
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participation_invitation_terminalizations
      AS terminalization
    LEFT JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = terminalization.event_id
     AND participation.event_guest_id = terminalization.event_guest_id
     AND participation.identity_generation =
       terminalization.identity_generation
     AND participation.claim_source_invitation_id =
       terminalization.invitation_id
    LEFT JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.id = terminalization.invitation_id
     AND invitation.event_id = terminalization.event_id
     AND invitation.event_guest_id = terminalization.event_guest_id
    WHERE participation.event_guest_id IS NULL
       OR invitation.id IS NULL
       OR invitation.status <> 'cancelled'
       OR invitation.recipient_email_canonical IS NOT NULL
       OR invitation.accepted_user_id IS NOT NULL
       OR invitation.accepted_at IS NOT NULL
       OR invitation.terminal_at IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.event_id = participation.event_id
     AND invitation.event_guest_id = participation.event_guest_id
     AND invitation.status = 'pending'
    LEFT JOIN auth.users AS account
      ON account.id = participation.recipient_user_id
    WHERE participation.recipient_user_id IS NOT NULL
      AND (
        invitation.invitation_kind = 'identity_and_access'
        OR invitation.recipient_email_canonical IS DISTINCT FROM CASE
          WHEN account.email_confirmed_at IS NOT NULL
            AND public.teskeid_event_private_valid_canonical_email_v2(
              public.normalize_email_canonical(account.email)
            ) THEN public.normalize_email_canonical(account.email)
          ELSE NULL END
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_event_participations AS participation
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = participation.event_id
     AND guest.id = participation.event_guest_id
     AND guest.status = 'active'
    JOIN public.teskeid_events AS event_row
      ON event_row.id = participation.event_id
    LEFT JOIN auth.users AS owner_account
      ON owner_account.id = event_row.owner_user_id
    WHERE participation.recipient_user_id = event_row.owner_user_id
       OR (
         participation.recipient_user_id IS NULL
         AND participation.access_state = 'active'
         AND owner_account.email_confirmed_at IS NOT NULL
         AND participation.recipient_email_canonical =
           public.normalize_email_canonical(owner_account.email)
       )
  ) OR EXISTS (
    SELECT 1
    FROM public.teskeid_events AS event_row
    LEFT JOIN public.teskeid_event_details AS details
      ON details.event_id = event_row.id
    CROSS JOIN LATERAL (
      SELECT
        public.teskeid_event_private_normalize_shared_name_v2(
          event_row.name
        ) AS event_name,
        NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
          pg_catalog.replace(pg_catalog.replace(
            details.description, E'\r\n', E'\n'
          ), E'\r', E'\n')
        ), '') AS description,
        NULLIF(public.teskeid_event_private_normalize_shared_name_v2(
          pg_catalog.replace(pg_catalog.replace(
            details.agenda, E'\r\n', E'\n'
          ), E'\r', E'\n')
        ), '') AS agenda
    ) AS normalized
    WHERE NOT pg_catalog.isfinite(event_row.created_at)
       OR event_row.created_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
       OR NOT pg_catalog.isfinite(event_row.updated_at)
       OR event_row.updated_at NOT BETWEEN
         timestamptz '0001-01-01 00:00:00+00'
         AND timestamptz '9999-12-31 23:59:59.999999+00'
       OR (details.event_date IS NOT NULL AND (
         NOT pg_catalog.isfinite(details.event_date)
         OR details.event_date NOT BETWEEN
           date '0001-01-01' AND date '9999-12-31'
       ))
       OR (details.event_time IS NOT NULL AND (
         details.event_time >= time '24:00:00'
         OR details.event_time IS DISTINCT FROM details.event_time::time(0)
       ))
       OR NOT public.teskeid_event_valid_text(normalized.event_name,1,160)
       OR (normalized.description IS NOT NULL AND (
         pg_catalog.char_length(normalized.description) > 2000
         OR pg_catalog.replace(normalized.description,E'\n','')
           ~ '[[:cntrl:]]'
         OR normalized.description
           ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
       ))
       OR (normalized.agenda IS NOT NULL AND (
         pg_catalog.char_length(normalized.agenda) > 4000
         OR pg_catalog.replace(normalized.agenda,E'\n','')
           ~ '[[:cntrl:]]'
         OR normalized.agenda
           ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
       ))
  ) THEN
    RAISE EXCEPTION 'sql153_locked_source_data_mismatch';
  END IF;

  IF EXISTS (
    WITH expected(
      trigger_name, relation_name, function_signature, trigger_type,
      is_deferrable, initially_deferred, update_columns
    ) AS (
      VALUES
        ('teskeid_event_participation_requests_mutation_guard',
          'public.teskeid_event_participation_mutation_requests',
          'public.teskeid_event_private_guard_participation_request_v2()',
          27,false,false,ARRAY[]::text[]),
        ('teskeid_event_guest_invitations_sql149_bound_guard',
          'public.teskeid_event_guest_invitations',
          'public.teskeid_event_private_guard_bound_invitation_v2()',
          23,false,false,ARRAY[]::text[]),
        ('teskeid_event_sql149_participation_account_email','auth.users',
          'public.teskeid_event_private_auth_email_invitations_v2()',
          17,false,false,ARRAY['email','email_confirmed_at']::text[]),
        ('teskeid_event_participations_account_unlink',
          'public.teskeid_event_participations',
          'public.teskeid_event_private_participation_unlink_v2()',
          19,false,false,ARRAY['recipient_user_id']::text[]),
        ('teskeid_event_sql149_participation_account_delete','auth.users',
          'public.teskeid_event_private_auth_delete_participations_v2()',
          11,false,false,ARRAY[]::text[]),
        ('teskeid_event_guests_sql149_participation_deferred',
          'public.teskeid_event_guests',
          'public.teskeid_event_private_v1_participation_bridge_v2()',
          29,true,true,ARRAY[]::text[]),
        ('teskeid_event_guest_invitations_sql149_participation_deferred',
          'public.teskeid_event_guest_invitations',
          'public.teskeid_event_private_v1_participation_bridge_v2()',
          29,true,true,ARRAY[]::text[]),
        ('teskeid_event_attendance_memberships_sql149_sync_deferred',
          'public.teskeid_event_attendance_memberships',
          'public.teskeid_event_private_v1_participation_bridge_v2()',
          29,true,true,ARRAY[]::text[]),
        ('teskeid_events_touch_updated_at','public.teskeid_events',
          'public.teskeid_event_touch_updated_at()',19,false,false,ARRAY[]::text[]),
        ('teskeid_event_guests_touch_updated_at','public.teskeid_event_guests',
          'public.teskeid_event_touch_updated_at()',19,false,false,ARRAY[]::text[]),
        ('teskeid_events_update_guard','public.teskeid_events',
          'public.teskeid_event_guard_event_update()',19,false,false,ARRAY[]::text[]),
        ('teskeid_event_guests_update_guard','public.teskeid_event_guests',
          'public.teskeid_event_guard_guest_update()',19,false,false,ARRAY[]::text[]),
        ('teskeid_event_receipts_mutation_guard','public.teskeid_event_mutation_requests',
          'public.teskeid_event_guard_receipt_mutation()',27,false,false,ARRAY[]::text[]),
        ('teskeid_event_guests_roster_deferred','public.teskeid_event_guests',
          'public.teskeid_event_roster_integrity_trigger()',29,true,true,ARRAY[]::text[]),
        ('teskeid_event_guest_invitations_touch_updated_at','public.teskeid_event_guest_invitations',
          'public.teskeid_event_touch_updated_at()',19,false,false,ARRAY[]::text[]),
        ('teskeid_event_attendance_receipts_mutation_guard','public.teskeid_event_attendance_mutation_requests',
          'public.teskeid_event_guard_attendance_receipt_mutation()',27,false,false,ARRAY[]::text[]),
        ('teskeid_event_attendance_memberships_integrity_deferred','public.teskeid_event_attendance_memberships',
          'public.teskeid_event_attendance_integrity_trigger()',29,true,true,ARRAY[]::text[]),
        ('teskeid_event_guest_invitations_integrity_deferred','public.teskeid_event_guest_invitations',
          'public.teskeid_event_attendance_integrity_trigger()',29,true,true,ARRAY[]::text[]),
        ('teskeid_event_guests_attendance_integrity_deferred','public.teskeid_event_guests',
          'public.teskeid_event_attendance_integrity_trigger()',25,true,true,ARRAY[]::text[]),
        ('teskeid_event_identity_authorizations_consumed_deferred','public.teskeid_event_guest_identity_mutation_authorizations',
          'public.teskeid_event_guard_identity_authorization_commit()',21,true,true,ARRAY[]::text[])
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
  ) THEN
    RAISE EXCEPTION 'sql153_locked_source_trigger_mismatch';
  END IF;
  IF NOT EXISTS (
    WITH actual AS (
      SELECT pg_catalog.count(*)::integer AS trigger_count,
        pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          trigger_row.tgname::text || '|' || trigger_row.tgrelid::text || '|' ||
          trigger_row.tgfoid::text || '|' || trigger_row.tgtype::text || '|' ||
          trigger_row.tgenabled::text || '|' || trigger_row.tgconstraint::text ||
          '|' || trigger_row.tgdeferrable::text || '|' ||
          trigger_row.tginitdeferred::text || '|' ||
          pg_catalog.md5(pg_catalog.pg_get_triggerdef(trigger_row.oid)),
          E'\n' ORDER BY trigger_row.tgname
        ),'')) AS catalog_md5
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgname=ANY(ARRAY[
        'teskeid_event_participation_requests_mutation_guard',
        'teskeid_event_guest_invitations_sql149_bound_guard',
        'teskeid_event_sql149_participation_account_email',
        'teskeid_event_participations_account_unlink',
        'teskeid_event_sql149_participation_account_delete',
        'teskeid_event_guests_sql149_participation_deferred',
        'teskeid_event_guest_invitations_sql149_participation_deferred',
        'teskeid_event_attendance_memberships_sql149_sync_deferred',
        'teskeid_events_touch_updated_at','teskeid_event_guests_touch_updated_at',
        'teskeid_events_update_guard','teskeid_event_guests_update_guard',
        'teskeid_event_receipts_mutation_guard',
        'teskeid_event_guests_roster_deferred',
        'teskeid_event_guest_invitations_touch_updated_at',
        'teskeid_event_attendance_receipts_mutation_guard',
        'teskeid_event_attendance_memberships_integrity_deferred',
        'teskeid_event_guest_invitations_integrity_deferred',
        'teskeid_event_guests_attendance_integrity_deferred',
        'teskeid_event_identity_authorizations_consumed_deferred'
      ]::name[])
    )
    SELECT 1 FROM sql153_source_trigger_seal AS expected
    CROSS JOIN actual
    WHERE actual.trigger_count=expected.trigger_count
      AND actual.catalog_md5=expected.catalog_md5
  ) THEN
    RAISE EXCEPTION 'sql153_locked_source_trigger_catalog_mismatch';
  END IF;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('teskeid_events_pkey','public.teskeid_events',true,true,
       ARRAY['id']::text[],ARRAY['uuid_ops']::text[],ARRAY['']::text[],NULL),
      ('teskeid_event_guests_event_id_id_key',
       'public.teskeid_event_guests',true,false,
       ARRAY['event_id','id']::text[],
       ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],NULL),
      ('teskeid_event_guest_invitations_pkey',
       'public.teskeid_event_guest_invitations',true,true,
       ARRAY['id']::text[],ARRAY['uuid_ops']::text[],ARRAY['']::text[],NULL),
      ('teskeid_event_guest_invitations_sql149_identity_uidx',
       'public.teskeid_event_guest_invitations',true,false,
       ARRAY['id','event_id','event_guest_id']::text[],
       ARRAY['uuid_ops','uuid_ops','uuid_ops']::text[],
       ARRAY['','','']::text[],NULL),
      ('teskeid_event_attendance_memberships_pkey',
       'public.teskeid_event_attendance_memberships',true,true,
       ARRAY['event_id','user_id']::text[],
       ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],NULL),
      ('teskeid_event_attendance_memberships_guest_uidx',
       'public.teskeid_event_attendance_memberships',true,false,
       ARRAY['event_id','event_guest_id']::text[],
       ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],NULL),
      ('teskeid_event_attendance_memberships_invitation_uidx',
       'public.teskeid_event_attendance_memberships',true,false,
       ARRAY['accepted_invitation_id']::text[],
       ARRAY['uuid_ops']::text[],ARRAY['']::text[],NULL),
      ('teskeid_event_participations_pkey',
       'public.teskeid_event_participations',true,true,
       ARRAY['event_id','event_guest_id']::text[],
       ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],NULL),
      ('teskeid_event_participations_active_user_uidx',
       'public.teskeid_event_participations',true,false,
       ARRAY['event_id','recipient_user_id']::text[],
       ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],
       'access_state=''active''andrecipient_user_idisnotnull'),
      ('teskeid_event_participations_active_email_uidx',
       'public.teskeid_event_participations',true,false,
       ARRAY['event_id','recipient_email_canonical']::text[],
       ARRAY['uuid_ops','text_ops']::text[],ARRAY['','default']::text[],
       'access_state=''active''andrecipient_email_canonicalisnotnull')
    ) AS expected(
      index_name,table_name,is_unique,is_primary,column_names,
      operator_classes,collations,normalized_predicate
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS index_row
      JOIN pg_catalog.pg_class AS index_class
        ON index_class.oid = index_row.indexrelid
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = index_class.relowner
      JOIN pg_catalog.pg_am AS access_method
        ON access_method.oid = index_class.relam
      WHERE index_row.indexrelid = pg_catalog.to_regclass(
          'public.' || v_expected.index_name
        )
        AND index_row.indrelid = pg_catalog.to_regclass(v_expected.table_name)
        AND index_row.indisunique = v_expected.is_unique
        AND index_row.indisprimary = v_expected.is_primary
        AND index_row.indisvalid AND index_row.indisready
        AND index_row.indislive AND index_row.indimmediate
        AND NOT index_row.indcheckxmin
        AND NOT index_row.indisclustered
        AND NOT index_row.indisreplident
        AND NOT index_row.indnullsnotdistinct
        AND NOT index_row.indisexclusion
        AND index_row.indexprs IS NULL
        AND index_row.indnkeyatts =
          pg_catalog.cardinality(v_expected.column_names)
        AND index_row.indnatts = index_row.indnkeyatts
        AND access_method.amname = 'btree'
        AND owner_role.rolname = 'postgres'
        AND index_class.reltablespace = 0
        AND index_class.relacl IS NULL
        AND pg_catalog.cardinality(COALESCE(
          index_class.reloptions,ARRAY[]::text[]
        )) = 0
        AND ARRAY(
          SELECT attribute_row.attname::text
          FROM pg_catalog.unnest(index_row.indkey) WITH ORDINALITY
            AS indexed(attnum,ordinal_position)
          JOIN pg_catalog.pg_attribute AS attribute_row
            ON attribute_row.attrelid = index_row.indrelid
           AND attribute_row.attnum = indexed.attnum
          ORDER BY indexed.ordinal_position
        ) = v_expected.column_names
        AND ARRAY(
          SELECT operator_class.opcname::text
          FROM pg_catalog.unnest(index_row.indclass) WITH ORDINALITY
            AS indexed(opclass_oid,ordinal_position)
          JOIN pg_catalog.pg_opclass AS operator_class
            ON operator_class.oid = indexed.opclass_oid
          ORDER BY indexed.ordinal_position
        ) = v_expected.operator_classes
        AND ARRAY(
          SELECT COALESCE(collation_row.collname,'')::text
          FROM pg_catalog.unnest(index_row.indcollation) WITH ORDINALITY
            AS indexed(collation_oid,ordinal_position)
          LEFT JOIN pg_catalog.pg_collation AS collation_row
            ON collation_row.oid = indexed.collation_oid
          ORDER BY indexed.ordinal_position
        ) = v_expected.collations
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.unnest(index_row.indoption) AS option_value
          WHERE option_value <> 0
        )
        AND pg_catalog.regexp_replace(COALESCE(pg_catalog.lower(
          pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid)
        ),''),'[()[:space:]]|::text','','g') =
          COALESCE(v_expected.normalized_predicate,'')
    ) THEN
      RAISE EXCEPTION 'sql153_locked_source_index_mismatch:%',
        v_expected.index_name;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_class
      ON index_class.oid = index_row.indexrelid
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = index_class.relowner
    JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = index_class.relam
    WHERE index_row.indexrelid = pg_catalog.to_regclass(
        'public.teskeid_event_attendance_memberships_user_idx'
      )
      AND index_row.indrelid = pg_catalog.to_regclass(
        'public.teskeid_event_attendance_memberships'
      )
      AND NOT index_row.indisunique AND NOT index_row.indisprimary
      AND index_row.indisvalid AND index_row.indisready
      AND index_row.indislive AND index_row.indimmediate
      AND NOT index_row.indcheckxmin AND NOT index_row.indisclustered
      AND NOT index_row.indisreplident AND NOT index_row.indnullsnotdistinct
      AND NOT index_row.indisexclusion AND index_row.indexprs IS NULL
      AND index_row.indnkeyatts = 3 AND index_row.indnatts = 3
      AND access_method.amname = 'btree'
      AND owner_role.rolname = 'postgres'
      AND index_class.reltablespace = 0 AND index_class.relacl IS NULL
      AND pg_catalog.cardinality(COALESCE(
        index_class.reloptions,ARRAY[]::text[]
      )) = 0
      AND ARRAY(
        SELECT attribute_row.attname::text
        FROM pg_catalog.unnest(index_row.indkey) WITH ORDINALITY
          AS indexed(attnum,ordinal_position)
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid = index_row.indrelid
         AND attribute_row.attnum = indexed.attnum
        ORDER BY indexed.ordinal_position
      ) = ARRAY['user_id','accepted_at','event_id']::text[]
      AND ARRAY(
        SELECT operator_class.opcname::text
        FROM pg_catalog.unnest(index_row.indclass) WITH ORDINALITY
          AS indexed(opclass_oid,ordinal_position)
        JOIN pg_catalog.pg_opclass AS operator_class
          ON operator_class.oid = indexed.opclass_oid
        ORDER BY indexed.ordinal_position
      ) = ARRAY['uuid_ops','timestamptz_ops','uuid_ops']::text[]
      AND ARRAY(
        SELECT COALESCE(collation_row.collname,'')::text
        FROM pg_catalog.unnest(index_row.indcollation) WITH ORDINALITY
          AS indexed(collation_oid,ordinal_position)
        LEFT JOIN pg_catalog.pg_collation AS collation_row
          ON collation_row.oid = indexed.collation_oid
        ORDER BY indexed.ordinal_position
      ) = ARRAY['','','']::text[]
      AND ARRAY(
        SELECT option_value::smallint
        FROM pg_catalog.unnest(index_row.indoption)
          WITH ORDINALITY AS indexed(option_value,ordinal_position)
        ORDER BY indexed.ordinal_position
      ) = ARRAY[0,3,0]::smallint[]
      AND index_row.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'sql153_membership_user_index_mismatch';
  END IF;
  IF NOT EXISTS (
    WITH actual AS (
      SELECT pg_catalog.count(*)::integer AS index_count,
        pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          index_class.relname::text||'|'||
          pg_catalog.pg_get_indexdef(index_row.indexrelid)||'|'||index_row::text,
          E'\n' ORDER BY index_class.relname
        ),'')) AS catalog_md5
      FROM pg_catalog.pg_index AS index_row
      JOIN pg_catalog.pg_class AS index_class
        ON index_class.oid=index_row.indexrelid
      WHERE index_class.relname=ANY(ARRAY[
        'teskeid_events_pkey','teskeid_event_guests_event_id_id_key',
        'teskeid_event_guest_invitations_pkey',
        'teskeid_event_guest_invitations_sql149_identity_uidx',
        'teskeid_event_guest_invitations_pending_guest_uidx',
        'teskeid_event_guest_invitations_guest_history_idx',
        'teskeid_event_attendance_memberships_pkey',
        'teskeid_event_attendance_memberships_guest_uidx',
        'teskeid_event_attendance_memberships_invitation_uidx',
        'teskeid_event_attendance_memberships_user_idx',
        'teskeid_event_participations_pkey',
        'teskeid_event_participations_active_user_uidx',
        'teskeid_event_participations_active_email_uidx',
        'teskeid_event_person_labels_pkey',
        'teskeid_event_participation_requests_pkey',
        'teskeid_event_participation_invitation_terminalizations_pkey',
        'teskeid_event_participations_recipient_user_idx',
        'teskeid_event_participations_recipient_email_idx'
      ]::name[])
    )
    SELECT 1 FROM sql153_source_index_seal AS expected CROSS JOIN actual
    WHERE actual.index_count=expected.index_count
      AND actual.catalog_md5=expected.catalog_md5
  ) THEN
    RAISE EXCEPTION 'sql153_locked_source_index_catalog_mismatch';
  END IF;

  IF EXISTS (
    WITH expected(
      constraint_name,constraint_type,local_columns,referenced_relation,
      referenced_columns,delete_action,is_deferrable,initially_deferred
    ) AS (
      VALUES
        ('teskeid_event_attendance_memberships_pkey','p',
          ARRAY['event_id','user_id']::text[],NULL::text,
          ARRAY[]::text[],NULL::"char",false,false),
        ('teskeid_event_attendance_memberships_guest_fk','f',
          ARRAY['event_id','event_guest_id','user_id']::text[],
          'public.teskeid_event_guests',
          ARRAY['event_id','id','linked_user_id']::text[],'c'::"char",true,true),
        ('teskeid_event_attendance_memberships_user_fk','f',
          ARRAY['user_id']::text[],'auth.users',ARRAY['id']::text[],
          'c'::"char",false,false),
        ('teskeid_event_attendance_memberships_invitation_fk','f',
          ARRAY['accepted_invitation_id','event_id','event_guest_id','user_id']::text[],
          'public.teskeid_event_guest_invitations',
          ARRAY['id','event_id','event_guest_id','accepted_user_id']::text[],
          'c'::"char",true,true)
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = pg_catalog.to_regclass(
        'public.teskeid_event_attendance_memberships'
      )
     AND constraint_row.conname = expected.constraint_name
    LEFT JOIN LATERAL (
      SELECT ARRAY(
        SELECT attribute_row.attname::text
        FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY
          AS constrained(attnum,ordinal_position)
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid = constraint_row.conrelid
         AND attribute_row.attnum = constrained.attnum
        ORDER BY constrained.ordinal_position
      ) AS local_columns,
      ARRAY(
        SELECT attribute_row.attname::text
        FROM pg_catalog.unnest(constraint_row.confkey) WITH ORDINALITY
          AS referenced(attnum,ordinal_position)
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid = constraint_row.confrelid
         AND attribute_row.attnum = referenced.attnum
        ORDER BY referenced.ordinal_position
      ) AS referenced_columns
    ) AS actual ON true
    WHERE constraint_row.oid IS NULL
       OR constraint_row.contype <> expected.constraint_type::"char"
       OR NOT constraint_row.convalidated
       OR constraint_row.condeferrable <> expected.is_deferrable
       OR constraint_row.condeferred <> expected.initially_deferred
       OR actual.local_columns <> expected.local_columns
       OR (expected.constraint_type = 'f' AND (
         constraint_row.confrelid <>
           pg_catalog.to_regclass(expected.referenced_relation)
         OR actual.referenced_columns <> expected.referenced_columns
         OR constraint_row.confdeltype <> expected.delete_action
         OR constraint_row.confupdtype <> 'a'
         OR constraint_row.confmatchtype <> 's'
       ))
  ) THEN
    RAISE EXCEPTION 'sql153_membership_constraint_mismatch';
  END IF;
  IF NOT EXISTS (
    WITH actual AS (
      SELECT pg_catalog.count(*)::integer AS constraint_count,
        pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          constraint_row.conrelid::text||'|'||constraint_row.conname::text||'|'||
          constraint_row.contype::text||'|'||
          pg_catalog.pg_get_constraintdef(constraint_row.oid,true)||'|'||
          constraint_row.condeferrable::text||'|'||
          constraint_row.condeferred::text,
          E'\n' ORDER BY constraint_row.conrelid,constraint_row.conname
        ),'')) AS catalog_md5
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid=ANY(ARRAY[
        'public.teskeid_event_person_labels'::regclass,
        'public.teskeid_event_participations'::regclass,
        'public.teskeid_event_participation_mutation_requests'::regclass,
        'public.teskeid_event_participation_invitation_terminalizations'::regclass,
        'public.teskeid_event_attendance_memberships'::regclass
      ]) AND constraint_row.contype<>'t'
    )
    SELECT 1 FROM sql153_source_constraint_seal AS expected CROSS JOIN actual
    WHERE actual.constraint_count=expected.constraint_count
      AND actual.catalog_md5=expected.catalog_md5
  ) THEN
    RAISE EXCEPTION 'sql153_locked_source_constraint_catalog_mismatch';
  END IF;
  IF NOT EXISTS (
    WITH actual AS (
      SELECT pg_catalog.count(*)::integer AS constraint_count,
        pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          constraint_row.conrelid::text||'|'||constraint_row.conname::text||
          '|'||constraint_row.contype::text||'|'||
          pg_catalog.pg_get_constraintdef(constraint_row.oid,true)||'|'||
          constraint_row.condeferrable::text||'|'||
          constraint_row.condeferred::text,
          E'\n' ORDER BY constraint_row.conrelid,constraint_row.conname
        ),'')) AS catalog_md5
      FROM sql153_legacy_authority_constraint_names AS expected
      JOIN pg_catalog.pg_constraint AS constraint_row
        ON constraint_row.conrelid=expected.relation_oid
       AND constraint_row.conname=expected.constraint_name
    )
    SELECT 1
    FROM sql153_legacy_authority_constraint_seal AS expected
    CROSS JOIN actual
    WHERE actual.constraint_count=expected.constraint_count
      AND actual.catalog_md5=expected.catalog_md5
  ) THEN
    RAISE EXCEPTION 'sql153_locked_legacy_constraint_catalog_mismatch';
  END IF;
END;
$sql153_locked_source_guard$;

ALTER TABLE public.teskeid_event_participation_rsvp_v3
  ADD CONSTRAINT teskeid_event_participation_rsvp_v3_participation_fk
  FOREIGN KEY (event_id, event_guest_id)
  REFERENCES public.teskeid_event_participations(event_id,event_guest_id)
  ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.teskeid_event_participation_invitation_generations_v3
  ADD CONSTRAINT teskeid_event_participation_invitation_gen_v3_invite_fk
  FOREIGN KEY (invitation_id,event_id,event_guest_id)
  REFERENCES public.teskeid_event_guest_invitations(
    id,event_id,event_guest_id
  )
  ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT teskeid_event_participation_invitation_gen_v3_rsvp_fk
  FOREIGN KEY (event_id,event_guest_id,identity_generation)
  REFERENCES public.teskeid_event_participation_rsvp_v3(
    event_id,event_guest_id,identity_generation
  ) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.teskeid_event_participation_mutation_requests_v3
  ADD CONSTRAINT teskeid_event_participation_requests_v3_actor_fk
  FOREIGN KEY (actor_user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX teskeid_event_participation_requests_v3_created_idx
  ON public.teskeid_event_participation_mutation_requests_v3(
    created_at, actor_user_id, request_id
  );

-- A rolling v2 writer carries no identity generation.  One install-time
-- monotonic bump invalidates every token issued before a legacy reinvite;
-- the SQL153 BEFORE trigger performs the same single bump for future
-- generation changes.  No timestamp changes because this is a token fence,
-- not a participant decision.
UPDATE public.teskeid_event_participations AS participation
SET rsvp_version = participation.rsvp_version + 1
WHERE participation.identity_generation > 1;

INSERT INTO public.teskeid_event_participation_rsvp_v3 (
  event_id,event_guest_id,identity_generation,
  effective_state,private_note,decision_version,
  created_at,updated_at
)
SELECT participation.event_id, participation.event_guest_id,
  participation.identity_generation, participation.rsvp_state,
  NULL, participation.rsvp_version,
  participation.created_at, participation.updated_at
FROM public.teskeid_event_participations AS participation
ORDER BY participation.event_id, participation.event_guest_id;

WITH latest AS (
  SELECT DISTINCT ON (invitation.event_id, invitation.event_guest_id)
    invitation.id AS invitation_id,
    invitation.event_id,
    invitation.event_guest_id,
    invitation.status
  FROM public.teskeid_event_guest_invitations AS invitation
  ORDER BY invitation.event_id, invitation.event_guest_id,
    invitation.created_at DESC, invitation.id DESC
), safe_current AS (
  SELECT latest.invitation_id, latest.event_id, latest.event_guest_id,
    participation.identity_generation
  FROM latest
  JOIN public.teskeid_event_participations AS participation
    ON participation.event_id = latest.event_id
   AND participation.event_guest_id = latest.event_guest_id
   AND participation.access_state = 'active'
  JOIN public.teskeid_event_guests AS guest
    ON guest.event_id = latest.event_id
   AND guest.id = latest.event_guest_id
   AND guest.status = 'active'
  WHERE latest.status IN ('pending','accepted','declined','expired')
     OR (
       latest.status = 'cancelled'
       AND EXISTS (
         SELECT 1
         FROM public.teskeid_event_participation_invitation_terminalizations
           AS terminalization
         WHERE terminalization.invitation_id = latest.invitation_id
           AND terminalization.event_id = latest.event_id
           AND terminalization.event_guest_id = latest.event_guest_id
           AND terminalization.identity_generation =
             participation.identity_generation
           AND terminalization.reason = 'identity_claim'
       )
     )
)
INSERT INTO
  public.teskeid_event_participation_invitation_generations_v3 (
    invitation_id,event_id,event_guest_id,identity_generation
  )
SELECT invitation_id,event_id,event_guest_id,identity_generation
FROM safe_current
ORDER BY event_id,event_guest_id;

CREATE TRIGGER teskeid_event_participation_requests_v3_guard
  BEFORE UPDATE OR DELETE
  ON public.teskeid_event_participation_mutation_requests_v3
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_guard_request_v3();
CREATE TRIGGER teskeid_event_participations_sql153_generation_rsvp_bump
  BEFORE UPDATE OF identity_generation
  ON public.teskeid_event_participations
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_bump_generation_rsvp_v3();
CREATE TRIGGER teskeid_event_participations_sql153_rsvp_sync
  AFTER INSERT OR UPDATE ON public.teskeid_event_participations
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_sync_rsvp_v3();
CREATE CONSTRAINT TRIGGER teskeid_event_guest_invitations_sql153_anchor_deferred
  AFTER INSERT OR UPDATE ON public.teskeid_event_guest_invitations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_anchor_sync_v3();
CREATE CONSTRAINT TRIGGER teskeid_event_participations_sql153_integrity_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.teskeid_event_participations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_rsvp_integrity_trigger_v3();
CREATE CONSTRAINT TRIGGER teskeid_event_rsvp_v3_integrity_deferred
  AFTER INSERT OR UPDATE OR DELETE
  ON public.teskeid_event_participation_rsvp_v3
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION
    public.teskeid_event_private_rsvp_integrity_trigger_v3();

SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

INSERT INTO public.teskeid_event_sql153_install_baseline (
  singleton,sql149_last_value,sql149_is_called,
  participation_count,rsvp_baseline_md5,pre_fence_rsvp_md5,
  decision_count,decision_baseline_md5,request_count,
  invitation_anchor_count,invitation_anchor_md5,
  predecessor_rsvp_v2_source
)
SELECT true,
  bridge.last_value, bridge.is_called,
  (SELECT pg_catalog.count(*)
   FROM public.teskeid_event_participations),
  (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
     participation.event_id::text || '|' ||
     participation.event_guest_id::text || '|' ||
     participation.identity_generation::text || '|' ||
     participation.rsvp_state || '|' ||
     participation.rsvp_version::text,
     E'\n' ORDER BY participation.event_id,participation.event_guest_id
   ), '')) FROM public.teskeid_event_participations AS participation),
  (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
     participation.event_id::text || '|' ||
     participation.event_guest_id::text || '|' ||
     participation.identity_generation::text || '|' ||
     participation.rsvp_state || '|' ||
     CASE WHEN participation.identity_generation > 1
       THEN (participation.rsvp_version - 1)::text
       ELSE participation.rsvp_version::text END,
     E'\n' ORDER BY participation.event_id,participation.event_guest_id
   ), '')) FROM public.teskeid_event_participations AS participation),
  (SELECT pg_catalog.count(*)
   FROM public.teskeid_event_participation_rsvp_v3),
  (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
     decision.event_id::text || '|' ||
     decision.event_guest_id::text || '|' ||
     decision.identity_generation::text || '|' ||
     decision.effective_state || '|' ||
     COALESCE(pg_catalog.md5(decision.private_note), '-') || '|' ||
     decision.decision_version::text,
     E'\n' ORDER BY decision.event_id,decision.event_guest_id
   ), ''))
   FROM public.teskeid_event_participation_rsvp_v3 AS decision),
  (SELECT pg_catalog.count(*)
   FROM public.teskeid_event_participation_mutation_requests_v3),
  (SELECT pg_catalog.count(*)
   FROM public.teskeid_event_participation_invitation_generations_v3),
  (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
     anchor.invitation_id::text || '|' || anchor.event_id::text || '|' ||
     anchor.event_guest_id::text || '|' ||
     anchor.identity_generation::text,
     E'\n' ORDER BY anchor.event_id,anchor.event_guest_id
   ), ''))
   FROM public.teskeid_event_participation_invitation_generations_v3
     AS anchor),
  predecessor.source
FROM public.teskeid_event_v1_bridge_observation_seq AS bridge
CROSS JOIN sql153_predecessor_rsvp_v2_source AS predecessor;

-- No source write occurs after this reset.  Any later attempted legacy/v2/v3
-- synchronization, including an aborted/no-op write, permanently closes
-- destructive recovery.
SELECT pg_catalog.setval(
  'public.teskeid_event_sql153_write_observation_seq'::regclass,
  1, false
);

GRANT EXECUTE ON FUNCTION
  public.teskeid_event_resolve_invitation_v3(uuid,uuid),
  public.teskeid_event_list_scoped_participations_v3(uuid),
  public.teskeid_event_get_actor_view_v3(uuid,uuid),
  public.teskeid_event_list_for_actor_v3(uuid),
  public.teskeid_event_list_person_source_events_v3(
    uuid,timestamp with time zone,uuid,integer
  ),
  public.teskeid_event_get_person_source_roster_v3(uuid,uuid),
  public.teskeid_event_set_rsvp_v3(
    uuid,uuid,uuid,bigint,text,text,bigint,uuid
  ),
  public.teskeid_event_leave_participation_v3(
    uuid,uuid,uuid,bigint,bigint,bigint,uuid
  ),
  public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)
  TO service_role;

DO $sql153_final$
DECLARE
  v_expected record;
  v_oid oid;
  v_source_md5 text;
BEGIN
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.teskeid_event_private_normalize_note_v3(text)',
       'p_value text','text','sql','i',false,'u',
       'eef600423fb1151933ad906fb218f11a',false),
      ('public.teskeid_event_private_begin_request_v3(uuid,uuid,text,text)',
       'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text',
       'jsonb','plpgsql','v',false,'u',
       'f786927ca67a68761b562dbdeb11e001',false),
      ('public.teskeid_event_private_finish_request_v3(uuid,uuid,jsonb)',
       'p_actor_id uuid, p_request_id uuid, p_result jsonb',
       'void','plpgsql','v',false,'u',
       '9f96d74b702f0db867d56b5b2834b715',false),
      ('public.teskeid_event_private_guard_request_v3()',
       '','trigger','plpgsql','v',false,'u',
       '822194380c3597b9bf2f8db03789e197',false),
      ('public.teskeid_event_private_bump_generation_rsvp_v3()',
       '','trigger','plpgsql','v',false,'u',
       '9f7c2be934e4e3db5be808e4b0800e42',false),
      ('public.teskeid_event_private_sync_rsvp_v3()',
       '','trigger','plpgsql','v',false,'u',
       '7126c130f7f17ad07d443a39d9aa57de',false),
      ('public.teskeid_event_private_anchor_invitation_v3(uuid,uuid)',
       'p_event_id uuid, p_event_guest_id uuid','void','plpgsql','v',false,'u',
       'bc974233ced86a3c906adfcec209eb64',false),
      ('public.teskeid_event_private_anchor_sync_v3()',
       '','trigger','plpgsql','v',false,'u',
       'db82578fc700fc64590c0b1d65b0ab00',false),
      ('public.teskeid_event_private_assert_rsvp_integrity_v3(uuid,uuid)',
       'p_event_id uuid, p_event_guest_id uuid','void','plpgsql','s',false,'u',
       'e17f216bb8fd6f0ddb914065b82518d5',false),
      ('public.teskeid_event_private_rsvp_integrity_trigger_v3()',
       '','trigger','plpgsql','v',false,'u',
       '3c645c3e5f46cc2a349329e5dd486a1a',false),
      ('public.teskeid_event_private_claim_scoped_v3(uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid','integer','plpgsql','v',false,'u',
       '5b7eecb3f7e9aebb6a376ffd312989be',false),
      ('public.teskeid_event_private_scope_v3(uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',false,'u',
       'df104d5af3896804c7b8ef3321d191c8',false),
      ('public.teskeid_event_private_person_projection_v3(uuid,uuid,uuid,integer,boolean,boolean)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_position integer, p_is_self boolean, p_include_private_note boolean',
       'jsonb','plpgsql','s',false,'u',
       'd0fa5cf0bcf1752cf1d996d64c6a1bd8',false),
      ('public.teskeid_event_private_people_projection_v3(uuid,uuid,text,uuid,boolean)',
       'p_actor_id uuid, p_event_id uuid, p_viewer_role text, p_self_event_guest_id uuid, p_include_rsvp_notes boolean',
       'jsonb','plpgsql','s',false,'u',
       '7f432c3c5ecc419596cf9146348d06f3',false),
      ('public.teskeid_event_resolve_invitation_v3(uuid,uuid)',
       'p_actor_id uuid, p_invitation_id uuid','jsonb','plpgsql','v',false,'u',
       '01d8dd933c67fb20248628537d97c781',true),
      ('public.teskeid_event_list_scoped_participations_v3(uuid)',
       'p_actor_id uuid','jsonb','plpgsql','v',false,'u',
       '49ab80161d27a7a73df7491bf04ac6cd',true),
      ('public.teskeid_event_get_actor_view_v3(uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',false,'u',
       '53e06c5199c18dba36be664cc9ff7ed1',true),
      ('public.teskeid_event_list_for_actor_v3(uuid)',
       'p_actor_id uuid','jsonb','plpgsql','v',false,'u',
       '2e1d9722aad45bef1856af41302d658e',true),
      ('public.teskeid_event_list_person_source_events_v3(uuid,timestamp with time zone,uuid,integer)',
       'p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer',
       'jsonb','plpgsql','v',false,'u',
       '49b3b72827e3592ca75a5aed220e8a24',true),
      ('public.teskeid_event_get_person_source_roster_v3(uuid,uuid)',
       'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',false,'u',
       '160bdcb9976c79219abd986357c2ee14',true),
      ('public.teskeid_event_set_rsvp_v3(uuid,uuid,uuid,bigint,text,text,bigint,uuid)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_identity_generation bigint, p_rsvp_state text, p_private_note text, p_expected_decision_version bigint, p_request_id uuid',
       'jsonb','plpgsql','v',false,'u',
       'd4aca35f7f7a8f5146c5b87d5447419c',true),
      ('public.teskeid_event_leave_participation_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_identity_generation bigint, p_expected_identity_version bigint, p_expected_access_version bigint, p_request_id uuid',
       'jsonb','plpgsql','v',false,'u',
       '49b11bb0f39c308b5eacfe01e0fcd47b',true),
      ('public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)',
       'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_rsvp_state text, p_expected_rsvp_version bigint, p_request_id uuid',
       'jsonb','plpgsql','v',false,'u',
       '0eae77a1f1f9ef59049cd580694d3e41',true)
    ) AS expected(
      signature, exact_arguments, result_type, language_name, volatility,
      is_strict, parallel_safety, source_md5, service_execute
    )
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_expected.signature);
    SELECT pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc, E'\r\n', E'\n'
    )) INTO v_source_md5
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = v_oid
      AND owner_role.rolname = 'postgres'
      AND language_row.lanname = v_expected.language_name
      AND procedure_row.prokind = 'f'
      AND procedure_row.prosecdef = (
        v_expected.signature <> 'public.normalize_email_canonical(text)'
      )
      AND procedure_row.proisstrict = v_expected.is_strict
      AND NOT procedure_row.proleakproof
      AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults = 0
      AND procedure_row.provolatile = v_expected.volatility::"char"
      AND procedure_row.proparallel = v_expected.parallel_safety::"char"
      AND pg_catalog.pg_get_function_result(procedure_row.oid) =
        v_expected.result_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        v_expected.exact_arguments
      AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = procedure_row.pronamespace
          AND overload.proname = procedure_row.proname
      ) = 1;
    IF v_oid IS NULL OR v_source_md5 IS DISTINCT FROM v_expected.source_md5
       OR pg_catalog.has_function_privilege('postgres',v_oid,'EXECUTE') IS NOT TRUE
       OR pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
          IS DISTINCT FROM v_expected.service_execute
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_proc AS procedure_row
         CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
           procedure_row.proacl,
           pg_catalog.acldefault('f', procedure_row.proowner)
         )) AS privilege
         LEFT JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE procedure_row.oid = v_oid
           AND privilege.privilege_type = 'EXECUTE'
           AND NOT privilege.is_grantable
           AND (
             privilege.grantee = procedure_row.proowner
             OR (v_expected.service_execute
               AND grantee.rolname = 'service_role')
           )
       ) <> (1 + v_expected.service_execute::integer)
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc AS procedure_row
         CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
           procedure_row.proacl,
           pg_catalog.acldefault('f', procedure_row.proowner)
         )) AS privilege
         LEFT JOIN pg_catalog.pg_roles AS grantee
           ON grantee.oid = privilege.grantee
         WHERE procedure_row.oid = v_oid
           AND (
             privilege.grantor <> procedure_row.proowner
             OR privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR (
               privilege.grantee <> procedure_row.proowner
               AND (NOT v_expected.service_execute
                 OR grantee.rolname IS DISTINCT FROM 'service_role')
             )
           )
       ) THEN
      RAISE EXCEPTION 'sql153_function_shape_mismatch:%',
        v_expected.signature;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.pronamespace = pg_catalog.to_regnamespace('public')
      AND procedure_row.proname LIKE '%v3'
      AND procedure_row.proname LIKE 'teskeid_event%'
  ) <> 22 THEN
    RAISE EXCEPTION 'sql153_function_inventory_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS catalog_object
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid=catalog_object.relnamespace
    WHERE namespace_row.nspname='public'
      AND (catalog_object.relname LIKE '%sql153%'
        OR catalog_object.relname LIKE 'teskeid_event%v3')
      AND catalog_object.relname<>ALL(ARRAY[
        'teskeid_event_participation_rsvp_v3',
        'teskeid_event_participation_invitation_generations_v3',
        'teskeid_event_participation_mutation_requests_v3',
        'teskeid_event_sql153_install_baseline',
        'teskeid_event_participation_rsvp_v3_pkey',
        'teskeid_event_participation_rsvp_v3_current_key',
        'teskeid_event_participation_invitation_gen_v3_pkey',
        'teskeid_event_participation_invitation_gen_v3_current_key',
        'teskeid_event_participation_requests_v3_pkey',
        'teskeid_event_participation_requests_v3_created_idx',
        'teskeid_event_sql153_install_baseline_pkey',
        'teskeid_event_sql153_write_observation_seq'
      ]::name[])
  ) THEN
    RAISE EXCEPTION 'sql153_catalog_namespace_inventory_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.teskeid_event_participation_rsvp_v3'),
      ('public.teskeid_event_participation_invitation_generations_v3'),
      ('public.teskeid_event_participation_mutation_requests_v3'),
      ('public.teskeid_event_sql153_install_baseline')
    ) AS expected(relation_name)
    LEFT JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = pg_catalog.to_regclass(expected.relation_name)
    LEFT JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation_row.relowner
    WHERE relation_row.oid IS NULL OR relation_row.relkind <> 'r'
       OR owner_role.rolname IS DISTINCT FROM 'postgres'
       OR NOT relation_row.relrowsecurity
       OR NOT relation_row.relforcerowsecurity
       OR EXISTS (
         SELECT 1 FROM pg_catalog.pg_policy AS policy
         WHERE policy.polrelid = relation_row.oid
       )
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode(COALESCE(
           relation_row.relacl,
           pg_catalog.acldefault('r', relation_row.relowner)
         ))
        ) <> CASE
          WHEN pg_catalog.current_setting('server_version_num')::integer >= 170000
            THEN 8
          ELSE 7
        END
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           relation_row.relacl,
           pg_catalog.acldefault('r', relation_row.relowner)
         )) AS privilege
         WHERE privilege.grantor <> relation_row.relowner
            OR privilege.grantee <> relation_row.relowner
            OR (
              privilege.privilege_type <> ALL(ARRAY[
              'INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES',
              'TRIGGER'
              ]::text[])
              AND NOT (
                pg_catalog.current_setting('server_version_num')::integer >= 170000
                AND privilege.privilege_type = 'MAINTAIN'
              )
            )
            OR privilege.is_grantable
       )
  ) THEN
    RAISE EXCEPTION 'sql153_relation_security_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS sequence_class
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = sequence_class.relowner
    JOIN pg_catalog.pg_sequence AS sequence_row
      ON sequence_row.seqrelid = sequence_class.oid
    WHERE sequence_class.oid = pg_catalog.to_regclass(
      'public.teskeid_event_sql153_write_observation_seq'
    )
      AND sequence_class.relkind = 'S'
      AND sequence_class.relpersistence = 'p'
      AND owner_role.rolname = 'postgres'
      AND sequence_row.seqstart = 1
      AND sequence_row.seqincrement = 1
      AND sequence_row.seqmin = 1
      AND sequence_row.seqmax = 9223372036854775807
      AND sequence_row.seqcache = 1
      AND NOT sequence_row.seqcycle
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
          AND dependency.objid = sequence_class.oid
          AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
          AND dependency.deptype IN ('a','i')
      )
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.aclexplode(COALESCE(
          sequence_class.relacl,
          pg_catalog.acldefault('S', sequence_class.relowner)
        ))
      ) = 3
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          sequence_class.relacl,
          pg_catalog.acldefault('S', sequence_class.relowner)
        )) AS privilege
        WHERE privilege.grantor <> sequence_class.relowner
           OR privilege.grantee <> sequence_class.relowner
           OR privilege.privilege_type <> ALL(ARRAY[
             'USAGE','SELECT','UPDATE'
           ]::text[])
           OR privilege.is_grantable
      )
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_sql153_write_observation_seq AS marker
    WHERE marker.last_value = 1 AND NOT marker.is_called
  ) THEN
    RAISE EXCEPTION 'sql153_sequence_shape_mismatch';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM public.teskeid_event_participation_rsvp_v3)
       <> (SELECT pg_catalog.count(*)
           FROM public.teskeid_event_participations)
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_participations AS participation
       LEFT JOIN public.teskeid_event_participation_rsvp_v3 AS decision
         ON decision.event_id = participation.event_id
        AND decision.event_guest_id = participation.event_guest_id
       WHERE decision.event_guest_id IS NULL
          OR decision.identity_generation <>
            participation.identity_generation
          OR decision.decision_version <> participation.rsvp_version
          OR decision.effective_state <> participation.rsvp_state
          OR decision.private_note IS NOT NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_participation_invitation_generations_v3
         AS anchor
       JOIN public.teskeid_event_participations AS participation
         ON participation.event_id = anchor.event_id
        AND participation.event_guest_id = anchor.event_guest_id
       JOIN public.teskeid_event_guest_invitations AS invitation
         ON invitation.id = anchor.invitation_id
        AND invitation.event_id = anchor.event_id
        AND invitation.event_guest_id = anchor.event_guest_id
       LEFT JOIN
         public.teskeid_event_participation_invitation_terminalizations
           AS terminalization
         ON terminalization.invitation_id = anchor.invitation_id
        AND terminalization.event_id = anchor.event_id
        AND terminalization.event_guest_id = anchor.event_guest_id
        AND terminalization.identity_generation = anchor.identity_generation
        AND terminalization.reason = 'identity_claim'
       WHERE anchor.identity_generation <> participation.identity_generation
          OR participation.access_state <> 'active'
          OR invitation.status NOT IN ('pending','accepted','declined','expired')
            AND NOT (invitation.status = 'cancelled'
              AND terminalization.invitation_id IS NOT NULL)
     )
     OR EXISTS (
       WITH latest AS (
         SELECT DISTINCT ON (invitation.event_id,invitation.event_guest_id)
           invitation.id AS invitation_id,
           invitation.event_id,
           invitation.event_guest_id,
           invitation.status
         FROM public.teskeid_event_guest_invitations AS invitation
         ORDER BY invitation.event_id,invitation.event_guest_id,
           invitation.created_at DESC,invitation.id DESC
       ), expected AS (
         SELECT latest.invitation_id,latest.event_id,
           latest.event_guest_id,participation.identity_generation
         FROM latest
         JOIN public.teskeid_event_participations AS participation
           ON participation.event_id = latest.event_id
          AND participation.event_guest_id = latest.event_guest_id
          AND participation.access_state = 'active'
         JOIN public.teskeid_event_guests AS guest
           ON guest.event_id = latest.event_id
          AND guest.id = latest.event_guest_id
          AND guest.status = 'active'
         WHERE latest.status IN ('pending','accepted','declined','expired')
            OR (latest.status = 'cancelled' AND EXISTS (
              SELECT 1
              FROM
                public.teskeid_event_participation_invitation_terminalizations
                  AS terminalization
              WHERE terminalization.invitation_id = latest.invitation_id
                AND terminalization.event_id = latest.event_id
                AND terminalization.event_guest_id = latest.event_guest_id
                AND terminalization.identity_generation =
                  participation.identity_generation
                AND terminalization.reason = 'identity_claim'
            ))
       ), difference AS (
         (SELECT invitation_id,event_id,event_guest_id,identity_generation
          FROM expected
          EXCEPT
          SELECT invitation_id,event_id,event_guest_id,identity_generation
          FROM public.teskeid_event_participation_invitation_generations_v3)
         UNION ALL
         (SELECT invitation_id,event_id,event_guest_id,identity_generation
          FROM public.teskeid_event_participation_invitation_generations_v3
          EXCEPT
          SELECT invitation_id,event_id,event_guest_id,identity_generation
          FROM expected)
       )
       SELECT 1 FROM difference
     )
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_participation_mutation_requests_v3
     ) THEN
    RAISE EXCEPTION 'sql153_backfill_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_sql153_install_baseline AS baseline
    CROSS JOIN public.teskeid_event_v1_bridge_observation_seq AS bridge
    WHERE baseline.singleton
      AND baseline.sql149_last_value = bridge.last_value
      AND baseline.sql149_is_called = bridge.is_called
      AND baseline.participation_count = (
        SELECT pg_catalog.count(*)
        FROM public.teskeid_event_participations
      )
      AND baseline.rsvp_baseline_md5 = (
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          participation.event_id::text || '|' ||
          participation.event_guest_id::text || '|' ||
          participation.identity_generation::text || '|' ||
          participation.rsvp_state || '|' ||
          participation.rsvp_version::text,
          E'\n' ORDER BY participation.event_id,
            participation.event_guest_id
        ), ''))
        FROM public.teskeid_event_participations AS participation
      )
      AND baseline.pre_fence_rsvp_md5 = (
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          participation.event_id::text || '|' ||
          participation.event_guest_id::text || '|' ||
          participation.identity_generation::text || '|' ||
          participation.rsvp_state || '|' ||
          CASE WHEN participation.identity_generation > 1
            THEN (participation.rsvp_version - 1)::text
            ELSE participation.rsvp_version::text END,
          E'\n' ORDER BY participation.event_id,
            participation.event_guest_id
        ), ''))
        FROM public.teskeid_event_participations AS participation
      )
      AND baseline.decision_count = (
        SELECT pg_catalog.count(*)
        FROM public.teskeid_event_participation_rsvp_v3
      )
      AND baseline.decision_baseline_md5 = (
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          decision.event_id::text || '|' ||
          decision.event_guest_id::text || '|' ||
          decision.identity_generation::text || '|' ||
          decision.effective_state || '|' ||
          COALESCE(pg_catalog.md5(decision.private_note), '-') || '|' ||
          decision.decision_version::text,
          E'\n' ORDER BY decision.event_id,decision.event_guest_id
        ), ''))
        FROM public.teskeid_event_participation_rsvp_v3 AS decision
      )
      AND baseline.request_count = (
        SELECT pg_catalog.count(*)
        FROM public.teskeid_event_participation_mutation_requests_v3
      )
      AND baseline.invitation_anchor_count = (
        SELECT pg_catalog.count(*)
        FROM public.teskeid_event_participation_invitation_generations_v3
      )
      AND baseline.invitation_anchor_md5 = (
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          anchor.invitation_id::text || '|' || anchor.event_id::text || '|' ||
          anchor.event_guest_id::text || '|' ||
          anchor.identity_generation::text,
          E'\n' ORDER BY anchor.event_id,anchor.event_guest_id
        ), ''))
        FROM public.teskeid_event_participation_invitation_generations_v3
          AS anchor
      )
      AND pg_catalog.md5(pg_catalog.replace(
        baseline.predecessor_rsvp_v2_source,E'\r\n',E'\n'
      )) = '0b161601a4b91a521c42288b8279ff83'
  ) THEN
    RAISE EXCEPTION 'sql153_baseline_mismatch';
  END IF;

  IF EXISTS (
    WITH expected(
      trigger_name,relation_name,function_signature,trigger_type,
      is_deferrable,initially_deferred,update_columns
    ) AS (VALUES
      ('teskeid_event_participation_requests_mutation_guard',
        'public.teskeid_event_participation_mutation_requests',
        'public.teskeid_event_private_guard_participation_request_v2()',
        27,false,false,ARRAY[]::text[]),
      ('teskeid_event_guest_invitations_sql149_bound_guard',
        'public.teskeid_event_guest_invitations',
        'public.teskeid_event_private_guard_bound_invitation_v2()',
        23,false,false,ARRAY[]::text[]),
      ('teskeid_event_sql149_participation_account_email','auth.users',
        'public.teskeid_event_private_auth_email_invitations_v2()',
        17,false,false,ARRAY['email','email_confirmed_at']::text[]),
      ('teskeid_event_participations_account_unlink',
        'public.teskeid_event_participations',
        'public.teskeid_event_private_participation_unlink_v2()',
        19,false,false,ARRAY['recipient_user_id']::text[]),
      ('teskeid_event_sql149_participation_account_delete','auth.users',
        'public.teskeid_event_private_auth_delete_participations_v2()',
        11,false,false,ARRAY[]::text[]),
      ('teskeid_event_guests_sql149_participation_deferred',
        'public.teskeid_event_guests',
        'public.teskeid_event_private_v1_participation_bridge_v2()',
        29,true,true,ARRAY[]::text[]),
      ('teskeid_event_guest_invitations_sql149_participation_deferred',
        'public.teskeid_event_guest_invitations',
        'public.teskeid_event_private_v1_participation_bridge_v2()',
        29,true,true,ARRAY[]::text[]),
      ('teskeid_event_attendance_memberships_sql149_sync_deferred',
        'public.teskeid_event_attendance_memberships',
        'public.teskeid_event_private_v1_participation_bridge_v2()',
        29,true,true,ARRAY[]::text[]),
      ('teskeid_events_touch_updated_at','public.teskeid_events',
        'public.teskeid_event_touch_updated_at()',19,false,false,ARRAY[]::text[]),
      ('teskeid_event_guests_touch_updated_at','public.teskeid_event_guests',
        'public.teskeid_event_touch_updated_at()',19,false,false,ARRAY[]::text[]),
      ('teskeid_events_update_guard','public.teskeid_events',
        'public.teskeid_event_guard_event_update()',19,false,false,ARRAY[]::text[]),
      ('teskeid_event_guests_update_guard','public.teskeid_event_guests',
        'public.teskeid_event_guard_guest_update()',19,false,false,ARRAY[]::text[]),
      ('teskeid_event_receipts_mutation_guard','public.teskeid_event_mutation_requests',
        'public.teskeid_event_guard_receipt_mutation()',27,false,false,ARRAY[]::text[]),
      ('teskeid_event_guests_roster_deferred','public.teskeid_event_guests',
        'public.teskeid_event_roster_integrity_trigger()',29,true,true,ARRAY[]::text[]),
      ('teskeid_event_guest_invitations_touch_updated_at','public.teskeid_event_guest_invitations',
        'public.teskeid_event_touch_updated_at()',19,false,false,ARRAY[]::text[]),
      ('teskeid_event_attendance_receipts_mutation_guard','public.teskeid_event_attendance_mutation_requests',
        'public.teskeid_event_guard_attendance_receipt_mutation()',27,false,false,ARRAY[]::text[]),
      ('teskeid_event_attendance_memberships_integrity_deferred','public.teskeid_event_attendance_memberships',
        'public.teskeid_event_attendance_integrity_trigger()',29,true,true,ARRAY[]::text[]),
      ('teskeid_event_guest_invitations_integrity_deferred','public.teskeid_event_guest_invitations',
        'public.teskeid_event_attendance_integrity_trigger()',29,true,true,ARRAY[]::text[]),
      ('teskeid_event_guests_attendance_integrity_deferred','public.teskeid_event_guests',
        'public.teskeid_event_attendance_integrity_trigger()',25,true,true,ARRAY[]::text[]),
      ('teskeid_event_identity_authorizations_consumed_deferred','public.teskeid_event_guest_identity_mutation_authorizations',
        'public.teskeid_event_guard_identity_authorization_commit()',21,true,true,ARRAY[]::text[])
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgname=expected.trigger_name
     AND trigger_row.tgrelid=pg_catalog.to_regclass(expected.relation_name)
    LEFT JOIN LATERAL (
      SELECT COALESCE(pg_catalog.array_agg(
        attribute_row.attname::text ORDER BY attribute_row.attname
      ),ARRAY[]::text[]) AS update_columns
      FROM pg_catalog.unnest(COALESCE(
        trigger_row.tgattr::smallint[],ARRAY[]::smallint[]
      )) AS trigger_attribute(attnum)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid=trigger_row.tgrelid
       AND attribute_row.attnum=trigger_attribute.attnum
    ) AS actual_columns ON true
    WHERE trigger_row.oid IS NULL OR trigger_row.tgisinternal
       OR trigger_row.tgenabled<>'O'
       OR trigger_row.tgtype<>expected.trigger_type
       OR trigger_row.tgdeferrable<>expected.is_deferrable
       OR trigger_row.tginitdeferred<>expected.initially_deferred
       OR trigger_row.tgqual IS NOT NULL OR trigger_row.tgnargs<>0
       OR pg_catalog.octet_length(trigger_row.tgargs)<>0
       OR trigger_row.tgfoid<>
          pg_catalog.to_regprocedure(expected.function_signature)
       OR actual_columns.update_columns<>expected.update_columns
  ) THEN
    RAISE EXCEPTION 'sql153_final_source_trigger_mismatch';
  END IF;
  IF NOT EXISTS (
    WITH actual AS (
      SELECT pg_catalog.count(*)::integer AS index_count,
        pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          index_class.relname::text||'|'||
          pg_catalog.pg_get_indexdef(index_row.indexrelid)||'|'||index_row::text,
          E'\n' ORDER BY index_class.relname
        ),'')) AS catalog_md5
      FROM pg_catalog.pg_index AS index_row
      JOIN pg_catalog.pg_class AS index_class
        ON index_class.oid=index_row.indexrelid
      WHERE index_class.relname=ANY(ARRAY[
        'teskeid_events_pkey','teskeid_event_guests_event_id_id_key',
        'teskeid_event_guest_invitations_pkey',
        'teskeid_event_guest_invitations_sql149_identity_uidx',
        'teskeid_event_guest_invitations_pending_guest_uidx',
        'teskeid_event_guest_invitations_guest_history_idx',
        'teskeid_event_attendance_memberships_pkey',
        'teskeid_event_attendance_memberships_guest_uidx',
        'teskeid_event_attendance_memberships_invitation_uidx',
        'teskeid_event_attendance_memberships_user_idx',
        'teskeid_event_participations_pkey',
        'teskeid_event_participations_active_user_uidx',
        'teskeid_event_participations_active_email_uidx',
        'teskeid_event_person_labels_pkey',
        'teskeid_event_participation_requests_pkey',
        'teskeid_event_participation_invitation_terminalizations_pkey',
        'teskeid_event_participations_recipient_user_idx',
        'teskeid_event_participations_recipient_email_idx'
      ]::name[])
    )
    SELECT 1 FROM sql153_source_index_seal AS expected CROSS JOIN actual
    WHERE actual.index_count=expected.index_count
      AND actual.catalog_md5=expected.catalog_md5
  ) THEN
    RAISE EXCEPTION 'sql153_final_source_index_catalog_mismatch';
  END IF;
  IF NOT EXISTS (
    WITH actual AS (
      SELECT pg_catalog.count(*)::integer AS constraint_count,
        pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          constraint_row.conrelid::text||'|'||constraint_row.conname::text||'|'||
          constraint_row.contype::text||'|'||
          pg_catalog.pg_get_constraintdef(constraint_row.oid,true)||'|'||
          constraint_row.condeferrable::text||'|'||
          constraint_row.condeferred::text,
          E'\n' ORDER BY constraint_row.conrelid,constraint_row.conname
        ),'')) AS catalog_md5
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid=ANY(ARRAY[
        'public.teskeid_event_person_labels'::regclass,
        'public.teskeid_event_participations'::regclass,
        'public.teskeid_event_participation_mutation_requests'::regclass,
        'public.teskeid_event_participation_invitation_terminalizations'::regclass,
        'public.teskeid_event_attendance_memberships'::regclass
      ]) AND constraint_row.contype<>'t'
    )
    SELECT 1 FROM sql153_source_constraint_seal AS expected CROSS JOIN actual
    WHERE actual.constraint_count=expected.constraint_count
      AND actual.catalog_md5=expected.catalog_md5
  ) THEN
    RAISE EXCEPTION 'sql153_final_source_constraint_catalog_mismatch';
  END IF;
  IF NOT EXISTS (
    WITH actual AS (
      SELECT pg_catalog.count(*)::integer AS constraint_count,
        pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          constraint_row.conrelid::text||'|'||constraint_row.conname::text||
          '|'||constraint_row.contype::text||'|'||
          pg_catalog.pg_get_constraintdef(constraint_row.oid,true)||'|'||
          constraint_row.condeferrable::text||'|'||
          constraint_row.condeferred::text,
          E'\n' ORDER BY constraint_row.conrelid,constraint_row.conname
        ),'')) AS catalog_md5
      FROM sql153_legacy_authority_constraint_names AS expected
      JOIN pg_catalog.pg_constraint AS constraint_row
        ON constraint_row.conrelid=expected.relation_oid
       AND constraint_row.conname=expected.constraint_name
    )
    SELECT 1
    FROM sql153_legacy_authority_constraint_seal AS expected
    CROSS JOIN actual
    WHERE actual.constraint_count=expected.constraint_count
      AND actual.catalog_md5=expected.catalog_md5
  ) THEN
    RAISE EXCEPTION 'sql153_final_legacy_constraint_catalog_mismatch';
  END IF;

  IF NOT EXISTS (
    WITH actual AS (
      SELECT pg_catalog.count(*)::integer AS function_count,
        pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          procedure_row.proname::text || '(' ||
          pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) ||
          ')|' || pg_catalog.pg_get_function_arguments(procedure_row.oid) ||
          '|' || pg_catalog.pg_get_function_result(procedure_row.oid) ||
          '|' || procedure_row.prokind::text || '|' ||
          procedure_row.prosecdef::text || '|' ||
          procedure_row.proisstrict::text || '|' ||
          procedure_row.proleakproof::text || '|' ||
          procedure_row.proretset::text || '|' ||
          procedure_row.pronargdefaults::text || '|' ||
          procedure_row.provolatile::text || '|' ||
          procedure_row.proparallel::text || '|' ||
          COALESCE(procedure_row.proconfig::text,'-') || '|' ||
          COALESCE(procedure_row.proacl::text,'-') || '|' ||
          owner_role.rolname || '|' || language_row.lanname || '|' ||
          pg_catalog.md5(pg_catalog.replace(
            procedure_row.prosrc,E'\r\n',E'\n'
          )), E'\n' ORDER BY procedure_row.proname,
            pg_catalog.pg_get_function_identity_arguments(procedure_row.oid)
        ),'')) AS catalog_md5
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = procedure_row.pronamespace
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = procedure_row.proowner
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE namespace_row.nspname = 'public'
        AND procedure_row.proname = ANY(ARRAY[
          'teskeid_event_has_access','teskeid_event_assert_actor',
          'teskeid_event_assert_session_actor','teskeid_event_guard_event_update',
          'normalize_email_canonical',
          'teskeid_event_attendance_terminalize_invitations',
          'teskeid_event_attendance_mask_email',
          'teskeid_event_attendance_lock_user_emails',
          'teskeid_event_attendance_create_pending',
          'teskeid_event_normalize_text',
          'teskeid_event_attendance_safe_guest_label',
          'teskeid_event_attendance_sweep_expired',
          'teskeid_event_attendance_begin_response_request',
          'teskeid_event_attendance_finish_response_request',
          'teskeid_event_assert_financial_actor','teskeid_event_begin_request',
          'teskeid_event_finish_request','teskeid_event_assert_roster',
          'teskeid_event_roster_integrity_trigger',
          'teskeid_event_touch_updated_at','teskeid_event_guard_guest_update',
          'teskeid_event_guard_receipt_mutation',
          'teskeid_event_guard_identity_authorization_commit',
          'teskeid_event_guard_attendance_receipt_mutation',
          'teskeid_event_assert_attendance_integrity',
          'teskeid_event_attendance_integrity_trigger',
          'teskeid_event_create','teskeid_event_replace_roster',
          'teskeid_event_create_with_attendance_invitations',
          'teskeid_event_replace_roster_with_attendance_invitations',
          'teskeid_event_invite_guest_attendance',
          'teskeid_event_cancel_guest_attendance_invitation',
          'teskeid_event_save_details',
          'teskeid_event_create_with_details_and_attendance_invitations',
          'teskeid_event_private_normalize_shared_name_v2',
          'teskeid_event_private_valid_shared_name_v2',
          'teskeid_event_private_safe_profile_name_v2',
          'teskeid_event_valid_text','teskeid_event_uuid_from_text',
          'teskeid_event_private_format_utc_timestamp_v2',
          'teskeid_event_private_valid_canonical_email_v2',
          'teskeid_event_private_canonical_roster_input_v2',
          'teskeid_event_private_legacy_roster_input_v2',
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
          'teskeid_event_private_person_projection_v2',
          'teskeid_event_private_organizer_projection_v2',
          'teskeid_event_private_viewer_relationship_v2',
          'teskeid_event_private_people_projection_v2',
          'teskeid_event_get_actor_view_v2','teskeid_event_list_for_actor_v2',
          'teskeid_event_list_person_source_events_v2',
          'teskeid_event_get_person_source_roster_v2',
          'teskeid_event_list_person_source_events_v1',
          'teskeid_event_get_person_source_roster_v1',
          'teskeid_event_create_with_details_and_participations_v2',
          'teskeid_event_replace_roster_with_participations_v2',
          'teskeid_event_repair_person_label_v2',
          'teskeid_event_leave_attendance','teskeid_event_get_attendee_view',
          'teskeid_event_list_for_actor',
          'teskeid_event_get_guest_attendance_preview',
          'teskeid_event_respond_guest_attendance',
          'teskeid_event_list_my_pending_invitations'
        ]::name[])
    )
    SELECT 1
    FROM sql153_protected_function_seal AS expected
    CROSS JOIN actual
    WHERE actual.function_count = expected.function_count
      AND actual.catalog_md5 = expected.catalog_md5
  ) THEN
    RAISE EXCEPTION 'sql153_final_protected_catalog_mismatch';
  END IF;
END;
$sql153_final$;

DO $sql153_final_catalog$
DECLARE
  v_ok boolean;
BEGIN
  WITH expected(
    relation_name,column_name,ordinal_position,type_name,is_not_null,
    normalized_default,is_collatable
  ) AS (
    VALUES
      ('teskeid_event_participation_rsvp_v3','event_id',1,'uuid',true,NULL,false),
      ('teskeid_event_participation_rsvp_v3','event_guest_id',2,'uuid',true,NULL,false),
      ('teskeid_event_participation_rsvp_v3','identity_generation',3,'bigint',true,NULL,false),
      ('teskeid_event_participation_rsvp_v3','effective_state',4,'text',true,NULL,true),
      ('teskeid_event_participation_rsvp_v3','private_note',5,'text',false,NULL,true),
      ('teskeid_event_participation_rsvp_v3','decision_version',6,'bigint',true,NULL,false),
      ('teskeid_event_participation_rsvp_v3','created_at',7,'timestamp with time zone',true,'now()',false),
      ('teskeid_event_participation_rsvp_v3','updated_at',8,'timestamp with time zone',true,'now()',false),
      ('teskeid_event_participation_invitation_generations_v3','invitation_id',1,'uuid',true,NULL,false),
      ('teskeid_event_participation_invitation_generations_v3','event_id',2,'uuid',true,NULL,false),
      ('teskeid_event_participation_invitation_generations_v3','event_guest_id',3,'uuid',true,NULL,false),
      ('teskeid_event_participation_invitation_generations_v3','identity_generation',4,'bigint',true,NULL,false),
      ('teskeid_event_participation_invitation_generations_v3','anchored_at',5,'timestamp with time zone',true,'now()',false),
      ('teskeid_event_participation_mutation_requests_v3','actor_user_id',1,'uuid',true,NULL,false),
      ('teskeid_event_participation_mutation_requests_v3','request_id',2,'uuid',true,NULL,false),
      ('teskeid_event_participation_mutation_requests_v3','operation',3,'text',true,NULL,true),
      ('teskeid_event_participation_mutation_requests_v3','fingerprint',4,'text',true,NULL,true),
      ('teskeid_event_participation_mutation_requests_v3','result',5,'jsonb',false,NULL,false),
      ('teskeid_event_participation_mutation_requests_v3','created_at',6,'timestamp with time zone',true,'now()',false),
      ('teskeid_event_participation_mutation_requests_v3','completed_at',7,'timestamp with time zone',false,NULL,false),
      ('teskeid_event_sql153_install_baseline','singleton',1,'boolean',true,'true',false),
      ('teskeid_event_sql153_install_baseline','sql149_last_value',2,'bigint',true,NULL,false),
      ('teskeid_event_sql153_install_baseline','sql149_is_called',3,'boolean',true,NULL,false),
      ('teskeid_event_sql153_install_baseline','participation_count',4,'bigint',true,NULL,false),
      ('teskeid_event_sql153_install_baseline','rsvp_baseline_md5',5,'text',true,NULL,true),
      ('teskeid_event_sql153_install_baseline','pre_fence_rsvp_md5',6,'text',true,NULL,true),
      ('teskeid_event_sql153_install_baseline','decision_count',7,'bigint',true,NULL,false),
      ('teskeid_event_sql153_install_baseline','decision_baseline_md5',8,'text',true,NULL,true),
      ('teskeid_event_sql153_install_baseline','request_count',9,'bigint',true,NULL,false),
      ('teskeid_event_sql153_install_baseline','invitation_anchor_count',10,'bigint',true,NULL,false),
      ('teskeid_event_sql153_install_baseline','invitation_anchor_md5',11,'text',true,NULL,true),
      ('teskeid_event_sql153_install_baseline','predecessor_rsvp_v2_source',12,'text',true,NULL,true),
      ('teskeid_event_sql153_install_baseline','installed_at',13,'timestamp with time zone',true,'now()',false)
  ), actual AS (
    SELECT relation_row.relname::text AS relation_name,
      attribute_row.attname::text AS column_name,
      attribute_row.attnum::integer AS ordinal_position,
      pg_catalog.format_type(attribute_row.atttypid,attribute_row.atttypmod)
        AS type_name,
      attribute_row.attnotnull AS is_not_null,
      pg_catalog.regexp_replace(COALESCE(pg_catalog.pg_get_expr(
        default_row.adbin,default_row.adrelid
      ),''),'[[:space:]]','','g') AS normalized_default,
      attribute_row.attcollation <> 0 AS is_collatable,
      attribute_row.attcollation AS collation_oid,
      attribute_row.attidentity,attribute_row.attgenerated
    FROM pg_catalog.pg_attribute AS attribute_row
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = attribute_row.attrelid
    LEFT JOIN pg_catalog.pg_attrdef AS default_row
      ON default_row.adrelid = attribute_row.attrelid
     AND default_row.adnum = attribute_row.attnum
    WHERE attribute_row.attrelid = ANY(ARRAY[
      'public.teskeid_event_participation_rsvp_v3'::regclass,
      'public.teskeid_event_participation_invitation_generations_v3'::regclass,
      'public.teskeid_event_participation_mutation_requests_v3'::regclass,
      'public.teskeid_event_sql153_install_baseline'::regclass
    ]) AND attribute_row.attnum > 0 AND NOT attribute_row.attisdropped
  )
  SELECT pg_catalog.count(*) = 33 AND pg_catalog.bool_and(
    actual.column_name = expected.column_name
    AND actual.ordinal_position = expected.ordinal_position
    AND actual.type_name = expected.type_name
    AND actual.is_not_null = expected.is_not_null
    AND actual.normalized_default = COALESCE(expected.normalized_default,'')
    AND actual.is_collatable = expected.is_collatable
    AND actual.collation_oid = CASE WHEN expected.is_collatable
      THEN pg_catalog.to_regcollation('pg_catalog."default"')
      ELSE 0::oid END
    AND actual.attidentity = '' AND actual.attgenerated = ''
  ) INTO v_ok
  FROM expected
  LEFT JOIN actual
    ON actual.relation_name = expected.relation_name
   AND actual.column_name = expected.column_name;
  IF NOT COALESCE(v_ok,false) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_attribute AS attribute_row
    WHERE attribute_row.attrelid = ANY(ARRAY[
      'public.teskeid_event_participation_rsvp_v3'::regclass,
      'public.teskeid_event_participation_invitation_generations_v3'::regclass,
      'public.teskeid_event_participation_mutation_requests_v3'::regclass,
      'public.teskeid_event_sql153_install_baseline'::regclass
    ]) AND attribute_row.attnum > 0 AND NOT attribute_row.attisdropped
  ) <> 33 THEN
    RAISE EXCEPTION 'sql153_column_shape_mismatch';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid = ANY(ARRAY[
        'public.teskeid_event_participation_rsvp_v3'::regclass,
        'public.teskeid_event_participation_invitation_generations_v3'::regclass,
        'public.teskeid_event_participation_mutation_requests_v3'::regclass,
        'public.teskeid_event_sql153_install_baseline'::regclass
      ]) AND contype <> 't') <> 21 OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = ANY(ARRAY[
      'public.teskeid_event_participation_rsvp_v3'::regclass,
      'public.teskeid_event_participation_invitation_generations_v3'::regclass,
      'public.teskeid_event_participation_mutation_requests_v3'::regclass,
      'public.teskeid_event_sql153_install_baseline'::regclass
    ]) AND contype <> 't' AND conname <> ALL(ARRAY[
      'teskeid_event_participation_rsvp_v3_pkey',
      'teskeid_event_participation_rsvp_v3_current_key',
      'teskeid_event_participation_rsvp_v3_generation_check',
      'teskeid_event_participation_rsvp_v3_state_check',
      'teskeid_event_participation_rsvp_v3_version_check',
      'teskeid_event_participation_rsvp_v3_note_shape_check',
      'teskeid_event_participation_rsvp_v3_participation_fk',
      'teskeid_event_participation_invitation_gen_v3_pkey',
      'teskeid_event_participation_invitation_gen_v3_current_key',
      'teskeid_event_participation_invitation_gen_v3_check',
      'teskeid_event_participation_invitation_gen_v3_invite_fk',
      'teskeid_event_participation_invitation_gen_v3_rsvp_fk',
      'teskeid_event_participation_requests_v3_pkey',
      'teskeid_event_participation_requests_v3_operation_check',
      'teskeid_event_participation_requests_v3_fingerprint_check',
      'teskeid_event_participation_requests_v3_result_check',
      'teskeid_event_participation_requests_v3_completion_check',
      'teskeid_event_participation_requests_v3_actor_fk',
      'teskeid_event_sql153_install_baseline_pkey',
      'teskeid_event_sql153_baseline_singleton_check',
      'teskeid_event_sql153_baseline_hash_check'
    ]::name[])
  ) THEN
    RAISE EXCEPTION 'sql153_constraint_inventory_mismatch';
  END IF;

  WITH expected(
    constraint_name,relation_name,constraint_type,local_columns,
    referenced_relation,referenced_columns,delete_action,
    is_deferrable,initially_deferred
  ) AS (
    VALUES
      ('teskeid_event_participation_rsvp_v3_pkey','teskeid_event_participation_rsvp_v3','p',ARRAY['event_id','event_guest_id','identity_generation']::text[],NULL::text,ARRAY[]::text[],NULL::"char",false,false),
      ('teskeid_event_participation_rsvp_v3_current_key','teskeid_event_participation_rsvp_v3','u',ARRAY['event_id','event_guest_id']::text[],NULL,ARRAY[]::text[],NULL::"char",false,false),
      ('teskeid_event_participation_rsvp_v3_participation_fk','teskeid_event_participation_rsvp_v3','f',ARRAY['event_id','event_guest_id']::text[],'public.teskeid_event_participations',ARRAY['event_id','event_guest_id']::text[],'c'::"char",true,true),
      ('teskeid_event_participation_invitation_gen_v3_pkey','teskeid_event_participation_invitation_generations_v3','p',ARRAY['invitation_id']::text[],NULL,ARRAY[]::text[],NULL::"char",false,false),
      ('teskeid_event_participation_invitation_gen_v3_current_key','teskeid_event_participation_invitation_generations_v3','u',ARRAY['event_id','event_guest_id','identity_generation']::text[],NULL,ARRAY[]::text[],NULL::"char",false,false),
      ('teskeid_event_participation_invitation_gen_v3_invite_fk','teskeid_event_participation_invitation_generations_v3','f',ARRAY['invitation_id','event_id','event_guest_id']::text[],'public.teskeid_event_guest_invitations',ARRAY['id','event_id','event_guest_id']::text[],'c'::"char",true,true),
      ('teskeid_event_participation_invitation_gen_v3_rsvp_fk','teskeid_event_participation_invitation_generations_v3','f',ARRAY['event_id','event_guest_id','identity_generation']::text[],'public.teskeid_event_participation_rsvp_v3',ARRAY['event_id','event_guest_id','identity_generation']::text[],'c'::"char",true,true),
      ('teskeid_event_participation_requests_v3_pkey','teskeid_event_participation_mutation_requests_v3','p',ARRAY['actor_user_id','request_id']::text[],NULL,ARRAY[]::text[],NULL::"char",false,false),
      ('teskeid_event_participation_requests_v3_actor_fk','teskeid_event_participation_mutation_requests_v3','f',ARRAY['actor_user_id']::text[],'auth.users',ARRAY['id']::text[],'c'::"char",true,true),
      ('teskeid_event_sql153_install_baseline_pkey','teskeid_event_sql153_install_baseline','p',ARRAY['singleton']::text[],NULL,ARRAY[]::text[],NULL::"char",false,false)
  )
  SELECT pg_catalog.count(constraint_row.oid) = 10
    AND pg_catalog.bool_and(
      constraint_row.contype = expected.constraint_type::"char"
      AND constraint_row.convalidated
      AND (
        expected.constraint_type<>'c' OR NOT constraint_row.connoinherit
      )
      AND constraint_row.condeferrable = expected.is_deferrable
      AND constraint_row.condeferred = expected.initially_deferred
      AND ARRAY(
        SELECT attribute_row.attname::text
        FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY
          AS keyed(attnum,ordinal_position)
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid = constraint_row.conrelid
         AND attribute_row.attnum = keyed.attnum
        ORDER BY keyed.ordinal_position
      ) = expected.local_columns
      AND (expected.constraint_type <> 'f' OR (
        constraint_row.confrelid =
          pg_catalog.to_regclass(expected.referenced_relation)
        AND ARRAY(
          SELECT attribute_row.attname::text
          FROM pg_catalog.unnest(constraint_row.confkey) WITH ORDINALITY
            AS keyed(attnum,ordinal_position)
          JOIN pg_catalog.pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.confrelid
           AND attribute_row.attnum = keyed.attnum
          ORDER BY keyed.ordinal_position
        ) = expected.referenced_columns
        AND constraint_row.confdeltype = expected.delete_action
        AND constraint_row.confupdtype = 'a'
        AND constraint_row.confmatchtype = 's'
      ))
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.relation_name
    ) AND constraint_row.conname = expected.constraint_name;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_constraint_shape_mismatch';
  END IF;

  WITH expected(
    relation_name,constraint_name,normalized_expression
  ) AS (VALUES
    ('teskeid_event_participation_rsvp_v3',
      'teskeid_event_participation_rsvp_v3_generation_check',
      'identity_generation>0'),
    ('teskeid_event_participation_rsvp_v3',
      'teskeid_event_participation_rsvp_v3_state_check',
      'effective_state=anyarray[''no_response'',''considering'',''attending'',''not_attending'']'),
    ('teskeid_event_participation_rsvp_v3',
      'teskeid_event_participation_rsvp_v3_version_check',
      'decision_version>0'),
    ('teskeid_event_participation_rsvp_v3',
      'teskeid_event_participation_rsvp_v3_note_shape_check',
      'private_noteisnulloreffective_state=''considering''andteskeid_event_private_normalize_note_v3private_noteisnotnullandnotprivate_noteisdistinctfromteskeid_event_private_normalize_note_v3private_note'),
    ('teskeid_event_participation_invitation_generations_v3',
      'teskeid_event_participation_invitation_gen_v3_check',
      'identity_generation>0'),
    ('teskeid_event_participation_mutation_requests_v3',
      'teskeid_event_participation_requests_v3_operation_check',
      'operation=anyarray[''set_rsvp_v3'',''leave_v3'']'),
    ('teskeid_event_participation_mutation_requests_v3',
      'teskeid_event_participation_requests_v3_fingerprint_check',
      'fingerprint~''^[0-9a-f]{32}$'''),
    ('teskeid_event_participation_mutation_requests_v3',
      'teskeid_event_participation_requests_v3_result_check',
      'resultisnullorjsonb_typeofresult=''object''andoctet_lengthresult<=8192'),
    ('teskeid_event_participation_mutation_requests_v3',
      'teskeid_event_participation_requests_v3_completion_check',
      'resultisnull=completed_atisnull'),
    ('teskeid_event_sql153_install_baseline',
      'teskeid_event_sql153_baseline_singleton_check','singleton'),
    ('teskeid_event_sql153_install_baseline',
      'teskeid_event_sql153_baseline_hash_check',
      'rsvp_baseline_md5~''^[0-9a-f]{32}$''andpre_fence_rsvp_md5~''^[0-9a-f]{32}$''anddecision_baseline_md5~''^[0-9a-f]{32}$''andinvitation_anchor_md5~''^[0-9a-f]{32}$''andpredecessor_rsvp_v2_source<>''''andoctet_lengthpredecessor_rsvp_v2_source<=65536andparticipation_count>=0anddecision_count>=0andrequest_count=0andinvitation_anchor_count>=0')
  )
  SELECT pg_catalog.count(constraint_row.oid)=11
    AND pg_catalog.bool_and(
      constraint_row.contype='c' AND constraint_row.convalidated
      AND NOT constraint_row.connoinherit
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred
      AND pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_expr(
        constraint_row.conbin,constraint_row.conrelid,true
      )),'public[.]|pg_catalog[.]|[()[:space:]]|::text','','g')=
        expected.normalized_expression
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid=pg_catalog.to_regclass(
      'public.'||expected.relation_name
    ) AND constraint_row.conname=expected.constraint_name;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_check_constraint_definition_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS note_constraint
    JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid='pg_catalog.pg_constraint'::regclass
     AND dependency.objid=note_constraint.oid
     AND dependency.refclassid='pg_catalog.pg_proc'::regclass
     AND dependency.refobjid=pg_catalog.to_regprocedure(
       'public.teskeid_event_private_normalize_note_v3(text)'
     )
     AND dependency.deptype='n'
    WHERE note_constraint.conrelid=
      'public.teskeid_event_participation_rsvp_v3'::regclass
      AND note_constraint.conname=
        'teskeid_event_participation_rsvp_v3_note_shape_check'
      AND note_constraint.contype='c'
  ) THEN
    RAISE EXCEPTION 'sql153_note_constraint_dependency_mismatch';
  END IF;

  WITH expected(
    index_name,table_name,index_definition,is_unique,is_primary,column_names,
    operator_classes,collations,index_options
  ) AS (VALUES
    ('teskeid_event_participation_rsvp_v3_pkey','public.teskeid_event_participation_rsvp_v3','CREATE UNIQUE INDEX teskeid_event_participation_rsvp_v3_pkey ON public.teskeid_event_participation_rsvp_v3 USING btree (event_id, event_guest_id, identity_generation)',true,true,ARRAY['event_id','event_guest_id','identity_generation']::text[],ARRAY['uuid_ops','uuid_ops','int8_ops']::text[],ARRAY['','','']::text[],ARRAY[0,0,0]::smallint[]),
    ('teskeid_event_participation_rsvp_v3_current_key','public.teskeid_event_participation_rsvp_v3','CREATE UNIQUE INDEX teskeid_event_participation_rsvp_v3_current_key ON public.teskeid_event_participation_rsvp_v3 USING btree (event_id, event_guest_id)',true,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[]),
    ('teskeid_event_participation_invitation_gen_v3_pkey','public.teskeid_event_participation_invitation_generations_v3','CREATE UNIQUE INDEX teskeid_event_participation_invitation_gen_v3_pkey ON public.teskeid_event_participation_invitation_generations_v3 USING btree (invitation_id)',true,true,ARRAY['invitation_id']::text[],ARRAY['uuid_ops']::text[],ARRAY['']::text[],ARRAY[0]::smallint[]),
    ('teskeid_event_participation_invitation_gen_v3_current_key','public.teskeid_event_participation_invitation_generations_v3','CREATE UNIQUE INDEX teskeid_event_participation_invitation_gen_v3_current_key ON public.teskeid_event_participation_invitation_generations_v3 USING btree (event_id, event_guest_id, identity_generation)',true,false,ARRAY['event_id','event_guest_id','identity_generation']::text[],ARRAY['uuid_ops','uuid_ops','int8_ops']::text[],ARRAY['','','']::text[],ARRAY[0,0,0]::smallint[]),
    ('teskeid_event_participation_requests_v3_pkey','public.teskeid_event_participation_mutation_requests_v3','CREATE UNIQUE INDEX teskeid_event_participation_requests_v3_pkey ON public.teskeid_event_participation_mutation_requests_v3 USING btree (actor_user_id, request_id)',true,true,ARRAY['actor_user_id','request_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[]),
    ('teskeid_event_participation_requests_v3_created_idx','public.teskeid_event_participation_mutation_requests_v3','CREATE INDEX teskeid_event_participation_requests_v3_created_idx ON public.teskeid_event_participation_mutation_requests_v3 USING btree (created_at, actor_user_id, request_id)',false,false,ARRAY['created_at','actor_user_id','request_id']::text[],ARRAY['timestamptz_ops','uuid_ops','uuid_ops']::text[],ARRAY['','','']::text[],ARRAY[0,0,0]::smallint[]),
    ('teskeid_event_sql153_install_baseline_pkey','public.teskeid_event_sql153_install_baseline','CREATE UNIQUE INDEX teskeid_event_sql153_install_baseline_pkey ON public.teskeid_event_sql153_install_baseline USING btree (singleton)',true,true,ARRAY['singleton']::text[],ARRAY['bool_ops']::text[],ARRAY['']::text[],ARRAY[0]::smallint[])
  )
  SELECT pg_catalog.count(index_row.indexrelid) = 7
    AND pg_catalog.bool_and(
      pg_catalog.pg_get_indexdef(index_row.indexrelid) =
        expected.index_definition
      AND index_row.indrelid=pg_catalog.to_regclass(expected.table_name)
      AND index_row.indisunique=expected.is_unique
      AND index_row.indisprimary=expected.is_primary
      AND index_row.indisvalid AND index_row.indisready
      AND index_row.indislive AND index_row.indimmediate
      AND NOT index_row.indcheckxmin AND NOT index_row.indisclustered
      AND NOT index_row.indisreplident AND NOT index_row.indnullsnotdistinct
      AND NOT index_row.indisexclusion AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
      AND index_row.indnkeyatts=pg_catalog.cardinality(expected.column_names)
      AND index_row.indnatts=index_row.indnkeyatts
      AND access_method.amname='btree'
      AND actual_metadata.column_names=expected.column_names
      AND actual_metadata.operator_classes=expected.operator_classes
      AND actual_metadata.collations=expected.collations
      AND actual_metadata.index_options=expected.index_options
      AND owner_role.rolname = 'postgres'
      AND index_class.reltablespace = 0 AND index_class.relacl IS NULL
      AND pg_catalog.cardinality(COALESCE(
        index_class.reloptions,ARRAY[]::text[]
      )) = 0
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_index AS index_row
    ON index_row.indexrelid = pg_catalog.to_regclass(
      'public.' || expected.index_name
    )
  LEFT JOIN pg_catalog.pg_class AS index_class
    ON index_class.oid = index_row.indexrelid
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = index_class.relowner
  LEFT JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid=index_class.relam
  LEFT JOIN LATERAL (
    SELECT
      ARRAY(SELECT attribute_row.attname::text
        FROM pg_catalog.unnest(index_row.indkey) WITH ORDINALITY
          AS keyed(attnum,ordinal_position)
        JOIN pg_catalog.pg_attribute AS attribute_row
          ON attribute_row.attrelid=index_row.indrelid
         AND attribute_row.attnum=keyed.attnum
        ORDER BY keyed.ordinal_position) AS column_names,
      ARRAY(SELECT operator_class.opcname::text
        FROM pg_catalog.unnest(index_row.indclass) WITH ORDINALITY
          AS keyed(opclass_oid,ordinal_position)
        JOIN pg_catalog.pg_opclass AS operator_class
          ON operator_class.oid=keyed.opclass_oid
        ORDER BY keyed.ordinal_position) AS operator_classes,
      ARRAY(SELECT COALESCE(collation_row.collname,'')::text
        FROM pg_catalog.unnest(index_row.indcollation) WITH ORDINALITY
          AS keyed(collation_oid,ordinal_position)
        LEFT JOIN pg_catalog.pg_collation AS collation_row
          ON collation_row.oid=keyed.collation_oid
        ORDER BY keyed.ordinal_position) AS collations,
      ARRAY(SELECT option_value::smallint
        FROM pg_catalog.unnest(index_row.indoption) WITH ORDINALITY
          AS keyed(option_value,ordinal_position)
        ORDER BY keyed.ordinal_position) AS index_options
  ) AS actual_metadata ON true;
  IF NOT COALESCE(v_ok,false) OR (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_index
    WHERE indrelid = ANY(ARRAY[
      'public.teskeid_event_participation_rsvp_v3'::regclass,
      'public.teskeid_event_participation_invitation_generations_v3'::regclass,
      'public.teskeid_event_participation_mutation_requests_v3'::regclass,
      'public.teskeid_event_sql153_install_baseline'::regclass
    ])) <> 7 THEN
    RAISE EXCEPTION 'sql153_index_shape_mismatch';
  END IF;

  IF EXISTS (
    WITH expected(
      trigger_name,relation_name,function_signature,trigger_type,
      is_deferrable,initially_deferred,update_columns,definition_md5
    ) AS (VALUES
      ('teskeid_event_participation_requests_v3_guard','public.teskeid_event_participation_mutation_requests_v3','public.teskeid_event_private_guard_request_v3()',27,false,false,ARRAY[]::text[],'53e4fadfcf5f7e930dae5f2d7c21a9da'),
      ('teskeid_event_participations_sql153_generation_rsvp_bump','public.teskeid_event_participations','public.teskeid_event_private_bump_generation_rsvp_v3()',19,false,false,ARRAY['identity_generation']::text[],'79dd9233e23f7c3ca18405df5c00f62b'),
      ('teskeid_event_participations_sql153_rsvp_sync','public.teskeid_event_participations','public.teskeid_event_private_sync_rsvp_v3()',21,false,false,ARRAY[]::text[],'5aac98d0010360050b49f3ae294e2f77'),
      ('teskeid_event_guest_invitations_sql153_anchor_deferred','public.teskeid_event_guest_invitations','public.teskeid_event_private_anchor_sync_v3()',21,true,true,ARRAY[]::text[],'d9b51df3760832dc2a0c872b3098ec42'),
      ('teskeid_event_participations_sql153_integrity_deferred','public.teskeid_event_participations','public.teskeid_event_private_rsvp_integrity_trigger_v3()',29,true,true,ARRAY[]::text[],'0aef6cfe26f6e9073b4eee368b3afda2'),
      ('teskeid_event_rsvp_v3_integrity_deferred','public.teskeid_event_participation_rsvp_v3','public.teskeid_event_private_rsvp_integrity_trigger_v3()',29,true,true,ARRAY[]::text[],'5f3aff0ce80ecaf12a31a1c61687f057')
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
       )))<>expected.definition_md5
       OR (expected.is_deferrable AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_constraint AS trigger_constraint
         WHERE trigger_constraint.oid=trigger_row.tgconstraint
           AND trigger_constraint.conname=expected.trigger_name
           AND trigger_constraint.contype='t'
           AND trigger_constraint.conrelid=trigger_row.tgrelid
           AND trigger_constraint.condeferrable
           AND trigger_constraint.condeferred
           AND trigger_constraint.convalidated
       ))
       OR (NOT expected.is_deferrable AND trigger_row.tgconstraint<>0)
  ) OR NOT EXISTS (
    WITH actual AS (
      SELECT pg_catalog.count(*)::integer AS trigger_count,
        pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          trigger_row.tgname::text || '|' || trigger_row.tgrelid::text || '|' ||
          trigger_row.tgfoid::text || '|' || trigger_row.tgtype::text || '|' ||
          trigger_row.tgenabled::text || '|' || trigger_row.tgconstraint::text ||
          '|' || trigger_row.tgdeferrable::text || '|' ||
          trigger_row.tginitdeferred::text || '|' ||
          pg_catalog.md5(pg_catalog.pg_get_triggerdef(trigger_row.oid)),
          E'\n' ORDER BY trigger_row.tgname
        ),'')) AS catalog_md5
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgname=ANY(ARRAY[
        'teskeid_event_participation_requests_mutation_guard',
        'teskeid_event_guest_invitations_sql149_bound_guard',
        'teskeid_event_sql149_participation_account_email',
        'teskeid_event_participations_account_unlink',
        'teskeid_event_sql149_participation_account_delete',
        'teskeid_event_guests_sql149_participation_deferred',
        'teskeid_event_guest_invitations_sql149_participation_deferred',
        'teskeid_event_attendance_memberships_sql149_sync_deferred',
        'teskeid_events_touch_updated_at','teskeid_event_guests_touch_updated_at',
        'teskeid_events_update_guard','teskeid_event_guests_update_guard',
        'teskeid_event_receipts_mutation_guard',
        'teskeid_event_guests_roster_deferred',
        'teskeid_event_guest_invitations_touch_updated_at',
        'teskeid_event_attendance_receipts_mutation_guard',
        'teskeid_event_attendance_memberships_integrity_deferred',
        'teskeid_event_guest_invitations_integrity_deferred',
        'teskeid_event_guests_attendance_integrity_deferred',
        'teskeid_event_identity_authorizations_consumed_deferred'
      ]::name[])
    )
    SELECT 1 FROM sql153_source_trigger_seal AS expected
    CROSS JOIN actual
    WHERE actual.trigger_count=expected.trigger_count
      AND actual.catalog_md5=expected.catalog_md5
  ) OR (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger_row
    WHERE NOT trigger_row.tgisinternal
      AND (trigger_row.tgname LIKE '%sql153%'
        OR trigger_row.tgname=ANY(ARRAY[
          'teskeid_event_participation_requests_v3_guard',
          'teskeid_event_rsvp_v3_integrity_deferred'
        ]::name[]))
  ) <> 6 THEN
    RAISE EXCEPTION 'sql153_trigger_shape_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS catalog_object
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = catalog_object.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND (catalog_object.relname LIKE '%sql153%'
        OR catalog_object.relname LIKE '%_v3')
      AND pg_catalog.octet_length(catalog_object.relname) > 63
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND procedure_row.proname LIKE 'teskeid_event%v3'
      AND pg_catalog.octet_length(procedure_row.proname) > 63
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
    WHERE NOT trigger_row.tgisinternal
      AND (trigger_row.tgname LIKE '%sql153%'
        OR trigger_row.tgname=ANY(ARRAY[
          'teskeid_event_participation_requests_v3_guard',
          'teskeid_event_rsvp_v3_integrity_deferred'
        ]::name[]))
      AND pg_catalog.octet_length(trigger_row.tgname) > 63
  ) THEN
    RAISE EXCEPTION 'sql153_identifier_length_mismatch';
  END IF;
END;
$sql153_final_catalog$;

COMMIT;
