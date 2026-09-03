-- SQL171 AGGREGATE PROJECTION-HELPER DIAGNOSTIC TEMPLATE: bounded read-only repair-gate evidence.
-- Replace the single typed placeholder privately before one separately authorized manual run.
-- The statement invokes only frozen read-only helpers and emits one paste-safe P1701 JSON result.
-- QUERY_CANCELED and ASSERT_FAILURE are intentionally not caught by WHEN OTHERS.
DO $sql171_aggregate_diagnostic$
DECLARE
  p_actor_id uuid;
  v_js_whitespace constant text :=
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680' ||
    U&'\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A' ||
    U&'\2028\2029\202F\205F\3000\FEFF';
  v_email_shaped_pattern constant text :=
    U&'(^|[\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF])' ||
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF@]+@' ||
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF@]+[.]' ||
    U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF@]+' ||
    U&'($|[\0009-\000D\0020\00A0\1680\2000-\200A\2028-\2029\202F\205F\3000\FEFF])';

  v_executor_exact boolean := false;
  v_source_hashes_exact boolean := false;
  v_function_metadata_exact boolean := false;
  v_function_acls_exact boolean := false;
  v_catalog_lineage_exact boolean := false;
  v_relation_lineage_exact boolean := false;
  v_actor_account_exists boolean;
  v_actor_beta_access boolean;
  v_identity_binding_conflict boolean;

  v_private_row_domain_status text := 'not_run';
  v_private_row_count integer;
  v_private_stale_group_context_count integer;
  v_private_unsafe_title_count integer;

  v_private_creation_domain_status text := 'not_run';
  v_private_creation_draft_ids uuid[];
  v_private_creation_probe_count integer;
  v_private_creation_attempted_count integer;
  v_private_creation_success_count integer;
  v_private_creation_known_rejection_count integer;
  v_private_invalid_draft_count integer;
  v_private_not_found_count integer;
  v_private_event_unavailable_count integer;
  v_private_source_changed_count integer;
  v_private_duplicate_identity_count integer;
  v_private_author_required_count integer;
  v_private_event_dependency_not_found_count integer;
  v_private_event_dependency_unavailable_count integer;
  v_private_unexpected_p0001_count integer;
  v_private_non_p0001_count integer;

  v_live_publication_domain_status text := 'not_run';
  v_live_publication_actor_ids uuid[];
  v_live_publication_draft_ids uuid[];
  v_live_publication_probe_count integer;
  v_live_publication_attempted_count integer;
  v_live_publication_success_count integer;
  v_live_publication_p0001_count integer;
  v_live_publication_non_p0001_count integer;

  v_settlement_domain_status text := 'not_run';
  v_settlement_group_ids uuid[];
  v_settlement_probe_count integer;
  v_settlement_attempted_count integer;
  v_settlement_success_count integer;
  v_settlement_p0001_count integer;
  v_settlement_non_p0001_count integer;

  v_probe_actor_id uuid;
  v_probe_draft_id uuid;
  v_probe_group_id uuid;
  v_probe_index integer;
  v_nested_event_row_local boolean;
  v_diagnostic_invariants_exact boolean := false;
  v_classification text := 'aggregate_stop';
  v_repair_gate text := 'stop';
  v_stop_reason text;
  v_stage text := 'actor_input';
  v_sqlstate text;
  v_error_category text;
