-- SQL159 preflight (100% read-only).
--
-- Run only against the quiescent database that is intended to receive SQL159.
-- The result contains catalog booleans plus row counts and one-way digests;
-- it never returns function source or application row content.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

WITH executor_contract AS (
  SELECT current_user = 'postgres' AND session_user = 'postgres'
    AS executor_ok,
    pg_catalog.current_setting('server_version_num')::integer >= 150000
      AS server_version_ok
), expected_roles(role_name, expected_bypass_rls) AS (VALUES
  ('anon', false),
  ('authenticated', false),
  ('service_role', true)
), role_contract AS (
  SELECT pg_catalog.count(role_row.oid) = 3
    AND COALESCE(pg_catalog.bool_and(
      role_row.oid IS NOT NULL
      AND role_row.rolbypassrls = expected_roles.expected_bypass_rls
    ), false) AS roles_exact
  FROM expected_roles
  LEFT JOIN pg_catalog.pg_roles AS role_row
    ON role_row.rolname = expected_roles.role_name
), expected_functions(
  signature, exact_arguments, exact_arg_names, source_hash,
  language_name, volatility, return_type, returns_set, argument_defaults,
  security_definer, is_strict, parallel_mode, exact_config,
  service_execute, is_writer
) AS (VALUES
  ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb',
   ARRAY['p_actor_id','p_request_id','p_expense_id','p_group_id','p_title','p_total_minor','p_currency','p_incurred_on','p_category','p_note','p_split_method','p_one_off_members','p_payments','p_shares','p_obligations']::text[],
   '536efe2584ce8b45ad8ecacf5574dfd4','plpgsql','v','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],true,true),
  ('public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb, p_known_relationship_members jsonb, p_circle_id uuid, p_known_circle_members jsonb',
   ARRAY['p_actor_id','p_request_id','p_expense_id','p_group_id','p_title','p_total_minor','p_currency','p_incurred_on','p_category','p_note','p_split_method','p_one_off_members','p_payments','p_shares','p_obligations','p_known_relationship_members','p_circle_id','p_known_circle_members']::text[],
   '648ea05ac92e58e79e66c8cb34267f3d','plpgsql','v','jsonb',false,0,true,false,'u',ARRAY['search_path=pg_catalog, public']::text[],true,true),
  ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb, p_known_relationship_members jsonb DEFAULT ''[]''::jsonb',
   ARRAY['p_actor_id','p_request_id','p_expense_id','p_group_id','p_title','p_total_minor','p_currency','p_incurred_on','p_category','p_note','p_split_method','p_one_off_members','p_payments','p_shares','p_obligations','p_known_relationship_members']::text[],
   'ad0fd30363a3c9f5d8e7b51be6f1bfa2','plpgsql','v','jsonb',false,1,true,false,'u',ARRAY['search_path=pg_catalog, public']::text[],true,true),
  ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_one_off_members jsonb, p_payments jsonb, p_shares jsonb, p_obligations jsonb, p_participant_invitations jsonb DEFAULT ''[]''::jsonb',
   ARRAY['p_actor_id','p_request_id','p_expense_id','p_group_id','p_title','p_total_minor','p_currency','p_incurred_on','p_category','p_note','p_split_method','p_one_off_members','p_payments','p_shares','p_obligations','p_participant_invitations']::text[],
   '5da34435052493c4c993bc88e82a72dd','plpgsql','v','jsonb',false,1,true,false,'u',ARRAY['search_path=""']::text[],true,true),
  ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_link_to_event boolean, p_payload jsonb',
   ARRAY['p_actor_id','p_request_id','p_event_id','p_expected_roster_revision','p_link_to_event','p_payload']::text[],
   'eca30a044e0406a755fb02399070c3f8','plpgsql','v','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],true,true),
  ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_payload jsonb',
   ARRAY['p_actor_id','p_request_id','p_event_id','p_expected_roster_revision','p_payload']::text[],
   'a30f4dff7aa3d616476da29c82e1b177','plpgsql','v','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],true,true),
  ('public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)',
   'p_actor_id uuid, p_request_id uuid, p_event_id uuid, p_expected_roster_revision bigint, p_payload jsonb',
   ARRAY['p_actor_id','p_request_id','p_event_id','p_expected_roster_revision','p_payload']::text[],
   '719a00f72fccbfac3f5f2cb778c2accb','plpgsql','v','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],true,true),
  ('public.expense_has_beta_access(uuid)','p_user_id uuid',ARRAY['p_user_id']::text[],
   'ebe4628dbda84e79b395c9da0ae39899','sql','s','boolean',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.expense_assert_beta_actor(uuid)','p_actor_id uuid',ARRAY['p_actor_id']::text[],
   'ea6c329f5c13bd7d0bfbd9df41e5931d','plpgsql','s','void',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.expense_active_member_role(uuid,uuid)','p_actor_id uuid, p_group_id uuid',ARRAY['p_actor_id','p_group_id']::text[],
   'b25f994a64dde4a3f94ec8bad8535b17','sql','s','text',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.expense_begin_request(uuid,uuid,text,text)','p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text',ARRAY['p_actor_id','p_request_id','p_operation','p_fingerprint']::text[],
   'd8631d60cc2f0df56dd9e958537db2a7','plpgsql','v','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.expense_finish_request(uuid,uuid,jsonb)','p_actor_id uuid, p_request_id uuid, p_result jsonb',ARRAY['p_actor_id','p_request_id','p_result']::text[],
   '194c5812642b4aaaafe888bc0ba5aa29','plpgsql','v','void',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)','p_actor_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid',ARRAY['p_actor_id','p_context_type','p_group_id','p_expense_id']::text[],
   'aeb9b8246978d630fb69db9365a22f34','plpgsql','v','void',false,0,true,false,'u',ARRAY['search_path=pg_catalog, public']::text[],false,false),
  ('public.expense_identity_request_id(text,uuid)','p_scope text, p_request_id uuid',ARRAY['p_scope','p_request_id']::text[],
   '496d1e1dd94d149cf607198c9271a25d','sql','i','uuid',false,0,true,true,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_assert_session_actor(uuid)','p_actor_id uuid',ARRAY['p_actor_id']::text[],
   '30238c0def94d573fd8265fd94da0757','plpgsql','s','void',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_assert_actor(uuid)','p_actor_id uuid',ARRAY['p_actor_id']::text[],
   '9dd7c34f6cc6c78131e7ebbb9a718ea4','plpgsql','s','void',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_assert_financial_actor(uuid)','p_actor_id uuid',ARRAY['p_actor_id']::text[],
   '7f6ced4f5e7472aff27d9a6d5c624355','plpgsql','s','void',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)','p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text, p_require_expenses boolean',ARRAY['p_actor_id','p_request_id','p_operation','p_fingerprint','p_require_expenses']::text[],
   '4e70b62a5fa28cfe2b884d703935a16c','plpgsql','v','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_finish_request(uuid,uuid,jsonb)','p_actor_id uuid, p_request_id uuid, p_result jsonb',ARRAY['p_actor_id','p_request_id','p_result']::text[],
   'eaa006157dc5377e0ae1f8979651f8aa','plpgsql','v','void',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_private_scope_v3(uuid,uuid)','p_actor_id uuid, p_event_id uuid',ARRAY['p_actor_id','p_event_id']::text[],
   'df104d5af3896804c7b8ef3321d191c8','plpgsql','v','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)','p_actor_id uuid, p_event_id uuid',ARRAY['p_actor_id','p_event_id']::text[],
   'aec7d0cf817826697338e74de645dc4e','plpgsql','s','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],true,false),
  ('public.teskeid_event_uuid_from_text(text)','p_value text',ARRAY['p_value']::text[],
   '27229cbc71c621e5a8592265b07f874d','sql','i','uuid',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.normalize_email_canonical(text)','p_email text',ARRAY['p_email']::text[],
   '3083103976aa8cb3780937b9da1be236','sql','i','text',false,0,false,true,'s',ARRAY['search_path=""']::text[],true,false),
  -- Full transitive SQL149 legacy Expense source chain.
  ('public.teskeid_event_normalize_text(text)','p_value text',ARRAY['p_value']::text[],
   'ced5cfb2427fe7331f4416497614f7d1','sql','i','text',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_valid_text(text,integer,integer)','p_value text, p_minimum integer, p_maximum integer',ARRAY['p_value','p_minimum','p_maximum']::text[],
   '28c80b083a90683f15fd04f4d7d547d1','sql','i','boolean',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_private_normalize_shared_name_v2(text)','p_value text',ARRAY['p_value']::text[],
   'd118ab08bc0346cdf31519344a2f65a7','sql','i','text',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_private_valid_shared_name_v2(text)','p_value text',ARRAY['p_value']::text[],
   '7a3223263c138e04713dbc87e7dc6576','sql','i','boolean',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_private_valid_canonical_email_v2(text)','p_value text',ARRAY['p_value']::text[],
   '3e64bc04485bc06cc544f59f46a2fb0e','sql','i','boolean',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_private_safe_profile_name_v2(uuid)','p_user_id uuid',ARRAY['p_user_id']::text[],
   '53f29b4c6872d3e76d6c9cbc17a767e0','plpgsql','s','text',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)','p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text',ARRAY['p_actor_id','p_relationship_id','p_recipient_user_id','p_recipient_email_canonical']::text[],
   'cfb3afa33af8fd230e6c26930424387f','plpgsql','s','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)','p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_participant_kind text, p_position integer',ARRAY['p_actor_id','p_event_id','p_event_guest_id','p_participant_kind','p_position']::text[],
   '25394edc6b084676921c3a65b1f19a8a','plpgsql','s','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false),
  ('public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)','p_actor_id uuid, p_event_id uuid, p_viewer_role text',ARRAY['p_actor_id','p_event_id','p_viewer_role']::text[],
   '1abbd25362561a9f7b2aaba642412356','plpgsql','s','jsonb',false,0,true,false,'u',ARRAY['search_path=""']::text[],false,false)
), function_observed AS (
  SELECT expected_functions.*,
    function_row.oid AS function_oid,
    function_row.pronamespace,
    function_row.proname,
    function_row.prokind,
    function_row.provolatile,
    function_row.proretset,
    function_row.prorettype,
    function_row.prosecdef,
    function_row.proleakproof,
    function_row.proisstrict,
    function_row.proparallel,
    function_row.pronargdefaults,
    function_row.proargnames,
    function_row.proowner,
    function_row.proconfig,
    function_row.proacl,
    function_row.prosrc,
    language_row.lanname AS actual_language,
    pg_catalog.pg_get_userbyid(function_row.proowner) AS actual_owner,
    pg_catalog.pg_get_function_arguments(function_row.oid) AS actual_arguments,
    pg_catalog.format_type(function_row.prorettype, NULL) AS actual_return_type,
    pg_catalog.md5(pg_catalog.replace(
      function_row.prosrc, E'\r\n', E'\n'
    )) AS actual_source_hash,
    (SELECT pg_catalog.count(*)::integer
     FROM pg_catalog.pg_proc AS overload
     WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
       AND overload.proname = pg_catalog.split_part(
         pg_catalog.split_part(expected_functions.signature, '(', 1), '.', 2
       )) AS actual_overload_count
  FROM expected_functions
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = pg_catalog.to_regprocedure(
      expected_functions.signature
    )
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = function_row.prolang
), function_checks AS (
  SELECT function_observed.*,
    COALESCE(
      function_observed.function_oid IS NOT NULL
      AND function_observed.prokind = 'f'
      AND function_observed.actual_overload_count = 1
      AND function_observed.provolatile::text = function_observed.volatility
      AND function_observed.proretset = function_observed.returns_set
      AND function_observed.actual_return_type = function_observed.return_type
      AND function_observed.prosecdef = function_observed.security_definer
      AND NOT function_observed.proleakproof
      AND function_observed.proisstrict = function_observed.is_strict
      AND function_observed.proparallel::text = function_observed.parallel_mode
      AND function_observed.pronargdefaults =
            function_observed.argument_defaults
      AND function_observed.actual_language = function_observed.language_name
      AND function_observed.actual_owner = 'postgres'
      AND function_observed.actual_arguments =
            function_observed.exact_arguments
      AND function_observed.proargnames::text[] =
            function_observed.exact_arg_names
      AND function_observed.proconfig::text[] =
            function_observed.exact_config
      AND function_observed.actual_source_hash =
            function_observed.source_hash
      AND (
        SELECT pg_catalog.count(*) = CASE
          WHEN function_observed.service_execute THEN 2 ELSE 1 END
        FROM pg_catalog.aclexplode(COALESCE(
          function_observed.proacl,
          pg_catalog.acldefault('f', function_observed.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantor = function_observed.proowner
          AND NOT privilege.is_grantable
          AND (
            privilege.grantee = function_observed.proowner
            OR (
              function_observed.service_execute
              AND grantee_role.rolname = 'service_role'
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          function_observed.proacl,
          pg_catalog.acldefault('f', function_observed.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> function_observed.proowner
           OR privilege.is_grantable
           OR privilege.grantee = 0
           OR (
             privilege.grantee <> function_observed.proowner
             AND (
               NOT function_observed.service_execute
               OR grantee_role.rolname IS DISTINCT FROM 'service_role'
             )
           )
      ), false
    ) AS function_exact
  FROM function_observed
), function_contract AS (
  SELECT pg_catalog.count(*) = 32
    AND COALESCE(pg_catalog.bool_and(function_checks.function_exact), false)
      AS predecessor_functions_exact,
    pg_catalog.count(*)::integer AS predecessor_function_count
  FROM function_checks
), expected_relations(
  signature, expected_rls, expected_force, expected_policy_count,
  expected_nonowner_acl
) AS (VALUES
  ('public.expense_private_drafts',true,true,0,ARRAY[]::text[]),
  ('public.expense_groups',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_group_members',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expenses',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_payments',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_shares',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_obligations',true,false,0,ARRAY['service_role:SELECT']::text[]),
  ('public.expense_mutation_requests',true,false,0,ARRAY[]::text[]),
  ('public.relationships',true,false,0,ARRAY[
    'service_role:DELETE','service_role:INSERT','service_role:MAINTAIN',
    'service_role:REFERENCES','service_role:SELECT','service_role:TRIGGER',
    'service_role:TRUNCATE','service_role:UPDATE'
  ]::text[]),
  ('public.relationship_tags',true,false,0,ARRAY[
    'service_role:DELETE','service_role:INSERT','service_role:MAINTAIN',
    'service_role:REFERENCES','service_role:SELECT','service_role:TRIGGER',
    'service_role:TRUNCATE','service_role:UPDATE'
  ]::text[]),
  ('public.relationship_circles',true,true,0,ARRAY['service_role:SELECT']::text[]),
  ('public.relationship_circle_members',true,true,0,ARRAY['service_role:SELECT']::text[]),
  ('public.relationship_label_definitions',true,true,0,ARRAY['service_role:SELECT']::text[]),
  ('public.relationship_label_assignments',true,true,0,ARRAY['service_role:SELECT']::text[]),
  ('public.profiles',true,false,3,ARRAY[
    'anon:DELETE','anon:INSERT','anon:MAINTAIN','anon:REFERENCES',
    'anon:SELECT','anon:TRIGGER','anon:TRUNCATE','anon:UPDATE',
    'authenticated:DELETE','authenticated:INSERT','authenticated:MAINTAIN',
    'authenticated:REFERENCES','authenticated:SELECT','authenticated:TRIGGER',
    'authenticated:TRUNCATE','authenticated:UPDATE',
    'service_role:DELETE','service_role:INSERT','service_role:MAINTAIN',
    'service_role:REFERENCES','service_role:SELECT','service_role:TRIGGER',
    'service_role:TRUNCATE','service_role:UPDATE'
  ]::text[]),
  ('public.teskeid_events',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_guests',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_mutation_requests',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_attendance_memberships',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_person_labels',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_participations',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_participation_rsvp_v3',true,true,0,ARRAY[]::text[]),
  ('public.teskeid_event_expense_links',true,true,0,ARRAY[]::text[])
), expected_policies(
  relation_signature, policy_name, policy_command, policy_permissive,
  policy_roles, using_expression, check_expression
) AS (VALUES
  ('public.profiles','profiles_insert_own','a',true,
   ARRAY['authenticated']::text[],NULL::text,'(id = auth.uid())'),
  ('public.profiles','profiles_select','r',true,
   ARRAY['authenticated']::text[],'(id = auth.uid())',NULL::text),
  ('public.profiles','profiles_update','w',true,
   ARRAY['authenticated']::text[],'(id = auth.uid())','(id = auth.uid())')
), relation_observed AS (
  SELECT expected_relations.*,
    class_row.oid AS relation_oid,
    namespace_row.nspname AS actual_schema,
    class_row.relkind,
    class_row.relpersistence,
    class_row.relrowsecurity,
    class_row.relforcerowsecurity,
    class_row.relowner,
    class_row.relacl,
    pg_catalog.pg_get_userbyid(class_row.relowner) AS actual_owner,
    (SELECT pg_catalog.count(*)::integer
     FROM pg_catalog.pg_policy AS policy_row
     WHERE policy_row.polrelid = class_row.oid) AS actual_policy_count,
    COALESCE((
      SELECT pg_catalog.array_agg(
        (CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
          ELSE grantee_role.rolname END) || ':' || privilege.privilege_type
        ORDER BY ((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
          ELSE grantee_role.rolname END) || ':' || privilege.privilege_type)
          COLLATE pg_catalog."C"
      )::text[]
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = privilege.grantee
      WHERE privilege.grantee <> class_row.relowner
    ), ARRAY[]::text[]) AS actual_nonowner_acl
  FROM expected_relations
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass(expected_relations.signature)
  LEFT JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = class_row.relnamespace
), relation_checks AS (
  SELECT relation_observed.*,
    COALESCE(
      relation_observed.relation_oid IS NOT NULL
      AND relation_observed.actual_schema = 'public'
      AND relation_observed.relkind = 'r'
      AND relation_observed.relpersistence = 'p'
      AND relation_observed.actual_owner = 'postgres'
      AND relation_observed.relrowsecurity = relation_observed.expected_rls
      AND relation_observed.relforcerowsecurity =
            relation_observed.expected_force
      AND relation_observed.actual_policy_count =
            relation_observed.expected_policy_count
      AND relation_observed.actual_nonowner_acl =
            relation_observed.expected_nonowner_acl
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = relation_observed.relation_oid
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      )
      AND (
        SELECT pg_catalog.count(*) = 7 + CASE
          WHEN pg_catalog.current_setting('server_version_num')::integer >=
               170000 THEN 1 ELSE 0 END
        FROM pg_catalog.aclexplode(COALESCE(
          relation_observed.relacl,
          pg_catalog.acldefault('r', relation_observed.relowner)
        )) AS owner_privilege
        WHERE owner_privilege.grantee = relation_observed.relowner
          AND owner_privilege.grantor = relation_observed.relowner
          AND NOT owner_privilege.is_grantable
          AND owner_privilege.privilege_type IN (
            'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
            'TRIGGER','MAINTAIN'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation_observed.relacl,
          pg_catalog.acldefault('r', relation_observed.relowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.grantor <> relation_observed.relowner
           OR privilege.is_grantable
           OR privilege.privilege_type NOT IN (
             'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
             'TRIGGER','MAINTAIN'
           )
           OR (
             privilege.grantee <> relation_observed.relowner
             AND NOT (
               ((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
                   ELSE grantee_role.rolname END) || ':' ||
                 privilege.privilege_type) = ANY(
                   relation_observed.expected_nonowner_acl
                 )
             )
           )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid = relation_observed.relation_oid
          AND NOT EXISTS (
            SELECT 1
            FROM expected_policies
            WHERE expected_policies.relation_signature =
                    relation_observed.signature
              AND expected_policies.policy_name = policy_row.polname
              AND expected_policies.policy_command = policy_row.polcmd
              AND expected_policies.policy_permissive =
                    policy_row.polpermissive
              AND expected_policies.policy_roles = ARRAY(
                SELECT pg_catalog.pg_get_userbyid(policy_role.role_oid)::text
                FROM pg_catalog.unnest(policy_row.polroles)
                  AS policy_role(role_oid)
                ORDER BY pg_catalog.pg_get_userbyid(policy_role.role_oid)::text
                  COLLATE pg_catalog."C"
              )::text[]
              AND expected_policies.using_expression IS NOT DISTINCT FROM
                    pg_catalog.pg_get_expr(
                      policy_row.polqual, policy_row.polrelid
                    )
              AND expected_policies.check_expression IS NOT DISTINCT FROM
                    pg_catalog.pg_get_expr(
                      policy_row.polwithcheck, policy_row.polrelid
                    )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM expected_policies
        WHERE expected_policies.relation_signature =
                relation_observed.signature
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policy AS policy_row
            WHERE policy_row.polrelid = relation_observed.relation_oid
              AND policy_row.polname = expected_policies.policy_name
              AND policy_row.polcmd = expected_policies.policy_command
              AND policy_row.polpermissive =
                    expected_policies.policy_permissive
              AND ARRAY(
                SELECT pg_catalog.pg_get_userbyid(policy_role.role_oid)::text
                FROM pg_catalog.unnest(policy_row.polroles)
                  AS policy_role(role_oid)
                ORDER BY pg_catalog.pg_get_userbyid(policy_role.role_oid)::text
                  COLLATE pg_catalog."C"
              )::text[] = expected_policies.policy_roles
              AND pg_catalog.pg_get_expr(
                    policy_row.polqual, policy_row.polrelid
                  ) IS NOT DISTINCT FROM expected_policies.using_expression
              AND pg_catalog.pg_get_expr(
                    policy_row.polwithcheck, policy_row.polrelid
                  ) IS NOT DISTINCT FROM expected_policies.check_expression
          )
      ), false
    ) AS relation_exact
  FROM relation_observed
), relation_contract AS (
  SELECT pg_catalog.count(*) = 23
    AND COALESCE(pg_catalog.bool_and(relation_checks.relation_exact), false)
      AS prerequisite_relations_exact,
    pg_catalog.count(*)::integer AS prerequisite_relation_count
  FROM relation_checks
), expected_auth_column_acl(
  column_name, role_name, privilege_type, grantor_name, is_grantable
) AS (VALUES
  ('email','service_role','SELECT','postgres',false),
  ('id','service_role','SELECT','postgres',false)
), auth_column_acl_observed AS (
  SELECT attribute_row.attname::text AS column_name,
    (CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
      ELSE grantee_role.rolname::text END) AS role_name,
    privilege.privilege_type::text AS privilege_type,
    pg_catalog.pg_get_userbyid(privilege.grantor)::text AS grantor_name,
    privilege.is_grantable
  FROM pg_catalog.pg_attribute AS attribute_row
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_row.attacl)
    AS privilege
  LEFT JOIN pg_catalog.pg_roles AS grantee_role
    ON grantee_role.oid = privilege.grantee
  WHERE attribute_row.attrelid = pg_catalog.to_regclass('auth.users')
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped
    AND (
      privilege.grantee = 0
      OR grantee_role.rolname IN ('anon','authenticated','service_role')
    )
), auth_relation_contract AS (
  SELECT COALESCE(
    class_row.oid IS NOT NULL
    AND namespace_row.nspname = 'auth'
    AND class_row.relkind = 'r'
    AND class_row.relpersistence = 'p'
    AND pg_catalog.pg_get_userbyid(class_row.relowner) =
          'supabase_auth_admin'
    AND class_row.relrowsecurity
    AND NOT class_row.relforcerowsecurity
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS policy_row
      WHERE policy_row.polrelid = class_row.oid
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = privilege.grantee
      WHERE privilege.grantee = 0
         OR grantee_role.rolname IN ('anon','authenticated','service_role')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM auth_column_acl_observed AS observed
      WHERE NOT EXISTS (
        SELECT 1
        FROM expected_auth_column_acl AS expected
        WHERE expected.column_name = observed.column_name
          AND expected.role_name = observed.role_name
          AND expected.privilege_type = observed.privilege_type
          AND expected.grantor_name = observed.grantor_name
          AND expected.is_grantable = observed.is_grantable
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM expected_auth_column_acl AS expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM auth_column_acl_observed AS observed
        WHERE observed.column_name = expected.column_name
          AND observed.role_name = expected.role_name
          AND observed.privilege_type = expected.privilege_type
          AND observed.grantor_name = expected.grantor_name
          AND observed.is_grantable = expected.is_grantable
      )
    ), false
  ) AS auth_users_security_exact
  FROM (SELECT pg_catalog.to_regclass('auth.users') AS relation_oid) AS target
  LEFT JOIN pg_catalog.pg_class AS class_row ON class_row.oid = target.relation_oid
  LEFT JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = class_row.relnamespace
), expected_writer_set(signature) AS (VALUES
  ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)'),
  ('public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)'),
  ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'),
  ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'),
  ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'),
  ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)'),
  ('public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)')
), actual_writer_set AS (
  SELECT COALESCE(pg_catalog.array_agg(
    function_row.oid::pg_catalog.regprocedure::text
    ORDER BY function_row.oid::pg_catalog.regprocedure::text
      COLLATE pg_catalog."C"
  ), ARRAY[]::text[]) AS signatures
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND function_row.prokind = 'f'
    AND function_row.oid IS DISTINCT FROM pg_catalog.to_regprocedure(
      'public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)'
    )
    AND (
      function_row.prosrc ~*
        'insert[[:space:]]+into[[:space:]]+public[.]expenses[[:space:](]'
      OR function_row.prosrc ~*
        'public[.](expense_create_expense|expense_create_expense_with_circle_context|expense_create_expense_with_known_members|expense_create_expense_with_participants|teskeid_event_create_expense_from_event_for_actor|teskeid_event_create_tagged_expense|teskeid_event_create_tagged_expense_for_actor)[[:space:]]*[(]'
    )
), writer_contract AS (
  SELECT actual_writer_set.signatures = (
    SELECT pg_catalog.array_agg(
      expected_writer_set.signature
      ORDER BY expected_writer_set.signature COLLATE pg_catalog."C"
    )::text[]
    FROM expected_writer_set
  ) AS old_writer_set_exact,
  pg_catalog.cardinality(actual_writer_set.signatures) AS old_writer_count
  FROM actual_writer_set
), target_relations(name) AS (VALUES
  ('expense_unconfirmed_publications'),
  ('expense_unconfirmed_publication_parties'),
  ('expense_unconfirmed_publication_audience'),
  ('expense_unconfirmed_finalizations'),
  ('expense_private_draft_tombstones'),
  ('expense_sql159_install_baseline')
), target_relation_state AS (
  SELECT pg_catalog.count(*) FILTER (
    WHERE pg_catalog.to_regclass('public.' || target_relations.name)
      IS NOT NULL
  )::integer AS present_count,
  COALESCE(pg_catalog.array_agg(target_relations.name
    ORDER BY target_relations.name COLLATE pg_catalog."C") FILTER (
      WHERE pg_catalog.to_regclass('public.' || target_relations.name)
        IS NOT NULL
    ), ARRAY[]::text[]) AS present_names
  FROM target_relations
), target_indexes(name) AS (VALUES
  ('expense_unconfirmed_publications_pkey'),
  ('expense_unconfirmed_publications_publication_id_key'),
  ('expense_unconfirmed_publications_actor_draft_key'),
  ('expense_unconfirmed_publications_state_key'),
  ('expense_unconfirmed_publications_actor_live_idx'),
  ('expense_unconfirmed_publications_event_live_idx'),
  ('expense_unconfirmed_publications_group_live_idx'),
  ('expense_unconfirmed_publication_parties_pkey'),
  ('expense_unconfirmed_publication_parties_key_unique'),
  ('expense_unconfirmed_publication_parties_identity_unique'),
  ('expense_unconfirmed_publication_audience_pkey'),
  ('expense_unconfirmed_publication_audience_identity_unique'),
  ('expense_unconfirmed_publication_audience_user_idx'),
  ('expense_unconfirmed_finalizations_pkey'),
  ('expense_unconfirmed_finalizations_request_unique'),
  ('expense_unconfirmed_finalizations_expense_unique'),
  ('expense_private_draft_tombstones_pkey'),
  ('expense_sql159_install_baseline_pkey')
), target_index_state AS (
  SELECT pg_catalog.count(*) FILTER (
    WHERE pg_catalog.to_regclass('public.' || target_indexes.name)
      IS NOT NULL
  )::integer AS present_count,
  COALESCE(pg_catalog.array_agg(target_indexes.name
    ORDER BY target_indexes.name COLLATE pg_catalog."C") FILTER (
      WHERE pg_catalog.to_regclass('public.' || target_indexes.name)
        IS NOT NULL
    ), ARRAY[]::text[]) AS present_names
  FROM target_indexes
), target_entries(name) AS (VALUES
  ('expense_finalize_private_draft'),
  ('expense_get_private_draft_publication_lifecycle'),
  ('expense_get_shared_draft_detail'),
  ('expense_list_group_shared_drafts'),
  ('expense_list_visible_shared_drafts'),
  ('expense_share_private_draft'),
  ('expense_unshare_private_draft'),
  ('teskeid_event_get_expense_pre_active_v1')
), target_entry_observed AS (
  SELECT target_entries.name,
    pg_catalog.count(function_row.oid)::integer AS overload_count
  FROM target_entries
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.pronamespace = pg_catalog.to_regnamespace('public')
   AND function_row.proname = target_entries.name
  GROUP BY target_entries.name
), target_entry_state AS (
  SELECT COALESCE(pg_catalog.bool_and(
      target_entry_observed.overload_count = 0
    ), false) AS all_absent,
    COALESCE(pg_catalog.bool_and(
      target_entry_observed.overload_count = 1
    ), false) AS all_single,
    pg_catalog.sum(target_entry_observed.overload_count)::integer
      AS function_count
  FROM target_entry_observed
), target_internal_state AS (
  SELECT pg_catalog.count(*)::integer AS function_count
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.pronamespace = pg_catalog.to_regnamespace('public')
    AND function_row.proname LIKE 'expense_sql159_%'
), target_triggers(name) AS (VALUES
  ('expense_sql159_finalized_draft_insert_guard'),
  ('expense_sql159_private_draft_delete_guard')
), target_trigger_observed AS (
  SELECT target_triggers.name,
    pg_catalog.count(trigger_row.oid)::integer AS trigger_count
  FROM target_triggers
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = target_triggers.name
  GROUP BY target_triggers.name
), target_trigger_state AS (
  SELECT COALESCE(pg_catalog.bool_and(
      target_trigger_observed.trigger_count = 0
    ), false) AS all_absent,
    COALESCE(pg_catalog.bool_and(
      target_trigger_observed.trigger_count = 1
    ), false) AS all_single,
    pg_catalog.sum(target_trigger_observed.trigger_count)::integer
      AS trigger_count
  FROM target_trigger_observed
), target_state AS (
  SELECT target_relation_state.present_count = 0
      AND target_index_state.present_count = 0
      AND target_entry_state.all_absent
      AND target_internal_state.function_count = 0
      AND target_trigger_state.all_absent AS targets_absent,
    target_relation_state.present_count = 6
      AND target_index_state.present_count = 18
      AND target_entry_state.all_single
      AND target_internal_state.function_count = 13
      AND target_trigger_state.all_single AS possible_prior_success,
    target_relation_state.present_count,
    target_index_state.present_count AS index_count,
    target_entry_state.function_count AS entry_function_count,
    target_internal_state.function_count AS internal_function_count,
    target_trigger_state.trigger_count
  FROM target_relation_state
  CROSS JOIN target_index_state
  CROSS JOIN target_entry_state
  CROSS JOIN target_internal_state
  CROSS JOIN target_trigger_state
), installed_expected_functions(
  signature, exact_arguments, source_hash, language_name, volatility,
  return_type, security_definer, service_execute
) AS (VALUES
  ('public.expense_sql159_amount_minor(text,text,boolean)','p_raw text, p_currency text, p_allow_zero boolean','5a4124296ff7e6f19d42342815be8109','plpgsql','i','bigint',false,false),
  ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)','p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint, p_split_confirmed boolean','14ac1abc9046fea4812ac652a9b96088','plpgsql','v','jsonb',true,true),
  ('public.expense_sql159_probe_event_id(uuid,uuid)','p_actor_id uuid, p_draft_id uuid','7600bd78711a0296ef545e0595c788b1','plpgsql','s','uuid',true,false),
  ('public.expense_sql159_event_scope_read_only(uuid,uuid)','p_actor_id uuid, p_event_id uuid','4ba9308ba12eef6405ed24916bc0bb74','plpgsql','s','jsonb',true,false),
  ('public.expense_sql159_event_scope_allows(uuid,uuid)','p_actor_id uuid, p_event_id uuid','0be29be5cda2d34bf41dc2f67e0afa2e','plpgsql','s','boolean',true,false),
  ('public.expense_sql159_audience_allows(uuid,uuid)','p_actor_id uuid, p_draft_id uuid','9c4af07a07906c4dac6f06da94b42b37','sql','s','boolean',true,false),
  ('public.expense_sql159_guard_private_draft_insert()','','739e7c5c77dc08aa64c352627f21120a','plpgsql','v','trigger',true,false),
  ('public.expense_sql159_guard_private_draft_delete()','','cd349b0ef1810c51deb229ae64eade33','plpgsql','v','trigger',true,false),
  ('public.expense_get_private_draft_publication_lifecycle(uuid,uuid)','p_actor_id uuid, p_draft_id uuid','16fd85b239a880a4c0c12c3b0a078151','plpgsql','s','jsonb',true,true),
  ('public.expense_share_private_draft(uuid,uuid,uuid,bigint,bigint)','p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint','ca805bbd38dbd013e1c034e0049432ec','plpgsql','v','jsonb',true,true),
  ('public.expense_unshare_private_draft(uuid,uuid,uuid,bigint,bigint)','p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint','9d440591ad52a108f3e6a5212722c1fa','plpgsql','v','jsonb',true,true),
  ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)','p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean','18a6e628bdb1d3c175b515541ab56787','plpgsql','v','jsonb',true,false),
  ('public.expense_sql159_percentage_basis_points(text)','p_raw text','ad0deb049185b7f6519bc0c3154201ac','plpgsql','i','bigint',false,false),
  ('public.expense_sql159_weight(text)','p_raw text','c29cee4a8de2c95e138aad00af3fd4fe','plpgsql','i','bigint',false,false),
  ('public.expense_sql159_allocate_weighted(bigint,jsonb,bigint)','p_total_minor bigint, p_weights jsonb, p_expected_weight_total bigint','7d38f3ac0f65a2b16aac5a53c9a09e8f','plpgsql','i','jsonb',false,false),
  ('public.expense_sql159_snapshot_is_valid(uuid)','p_draft_id uuid','af4b9f8a5f0b422956fc1d664021baff','sql','s','boolean',true,false),
  ('public.expense_sql159_private_event_summary(uuid,uuid,uuid)','p_actor_id uuid, p_draft_id uuid, p_event_id uuid','e75a609fc4f231b0cfda3d5fb2679d9b','plpgsql','s','jsonb',true,false),
  ('public.expense_list_visible_shared_drafts(uuid)','p_actor_id uuid','59b01785320ce254fb4ac7d6168709bc','plpgsql','v','jsonb',true,true),
  ('public.expense_get_shared_draft_detail(uuid,uuid)','p_actor_id uuid, p_publication_id uuid','51a607ab9bc5e5ad5a19f4b9d96aa00b','plpgsql','v','jsonb',true,true),
  ('public.expense_list_group_shared_drafts(uuid,uuid)','p_actor_id uuid, p_group_id uuid','0a06c9d47c9c17dad77c715fbef50d55','plpgsql','v','jsonb',true,true),
  ('public.teskeid_event_get_expense_pre_active_v1(uuid,uuid)','p_actor_id uuid, p_event_id uuid','4332f4ccfd5e58f2e17ebe9389c13311','plpgsql','v','jsonb',true,true)
), installed_function_checks AS (
  SELECT installed_expected_functions.*,
    function_row.oid AS function_oid,
    pg_catalog.md5(pg_catalog.replace(
      function_row.prosrc, E'\r\n', E'\n'
    )) AS actual_source_hash,
    COALESCE(
      function_row.oid IS NOT NULL
      AND function_row.prokind = 'f'
      AND (SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_proc AS overload
           WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
             AND overload.proname = function_row.proname) = 1
      AND pg_catalog.pg_get_function_arguments(function_row.oid) =
            installed_expected_functions.exact_arguments
      AND COALESCE(function_row.proargnames::text[], ARRAY[]::text[]) =
            ARRAY(
              SELECT argument_match[1]::text
              FROM pg_catalog.regexp_matches(
                installed_expected_functions.exact_arguments,
                '(?:^|, )([a-z_][a-z0-9_]*) ',
                'g'
              ) AS argument_match
            )::text[]
      AND pg_catalog.format_type(function_row.prorettype, NULL) =
            installed_expected_functions.return_type
      AND NOT function_row.proretset
      AND function_row.provolatile::text =
            installed_expected_functions.volatility
      AND function_row.prosecdef =
            installed_expected_functions.security_definer
      AND NOT function_row.proisstrict
      AND NOT function_row.proleakproof
      AND function_row.proparallel = 'u'
      AND function_row.pronargdefaults = 0
      AND function_row.proargdefaults IS NULL
      AND function_row.proallargtypes IS NULL
      AND function_row.proargmodes IS NULL
      AND language_row.lanname = installed_expected_functions.language_name
      AND function_row.proconfig::text[] = ARRAY['search_path=""']::text[]
      AND pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
      AND pg_catalog.md5(pg_catalog.replace(
            function_row.prosrc, E'\r\n', E'\n'
          )) = installed_expected_functions.source_hash
      AND (SELECT pg_catalog.count(*) = CASE
             WHEN installed_expected_functions.service_execute THEN 2 ELSE 1
           END
           FROM pg_catalog.aclexplode(COALESCE(
             function_row.proacl,
             pg_catalog.acldefault('f', function_row.proowner)
           )) AS privilege
           LEFT JOIN pg_catalog.pg_roles AS grantee_role
             ON grantee_role.oid = privilege.grantee
           WHERE privilege.privilege_type = 'EXECUTE'
             AND privilege.grantor = function_row.proowner
             AND NOT privilege.is_grantable
             AND (privilege.grantee = function_row.proowner
               OR (installed_expected_functions.service_execute
                 AND grantee_role.rolname = 'service_role')))
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> function_row.proowner
           OR privilege.is_grantable
           OR privilege.grantee = 0
           OR (privilege.grantee <> function_row.proowner
             AND (NOT installed_expected_functions.service_execute
               OR grantee_role.rolname IS DISTINCT FROM 'service_role'))
      ), false
    ) AS function_exact
  FROM installed_expected_functions
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = pg_catalog.to_regprocedure(
      installed_expected_functions.signature
    )
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = function_row.prolang
), installed_function_contract AS (
  SELECT pg_catalog.count(*) = 21
    AND COALESCE(pg_catalog.bool_and(
      installed_function_checks.function_exact
    ), false)
    AND (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_proc AS actual_function
         WHERE actual_function.pronamespace =
               pg_catalog.to_regnamespace('public')
           AND (
             actual_function.proname LIKE 'expense_sql159_%'
             OR actual_function.proname IN (
               'expense_finalize_private_draft',
               'expense_share_private_draft',
               'expense_unshare_private_draft',
               'expense_get_private_draft_publication_lifecycle',
               'expense_list_visible_shared_drafts',
               'expense_get_shared_draft_detail',
               'expense_list_group_shared_drafts',
               'teskeid_event_get_expense_pre_active_v1'
             )
           )) = 21 AS functions_exact
  FROM installed_function_checks
), installed_relation_checks AS (
  SELECT target_relations.name,
    class_row.oid AS relation_oid,
    COALESCE(
      class_row.oid IS NOT NULL
      AND namespace_row.nspname = 'public'
      AND class_row.relkind = 'r'
      AND class_row.relpersistence = 'p'
      AND NOT class_row.relispartition
      AND class_row.relrowsecurity
      AND class_row.relforcerowsecurity
      AND class_row.relreplident = 'd'
      AND class_row.reltablespace = 0
      AND pg_catalog.cardinality(COALESCE(
            class_row.reloptions, ARRAY[]::text[]
          )) = 0
      AND pg_catalog.pg_get_userbyid(class_row.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid = class_row.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = class_row.oid
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      )
      AND (SELECT pg_catalog.count(*) = 7 + CASE
             WHEN pg_catalog.current_setting('server_version_num')::integer >=
                  170000 THEN 1 ELSE 0 END
           FROM pg_catalog.aclexplode(COALESCE(
             class_row.relacl,
             pg_catalog.acldefault('r', class_row.relowner)
           )) AS privilege
           WHERE privilege.grantee = class_row.relowner
             AND privilege.grantor = class_row.relowner
             AND NOT privilege.is_grantable
             AND privilege.privilege_type IN (
               'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
               'TRIGGER','MAINTAIN'
             ))
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          class_row.relacl,
          pg_catalog.acldefault('r', class_row.relowner)
        )) AS privilege
        WHERE privilege.grantee <> class_row.relowner
           OR privilege.grantor <> class_row.relowner
           OR privilege.is_grantable
           OR privilege.privilege_type NOT IN (
             'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
             'TRIGGER','MAINTAIN'
           )
      ), false
    ) AS relation_exact
  FROM target_relations
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass('public.' || target_relations.name)
  LEFT JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = class_row.relnamespace
), installed_relation_contract AS (
  SELECT pg_catalog.count(*) = 6
    AND COALESCE(pg_catalog.bool_and(
      installed_relation_checks.relation_exact
    ), false) AS relations_exact
  FROM installed_relation_checks
), installed_expected_columns(
  relation_name, column_name, ordinal_position, type_name,
  is_not_null, default_expression
) AS (VALUES
  ('expense_unconfirmed_publications','draft_id',1,'uuid',true,NULL::text),
  ('expense_unconfirmed_publications','publication_id',2,'uuid',true,NULL::text),
  ('expense_unconfirmed_publications','actor_user_id',3,'uuid',true,NULL::text),
  ('expense_unconfirmed_publications','publication_version',4,'bigint',true,NULL::text),
  ('expense_unconfirmed_publications','is_live',5,'boolean',true,NULL::text),
  ('expense_unconfirmed_publications','source_draft_version',6,'bigint',false,NULL::text),
  ('expense_unconfirmed_publications','shareable_fingerprint',7,'text',false,NULL::text),
  ('expense_unconfirmed_publications','authority_fingerprint',8,'text',false,NULL::text),
  ('expense_unconfirmed_publications','context_type',9,'text',false,NULL::text),
  ('expense_unconfirmed_publications','group_id',10,'uuid',false,NULL::text),
  ('expense_unconfirmed_publications','event_id',11,'uuid',false,NULL::text),
  ('expense_unconfirmed_publications','event_roster_revision',12,'bigint',false,NULL::text),
  ('expense_unconfirmed_publications','link_to_event',13,'boolean',false,NULL::text),
  ('expense_unconfirmed_publications','visibility',14,'text',false,NULL::text),
  ('expense_unconfirmed_publications','title',15,'text',false,NULL::text),
  ('expense_unconfirmed_publications','total_minor',16,'bigint',false,NULL::text),
  ('expense_unconfirmed_publications','currency',17,'text',false,NULL::text),
  ('expense_unconfirmed_publications','incurred_on',18,'date',false,NULL::text),
  ('expense_unconfirmed_publications','allocation_state',19,'text',false,NULL::text),
  ('expense_unconfirmed_publications','created_at',20,'timestamp with time zone',true,'now()'),
  ('expense_unconfirmed_publications','published_at',21,'timestamp with time zone',false,NULL::text),
  ('expense_unconfirmed_publications','updated_at',22,'timestamp with time zone',true,'now()'),
  ('expense_unconfirmed_publications','withdrawn_at',23,'timestamp with time zone',false,NULL::text),
  ('expense_unconfirmed_publication_parties','draft_id',1,'uuid',true,NULL::text),
  ('expense_unconfirmed_publication_parties','allocation_state',2,'text',true,NULL::text),
  ('expense_unconfirmed_publication_parties','ordinal',3,'smallint',true,NULL::text),
  ('expense_unconfirmed_publication_parties','party_key_hash',4,'text',true,NULL::text),
  ('expense_unconfirmed_publication_parties','identity_token_hash',5,'text',true,NULL::text),
  ('expense_unconfirmed_publication_parties','display_name',6,'text',true,NULL::text),
  ('expense_unconfirmed_publication_parties','is_author',7,'boolean',true,NULL::text),
  ('expense_unconfirmed_publication_parties','is_payer',8,'boolean',true,NULL::text),
  ('expense_unconfirmed_publication_parties','is_participant',9,'boolean',true,NULL::text),
  ('expense_unconfirmed_publication_parties','paid_minor',10,'bigint',false,NULL::text),
  ('expense_unconfirmed_publication_parties','share_minor',11,'bigint',false,NULL::text),
  ('expense_unconfirmed_publication_parties','created_at',12,'timestamp with time zone',true,'now()'),
  ('expense_unconfirmed_publication_audience','draft_id',1,'uuid',true,NULL::text),
  ('expense_unconfirmed_publication_audience','user_id',2,'uuid',true,NULL::text),
  ('expense_unconfirmed_publication_audience','audience_kind',3,'text',true,NULL::text),
  ('expense_unconfirmed_publication_audience','identity_token_hash',4,'text',false,NULL::text),
  ('expense_unconfirmed_publication_audience','binding_id',5,'uuid',false,NULL::text),
  ('expense_unconfirmed_publication_audience','binding_generation',6,'bigint',false,NULL::text),
  ('expense_unconfirmed_publication_audience','created_at',7,'timestamp with time zone',true,'now()'),
  ('expense_unconfirmed_finalizations','draft_id',1,'uuid',true,NULL::text),
  ('expense_unconfirmed_finalizations','actor_user_id',2,'uuid',true,NULL::text),
  ('expense_unconfirmed_finalizations','request_id',3,'uuid',true,NULL::text),
  ('expense_unconfirmed_finalizations','request_fingerprint',4,'text',true,NULL::text),
  ('expense_unconfirmed_finalizations','contract_version',5,'smallint',true,NULL::text),
  ('expense_unconfirmed_finalizations','expected_draft_version',6,'bigint',true,NULL::text),
  ('expense_unconfirmed_finalizations','expected_publication_version',7,'bigint',false,NULL::text),
  ('expense_unconfirmed_finalizations','final_publication_version',8,'bigint',false,NULL::text),
  ('expense_unconfirmed_finalizations','publication_id',9,'uuid',false,NULL::text),
  ('expense_unconfirmed_finalizations','shareable_fingerprint',10,'text',true,NULL::text),
  ('expense_unconfirmed_finalizations','allocation_fingerprint',11,'text',true,NULL::text),
  ('expense_unconfirmed_finalizations','group_id',12,'uuid',true,NULL::text),
  ('expense_unconfirmed_finalizations','expense_id',13,'uuid',true,NULL::text),
  ('expense_unconfirmed_finalizations','invitation_ids',14,'uuid[]',true,'ARRAY[]::uuid[]'),
  ('expense_unconfirmed_finalizations','finalized_at',15,'timestamp with time zone',true,'now()'),
  ('expense_private_draft_tombstones','draft_id',1,'uuid',true,NULL::text),
  ('expense_sql159_install_baseline','singleton',1,'boolean',true,'true'),
  ('expense_sql159_install_baseline','installed_at',2,'timestamp with time zone',true,'now()'),
  ('expense_sql159_install_baseline','predecessor_contract',3,'jsonb',true,NULL::text),
  ('expense_sql159_install_baseline','writer_set_digest',4,'text',true,NULL::text),
  ('expense_sql159_install_baseline','protected_count',5,'bigint',true,NULL::text),
  ('expense_sql159_install_baseline','protected_digest',6,'text',true,NULL::text),
  ('expense_sql159_install_baseline','request_count',7,'bigint',true,NULL::text),
  ('expense_sql159_install_baseline','request_digest',8,'text',true,NULL::text),
  ('expense_sql159_install_baseline','draft_count',9,'bigint',true,NULL::text),
  ('expense_sql159_install_baseline','draft_digest',10,'text',true,NULL::text),
  ('expense_sql159_install_baseline','new_relations_began_empty',11,'boolean',true,NULL::text)
), installed_column_checks AS (
  SELECT installed_expected_columns.relation_name,
    pg_catalog.count(*)::integer AS expected_count,
    pg_catalog.count(attribute_row.attnum)::integer AS matched_count,
    COALESCE(pg_catalog.bool_and(
      attribute_row.attnum = installed_expected_columns.ordinal_position
      AND pg_catalog.format_type(
            attribute_row.atttypid, attribute_row.atttypmod
          ) = installed_expected_columns.type_name
      AND attribute_row.attnotnull = installed_expected_columns.is_not_null
      AND attribute_row.attidentity = ''
      AND attribute_row.attgenerated = ''
      AND CASE
        WHEN installed_expected_columns.default_expression IS NULL
          THEN default_row.oid IS NULL
        WHEN installed_expected_columns.default_expression =
             'ARRAY[]::uuid[]'
          THEN pg_catalog.pg_get_expr(
            default_row.adbin, default_row.adrelid
          ) IN ('''{}''::uuid[]', 'ARRAY[]::uuid[]')
        ELSE pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid
        ) = installed_expected_columns.default_expression
      END
    ), false)
    AND (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_attribute AS actual_column
         WHERE actual_column.attrelid = pg_catalog.to_regclass(
                 'public.' || installed_expected_columns.relation_name
               )
           AND actual_column.attnum > 0
           AND NOT actual_column.attisdropped) = pg_catalog.count(*)
      AS columns_exact
  FROM installed_expected_columns
  LEFT JOIN pg_catalog.pg_attribute AS attribute_row
    ON attribute_row.attrelid = pg_catalog.to_regclass(
         'public.' || installed_expected_columns.relation_name
       )
   AND attribute_row.attname = installed_expected_columns.column_name
   AND attribute_row.attnum > 0
   AND NOT attribute_row.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
  GROUP BY installed_expected_columns.relation_name
), installed_column_contract AS (
  SELECT pg_catalog.count(*) = 6
    AND pg_catalog.sum(installed_column_checks.expected_count) = 69
    AND COALESCE(pg_catalog.bool_and(
      installed_column_checks.columns_exact
    ), false) AS columns_exact
  FROM installed_column_checks
), installed_expected_constraints(
  relation_name, constraint_name, constraint_type, definition_hash
) AS (VALUES
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_pkey','p','b4058e19e011ccaee7850ab94c1044a5'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_publication_id_key','u','299874551546e95df22927e50a98350a'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_actor_user_id_fkey','f','6131c774862c10a823af7ba6b1192b8d'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_version_check','c','06df78963f5b85fd5119e0b0f046b157'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_fingerprint_check','c','4f083a158631f785bc6a0d80da7a50b3'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_live_shape_check','c','feee2a41f0ffaae0b17c966d660c804b'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_actor_draft_key','u','de010360de522ead901612079bd112cf'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_state_key','u','24c66752643fdfdaf8333c17ebe8f1c2'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_pkey','p','ae43fa301373d86b446562e766acca67'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_publication_fk','f','b4817f9bc9ee70340911f3dc82ff216d'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_ordinal_check','c','29fcaccc806d7e7dae4130650fc9f1da'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_hash_check','c','bcbbd6c398d4dd152b167a0b8b82a13b'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_label_check','c','39da63c81460709caffeb3b1a9b4f159'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_role_check','c','c941a5a6597966b25666fc54a43a17ea'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_amount_check','c','9a5302a8cd82042e954105a8b84463e3'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_key_unique','u','0797e8937169ed322e56da55209e37c7'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_identity_unique','u','e81d903ad2a973cadd577542c9ba1c4b'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_draft_id_fkey','f','d9a73347b00b2e4ba22165b8afdf6b4e'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_pkey','p','6bb27bfdc4529fa0d9c8f148c49ec4b2'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_identity_unique','u','e81d903ad2a973cadd577542c9ba1c4b'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_party_fk','f','7a47b08171b7247c594ca55a565520a7'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_identity_check','c','fc2d8f9c7aa8ff5068025422891ef8b7'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_kind_check','c','14764ac5e0aa930916e3b0e6817ccea2'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_binding_check','c','8257d6a11ecd11d48ea373a0f1d2b25a'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_pkey','p','b4058e19e011ccaee7850ab94c1044a5'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_request_unique','u','aba99b1d3b6e40fb0fb7e0449b044d43'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_expense_unique','u','320a55b0bde8f2082187edbb93c238b3'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_expense_fk','f','f9fcec040b8a2063a93734232be2a101'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_contract_check','c','cc4075fa603396888e3fe646825a14fd'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_version_check','c','0c5bb09cd99c5ea49bef7de08471b9a8'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_publication_shape_check','c','30f36a0ab41468ec7ffc388ea3a33c09'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_fingerprint_check','c','f06dbe92905760569b3aa59b160b63fb'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_invitation_check','c','e4589f0560cdca40d4e8b6588776f520'),
  ('expense_private_draft_tombstones','expense_private_draft_tombstones_pkey','p','b4058e19e011ccaee7850ab94c1044a5'),
  ('expense_sql159_install_baseline','expense_sql159_install_baseline_pkey','p','a5d2a18ece87426426f4e5eb57cb3ca5'),
  ('expense_sql159_install_baseline','expense_sql159_install_baseline_singleton_check','c','dec8a6d8f1b7ec7ecab1f9efffecaa24'),
  ('expense_sql159_install_baseline','expense_sql159_install_baseline_digest_check','c','db203f92b1e8ccfefd82c29474db7983'),
  ('expense_sql159_install_baseline','expense_sql159_install_baseline_predecessor_check','c','bfaa7392286839174b0f90f91e347652')
), installed_constraint_observed AS (
  SELECT installed_expected_constraints.*,
    constraint_row.oid AS constraint_oid,
    constraint_row.contype::text AS actual_type,
    constraint_row.convalidated,
    constraint_row.condeferrable,
    constraint_row.condeferred,
    pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_row.oid),
        '::[a-z0-9_.]+(\[\])?', '', 'g'
      ), '[[:space:]()''"]', '', 'g'),
      'public.', ''
    ))) AS actual_definition_hash,
    COALESCE(
      constraint_row.oid IS NOT NULL
      AND constraint_row.contype::text =
            installed_expected_constraints.constraint_type
      AND constraint_row.convalidated
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
        pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          '::[a-z0-9_.]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'),
        'public.', ''
      ))) = installed_expected_constraints.definition_hash,
      false
    ) AS constraint_exact
  FROM installed_expected_constraints
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
         'public.' || installed_expected_constraints.relation_name
       )
   AND constraint_row.conname =
         installed_expected_constraints.constraint_name
), installed_constraint_contract AS (
  SELECT pg_catalog.count(*) = 38
    AND COALESCE(pg_catalog.bool_and(
      installed_constraint_observed.constraint_exact
    ), false)
    AND (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_constraint AS actual_constraint
         WHERE actual_constraint.conrelid = ANY(ARRAY[
           pg_catalog.to_regclass('public.expense_unconfirmed_publications'),
           pg_catalog.to_regclass('public.expense_unconfirmed_publication_parties'),
           pg_catalog.to_regclass('public.expense_unconfirmed_publication_audience'),
           pg_catalog.to_regclass('public.expense_unconfirmed_finalizations'),
           pg_catalog.to_regclass('public.expense_private_draft_tombstones'),
           pg_catalog.to_regclass('public.expense_sql159_install_baseline')
         ]::oid[])
           AND actual_constraint.contype IN ('c','f','p','u','x')) = 38
      AS constraints_exact
  FROM installed_constraint_observed
), installed_expected_indexes(
  relation_name, index_name, unique_index, primary_index,
  partial_index, definition_hash
) AS (VALUES
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_pkey',true,true,false,'1c6184de6574cbafd26012ad5812e474'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_publication_id_key',true,false,false,'634779615360a05356a6ab14fcb39908'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_actor_draft_key',true,false,false,'4d650e9705b04fdfd2ce8567ffc1e668'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_state_key',true,false,false,'63180f17f72d3064bb0fac72ebc560e2'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_actor_live_idx',false,false,false,'f3a2620654a7cf09a29418c60db68065'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_event_live_idx',false,false,true,'5390892591092fc4cec6862de34978bf'),
  ('expense_unconfirmed_publications','expense_unconfirmed_publications_group_live_idx',false,false,true,'51ae7b6f3d0618bc7ea07c7f1ed3736d'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_pkey',true,true,false,'b33d15b5f09b24ad894e60abec825e41'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_key_unique',true,false,false,'d9b8f889f2a820f666da86e0646b9c69'),
  ('expense_unconfirmed_publication_parties','expense_unconfirmed_publication_parties_identity_unique',true,false,false,'6644851d9cd3e1771935b1daeb434e56'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_pkey',true,true,false,'01739397cb86cc9e482a6976a4a5440b'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_identity_unique',true,false,false,'8391b98018e139355af209b2ecb79d33'),
  ('expense_unconfirmed_publication_audience','expense_unconfirmed_publication_audience_user_idx',false,false,false,'be5c147c730ba380c5110640a3778821'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_pkey',true,true,false,'7fb085a1ed0968026aac3fdef3091b69'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_request_unique',true,false,false,'ac6a239afda40fab6d9be242ec80cfc1'),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_expense_unique',true,false,false,'9d9f96a302e8a51486750f5a779099b3'),
  ('expense_private_draft_tombstones','expense_private_draft_tombstones_pkey',true,true,false,'bb23ad572612b55a000f59c8157c4354'),
  ('expense_sql159_install_baseline','expense_sql159_install_baseline_pkey',true,true,false,'f72846228b34d61061f93fcacfd857c9')
), installed_index_checks AS (
  SELECT installed_expected_indexes.*,
    index_row.indexrelid AS index_oid,
    pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(
        pg_catalog.pg_get_indexdef(index_row.indexrelid),
        '::[a-z0-9_.]+(\[\])?', '', 'g'
      ), '[[:space:]()''"]', '', 'g'),
      'public.', ''
    ))) AS actual_definition_hash,
    COALESCE(
      index_row.indexrelid IS NOT NULL
      AND index_row.indrelid = pg_catalog.to_regclass(
            'public.' || installed_expected_indexes.relation_name
          )
      AND index_row.indisunique = installed_expected_indexes.unique_index
      AND index_row.indisprimary = installed_expected_indexes.primary_index
      AND NOT index_row.indisexclusion
      AND index_row.indimmediate
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indislive
      AND NOT index_row.indcheckxmin
      AND NOT index_row.indisclustered
      AND NOT index_row.indisreplident
      AND NOT index_row.indnullsnotdistinct
      AND (index_row.indpred IS NOT NULL) =
            installed_expected_indexes.partial_index
      AND index_row.indexprs IS NULL
      AND access_method.amname = 'btree'
      AND pg_catalog.pg_get_userbyid(index_class.relowner) = 'postgres'
      AND index_class.reltablespace = 0
      AND index_class.relacl IS NULL
      AND pg_catalog.cardinality(COALESCE(
            index_class.reloptions, ARRAY[]::text[]
          )) = 0
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
        pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_row.indexrelid),
          '::[a-z0-9_.]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'),
        'public.', ''
      ))) = installed_expected_indexes.definition_hash,
      false
    ) AS index_exact
  FROM installed_expected_indexes
  LEFT JOIN pg_catalog.pg_index AS index_row
    ON index_row.indexrelid = pg_catalog.to_regclass(
      'public.' || installed_expected_indexes.index_name
    )
  LEFT JOIN pg_catalog.pg_class AS index_class
    ON index_class.oid = index_row.indexrelid
  LEFT JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_class.relam
), installed_index_contract AS (
  SELECT pg_catalog.count(*) = 18
    AND COALESCE(pg_catalog.bool_and(
      installed_index_checks.index_exact
    ), false)
    AND (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_index AS index_row
         WHERE index_row.indrelid = ANY(ARRAY[
           pg_catalog.to_regclass('public.expense_unconfirmed_publications'),
           pg_catalog.to_regclass('public.expense_unconfirmed_publication_parties'),
           pg_catalog.to_regclass('public.expense_unconfirmed_publication_audience'),
           pg_catalog.to_regclass('public.expense_unconfirmed_finalizations'),
           pg_catalog.to_regclass('public.expense_private_draft_tombstones'),
           pg_catalog.to_regclass('public.expense_sql159_install_baseline')
         ]::oid[])
         ) = 18 AS indexes_exact
  FROM installed_index_checks
), installed_expected_triggers(
  trigger_name, trigger_type, function_signature, definition_hash
) AS (VALUES
  ('expense_sql159_finalized_draft_insert_guard',7::smallint,'public.expense_sql159_guard_private_draft_insert()','b076317a6d1700ebc03b31b2f10c143a'),
  ('expense_sql159_private_draft_delete_guard',11::smallint,'public.expense_sql159_guard_private_draft_delete()','c733667c9d426714efa7bf8eee5d7cf5')
), installed_trigger_observed AS (
  SELECT installed_expected_triggers.*,
    trigger_row.oid AS trigger_oid,
    trigger_row.tgrelid,
    trigger_row.tgfoid,
    trigger_row.tgtype AS actual_trigger_type,
    trigger_row.tgenabled,
    pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(
        pg_catalog.pg_get_triggerdef(trigger_row.oid),
        '::[a-z0-9_.]+(\[\])?', '', 'g'
      ), '[[:space:]()''"]', '', 'g'),
      'public.', ''
    ))) AS actual_definition_hash,
    COALESCE(
      trigger_row.oid IS NOT NULL
      AND trigger_row.tgrelid = pg_catalog.to_regclass(
            'public.expense_private_drafts'
          )
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
            installed_expected_triggers.function_signature
          )
      AND trigger_row.tgtype = installed_expected_triggers.trigger_type
      AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgconstraint = 0
      AND trigger_row.tgnargs = 0
      AND pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 0
      AND trigger_row.tgqual IS NULL
      AND trigger_row.tgoldtable IS NULL
      AND trigger_row.tgnewtable IS NULL
      AND NOT trigger_row.tgisinternal
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.replace(
        pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          pg_catalog.pg_get_triggerdef(trigger_row.oid),
          '::[a-z0-9_.]+(\[\])?', '', 'g'
        ), '[[:space:]()''"]', '', 'g'),
        'public.', ''
      ))) = installed_expected_triggers.definition_hash,
      false
    ) AS trigger_exact
  FROM installed_expected_triggers
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgname = installed_expected_triggers.trigger_name
   AND NOT trigger_row.tgisinternal
), installed_trigger_contract AS (
  SELECT pg_catalog.count(*) = 2
    AND COALESCE(pg_catalog.bool_and(
      installed_trigger_observed.trigger_exact
    ), false)
    AND (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_trigger AS actual_trigger
         WHERE actual_trigger.tgname IN (
            'expense_sql159_finalized_draft_insert_guard',
            'expense_sql159_private_draft_delete_guard'
          )) = 2 AS triggers_exact
  FROM installed_trigger_observed
), installed_target_row_counts AS (
  SELECT target_relations.name,
    CASE WHEN class_row.oid IS NULL OR class_row.relkind <> 'r' THEN NULL
      ELSE ((pg_catalog.xpath(
        '/table/row/row_count/text()',
        pg_catalog.query_to_xml(pg_catalog.format(
          'SELECT pg_catalog.count(*) AS row_count FROM %I.%I',
          'public', target_relations.name
        ), false, false, '')
      ))[1]::text)::bigint END AS row_count
  FROM target_relations
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass('public.' || target_relations.name)
), protected_rows(kind, row_hash) AS MATERIALIZED (
  SELECT 'expense_groups', pg_catalog.md5(pg_catalog.to_jsonb(group_row)::text)
  FROM public.expense_groups AS group_row
  UNION ALL
  SELECT 'expense_group_members', pg_catalog.md5(pg_catalog.to_jsonb(member_row)::text)
  FROM public.expense_group_members AS member_row
  UNION ALL
  SELECT 'expenses', pg_catalog.md5(pg_catalog.to_jsonb(expense_row)::text)
  FROM public.expenses AS expense_row
  UNION ALL
  SELECT 'expense_payments', pg_catalog.md5(pg_catalog.to_jsonb(payment_row)::text)
  FROM public.expense_payments AS payment_row
  UNION ALL
  SELECT 'expense_shares', pg_catalog.md5(pg_catalog.to_jsonb(share_row)::text)
  FROM public.expense_shares AS share_row
  UNION ALL
  SELECT 'expense_obligations', pg_catalog.md5(pg_catalog.to_jsonb(obligation_row)::text)
  FROM public.expense_obligations AS obligation_row
  UNION ALL
  SELECT 'teskeid_event_expense_links', pg_catalog.md5(pg_catalog.to_jsonb(link_row)::text)
  FROM public.teskeid_event_expense_links AS link_row
), protected_evidence AS (
  SELECT pg_catalog.count(*)::bigint AS protected_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      protected_rows.kind || ':' || protected_rows.row_hash, E'\n'
      ORDER BY protected_rows.kind COLLATE pg_catalog."C",
        protected_rows.row_hash COLLATE pg_catalog."C"
    ), '')) AS protected_digest
  FROM protected_rows
), request_rows(kind, row_hash) AS MATERIALIZED (
  SELECT 'expense_mutation_requests',
    pg_catalog.md5(pg_catalog.to_jsonb(request_row)::text)
  FROM public.expense_mutation_requests AS request_row
  UNION ALL
  SELECT 'teskeid_event_mutation_requests',
    pg_catalog.md5(pg_catalog.to_jsonb(event_request_row)::text)
  FROM public.teskeid_event_mutation_requests AS event_request_row
), request_evidence AS (
  SELECT pg_catalog.count(*)::bigint AS request_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      request_rows.kind || ':' || request_rows.row_hash, E'\n'
      ORDER BY request_rows.kind COLLATE pg_catalog."C",
        request_rows.row_hash COLLATE pg_catalog."C"
    ), '')) AS request_digest
  FROM request_rows
), draft_evidence AS (
  SELECT pg_catalog.count(*)::bigint AS draft_count,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(
      pg_catalog.md5(pg_catalog.to_jsonb(draft_row)::text), E'\n'
      ORDER BY pg_catalog.md5(pg_catalog.to_jsonb(draft_row)::text)
        COLLATE pg_catalog."C"
    ), '')) AS draft_digest
  FROM public.expense_private_drafts AS draft_row
), baseline_predecessor_expected(signature, is_writer) AS (VALUES
  ('public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)', true),
  ('public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)', true),
  ('public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', true),
  ('public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)', true),
  ('public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)', true),
  ('public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)', true),
  ('public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)', true),
  ('public.expense_has_beta_access(uuid)', false),
  ('public.expense_assert_beta_actor(uuid)', false),
  ('public.expense_active_member_role(uuid,uuid)', false),
  ('public.expense_begin_request(uuid,uuid,text,text)', false),
  ('public.expense_finish_request(uuid,uuid,jsonb)', false),
  ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)', false),
  ('public.expense_identity_request_id(text,uuid)', false),
  ('public.teskeid_event_assert_session_actor(uuid)', false),
  ('public.teskeid_event_assert_actor(uuid)', false),
  ('public.teskeid_event_assert_financial_actor(uuid)', false),
  ('public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)', false),
  ('public.teskeid_event_finish_request(uuid,uuid,jsonb)', false),
  ('public.teskeid_event_private_scope_v3(uuid,uuid)', false),
  ('public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)', false),
  ('public.teskeid_event_uuid_from_text(text)', false),
  ('public.normalize_email_canonical(text)', false),
  ('public.teskeid_event_normalize_text(text)', false),
  ('public.teskeid_event_valid_text(text,integer,integer)', false),
  ('public.teskeid_event_private_normalize_shared_name_v2(text)', false),
  ('public.teskeid_event_private_valid_shared_name_v2(text)', false),
  ('public.teskeid_event_private_valid_canonical_email_v2(text)', false),
  ('public.teskeid_event_private_safe_profile_name_v2(uuid)', false),
  ('public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)', false),
  ('public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)', false),
  ('public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)', false)
), baseline_predecessor_facts AS MATERIALIZED (
  SELECT baseline_predecessor_expected.signature,
    baseline_predecessor_expected.is_writer,
    function_observed.function_oid,
    function_observed.actual_owner AS owner_name,
    function_observed.actual_source_hash AS source_hash,
    COALESCE(function_observed.proconfig, ARRAY[]::text[])::text[]
      AS proconfig,
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
          ELSE grantee_role.rolname END
        ORDER BY (CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
          ELSE grantee_role.rolname END) COLLATE pg_catalog."C"
      )
      FROM pg_catalog.aclexplode(COALESCE(
        function_observed.proacl,
        pg_catalog.acldefault('f', function_observed.proowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = privilege.grantee
      WHERE privilege.privilege_type = 'EXECUTE'
    ), '[]'::jsonb) AS execute_grantees
  FROM baseline_predecessor_expected
  LEFT JOIN function_observed
    ON function_observed.signature = baseline_predecessor_expected.signature
), baseline_predecessor_json AS (
  SELECT pg_catalog.count(*) = 32
      AND pg_catalog.count(baseline_predecessor_facts.function_oid) = 32
      AS predecessor_count_exact,
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'signature', baseline_predecessor_facts.signature,
        'owner', baseline_predecessor_facts.owner_name,
        'source_hash', baseline_predecessor_facts.source_hash,
        'proconfig', pg_catalog.to_jsonb(
          baseline_predecessor_facts.proconfig
        ),
        'execute_grantees', baseline_predecessor_facts.execute_grantees
      ) ORDER BY baseline_predecessor_facts.signature COLLATE pg_catalog."C"
    ), '[]'::jsonb) AS value
  FROM baseline_predecessor_facts
), baseline_writer_digest AS (
  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    baseline_predecessor_facts.signature || '|' ||
      baseline_predecessor_facts.owner_name || '|' ||
      baseline_predecessor_facts.source_hash || '|' ||
      baseline_predecessor_facts.proconfig::text || '|' ||
      baseline_predecessor_facts.execute_grantees::text,
    E'\n' ORDER BY baseline_predecessor_facts.signature COLLATE pg_catalog."C"
  ), '')) AS value
  FROM baseline_predecessor_facts
  WHERE baseline_predecessor_facts.is_writer
), installed_baseline_xml AS (
  SELECT CASE
    WHEN baseline_relation.oid IS NOT NULL
      AND baseline_relation.relkind = 'r'
      AND baseline_columns.columns_exact
      AND baseline_rows.row_count = 1
    THEN pg_catalog.query_to_xml(pg_catalog.format($baseline_query$
      SELECT singleton,
        installed_at IS NOT NULL AS installed_at_present,
        new_relations_began_empty,
        CASE WHEN pg_catalog.jsonb_typeof(predecessor_contract) = 'array'
          THEN pg_catalog.jsonb_array_length(predecessor_contract) = 32
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements(predecessor_contract)
              AS contract_item(value)
            WHERE CASE
              WHEN pg_catalog.jsonb_typeof(contract_item.value) = 'object'
              THEN contract_item.value - ARRAY[
                    'signature','owner','source_hash','proconfig',
                    'execute_grantees'
                  ]::text[] <> '{}'::jsonb
               OR NOT (contract_item.value ?& ARRAY[
                    'signature','owner','source_hash','proconfig',
                    'execute_grantees'
                  ]::text[])
               OR pg_catalog.jsonb_typeof(
                    contract_item.value->'signature'
                  ) <> 'string'
               OR pg_catalog.jsonb_typeof(
                    contract_item.value->'owner'
                  ) <> 'string'
               OR contract_item.value->>'source_hash'
                    !~ '^[0-9a-f]{32}$'
               OR pg_catalog.jsonb_typeof(
                    contract_item.value->'proconfig'
                  ) <> 'array'
               OR pg_catalog.jsonb_typeof(
                    contract_item.value->'execute_grantees'
                  ) <> 'array'
              ELSE true
            END
          ) ELSE false END AS predecessor_shape_exact,
        predecessor_contract = %L::jsonb AS predecessor_exact,
        pg_catalog.md5(predecessor_contract::text)
          AS actual_predecessor_digest,
        writer_set_digest = %L AS writer_digest_exact,
        writer_set_digest AS actual_writer_digest,
        protected_count = %s AS protected_count_exact,
        protected_count AS actual_protected_count,
        protected_digest = %L AS protected_digest_exact,
        protected_digest AS actual_protected_digest,
        request_count = %s AS request_count_exact,
        request_count AS actual_request_count,
        request_digest = %L AS request_digest_exact,
        request_digest AS actual_request_digest,
        draft_count = %s AS draft_count_exact,
        draft_count AS actual_draft_count,
        draft_digest = %L AS draft_digest_exact,
        draft_digest AS actual_draft_digest
      FROM public.expense_sql159_install_baseline
    $baseline_query$,
      baseline_predecessor_json.value::text,
      baseline_writer_digest.value,
      protected_evidence.protected_count,
      protected_evidence.protected_digest,
      request_evidence.request_count,
      request_evidence.request_digest,
      draft_evidence.draft_count,
      draft_evidence.draft_digest
    ), false, false, '')
    ELSE NULL::xml
  END AS evidence_xml
  FROM (SELECT pg_catalog.to_regclass(
    'public.expense_sql159_install_baseline'
  ) AS relation_oid) AS baseline_target
  LEFT JOIN pg_catalog.pg_class AS baseline_relation
    ON baseline_relation.oid = baseline_target.relation_oid
  JOIN installed_column_checks AS baseline_columns
    ON baseline_columns.relation_name = 'expense_sql159_install_baseline'
  JOIN installed_target_row_counts AS baseline_rows
    ON baseline_rows.name = 'expense_sql159_install_baseline'
  CROSS JOIN baseline_predecessor_json
  CROSS JOIN baseline_writer_digest
  CROSS JOIN protected_evidence
  CROSS JOIN request_evidence
  CROSS JOIN draft_evidence
), installed_baseline_observed AS (
  SELECT COALESCE(((pg_catalog.xpath(
      '/table/row/singleton/text()', installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS singleton,
    COALESCE(((pg_catalog.xpath(
      '/table/row/installed_at_present/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS installed_at_present,
    COALESCE(((pg_catalog.xpath(
      '/table/row/new_relations_began_empty/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS new_relations_began_empty,
    COALESCE(((pg_catalog.xpath(
      '/table/row/predecessor_shape_exact/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS predecessor_shape_exact,
    COALESCE(((pg_catalog.xpath(
      '/table/row/predecessor_exact/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS predecessor_exact,
    NULLIF((pg_catalog.xpath(
      '/table/row/actual_predecessor_digest/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text, '') AS actual_predecessor_digest,
    COALESCE(((pg_catalog.xpath(
      '/table/row/writer_digest_exact/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS writer_digest_exact,
    NULLIF((pg_catalog.xpath(
      '/table/row/actual_writer_digest/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text, '') AS actual_writer_digest,
    COALESCE(((pg_catalog.xpath(
      '/table/row/protected_count_exact/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS protected_count_exact,
    NULLIF((pg_catalog.xpath(
      '/table/row/actual_protected_count/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text, '')::bigint AS actual_protected_count,
    COALESCE(((pg_catalog.xpath(
      '/table/row/protected_digest_exact/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS protected_digest_exact,
    NULLIF((pg_catalog.xpath(
      '/table/row/actual_protected_digest/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text, '') AS actual_protected_digest,
    COALESCE(((pg_catalog.xpath(
      '/table/row/request_count_exact/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS request_count_exact,
    NULLIF((pg_catalog.xpath(
      '/table/row/actual_request_count/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text, '')::bigint AS actual_request_count,
    COALESCE(((pg_catalog.xpath(
      '/table/row/request_digest_exact/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS request_digest_exact,
    NULLIF((pg_catalog.xpath(
      '/table/row/actual_request_digest/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text, '') AS actual_request_digest,
    COALESCE(((pg_catalog.xpath(
      '/table/row/draft_count_exact/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS draft_count_exact,
    NULLIF((pg_catalog.xpath(
      '/table/row/actual_draft_count/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text, '')::bigint AS actual_draft_count,
    COALESCE(((pg_catalog.xpath(
      '/table/row/draft_digest_exact/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text)::boolean, false) AS draft_digest_exact,
    NULLIF((pg_catalog.xpath(
      '/table/row/actual_draft_digest/text()',
      installed_baseline_xml.evidence_xml
    ))[1]::text, '') AS actual_draft_digest
  FROM installed_baseline_xml
), installed_baseline_contract AS (
  SELECT baseline_predecessor_json.predecessor_count_exact
    AND installed_baseline_observed.singleton
    AND installed_baseline_observed.installed_at_present
    AND installed_baseline_observed.new_relations_began_empty
    AND installed_baseline_observed.predecessor_shape_exact
    AND installed_baseline_observed.predecessor_exact
    AND installed_baseline_observed.writer_digest_exact
    AND installed_baseline_observed.protected_count_exact
    AND installed_baseline_observed.protected_digest_exact
    AND installed_baseline_observed.request_count_exact
    AND installed_baseline_observed.request_digest_exact
    AND installed_baseline_observed.draft_count_exact
    AND installed_baseline_observed.draft_digest_exact AS baseline_exact
  FROM installed_baseline_observed
  CROSS JOIN baseline_predecessor_json
), installed_target_data_contract AS (
  SELECT COALESCE(pg_catalog.bool_and(
    installed_target_row_counts.row_count = CASE
      WHEN installed_target_row_counts.name =
        'expense_sql159_install_baseline' THEN 1 ELSE 0 END
  ), false) AS target_row_counts_exact
  FROM installed_target_row_counts
), exact_installed_state AS (
  SELECT installed_relation_contract.relations_exact
    AND installed_column_contract.columns_exact
    AND installed_constraint_contract.constraints_exact
    AND installed_index_contract.indexes_exact
    AND installed_function_contract.functions_exact
    AND installed_trigger_contract.triggers_exact
    AND installed_baseline_contract.baseline_exact
    AND installed_target_data_contract.target_row_counts_exact
      AS exact_installed
  FROM installed_relation_contract
  CROSS JOIN installed_column_contract
  CROSS JOIN installed_constraint_contract
  CROSS JOIN installed_index_contract
  CROSS JOIN installed_function_contract
  CROSS JOIN installed_trigger_contract
  CROSS JOIN installed_baseline_contract
  CROSS JOIN installed_target_data_contract
), prerequisite_state AS (
  SELECT relation_contract.prerequisite_relations_exact
      AND function_contract.predecessor_functions_exact
      AND writer_contract.old_writer_set_exact AS predecessor_contracts_exact,
    executor_contract.executor_ok
      AND executor_contract.server_version_ok
      AND role_contract.roles_exact
      AND auth_relation_contract.auth_users_security_exact
      AND relation_contract.prerequisite_relations_exact
      AND function_contract.predecessor_functions_exact
      AND writer_contract.old_writer_set_exact AS foundation_exact
  FROM executor_contract
  CROSS JOIN role_contract
  CROSS JOIN auth_relation_contract
  CROSS JOIN relation_contract
  CROSS JOIN function_contract
  CROSS JOIN writer_contract
)
SELECT executor_contract.executor_ok,
  executor_contract.server_version_ok,
  role_contract.roles_exact,
  auth_relation_contract.auth_users_security_exact,
  relation_contract.prerequisite_relations_exact,
  relation_contract.prerequisite_relation_count,
  function_contract.predecessor_functions_exact,
  function_contract.predecessor_function_count,
  writer_contract.old_writer_set_exact,
  writer_contract.old_writer_count,
  prerequisite_state.predecessor_contracts_exact,
  target_state.targets_absent AS canonical_targets_absent,
  target_state.possible_prior_success AS count_shape_only,
  target_state.present_count AS target_relation_count,
  target_state.index_count AS target_index_count,
  target_state.entry_function_count AS target_entry_function_count,
  target_state.internal_function_count AS target_internal_function_count,
  target_state.trigger_count AS target_trigger_count,
  installed_relation_contract.relations_exact AS installed_relations_exact,
  installed_column_contract.columns_exact AS installed_columns_exact,
  installed_constraint_contract.constraints_exact
    AS installed_constraints_exact,
  installed_index_contract.indexes_exact AS installed_indexes_exact,
  installed_function_contract.functions_exact AS installed_functions_exact,
  installed_trigger_contract.triggers_exact AS installed_triggers_exact,
  installed_baseline_contract.baseline_exact AS installed_baseline_exact,
  installed_target_data_contract.target_row_counts_exact,
  exact_installed_state.exact_installed,
  NOT target_state.targets_absent
    AND NOT exact_installed_state.exact_installed AS target_collision,
  installed_baseline_observed.predecessor_shape_exact
    AS baseline_predecessor_shape_exact,
  installed_baseline_observed.predecessor_exact
    AS baseline_predecessor_contract_exact,
  installed_baseline_observed.writer_digest_exact
    AS baseline_writer_digest_exact,
  installed_baseline_observed.protected_count_exact
    AND installed_baseline_observed.protected_digest_exact
      AS baseline_protected_evidence_exact,
  installed_baseline_observed.request_count_exact
    AND installed_baseline_observed.request_digest_exact
      AS baseline_request_evidence_exact,
  installed_baseline_observed.draft_count_exact
    AND installed_baseline_observed.draft_digest_exact
      AS baseline_draft_evidence_exact,
  protected_evidence.protected_count,
  protected_evidence.protected_digest,
  request_evidence.request_count,
  request_evidence.request_digest,
  draft_evidence.draft_count,
  draft_evidence.draft_digest,
  prerequisite_state.foundation_exact
    AND exact_installed_state.exact_installed AS lost_response_safe,
  prerequisite_state.foundation_exact
    AND (target_state.targets_absent
      OR exact_installed_state.exact_installed) AS operator_state_ok,
  prerequisite_state.foundation_exact
    AND target_state.targets_absent AS prerequisites_ok
FROM executor_contract
CROSS JOIN role_contract
CROSS JOIN auth_relation_contract
CROSS JOIN relation_contract
CROSS JOIN function_contract
CROSS JOIN writer_contract
CROSS JOIN prerequisite_state
CROSS JOIN target_state
CROSS JOIN installed_relation_contract
CROSS JOIN installed_column_contract
CROSS JOIN installed_constraint_contract
CROSS JOIN installed_index_contract
CROSS JOIN installed_function_contract
CROSS JOIN installed_trigger_contract
CROSS JOIN installed_baseline_contract
CROSS JOIN installed_baseline_observed
CROSS JOIN installed_target_data_contract
CROSS JOIN exact_installed_state
CROSS JOIN protected_evidence
CROSS JOIN request_evidence
CROSS JOIN draft_evidence;

ROLLBACK;
