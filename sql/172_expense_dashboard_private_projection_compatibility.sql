-- SQL172 MIGRATION: contain proven row-local private-draft projection failures.
-- Function-only compatibility repair. Run this one DO statement standalone under normal autocommit.
-- No application row, relation, RLS, auth or existing owner/ACL state is changed.

DO $sql172_private_projection_compatibility$
DECLARE
  v_target_oid oid := pg_catalog.to_regprocedure(
    'public.expense_list_dashboard_presentations_v1(uuid)'
  );
  v_adapter_oid oid := pg_catalog.to_regprocedure(
    'public.expense_sql172_project_private_draft(uuid,uuid)'
  );
  v_post_target_oid oid;
  v_post_adapter_oid oid;
  v_source text;
  v_target_source text;
  v_adapter_source text;
  v_old_token text;
  v_new_token text;
  v_token_count integer;
  v_target_source_hash text;
  v_adapter_source_hash text;
  v_target_metadata_exact boolean := false;
  v_target_acl_exact boolean := false;
  v_target_dependencies_exact boolean := false;
  v_adapter_metadata_exact boolean := false;
  v_adapter_acl_exact boolean := false;
  v_adapter_dependencies_exact boolean := false;
  v_lineage_source_hashes_exact boolean := false;
  v_lineage_metadata_exact boolean := false;
  v_lineage_acls_exact boolean := false;
  v_catalog_lineage_exact boolean := false;
  v_relation_lineage_exact boolean := false;
  v_lineage_query text;
  v_target_overload_count integer := 0;
  v_adapter_overload_count integer := 0;
  v_state text := 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT';
  v_sql159_lock_acquired boolean := false;
  v_sql170_lock_acquired boolean := false;
  v_sql171_lock_acquired boolean := false;
  v_sql172_lock_acquired boolean := false;
  v_sql171_target_hash constant text := 'aad418eeda9d6b1dfe073c4109723d88';
  v_sql172_target_hash constant text := 'c27e4db0344e21ff660387dab9b3b36c';
  v_sql172_adapter_hash constant text := 'f6f261b2f4405afa09c033b7a7b651be';
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  PERFORM pg_catalog.set_config('search_path', '', true);

  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql172_executor_not_postgres';
  END IF;

  -- Lock ordering is shared with SQL159/170/171 and then advances to SQL172.
  v_sql159_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(159159);
  IF NOT v_sql159_lock_acquired THEN
    RAISE EXCEPTION 'expense_sql172_sql159_lock_unavailable';
  END IF;
  v_sql170_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(104170);
  IF NOT v_sql170_lock_acquired THEN
    RAISE EXCEPTION 'expense_sql172_sql170_lock_unavailable';
  END IF;
  v_sql171_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(104171);
  IF NOT v_sql171_lock_acquired THEN
    RAISE EXCEPTION 'expense_sql172_sql171_lock_unavailable';
  END IF;
  v_sql172_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(104172);
  IF NOT v_sql172_lock_acquired THEN
    RAISE EXCEPTION 'expense_sql172_lock_unavailable';
  END IF;

  -- BEGIN EXACT V246 UNCHANGED HELPER/RELATION LINEAGE CLOSURE
  v_lineage_query := pg_catalog.replace($sql172_lineage_query$
WITH roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
), expected_functions(
  lineage_group, signature, exact_arguments, result_type, source_hash,
  language_name, volatility, security_definer, is_strict,
  parallel_safety, returns_set, default_count, argument_modes,
  service_execute
) AS MATERIALIZED (
  -- BEGIN EXACT SQL171 FUNCTION LINEAGE MANIFEST
  VALUES
    ('private','public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)',
      'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean',
      'jsonb','18a6e628bdb1d3c175b515541ab56787',
      'plpgsql','v',true,false,'u',false,0,NULL::text[],false),
    ('private','public.expense_sql159_amount_minor(text,text,boolean)',
      'p_raw text, p_currency text, p_allow_zero boolean','bigint',
      '5a4124296ff7e6f19d42342815be8109','plpgsql','i',false,false,'u',false,0,NULL::text[],false),
    ('private','public.expense_sql159_percentage_basis_points(text)',
      'p_raw text','bigint','ad0deb049185b7f6519bc0c3154201ac',
      'plpgsql','i',false,false,'u',false,0,NULL::text[],false),
    ('private','public.expense_sql159_weight(text)',
      'p_raw text','bigint','c29cee4a8de2c95e138aad00af3fd4fe',
      'plpgsql','i',false,false,'u',false,0,NULL::text[],false),
    ('private','public.expense_sql159_allocate_weighted(bigint,jsonb,bigint)',
      'p_total_minor bigint, p_weights jsonb, p_expected_weight_total bigint',
      'jsonb','7d38f3ac0f65a2b16aac5a53c9a09e8f',
      'plpgsql','i',false,false,'u',false,0,NULL::text[],false),
    ('private','public.normalize_email_canonical(text)',
      'p_email text','text','3083103976aa8cb3780937b9da1be236',
      'sql','i',false,true,'s',false,0,NULL::text[],true),
    ('private','public.teskeid_event_uuid_from_text(text)',
      'p_value text','uuid','27229cbc71c621e5a8592265b07f874d',
      'sql','i',true,false,'u',false,0,NULL::text[],false),
    ('private','public.expense_active_member_role(uuid,uuid)',
      'p_actor_id uuid, p_group_id uuid','text',
      'b25f994a64dde4a3f94ec8bad8535b17','sql','s',true,false,'u',false,0,NULL::text[],false),
    ('live','public.expense_sql159_audience_allows(uuid,uuid)',
      'p_actor_id uuid, p_draft_id uuid','boolean',
      '9c4af07a07906c4dac6f06da94b42b37','sql','s',true,false,'u',false,0,NULL::text[],false),
    ('live','public.expense_sql159_snapshot_is_valid(uuid)',
      'p_draft_id uuid','boolean','af4b9f8a5f0b422956fc1d664021baff',
      'sql','s',true,false,'u',false,0,NULL::text[],false),
    ('live','public.expense_has_beta_access(uuid)',
      'p_user_id uuid','boolean','ebe4628dbda84e79b395c9da0ae39899',
      'sql','s',true,false,'u',false,0,NULL::text[],false),
    ('settlement','public.expense_settlement_eligible_balances_v1(uuid,boolean)',
      'p_group_id uuid, p_include_reported boolean DEFAULT false',
      'TABLE(member_id uuid, currency text, amount_minor bigint)',
      'b58245a47cc0c8e306a8769afa508687',
      'plpgsql','s',true,false,'u',true,1,
      ARRAY['i','i','t','t','t']::text[],false),
    ('event','public.teskeid_event_assert_session_actor(uuid)',
      'p_actor_id uuid','void','30238c0def94d573fd8265fd94da0757',
      'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
    ('event','public.expense_assert_beta_actor(uuid)',
      'p_actor_id uuid','void','ea6c329f5c13bd7d0bfbd9df41e5931d',
      'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
    ('event','public.expense_sql159_event_scope_read_only(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb',
      '4ba9308ba12eef6405ed24916bc0bb74','plpgsql','s',true,false,'u',false,0,NULL::text[],false),
    ('event','public.expense_sql159_event_scope_allows(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','boolean',
      '0be29be5cda2d34bf41dc2f67e0afa2e','plpgsql','s',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb',
      'e6dc71178a96bb4f398d61b44b39c57a','plpgsql','s',true,false,'u',false,0,NULL::text[],true),
    ('event','public.teskeid_event_get_expense_source_v3(uuid,uuid)',
      'p_actor_id uuid, p_event_id uuid','jsonb',
      '9fdcb060bd933599b8f04fe42da27874','plpgsql','s',true,false,'u',false,0,NULL::text[],true),
    ('event','public.teskeid_event_assert_actor(uuid)',
      'p_actor_id uuid','void','9dd7c34f6cc6c78131e7ebbb9a718ea4',
      'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_assert_financial_actor(uuid)',
      'p_actor_id uuid','void','7f6ced4f5e7472aff27d9a6d5c624355',
      'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)',
      'p_actor_id uuid, p_event_id uuid, p_event_guest_id uuid, p_participant_kind text, p_position integer',
      'jsonb','25394edc6b084676921c3a65b1f19a8a',
      'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_private_normalize_shared_name_v2(text)',
      'p_value text','text','d118ab08bc0346cdf31519344a2f65a7',
      'sql','i',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_private_valid_shared_name_v2(text)',
      'p_value text','boolean','7a3223263c138e04713dbc87e7dc6576',
      'sql','i',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_private_safe_profile_name_v2(uuid)',
      'p_user_id uuid','text','53f29b4c6872d3e76d6c9cbc17a767e0',
      'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_private_valid_canonical_email_v2(text)',
      'p_value text','boolean','3e64bc04485bc06cc544f59f46a2fb0e',
      'sql','i',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)',
      'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text',
      'jsonb','cfb3afa33af8fd230e6c26930424387f',
      'plpgsql','s',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_normalize_text(text)',
      'p_value text','text','ced5cfb2427fe7331f4416497614f7d1',
      'sql','i',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_valid_text(text,integer,integer)',
      'p_value text, p_minimum integer, p_maximum integer','boolean',
      '28c80b083a90683f15fd04f4d7d547d1','sql','i',true,false,'u',false,0,NULL::text[],false),
    ('event','public.teskeid_event_has_access(uuid)',
      'p_user_id uuid','boolean','7b69311a107381a1891da01c32780f5f',
      'sql','s',true,false,'u',false,0,NULL::text[],false)
  -- END EXACT SQL171 FUNCTION LINEAGE MANIFEST
), observed_functions AS MATERIALIZED (
  SELECT expected.*, routine.oid, routine.proowner, routine.proacl,
    routine.prokind, routine.provolatile, routine.prosecdef,
    routine.proisstrict, routine.proleakproof, routine.proparallel,
    routine.proretset, routine.pronargdefaults, routine.proargdefaults,
    routine.proargmodes::text[] AS actual_argument_modes,
    routine.proconfig, routine.provariadic, routine.prosupport,
    routine.probin, routine.prosqlbody, language_row.lanname,
    pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
    pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      AS actual_source_hash,
    (
      SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.pg_proc AS overload
      WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
        AND overload.proname = pg_catalog.split_part(
          pg_catalog.split_part(expected.signature, '(', 1), '.', 2
        )
    ) AS actual_overload_count
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = routine.prolang
), function_checks AS MATERIALIZED (
  SELECT observed.*,
    COALESCE(observed.actual_source_hash = observed.source_hash, false)
      AS source_exact,
    COALESCE(
      observed.oid IS NOT NULL
        AND observed.prokind = 'f'
        AND observed.actual_overload_count = 1
        AND observed.actual_arguments = observed.exact_arguments
        AND observed.actual_result = observed.result_type
        AND observed.lanname = observed.language_name
        AND observed.provolatile::text = observed.volatility
        AND observed.prosecdef = observed.security_definer
        AND observed.proisstrict = observed.is_strict
        AND NOT observed.proleakproof
        AND observed.proparallel::text = observed.parallel_safety
        AND observed.proretset = observed.returns_set
        AND observed.pronargdefaults = observed.default_count
        AND ((observed.default_count = 0 AND observed.proargdefaults IS NULL)
          OR (observed.default_count > 0 AND observed.proargdefaults IS NOT NULL))
        AND observed.actual_argument_modes
          IS NOT DISTINCT FROM observed.argument_modes
        AND observed.proconfig = ARRAY['search_path=""']::text[]
        AND observed.proowner = roles.postgres_oid
        AND observed.provariadic = 0::oid
        AND observed.prosupport = 0::oid
        AND observed.probin IS NULL
        AND observed.prosqlbody IS NULL
        AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_depend AS dependency
          WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency.objid = observed.oid
            AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
            AND dependency.refobjid = pg_catalog.to_regnamespace('public')
        )
        AND (observed.language_name = 'sql' OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_depend AS dependency
          JOIN pg_catalog.pg_language AS dependency_language
            ON dependency_language.oid = dependency.refobjid
          WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency.objid = observed.oid
            AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
            AND dependency_language.lanname = observed.language_name
        ))
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_depend AS dependency
          WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency.objid = observed.oid
            AND dependency.deptype = 'e'
        )
        AND (
          SELECT pg_catalog.count(*) = CASE
              WHEN observed.language_name = 'plpgsql' THEN 2 ELSE 1
            END
            AND COALESCE(pg_catalog.bool_and(
              dependency.objsubid = 0
                AND dependency.refobjsubid = 0
                AND dependency.deptype = 'n'
                AND (
                  (
                    dependency.refclassid =
                      'pg_catalog.pg_namespace'::pg_catalog.regclass
                    AND dependency.refobjid =
                      pg_catalog.to_regnamespace('public')
                  )
                  OR (
                    observed.language_name = 'plpgsql'
                    AND dependency.refclassid =
                      'pg_catalog.pg_language'::pg_catalog.regclass
                    AND dependency.refobjid = (
                      SELECT language_row.oid
                      FROM pg_catalog.pg_language AS language_row
                      WHERE language_row.lanname = 'plpgsql'
                    )
                  )
                )
            ), false)
          FROM pg_catalog.pg_depend AS dependency
          WHERE dependency.classid =
              'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency.objid = observed.oid
        ), false
    ) AS metadata_exact,
    CASE WHEN observed.oid IS NULL
      OR roles.postgres_oid IS NULL OR roles.service_role_oid IS NULL
      OR roles.anon_oid IS NULL OR roles.authenticated_oid IS NULL
      THEN false
      ELSE (
        SELECT pg_catalog.count(*) = CASE
              WHEN observed.service_execute THEN 2 ELSE 1 END
          AND pg_catalog.count(*) FILTER (
            WHERE acl.grantee = roles.postgres_oid
          ) = 1
          AND pg_catalog.count(*) FILTER (
            WHERE acl.grantee = roles.service_role_oid
          ) = CASE WHEN observed.service_execute THEN 1 ELSE 0 END
          AND COALESCE(pg_catalog.bool_and(
            acl.privilege_type = 'EXECUTE'
              AND acl.grantor = roles.postgres_oid
              AND NOT acl.is_grantable
              AND (acl.grantee = roles.postgres_oid OR (
                observed.service_execute
                AND acl.grantee = roles.service_role_oid
              ))
          ), false)
        FROM pg_catalog.aclexplode(COALESCE(
          observed.proacl,
          pg_catalog.acldefault('f', observed.proowner)
        )) AS acl
      )
    END AS acl_exact
  FROM observed_functions AS observed CROSS JOIN roles
), relation_manifest(name, force_rls, expected_nonowner_acl)
AS MATERIALIZED (
  VALUES
    ('expense_private_drafts', true, ARRAY[]::text[]),
    ('expense_unconfirmed_publications', true, ARRAY[]::text[]),
    ('expense_unconfirmed_publication_parties', true, ARRAY[]::text[]),
    ('expense_unconfirmed_publication_audience', true, ARRAY[]::text[]),
    ('expense_edit_revision_bindings', true, ARRAY[]::text[]),
    ('expense_groups', false, ARRAY['service_role:SELECT']::text[]),
    ('expense_group_members', false, ARRAY['service_role:SELECT']::text[]),
    ('expenses', false, ARRAY['service_role:SELECT']::text[]),
    ('expense_payments', false, ARRAY['service_role:SELECT']::text[]),
    ('expense_shares', false, ARRAY['service_role:SELECT']::text[]),
    ('expense_repayments', false, ARRAY['service_role:SELECT']::text[]),
    ('expense_member_identity_bindings', true, ARRAY[]::text[]),
    ('relationships', false, ARRAY[
      'service_role:DELETE','service_role:INSERT',
      'service_role:SELECT','service_role:UPDATE']::text[]),
    ('profiles', false, ARRAY[
      'authenticated:INSERT','authenticated:SELECT',
      'authenticated:UPDATE','service_role:INSERT',
      'service_role:SELECT']::text[]),
    ('relationship_circles', true, ARRAY['service_role:SELECT']::text[]),
    ('relationship_circle_members', true, ARRAY['service_role:SELECT']::text[]),
    ('relationship_circle_expense_contexts', true,
      ARRAY['service_role:SELECT']::text[])
), relation_checks AS MATERIALIZED (
  SELECT pg_catalog.count(class_row.oid) = 17
    AND COALESCE(pg_catalog.bool_and(
      class_row.oid IS NOT NULL
        AND class_row.relkind = 'r'
        AND class_row.relpersistence = 'p'
        AND class_row.relrowsecurity
        AND class_row.relforcerowsecurity = manifest.force_rls
        AND owner_role.rolname = 'postgres'
        AND COALESCE((
          SELECT pg_catalog.array_agg(
            COALESCE(grantee_role.rolname::text, 'PUBLIC')
              || ':' || acl.privilege_type
            ORDER BY (COALESCE(grantee_role.rolname::text, 'PUBLIC')
              || ':' || acl.privilege_type) COLLATE pg_catalog."C"
          )::text[]
          FROM pg_catalog.aclexplode(COALESCE(
            class_row.relacl,
            pg_catalog.acldefault('r', class_row.relowner)
          )) AS acl
          LEFT JOIN pg_catalog.pg_roles AS grantee_role
            ON grantee_role.oid = acl.grantee
          WHERE acl.grantee <> class_row.relowner
        ), ARRAY[]::text[]) = manifest.expected_nonowner_acl
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
            class_row.relacl,
            pg_catalog.acldefault('r', class_row.relowner)
          )) AS acl
          WHERE acl.grantor <> class_row.relowner OR acl.is_grantable
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = class_row.oid
            AND attribute.attnum > 0 AND NOT attribute.attisdropped
            AND attribute.attacl IS NOT NULL
        )
    ), false) AS relations_exact
  FROM relation_manifest AS manifest
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass('public.' || manifest.name)
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = class_row.relowner
), required_columns(relation_name, column_name, type_name)
AS MATERIALIZED (
  VALUES
    ('expense_private_drafts','id','uuid'),
    ('expense_private_drafts','actor_user_id','uuid'),
    ('expense_private_drafts','context_type','text'),
    ('expense_private_drafts','group_id','uuid'),
    ('expense_private_drafts','expense_id','uuid'),
    ('expense_private_drafts','current_step','text'),
    ('expense_private_drafts','payload','jsonb'),
    ('expense_private_drafts','version','bigint'),
    ('expense_unconfirmed_publications','draft_id','uuid'),
    ('expense_unconfirmed_publications','actor_user_id','uuid'),
    ('expense_unconfirmed_publications','context_type','text'),
    ('expense_unconfirmed_publications','group_id','uuid'),
    ('expense_unconfirmed_publications','is_live','boolean'),
    ('expense_unconfirmed_publications','source_draft_version','bigint'),
    ('expense_edit_revision_bindings','draft_id','uuid'),
    ('expense_edit_revision_bindings','expense_id','uuid'),
    ('expense_edit_revision_bindings','group_id','uuid'),
    ('expense_edit_revision_bindings','actor_user_id','uuid'),
    ('expense_edit_revision_bindings','mode','text'),
    ('expense_groups','id','uuid'),
    ('expense_groups','status','text'),
    ('expense_group_members','id','uuid'),
    ('expense_group_members','group_id','uuid'),
    ('expense_group_members','user_id','uuid'),
    ('expense_group_members','status','text'),
    ('expenses','id','uuid'),
    ('expenses','group_id','uuid'),
    ('expenses','status','text'),
    ('expense_member_identity_bindings','group_id','uuid'),
    ('expense_member_identity_bindings','member_id','uuid'),
    ('expense_member_identity_bindings','target_user_id','uuid')
), column_checks AS MATERIALIZED (
  SELECT pg_catalog.count(attribute.attnum) = 31
    AND COALESCE(pg_catalog.bool_and(
      attribute.attnum > 0 AND NOT attribute.attisdropped
        AND pg_catalog.format_type(
          attribute.atttypid, attribute.atttypmod
        ) = required.type_name
    ), false) AS columns_exact
  FROM required_columns AS required
  LEFT JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = pg_catalog.to_regclass(
      'public.' || required.relation_name
    )
   AND attribute.attname = required.column_name
)
SELECT pg_catalog.count(check_row.oid) = 29
    AND COALESCE(pg_catalog.bool_and(check_row.source_exact), false),
  pg_catalog.count(check_row.oid) = 29
    AND COALESCE(pg_catalog.bool_and(check_row.metadata_exact), false),
  pg_catalog.count(check_row.oid) = 29
    AND COALESCE(pg_catalog.bool_and(check_row.acl_exact), false),
  pg_catalog.count(check_row.oid) = 29
    AND COALESCE(pg_catalog.bool_and(
      check_row.source_exact AND check_row.metadata_exact
        AND check_row.acl_exact
    ), false),
  pg_catalog.bool_and(
    relation_checks.relations_exact AND column_checks.columns_exact
  )