BEGIN
  BEGIN
    p_actor_id := '__STEBBI_PRIVATE_ACTOR_UUID__'::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_stop_reason := 'actor_input_exception';
    v_sqlstate := SQLSTATE;
  END;

  IF v_stop_reason IS NULL THEN
    v_stage := 'catalog_lineage';
    v_executor_exact := current_user = 'postgres' AND session_user = 'postgres';
    IF NOT v_executor_exact THEN
      v_stop_reason := 'executor_mismatch';
    END IF;
  END IF;

  IF v_stop_reason IS NULL THEN
    BEGIN
      -- BEGIN EXACT SQL171 CATALOG LINEAGE GATE
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
          ('target','public.expense_list_dashboard_presentations_v1(uuid)',
            'p_actor_id uuid','jsonb','aad418eeda9d6b1dfe073c4109723d88',
            'plpgsql','v',true,false,'u',false,0,NULL::text[],true),
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
                    dependency.deptype = 'n'
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
      SELECT pg_catalog.count(check_row.oid) = 30
          AND COALESCE(pg_catalog.bool_and(check_row.source_exact), false),
        pg_catalog.count(check_row.oid) = 30
          AND COALESCE(pg_catalog.bool_and(check_row.metadata_exact), false),
        pg_catalog.count(check_row.oid) = 30
          AND COALESCE(pg_catalog.bool_and(check_row.acl_exact), false),
        pg_catalog.count(check_row.oid) = 30
          AND COALESCE(pg_catalog.bool_and(
            check_row.source_exact AND check_row.metadata_exact
              AND check_row.acl_exact
          ), false),
        pg_catalog.bool_and(
          relation_checks.relations_exact AND column_checks.columns_exact
        )
      INTO v_source_hashes_exact, v_function_metadata_exact,
        v_function_acls_exact, v_catalog_lineage_exact,
        v_relation_lineage_exact
      FROM function_checks AS check_row
      CROSS JOIN relation_checks CROSS JOIN column_checks;

      IF NOT COALESCE(v_catalog_lineage_exact, false)
         OR NOT COALESCE(v_relation_lineage_exact, false) THEN
        v_stop_reason := 'lineage_mismatch';
      END IF;
      -- END EXACT SQL171 CATALOG LINEAGE GATE
    EXCEPTION WHEN OTHERS THEN
      v_stop_reason := 'lineage_exception';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_stop_reason IS NULL THEN
    v_stage := 'actor_admission';
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM auth.users AS account WHERE account.id = p_actor_id
      ) INTO v_actor_account_exists;
      IF v_actor_account_exists THEN
        SELECT public.expense_has_beta_access(p_actor_id)
        INTO v_actor_beta_access;
      END IF;
      IF NOT COALESCE(v_actor_account_exists, false)
         OR NOT COALESCE(v_actor_beta_access, false) THEN
        v_stop_reason := 'actor_unavailable';
      ELSE
        PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
        PERFORM public.expense_assert_beta_actor(p_actor_id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_stop_reason := 'actor_admission_exception';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_stop_reason IS NULL THEN
    v_stage := 'identity_binding';
    BEGIN
      v_identity_binding_conflict := EXISTS (
        SELECT 1
        FROM public.expense_group_members AS member
        JOIN public.expense_member_identity_bindings AS identity_binding
          ON identity_binding.group_id = member.group_id
         AND identity_binding.member_id = member.id
        JOIN public.expenses AS expense ON expense.group_id = member.group_id
        JOIN public.expense_group_members AS actor_member
          ON actor_member.group_id = expense.group_id
         AND actor_member.user_id = p_actor_id
         AND actor_member.status = 'active'
        WHERE member.user_id IS NOT NULL
          AND identity_binding.target_user_id IS NOT NULL
          AND member.user_id IS DISTINCT FROM identity_binding.target_user_id
      );
      IF v_identity_binding_conflict THEN
        v_stop_reason := 'identity_binding_conflict';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_stop_reason := 'identity_binding_exception';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_stop_reason IS NULL THEN
    v_stage := 'private_row_domain';
    BEGIN
      -- BEGIN EXACT SQL171 PRIVATE-CREATION ROW DOMAIN
      WITH private_creation_row_domain AS MATERIALIZED (
        SELECT draft.id AS draft_id,
          draft.context_type,
          draft.group_id,
          pg_catalog.btrim(draft.payload->>'title') AS emitted_title
        FROM public.expense_private_drafts AS draft
        WHERE draft.actor_user_id = p_actor_id
          AND draft.context_type IN ('one_off', 'group')
          AND NOT EXISTS (
            SELECT 1
            FROM public.expense_unconfirmed_publications AS publication
            WHERE publication.draft_id = draft.id
              AND publication.is_live
          )
      )
      -- END EXACT SQL171 PRIVATE-CREATION ROW DOMAIN
      , private_creation_row_bounded AS MATERIALIZED (
        SELECT domain.*
        FROM private_creation_row_domain AS domain
        ORDER BY domain.draft_id
        LIMIT 101
      )
      SELECT pg_catalog.count(*)::integer,
        pg_catalog.count(*) FILTER (
          WHERE domain.context_type = 'group'
            AND NOT EXISTS (
              SELECT 1
              FROM public.expense_groups AS expense_group
              WHERE expense_group.id = domain.group_id
                AND expense_group.status = 'active'
                AND public.expense_active_member_role(
                  p_actor_id, expense_group.id
                ) IS NOT NULL
            )
        )::integer,
        pg_catalog.count(*) FILTER (
          WHERE domain.emitted_title IS NULL
            OR domain.emitted_title IS DISTINCT FROM
              pg_catalog.btrim(domain.emitted_title, v_js_whitespace)
            OR (
              2 * pg_catalog.char_length(domain.emitted_title)
              - pg_catalog.char_length(pg_catalog.regexp_replace(
                  domain.emitted_title,
                  U&'[\+010000-\+10FFFF]',
                  '', 'g'
                ))
            ) NOT BETWEEN 1 AND 200
            OR domain.emitted_title
              ~ U&'[\0001-\001F\007F-\009F\202A-\202E\2066-\2069]'
            OR domain.emitted_title ~ v_email_shaped_pattern
        )::integer
      INTO v_private_row_count, v_private_stale_group_context_count,
        v_private_unsafe_title_count
      FROM private_creation_row_bounded AS domain;
      v_private_row_domain_status := CASE WHEN v_private_row_count = 101
        THEN 'over_limit' ELSE 'ready' END;
    EXCEPTION WHEN OTHERS THEN
      v_private_row_domain_status := 'exception';
      v_stop_reason := 'domain_exception';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_stop_reason IS NULL THEN
    v_stage := 'private_creation_domain';
    BEGIN
      -- BEGIN EXACT SQL171 PRIVATE-CREATION NORMALIZER DOMAIN
      WITH private_creation_probe_domain AS MATERIALIZED (
        SELECT draft.id AS draft_id
        FROM public.expense_private_drafts AS draft
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN pg_catalog.jsonb_typeof(draft.payload->'total') = 'string'
              THEN pg_catalog.regexp_replace(
                pg_catalog.btrim(draft.payload->>'total'), '[[:space:]]+', '', 'g'
              )
            ELSE NULL
          END AS raw_total
        ) AS raw ON true
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN raw.raw_total ~ '^[0-9]+([.,][0-9]+)?$'
              AND NOT (
                pg_catalog.strpos(raw.raw_total, '.') > 0
                AND pg_catalog.strpos(raw.raw_total, ',') > 0
              )
              THEN pg_catalog.replace(raw.raw_total, ',', '.')::numeric
            ELSE NULL
          END AS major_amount
        ) AS parsed ON true
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN draft.payload->>'currency' = 'ISK'
              AND parsed.major_amount > 0
              AND pg_catalog.scale(parsed.major_amount) = 0
              AND parsed.major_amount <= 9007199254740991
              THEN parsed.major_amount::bigint
            WHEN draft.payload->>'currency' IN ('EUR','USD','GBP','DKK','NOK','SEK')
              AND parsed.major_amount > 0
              AND pg_catalog.scale(parsed.major_amount) <= 2
              AND parsed.major_amount * 100 <= 9007199254740991
              THEN (parsed.major_amount * 100)::bigint
            ELSE NULL
          END AS total_minor
        ) AS summary ON true
        WHERE draft.actor_user_id = p_actor_id
          AND draft.context_type IN ('one_off', 'group')
          AND NOT EXISTS (
            SELECT 1
            FROM public.expense_unconfirmed_publications AS publication
            WHERE publication.draft_id = draft.id
              AND publication.is_live
          )
          AND draft.current_step = 'split'
          AND summary.total_minor IS NOT NULL
      )
      -- END EXACT SQL171 PRIVATE-CREATION NORMALIZER DOMAIN
      , private_creation_probe_bounded AS MATERIALIZED (
        SELECT domain.draft_id
        FROM private_creation_probe_domain AS domain
        ORDER BY domain.draft_id
        LIMIT 101
      )
      SELECT COALESCE(
        pg_catalog.array_agg(domain.draft_id ORDER BY domain.draft_id),
        ARRAY[]::uuid[]
      )
      INTO v_private_creation_draft_ids
      FROM private_creation_probe_bounded AS domain;
      v_private_creation_probe_count :=
        pg_catalog.cardinality(v_private_creation_draft_ids);
      v_private_creation_domain_status := CASE
        WHEN v_private_creation_probe_count = 101 THEN 'over_limit'
        ELSE 'ready' END;
    EXCEPTION WHEN OTHERS THEN
      v_private_creation_domain_status := 'exception';
      v_stop_reason := 'domain_exception';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_stop_reason IS NULL THEN
    v_stage := 'live_publication_domain';
    BEGIN
      -- BEGIN EXACT SQL171 LIVE-PUBLICATION NORMALIZER DOMAIN
      WITH exact_bindings AS MATERIALIZED (
        SELECT binding.draft_id
        FROM public.expense_edit_revision_bindings AS binding
        JOIN public.expense_private_drafts AS draft
          ON draft.id = binding.draft_id
         AND draft.context_type = 'edit'
         AND draft.expense_id = binding.expense_id
         AND draft.group_id = binding.group_id
         AND draft.actor_user_id = binding.actor_user_id
        JOIN public.expenses AS expense
          ON expense.id = binding.expense_id
         AND expense.group_id = binding.group_id
         AND expense.status = 'active'
        LEFT JOIN public.expense_unconfirmed_publications AS publication
          ON publication.draft_id = binding.draft_id
        WHERE (binding.mode = 'private'
            AND publication.is_live IS NOT DISTINCT FROM false)
           OR (binding.mode = 'private' AND publication.draft_id IS NULL)
           OR (binding.mode = 'shared' AND publication.is_live IS TRUE
             AND publication.actor_user_id = binding.actor_user_id
             AND publication.context_type = 'group'
             AND publication.group_id = binding.group_id)
      ), actor_relevant_live_publications AS MATERIALIZED (
        SELECT publication.*
        FROM public.expense_unconfirmed_publications AS publication
        WHERE publication.is_live
          AND (
            publication.actor_user_id = p_actor_id
            OR public.expense_sql159_audience_allows(
              p_actor_id, publication.draft_id
            )
          )
      ), live_publication_probe_domain AS MATERIALIZED (
        SELECT publication.actor_user_id, publication.draft_id
        FROM actor_relevant_live_publications AS publication
        JOIN public.expense_private_drafts AS draft
          ON draft.id = publication.draft_id
         AND draft.actor_user_id = publication.actor_user_id
        LEFT JOIN exact_bindings AS binding
          ON binding.draft_id = publication.draft_id
        WHERE binding.draft_id IS NULL
          AND publication.source_draft_version = draft.version
      )
      -- END EXACT SQL171 LIVE-PUBLICATION NORMALIZER DOMAIN
      , live_publication_probe_bounded AS MATERIALIZED (
        SELECT domain.actor_user_id, domain.draft_id
        FROM live_publication_probe_domain AS domain
        ORDER BY domain.draft_id
        LIMIT 101
      )
      SELECT COALESCE(
          pg_catalog.array_agg(domain.actor_user_id ORDER BY domain.draft_id),
          ARRAY[]::uuid[]
        ),
        COALESCE(
          pg_catalog.array_agg(domain.draft_id ORDER BY domain.draft_id),
          ARRAY[]::uuid[]
        )
      INTO v_live_publication_actor_ids, v_live_publication_draft_ids
      FROM live_publication_probe_bounded AS domain;
      v_live_publication_probe_count :=
        pg_catalog.cardinality(v_live_publication_draft_ids);
      v_live_publication_domain_status := CASE
        WHEN v_live_publication_probe_count = 101 THEN 'over_limit'
        ELSE 'ready' END;
    EXCEPTION WHEN OTHERS THEN
      v_live_publication_domain_status := 'exception';
      v_stop_reason := 'domain_exception';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_stop_reason IS NULL THEN
    v_stage := 'settlement_domain';
    BEGIN
      -- BEGIN EXACT SQL171 SETTLEMENT-CONSISTENCY DOMAIN
      WITH actor_groups AS MATERIALIZED (
        SELECT DISTINCT member.group_id
        FROM public.expense_group_members AS member
        WHERE member.user_id = p_actor_id
          AND member.status = 'active'
      ), settlement_probe_domain AS MATERIALIZED (
        SELECT expense.id AS expense_id, expense.group_id
        FROM public.expenses AS expense
        JOIN actor_groups AS actor_group
          ON actor_group.group_id = expense.group_id
        JOIN public.expense_groups AS group_row
          ON group_row.id = expense.group_id
        WHERE group_row.status IN ('active', 'settling', 'settled', 'closed')
          AND NOT EXISTS (
            SELECT 1
            FROM public.expense_edit_revision_bindings AS binding
            WHERE binding.expense_id = expense.id
          )
          AND (
            CASE WHEN expense.status = 'cancelled' THEN false ELSE true END
          )
      )
      -- END EXACT SQL171 SETTLEMENT-CONSISTENCY DOMAIN
      , settlement_probe_bounded AS MATERIALIZED (
        SELECT domain.expense_id, domain.group_id
        FROM settlement_probe_domain AS domain
        ORDER BY domain.expense_id
        LIMIT 101
      )
      SELECT COALESCE(
        pg_catalog.array_agg(domain.group_id ORDER BY domain.expense_id),
        ARRAY[]::uuid[]
      )
      INTO v_settlement_group_ids
      FROM settlement_probe_bounded AS domain;
      v_settlement_probe_count := pg_catalog.cardinality(v_settlement_group_ids);
      v_settlement_domain_status := CASE
        WHEN v_settlement_probe_count = 101 THEN 'over_limit'
        ELSE 'ready' END;
    EXCEPTION WHEN OTHERS THEN
      v_settlement_domain_status := 'exception';
      v_stop_reason := 'domain_exception';
      v_sqlstate := SQLSTATE;
    END;
  END IF;

  IF v_stop_reason IS NULL AND (
       v_private_row_domain_status = 'over_limit'
       OR v_private_creation_domain_status = 'over_limit'
       OR v_live_publication_domain_status = 'over_limit'
       OR v_settlement_domain_status = 'over_limit'
     ) THEN
    v_stop_reason := 'domain_over_limit';
  END IF;

  IF v_stop_reason IS NULL THEN
    v_private_creation_attempted_count := 0;
    v_private_creation_success_count := 0;
    v_private_invalid_draft_count := 0;
    v_private_not_found_count := 0;
    v_private_event_unavailable_count := 0;
    v_private_source_changed_count := 0;
    v_private_duplicate_identity_count := 0;
    v_private_author_required_count := 0;
    v_private_event_dependency_not_found_count := 0;
    v_private_event_dependency_unavailable_count := 0;
    v_private_unexpected_p0001_count := 0;
    v_private_non_p0001_count := 0;
    v_stage := 'private_creation_probe';

    -- BEGIN PRIVATE ROW-LOCAL CLASSIFIER
    FOREACH v_probe_draft_id IN ARRAY v_private_creation_draft_ids LOOP
      DECLARE
        v_private_message text;
      BEGIN
        v_private_creation_attempted_count :=
          v_private_creation_attempted_count + 1;
        BEGIN
          PERFORM public.expense_sql159_normalize_private_draft(
            p_actor_id, v_probe_draft_id, false
          );
          v_private_creation_success_count :=
            v_private_creation_success_count + 1;
        EXCEPTION
          WHEN SQLSTATE 'P0001' THEN
            GET STACKED DIAGNOSTICS v_private_message = MESSAGE_TEXT;
            CASE v_private_message
              WHEN 'expense_unconfirmed_invalid_draft' THEN
                v_private_invalid_draft_count :=
                  v_private_invalid_draft_count + 1;
              WHEN 'expense_unconfirmed_not_found' THEN
                v_private_not_found_count := v_private_not_found_count + 1;
              WHEN 'expense_unconfirmed_event_unavailable' THEN
                v_private_event_unavailable_count :=
                  v_private_event_unavailable_count + 1;
              WHEN 'expense_unconfirmed_source_changed' THEN
                v_private_source_changed_count :=
                  v_private_source_changed_count + 1;
              WHEN 'expense_unconfirmed_duplicate_identity' THEN
                v_private_duplicate_identity_count :=
                  v_private_duplicate_identity_count + 1;
              WHEN 'expense_unconfirmed_author_required' THEN
                v_private_author_required_count :=
                  v_private_author_required_count + 1;
              WHEN 'teskeid_event_not_found' THEN
                SELECT EXISTS (
                    SELECT 1
                    FROM public.expense_private_drafts AS draft
                    WHERE draft.id = v_probe_draft_id
                      AND draft.actor_user_id = p_actor_id
                      AND draft.context_type = 'one_off'
                      AND pg_catalog.jsonb_typeof(
                        draft.payload->'linkToEvent'
                      ) = 'boolean'
                      AND pg_catalog.jsonb_typeof(draft.payload->'eventId') = 'string'
                      AND draft.payload->>'eventId'
                        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                      AND CASE
                        WHEN pg_catalog.jsonb_typeof(
                          draft.payload->'eventRosterRevision'
                        ) = 'number'
                          AND draft.payload->>'eventRosterRevision'
                            ~ '^[1-9][0-9]*$'
                          AND pg_catalog.char_length(
                            draft.payload->>'eventRosterRevision'
                          ) <= 16
                        THEN (draft.payload->>'eventRosterRevision')::numeric
                          <= 9007199254740991
                        ELSE false
                      END
                  )
                  AND EXISTS (
                    SELECT 1 FROM auth.users AS account
                    WHERE account.id = p_actor_id
                  )
                  AND COALESCE(public.expense_has_beta_access(p_actor_id), false)
                INTO v_nested_event_row_local;
                IF v_nested_event_row_local THEN
                  v_private_event_dependency_not_found_count :=
                    v_private_event_dependency_not_found_count + 1;
                ELSE
                  v_private_unexpected_p0001_count :=
                    v_private_unexpected_p0001_count + 1;
                  v_stop_reason := 'private_unexpected_failure';
                  v_sqlstate := 'P0001';
                END IF;
              WHEN 'teskeid_event_unavailable' THEN
                SELECT EXISTS (
                    SELECT 1
                    FROM public.expense_private_drafts AS draft
                    WHERE draft.id = v_probe_draft_id
                      AND draft.actor_user_id = p_actor_id
                      AND draft.context_type = 'one_off'
                      AND pg_catalog.jsonb_typeof(
                        draft.payload->'linkToEvent'
                      ) = 'boolean'
                      AND pg_catalog.jsonb_typeof(draft.payload->'eventId') = 'string'
                      AND draft.payload->>'eventId'
                        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                      AND CASE
                        WHEN pg_catalog.jsonb_typeof(
                          draft.payload->'eventRosterRevision'
                        ) = 'number'
                          AND draft.payload->>'eventRosterRevision'
                            ~ '^[1-9][0-9]*$'
                          AND pg_catalog.char_length(
                            draft.payload->>'eventRosterRevision'
                          ) <= 16
                        THEN (draft.payload->>'eventRosterRevision')::numeric
                          <= 9007199254740991
                        ELSE false
                      END
                  )
                  AND EXISTS (
                    SELECT 1 FROM auth.users AS account
                    WHERE account.id = p_actor_id
                  )
                  AND COALESCE(public.expense_has_beta_access(p_actor_id), false)
                INTO v_nested_event_row_local;
                IF v_nested_event_row_local THEN
                  v_private_event_dependency_unavailable_count :=
                    v_private_event_dependency_unavailable_count + 1;
                ELSE
                  v_private_unexpected_p0001_count :=
                    v_private_unexpected_p0001_count + 1;
                  v_stop_reason := 'private_unexpected_failure';
                  v_sqlstate := 'P0001';
                END IF;
              ELSE
                v_private_unexpected_p0001_count :=
                  v_private_unexpected_p0001_count + 1;
                v_stop_reason := 'private_unexpected_failure';
                v_sqlstate := 'P0001';
            END CASE;
          WHEN OTHERS THEN
            v_private_non_p0001_count := v_private_non_p0001_count + 1;
            v_stop_reason := 'private_unexpected_failure';
            v_sqlstate := SQLSTATE;
        END;
      END;
      EXIT WHEN v_stop_reason IS NOT NULL;
    END LOOP;
    -- END PRIVATE ROW-LOCAL CLASSIFIER
  END IF;

  IF v_private_creation_attempted_count IS NOT NULL THEN
    v_private_creation_known_rejection_count :=
      v_private_invalid_draft_count + v_private_not_found_count
      + v_private_event_unavailable_count + v_private_source_changed_count
      + v_private_duplicate_identity_count + v_private_author_required_count
      + v_private_event_dependency_not_found_count
      + v_private_event_dependency_unavailable_count;
  END IF;

  IF v_stop_reason IS NULL THEN
    v_live_publication_attempted_count := 0;
    v_live_publication_success_count := 0;
    v_live_publication_p0001_count := 0;
    v_live_publication_non_p0001_count := 0;
    v_probe_index := 0;
    v_stage := 'live_publication_probe';
    FOREACH v_probe_draft_id IN ARRAY v_live_publication_draft_ids LOOP
      v_probe_index := v_probe_index + 1;
      v_probe_actor_id := v_live_publication_actor_ids[v_probe_index];
      v_live_publication_attempted_count :=
        v_live_publication_attempted_count + 1;
      BEGIN
        PERFORM public.expense_sql159_normalize_private_draft(
          v_probe_actor_id, v_probe_draft_id, false
        );
        v_live_publication_success_count :=
          v_live_publication_success_count + 1;
      EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
          v_live_publication_p0001_count :=
            v_live_publication_p0001_count + 1;
          v_stop_reason := 'live_publication_failure';
          v_sqlstate := 'P0001';
        WHEN OTHERS THEN
          v_live_publication_non_p0001_count :=
            v_live_publication_non_p0001_count + 1;
          v_stop_reason := 'live_publication_failure';
          v_sqlstate := SQLSTATE;
      END;
      EXIT WHEN v_stop_reason IS NOT NULL;
    END LOOP;
  END IF;

  IF v_stop_reason IS NULL THEN
    v_settlement_attempted_count := 0;
    v_settlement_success_count := 0;
    v_settlement_p0001_count := 0;
    v_settlement_non_p0001_count := 0;
    v_stage := 'settlement_probe';
    FOREACH v_probe_group_id IN ARRAY v_settlement_group_ids LOOP
      v_settlement_attempted_count := v_settlement_attempted_count + 1;
      BEGIN
        PERFORM 1
        FROM public.expense_settlement_eligible_balances_v1(
          v_probe_group_id, false
        );
        v_settlement_success_count := v_settlement_success_count + 1;
      EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
          v_settlement_p0001_count := v_settlement_p0001_count + 1;
          v_stop_reason := 'settlement_failure';
          v_sqlstate := 'P0001';
        WHEN OTHERS THEN
          v_settlement_non_p0001_count :=
            v_settlement_non_p0001_count + 1;
          v_stop_reason := 'settlement_failure';
          v_sqlstate := SQLSTATE;
      END;
      EXIT WHEN v_stop_reason IS NOT NULL;
    END LOOP;
  END IF;

  v_diagnostic_invariants_exact := COALESCE(
    v_private_creation_domain_status = 'ready'
      AND v_live_publication_domain_status = 'ready'
      AND v_settlement_domain_status = 'ready'
      AND v_private_creation_attempted_count = v_private_creation_probe_count
      AND v_private_creation_attempted_count =
        v_private_creation_success_count
        + v_private_creation_known_rejection_count
        + v_private_unexpected_p0001_count + v_private_non_p0001_count
      AND v_private_creation_known_rejection_count =
        v_private_invalid_draft_count + v_private_not_found_count
        + v_private_event_unavailable_count + v_private_source_changed_count
        + v_private_duplicate_identity_count + v_private_author_required_count
        + v_private_event_dependency_not_found_count
        + v_private_event_dependency_unavailable_count
      AND v_live_publication_attempted_count = v_live_publication_probe_count
      AND v_live_publication_attempted_count =
        v_live_publication_success_count + v_live_publication_p0001_count
        + v_live_publication_non_p0001_count
      AND v_settlement_attempted_count = v_settlement_probe_count
      AND v_settlement_attempted_count =
        v_settlement_success_count + v_settlement_p0001_count
        + v_settlement_non_p0001_count,
    false
  );

  IF v_stop_reason IS NULL AND NOT v_diagnostic_invariants_exact THEN
    v_stop_reason := 'diagnostic_invariant_failed';
  END IF;
  IF v_stop_reason IS NULL
     AND v_private_creation_known_rejection_count = 0 THEN
    v_stop_reason := 'failure_not_reproduced';
  END IF;

  IF v_stop_reason IS NULL THEN
    v_classification := 'private_projection_adapter_ready';
    v_repair_gate := 'pass';
    v_stage := 'complete';
  END IF;

  IF v_sqlstate IS NOT NULL THEN
    v_error_category := CASE pg_catalog.left(v_sqlstate, 2)
      WHEN '22' THEN 'data_exception'
      WHEN '23' THEN 'integrity_constraint'
      WHEN '42' THEN 'syntax_or_access_rule'
      WHEN '53' THEN 'insufficient_resources'
      WHEN '54' THEN 'program_limit'
      WHEN '55' THEN 'object_state'
      WHEN '57' THEN 'operator_intervention'
      WHEN 'P0' THEN 'user_defined_exception'
      WHEN 'XX' THEN 'internal_error'
      ELSE 'other'
    END;
  END IF;

  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER
  RAISE EXCEPTION USING
    ERRCODE = 'P1701',
    MESSAGE = pg_catalog.jsonb_build_object(
      'diagnostic_contract_version', 3,
      'classification', v_classification,
      'repair_gate', v_repair_gate,
      'stop_reason', v_stop_reason,
      'stage', v_stage,
      'executor_exact', v_executor_exact,
      'source_hashes_exact', v_source_hashes_exact,
      'function_metadata_exact', v_function_metadata_exact,
      'function_acls_exact', v_function_acls_exact,
      'catalog_lineage_exact', v_catalog_lineage_exact,
      'relation_lineage_exact', v_relation_lineage_exact,
      'actor_account_exists', v_actor_account_exists,
      'actor_beta_access', v_actor_beta_access,
      'identity_binding_conflict', v_identity_binding_conflict,
      'private_row_domain_status', v_private_row_domain_status,
      'private_row_count', v_private_row_count,
      'private_stale_group_context_count', v_private_stale_group_context_count,
      'private_unsafe_title_count', v_private_unsafe_title_count,
      'private_creation_domain_status', v_private_creation_domain_status,
      'private_creation_probe_count', v_private_creation_probe_count,
      'private_creation_attempted_count', v_private_creation_attempted_count,
      'private_creation_success_count', v_private_creation_success_count,
      'private_creation_known_rejection_count',
        v_private_creation_known_rejection_count,
      'private_invalid_draft_count', v_private_invalid_draft_count,
      'private_not_found_count', v_private_not_found_count,
      'private_event_unavailable_count', v_private_event_unavailable_count,
      'private_source_changed_count', v_private_source_changed_count,
      'private_duplicate_identity_count', v_private_duplicate_identity_count,
      'private_author_required_count', v_private_author_required_count,
      'private_event_dependency_not_found_count',
        v_private_event_dependency_not_found_count,
      'private_event_dependency_unavailable_count',
        v_private_event_dependency_unavailable_count,
      'private_unexpected_p0001_count', v_private_unexpected_p0001_count,
      'private_non_p0001_count', v_private_non_p0001_count,
      'live_publication_domain_status', v_live_publication_domain_status,
      'live_publication_probe_count', v_live_publication_probe_count,
      'live_publication_attempted_count', v_live_publication_attempted_count,
      'live_publication_success_count', v_live_publication_success_count,
      'live_publication_p0001_count', v_live_publication_p0001_count,
      'live_publication_non_p0001_count', v_live_publication_non_p0001_count,
      'settlement_domain_status', v_settlement_domain_status,
      'settlement_probe_count', v_settlement_probe_count,
      'settlement_attempted_count', v_settlement_attempted_count,
      'settlement_success_count', v_settlement_success_count,
      'settlement_p0001_count', v_settlement_p0001_count,
      'settlement_non_p0001_count', v_settlement_non_p0001_count,
      'diagnostic_invariants_exact', v_diagnostic_invariants_exact,
      'sqlstate', v_sqlstate,
      'error_category', v_error_category
    )::text;
  -- END SAFE CONTROLLED EXCEPTION PUBLISHER
END;
$sql171_aggregate_diagnostic$;
