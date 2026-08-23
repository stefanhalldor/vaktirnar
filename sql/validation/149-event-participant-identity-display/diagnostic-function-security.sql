-- SQL149 function-security diagnostic.
-- Read-only: reports only SQL149 functions that differ from the exact contract.

BEGIN;
SET TRANSACTION READ ONLY;

WITH expected_functions(
  signature, exact_arguments, return_type, language_name,
  is_public, volatility
) AS (
  VALUES
    ('public.teskeid_event_private_normalize_shared_name_v2(text)',
      'p_value text','text','sql',false,'i'),
    ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)',
      'p_value timestamp with time zone','text','sql',false,'s'),
    ('public.teskeid_event_private_valid_shared_name_v2(text)',
      'p_value text','boolean','sql',false,'i'),
    ('public.teskeid_event_private_valid_canonical_email_v2(text)',
      'p_value text','boolean','sql',false,'i'),
    ('public.teskeid_event_private_begin_participation_request_v2(uuid,uuid,text,text)',
      'p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text',
      'jsonb','plpgsql',false,'v'),
    ('public.teskeid_event_private_finish_participation_request_v2(uuid,uuid,jsonb)',
      'p_actor_id uuid, p_request_id uuid, p_result jsonb',
      'void','plpgsql',false,'v'),
    ('public.teskeid_event_private_guard_participation_request_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_ensure_person_v2(uuid,uuid)',
      'p_event_id uuid, p_event_guest_id uuid','void','plpgsql',false,'v'),
    ('public.teskeid_event_private_expire_bound_invitations_v2(uuid,text)',
      'p_recipient_user_id uuid, p_confirmed_email_canonical text',
      'integer','plpgsql',false,'v'),
    ('public.teskeid_event_private_guard_bound_invitation_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_auth_email_invitations_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_participation_unlink_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_auth_delete_participations_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_apply_participation_v2(uuid,uuid,text,uuid,text,uuid,boolean,text,text)',
      'p_event_id uuid, p_event_guest_id uuid, p_identity_action text, p_recipient_user_id uuid, p_recipient_email_canonical text, p_claim_source_invitation_id uuid, p_increment_generation boolean, p_access_state text, p_rsvp_state text',
      'void','plpgsql',false,'v'),
    ('public.teskeid_event_private_v1_participation_bridge_v2()',
      '','trigger','plpgsql',false,'v'),
    ('public.teskeid_event_private_claim_participations_v2(uuid)',
      'p_actor_id uuid','integer','plpgsql',false,'v'),
    ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','text','plpgsql',false,'s'),
    ('public.teskeid_event_private_safe_profile_name_v2(uuid)',
      'p_user_id uuid','text','plpgsql',false,'s'),
    ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)',
      'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)',
      'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_position integer, p_is_self boolean',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)',
      'p_actor_id uuid, p_event_id uuid, p_position integer',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
      'p_actor_id uuid, p_event_id uuid, p_viewer_role text',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_list_for_actor_v2(uuid)',
      'p_actor_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_get_roster_management_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_list_person_source_events_v2(uuid,timestamp with time zone,uuid,integer)',
      'p_actor_id uuid, p_before_sort_at timestamp with time zone, p_before_event_id uuid, p_limit integer',
      'jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_get_person_source_roster_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)',
      'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_participant_kind text, p_position integer',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)',
      'p_actor_id uuid, p_event_id uuid, p_viewer_role text',
      'jsonb','plpgsql',false,'s'),
    ('public.teskeid_event_list_legacy_expense_sources_v2(uuid)',
      'p_actor_id uuid','jsonb','plpgsql',true,'s'),
    ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb','plpgsql',true,'s'),
    ('public.teskeid_event_private_canonical_roster_input_v2(jsonb,boolean)',
      'p_guests jsonb, p_allow_retained boolean','jsonb','plpgsql',false,'i'),
    ('public.teskeid_event_private_legacy_roster_input_v2(jsonb)',
      'p_canonical_guests jsonb','jsonb','sql',false,'i'),
    ('public.teskeid_event_create_with_details_and_participations_v2(uuid,uuid,text,jsonb,date,time without time zone,text,text)',
      'p_actor_id uuid, p_request_id uuid, p_name text, p_guests jsonb, p_event_date date, p_event_time time without time zone, p_description text, p_agenda text',
      'jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_replace_roster_with_participations_v2(uuid,uuid,uuid,bigint,jsonb)',
      'p_actor_id uuid, p_event_id uuid, p_request_id uuid, p_expected_roster_revision bigint, p_guests jsonb',
      'jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_repair_person_label_v2(uuid,uuid,uuid,bigint,bigint,text,uuid)',
      'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_expected_roster_revision bigint, p_expected_label_version bigint, p_shared_display_name text, p_request_id uuid',
      'jsonb','plpgsql',true,'v'),
    ('public.teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)',
      'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_rsvp_state text, p_expected_rsvp_version bigint, p_request_id uuid',
      'jsonb','plpgsql',true,'v')
), inspected AS (
  SELECT expected.*,
    procedure_row.oid,
    owner_role.rolname::text AS actual_owner,
    language_row.lanname::text AS actual_language,
    procedure_row.prosecdef AS actual_security_definer,
    procedure_row.prokind AS actual_kind,
    procedure_row.proisstrict AS actual_strict,
    procedure_row.proleakproof AS actual_leakproof,
    procedure_row.proretset AS actual_returns_set,
    procedure_row.pronargdefaults AS actual_default_count,
    procedure_row.provolatile AS actual_volatility,
    procedure_row.proparallel AS actual_parallel,
    pg_catalog.pg_get_function_result(procedure_row.oid) AS actual_result,
    pg_catalog.pg_get_function_arguments(procedure_row.oid) AS actual_arguments,
    procedure_row.proconfig AS actual_config,
    procedure_row.proacl::text AS actual_acl,
    (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS overload
      WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
        AND overload.proname = pg_catalog.split_part(
          pg_catalog.split_part(expected.signature, '(', 1), '.', 2
        )
    ) AS actual_overload_count,
    pg_catalog.has_function_privilege(
      'service_role', procedure_row.oid, 'EXECUTE'
    ) AS actual_service_execute,
    pg_catalog.has_function_privilege(
      'anon', procedure_row.oid, 'EXECUTE'
    ) AS actual_anon_execute,
    pg_catalog.has_function_privilege(
      'authenticated', procedure_row.oid, 'EXECUTE'
    ) AS actual_authenticated_execute,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        procedure_row.proacl,
        pg_catalog.acldefault('f', procedure_row.proowner)
      )) AS acl_row
      LEFT JOIN pg_catalog.pg_roles AS grantee
        ON grantee.oid = acl_row.grantee
      WHERE acl_row.privilege_type <> 'EXECUTE'
         OR acl_row.grantee = 0
         OR acl_row.is_grantable
         OR (
           acl_row.grantee <> procedure_row.proowner
           AND (
             NOT expected.is_public
             OR grantee.rolname IS DISTINCT FROM 'service_role'
           )
         )
    ) AS actual_acl_exact
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = procedure_row.prolang
), evaluated AS (
  SELECT inspected.*,
    oid IS NOT NULL AS exists_ok,
    actual_owner = 'postgres' AS owner_ok,
    actual_overload_count = 1 AS overload_ok,
    actual_security_definer AS security_definer_ok,
    actual_kind = 'f' AS kind_ok,
    NOT actual_strict AS strict_ok,
    NOT actual_leakproof AS leakproof_ok,
    NOT actual_returns_set AS returns_set_ok,
    actual_default_count = 0 AS defaults_ok,
    actual_language = language_name AS language_ok,
    actual_volatility = volatility::"char" AS volatility_ok,
    actual_parallel = 'u' AS parallel_ok,
    actual_result = return_type AS result_ok,
    actual_arguments = exact_arguments AS arguments_ok,
    pg_catalog.cardinality(COALESCE(actual_config, ARRAY[]::text[])) = 1
      AND actual_config[1] IN ('search_path=', 'search_path=""') AS config_ok,
    actual_service_execute = is_public AS service_execute_ok,
    NOT actual_anon_execute AS anon_execute_ok,
    NOT actual_authenticated_execute AS authenticated_execute_ok
  FROM inspected
)
SELECT
  signature,
  exists_ok,
  owner_ok,
  overload_ok,
  security_definer_ok,
  kind_ok,
  strict_ok,
  leakproof_ok,
  returns_set_ok,
  defaults_ok,
  language_ok,
  volatility_ok,
  parallel_ok,
  result_ok,
  arguments_ok,
  config_ok,
  service_execute_ok,
  anon_execute_ok,
  authenticated_execute_ok,
  actual_acl_exact AS acl_exact_ok,
  actual_owner,
  actual_language,
  actual_volatility,
  actual_parallel,
  actual_result,
  actual_arguments,
  actual_config,
  actual_acl,
  actual_service_execute,
  actual_anon_execute,
  actual_authenticated_execute
FROM evaluated
WHERE (
  exists_ok
  AND owner_ok
  AND overload_ok
  AND security_definer_ok
  AND kind_ok
  AND strict_ok
  AND leakproof_ok
  AND returns_set_ok
  AND defaults_ok
  AND language_ok
  AND volatility_ok
  AND parallel_ok
  AND result_ok
  AND arguments_ok
  AND config_ok
  AND service_execute_ok
  AND anon_execute_ok
  AND authenticated_execute_ok
  AND actual_acl_exact
) IS NOT TRUE
ORDER BY signature;

COMMIT;
