-- DESTRUCTIVE SQL153 recovery. This is not a normal rollout step.
-- Run only before Stage B and only after independent review confirms every
-- guard below still describes the exact unused SQL153 install baseline.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL search_path=pg_catalog,public;

SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'teskeid:sql149:event-participant-identity-display',14901));
SELECT pg_catalog.pg_advisory_xact_lock(15001);
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'teskeid:sql153:event-opt-out-scoped-participant-access',15301));

-- Auth first, then Event sources, then SQL153 targets: this is the same
-- write-blocking order as install and prevents a guard/drop race.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_events IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_details IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_guests IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_guest_invitations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_attendance_memberships IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_participations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_participation_invitation_terminalizations
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_participation_rsvp_v3
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_participation_invitation_generations_v3
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_participation_mutation_requests_v3
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.teskeid_event_sql153_install_baseline
  IN SHARE ROW EXCLUSIVE MODE;

DO $sql153_recovery_guard$
DECLARE
  v_ok boolean;
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'sql153_recovery_executor_mismatch';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid=procedure_row.pronamespace
      WHERE namespace_row.nspname='public'
        AND procedure_row.proname LIKE 'teskeid_event%v3')<>22
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
         WHERE conrelid=ANY(ARRAY[
           'public.teskeid_event_participation_rsvp_v3'::regclass,
           'public.teskeid_event_participation_invitation_generations_v3'::regclass,
           'public.teskeid_event_participation_mutation_requests_v3'::regclass,
           'public.teskeid_event_sql153_install_baseline'::regclass])
           AND contype<>'t')<>21
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index
         WHERE indrelid=ANY(ARRAY[
           'public.teskeid_event_participation_rsvp_v3'::regclass,
           'public.teskeid_event_participation_invitation_generations_v3'::regclass,
           'public.teskeid_event_participation_mutation_requests_v3'::regclass,
           'public.teskeid_event_sql153_install_baseline'::regclass]))<>7
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger_row
         WHERE NOT trigger_row.tgisinternal
           AND (trigger_row.tgname LIKE '%sql153%'
             OR trigger_row.tgname=ANY(ARRAY[
               'teskeid_event_participation_requests_v3_guard',
               'teskeid_event_rsvp_v3_integrity_deferred'
             ]::name[])))<>6
  THEN
    RAISE EXCEPTION 'sql153_recovery_catalog_inventory_mismatch';
  END IF;

  WITH expected(
    signature,exact_arguments,result_type,language_name,volatility,is_strict,
    parallel_safety,source_md5,service_execute
  ) AS (VALUES
    ('public.teskeid_event_private_normalize_note_v3(text)','p_value text','text','sql','i',false,'u','eef600423fb1151933ad906fb218f11a',false),
    ('public.teskeid_event_private_begin_request_v3(uuid,uuid,text,text)','p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text','jsonb','plpgsql','v',false,'u','f786927ca67a68761b562dbdeb11e001',false),
    ('public.teskeid_event_private_finish_request_v3(uuid,uuid,jsonb)','p_actor_id uuid, p_request_id uuid, p_result jsonb','void','plpgsql','v',false,'u','9f96d74b702f0db867d56b5b2834b715',false),
    ('public.teskeid_event_private_guard_request_v3()','','trigger','plpgsql','v',false,'u','822194380c3597b9bf2f8db03789e197',false),
    ('public.teskeid_event_private_bump_generation_rsvp_v3()','','trigger','plpgsql','v',false,'u','9f7c2be934e4e3db5be808e4b0800e42',false),
    ('public.teskeid_event_private_sync_rsvp_v3()','','trigger','plpgsql','v',false,'u','7126c130f7f17ad07d443a39d9aa57de',false),
    ('public.teskeid_event_private_anchor_invitation_v3(uuid,uuid)','p_event_id uuid, p_event_guest_id uuid','void','plpgsql','v',false,'u','bc974233ced86a3c906adfcec209eb64',false),
    ('public.teskeid_event_private_anchor_sync_v3()','','trigger','plpgsql','v',false,'u','db82578fc700fc64590c0b1d65b0ab00',false),
    ('public.teskeid_event_private_assert_rsvp_integrity_v3(uuid,uuid)','p_event_id uuid, p_event_guest_id uuid','void','plpgsql','s',false,'u','e17f216bb8fd6f0ddb914065b82518d5',false),
    ('public.teskeid_event_private_rsvp_integrity_trigger_v3()','','trigger','plpgsql','v',false,'u','3c645c3e5f46cc2a349329e5dd486a1a',false),
    ('public.teskeid_event_private_claim_scoped_v3(uuid,uuid)','p_actor_id uuid, p_event_id uuid','integer','plpgsql','v',false,'u','5b7eecb3f7e9aebb6a376ffd312989be',false),
    ('public.teskeid_event_private_scope_v3(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',false,'u','df104d5af3896804c7b8ef3321d191c8',false),
    ('public.teskeid_event_private_person_projection_v3(uuid,uuid,uuid,integer,boolean,boolean)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_position integer, p_is_self boolean, p_include_private_note boolean','jsonb','plpgsql','s',false,'u','d0fa5cf0bcf1752cf1d996d64c6a1bd8',false),
    ('public.teskeid_event_private_people_projection_v3(uuid,uuid,text,uuid,boolean)','p_actor_id uuid, p_event_id uuid, p_viewer_role text, p_self_event_guest_id uuid, p_include_rsvp_notes boolean','jsonb','plpgsql','s',false,'u','7f432c3c5ecc419596cf9146348d06f3',false),
    ('public.teskeid_event_resolve_invitation_v3(uuid,uuid)','p_actor_id uuid, p_invitation_id uuid','jsonb','plpgsql','v',false,'u','01d8dd933c67fb20248628537d97c781',true),
    ('public.teskeid_event_list_scoped_participations_v3(uuid)','p_actor_id uuid','jsonb','plpgsql','v',false,'u','49ab80161d27a7a73df7491bf04ac6cd',true),
    ('public.teskeid_event_get_actor_view_v3(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',false,'u','53e06c5199c18dba36be664cc9ff7ed1',true),
    ('public.teskeid_event_list_for_actor_v3(uuid)','p_actor_id uuid','jsonb','plpgsql','v',false,'u','2e1d9722aad45bef1856af41302d658e',true),
    ('public.teskeid_event_list_person_source_events_v3(uuid,timestamp with time zone,uuid,integer)','p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer','jsonb','plpgsql','v',false,'u','49b3b72827e3592ca75a5aed220e8a24',true),
    ('public.teskeid_event_get_person_source_roster_v3(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',false,'u','160bdcb9976c79219abd986357c2ee14',true),
    ('public.teskeid_event_set_rsvp_v3(uuid,uuid,uuid,bigint,text,text,bigint,uuid)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_identity_generation bigint, p_rsvp_state text, p_private_note text, p_expected_decision_version bigint, p_request_id uuid','jsonb','plpgsql','v',false,'u','d4aca35f7f7a8f5146c5b87d5447419c',true),
    ('public.teskeid_event_leave_participation_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_identity_generation bigint, p_expected_identity_version bigint, p_expected_access_version bigint, p_request_id uuid','jsonb','plpgsql','v',false,'u','49b11bb0f39c308b5eacfe01e0fcd47b',true),
    ('public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_rsvp_state text, p_expected_rsvp_version bigint, p_request_id uuid','jsonb','plpgsql','v',false,'u','0eae77a1f1f9ef59049cd580694d3e41',true)
  )
  SELECT pg_catalog.count(procedure_row.oid)=23 AND pg_catalog.bool_and(
    pg_catalog.md5(pg_catalog.replace(procedure_row.prosrc,E'\r\n',E'\n'))
      =expected.source_md5
    AND owner_role.rolname='postgres'
    AND language_row.lanname=expected.language_name
    AND procedure_row.prokind='f' AND procedure_row.prosecdef
    AND procedure_row.proisstrict=expected.is_strict
    AND NOT procedure_row.proleakproof AND NOT procedure_row.proretset
    AND procedure_row.pronargdefaults=0
    AND procedure_row.provolatile=expected.volatility::"char"
    AND procedure_row.proparallel=expected.parallel_safety::"char"
    AND pg_catalog.pg_get_function_result(procedure_row.oid)=expected.result_type
    AND pg_catalog.pg_get_function_arguments(procedure_row.oid)=expected.exact_arguments
    AND procedure_row.proconfig=ARRAY['search_path=""']::text[]
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS overload
      WHERE overload.pronamespace=procedure_row.pronamespace
        AND overload.proname=procedure_row.proname)=1
    AND pg_catalog.has_function_privilege('postgres',procedure_row.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon',procedure_row.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated',procedure_row.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role',procedure_row.oid,'EXECUTE')
      =expected.service_execute
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.aclexplode(COALESCE(
      procedure_row.proacl,pg_catalog.acldefault('f',procedure_row.proowner)
    )))=CASE WHEN expected.service_execute THEN 2 ELSE 1 END
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
        procedure_row.proacl,pg_catalog.acldefault('f',procedure_row.proowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=privilege.grantee
      WHERE privilege.grantor<>procedure_row.proowner
        OR privilege.privilege_type<>'EXECUTE' OR privilege.grantee=0
        OR privilege.is_grantable OR (
          privilege.grantee<>procedure_row.proowner AND (
            NOT expected.service_execute
            OR grantee.rolname IS DISTINCT FROM 'service_role')))
  ) INTO v_ok
  FROM expected LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid=pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=procedure_row.proowner
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid=procedure_row.prolang;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_function_mismatch';
  END IF;

  WITH expected(
    signature,exact_arguments,result_type,language_name,volatility,is_strict,
    parallel_safety,source_md5,service_execute,strip_sql147
  ) AS (VALUES
    ('public.teskeid_event_has_access(uuid)','p_user_id uuid','boolean','sql','s',false,'u','7b69311a107381a1891da01c32780f5f',false,false),
    ('public.teskeid_event_assert_actor(uuid)','p_actor_id uuid','void','plpgsql','s',false,'u','9dd7c34f6cc6c78131e7ebbb9a718ea4',false,false),
    ('public.teskeid_event_assert_session_actor(uuid)','p_actor_id uuid','void','plpgsql','s',false,'u','30238c0def94d573fd8265fd94da0757',false,false),
    ('public.teskeid_event_guard_event_update()','','trigger','plpgsql','v',false,'u','d536d617b6bc13a556c39ad2ec0948e7',false,false),
    ('public.normalize_email_canonical(text)','p_email text','text','sql','i',true,'s','3083103976aa8cb3780937b9da1be236',true,false),
    ('public.teskeid_event_attendance_terminalize_invitations(uuid[],text)','p_invitation_ids uuid[], p_status text','integer','plpgsql','v',false,'u','a2a85bca2a456177ab67b7817dc6e19d',false,false),
    ('public.teskeid_event_attendance_mask_email(text)','p_email text','text','plpgsql','i',false,'u','9eb6ce4530f4c816d4cc0c35ec022110',false,false),
    ('public.teskeid_event_attendance_lock_user_emails(uuid[])','p_user_ids uuid[]','jsonb','plpgsql','v',false,'u','a746f7835eba9f759e6ae8af0d51f46f',false,false),
    ('public.teskeid_event_attendance_create_pending(uuid,uuid,uuid,text,text)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_recipient_email text, p_invitation_kind text','jsonb','plpgsql','v',false,'u','68881d52023265e7edd893f727a16381',false,false),
    ('public.teskeid_event_normalize_text(text)','p_value text','text','sql','i',false,'u','ced5cfb2427fe7331f4416497614f7d1',false,false),
    ('public.teskeid_event_attendance_safe_guest_label(text,text,uuid)','p_source_kind text, p_display_name_snapshot text, p_linked_user_id uuid','text','plpgsql','s',false,'u','2377be525ed29f2d4bc26d453fa8cf51',false,false),
    ('public.teskeid_event_attendance_sweep_expired(integer,uuid)','p_limit integer, p_exclude_invitation_id uuid','integer','plpgsql','v',false,'u','087ba1156dd8f01f25673dc6b11dd21b',false,false),
    ('public.teskeid_event_attendance_begin_response_request(uuid,uuid,text,text)','p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text','jsonb','plpgsql','v',false,'u','004d1a7505bf9eb03b9f06e1a265aed6',false,false),
    ('public.teskeid_event_attendance_finish_response_request(uuid,uuid,jsonb)','p_actor_id uuid, p_request_id uuid, p_result jsonb','void','plpgsql','v',false,'u','3d9b5a2dc3cb0806802b48739169cb52',false,false),
    ('public.teskeid_event_assert_financial_actor(uuid)','p_actor_id uuid','void','plpgsql','s',false,'u','7f6ced4f5e7472aff27d9a6d5c624355',false,false),
    ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)','p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text, p_require_expenses boolean','jsonb','plpgsql','v',false,'u','4e70b62a5fa28cfe2b884d703935a16c',false,false),
    ('public.teskeid_event_finish_request(uuid,uuid,jsonb)','p_actor_id uuid, p_request_id uuid, p_result jsonb','void','plpgsql','v',false,'u','eaa006157dc5377e0ae1f8979651f8aa',false,false),
    ('public.teskeid_event_assert_roster(uuid)','p_event_id uuid','void','plpgsql','v',false,'u','644432e94fb9b27e434403d84d32db4b',false,false),
    ('public.teskeid_event_roster_integrity_trigger()','','trigger','plpgsql','v',false,'u','e3f28f3ef917e7eca8766de4dc35bed0',false,false),
    ('public.teskeid_event_touch_updated_at()','','trigger','plpgsql','v',false,'u','bb0914d96897242328a9ade9661bf1a7',false,false),
    ('public.teskeid_event_guard_guest_update()','','trigger','plpgsql','v',false,'u','fc0f737a5c5757b621577e39e4f75b4e',false,false),
    ('public.teskeid_event_guard_receipt_mutation()','','trigger','plpgsql','v',false,'u','abbca6ba554f3a1d0d4d71b9918d2abd',false,false),
    ('public.teskeid_event_guard_identity_authorization_commit()','','trigger','plpgsql','v',false,'u','9b265d58159dadeb0ea1eb492aae085d',false,false),
    ('public.teskeid_event_guard_attendance_receipt_mutation()','','trigger','plpgsql','v',false,'u','2684938d7e8064656c58cc1f6e90ee53',false,false),
    ('public.teskeid_event_assert_attendance_integrity(uuid,uuid)','p_event_id uuid, p_event_guest_id uuid','void','plpgsql','v',false,'u','2870ed4aed519757199fbb19c0ce3975',false,false),
    ('public.teskeid_event_attendance_integrity_trigger()','','trigger','plpgsql','v',false,'u','776d0e3518021fb21bbcac1f8154ead9',false,false),
    ('public.teskeid_event_create(uuid,uuid,text,jsonb)','p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb','jsonb','plpgsql','v',false,'u','9129bb5800d742b5f3f9ab09c3f196fb',true,false),
    ('public.teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)','p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb','jsonb','plpgsql','v',false,'u','b6f8566f735fc02be284d17aeca68b62',true,false),
    ('public.teskeid_event_create_with_attendance_invitations(uuid,uuid,text,jsonb)','p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb','jsonb','plpgsql','v',false,'u','018e330369033e939d9ada7b08e18516',true,false),
    ('public.teskeid_event_replace_roster_with_attendance_invitations(uuid,uuid,uuid,bigint,jsonb)','p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb','jsonb','plpgsql','v',false,'u','0022e19d8853709247583b7ddb38ef45',true,false),
    ('public.teskeid_event_invite_guest_attendance(uuid,uuid,uuid,bigint,uuid,text)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_expected_roster_revision bigint, p_request_id uuid, p_recipient_email text','jsonb','plpgsql','v',false,'u','23eea91f0b5ec29c50b3615c9cadcdfe',true,false),
    ('public.teskeid_event_cancel_guest_attendance_invitation(uuid,uuid,uuid,uuid,bigint,uuid)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_invitation_id uuid, p_expected_roster_revision bigint, p_request_id uuid','jsonb','plpgsql','v',false,'u','d9a5936ecafef2fb21e65bfd973f5405',true,false),
    ('public.teskeid_event_save_details(uuid,uuid,uuid,date,time without time zone,text,text)','p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text','jsonb','plpgsql','v',false,'u','3336e4f5c7a79ee887a46c7d98e09015',true,false),
    ('public.teskeid_event_create_with_details_and_attendance_invitations(uuid,uuid,text,jsonb,date,time without time zone,text,text)','p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text','jsonb','plpgsql','v',false,'u','3e1b846ec2a4540e6ee51becb2590ec2',true,false),
    ('public.teskeid_event_private_normalize_shared_name_v2(text)','p_value text','text','sql','i',false,'u','d118ab08bc0346cdf31519344a2f65a7',false,false),
    ('public.teskeid_event_private_valid_shared_name_v2(text)','p_value text','boolean','sql','i',false,'u','7a3223263c138e04713dbc87e7dc6576',false,false),
    ('public.teskeid_event_private_safe_profile_name_v2(uuid)','p_user_id uuid','text','plpgsql','s',false,'u','53f29b4c6872d3e76d6c9cbc17a767e0',false,false),
    ('public.teskeid_event_valid_text(text,integer,integer)','p_value text, p_minimum integer, p_maximum integer','boolean','sql','i',false,'u','28c80b083a90683f15fd04f4d7d547d1',false,false),
    ('public.teskeid_event_uuid_from_text(text)','p_value text','uuid','sql','i',false,'u','27229cbc71c621e5a8592265b07f874d',false,false),
    ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)','p_value timestamp with time zone','text','sql','s',false,'u','7017190619681901af3813e1fc3b305c',false,false),
    ('public.teskeid_event_private_valid_canonical_email_v2(text)','p_value text','boolean','sql','i',false,'u','3e64bc04485bc06cc544f59f46a2fb0e',false,false),
    ('public.teskeid_event_private_canonical_roster_input_v2(jsonb,boolean)','p_guests jsonb, p_allow_retained boolean','jsonb','plpgsql','i',false,'u','cbede437498c588a385a6cb4bdd04610',false,false),
    ('public.teskeid_event_private_legacy_roster_input_v2(jsonb)','p_canonical_guests jsonb','jsonb','sql','i',false,'u','5332b4a24406be464bb51d2148578b75',false,false),
    ('public.teskeid_event_private_begin_participation_request_v2(uuid,uuid,text,text)','p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text','jsonb','plpgsql','v',false,'u','2e1e7edc8401f395c8089b1769bc6496',false,false),
    ('public.teskeid_event_private_finish_participation_request_v2(uuid,uuid,jsonb)','p_actor_id uuid, p_request_id uuid, p_result jsonb','void','plpgsql','v',false,'u','7da1e4c2af949efc9434be98ace4eb7d',false,false),
    ('public.teskeid_event_private_guard_participation_request_v2()','','trigger','plpgsql','v',false,'u','abbca6ba554f3a1d0d4d71b9918d2abd',false,false),
    ('public.teskeid_event_private_ensure_person_v2(uuid,uuid)','p_event_id uuid, p_event_guest_id uuid','void','plpgsql','v',false,'u','fa593d9afce6ceb40e3fd15f9f4a30ba',false,false),
    ('public.teskeid_event_private_expire_bound_invitations_v2(uuid,text)','p_recipient_user_id uuid, p_confirmed_email_canonical text','integer','plpgsql','v',false,'u','23a268c468e1d61a508b16c80bd08daa',false,false),
    ('public.teskeid_event_private_guard_bound_invitation_v2()','','trigger','plpgsql','v',false,'u','18c2e356417113e8e06cfc568f763713',false,false),
    ('public.teskeid_event_private_auth_email_invitations_v2()','','trigger','plpgsql','v',false,'u','b7805535363aa4fc020668a71c5a5171',false,false),
    ('public.teskeid_event_private_participation_unlink_v2()','','trigger','plpgsql','v',false,'u','5fe72ac8d08536cde7229359023cbb08',false,false),
    ('public.teskeid_event_private_auth_delete_participations_v2()','','trigger','plpgsql','v',false,'u','f0444e3a30a939ee42ea528a09cd1e0e',false,false),
    ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)','p_event_id uuid, p_event_guest_id uuid, p_identity_action text, p_recipient_user_id uuid, p_recipient_email_canonical text, p_claim_source_invitation_id uuid, p_increment_generation boolean, p_access_state text, p_rsvp_state text','void','plpgsql','v',false,'u','ee8872c3b0d91786993e4ffbfb266293',false,false),
    ('public.teskeid_event_private_v1_participation_bridge_v2()','','trigger','plpgsql','v',false,'u','f2901d82fd392cd406a5dfbfc3173759',false,false),
    ('public.teskeid_event_private_claim_participations_v2(uuid)','p_actor_id uuid','integer','plpgsql','v',false,'u','b57bf9fa43754dfcd05cb7e063829bc6',false,false),
    ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)','p_actor_id uuid, p_event_id uuid','text','plpgsql','s',false,'u','211fbfb65b4edaa4b0307c2fb5878a60',false,false),
    ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_position integer, p_is_self boolean','jsonb','plpgsql','s',false,'u','dd6d4f6b57c109fb46d6992ce66462e8',false,false),
    ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)','p_actor_id uuid, p_event_id uuid, p_position integer','jsonb','plpgsql','s',false,'u','d42c11caf87eaac45646535539029977',false,false),
    ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)','p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text','jsonb','plpgsql','s',false,'u','cfb3afa33af8fd230e6c26930424387f',false,false),
    ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)','p_actor_id uuid, p_event_id uuid, p_viewer_role text','jsonb','plpgsql','s',false,'u','7a41340baed779873454dff86889ea9b',false,false),
    ('public.teskeid_event_get_actor_view_v2(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',false,'u','df539138c44252719575a9d0d090968b',true,false),
    ('public.teskeid_event_list_for_actor_v2(uuid)','p_actor_id uuid','jsonb','plpgsql','v',false,'u','6d20e61af6c56e4c3c02d53340ff2bc6',true,false),
    ('public.teskeid_event_list_person_source_events_v2(uuid,timestamp with time zone,uuid,integer)','p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer','jsonb','plpgsql','v',false,'u','0959d2725cd7db9b3510d123a81819eb',true,false),
    ('public.teskeid_event_get_person_source_roster_v2(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',false,'u','3c689e2f05035a67d58fbb8ca39dcd40',true,false),
    ('public.teskeid_event_list_person_source_events_v1(uuid,timestamp with time zone,uuid,integer)','p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer','jsonb','plpgsql','s',false,'u','a31fc1caa0cf009e4daad9c3e3ed1875',true,false),
    ('public.teskeid_event_get_person_source_roster_v1(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','s',false,'u','ae418825a7d7f8ebe056272dde9448fd',true,false),
    ('public.teskeid_event_create_with_details_and_participations_v2(uuid,uuid,text,jsonb,date,time without time zone,text,text)','p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text','jsonb','plpgsql','v',false,'u','3b72c4710731c6d467475665e6bb5d48',true,false),
    ('public.teskeid_event_replace_roster_with_participations_v2(uuid,uuid,uuid,bigint,jsonb)','p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb','jsonb','plpgsql','v',false,'u','c8738b2a21735bac895c3e25335f6ee8',true,false),
    ('public.teskeid_event_repair_person_label_v2(uuid,uuid,uuid,bigint,bigint,text,uuid)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_expected_roster_revision bigint, p_expected_label_version bigint, p_shared_display_name text, p_request_id uuid','jsonb','plpgsql','v',false,'u','3352c37bbf3883c991c658de37fde1d3',true,false),
    ('public.teskeid_event_leave_attendance(uuid,uuid,uuid)','p_actor_id uuid, p_event_id uuid, p_request_id uuid','jsonb','plpgsql','v',false,'u','adc9e9bb4bb79081112c69dd00a6cdff',true,false),
    ('public.teskeid_event_get_attendee_view(uuid,uuid)','p_actor_id uuid, p_event_id uuid','jsonb','plpgsql','v',false,'u','d93ffd501b56cdab685208093199a999',true,false),
    ('public.teskeid_event_list_for_actor(uuid)','p_actor_id uuid','jsonb','plpgsql','v',false,'u','4ccf01e6251a7e7ee187fcba21a88c36',true,true),
    ('public.teskeid_event_get_guest_attendance_preview(uuid,uuid)','p_actor_id uuid, p_invitation_id uuid','jsonb','plpgsql','v',false,'u','e268003d1f916f6a987e8d47dbef5971',true,true),
    ('public.teskeid_event_respond_guest_attendance(uuid,uuid,text,uuid)','p_actor_id uuid, p_invitation_id uuid, p_action text, p_request_id uuid','jsonb','plpgsql','v',false,'u','45bab121e346e77fa4a4035b7cf88f16',true,true),
    ('public.teskeid_event_list_my_pending_invitations(uuid)','p_actor_id uuid','jsonb','plpgsql','v',false,'u','295ca440e9caa334986f664ce2bc7398',true,true)
  )
  SELECT pg_catalog.count(procedure_row.oid)=75
    AND pg_catalog.bool_and(
      pg_catalog.md5(CASE WHEN expected.strip_sql147 THEN
        pg_catalog.replace(pg_catalog.replace(
          procedure_row.prosrc,E'\r\n',E'\n'
        ),'-- SQL147_EVENT_IN_APP_INVITATION_AUTHORITY'||E'\n','')
        ELSE pg_catalog.replace(procedure_row.prosrc,E'\r\n',E'\n') END
      )=expected.source_md5
      AND owner_role.rolname='postgres'
      AND language_row.lanname=expected.language_name
      AND procedure_row.prokind='f'
      AND procedure_row.prosecdef=(
        expected.signature<>'public.normalize_email_canonical(text)'
      )
      AND procedure_row.proisstrict=expected.is_strict
      AND NOT procedure_row.proleakproof AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults=0
      AND procedure_row.provolatile=expected.volatility::"char"
      AND procedure_row.proparallel=expected.parallel_safety::"char"
      AND pg_catalog.pg_get_function_result(procedure_row.oid)=
        expected.result_type
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid)=
        expected.exact_arguments
      AND procedure_row.proconfig=ARRAY['search_path=""']::text[]
      AND (SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace=procedure_row.pronamespace
          AND overload.proname=procedure_row.proname)=1
      AND pg_catalog.has_function_privilege(
        'postgres',procedure_row.oid,'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon',procedure_row.oid,'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated',procedure_row.oid,'EXECUTE'
      )
      AND pg_catalog.has_function_privilege(
        'service_role',procedure_row.oid,'EXECUTE'
      )=expected.service_execute
      AND (SELECT pg_catalog.count(*)
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f',procedure_row.proowner)
        )))=CASE WHEN expected.service_execute THEN 2 ELSE 1 END
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f',procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid=privilege.grantee
        WHERE privilege.grantor<>procedure_row.proowner
          OR privilege.privilege_type<>'EXECUTE'
          OR privilege.grantee=0 OR privilege.is_grantable
          OR (
            privilege.grantee<>procedure_row.proowner
            AND (
              NOT expected.service_execute
              OR grantee.rolname IS DISTINCT FROM 'service_role'
            )
          )
      )
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid=pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid=procedure_row.proowner
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid=procedure_row.prolang;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_predecessor_function_mismatch';
  END IF;

  SELECT pg_catalog.count(relation_row.oid)=4 AND pg_catalog.bool_and(
    relation_row.relkind='r' AND relation_row.relpersistence='p'
    AND owner_role.rolname='postgres'
    AND relation_row.relrowsecurity AND relation_row.relforcerowsecurity
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid=relation_row.oid
    )
    AND pg_catalog.cardinality(COALESCE(
      relation_row.reloptions,ARRAY[]::text[]
    ))=0
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.aclexplode(COALESCE(
      relation_row.relacl,pg_catalog.acldefault('r',relation_row.relowner)
    )))=CASE
      WHEN pg_catalog.current_setting('server_version_num')::integer>=170000
        THEN 8
      ELSE 7
    END
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
        relation_row.relacl,pg_catalog.acldefault('r',relation_row.relowner)
      )) AS privilege
      WHERE privilege.grantor<>relation_row.relowner
         OR privilege.grantee<>relation_row.relowner
         OR (
           privilege.privilege_type<>ALL(ARRAY[
           'INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES',
           'TRIGGER'
           ]::text[])
           AND NOT (
             pg_catalog.current_setting('server_version_num')::integer>=170000
             AND privilege.privilege_type='MAINTAIN'
           )
         )
         OR privilege.is_grantable
    )
  ) INTO v_ok
  FROM (VALUES
    ('public.teskeid_event_participation_rsvp_v3'),
    ('public.teskeid_event_participation_invitation_generations_v3'),
    ('public.teskeid_event_participation_mutation_requests_v3'),
    ('public.teskeid_event_sql153_install_baseline')
  ) AS expected(relation_name)
  LEFT JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid=pg_catalog.to_regclass(expected.relation_name)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid=relation_row.relowner;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_relation_security_mismatch';
  END IF;

  SELECT pg_catalog.count(relation_row.oid)=12 AND pg_catalog.bool_and(
    relation_row.relkind='r' AND relation_row.relpersistence='p'
    AND owner_role.rolname='postgres'
    AND relation_row.relrowsecurity AND relation_row.relforcerowsecurity
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid=relation_row.oid
    )
    AND pg_catalog.cardinality(COALESCE(
      relation_row.reloptions,ARRAY[]::text[]
    ))=0
    AND (SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(COALESCE(
        relation_row.relacl,
        pg_catalog.acldefault('r',relation_row.relowner)
      )))=CASE
        WHEN pg_catalog.current_setting('server_version_num')::integer>=170000
          THEN 8
        ELSE 7
      END
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        relation_row.relacl,
        pg_catalog.acldefault('r',relation_row.relowner)
      )) AS privilege
      WHERE privilege.grantor<>relation_row.relowner
        OR privilege.grantee<>relation_row.relowner
        OR (
          privilege.privilege_type<>ALL(ARRAY[
          'INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES',
          'TRIGGER'
          ]::text[])
          AND NOT (
            pg_catalog.current_setting('server_version_num')::integer>=170000
            AND privilege.privilege_type='MAINTAIN'
          )
        )
        OR privilege.is_grantable
    )
  ) INTO v_ok
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
    ON relation_row.oid=pg_catalog.to_regclass(expected.relation_name)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid=relation_row.relowner;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_source_relation_mismatch';
  END IF;

  SELECT bridge_class.relkind='S'
    AND bridge_class.relpersistence='p'
    AND owner_role.rolname='postgres'
    AND bridge_class.reltablespace=0
    AND pg_catalog.cardinality(COALESCE(
      bridge_class.reloptions,ARRAY[]::text[]
    ))=0
    AND bridge_sequence.seqtypid='bigint'::regtype
    AND bridge_sequence.seqstart=1
    AND bridge_sequence.seqincrement=1
    AND bridge_sequence.seqmax=9223372036854775807
    AND bridge_sequence.seqmin=1
    AND bridge_sequence.seqcache=1
    AND NOT bridge_sequence.seqcycle
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid='pg_catalog.pg_class'::regclass
        AND dependency.objid=bridge_class.oid
        AND dependency.refclassid='pg_catalog.pg_class'::regclass
        AND dependency.deptype IN ('a','i')
    )
    AND (SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(COALESCE(
        bridge_class.relacl,
        pg_catalog.acldefault('S',bridge_class.relowner)
      )))=3
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        bridge_class.relacl,
        pg_catalog.acldefault('S',bridge_class.relowner)
      )) AS privilege
      WHERE privilege.grantor<>bridge_class.relowner
        OR privilege.grantee<>bridge_class.relowner
        OR privilege.privilege_type<>ALL(ARRAY[
          'USAGE','SELECT','UPDATE'
        ]::text[])
        OR privilege.is_grantable
    ) INTO v_ok
  FROM pg_catalog.pg_class AS bridge_class
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid=bridge_class.relowner
  JOIN pg_catalog.pg_sequence AS bridge_sequence
    ON bridge_sequence.seqrelid=bridge_class.oid
  WHERE bridge_class.oid=pg_catalog.to_regclass(
    'public.teskeid_event_v1_bridge_observation_seq'
  );
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_bridge_sequence_mismatch';
  END IF;

  SELECT sequence_class.relkind='S'
    AND sequence_class.relpersistence='p'
    AND owner_role.rolname='postgres'
    AND sequence_class.reltablespace=0
    AND pg_catalog.cardinality(COALESCE(
      sequence_class.reloptions,ARRAY[]::text[]
    ))=0
    AND sequence_row.seqtypid='bigint'::regtype
    AND sequence_row.seqstart=1 AND sequence_row.seqincrement=1
    AND sequence_row.seqmax=9223372036854775807
    AND sequence_row.seqmin=1 AND sequence_row.seqcache=1
    AND NOT sequence_row.seqcycle
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid='pg_catalog.pg_class'::regclass
        AND dependency.objid=sequence_class.oid
        AND dependency.refclassid='pg_catalog.pg_class'::regclass
        AND dependency.deptype IN ('a','i')
    )
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.aclexplode(COALESCE(
      sequence_class.relacl,
      pg_catalog.acldefault('S',sequence_class.relowner)
    )))=3
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
        sequence_class.relacl,
        pg_catalog.acldefault('S',sequence_class.relowner)
      )) AS privilege
      WHERE privilege.grantor<>sequence_class.relowner
         OR privilege.grantee<>sequence_class.relowner
         OR privilege.privilege_type<>ALL(ARRAY[
           'USAGE','SELECT','UPDATE'
         ]::text[])
         OR privilege.is_grantable
    ) INTO v_ok
  FROM pg_catalog.pg_class AS sequence_class
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid=sequence_class.relowner
  JOIN pg_catalog.pg_sequence AS sequence_row
    ON sequence_row.seqrelid=sequence_class.oid
  WHERE sequence_class.oid=pg_catalog.to_regclass(
    'public.teskeid_event_sql153_write_observation_seq'
  );
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_sequence_mismatch';
  END IF;

  WITH expected(
    relation_name,column_name,ordinal_position,type_name,is_not_null,
    normalized_default,is_collatable
  ) AS (VALUES
    ('teskeid_event_participation_rsvp_v3','event_id',1,'uuid',true,NULL::text,false),
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
      pg_catalog.format_type(
        attribute_row.atttypid,attribute_row.atttypmod
      ) AS type_name,
      attribute_row.attnotnull AS is_not_null,
      pg_catalog.regexp_replace(COALESCE(pg_catalog.pg_get_expr(
        default_row.adbin,default_row.adrelid
      ),''),'[[:space:]]','','g') AS normalized_default,
      attribute_row.attcollation AS collation_oid,
      attribute_row.attidentity,attribute_row.attgenerated
    FROM pg_catalog.pg_attribute AS attribute_row
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid=attribute_row.attrelid
    LEFT JOIN pg_catalog.pg_attrdef AS default_row
      ON default_row.adrelid=attribute_row.attrelid
     AND default_row.adnum=attribute_row.attnum
    WHERE attribute_row.attrelid=ANY(ARRAY[
      'public.teskeid_event_participation_rsvp_v3'::regclass,
      'public.teskeid_event_participation_invitation_generations_v3'::regclass,
      'public.teskeid_event_participation_mutation_requests_v3'::regclass,
      'public.teskeid_event_sql153_install_baseline'::regclass
    ]) AND attribute_row.attnum>0 AND NOT attribute_row.attisdropped
  )
  SELECT pg_catalog.count(actual.column_name)=33
    AND (SELECT pg_catalog.count(*) FROM actual)=33
    AND pg_catalog.bool_and(
      actual.ordinal_position=expected.ordinal_position
      AND actual.type_name=expected.type_name
      AND actual.is_not_null=expected.is_not_null
      AND actual.normalized_default=COALESCE(expected.normalized_default,'')
      AND actual.collation_oid=CASE WHEN expected.is_collatable
        THEN pg_catalog.to_regcollation('pg_catalog."default"')
        ELSE 0::oid END
      AND actual.attidentity='' AND actual.attgenerated=''
    ) INTO v_ok
  FROM expected
  LEFT JOIN actual
    ON actual.relation_name=expected.relation_name
   AND actual.column_name=expected.column_name;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_column_mismatch';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid=ANY(ARRAY[
        'public.teskeid_event_participation_rsvp_v3'::regclass,
        'public.teskeid_event_participation_invitation_generations_v3'::regclass,
        'public.teskeid_event_participation_mutation_requests_v3'::regclass,
        'public.teskeid_event_sql153_install_baseline'::regclass
      ]) AND contype<>'t')<>21 OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid=ANY(ARRAY[
      'public.teskeid_event_participation_rsvp_v3'::regclass,
      'public.teskeid_event_participation_invitation_generations_v3'::regclass,
      'public.teskeid_event_participation_mutation_requests_v3'::regclass,
      'public.teskeid_event_sql153_install_baseline'::regclass
    ]) AND constraint_row.contype<>'t'
      AND constraint_row.conname<>ALL(ARRAY[
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
    RAISE EXCEPTION 'sql153_recovery_constraint_inventory_mismatch';
  END IF;

  WITH expected(
    constraint_name,relation_name,constraint_type,local_columns,
    referenced_relation,referenced_columns,delete_action,
    is_deferrable,initially_deferred
  ) AS (VALUES
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
  SELECT pg_catalog.count(constraint_row.oid)=10
    AND pg_catalog.bool_and(
      constraint_row.contype=expected.constraint_type::"char"
      AND constraint_row.convalidated
      AND (expected.constraint_type<>'c' OR NOT constraint_row.connoinherit)
      AND constraint_row.condeferrable=expected.is_deferrable
      AND constraint_row.condeferred=expected.initially_deferred
      AND actual.local_columns=expected.local_columns
      AND (
        expected.constraint_type NOT IN ('p','u')
        OR constraint_row.conindid=pg_catalog.to_regclass(
          'public.'||expected.constraint_name
        )
      )
      AND (expected.constraint_type<>'f' OR (
        constraint_row.confrelid=pg_catalog.to_regclass(
          expected.referenced_relation
        )
        AND actual.referenced_columns=expected.referenced_columns
        AND constraint_row.confdeltype=expected.delete_action
        AND constraint_row.confupdtype='a'
        AND constraint_row.confmatchtype='s'
      ))
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid=pg_catalog.to_regclass(
      'public.'||expected.relation_name
    ) AND constraint_row.conname=expected.constraint_name
  LEFT JOIN LATERAL (
    SELECT ARRAY(
      SELECT attribute_row.attname::text
      FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY
        AS keyed(attnum,ordinal_position)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid=constraint_row.conrelid
       AND attribute_row.attnum=keyed.attnum
      ORDER BY keyed.ordinal_position
    ) AS local_columns,
    ARRAY(
      SELECT attribute_row.attname::text
      FROM pg_catalog.unnest(constraint_row.confkey) WITH ORDINALITY
        AS keyed(attnum,ordinal_position)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid=constraint_row.confrelid
       AND attribute_row.attnum=keyed.attnum
      ORDER BY keyed.ordinal_position
    ) AS referenced_columns
  ) AS actual ON true;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_constraint_key_mismatch';
  END IF;

  WITH expected(
    relation_name,constraint_name,normalized_expression
  ) AS (VALUES
    ('teskeid_event_participation_rsvp_v3','teskeid_event_participation_rsvp_v3_generation_check','identity_generation>0'),
    ('teskeid_event_participation_rsvp_v3','teskeid_event_participation_rsvp_v3_state_check','effective_state=anyarray[''no_response'',''considering'',''attending'',''not_attending'']'),
    ('teskeid_event_participation_rsvp_v3','teskeid_event_participation_rsvp_v3_version_check','decision_version>0'),
    ('teskeid_event_participation_rsvp_v3','teskeid_event_participation_rsvp_v3_note_shape_check','private_noteisnulloreffective_state=''considering''andteskeid_event_private_normalize_note_v3private_noteisnotnullandnotprivate_noteisdistinctfromteskeid_event_private_normalize_note_v3private_note'),
    ('teskeid_event_participation_invitation_generations_v3','teskeid_event_participation_invitation_gen_v3_check','identity_generation>0'),
    ('teskeid_event_participation_mutation_requests_v3','teskeid_event_participation_requests_v3_operation_check','operation=anyarray[''set_rsvp_v3'',''leave_v3'']'),
    ('teskeid_event_participation_mutation_requests_v3','teskeid_event_participation_requests_v3_fingerprint_check','fingerprint~''^[0-9a-f]{32}$'''),
    ('teskeid_event_participation_mutation_requests_v3','teskeid_event_participation_requests_v3_result_check','resultisnullorjsonb_typeofresult=''object''andoctet_lengthresult<=8192'),
    ('teskeid_event_participation_mutation_requests_v3','teskeid_event_participation_requests_v3_completion_check','resultisnull=completed_atisnull'),
    ('teskeid_event_sql153_install_baseline','teskeid_event_sql153_baseline_singleton_check','singleton'),
    ('teskeid_event_sql153_install_baseline','teskeid_event_sql153_baseline_hash_check','rsvp_baseline_md5~''^[0-9a-f]{32}$''andpre_fence_rsvp_md5~''^[0-9a-f]{32}$''anddecision_baseline_md5~''^[0-9a-f]{32}$''andinvitation_anchor_md5~''^[0-9a-f]{32}$''andpredecessor_rsvp_v2_source<>''''andoctet_lengthpredecessor_rsvp_v2_source<=65536andparticipation_count>=0anddecision_count>=0andrequest_count=0andinvitation_anchor_count>=0')
  )
  SELECT pg_catalog.count(constraint_row.oid)=11
    AND pg_catalog.bool_and(
      constraint_row.contype='c' AND constraint_row.convalidated
      AND NOT constraint_row.connoinherit
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred
      AND pg_catalog.regexp_replace(pg_catalog.lower(
        pg_catalog.pg_get_expr(
          constraint_row.conbin,constraint_row.conrelid,true
        )
      ),'public[.]|pg_catalog[.]|[()[:space:]]|::text','','g')=
        expected.normalized_expression
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid=pg_catalog.to_regclass(
      'public.'||expected.relation_name
    )
   AND constraint_row.conname=expected.constraint_name;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_check_definition_mismatch';
  END IF;

  SELECT EXISTS (
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
  ) INTO v_ok;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_note_dependency_mismatch';
  END IF;

  WITH expected(
    index_name,table_name,is_unique,is_primary,column_names,operator_classes,
    collations,index_options,index_definition
  ) AS (VALUES
    ('teskeid_event_participation_rsvp_v3_pkey','public.teskeid_event_participation_rsvp_v3',true,true,ARRAY['event_id','event_guest_id','identity_generation']::text[],ARRAY['uuid_ops','uuid_ops','int8_ops']::text[],ARRAY['','','']::text[],ARRAY[0,0,0]::smallint[],'CREATE UNIQUE INDEX teskeid_event_participation_rsvp_v3_pkey ON public.teskeid_event_participation_rsvp_v3 USING btree (event_id, event_guest_id, identity_generation)'),
    ('teskeid_event_participation_rsvp_v3_current_key','public.teskeid_event_participation_rsvp_v3',true,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],'CREATE UNIQUE INDEX teskeid_event_participation_rsvp_v3_current_key ON public.teskeid_event_participation_rsvp_v3 USING btree (event_id, event_guest_id)'),
    ('teskeid_event_participation_invitation_gen_v3_pkey','public.teskeid_event_participation_invitation_generations_v3',true,true,ARRAY['invitation_id']::text[],ARRAY['uuid_ops']::text[],ARRAY['']::text[],ARRAY[0]::smallint[],'CREATE UNIQUE INDEX teskeid_event_participation_invitation_gen_v3_pkey ON public.teskeid_event_participation_invitation_generations_v3 USING btree (invitation_id)'),
    ('teskeid_event_participation_invitation_gen_v3_current_key','public.teskeid_event_participation_invitation_generations_v3',true,false,ARRAY['event_id','event_guest_id','identity_generation']::text[],ARRAY['uuid_ops','uuid_ops','int8_ops']::text[],ARRAY['','','']::text[],ARRAY[0,0,0]::smallint[],'CREATE UNIQUE INDEX teskeid_event_participation_invitation_gen_v3_current_key ON public.teskeid_event_participation_invitation_generations_v3 USING btree (event_id, event_guest_id, identity_generation)'),
    ('teskeid_event_participation_requests_v3_pkey','public.teskeid_event_participation_mutation_requests_v3',true,true,ARRAY['actor_user_id','request_id']::text[],ARRAY['uuid_ops','uuid_ops']::text[],ARRAY['','']::text[],ARRAY[0,0]::smallint[],'CREATE UNIQUE INDEX teskeid_event_participation_requests_v3_pkey ON public.teskeid_event_participation_mutation_requests_v3 USING btree (actor_user_id, request_id)'),
    ('teskeid_event_participation_requests_v3_created_idx','public.teskeid_event_participation_mutation_requests_v3',false,false,ARRAY['created_at','actor_user_id','request_id']::text[],ARRAY['timestamptz_ops','uuid_ops','uuid_ops']::text[],ARRAY['','','']::text[],ARRAY[0,0,0]::smallint[],'CREATE INDEX teskeid_event_participation_requests_v3_created_idx ON public.teskeid_event_participation_mutation_requests_v3 USING btree (created_at, actor_user_id, request_id)'),
    ('teskeid_event_sql153_install_baseline_pkey','public.teskeid_event_sql153_install_baseline',true,true,ARRAY['singleton']::text[],ARRAY['bool_ops']::text[],ARRAY['']::text[],ARRAY[0]::smallint[],'CREATE UNIQUE INDEX teskeid_event_sql153_install_baseline_pkey ON public.teskeid_event_sql153_install_baseline USING btree (singleton)')
  )
  SELECT pg_catalog.count(index_row.indexrelid)=7
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index
      WHERE indrelid=ANY(ARRAY[
        'public.teskeid_event_participation_rsvp_v3'::regclass,
        'public.teskeid_event_participation_invitation_generations_v3'::regclass,
        'public.teskeid_event_participation_mutation_requests_v3'::regclass,
        'public.teskeid_event_sql153_install_baseline'::regclass
      ]))=7
    AND pg_catalog.bool_and(
      index_row.indrelid=pg_catalog.to_regclass(expected.table_name)
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
      AND access_method.amname='btree' AND owner_role.rolname='postgres'
      AND index_class.relpersistence='p'
      AND index_class.reltablespace=0 AND index_class.relacl IS NULL
      AND pg_catalog.cardinality(COALESCE(
        index_class.reloptions,ARRAY[]::text[]
      ))=0
      AND actual.column_names=expected.column_names
      AND actual.operator_classes=expected.operator_classes
      AND actual.collations=expected.collations
      AND actual.index_options=expected.index_options
      AND pg_catalog.pg_get_indexdef(index_row.indexrelid)=
        expected.index_definition
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_index AS index_row
    ON index_row.indexrelid=pg_catalog.to_regclass(
      'public.'||expected.index_name
    )
  LEFT JOIN pg_catalog.pg_class AS index_class
    ON index_class.oid=index_row.indexrelid
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid=index_class.relowner
  LEFT JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid=index_class.relam
  LEFT JOIN LATERAL (
    SELECT ARRAY(
      SELECT attribute_row.attname::text
      FROM pg_catalog.unnest(index_row.indkey) WITH ORDINALITY
        AS keyed(attnum,ordinal_position)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid=index_row.indrelid
       AND attribute_row.attnum=keyed.attnum
      ORDER BY keyed.ordinal_position
    ) AS column_names,
    ARRAY(
      SELECT operator_class.opcname::text
      FROM pg_catalog.unnest(index_row.indclass) WITH ORDINALITY
        AS keyed(opclass_oid,ordinal_position)
      JOIN pg_catalog.pg_opclass AS operator_class
        ON operator_class.oid=keyed.opclass_oid
      ORDER BY keyed.ordinal_position
    ) AS operator_classes,
    ARRAY(
      SELECT COALESCE(collation_row.collname,'')::text
      FROM pg_catalog.unnest(index_row.indcollation) WITH ORDINALITY
        AS keyed(collation_oid,ordinal_position)
      LEFT JOIN pg_catalog.pg_collation AS collation_row
        ON collation_row.oid=keyed.collation_oid
      ORDER BY keyed.ordinal_position
    ) AS collations,
    ARRAY(
      SELECT option_value::smallint
      FROM pg_catalog.unnest(index_row.indoption) WITH ORDINALITY
        AS keyed(option_value,ordinal_position)
      ORDER BY keyed.ordinal_position
    ) AS index_options
  ) AS actual ON true;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_index_mismatch';
  END IF;

  WITH expected(
    trigger_name,relation_name,function_signature,trigger_type,
    is_constraint,is_deferrable,initially_deferred,update_columns
  ) AS (VALUES
    ('teskeid_event_participation_requests_v3_guard','public.teskeid_event_participation_mutation_requests_v3','public.teskeid_event_private_guard_request_v3()',27,false,false,false,ARRAY[]::text[]),
    ('teskeid_event_participations_sql153_generation_rsvp_bump','public.teskeid_event_participations','public.teskeid_event_private_bump_generation_rsvp_v3()',19,false,false,false,ARRAY['identity_generation']::text[]),
    ('teskeid_event_participations_sql153_rsvp_sync','public.teskeid_event_participations','public.teskeid_event_private_sync_rsvp_v3()',21,false,false,false,ARRAY[]::text[]),
    ('teskeid_event_guest_invitations_sql153_anchor_deferred','public.teskeid_event_guest_invitations','public.teskeid_event_private_anchor_sync_v3()',21,true,true,true,ARRAY[]::text[]),
    ('teskeid_event_participations_sql153_integrity_deferred','public.teskeid_event_participations','public.teskeid_event_private_rsvp_integrity_trigger_v3()',29,true,true,true,ARRAY[]::text[]),
    ('teskeid_event_rsvp_v3_integrity_deferred','public.teskeid_event_participation_rsvp_v3','public.teskeid_event_private_rsvp_integrity_trigger_v3()',29,true,true,true,ARRAY[]::text[])
  )
  SELECT pg_catalog.count(trigger_row.oid)=6
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS actual
      WHERE NOT actual.tgisinternal AND (
        actual.tgname LIKE '%sql153%'
        OR actual.tgname=ANY(ARRAY[
          'teskeid_event_participation_requests_v3_guard',
          'teskeid_event_rsvp_v3_integrity_deferred'
        ]::name[])
      ))=6
    AND pg_catalog.bool_and(
      NOT trigger_row.tgisinternal AND trigger_row.tgenabled='O'
      AND trigger_row.tgtype=expected.trigger_type
      AND (trigger_row.tgconstraint<>0)=expected.is_constraint
      AND trigger_row.tgdeferrable=expected.is_deferrable
      AND trigger_row.tginitdeferred=expected.initially_deferred
      AND trigger_row.tgparentid=0::oid
      AND trigger_row.tgqual IS NULL AND trigger_row.tgnargs=0
      AND pg_catalog.octet_length(trigger_row.tgargs)=0
      AND trigger_row.tgoldtable IS NULL
      AND trigger_row.tgnewtable IS NULL
      AND trigger_row.tgfoid=pg_catalog.to_regprocedure(
        expected.function_signature
      )
      AND actual_columns.update_columns=expected.update_columns
      AND (
        (
          expected.is_constraint
          AND trigger_row.tgconstraint<>0
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint AS trigger_constraint
            WHERE trigger_constraint.oid=trigger_row.tgconstraint
              AND trigger_constraint.conname=expected.trigger_name
              AND trigger_constraint.contype='t'
              AND trigger_constraint.conrelid=trigger_row.tgrelid
              AND trigger_constraint.condeferrable=
                expected.is_deferrable
              AND trigger_constraint.condeferred=
                expected.initially_deferred
              AND trigger_constraint.convalidated
              AND NOT trigger_constraint.connoinherit
          )
        ) OR (
          NOT expected.is_constraint
          AND trigger_row.tgconstraint=0
        )
      )
    ) INTO v_ok
  FROM expected
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
  ) AS actual_columns ON true;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_trigger_mismatch';
  END IF;

  WITH expected(
    trigger_name,relation_name,function_signature,trigger_type,
    is_deferrable,initially_deferred,update_columns,definition_md5
  ) AS (VALUES
    ('teskeid_event_participation_requests_mutation_guard','public.teskeid_event_participation_mutation_requests','public.teskeid_event_private_guard_participation_request_v2()',27,false,false,ARRAY[]::text[],'aed02c26ad3e4c256c07981f14190cfd'),
    ('teskeid_event_guest_invitations_sql149_bound_guard','public.teskeid_event_guest_invitations','public.teskeid_event_private_guard_bound_invitation_v2()',23,false,false,ARRAY[]::text[],'4140321dd7400e9f0678e83519d1928b'),
    ('teskeid_event_sql149_participation_account_email','auth.users','public.teskeid_event_private_auth_email_invitations_v2()',17,false,false,ARRAY['email','email_confirmed_at']::text[],'88d9bdcfcd4e60ac4422278632f7ff1c'),
    ('teskeid_event_participations_account_unlink','public.teskeid_event_participations','public.teskeid_event_private_participation_unlink_v2()',19,false,false,ARRAY['recipient_user_id']::text[],'f874d0a2f672851bbe1d16d2a8d98215'),
    ('teskeid_event_sql149_participation_account_delete','auth.users','public.teskeid_event_private_auth_delete_participations_v2()',11,false,false,ARRAY[]::text[],'a8ca80c2abb8da96d1b766a1ab2d7d8e'),
    ('teskeid_event_guests_sql149_participation_deferred','public.teskeid_event_guests','public.teskeid_event_private_v1_participation_bridge_v2()',29,true,true,ARRAY[]::text[],'7267787e96147dfe136cf6fda4657aac'),
    ('teskeid_event_guest_invitations_sql149_participation_deferred','public.teskeid_event_guest_invitations','public.teskeid_event_private_v1_participation_bridge_v2()',29,true,true,ARRAY[]::text[],'c64f7878dc0c9680b752f67cd3736547'),
    ('teskeid_event_attendance_memberships_sql149_sync_deferred','public.teskeid_event_attendance_memberships','public.teskeid_event_private_v1_participation_bridge_v2()',29,true,true,ARRAY[]::text[],'d27ee6368491ea98fd4dac44d8548501'),
    ('teskeid_events_touch_updated_at','public.teskeid_events','public.teskeid_event_touch_updated_at()',19,false,false,ARRAY[]::text[],'573d2130576e33a2e0051aa5a53ee8da'),
    ('teskeid_event_guests_touch_updated_at','public.teskeid_event_guests','public.teskeid_event_touch_updated_at()',19,false,false,ARRAY[]::text[],'6ab521c4a591f84b98ec4e9fcf510284'),
    ('teskeid_events_update_guard','public.teskeid_events','public.teskeid_event_guard_event_update()',19,false,false,ARRAY[]::text[],'6f89ed31bd0f8ccd4287b2e45c52af60'),
    ('teskeid_event_guests_update_guard','public.teskeid_event_guests','public.teskeid_event_guard_guest_update()',19,false,false,ARRAY[]::text[],'c95d9d09d7ea3561f953ffb95cb811da'),
    ('teskeid_event_receipts_mutation_guard','public.teskeid_event_mutation_requests','public.teskeid_event_guard_receipt_mutation()',27,false,false,ARRAY[]::text[],'848754f56bd8a534919b139b3f0cc458'),
    ('teskeid_event_guests_roster_deferred','public.teskeid_event_guests','public.teskeid_event_roster_integrity_trigger()',29,true,true,ARRAY[]::text[],'4b8716b13b134e7d6832c117af96515c'),
    ('teskeid_event_guest_invitations_touch_updated_at','public.teskeid_event_guest_invitations','public.teskeid_event_touch_updated_at()',19,false,false,ARRAY[]::text[],'fa7142e0a8c566ccf190da63610cae40'),
    ('teskeid_event_attendance_receipts_mutation_guard','public.teskeid_event_attendance_mutation_requests','public.teskeid_event_guard_attendance_receipt_mutation()',27,false,false,ARRAY[]::text[],'9e63014a2603cbe3557a062a8811f5c7'),
    ('teskeid_event_attendance_memberships_integrity_deferred','public.teskeid_event_attendance_memberships','public.teskeid_event_attendance_integrity_trigger()',29,true,true,ARRAY[]::text[],'90339fbdfb6ca44a0561893ef7595c1c'),
    ('teskeid_event_guest_invitations_integrity_deferred','public.teskeid_event_guest_invitations','public.teskeid_event_attendance_integrity_trigger()',29,true,true,ARRAY[]::text[],'c3acb696a05b8ae943adae3861e810c0'),
    ('teskeid_event_guests_attendance_integrity_deferred','public.teskeid_event_guests','public.teskeid_event_attendance_integrity_trigger()',25,true,true,ARRAY[]::text[],'1b19d5124b69fea189ffee1702be8217'),
    ('teskeid_event_identity_authorizations_consumed_deferred','public.teskeid_event_guest_identity_mutation_authorizations','public.teskeid_event_guard_identity_authorization_commit()',21,true,true,ARRAY[]::text[],'2fd977aeca18d003379f1ea0df746f5f')
  )
  SELECT pg_catalog.count(trigger_row.oid)=20
    AND pg_catalog.bool_and(
      NOT trigger_row.tgisinternal AND trigger_row.tgenabled='O'
      AND trigger_row.tgtype=expected.trigger_type
      AND trigger_row.tgdeferrable=expected.is_deferrable
      AND trigger_row.tginitdeferred=expected.initially_deferred
      AND trigger_row.tgparentid=0::oid
      AND trigger_row.tgqual IS NULL AND trigger_row.tgnargs=0
      AND pg_catalog.octet_length(trigger_row.tgargs)=0
      AND trigger_row.tgoldtable IS NULL
      AND trigger_row.tgnewtable IS NULL
      AND trigger_row.tgfoid=pg_catalog.to_regprocedure(
        expected.function_signature
      )
      AND actual_columns.update_columns=expected.update_columns
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
        pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          pg_catalog.pg_get_triggerdef(trigger_row.oid),
          '::[a-z0-9_]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'), 'public.', ''
      )))=expected.definition_md5
      AND (
        (
          expected.is_deferrable
          AND trigger_row.tgconstraint<>0
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint AS trigger_constraint
            WHERE trigger_constraint.oid=trigger_row.tgconstraint
              AND trigger_constraint.conname=expected.trigger_name
              AND trigger_constraint.contype='t'
              AND trigger_constraint.conrelid=trigger_row.tgrelid
              AND trigger_constraint.condeferrable
              AND trigger_constraint.condeferred
              AND trigger_constraint.convalidated
              AND NOT trigger_constraint.connoinherit
          )
        ) OR (
          NOT expected.is_deferrable
          AND trigger_row.tgconstraint=0
        )
      )
    ) INTO v_ok
  FROM expected
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
  ) AS actual_columns ON true;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_source_trigger_mismatch';
  END IF;

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
  )
  SELECT pg_catalog.count(index_row.indexrelid)=18
    AND pg_catalog.bool_and(
      index_row.indrelid=pg_catalog.to_regclass(expected.table_name)
      AND index_row.indisunique=expected.is_unique
      AND index_row.indisprimary=expected.is_primary
      AND index_row.indisvalid AND index_row.indisready
      AND index_row.indislive AND index_row.indimmediate
      AND NOT index_row.indcheckxmin AND NOT index_row.indisclustered
      AND NOT index_row.indisreplident
      AND NOT index_row.indnullsnotdistinct
      AND NOT index_row.indisexclusion AND index_row.indexprs IS NULL
      AND index_row.indnkeyatts=
        pg_catalog.cardinality(expected.column_names)
      AND index_row.indnatts=index_row.indnkeyatts
      AND access_method.amname='btree'
      AND owner_role.rolname='postgres'
      AND index_class.relpersistence='p'
      AND index_class.reltablespace=0 AND index_class.relacl IS NULL
      AND pg_catalog.cardinality(COALESCE(
        index_class.reloptions,ARRAY[]::text[]
      ))=0
      AND actual.column_names=expected.column_names
      AND actual.operator_classes=expected.operator_classes
      AND actual.collations=expected.collations
      AND actual.index_options=expected.index_options
      AND pg_catalog.regexp_replace(COALESCE(pg_catalog.lower(
        pg_catalog.pg_get_expr(index_row.indpred,index_row.indrelid)
      ),''),'[()[:space:]]|::text','','g')=
        COALESCE(expected.normalized_predicate,'')
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_index AS index_row
    ON index_row.indexrelid=pg_catalog.to_regclass(
      'public.'||expected.index_name
    )
  LEFT JOIN pg_catalog.pg_class AS index_class
    ON index_class.oid=index_row.indexrelid
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid=index_class.relowner
  LEFT JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid=index_class.relam
  LEFT JOIN LATERAL (
    SELECT ARRAY(
      SELECT attribute_row.attname::text
      FROM pg_catalog.unnest(index_row.indkey) WITH ORDINALITY
        AS keyed(attnum,ordinal_position)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid=index_row.indrelid
       AND attribute_row.attnum=keyed.attnum
      ORDER BY keyed.ordinal_position
    ) AS column_names,
    ARRAY(
      SELECT operator_class.opcname::text
      FROM pg_catalog.unnest(index_row.indclass) WITH ORDINALITY
        AS keyed(opclass_oid,ordinal_position)
      JOIN pg_catalog.pg_opclass AS operator_class
        ON operator_class.oid=keyed.opclass_oid
      ORDER BY keyed.ordinal_position
    ) AS operator_classes,
    ARRAY(
      SELECT COALESCE(collation_row.collname,'')::text
      FROM pg_catalog.unnest(index_row.indcollation) WITH ORDINALITY
        AS keyed(collation_oid,ordinal_position)
      LEFT JOIN pg_catalog.pg_collation AS collation_row
        ON collation_row.oid=keyed.collation_oid
      ORDER BY keyed.ordinal_position
    ) AS collations,
    ARRAY(
      SELECT option_value::smallint
      FROM pg_catalog.unnest(index_row.indoption) WITH ORDINALITY
        AS keyed(option_value,ordinal_position)
      ORDER BY keyed.ordinal_position
    ) AS index_options
  ) AS actual ON true;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_source_index_mismatch';
  END IF;

  WITH expected(
    constraint_name,constraint_type,local_columns,referenced_relation,
    referenced_columns,delete_action,is_deferrable,initially_deferred
  ) AS (VALUES
    ('teskeid_event_attendance_memberships_pkey','p',ARRAY['event_id','user_id']::text[],NULL::text,ARRAY[]::text[],NULL::"char",false,false),
    ('teskeid_event_attendance_memberships_guest_fk','f',ARRAY['event_id','event_guest_id','user_id']::text[],'public.teskeid_event_guests',ARRAY['event_id','id','linked_user_id']::text[],'c'::"char",true,true),
    ('teskeid_event_attendance_memberships_user_fk','f',ARRAY['user_id']::text[],'auth.users',ARRAY['id']::text[],'c'::"char",false,false),
    ('teskeid_event_attendance_memberships_invitation_fk','f',ARRAY['accepted_invitation_id','event_id','event_guest_id','user_id']::text[],'public.teskeid_event_guest_invitations',ARRAY['id','event_id','event_guest_id','accepted_user_id']::text[],'c'::"char",true,true)
  )
  SELECT pg_catalog.count(constraint_row.oid)=4
    AND (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_constraint AS actual
      WHERE actual.conrelid=
        'public.teskeid_event_attendance_memberships'::regclass)=4
    AND pg_catalog.bool_and(
      constraint_row.contype=expected.constraint_type::"char"
      AND constraint_row.convalidated
      AND (expected.constraint_type<>'c' OR NOT constraint_row.connoinherit)
      AND constraint_row.condeferrable=expected.is_deferrable
      AND constraint_row.condeferred=expected.initially_deferred
      AND actual.local_columns=expected.local_columns
      AND (
        expected.constraint_type<>'p'
        OR constraint_row.conindid=pg_catalog.to_regclass(
          'public.'||expected.constraint_name
        )
      )
      AND (
        expected.constraint_type<>'f'
        OR (
          constraint_row.confrelid=
            pg_catalog.to_regclass(expected.referenced_relation)
          AND actual.referenced_columns=expected.referenced_columns
          AND constraint_row.confdeltype=expected.delete_action
          AND constraint_row.confupdtype='a'
          AND constraint_row.confmatchtype='s'
        )
      )
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid=
      'public.teskeid_event_attendance_memberships'::regclass
   AND constraint_row.conname=expected.constraint_name
  LEFT JOIN LATERAL (
    SELECT ARRAY(
      SELECT attribute_row.attname::text
      FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY
        AS keyed(attnum,ordinal_position)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid=constraint_row.conrelid
       AND attribute_row.attnum=keyed.attnum
      ORDER BY keyed.ordinal_position
    ) AS local_columns,
    ARRAY(
      SELECT attribute_row.attname::text
      FROM pg_catalog.unnest(constraint_row.confkey) WITH ORDINALITY
        AS keyed(attnum,ordinal_position)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid=constraint_row.confrelid
       AND attribute_row.attnum=keyed.attnum
      ORDER BY keyed.ordinal_position
    ) AS referenced_columns
  ) AS actual ON true;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_membership_constraint_mismatch';
  END IF;

  WITH expected(
    relation_name,constraint_name,constraint_type,referenced_relation,
    delete_action,is_deferrable,initially_deferred,local_columns,
    referenced_columns
  ) AS (VALUES
    ('teskeid_event_person_labels','teskeid_event_person_labels_pkey','p',NULL::text,NULL::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY[]::text[]),
    ('teskeid_event_person_labels','teskeid_event_person_labels_guest_fk','f','public.teskeid_event_guests','c'::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
    ('teskeid_event_person_labels','teskeid_event_person_labels_state_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_person_labels','teskeid_event_person_labels_shape_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_person_labels','teskeid_event_person_labels_version_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participations','teskeid_event_participations_pkey','p',NULL,NULL::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY[]::text[]),
    ('teskeid_event_participations','teskeid_event_participations_guest_fk','f','public.teskeid_event_guests','c'::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
    ('teskeid_event_participations','teskeid_event_participations_recipient_fk','f','auth.users','n'::"char",true,true,ARRAY['recipient_user_id']::text[],ARRAY['id']::text[]),
    ('teskeid_event_participations','teskeid_event_participations_claim_invitation_fk','f','public.teskeid_event_guest_invitations','n'::"char",true,true,ARRAY['claim_source_invitation_id']::text[],ARRAY['id']::text[]),
    ('teskeid_event_participations','teskeid_event_participations_email_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participations','teskeid_event_participations_identity_version_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participations','teskeid_event_participations_claim_shape_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participations','teskeid_event_participations_access_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participations','teskeid_event_participations_tombstone_access_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participations','teskeid_event_participations_rsvp_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participations','teskeid_event_participations_state_versions_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_pkey','p',NULL,NULL::"char",false,false,ARRAY['actor_user_id','request_id']::text[],ARRAY[]::text[]),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_actor_fk','f','auth.users','c'::"char",true,true,ARRAY['actor_user_id']::text[],ARRAY['id']::text[]),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_operation_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_fingerprint_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participation_mutation_requests','teskeid_event_participation_requests_result_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_invitation_terminalizations_pkey','p',NULL,NULL::"char",false,false,ARRAY['invitation_id']::text[],ARRAY[]::text[]),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_invitation_fk','f','public.teskeid_event_guest_invitations','c'::"char",false,false,ARRAY['invitation_id','event_id','event_guest_id']::text[],ARRAY['id','event_id','event_guest_id']::text[]),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_guest_fk','f','public.teskeid_event_guests','c'::"char",false,false,ARRAY['event_id','event_guest_id']::text[],ARRAY['event_id','id']::text[]),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_generation_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[]),
    ('teskeid_event_participation_invitation_terminalizations','teskeid_event_participation_terminalizations_reason_check','c',NULL,NULL::"char",false,false,ARRAY[]::text[],ARRAY[]::text[])
  )
  SELECT pg_catalog.count(constraint_row.oid)=26
    AND (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_constraint AS actual
      WHERE actual.conrelid=ANY(ARRAY[
        'public.teskeid_event_person_labels'::regclass,
        'public.teskeid_event_participations'::regclass,
        'public.teskeid_event_participation_mutation_requests'::regclass,
        'public.teskeid_event_participation_invitation_terminalizations'::regclass
      ]) AND actual.contype<>'t')=26
    AND pg_catalog.bool_and(
      constraint_row.contype=expected.constraint_type::"char"
      AND constraint_row.convalidated
      AND (expected.constraint_type<>'c' OR NOT constraint_row.connoinherit)
      AND constraint_row.condeferrable=expected.is_deferrable
      AND constraint_row.condeferred=expected.initially_deferred
      AND (
        expected.constraint_type='c'
        OR actual.local_columns=expected.local_columns
      )
      AND (
        expected.constraint_type<>'p'
        OR constraint_row.conindid=pg_catalog.to_regclass(
          'public.'||expected.constraint_name
        )
      )
      AND (
        expected.constraint_type<>'f'
        OR (
          constraint_row.confrelid=
            pg_catalog.to_regclass(expected.referenced_relation)
          AND actual.referenced_columns=expected.referenced_columns
          AND constraint_row.confdeltype=expected.delete_action
          AND constraint_row.confupdtype='a'
          AND constraint_row.confmatchtype='s'
        )
      )
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid=pg_catalog.to_regclass(
      'public.'||expected.relation_name
    )
   AND constraint_row.conname=expected.constraint_name
  LEFT JOIN LATERAL (
    SELECT ARRAY(
      SELECT attribute_row.attname::text
      FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY
        AS keyed(attnum,ordinal_position)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid=constraint_row.conrelid
       AND attribute_row.attnum=keyed.attnum
      ORDER BY keyed.ordinal_position
    ) AS local_columns,
    ARRAY(
      SELECT attribute_row.attname::text
      FROM pg_catalog.unnest(constraint_row.confkey) WITH ORDINALITY
        AS keyed(attnum,ordinal_position)
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid=constraint_row.confrelid
       AND attribute_row.attnum=keyed.attnum
      ORDER BY keyed.ordinal_position
    ) AS referenced_columns
  ) AS actual ON true;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_sql149_constraint_mismatch';
  END IF;

  WITH expected(
    relation_name,constraint_name,normalized_expression
  ) AS (VALUES
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
  SELECT pg_catalog.count(constraint_row.oid)=15
    AND pg_catalog.bool_and(
      constraint_row.convalidated AND NOT constraint_row.connoinherit
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred
      AND pg_catalog.regexp_replace(pg_catalog.lower(
        pg_catalog.pg_get_expr(
          constraint_row.conbin,constraint_row.conrelid,true
        )
      ),'public[.]|pg_catalog[.]|[()[:space:]]|::text','','g')=
        expected.normalized_expression
    ) INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid=pg_catalog.to_regclass(
      'public.'||expected.relation_name
    )
   AND constraint_row.conname=expected.constraint_name
   AND constraint_row.contype='c';
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_sql149_check_mismatch';
  END IF;

  WITH expected(
    relation_name,constraint_name,constraint_type,is_deferrable,
    initially_deferred,definition_md5
  ) AS (VALUES
    ('teskeid_events','teskeid_events_id_owner_key','u',false,false,'701f1f848052d0743e2750523750bb3b'),
    ('teskeid_event_guests','teskeid_event_guests_event_id_id_linked_key','u',false,false,'90dd7146ed3df819adba5e6d2892101d'),
    ('teskeid_event_guests','teskeid_event_guests_identity_shape_check','c',false,false,'02b4f758f3cd967c63bfbb2389a89d68'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_pkey','p',false,false,'90276e02fff47d56621d4ea4039fa4fd'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_event_guest_fk','f',false,false,'e30bc7454800b3b640f5c71ad4904d8b'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_owner_fk','f',false,false,'7c01e7245bc3d495698b5700b5749ea4'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_accepted_user_fk','f',true,true,'d2c63a025432fe3658166ce54f45c7d8'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_identity_key','u',false,false,'3615b06f968c41e01bce6da061f85b51'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_owner_key','u',false,false,'4daa07ce723479bc9b766c0d29754164'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_kind_check','c',false,false,'22b5d0993c33015d7700f92ab433ff33'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_status_check','c',false,false,'b101d50b384d87a7b66cf42b80b735aa'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_hash_bundle_check','c',false,false,'15455ec62890062c26c32bbab11cc600'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_snapshot_check','c',false,false,'8ae89b572efc55831870967cb780be9e'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_template_check','c',false,false,'6bac810125fe2b4f477b45b526dc83d4'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_attempt_check','c',false,false,'c432e69fd0c55951c935d6d851a94728'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_expiry_check','c',false,false,'81f15dca4d15c26bb132eb2e3d1ccf88'),
    ('teskeid_event_guest_invitations','teskeid_event_guest_invitations_lifecycle_check','c',false,false,'f35892a5ae13facf775a300ce9259de0'),
    ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_pkey','p',false,false,'35ca4084e928106e54024474e8a6e200'),
    ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_actor_fk','f',false,false,'6131c774862c10a823af7ba6b1192b8d'),
    ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_operation_check','c',false,false,'043951bd32393961ac39a7c78d1f1007'),
    ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_fingerprint_check','c',false,false,'db81247a30fe80e62823c7ae4ceccec2'),
    ('teskeid_event_attendance_mutation_requests','teskeid_event_attendance_mutation_requests_result_check','c',false,false,'63f8ecfd9306a01e17cac38793a3af1d'),
    ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_mutation_authorizations_pkey','p',false,false,'8fc7dfdab4c334d2d7d44092ca80e9a4'),
    ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_mutation_authorizations_guest_fk','f',false,false,'e30bc7454800b3b640f5c71ad4904d8b'),
    ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_mutation_authorizations_actor_fk','f',false,false,'6131c774862c10a823af7ba6b1192b8d'),
    ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_mutation_authorizations_invite_fk','f',true,true,'cc7791218e896f445d7f8d4c896a027d'),
    ('teskeid_event_guest_identity_mutation_authorizations','teskeid_event_guest_identity_authorizations_shape_check','c',false,false,'ea49cffc2ae6918ffd37dad725d2ea74')
  )
  SELECT pg_catalog.count(constraint_row.oid)=27
    AND pg_catalog.bool_and(
      constraint_row.contype=expected.constraint_type::"char"
      AND constraint_row.convalidated
      AND (expected.constraint_type<>'c' OR NOT constraint_row.connoinherit)
      AND constraint_row.condeferrable=expected.is_deferrable
      AND constraint_row.condeferred=expected.initially_deferred
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
        pg_catalog.replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '::[a-z0-9_]+(\[\])?','','g'
        ),'[[:space:]()''"]','','g'),'public.',''),'pg_catalog.','')))=
        expected.definition_md5
    )
    AND (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_constraint AS actual
      WHERE actual.conrelid=ANY(ARRAY[
        'public.teskeid_event_guest_invitations'::regclass,
        'public.teskeid_event_attendance_mutation_requests'::regclass,
        'public.teskeid_event_guest_identity_mutation_authorizations'::regclass
      ]) AND actual.contype IN ('c','f','p','u','x'))=24
    INTO v_ok
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid=pg_catalog.to_regclass(
      'public.'||expected.relation_name
    ) AND constraint_row.conname=expected.constraint_name;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'sql153_recovery_legacy_constraint_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_sql153_install_baseline AS baseline
    CROSS JOIN public.teskeid_event_sql153_write_observation_seq AS marker
    CROSS JOIN public.teskeid_event_v1_bridge_observation_seq AS bridge
    WHERE baseline.singleton AND marker.last_value=1 AND NOT marker.is_called
      AND baseline.sql149_last_value=bridge.last_value
      AND baseline.sql149_is_called=bridge.is_called
      AND baseline.request_count=0
      AND NOT EXISTS (
        SELECT 1 FROM public.teskeid_event_participation_mutation_requests_v3)
      AND pg_catalog.md5(pg_catalog.replace(
        baseline.predecessor_rsvp_v2_source,E'\r\n',E'\n'))
          ='0b161601a4b91a521c42288b8279ff83'
      AND baseline.participation_count=(
        SELECT pg_catalog.count(*) FROM public.teskeid_event_participations)
      AND baseline.rsvp_baseline_md5=(
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          participation.event_id::text||'|'||participation.event_guest_id::text||'|'||
          participation.identity_generation::text||'|'||participation.rsvp_state||'|'||
          participation.rsvp_version::text,E'\n' ORDER BY participation.event_id,
          participation.event_guest_id),''))
        FROM public.teskeid_event_participations AS participation)
      AND baseline.pre_fence_rsvp_md5=(
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          participation.event_id::text||'|'||
          participation.event_guest_id::text||'|'||
          participation.identity_generation::text||'|'||
          participation.rsvp_state||'|'||
          CASE WHEN participation.identity_generation>1
            THEN (participation.rsvp_version-1)::text
            ELSE participation.rsvp_version::text END,
          E'\n' ORDER BY participation.event_id,
            participation.event_guest_id),''))
        FROM public.teskeid_event_participations AS participation)
      AND baseline.decision_count=(
        SELECT pg_catalog.count(*) FROM public.teskeid_event_participation_rsvp_v3)
      AND baseline.decision_baseline_md5=(
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          decision.event_id::text||'|'||decision.event_guest_id::text||'|'||
          decision.identity_generation::text||'|'||decision.effective_state||'|'||
          COALESCE(pg_catalog.md5(decision.private_note),'-')||'|'||
          decision.decision_version::text,E'\n' ORDER BY decision.event_id,
          decision.event_guest_id),''))
        FROM public.teskeid_event_participation_rsvp_v3 AS decision)
      AND baseline.invitation_anchor_count=(
        SELECT pg_catalog.count(*)
        FROM public.teskeid_event_participation_invitation_generations_v3)
      AND baseline.invitation_anchor_md5=(
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          anchor.invitation_id::text||'|'||anchor.event_id::text||'|'||
          anchor.event_guest_id::text||'|'||anchor.identity_generation::text,
          E'\n' ORDER BY anchor.event_id,anchor.event_guest_id),''))
        FROM public.teskeid_event_participation_invitation_generations_v3 AS anchor)
  ) THEN
    RAISE EXCEPTION 'sql153_recovery_baseline_closed';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM public.teskeid_event_participation_rsvp_v3)<>
       (SELECT pg_catalog.count(*)
        FROM public.teskeid_event_participations)
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_participations AS participation
       LEFT JOIN public.teskeid_event_participation_rsvp_v3 AS decision
         ON decision.event_id=participation.event_id
        AND decision.event_guest_id=participation.event_guest_id
       WHERE decision.event_guest_id IS NULL
          OR decision.identity_generation<>
            participation.identity_generation
          OR decision.decision_version<>participation.rsvp_version
          OR decision.effective_state<>participation.rsvp_state
          OR decision.private_note IS NOT NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public.teskeid_event_participation_invitation_generations_v3
         AS anchor
       JOIN public.teskeid_event_participations AS participation
         ON participation.event_id=anchor.event_id
        AND participation.event_guest_id=anchor.event_guest_id
       JOIN public.teskeid_event_guest_invitations AS invitation
         ON invitation.id=anchor.invitation_id
        AND invitation.event_id=anchor.event_id
        AND invitation.event_guest_id=anchor.event_guest_id
       LEFT JOIN
         public.teskeid_event_participation_invitation_terminalizations
           AS terminalization
         ON terminalization.invitation_id=anchor.invitation_id
        AND terminalization.event_id=anchor.event_id
        AND terminalization.event_guest_id=anchor.event_guest_id
        AND terminalization.identity_generation=anchor.identity_generation
        AND terminalization.reason='identity_claim'
       WHERE anchor.identity_generation<>participation.identity_generation
          OR participation.access_state<>'active'
          OR (
            invitation.status NOT IN (
              'pending','accepted','declined','expired'
            )
            AND NOT (
              invitation.status='cancelled'
              AND terminalization.invitation_id IS NOT NULL
            )
          )
     )
     OR EXISTS (
       WITH latest AS (
         SELECT DISTINCT ON (
           invitation.event_id,invitation.event_guest_id
         ) invitation.id AS invitation_id,invitation.event_id,
           invitation.event_guest_id,invitation.status
         FROM public.teskeid_event_guest_invitations AS invitation
         ORDER BY invitation.event_id,invitation.event_guest_id,
           invitation.created_at DESC,invitation.id DESC
       ), expected AS (
         SELECT latest.invitation_id,latest.event_id,
           latest.event_guest_id,participation.identity_generation
         FROM latest
         JOIN public.teskeid_event_participations AS participation
           ON participation.event_id=latest.event_id
          AND participation.event_guest_id=latest.event_guest_id
          AND participation.access_state='active'
         JOIN public.teskeid_event_guests AS guest
           ON guest.event_id=latest.event_id
          AND guest.id=latest.event_guest_id
          AND guest.status='active'
         WHERE latest.status IN (
             'pending','accepted','declined','expired'
           ) OR (
             latest.status='cancelled'
             AND EXISTS (
               SELECT 1
               FROM
                 public.teskeid_event_participation_invitation_terminalizations
                   AS terminalization
               WHERE terminalization.invitation_id=latest.invitation_id
                 AND terminalization.event_id=latest.event_id
                 AND terminalization.event_guest_id=latest.event_guest_id
                 AND terminalization.identity_generation=
                   participation.identity_generation
                 AND terminalization.reason='identity_claim'
             )
           )
       ), difference AS (
         (
           SELECT invitation_id,event_id,event_guest_id,
             identity_generation
           FROM expected
           EXCEPT
           SELECT invitation_id,event_id,event_guest_id,
             identity_generation
           FROM
             public.teskeid_event_participation_invitation_generations_v3
         )
         UNION ALL
         (
           SELECT invitation_id,event_id,event_guest_id,
             identity_generation
           FROM
             public.teskeid_event_participation_invitation_generations_v3
           EXCEPT
           SELECT invitation_id,event_id,event_guest_id,
             identity_generation
           FROM expected
         )
       )
       SELECT 1 FROM difference
     ) THEN
    RAISE EXCEPTION 'sql153_recovery_backfill_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teskeid_event_participations
    WHERE identity_generation>1 AND rsvp_version<=1
  ) THEN
    RAISE EXCEPTION 'sql153_recovery_fence_mismatch';
  END IF;
END;
$sql153_recovery_guard$;

-- Preserve the exact non-SQL153 catalog observed after every static guard.
-- The final gate compares this snapshot bidirectionally after recovery.
CREATE TEMP VIEW sql153_recovery_catalog_current AS
SELECT 'function'::text AS object_kind,
  namespace_row.nspname||'.'||procedure_row.proname||'('||
    pg_catalog.pg_get_function_identity_arguments(procedure_row.oid)||')'
    AS object_key,
  pg_catalog.jsonb_build_object(
    'arguments',pg_catalog.pg_get_function_arguments(procedure_row.oid),
    'result',pg_catalog.pg_get_function_result(procedure_row.oid),
    'owner',owner_role.rolname,
    'language',language_row.lanname,
    'kind',procedure_row.prokind,
    'security_definer',procedure_row.prosecdef,
    'strict',procedure_row.proisstrict,
    'leakproof',procedure_row.proleakproof,
    'returns_set',procedure_row.proretset,
    'defaults',procedure_row.pronargdefaults,
    'volatility',procedure_row.provolatile,
    'parallel',procedure_row.proparallel,
    'config',procedure_row.proconfig,
    'source_md5',pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc,E'\r\n',E'\n'
    )),
    'acl',procedure_row.proacl
  )::text AS object_value
FROM pg_catalog.pg_proc AS procedure_row
JOIN pg_catalog.pg_namespace AS namespace_row
  ON namespace_row.oid=procedure_row.pronamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid=procedure_row.proowner
JOIN pg_catalog.pg_language AS language_row
  ON language_row.oid=procedure_row.prolang
WHERE namespace_row.nspname='public'
  AND procedure_row.proname NOT LIKE 'teskeid_event%v3'
  AND procedure_row.proname<>'teskeid_event_set_rsvp_v2'

UNION ALL

SELECT 'relation',namespace_row.nspname||'.'||relation_row.relname,
  pg_catalog.jsonb_build_object(
    'kind',relation_row.relkind,
    'persistence',relation_row.relpersistence,
    'owner',owner_role.rolname,
    'row_security',relation_row.relrowsecurity,
    'force_row_security',relation_row.relforcerowsecurity,
    'replica_identity',relation_row.relreplident,
    'tablespace',relation_row.reltablespace,
    'options',relation_row.reloptions,
    'acl',relation_row.relacl
  )::text
FROM pg_catalog.pg_class AS relation_row
JOIN pg_catalog.pg_namespace AS namespace_row
  ON namespace_row.oid=relation_row.relnamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid=relation_row.relowner
WHERE namespace_row.nspname='public'
  AND relation_row.relkind IN ('r','p','S')
  AND relation_row.relname<>ALL(ARRAY[
    'teskeid_event_participation_rsvp_v3',
    'teskeid_event_participation_invitation_generations_v3',
    'teskeid_event_participation_mutation_requests_v3',
    'teskeid_event_sql153_install_baseline',
    'teskeid_event_sql153_write_observation_seq'
  ]::name[])

UNION ALL

SELECT 'sequence',namespace_row.nspname||'.'||sequence_class.relname,
  pg_catalog.jsonb_build_object(
    'type',sequence_row.seqtypid::regtype::text,
    'start',sequence_row.seqstart,
    'increment',sequence_row.seqincrement,
    'maximum',sequence_row.seqmax,
    'minimum',sequence_row.seqmin,
    'cache',sequence_row.seqcache,
    'cycle',sequence_row.seqcycle
  )::text
FROM pg_catalog.pg_sequence AS sequence_row
JOIN pg_catalog.pg_class AS sequence_class
  ON sequence_class.oid=sequence_row.seqrelid
JOIN pg_catalog.pg_namespace AS namespace_row
  ON namespace_row.oid=sequence_class.relnamespace
WHERE namespace_row.nspname='public'
  AND sequence_class.relname<>
    'teskeid_event_sql153_write_observation_seq'

UNION ALL

SELECT 'column',namespace_row.nspname||'.'||relation_row.relname||'.'||
    attribute_row.attname,
  pg_catalog.jsonb_build_object(
    'number',attribute_row.attnum,
    'type',pg_catalog.format_type(
      attribute_row.atttypid,attribute_row.atttypmod
    ),
    'not_null',attribute_row.attnotnull,
    'default',pg_catalog.pg_get_expr(
      default_row.adbin,default_row.adrelid,true
    ),
    'collation',CASE WHEN attribute_row.attcollation=0 THEN NULL
      ELSE attribute_row.attcollation::regcollation::text END,
    'identity',attribute_row.attidentity,
    'generated',attribute_row.attgenerated,
    'storage',attribute_row.attstorage,
    'compression',attribute_row.attcompression,
    'statistics',attribute_row.attstattarget,
    'options',attribute_row.attoptions,
    'acl',attribute_row.attacl
  )::text
FROM pg_catalog.pg_attribute AS attribute_row
JOIN pg_catalog.pg_class AS relation_row
  ON relation_row.oid=attribute_row.attrelid
JOIN pg_catalog.pg_namespace AS namespace_row
  ON namespace_row.oid=relation_row.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS default_row
  ON default_row.adrelid=attribute_row.attrelid
 AND default_row.adnum=attribute_row.attnum
WHERE namespace_row.nspname='public'
  AND relation_row.relkind IN ('r','p','S')
  AND relation_row.relname<>ALL(ARRAY[
    'teskeid_event_participation_rsvp_v3',
    'teskeid_event_participation_invitation_generations_v3',
    'teskeid_event_participation_mutation_requests_v3',
    'teskeid_event_sql153_install_baseline',
    'teskeid_event_sql153_write_observation_seq'
  ]::name[])
  AND attribute_row.attnum>0 AND NOT attribute_row.attisdropped

UNION ALL

SELECT 'index',namespace_row.nspname||'.'||index_class.relname,
  pg_catalog.jsonb_build_object(
    'table',table_class.oid::regclass::text,
    'owner',owner_role.rolname,
    'method',access_method.amname,
    'unique',index_row.indisunique,
    'primary',index_row.indisprimary,
    'valid',index_row.indisvalid,
    'ready',index_row.indisready,
    'live',index_row.indislive,
    'immediate',index_row.indimmediate,
    'check_xmin',index_row.indcheckxmin,
    'clustered',index_row.indisclustered,
    'replica_identity',index_row.indisreplident,
    'nulls_not_distinct',index_row.indnullsnotdistinct,
    'exclusion',index_row.indisexclusion,
    'attributes',index_row.indnatts,
    'key_attributes',index_row.indnkeyatts,
    'keys',index_row.indkey::text,
    'classes',index_row.indclass::text,
    'collations',index_row.indcollation::text,
    'options_vector',index_row.indoption::text,
    'expressions',pg_catalog.pg_get_expr(
      index_row.indexprs,index_row.indrelid,true
    ),
    'predicate',pg_catalog.pg_get_expr(
      index_row.indpred,index_row.indrelid,true
    ),
    'definition',pg_catalog.pg_get_indexdef(index_row.indexrelid),
    'tablespace',index_class.reltablespace,
    'options',index_class.reloptions,
    'acl',index_class.relacl
  )::text
FROM pg_catalog.pg_index AS index_row
JOIN pg_catalog.pg_class AS index_class
  ON index_class.oid=index_row.indexrelid
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid=index_row.indrelid
JOIN pg_catalog.pg_namespace AS namespace_row
  ON namespace_row.oid=table_class.relnamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid=index_class.relowner
JOIN pg_catalog.pg_am AS access_method
  ON access_method.oid=index_class.relam
WHERE namespace_row.nspname='public'
  AND table_class.relname<>ALL(ARRAY[
    'teskeid_event_participation_rsvp_v3',
    'teskeid_event_participation_invitation_generations_v3',
    'teskeid_event_participation_mutation_requests_v3',
    'teskeid_event_sql153_install_baseline'
  ]::name[])

UNION ALL

SELECT 'constraint',namespace_row.nspname||'.'||table_class.relname||'.'||
    constraint_row.conname,
  pg_catalog.jsonb_build_object(
    'type',constraint_row.contype,
    'validated',constraint_row.convalidated,
    'no_inherit',constraint_row.connoinherit,
    'deferrable',constraint_row.condeferrable,
    'deferred',constraint_row.condeferred,
    'local_keys',constraint_row.conkey::text,
    'foreign_table',CASE WHEN constraint_row.confrelid=0 THEN NULL
      ELSE constraint_row.confrelid::regclass::text END,
    'foreign_keys',constraint_row.confkey::text,
    'delete_action',constraint_row.confdeltype,
    'update_action',constraint_row.confupdtype,
    'match_type',constraint_row.confmatchtype,
    'index',CASE WHEN constraint_row.conindid=0 THEN NULL
      ELSE constraint_row.conindid::regclass::text END,
    'definition',pg_catalog.pg_get_constraintdef(
      constraint_row.oid,true
    )
  )::text
FROM pg_catalog.pg_constraint AS constraint_row
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid=constraint_row.conrelid
JOIN pg_catalog.pg_namespace AS namespace_row
  ON namespace_row.oid=table_class.relnamespace
WHERE namespace_row.nspname='public'
  AND table_class.relname<>ALL(ARRAY[
    'teskeid_event_participation_rsvp_v3',
    'teskeid_event_participation_invitation_generations_v3',
    'teskeid_event_participation_mutation_requests_v3',
    'teskeid_event_sql153_install_baseline'
  ]::name[])
  AND constraint_row.conname NOT LIKE '%sql153%'

UNION ALL

SELECT 'trigger',namespace_row.nspname||'.'||table_class.relname||'.'||
    trigger_row.tgname,
  pg_catalog.jsonb_build_object(
    'function',trigger_row.tgfoid::regprocedure::text,
    'type',trigger_row.tgtype,
    'enabled',trigger_row.tgenabled,
    'constraint',trigger_row.tgconstraint,
    'deferrable',trigger_row.tgdeferrable,
    'deferred',trigger_row.tginitdeferred,
    'parent',trigger_row.tgparentid,
    'columns',trigger_row.tgattr::text,
    'arguments',pg_catalog.encode(trigger_row.tgargs,'hex'),
    'when',pg_catalog.pg_get_expr(
      trigger_row.tgqual,trigger_row.tgrelid,true
    ),
    'old_table',trigger_row.tgoldtable,
    'new_table',trigger_row.tgnewtable,
    'definition',pg_catalog.pg_get_triggerdef(trigger_row.oid,true)
  )::text
FROM pg_catalog.pg_trigger AS trigger_row
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid=trigger_row.tgrelid
JOIN pg_catalog.pg_namespace AS namespace_row
  ON namespace_row.oid=table_class.relnamespace
WHERE namespace_row.nspname IN ('public','auth')
  AND NOT trigger_row.tgisinternal
  AND trigger_row.tgname NOT LIKE '%sql153%'
  AND trigger_row.tgname<>
    'teskeid_event_participation_requests_v3_guard'

UNION ALL

SELECT 'policy',namespace_row.nspname||'.'||table_class.relname||'.'||
    policy_row.polname,
  pg_catalog.jsonb_build_object(
    'permissive',policy_row.polpermissive,
    'roles',policy_row.polroles::text,
    'command',policy_row.polcmd,
    'using',pg_catalog.pg_get_expr(
      policy_row.polqual,policy_row.polrelid,true
    ),
    'check',pg_catalog.pg_get_expr(
      policy_row.polwithcheck,policy_row.polrelid,true
    )
  )::text
FROM pg_catalog.pg_policy AS policy_row
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid=policy_row.polrelid
JOIN pg_catalog.pg_namespace AS namespace_row
  ON namespace_row.oid=table_class.relnamespace
WHERE namespace_row.nspname='public'
  AND table_class.relname<>ALL(ARRAY[
    'teskeid_event_participation_rsvp_v3',
    'teskeid_event_participation_invitation_generations_v3',
    'teskeid_event_participation_mutation_requests_v3',
    'teskeid_event_sql153_install_baseline'
  ]::name[]);

CREATE TEMP TABLE sql153_recovery_catalog_snapshot
ON COMMIT DROP
AS SELECT object_kind,object_key,object_value
FROM sql153_recovery_catalog_current;

CREATE TEMP TABLE sql153_recovery_baseline_snapshot
ON COMMIT DROP
AS SELECT baseline.participation_count,baseline.pre_fence_rsvp_md5,
  baseline.sql149_last_value,baseline.sql149_is_called
FROM public.teskeid_event_sql153_install_baseline AS baseline
WHERE baseline.singleton;

SET CONSTRAINTS ALL IMMEDIATE;

DO $sql153_recovery_observation_recheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_sql153_install_baseline AS baseline
    CROSS JOIN public.teskeid_event_sql153_write_observation_seq AS marker
    CROSS JOIN public.teskeid_event_v1_bridge_observation_seq AS bridge
    WHERE baseline.singleton
      AND marker.last_value=1 AND NOT marker.is_called
      AND baseline.sql149_last_value=bridge.last_value
      AND baseline.sql149_is_called=bridge.is_called
      AND baseline.request_count=0
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participation_mutation_requests_v3
      )
  ) THEN
    RAISE EXCEPTION 'sql153_recovery_observation_boundary_closed';
  END IF;
END;
$sql153_recovery_observation_recheck$;

DROP TRIGGER teskeid_event_participation_requests_v3_guard
  ON public.teskeid_event_participation_mutation_requests_v3;
DROP TRIGGER teskeid_event_participations_sql153_generation_rsvp_bump
  ON public.teskeid_event_participations;
DROP TRIGGER teskeid_event_participations_sql153_rsvp_sync
  ON public.teskeid_event_participations;
DROP TRIGGER teskeid_event_guest_invitations_sql153_anchor_deferred
  ON public.teskeid_event_guest_invitations;
DROP TRIGGER teskeid_event_participations_sql153_integrity_deferred
  ON public.teskeid_event_participations;
DROP TRIGGER teskeid_event_rsvp_v3_integrity_deferred
  ON public.teskeid_event_participation_rsvp_v3;

DO $sql153_restore_v2$
DECLARE
  v_source text;
BEGIN
  SELECT baseline.predecessor_rsvp_v2_source INTO v_source
  FROM public.teskeid_event_sql153_install_baseline AS baseline
  WHERE baseline.singleton;
  IF pg_catalog.md5(pg_catalog.replace(v_source,E'\r\n',E'\n'))<>
       '0b161601a4b91a521c42288b8279ff83' THEN
    RAISE EXCEPTION 'sql153_recovery_predecessor_mismatch';
  END IF;
  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.teskeid_event_set_rsvp_v2('
      || 'p_actor_id uuid,p_event_id uuid,p_event_guest_id uuid,'
      || 'p_rsvp_state text,p_expected_rsvp_version bigint,p_request_id uuid) '
      || 'RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER '
      || 'SET search_path = '''' AS %L',v_source
  );
END;
$sql153_restore_v2$;
ALTER FUNCTION public.teskeid_event_set_rsvp_v2(
  uuid,uuid,uuid,text,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.teskeid_event_set_rsvp_v2(
  uuid,uuid,uuid,text,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_set_rsvp_v2(
  uuid,uuid,uuid,text,bigint,uuid) TO service_role;

-- Reverse only the deterministic install fence. No timestamp is changed.
UPDATE public.teskeid_event_participations AS participation
SET rsvp_version=participation.rsvp_version-1
WHERE participation.identity_generation>1;

DO $sql153_recovery_fence_proof$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_sql153_install_baseline AS baseline
    WHERE baseline.singleton
      AND baseline.participation_count=(
        SELECT pg_catalog.count(*) FROM public.teskeid_event_participations)
      AND baseline.pre_fence_rsvp_md5=(
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          participation.event_id::text||'|'||
          participation.event_guest_id::text||'|'||
          participation.identity_generation::text||'|'||
          participation.rsvp_state||'|'||participation.rsvp_version::text,
          E'\n' ORDER BY participation.event_id,
          participation.event_guest_id),''))
        FROM public.teskeid_event_participations AS participation)
  ) THEN
    RAISE EXCEPTION 'sql153_recovery_fence_restore_mismatch';
  END IF;
END;
$sql153_recovery_fence_proof$;

DROP FUNCTION public.teskeid_event_resolve_invitation_v3(uuid,uuid);
DROP FUNCTION public.teskeid_event_get_actor_view_v3(uuid,uuid);
DROP FUNCTION public.teskeid_event_list_for_actor_v3(uuid);
DROP FUNCTION public.teskeid_event_list_person_source_events_v3(
  uuid,timestamp with time zone,uuid,integer);
DROP FUNCTION public.teskeid_event_get_person_source_roster_v3(uuid,uuid);
DROP FUNCTION public.teskeid_event_set_rsvp_v3(
  uuid,uuid,uuid,bigint,text,text,bigint,uuid);
DROP FUNCTION public.teskeid_event_leave_participation_v3(
  uuid,uuid,uuid,bigint,bigint,bigint,uuid);
DROP FUNCTION public.teskeid_event_list_scoped_participations_v3(uuid);
DROP FUNCTION public.teskeid_event_private_people_projection_v3(
  uuid,uuid,text,uuid,boolean);
DROP FUNCTION public.teskeid_event_private_person_projection_v3(
  uuid,uuid,uuid,integer,boolean,boolean);
DROP FUNCTION public.teskeid_event_private_scope_v3(uuid,uuid);
DROP FUNCTION public.teskeid_event_private_claim_scoped_v3(uuid,uuid);
DROP FUNCTION public.teskeid_event_private_rsvp_integrity_trigger_v3();
DROP FUNCTION public.teskeid_event_private_assert_rsvp_integrity_v3(uuid,uuid);
DROP FUNCTION public.teskeid_event_private_anchor_sync_v3();
DROP FUNCTION public.teskeid_event_private_sync_rsvp_v3();
DROP FUNCTION public.teskeid_event_private_anchor_invitation_v3(uuid,uuid);
DROP FUNCTION public.teskeid_event_private_bump_generation_rsvp_v3();
DROP FUNCTION public.teskeid_event_private_guard_request_v3();
DROP FUNCTION public.teskeid_event_private_finish_request_v3(uuid,uuid,jsonb);
DROP FUNCTION public.teskeid_event_private_begin_request_v3(uuid,uuid,text,text);

DO $sql153_recovery_final_observation_recheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_sql153_install_baseline AS baseline
    CROSS JOIN public.teskeid_event_sql153_write_observation_seq AS marker
    CROSS JOIN public.teskeid_event_v1_bridge_observation_seq AS bridge
    WHERE baseline.singleton
      AND marker.last_value=1 AND NOT marker.is_called
      AND baseline.sql149_last_value=bridge.last_value
      AND baseline.sql149_is_called=bridge.is_called
      AND baseline.request_count=0
      AND NOT EXISTS (
        SELECT 1
        FROM public.teskeid_event_participation_mutation_requests_v3
      )
  ) THEN
    RAISE EXCEPTION 'sql153_recovery_observation_race';
  END IF;
END;
$sql153_recovery_final_observation_recheck$;

DROP TABLE public.teskeid_event_participation_invitation_generations_v3;
DROP TABLE public.teskeid_event_participation_mutation_requests_v3;
DROP TABLE public.teskeid_event_participation_rsvp_v3;
DROP TABLE public.teskeid_event_sql153_install_baseline;
DROP FUNCTION public.teskeid_event_private_normalize_note_v3(text);
DROP SEQUENCE public.teskeid_event_sql153_write_observation_seq;

DO $sql153_recovery_final$
DECLARE
  v_oid oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)');
BEGIN
  IF v_oid IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=procedure_row.proowner
    JOIN pg_catalog.pg_language AS language_row ON language_row.oid=procedure_row.prolang
    WHERE procedure_row.oid=v_oid AND owner_role.rolname='postgres'
      AND language_row.lanname='plpgsql' AND procedure_row.prokind='f'
      AND procedure_row.prosecdef AND NOT procedure_row.proisstrict
      AND NOT procedure_row.proleakproof AND NOT procedure_row.proretset
      AND procedure_row.pronargdefaults=0 AND procedure_row.provolatile='v'
      AND procedure_row.proparallel='u'
      AND procedure_row.proconfig=ARRAY['search_path=""']::text[]
      AND pg_catalog.pg_get_function_result(procedure_row.oid)='jsonb'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid)=
        'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_rsvp_state text, p_expected_rsvp_version bigint, p_request_id uuid'
      AND (SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace=procedure_row.pronamespace
          AND overload.proname=procedure_row.proname)=1
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc,E'\r\n',E'\n'))=
          '0b161601a4b91a521c42288b8279ff83'
      AND pg_catalog.has_function_privilege('postgres',v_oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
      AND pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
      AND (SELECT pg_catalog.count(*)
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f',procedure_row.proowner)
        )))=2
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f',procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid=privilege.grantee
        WHERE privilege.grantor<>procedure_row.proowner
          OR privilege.privilege_type<>'EXECUTE'
          OR privilege.grantee=0 OR privilege.is_grantable
          OR (
            privilege.grantee<>procedure_row.proowner
            AND grantee.rolname IS DISTINCT FROM 'service_role'
          )
      )
  ) OR EXISTS (
    SELECT 1
    FROM (
      (
        SELECT object_kind,object_key,object_value
        FROM pg_temp.sql153_recovery_catalog_current
        EXCEPT
        SELECT object_kind,object_key,object_value
        FROM pg_temp.sql153_recovery_catalog_snapshot
      )
      UNION ALL
      (
        SELECT object_kind,object_key,object_value
        FROM pg_temp.sql153_recovery_catalog_snapshot
        EXCEPT
        SELECT object_kind,object_key,object_value
        FROM pg_temp.sql153_recovery_catalog_current
      )
    ) AS catalog_difference
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_temp.sql153_recovery_baseline_snapshot AS baseline
    CROSS JOIN public.teskeid_event_v1_bridge_observation_seq AS bridge
    WHERE baseline.sql149_last_value=bridge.last_value
      AND baseline.sql149_is_called=bridge.is_called
      AND baseline.participation_count=(
        SELECT pg_catalog.count(*)
        FROM public.teskeid_event_participations
      )
      AND baseline.pre_fence_rsvp_md5=(
        SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
          participation.event_id::text||'|'||
          participation.event_guest_id::text||'|'||
          participation.identity_generation::text||'|'||
          participation.rsvp_state||'|'||participation.rsvp_version::text,
          E'\n' ORDER BY participation.event_id,
            participation.event_guest_id
        ),''))
        FROM public.teskeid_event_participations AS participation
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid=procedure_row.pronamespace
    WHERE namespace_row.nspname='public'
      AND procedure_row.proname LIKE 'teskeid_event%v3'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
    WHERE NOT trigger_row.tgisinternal
      AND (trigger_row.tgname LIKE '%sql153%'
        OR trigger_row.tgname=ANY(ARRAY[
          'teskeid_event_participation_requests_v3_guard',
          'teskeid_event_rsvp_v3_integrity_deferred'
        ]::name[]))
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.contype='t'
      AND constraint_row.conname=ANY(ARRAY[
        'teskeid_event_guest_invitations_sql153_anchor_deferred',
        'teskeid_event_participations_sql153_integrity_deferred',
        'teskeid_event_rsvp_v3_integrity_deferred'
      ]::name[])
  ) OR pg_catalog.to_regclass(
    'public.teskeid_event_sql153_write_observation_seq') IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM (VALUES
      ('teskeid_event_participation_rsvp_v3'),
      ('teskeid_event_participation_invitation_generations_v3'),
      ('teskeid_event_participation_mutation_requests_v3'),
      ('teskeid_event_sql153_install_baseline'),
      ('teskeid_event_participation_requests_v3_created_idx')
    ) AS target(name)
    WHERE pg_catalog.to_regclass('public.'||target.name) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'sql153_recovery_final_mismatch';
  END IF;
END;
$sql153_recovery_final$;

DROP VIEW pg_temp.sql153_recovery_catalog_current;
DROP TABLE pg_temp.sql153_recovery_catalog_snapshot;
DROP TABLE pg_temp.sql153_recovery_baseline_snapshot;

COMMIT;
