-- SQL170 POSTFLIGHT: read-only exact target, ACL, dependency and no-DML verification.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';

WITH
roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
), target AS MATERIALIZED (
  SELECT routine.oid, routine.prosrc,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      = 'dbf8086df87d9574e29a914c7201257b' AS source_hash_exact,
    routine.prokind = 'f' AND routine.pronargs = 1
      AND routine.proargnames = ARRAY['p_actor_id']::text[]
      AND routine.proargmodes IS NULL
      AND pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND routine.provolatile = 'v'::"char" AND routine.prosecdef
      AND NOT routine.proisstrict AND NOT routine.proleakproof
      AND routine.proparallel = 'u'::"char" AND routine.pronargdefaults = 0
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = roles.postgres_oid AS metadata_exact
  FROM roles
  LEFT JOIN pg_catalog.pg_proc AS routine ON routine.oid = pg_catalog.to_regprocedure(
    'public.expense_list_dashboard_presentations_v1(uuid)'
  )
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
), expected_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
  SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
  UNION ALL SELECT service_role_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
), actual_acl AS MATERIALIZED (
  SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
  FROM target JOIN pg_catalog.pg_proc AS routine ON routine.oid = target.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    routine.proacl, pg_catalog.acldefault('f', routine.proowner)
  )) AS acl
), expected_helpers(
  signature, argument_names, arguments, result_type, volatility,
  language_name, source_hash, default_count, argument_modes
) AS MATERIALIZED (
  VALUES
    ('public.teskeid_event_assert_session_actor(uuid)',
      ARRAY['p_actor_id']::text[], 'p_actor_id uuid', 'void', 's'::"char",
      'plpgsql', '30238c0def94d573fd8265fd94da0757', 0, NULL::text[]),
    ('public.expense_assert_beta_actor(uuid)',
      ARRAY['p_actor_id']::text[], 'p_actor_id uuid', 'void', 's'::"char",
      'plpgsql', 'ea6c329f5c13bd7d0bfbd9df41e5931d', 0, NULL::text[]),
    ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)',
      ARRAY['p_actor_id','p_draft_id','p_require_balanced']::text[],
      'p_actor_id uuid, p_draft_id uuid, p_require_balanced boolean',
      'jsonb', 'v'::"char", 'plpgsql',
      '18a6e628bdb1d3c175b515541ab56787', 0, NULL::text[]),
    ('public.expense_sql159_snapshot_is_valid(uuid)',
      ARRAY['p_draft_id']::text[], 'p_draft_id uuid', 'boolean', 's'::"char",
      'sql', 'af4b9f8a5f0b422956fc1d664021baff', 0, NULL::text[]),
    ('public.expense_sql159_audience_allows(uuid,uuid)',
      ARRAY['p_actor_id','p_draft_id']::text[],
      'p_actor_id uuid, p_draft_id uuid', 'boolean', 's'::"char",
      'sql', '9c4af07a07906c4dac6f06da94b42b37', 0, NULL::text[]),
    ('public.expense_settlement_eligible_balances_v1(uuid,boolean)',
      ARRAY['p_group_id','p_include_reported','member_id','currency','amount_minor']::text[],
      'p_group_id uuid, p_include_reported boolean DEFAULT false',
      'TABLE(member_id uuid, currency text, amount_minor bigint)', 's'::"char",
      'plpgsql', 'b58245a47cc0c8e306a8769afa508687', 1,
      ARRAY['i','i','t','t','t']::text[])
), observed_helpers AS MATERIALIZED (
  SELECT expected.*, routine.oid, routine.proowner, routine.proacl,
    routine.prokind, routine.provolatile, routine.prosecdef,
    routine.proisstrict, routine.proleakproof, routine.proparallel,
    routine.pronargdefaults, routine.proargnames,
    routine.proargmodes::text[] AS actual_argument_modes,
    routine.proconfig, language_row.lanname AS actual_language,
    pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
    pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      AS actual_source_hash
  FROM expected_helpers AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
), helper_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 6 AND COALESCE(pg_catalog.bool_and(
      helper.oid IS NOT NULL AND helper.prokind = 'f'
      AND helper.proargnames = helper.argument_names
      AND helper.actual_arguments = helper.arguments
      AND helper.actual_result = helper.result_type
      AND helper.provolatile = helper.volatility
      AND helper.prosecdef AND NOT helper.proisstrict
      AND NOT helper.proleakproof AND helper.proparallel = 'u'::"char"
      AND helper.pronargdefaults = helper.default_count
      AND helper.proconfig = ARRAY['search_path=""']::text[]
      AND helper.actual_language = helper.language_name
      AND helper.actual_source_hash = helper.source_hash
      AND helper.proowner = roles.postgres_oid
      AND helper.actual_argument_modes IS NOT DISTINCT FROM helper.argument_modes
    ), false) AS helper_contracts_exact,
    pg_catalog.count(*) = 6 AND COALESCE(pg_catalog.bool_and(
      (SELECT pg_catalog.count(*) = 1 AND pg_catalog.bool_and(
          acl.grantee = helper.proowner AND acl.grantor = helper.proowner
          AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
        ) FROM pg_catalog.aclexplode(COALESCE(
          helper.proacl, pg_catalog.acldefault('f', helper.proowner)
        )) AS acl)
    ), false) AS helper_acls_exact,
    pg_catalog.count(*) = 6 AND COALESCE(pg_catalog.bool_and(
      EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = helper.oid
          AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
          AND dependency.refobjid = pg_catalog.to_regnamespace('public'))
      AND (helper.language_name = 'sql' OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend AS dependency
        JOIN pg_catalog.pg_language AS language_row
          ON language_row.oid = dependency.refobjid
        WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = helper.oid
          AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
          AND language_row.lanname = helper.language_name
      ))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = helper.oid AND dependency.deptype = 'e')
    ), false) AS helper_dependencies_exact
  FROM observed_helpers AS helper CROSS JOIN roles
), relation_manifest(name, force_rls, expected_nonowner_acl) AS MATERIALIZED (
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
    ('relationship_circle_expense_contexts', true, ARRAY['service_role:SELECT']::text[])
), relation_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 17 AND COALESCE(pg_catalog.bool_and(
      class_row.oid IS NOT NULL AND class_row.relkind = 'r'
      AND class_row.relpersistence = 'p' AND class_row.relrowsecurity
      AND class_row.relforcerowsecurity = manifest.force_rls
      AND owner_role.rolname = 'postgres'
    ), false) AS security_relations_exact,
    pg_catalog.count(*) = 17 AND COALESCE(pg_catalog.bool_and(
      COALESCE((SELECT pg_catalog.array_agg(
          COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type
          ORDER BY (COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type)
            COLLATE pg_catalog."C")::text[]
        FROM pg_catalog.aclexplode(COALESCE(
          class_row.relacl, pg_catalog.acldefault('r', class_row.relowner)
        )) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
        WHERE acl.grantee <> class_row.relowner), ARRAY[]::text[])
        = manifest.expected_nonowner_acl
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          class_row.relacl, pg_catalog.acldefault('r', class_row.relowner)
        )) AS acl
        WHERE acl.grantor <> class_row.relowner OR acl.is_grantable)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = class_row.oid AND attribute.attnum > 0
          AND NOT attribute.attisdropped AND attribute.attacl IS NOT NULL)
    ), false) AS relation_acls_exact
  FROM relation_manifest AS manifest
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass('public.' || manifest.name)
  LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = class_row.relowner
), required_columns(relation_name, column_name, type_name) AS MATERIALIZED (
  VALUES
    ('expense_private_drafts','id','uuid'),('expense_private_drafts','actor_user_id','uuid'),
    ('expense_private_drafts','context_type','text'),('expense_private_drafts','group_id','uuid'),
    ('expense_private_drafts','expense_id','uuid'),('expense_private_drafts','current_step','text'),
    ('expense_private_drafts','payload','jsonb'),('expense_private_drafts','version','bigint'),
    ('expense_private_drafts','created_at','timestamp with time zone'),
    ('expense_private_drafts','updated_at','timestamp with time zone'),
    ('expense_unconfirmed_publications','draft_id','uuid'),
    ('expense_unconfirmed_publications','publication_id','uuid'),
    ('expense_unconfirmed_publications','actor_user_id','uuid'),
    ('expense_unconfirmed_publications','publication_version','bigint'),
    ('expense_unconfirmed_publications','is_live','boolean'),
    ('expense_unconfirmed_publications','source_draft_version','bigint'),
    ('expense_unconfirmed_publications','context_type','text'),
    ('expense_unconfirmed_publications','group_id','uuid'),
    ('expense_unconfirmed_publications','title','text'),
    ('expense_unconfirmed_publications','total_minor','bigint'),
    ('expense_unconfirmed_publications','currency','text'),
    ('expense_unconfirmed_publications','published_at','timestamp with time zone'),
    ('expense_unconfirmed_publications','updated_at','timestamp with time zone'),
    ('expense_unconfirmed_publication_parties','draft_id','uuid'),
    ('expense_unconfirmed_publication_parties','ordinal','smallint'),
    ('expense_unconfirmed_publication_parties','party_key_hash','text'),
    ('expense_unconfirmed_publication_parties','identity_token_hash','text'),
    ('expense_unconfirmed_publication_parties','display_name','text'),
    ('expense_unconfirmed_publication_parties','is_author','boolean'),
    ('expense_unconfirmed_publication_parties','is_payer','boolean'),
    ('expense_unconfirmed_publication_parties','is_participant','boolean'),
    ('expense_unconfirmed_publication_audience','draft_id','uuid'),
    ('expense_unconfirmed_publication_audience','user_id','uuid'),
    ('expense_unconfirmed_publication_audience','identity_token_hash','text'),
    ('expense_edit_revision_bindings','draft_id','uuid'),
    ('expense_edit_revision_bindings','expense_id','uuid'),
    ('expense_edit_revision_bindings','group_id','uuid'),
    ('expense_edit_revision_bindings','actor_user_id','uuid'),
    ('expense_edit_revision_bindings','mode','text'),
    ('expense_groups','id','uuid'),('expense_groups','status','text'),
    ('expense_group_members','id','uuid'),('expense_group_members','group_id','uuid'),
    ('expense_group_members','user_id','uuid'),('expense_group_members','status','text'),
    ('expense_group_members','display_name','text'),
    ('expenses','id','uuid'),('expenses','group_id','uuid'),('expenses','status','text'),
    ('expenses','title','text'),('expenses','total_minor','bigint'),
    ('expenses','currency','text'),('expenses','incurred_on','date'),
    ('expenses','created_at','timestamp with time zone'),
    ('expense_payments','expense_id','uuid'),('expense_payments','member_id','uuid'),
    ('expense_shares','expense_id','uuid'),('expense_shares','member_id','uuid'),
    ('expense_repayments','group_id','uuid'),('expense_repayments','status','text'),
    ('expense_member_identity_bindings','group_id','uuid'),
    ('expense_member_identity_bindings','member_id','uuid'),
    ('expense_member_identity_bindings','target_user_id','uuid'),
    ('relationships','owner_id','uuid'),('relationships','counterpart_user_id','uuid'),
    ('relationships','private_display_name','text'),
    ('profiles','id','uuid'),('profiles','display_name','text'),
    ('relationship_circles','id','uuid'),('relationship_circles','name','text'),
    ('relationship_circles','status','text'),
    ('relationship_circle_members','circle_id','uuid'),
    ('relationship_circle_members','user_id','uuid'),
    ('relationship_circle_members','status','text'),
    ('relationship_circle_expense_contexts','group_id','uuid'),
    ('relationship_circle_expense_contexts','circle_id','uuid')
), column_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 76 AND COALESCE(pg_catalog.bool_and(
      attribute.attnum > 0 AND NOT attribute.attisdropped
      AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        = required.type_name
    ), false) AS relation_columns_exact
  FROM required_columns AS required
  LEFT JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = pg_catalog.to_regclass('public.' || required.relation_name)
   AND attribute.attname = required.column_name
), required_constraints(constraint_name, relation_name, definition) AS MATERIALIZED (
  VALUES
    ('expense_private_drafts_pkey','expense_private_drafts','PRIMARY KEY (id)'),
    ('expense_unconfirmed_publications_pkey','expense_unconfirmed_publications','PRIMARY KEY (draft_id)'),
    ('expense_unconfirmed_publications_publication_id_key','expense_unconfirmed_publications','UNIQUE (publication_id)'),
    ('expense_unconfirmed_publications_actor_draft_key','expense_unconfirmed_publications','UNIQUE (draft_id, actor_user_id)'),
    ('expense_unconfirmed_publication_parties_pkey','expense_unconfirmed_publication_parties','PRIMARY KEY (draft_id, ordinal)'),
    ('expense_unconfirmed_publication_parties_key_unique','expense_unconfirmed_publication_parties','UNIQUE (draft_id, party_key_hash)'),
    ('expense_unconfirmed_publication_parties_identity_unique','expense_unconfirmed_publication_parties','UNIQUE (draft_id, identity_token_hash)'),
    ('expense_unconfirmed_publication_audience_pkey','expense_unconfirmed_publication_audience','PRIMARY KEY (draft_id, user_id)'),
    ('expense_unconfirmed_publication_audience_identity_unique','expense_unconfirmed_publication_audience','UNIQUE (draft_id, identity_token_hash)'),
    ('expense_unconfirmed_publication_audience_party_fk','expense_unconfirmed_publication_audience','FOREIGN KEY (draft_id, identity_token_hash) REFERENCES expense_unconfirmed_publication_parties(draft_id, identity_token_hash) ON DELETE CASCADE'),
    ('expense_edit_revision_bindings_pkey','expense_edit_revision_bindings','PRIMARY KEY (draft_id)'),
    ('expense_edit_revision_bindings_expense_id_key','expense_edit_revision_bindings','UNIQUE (expense_id)'),
    ('expense_edit_revision_bindings_context_unique','expense_edit_revision_bindings','UNIQUE (draft_id, expense_id, group_id, actor_user_id)'),
    ('expense_edit_revision_bindings_draft_id_fkey','expense_edit_revision_bindings','FOREIGN KEY (draft_id) REFERENCES expense_private_drafts(id) ON DELETE RESTRICT'),
    ('expense_edit_revision_bindings_expense_id_fkey','expense_edit_revision_bindings','FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE RESTRICT'),
    ('expense_edit_revision_bindings_group_id_fkey','expense_edit_revision_bindings','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT'),
    ('expense_edit_revision_bindings_actor_user_id_fkey','expense_edit_revision_bindings','FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT'),
    ('expense_groups_pkey','expense_groups','PRIMARY KEY (id)'),
    ('expense_group_members_pkey','expense_group_members','PRIMARY KEY (id)'),
    ('expense_group_members_group_id_id_unique','expense_group_members','UNIQUE (group_id, id)'),
    ('expenses_pkey','expenses','PRIMARY KEY (id)'),
    ('expenses_group_id_id_unique','expenses','UNIQUE (group_id, id)'),
    ('expense_payments_pkey','expense_payments','PRIMARY KEY (expense_id, member_id)'),
    ('expense_shares_pkey','expense_shares','PRIMARY KEY (expense_id, member_id)'),
    ('expense_member_identity_bindings_member_key','expense_member_identity_bindings','UNIQUE (group_id, member_id)'),
    ('expense_member_identity_bindings_member_fk','expense_member_identity_bindings','FOREIGN KEY (group_id, member_id) REFERENCES expense_group_members(group_id, id) ON DELETE CASCADE'),
    ('profiles_pkey','profiles','PRIMARY KEY (id)'),
    ('relationship_circles_pkey','relationship_circles','PRIMARY KEY (id)'),
    ('relationship_circle_expense_contexts_pkey','relationship_circle_expense_contexts','PRIMARY KEY (group_id)'),
    ('relationship_circle_expense_contexts_group_id_fkey','relationship_circle_expense_contexts','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT'),
    ('relationship_circle_expense_contexts_circle_id_fkey','relationship_circle_expense_contexts','FOREIGN KEY (circle_id) REFERENCES relationship_circles(id) ON DELETE RESTRICT')
), constraint_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 31 AND COALESCE(pg_catalog.bool_and(
      constraint_row.oid IS NOT NULL AND constraint_row.convalidated
      AND NOT constraint_row.condeferrable AND NOT constraint_row.condeferred
      AND pg_catalog.replace(
        pg_catalog.pg_get_constraintdef(constraint_row.oid), 'public.', ''
      ) = required.definition
    ), false) AS relation_keys_exact
  FROM required_constraints AS required
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass('public.' || required.relation_name)
   AND constraint_row.conname = required.constraint_name
), required_indexes(index_name, definition_token) AS MATERIALIZED (
  VALUES
    ('relationships_owner_counterpart_user_idx',
      'createuniqueindexrelationships_owner_counterpart_user_idxonrelationshipsusingbtree(owner_id,counterpart_user_id)where(counterpart_user_idisnotnull)'),
    ('relationship_circle_active_user_idx',
      'createuniqueindexrelationship_circle_active_user_idxonrelationship_circle_membersusingbtree(circle_id,user_id)where(status=''active''::text)')
), index_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 2 AND COALESCE(pg_catalog.bool_and(
      index_row.indexrelid IS NOT NULL AND index_row.indisunique
      AND index_row.indisvalid AND index_row.indisready AND index_row.indislive
      AND index_row.indpred IS NOT NULL
      AND pg_catalog.regexp_replace(
        pg_catalog.replace(
          pg_catalog.lower(pg_catalog.pg_get_indexdef(index_row.indexrelid)),
          'public.', ''
        ),
        '[[:space:]";()]', '', 'g'
      ) = pg_catalog.regexp_replace(required.definition_token, '[()]', '', 'g')
    ), false) AS relation_indexes_exact
  FROM required_indexes AS required
  LEFT JOIN pg_catalog.pg_class AS index_class ON index_class.relname = required.index_name
    AND index_class.relnamespace = pg_catalog.to_regnamespace('public')
  LEFT JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid = index_class.oid
), checks AS MATERIALIZED (
  SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    COALESCE(target.metadata_exact, false) AS function_contract_exact,
    COALESCE(target.source_hash_exact, false) AS source_hash_exact,
    COALESCE(
      (SELECT pg_catalog.count(*) FROM actual_acl) = 2
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
      AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND pg_catalog.has_function_privilege(service_role_oid, target.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(anon_oid, target.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(authenticated_oid, target.oid, 'EXECUTE'),
      false
    ) AS acl_exact,
    COALESCE(
      target.prosrc !~* '\m(insert|update|delete|merge|truncate)\M'
        AND target.prosrc !~* '\mexecute\M', false
    ) AS no_dml_exact,
    helper_state.helper_contracts_exact,
    helper_state.helper_acls_exact,
    helper_state.helper_dependencies_exact,
    relation_state.security_relations_exact,
    relation_state.relation_acls_exact,
    column_state.relation_columns_exact,
    constraint_state.relation_keys_exact,
    index_state.relation_indexes_exact,
    COALESCE(EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = target.oid
        AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
        AND dependency.refobjid = pg_catalog.to_regnamespace('public')
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      JOIN pg_catalog.pg_language AS language_row ON language_row.oid = dependency.refobjid
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = target.oid
        AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
        AND language_row.lanname = 'plpgsql'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = target.oid AND dependency.deptype = 'e'
    ), false) AS direct_dependencies_exact
  FROM roles CROSS JOIN target CROSS JOIN helper_state CROSS JOIN relation_state
  CROSS JOIN column_state CROSS JOIN constraint_state CROSS JOIN index_state
)
SELECT executor_ok, function_contract_exact, source_hash_exact, acl_exact,
  no_dml_exact, direct_dependencies_exact, helper_contracts_exact,
  helper_acls_exact, helper_dependencies_exact, security_relations_exact,
  relation_acls_exact, relation_columns_exact, relation_keys_exact,
  relation_indexes_exact,
  executor_ok AND function_contract_exact AND source_hash_exact AND acl_exact
    AND no_dml_exact AND direct_dependencies_exact
    AND helper_contracts_exact AND helper_acls_exact
    AND helper_dependencies_exact AND security_relations_exact
    AND relation_acls_exact AND relation_columns_exact
    AND relation_keys_exact AND relation_indexes_exact AS postconditions_ok
FROM checks;

ROLLBACK;