FROM function_checks AS check_row
CROSS JOIN relation_checks CROSS JOIN column_checks;
$sql172_lineage_query$, E'\r\n', E'\n');

  EXECUTE v_lineage_query
  INTO v_lineage_source_hashes_exact, v_lineage_metadata_exact,
    v_lineage_acls_exact, v_catalog_lineage_exact, v_relation_lineage_exact;

  IF NOT COALESCE(v_lineage_source_hashes_exact, false)
     OR NOT COALESCE(v_lineage_metadata_exact, false)
     OR NOT COALESCE(v_lineage_acls_exact, false)
     OR NOT COALESCE(v_catalog_lineage_exact, false)
     OR NOT COALESCE(v_relation_lineage_exact, false) THEN
    RAISE EXCEPTION 'expense_sql172_predecessor_lineage_drift';
  END IF;
  -- END EXACT V246 UNCHANGED HELPER/RELATION LINEAGE CLOSURE

  SELECT (pg_catalog.count(*) FILTER (
      WHERE routine.proname = 'expense_list_dashboard_presentations_v1'
    ))::integer,
    (pg_catalog.count(*) FILTER (
      WHERE routine.proname = 'expense_sql172_project_private_draft'
    ))::integer
  INTO v_target_overload_count, v_adapter_overload_count
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
    AND routine.proname IN (
      'expense_list_dashboard_presentations_v1',
      'expense_sql172_project_private_draft'
    );

  -- The SQL171 target must retain its exact metadata, service boundary and
  -- namespace/language-only dependency shape before any SQL172 mutation.
  SELECT routine.prosrc,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
    routine.prokind = 'f'
      AND routine.pronargs = 1
      AND routine.proargnames = ARRAY['p_actor_id']::text[]
      AND routine.proargmodes IS NULL
      AND pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset
      AND routine.provolatile = 'v'::"char"
      AND routine.prosecdef
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL
      AND routine.provariadic = 0::oid
      AND routine.procost = 100
      AND routine.prorows = 0
      AND routine.prosupport = 0::oid
      AND routine.protrftypes IS NULL
      AND routine.probin IS NULL
      AND routine.prosqlbody IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND owner_role.rolname = 'postgres'
  INTO v_source, v_target_source_hash, v_target_metadata_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
  WHERE routine.oid = v_target_oid;

  WITH roles AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
    SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
    UNION ALL
    SELECT service_role_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
  ), actual_acl AS MATERIALIZED (
    SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl
    WHERE routine.oid = v_target_oid
  )
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
      AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL
      AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 2
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
      AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND NOT EXISTS (SELECT 1 FROM actual_acl WHERE grantee = 0::oid)
      AND pg_catalog.has_function_privilege(
        roles.postgres_oid, v_target_oid, 'EXECUTE'
      )
      AND pg_catalog.has_function_privilege(
        roles.service_role_oid, v_target_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, v_target_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, v_target_oid, 'EXECUTE'
      ), false
  ) INTO v_target_acl_exact
  FROM roles;

  WITH expected_dependencies(
    classid, objid, objsubid, refclassid, refobjid, refobjsubid, deptype
  ) AS MATERIALIZED (
    SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass::oid, v_target_oid, 0,
      'pg_catalog.pg_namespace'::pg_catalog.regclass::oid,
      pg_catalog.to_regnamespace('public')::oid, 0, 'n'::"char"
    UNION ALL
    SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass::oid, v_target_oid, 0,
      'pg_catalog.pg_language'::pg_catalog.regclass::oid,
      language_row.oid, 0, 'n'::"char"
    FROM pg_catalog.pg_language AS language_row
    WHERE language_row.lanname = 'plpgsql'
  ), actual_dependencies AS MATERIALIZED (
    SELECT dependency.classid, dependency.objid, dependency.objsubid,
      dependency.refclassid, dependency.refobjid, dependency.refobjsubid,
      dependency.deptype
    FROM pg_catalog.pg_depend AS dependency
    WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      AND dependency.objid = v_target_oid
  )
  SELECT COALESCE(
    (SELECT pg_catalog.count(*) FROM expected_dependencies) = 2
      AND (SELECT pg_catalog.count(*) FROM actual_dependencies) = 2
      AND NOT EXISTS (SELECT actual.* FROM actual_dependencies AS actual
        EXCEPT ALL SELECT expected.* FROM expected_dependencies AS expected)
      AND NOT EXISTS (SELECT expected.* FROM expected_dependencies AS expected
        EXCEPT ALL SELECT actual.* FROM actual_dependencies AS actual), false
  ) INTO v_target_dependencies_exact;

  -- Recognize an already-installed adapter without granting it to any app role.
  IF v_adapter_oid IS NOT NULL THEN
    SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
      routine.prokind = 'f'
        AND routine.pronargs = 2
        AND routine.proargnames = ARRAY['p_actor_id','p_draft_id']::text[]
        AND routine.proargmodes IS NULL
        AND pg_catalog.pg_get_function_arguments(routine.oid)
          = 'p_actor_id uuid, p_draft_id uuid'
        AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
        AND routine.prorettype = 'jsonb'::pg_catalog.regtype
        AND NOT routine.proretset
        AND routine.provolatile = 'v'::"char"
        AND NOT routine.prosecdef
        AND NOT routine.proisstrict
        AND NOT routine.proleakproof
        AND routine.proparallel = 'u'::"char"
        AND routine.pronargdefaults = 0
        AND routine.proargdefaults IS NULL
        AND routine.proallargtypes IS NULL
        AND routine.provariadic = 0::oid
        AND routine.procost = 100
        AND routine.prorows = 0
        AND routine.prosupport = 0::oid
        AND routine.protrftypes IS NULL
        AND routine.probin IS NULL
        AND routine.prosqlbody IS NULL
        AND routine.proconfig = ARRAY['search_path=""']::text[]
        AND language_row.lanname = 'plpgsql'
        AND owner_role.rolname = 'postgres'
    INTO v_adapter_source_hash, v_adapter_metadata_exact
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
    WHERE routine.oid = v_adapter_oid;

    WITH actual_acl AS MATERIALIZED (
      SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_proc AS routine
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      WHERE routine.oid = v_adapter_oid
    )
    SELECT COALESCE(
      (SELECT pg_catalog.count(*) FROM actual_acl) = 1
        AND NOT EXISTS (
          SELECT 1 FROM actual_acl
          WHERE grantee IS DISTINCT FROM pg_catalog.to_regrole('postgres')::oid
             OR grantor IS DISTINCT FROM pg_catalog.to_regrole('postgres')::oid
             OR privilege_type IS DISTINCT FROM 'EXECUTE'
             OR is_grantable
        )
        AND pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('postgres')::oid, v_adapter_oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('service_role')::oid, v_adapter_oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('anon')::oid, v_adapter_oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('authenticated')::oid, v_adapter_oid, 'EXECUTE'
        ), false
    ) INTO v_adapter_acl_exact;

    WITH expected_dependencies(
      classid, objid, objsubid, refclassid, refobjid, refobjsubid, deptype
    ) AS MATERIALIZED (
      SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass::oid, v_adapter_oid, 0,
        'pg_catalog.pg_namespace'::pg_catalog.regclass::oid,
        pg_catalog.to_regnamespace('public')::oid, 0, 'n'::"char"
      UNION ALL
      SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass::oid, v_adapter_oid, 0,
        'pg_catalog.pg_language'::pg_catalog.regclass::oid,
        language_row.oid, 0, 'n'::"char"
      FROM pg_catalog.pg_language AS language_row
      WHERE language_row.lanname = 'plpgsql'
    ), actual_dependencies AS MATERIALIZED (
      SELECT dependency.classid, dependency.objid, dependency.objsubid,
        dependency.refclassid, dependency.refobjid, dependency.refobjsubid,
        dependency.deptype
      FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = v_adapter_oid
    )
    SELECT COALESCE(
      (SELECT pg_catalog.count(*) FROM expected_dependencies) = 2
        AND (SELECT pg_catalog.count(*) FROM actual_dependencies) = 2
        AND NOT EXISTS (SELECT actual.* FROM actual_dependencies AS actual
          EXCEPT ALL SELECT expected.* FROM expected_dependencies AS expected)
        AND NOT EXISTS (SELECT expected.* FROM expected_dependencies AS expected
          EXCEPT ALL SELECT actual.* FROM actual_dependencies AS actual), false
    ) INTO v_adapter_dependencies_exact;
  END IF;

  IF COALESCE(v_target_metadata_exact, false)
     AND COALESCE(v_target_acl_exact, false)
     AND COALESCE(v_target_dependencies_exact, false)
     AND v_target_source_hash = v_sql171_target_hash
     AND v_target_overload_count = 1
     AND v_adapter_oid IS NULL
     AND v_adapter_overload_count = 0 THEN
    v_state := 'PREDECESSOR_READY';
  ELSIF COALESCE(v_target_metadata_exact, false)
     AND COALESCE(v_target_acl_exact, false)
     AND COALESCE(v_target_dependencies_exact, false)
     AND v_target_source_hash = v_sql172_target_hash
     AND COALESCE(v_adapter_metadata_exact, false)
     AND COALESCE(v_adapter_acl_exact, false)
     AND COALESCE(v_adapter_dependencies_exact, false)
     AND v_adapter_source_hash = v_sql172_adapter_hash
     AND v_target_overload_count = 1
     AND v_adapter_overload_count = 1 THEN
    v_state := 'EXACT_INSTALLED';
  END IF;

  IF v_state = 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT' THEN
    RAISE EXCEPTION 'expense_sql172_partial_or_predecessor_drift';
  END IF;

  IF v_state = 'PREDECESSOR_READY' THEN
    v_target_source := pg_catalog.replace(v_source, E'\r\n', E'\n');

    -- BEGIN SQL172 EXACT TARGET-SOURCE PATCH MANIFEST
    v_old_token := '  v_rows jsonb;';
    v_new_token := pg_catalog.replace($sql172_new_declarations$
  v_rows jsonb;
  v_js_whitespace constant text :=
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680' ||
    U&'\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A' ||
    U&'\2028\2029\202F\205F\3000\FEFF';
  v_email_shaped_pattern constant text :=
    U&'(^|[\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF])' ||
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF@]+@' ||
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF@]+[.]' ||
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF@]+' ||
    U&'($|[\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF])';$sql172_new_declarations$,
      E'\r\n', E'\n');
    v_token_count := (pg_catalog.char_length(v_target_source)
      - pg_catalog.char_length(pg_catalog.replace(v_target_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    IF v_token_count <> 1 THEN RAISE EXCEPTION 'expense_sql172_patch_declarations'; END IF;
    v_target_source := pg_catalog.replace(v_target_source, v_old_token, v_new_token);

    v_old_token := '      pg_catalog.btrim(draft.payload->>''title'') AS title,';
    v_new_token := pg_catalog.replace($sql172_new_private_title$
      safe_title.title AS title,
      (
        safe_title.title IS NULL
        OR summary.total_minor IS NULL
        OR source.normalized IS NULL
      ) AS needs_attention,$sql172_new_private_title$, E'\r\n', E'\n');
    v_token_count := (pg_catalog.char_length(v_target_source)
      - pg_catalog.char_length(pg_catalog.replace(v_target_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    IF v_token_count <> 1 THEN RAISE EXCEPTION 'expense_sql172_patch_private_title'; END IF;
    v_target_source := pg_catalog.replace(v_target_source, v_old_token, v_new_token);

    v_old_token := pg_catalog.replace($sql172_old_private_from$
    FROM public.expense_private_drafts AS draft
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN pg_catalog.jsonb_typeof(draft.payload->'total') = 'string'$sql172_old_private_from$,
      E'\r\n', E'\n');
    v_new_token := pg_catalog.replace($sql172_new_private_from$
    FROM public.expense_private_drafts AS draft
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN pg_catalog.jsonb_typeof(draft.payload->'title') = 'string'
          AND (
            2 * pg_catalog.char_length(pg_catalog.btrim(
              draft.payload->>'title', v_js_whitespace
            ))
            - pg_catalog.char_length(pg_catalog.regexp_replace(
              pg_catalog.btrim(draft.payload->>'title', v_js_whitespace),
              U&'[\+010000-\+10FFFF]', '', 'g'
            ))
          ) BETWEEN 1 AND 200
          AND pg_catalog.btrim(draft.payload->>'title', v_js_whitespace)
            !~ U&'[\0001-\001F\007F-\009F\202A-\202E\2066-\2069]'
          AND pg_catalog.btrim(draft.payload->>'title', v_js_whitespace)
            !~ v_email_shaped_pattern
          THEN pg_catalog.btrim(draft.payload->>'title', v_js_whitespace)
        ELSE NULL::text
      END AS title
    ) AS safe_title ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN pg_catalog.jsonb_typeof(draft.payload->'total') = 'string'$sql172_new_private_from$,
      E'\r\n', E'\n');
    v_token_count := (pg_catalog.char_length(v_target_source)
      - pg_catalog.char_length(pg_catalog.replace(v_target_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    IF v_token_count <> 1 THEN RAISE EXCEPTION 'expense_sql172_patch_safe_title'; END IF;
    v_target_source := pg_catalog.replace(v_target_source, v_old_token, v_new_token);

    v_old_token := pg_catalog.replace($sql172_old_private_normalizer$
        WHEN draft.current_step = 'split' AND summary.total_minor IS NOT NULL
          THEN public.expense_sql159_normalize_private_draft(
            p_actor_id, draft.id, false
          )$sql172_old_private_normalizer$, E'\r\n', E'\n');
    v_new_token := pg_catalog.replace($sql172_new_private_normalizer$
        WHEN draft.current_step = 'split' AND summary.total_minor IS NOT NULL
          THEN public.expense_sql172_project_private_draft(
            p_actor_id, draft.id
          )$sql172_new_private_normalizer$, E'\r\n', E'\n');
    v_token_count := (pg_catalog.char_length(v_target_source)
      - pg_catalog.char_length(pg_catalog.replace(v_target_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    IF v_token_count <> 1 THEN RAISE EXCEPTION 'expense_sql172_patch_private_adapter'; END IF;
    v_target_source := pg_catalog.replace(v_target_source, v_old_token, v_new_token);

    v_old_token := pg_catalog.replace($sql172_old_private_visibility$
    WHERE draft.actor_user_id = p_actor_id
      AND draft.context_type IN ('one_off', 'group')
      AND NOT EXISTS ($sql172_old_private_visibility$, E'\r\n', E'\n');
    v_new_token := pg_catalog.replace($sql172_new_private_visibility$
    WHERE draft.actor_user_id = p_actor_id
      AND draft.context_type IN ('one_off', 'group')
      AND (
        draft.context_type = 'one_off'
        OR (
          draft.context_type = 'group'
          AND EXISTS (
            SELECT 1
            FROM public.expense_groups AS expense_group
            WHERE expense_group.id = draft.group_id
              AND expense_group.status = 'active'
              AND public.expense_active_member_role(
                p_actor_id, expense_group.id
              ) IS NOT NULL
          )
        )
      )
      AND NOT EXISTS ($sql172_new_private_visibility$, E'\r\n', E'\n');
    v_token_count := (pg_catalog.char_length(v_target_source)
      - pg_catalog.char_length(pg_catalog.replace(v_target_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    IF v_token_count <> 1 THEN RAISE EXCEPTION 'expense_sql172_patch_private_visibility'; END IF;
    v_target_source := pg_catalog.replace(v_target_source, v_old_token, v_new_token);

    v_old_token := '      binding.expense_total_minor AS total_minor,';
    v_new_token := pg_catalog.replace($sql172_new_private_edit_attention$
      false AS needs_attention,
      binding.expense_total_minor AS total_minor,$sql172_new_private_edit_attention$,
      E'\r\n', E'\n');
    v_token_count := (pg_catalog.char_length(v_target_source)
      - pg_catalog.char_length(pg_catalog.replace(v_target_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    IF v_token_count <> 1 THEN RAISE EXCEPTION 'expense_sql172_patch_private_edit_attention'; END IF;
    v_target_source := pg_catalog.replace(v_target_source, v_old_token, v_new_token);

    v_old_token := '      publication.title, publication.total_minor, publication.currency,';
    v_new_token := pg_catalog.replace($sql172_new_shared_attention$
      publication.title, false AS needs_attention,
      publication.total_minor, publication.currency,$sql172_new_shared_attention$,
      E'\r\n', E'\n');
    v_token_count := (pg_catalog.char_length(v_target_source)
      - pg_catalog.char_length(pg_catalog.replace(v_target_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    IF v_token_count <> 1 THEN RAISE EXCEPTION 'expense_sql172_patch_shared_attention'; END IF;
    v_target_source := pg_catalog.replace(v_target_source, v_old_token, v_new_token);

    v_old_token := '      expense.title, expense.total_minor, expense.currency,';
    v_new_token := pg_catalog.replace($sql172_new_canonical_attention$
      expense.title, false AS needs_attention,
      expense.total_minor, expense.currency,$sql172_new_canonical_attention$,
      E'\r\n', E'\n');
    v_token_count := (pg_catalog.char_length(v_target_source)
      - pg_catalog.char_length(pg_catalog.replace(v_target_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    IF v_token_count <> 1 THEN RAISE EXCEPTION 'expense_sql172_patch_canonical_attention'; END IF;
    v_target_source := pg_catalog.replace(v_target_source, v_old_token, v_new_token);

    v_old_token := '      ''title'', limited.title,';
    v_new_token := pg_catalog.replace($sql172_new_output_attention$
      'title', limited.title,
      'needs_attention', limited.needs_attention,$sql172_new_output_attention$,
      E'\r\n', E'\n');
    v_token_count := (pg_catalog.char_length(v_target_source)
      - pg_catalog.char_length(pg_catalog.replace(v_target_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    IF v_token_count <> 1 THEN RAISE EXCEPTION 'expense_sql172_patch_output_attention'; END IF;
    v_target_source := pg_catalog.replace(v_target_source, v_old_token, v_new_token);
    -- END SQL172 EXACT TARGET-SOURCE PATCH MANIFEST

    IF pg_catalog.md5(v_target_source) <> v_sql172_target_hash THEN
      RAISE EXCEPTION 'expense_sql172_target_derivation_failed';
    END IF;

    -- BEGIN EXACT SQL172 PROJECTION-ONLY ADAPTER SOURCE
    v_adapter_source := pg_catalog.replace($sql172_adapter_source$
DECLARE
  v_message text;
  v_actor_admitted boolean := false;
  v_nested_event_row_local boolean := false;
BEGIN
  IF p_actor_id IS NULL OR p_draft_id IS NULL THEN
    RAISE EXCEPTION 'expense_sql172_invalid_input';
  END IF;

  -- Admission is deliberately outside the row-local exception boundary.
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);

  SELECT EXISTS (
      SELECT 1 FROM auth.users AS account WHERE account.id = p_actor_id
    ) AND COALESCE(public.expense_has_beta_access(p_actor_id), false)
  INTO v_actor_admitted;
  IF NOT v_actor_admitted THEN
    RAISE EXCEPTION 'expense_sql172_actor_admission_failed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.expense_private_drafts AS draft
    WHERE draft.id = p_draft_id
      AND draft.actor_user_id = p_actor_id
      AND draft.context_type = 'one_off'
      AND draft.current_step = 'split'
      AND CASE
        WHEN pg_catalog.jsonb_typeof(draft.payload->'linkToEvent') = 'boolean'
          THEN (draft.payload->>'linkToEvent')::boolean
        ELSE false
      END
      AND pg_catalog.jsonb_typeof(draft.payload->'eventId') = 'string'
      AND draft.payload->>'eventId'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND CASE
        WHEN pg_catalog.jsonb_typeof(draft.payload->'eventRosterRevision') = 'number'
          AND draft.payload->>'eventRosterRevision' ~ '^[1-9][0-9]*$'
          AND pg_catalog.char_length(draft.payload->>'eventRosterRevision') <= 16
        THEN (draft.payload->>'eventRosterRevision')::numeric
          <= 9007199254740991
        ELSE false
      END
      AND NOT EXISTS (
        SELECT 1
        FROM public.expense_unconfirmed_publications AS publication
        WHERE publication.draft_id = draft.id AND publication.is_live
      )
  ) INTO v_nested_event_row_local;

  BEGIN
    RETURN public.expense_sql159_normalize_private_draft(
      p_actor_id, p_draft_id, false
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message IN (
      'expense_unconfirmed_invalid_draft',
      'expense_unconfirmed_not_found',
      'expense_unconfirmed_event_unavailable',
      'expense_unconfirmed_source_changed',
      'expense_unconfirmed_duplicate_identity',
      'expense_unconfirmed_author_required'
    ) THEN
      RETURN NULL::jsonb;
    END IF;
    IF v_actor_admitted AND v_nested_event_row_local
       AND v_message IN ('teskeid_event_not_found', 'teskeid_event_unavailable') THEN
      RETURN NULL::jsonb;
    END IF;
    RAISE;
  END;
END;$sql172_adapter_source$, E'\r\n', E'\n');
    -- END EXACT SQL172 PROJECTION-ONLY ADAPTER SOURCE

    IF pg_catalog.md5(v_adapter_source) <> v_sql172_adapter_hash THEN
      RAISE EXCEPTION 'expense_sql172_adapter_derivation_failed';
    END IF;

    EXECUTE pg_catalog.format(
      'CREATE FUNCTION public.expense_sql172_project_private_draft(p_actor_id uuid, p_draft_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY INVOKER NOT LEAKPROOF PARALLEL UNSAFE COST 100 SET search_path = %L AS %L',
      '', v_adapter_source
    );
    EXECUTE 'ALTER FUNCTION public.expense_sql172_project_private_draft(uuid,uuid) OWNER TO postgres';
    EXECUTE 'REVOKE ALL ON FUNCTION public.expense_sql172_project_private_draft(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role';
    EXECUTE 'COMMENT ON FUNCTION public.expense_sql172_project_private_draft(uuid,uuid) IS ''SQL172 owner-only projection adapter; contains only reviewed row-local private-draft P0001 outcomes.''';

    EXECUTE pg_catalog.format(
      'CREATE OR REPLACE FUNCTION public.expense_list_dashboard_presentations_v1(p_actor_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER NOT LEAKPROOF PARALLEL UNSAFE COST 100 SET search_path = %L AS %L',
      '', v_target_source
    );
  END IF;

  v_post_target_oid := pg_catalog.to_regprocedure(
    'public.expense_list_dashboard_presentations_v1(uuid)'
  );
  v_post_adapter_oid := pg_catalog.to_regprocedure(
    'public.expense_sql172_project_private_draft(uuid,uuid)'
  );

  SELECT (pg_catalog.count(*) FILTER (
      WHERE routine.proname = 'expense_list_dashboard_presentations_v1'
    ))::integer,
    (pg_catalog.count(*) FILTER (
      WHERE routine.proname = 'expense_sql172_project_private_draft'
    ))::integer
  INTO v_target_overload_count, v_adapter_overload_count
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
    AND routine.proname IN (
      'expense_list_dashboard_presentations_v1',
      'expense_sql172_project_private_draft'
    );

  -- Exact postconditions deliberately repeat the catalog checks after mutation.
  SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
    routine.prokind = 'f'
      AND routine.pronargs = 1
      AND routine.proargnames = ARRAY['p_actor_id']::text[]
      AND routine.proargmodes IS NULL
      AND pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset AND routine.provolatile = 'v'::"char"
      AND routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0 AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL AND routine.provariadic = 0::oid
      AND routine.procost = 100 AND routine.prorows = 0
      AND routine.prosupport = 0::oid AND routine.protrftypes IS NULL
      AND routine.probin IS NULL AND routine.prosqlbody IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql' AND owner_role.rolname = 'postgres'
  INTO v_target_source_hash, v_target_metadata_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
  WHERE routine.oid = v_post_target_oid;

  SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
    routine.prokind = 'f'
      AND routine.pronargs = 2
      AND routine.proargnames = ARRAY['p_actor_id','p_draft_id']::text[]
      AND routine.proargmodes IS NULL
      AND pg_catalog.pg_get_function_arguments(routine.oid)
        = 'p_actor_id uuid, p_draft_id uuid'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset AND routine.provolatile = 'v'::"char"
      AND NOT routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0 AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL AND routine.provariadic = 0::oid
      AND routine.procost = 100 AND routine.prorows = 0
      AND routine.prosupport = 0::oid AND routine.protrftypes IS NULL
      AND routine.probin IS NULL AND routine.prosqlbody IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql' AND owner_role.rolname = 'postgres'
  INTO v_adapter_source_hash, v_adapter_metadata_exact
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
  WHERE routine.oid = v_post_adapter_oid;

  WITH roles AS MATERIALIZED (
    SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
      pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
      pg_catalog.to_regrole('anon')::oid AS anon_oid,
      pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
  ), expected_target_acl(
    grantee, grantor, privilege_type, is_grantable
  ) AS MATERIALIZED (
    SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
    UNION ALL
    SELECT service_role_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
  ), target_acl AS MATERIALIZED (
    SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl WHERE routine.oid = v_post_target_oid
  ), adapter_acl AS MATERIALIZED (
    SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl WHERE routine.oid = v_post_adapter_oid
  )
  SELECT COALESCE(
      roles.postgres_oid IS NOT NULL
      AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL
      AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM target_acl) = 2
      AND NOT EXISTS (
        SELECT target.* FROM target_acl AS target
        EXCEPT ALL
        SELECT expected.* FROM expected_target_acl AS expected
      )
      AND NOT EXISTS (
        SELECT expected.* FROM expected_target_acl AS expected
        EXCEPT ALL
        SELECT target.* FROM target_acl AS target
      )
      AND pg_catalog.has_function_privilege(
        roles.postgres_oid, v_post_target_oid, 'EXECUTE'
      )
      AND pg_catalog.has_function_privilege(
        roles.service_role_oid, v_post_target_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, v_post_target_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, v_post_target_oid, 'EXECUTE'
      ), false
    ), COALESCE(
      (SELECT pg_catalog.count(*) FROM adapter_acl) = 1
      AND NOT EXISTS (
        SELECT 1 FROM adapter_acl
        WHERE grantee IS DISTINCT FROM pg_catalog.to_regrole('postgres')::oid
          OR grantor IS DISTINCT FROM pg_catalog.to_regrole('postgres')::oid
          OR privilege_type IS DISTINCT FROM 'EXECUTE' OR is_grantable
      )
      AND pg_catalog.has_function_privilege(
        roles.postgres_oid, v_post_adapter_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.service_role_oid, v_post_adapter_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.anon_oid, v_post_adapter_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        roles.authenticated_oid, v_post_adapter_oid, 'EXECUTE'
      ), false
    )
  INTO v_target_acl_exact, v_adapter_acl_exact
  FROM roles;

  WITH observed(signature, routine_oid) AS MATERIALIZED (
    VALUES
      ('target'::text, v_post_target_oid),
      ('adapter'::text, v_post_adapter_oid)
  ), expected_dependencies(
    signature, classid, objid, objsubid,
    refclassid, refobjid, refobjsubid, deptype
  ) AS MATERIALIZED (
    SELECT observed.signature,
      'pg_catalog.pg_proc'::pg_catalog.regclass::oid,
      observed.routine_oid, 0,
      'pg_catalog.pg_namespace'::pg_catalog.regclass::oid,
      pg_catalog.to_regnamespace('public')::oid, 0, 'n'::"char"
    FROM observed
    UNION ALL
    SELECT observed.signature,
      'pg_catalog.pg_proc'::pg_catalog.regclass::oid,
      observed.routine_oid, 0,
      'pg_catalog.pg_language'::pg_catalog.regclass::oid,
      language_row.oid, 0, 'n'::"char"
    FROM observed
    CROSS JOIN pg_catalog.pg_language AS language_row
    WHERE language_row.lanname = 'plpgsql'
  ), actual_dependencies AS MATERIALIZED (
    SELECT observed.signature, dependency.classid, dependency.objid,
      dependency.objsubid, dependency.refclassid, dependency.refobjid,
      dependency.refobjsubid, dependency.deptype
    FROM observed
    JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
     AND dependency.objid = observed.routine_oid
  ), exact AS MATERIALIZED (
    SELECT observed.signature,
      (SELECT pg_catalog.count(*) FROM expected_dependencies AS expected
        WHERE expected.signature = observed.signature) = 2
      AND (SELECT pg_catalog.count(*) FROM actual_dependencies AS actual
        WHERE actual.signature = observed.signature) = 2
      AND NOT EXISTS (
        SELECT expected.classid, expected.objid, expected.objsubid,
          expected.refclassid, expected.refobjid, expected.refobjsubid,
          expected.deptype
        FROM expected_dependencies AS expected
        WHERE expected.signature = observed.signature
        EXCEPT ALL
        SELECT actual.classid, actual.objid, actual.objsubid,
          actual.refclassid, actual.refobjid, actual.refobjsubid,
          actual.deptype
        FROM actual_dependencies AS actual
        WHERE actual.signature = observed.signature
      )
      AND NOT EXISTS (
        SELECT actual.classid, actual.objid, actual.objsubid,
          actual.refclassid, actual.refobjid, actual.refobjsubid,
          actual.deptype
        FROM actual_dependencies AS actual
        WHERE actual.signature = observed.signature
        EXCEPT ALL
        SELECT expected.classid, expected.objid, expected.objsubid,
          expected.refclassid, expected.refobjid, expected.refobjsubid,
          expected.deptype
        FROM expected_dependencies AS expected
        WHERE expected.signature = observed.signature
      ) AS dependencies_exact
    FROM observed
  )
  SELECT COALESCE(pg_catalog.bool_and(dependencies_exact)
      FILTER (WHERE signature = 'target'), false),
    COALESCE(pg_catalog.bool_and(dependencies_exact)
      FILTER (WHERE signature = 'adapter'), false)
  INTO v_target_dependencies_exact, v_adapter_dependencies_exact
  FROM exact;

  -- Re-run the same immutable V246 helper/relation closure after all DDL.
  EXECUTE v_lineage_query
  INTO v_lineage_source_hashes_exact, v_lineage_metadata_exact,
    v_lineage_acls_exact, v_catalog_lineage_exact, v_relation_lineage_exact;

  IF v_post_target_oid IS NULL OR v_post_adapter_oid IS NULL
     OR v_post_target_oid IS DISTINCT FROM v_target_oid
     OR (v_state = 'EXACT_INSTALLED'
       AND v_post_adapter_oid IS DISTINCT FROM v_adapter_oid)
     OR v_target_overload_count <> 1 OR v_adapter_overload_count <> 1
     OR v_target_source_hash IS DISTINCT FROM v_sql172_target_hash
     OR v_adapter_source_hash IS DISTINCT FROM v_sql172_adapter_hash
     OR NOT COALESCE(v_target_metadata_exact, false)
     OR NOT COALESCE(v_adapter_metadata_exact, false)
     OR NOT COALESCE(v_target_acl_exact, false)
     OR NOT COALESCE(v_adapter_acl_exact, false)
     OR NOT COALESCE(v_target_dependencies_exact, false)
     OR NOT COALESCE(v_adapter_dependencies_exact, false)
     OR NOT COALESCE(v_lineage_source_hashes_exact, false)
     OR NOT COALESCE(v_lineage_metadata_exact, false)
     OR NOT COALESCE(v_lineage_acls_exact, false)
     OR NOT COALESCE(v_catalog_lineage_exact, false)
     OR NOT COALESCE(v_relation_lineage_exact, false) THEN
    RAISE EXCEPTION 'expense_sql172_postcondition_failed';
  END IF;
END;
$sql172_private_projection_compatibility$;
