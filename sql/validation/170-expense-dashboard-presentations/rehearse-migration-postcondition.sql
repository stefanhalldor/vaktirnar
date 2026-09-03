-- SQL170 POSTCONDITION DIAGNOSTIC REHEARSAL: rollback-only granular installation evidence.
-- Run only after a fresh ABSENT_READY preflight; this never commits the target function.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL transaction_timeout = '60s';
SET LOCAL search_path = '';

SELECT pg_catalog.pg_advisory_xact_lock(104170);

DO $rehearsal_absent$
BEGIN
  IF pg_catalog.to_regprocedure(
       'public.expense_list_dashboard_presentations_v1(uuid)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'expense_sql170_rehearsal_requires_absent_target';
  END IF;
END;
$rehearsal_absent$;

DO $preflight$
DECLARE
  v_helper_contracts_exact boolean;
  v_helper_acls_exact boolean;
  v_helper_dependencies_exact boolean;
  v_security_relations_exact boolean;
  v_relation_acls_exact boolean;
  v_relation_columns_exact boolean;
  v_relation_keys_exact boolean;
  v_relation_indexes_exact boolean;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql170_executor_not_postgres';
  END IF;
  IF pg_catalog.to_regprocedure(
       'public.expense_list_dashboard_presentations_v1(uuid)'
     ) IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
      JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
      WHERE routine.oid = pg_catalog.to_regprocedure(
          'public.expense_list_dashboard_presentations_v1(uuid)'
        )
        AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
          = 'dbf8086df87d9574e29a914c7201257b'
        AND routine.prokind = 'f'
        AND routine.pronargs = 1
        AND routine.proargnames = ARRAY['p_actor_id']::text[]
        AND routine.proargmodes IS NULL
        AND pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'
        AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
        AND routine.provolatile = 'v'::"char"
        AND routine.prosecdef
        AND NOT routine.proisstrict
        AND NOT routine.proleakproof
        AND routine.proparallel = 'u'::"char"
        AND routine.pronargdefaults = 0
        AND routine.proconfig = ARRAY['search_path=""']::text[]
        AND owner_role.rolname = 'postgres'
        AND language_row.lanname = 'plpgsql'
        AND (
          SELECT pg_catalog.count(*) = 2
            AND pg_catalog.bool_and(
              COALESCE(grantee_role.rolname, 'PUBLIC') IN ('postgres', 'service_role')
              AND grantor_role.rolname = 'postgres'
              AND acl.privilege_type = 'EXECUTE'
              AND NOT acl.is_grantable
            )
          FROM pg_catalog.aclexplode(COALESCE(
            routine.proacl, pg_catalog.acldefault('f', routine.proowner)
          )) AS acl
          LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
          JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
        )
    ) THEN
      RAISE EXCEPTION 'expense_sql170_target_drift';
    END IF;
  END IF;
  WITH expected_helpers(
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
  )
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
      AND helper.proowner = pg_catalog.to_regrole('postgres')::oid
      AND helper.actual_argument_modes IS NOT DISTINCT FROM helper.argument_modes
    ), false),
    pg_catalog.count(*) = 6 AND COALESCE(pg_catalog.bool_and(
      (SELECT pg_catalog.count(*) = 1 AND pg_catalog.bool_and(
          acl.grantee = helper.proowner AND acl.grantor = helper.proowner
          AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
        ) FROM pg_catalog.aclexplode(COALESCE(
          helper.proacl, pg_catalog.acldefault('f', helper.proowner)
        )) AS acl)
    ), false),
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
    ), false)
  INTO v_helper_contracts_exact, v_helper_acls_exact,
    v_helper_dependencies_exact
  FROM observed_helpers AS helper;

  IF NOT v_helper_contracts_exact OR NOT v_helper_acls_exact
     OR NOT v_helper_dependencies_exact THEN
    RAISE EXCEPTION 'expense_sql170_predecessor_drift';
  END IF;

  WITH relation_manifest(name, force_rls, expected_nonowner_acl) AS MATERIALIZED (
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
  )
  SELECT relation_state.security_relations_exact,
    relation_state.relation_acls_exact,
    column_state.relation_columns_exact,
    constraint_state.relation_keys_exact,
    index_state.relation_indexes_exact
  INTO v_security_relations_exact, v_relation_acls_exact,
    v_relation_columns_exact, v_relation_keys_exact, v_relation_indexes_exact
  FROM relation_state CROSS JOIN column_state
  CROSS JOIN constraint_state CROSS JOIN index_state;

  IF NOT v_security_relations_exact OR NOT v_relation_acls_exact
     OR NOT v_relation_columns_exact OR NOT v_relation_keys_exact
     OR NOT v_relation_indexes_exact THEN
    RAISE EXCEPTION 'expense_sql170_security_relation_drift';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.expense_list_dashboard_presentations_v1(
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_candidate_count integer;
  v_distinct_candidate_count integer;
  v_invalid_state_count integer;
  v_rows jsonb;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
    );
  END IF;
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.expense_assert_beta_actor(p_actor_id);

  -- Direct member identity and exact binding identity may coexist only when
  -- they prove the same user. Never choose one side of conflicting evidence.
  IF EXISTS (
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
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
    );
  END IF;

  WITH actor_groups AS (
    SELECT DISTINCT member.group_id
    FROM public.expense_group_members AS member
    WHERE member.user_id = p_actor_id AND member.status = 'active'
  ),
  exact_bindings AS (
    SELECT binding.*, draft.version AS draft_version,
      draft.payload, draft.created_at AS draft_created_at,
      draft.updated_at AS draft_updated_at,
      publication.publication_id, publication.publication_version,
      publication.is_live, publication.title AS publication_title,
      publication.total_minor AS publication_total_minor,
      publication.currency AS publication_currency,
      publication.updated_at AS publication_updated_at,
      publication.published_at, publication.source_draft_version,
      expense.title AS expense_title,
      expense.total_minor AS expense_total_minor,
      expense.currency AS expense_currency
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
    WHERE (binding.mode = 'private' AND publication.is_live IS NOT DISTINCT FROM false)
       OR (binding.mode = 'private' AND publication.draft_id IS NULL)
       OR (binding.mode = 'shared' AND publication.is_live IS TRUE
         AND publication.actor_user_id = binding.actor_user_id
         AND publication.context_type = 'group'
         AND publication.group_id = binding.group_id)
  ),
  invalid_visible_bindings AS (
    SELECT binding.draft_id
    FROM public.expense_edit_revision_bindings AS binding
    JOIN public.expenses AS expense
      ON expense.id = binding.expense_id
     AND expense.group_id = binding.group_id
    JOIN actor_groups AS actor_group
      ON actor_group.group_id = expense.group_id
    WHERE (
        binding.actor_user_id = p_actor_id
        OR public.expense_sql159_audience_allows(p_actor_id, binding.draft_id)
      )
      AND NOT EXISTS (
      SELECT 1
      FROM exact_bindings AS exact_binding
      WHERE exact_binding.draft_id = binding.draft_id
        AND exact_binding.expense_id = binding.expense_id
        AND exact_binding.group_id = binding.group_id
        AND exact_binding.actor_user_id = binding.actor_user_id
    )
  ),
  actor_relevant_live_publications AS (
    SELECT publication.*
    FROM public.expense_unconfirmed_publications AS publication
    WHERE publication.is_live
      AND (
        publication.actor_user_id = p_actor_id
        OR public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
      )
  ),
  visible_live_publications AS (
    SELECT publication.*
    FROM actor_relevant_live_publications AS publication
    WHERE public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
  ),
  live_publication_sources AS (
    SELECT publication.draft_id, publication.context_type,
      draft.version AS current_draft_version, source.normalized,
      source.normalized IS NOT NULL
        AND (source.normalized->>'draft_version')::bigint
          = publication.source_draft_version
        AND source.normalized->>'shareable_fingerprint'
          = publication.shareable_fingerprint
        AND source.normalized->>'authority_fingerprint'
          = publication.authority_fingerprint
        AND source.normalized->>'context_type' = publication.context_type
        AND (source.normalized->>'group_id')::uuid
          IS NOT DISTINCT FROM publication.group_id
        AND (source.normalized->>'event_id')::uuid
          IS NOT DISTINCT FROM publication.event_id
        AND (source.normalized->>'event_roster_revision')::bigint
          IS NOT DISTINCT FROM publication.event_roster_revision
        AND (source.normalized->>'link_to_event')::boolean
          IS NOT DISTINCT FROM publication.link_to_event
        AND source.normalized->>'visibility' = publication.visibility
        AND source.normalized->>'title' = publication.title
        AND (source.normalized->>'total_minor')::bigint = publication.total_minor
        AND source.normalized->>'currency' = publication.currency
        AND (source.normalized->>'incurred_on')::date = publication.incurred_on
        AND source.normalized->>'allocation_state' = publication.allocation_state
        AND source.normalized->'parties' = (
          SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'ordinal', party.ordinal,
            'party_key_hash', party.party_key_hash,
            'identity_token_hash', party.identity_token_hash,
            'display_name', party.display_name,
            'is_author', party.is_author,
            'is_payer', party.is_payer,
            'is_participant', party.is_participant,
            'paid_minor', party.paid_minor,
            'share_minor', party.share_minor
          ) ORDER BY party.ordinal), '[]'::jsonb)
          FROM public.expense_unconfirmed_publication_parties AS party
          WHERE party.draft_id = publication.draft_id
        )
        AND (
          SELECT COALESCE(pg_catalog.jsonb_agg(normalized_audience.value
            ORDER BY normalized_audience.value->>'user_id' COLLATE pg_catalog."C"),
            '[]'::jsonb)
          FROM pg_catalog.jsonb_array_elements(
            source.normalized->'audience'
          ) AS normalized_audience(value)
        ) = (
          SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'user_id', audience.user_id,
            'audience_kind', audience.audience_kind,
            'identity_token_hash', audience.identity_token_hash,
            'binding_id', audience.binding_id,
            'binding_generation', audience.binding_generation
          ) ORDER BY audience.user_id::text COLLATE pg_catalog."C"), '[]'::jsonb)
          FROM public.expense_unconfirmed_publication_audience AS audience
          WHERE audience.draft_id = publication.draft_id
        ) AS source_exact
    FROM actor_relevant_live_publications AS publication
    JOIN public.expense_private_drafts AS draft
      ON draft.id = publication.draft_id
     AND draft.actor_user_id = publication.actor_user_id
    LEFT JOIN exact_bindings AS binding
      ON binding.draft_id = publication.draft_id
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN publication.source_draft_version = draft.version
          THEN public.expense_sql159_normalize_private_draft(
            publication.actor_user_id, publication.draft_id, false
          )
        ELSE NULL::jsonb
      END AS normalized
    ) AS source ON true
    WHERE binding.draft_id IS NULL
  ),
  shared_one_off_sources AS (
    SELECT source.draft_id, (source.normalized->>'circle_id')::uuid AS circle_id
    FROM live_publication_sources AS source
    WHERE source.context_type = 'one_off'
      AND source.normalized IS NOT NULL
      AND source.source_exact IS TRUE
  ),
  invalid_visible_publications AS (
    SELECT publication.draft_id
    FROM actor_relevant_live_publications AS publication
    LEFT JOIN exact_bindings AS binding
      ON binding.draft_id = publication.draft_id
    LEFT JOIN live_publication_sources AS source
      ON source.draft_id = publication.draft_id
    WHERE publication.title IS NULL
       OR pg_catalog.char_length(pg_catalog.btrim(publication.title)) NOT BETWEEN 1 AND 200
       OR publication.total_minor IS NULL
       OR publication.total_minor NOT BETWEEN 1 AND 9007199254740991
       OR publication.currency IS NULL
       OR publication.currency NOT IN ('ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK')
       OR publication.updated_at IS NULL
       OR publication.published_at IS NULL
       OR NOT public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)
       OR (
         source.normalized IS NOT NULL
         AND source.source_exact IS NOT TRUE
       )
       OR NOT (
         (binding.draft_id IS NOT NULL AND binding.mode = 'shared')
         OR (binding.draft_id IS NULL
           AND publication.context_type IN ('one_off', 'group')
           AND public.expense_sql159_snapshot_is_valid(publication.draft_id))
       )
  ),
  invalid_visible_private_edits AS (
    SELECT binding.draft_id
    FROM exact_bindings AS binding
    WHERE binding.mode = 'private'
      AND binding.actor_user_id = p_actor_id
      AND (
        pg_catalog.jsonb_typeof(binding.payload->'included') <> 'object'
        OR pg_catalog.jsonb_typeof(binding.payload->'payerKeys') <> 'array'
      )
  ),
  invalid_visible_states AS (
    SELECT draft_id FROM invalid_visible_bindings
    UNION ALL
    SELECT draft_id FROM invalid_visible_publications
    UNION ALL
    SELECT draft_id FROM invalid_visible_private_edits
  ),
  publication_person_facets AS (
    SELECT publication.draft_id,
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', CASE WHEN resolved.target_user_id IS NOT NULL
          THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
            || p_actor_id::text || '|' || resolved.target_user_id::text)
          ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
            || p_actor_id::text || '|shared|' || publication.draft_id::text
            || '|' || party.party_key_hash)
        END,
        'label', CASE
          WHEN resolved.private_name IS NOT NULL
            AND pg_catalog.strpos(resolved.private_name, '@') = 0
            AND resolved.private_name !~ '[[:cntrl:]]'
            AND pg_catalog.translate(resolved.private_name,
              U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = resolved.private_name
            THEN resolved.private_name
          WHEN resolved.profile_name IS NOT NULL
            AND pg_catalog.strpos(resolved.profile_name, '@') = 0
            AND resolved.profile_name !~ '[[:cntrl:]]'
            AND pg_catalog.translate(resolved.profile_name,
              U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = resolved.profile_name
            THEN resolved.profile_name
          WHEN pg_catalog.strpos(party.display_name, '@') = 0
            AND party.display_name !~ '[[:cntrl:]]'
            AND pg_catalog.translate(party.display_name,
              U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = party.display_name
            THEN pg_catalog.btrim(party.display_name)
          WHEN resolved.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
          ELSE 'Gestur'
        END,
        'kind', CASE WHEN resolved.target_user_id IS NULL
          THEN 'manual' ELSE 'durable' END
      ) ORDER BY party.ordinal), '[]'::jsonb) AS facets
    FROM visible_live_publications AS publication
    JOIN public.expense_unconfirmed_publication_parties AS party
      ON party.draft_id = publication.draft_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN party.is_author THEN publication.actor_user_id
        ELSE audience.user_id END AS target_user_id,
        NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
        NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
      FROM (SELECT 1) AS singleton
      LEFT JOIN public.expense_unconfirmed_publication_audience AS audience
        ON audience.draft_id = party.draft_id
       AND audience.identity_token_hash = party.identity_token_hash
       AND NOT party.is_author
      LEFT JOIN public.relationships AS relationship
        ON relationship.owner_id = p_actor_id
       AND relationship.counterpart_user_id = CASE WHEN party.is_author
         THEN publication.actor_user_id ELSE audience.user_id END
      LEFT JOIN public.profiles AS profile
        ON profile.id = CASE WHEN party.is_author
          THEN publication.actor_user_id ELSE audience.user_id END
      LIMIT 1
    ) AS resolved ON true
    WHERE (party.is_payer OR party.is_participant)
      AND resolved.target_user_id IS DISTINCT FROM p_actor_id
    GROUP BY publication.draft_id
  ),
  private_creation AS (
    SELECT pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|draft|' || draft.id::text) AS presentation_key,
      'private_draft'::text AS presentation_state,
      pg_catalog.btrim(draft.payload->>'title') AS title,
      summary.total_minor AS total_minor,
      CASE WHEN summary.total_minor IS NULL
        THEN NULL ELSE draft.payload->>'currency' END AS currency,
      CASE draft.context_type
        WHEN 'one_off' THEN '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=' || draft.id::text
        ELSE '/auth-mvp/utlagt-og-endurgreitt/hopar/' || draft.group_id::text
          || '/nytt-utgjald?draft=' || draft.id::text
      END AS href,
      'visible_updated_at'::text AS order_basis,
      pg_catalog.to_char(draft.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_primary,
      pg_catalog.to_char(draft.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', CASE WHEN identity.target_user_id IS NOT NULL
            THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
              || p_actor_id::text || '|' || identity.target_user_id::text)
            ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
              || p_actor_id::text || '|private|' || draft.id::text
              || '|' || party.value->>'party_key_hash')
          END,
          'label', CASE
            WHEN identity.private_name IS NOT NULL
              AND pg_catalog.strpos(identity.private_name, '@') = 0
              AND identity.private_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.private_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.private_name
              THEN identity.private_name
            WHEN identity.profile_name IS NOT NULL
              AND pg_catalog.strpos(identity.profile_name, '@') = 0
              AND identity.profile_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.profile_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.profile_name
              THEN identity.profile_name
            WHEN pg_catalog.strpos(party.value->>'display_name', '@') = 0
              AND (party.value->>'display_name') !~ '[[:cntrl:]]'
              AND pg_catalog.translate(party.value->>'display_name',
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '')
                  = party.value->>'display_name'
              THEN party.value->>'display_name'
            WHEN identity.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
            ELSE 'Gestur'
          END,
          'kind', CASE WHEN identity.target_user_id IS NULL
            THEN 'manual' ELSE 'durable' END
        ) ORDER BY (party.value->>'ordinal')::integer)
        FROM pg_catalog.jsonb_array_elements(source.normalized->'parties') AS party(value)
        LEFT JOIN LATERAL (
          SELECT CASE WHEN (party.value->>'is_author')::boolean THEN p_actor_id
            ELSE (audience.value->>'user_id')::uuid END AS target_user_id,
            NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
            NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
          FROM (SELECT 1) AS singleton
          LEFT JOIN LATERAL (
            SELECT candidate.value
            FROM pg_catalog.jsonb_array_elements(source.normalized->'audience') AS candidate(value)
            WHERE candidate.value->>'identity_token_hash'
              = party.value->>'identity_token_hash'
            LIMIT 1
          ) AS audience ON NOT (party.value->>'is_author')::boolean
          LEFT JOIN public.relationships AS relationship
            ON relationship.owner_id = p_actor_id
           AND relationship.counterpart_user_id = CASE
             WHEN (party.value->>'is_author')::boolean THEN p_actor_id
             ELSE (audience.value->>'user_id')::uuid END
          LEFT JOIN public.profiles AS profile
            ON profile.id = CASE WHEN (party.value->>'is_author')::boolean
              THEN p_actor_id ELSE (audience.value->>'user_id')::uuid END
          LIMIT 1
        ) AS identity ON true
        WHERE identity.target_user_id IS DISTINCT FROM p_actor_id
      ), '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || circle.id::text),
          'label', pg_catalog.btrim(circle.name)
        ))
        FROM public.relationship_circles AS circle
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE circle.id = (source.normalized->>'circle_id')::uuid
          AND circle.status = 'active'
          AND pg_catalog.strpos(circle.name, '@') = 0
          AND circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = circle.name
      ), '[]'::jsonb) AS circle_facets
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
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN draft.current_step = 'split' AND summary.total_minor IS NOT NULL
          THEN public.expense_sql159_normalize_private_draft(
            p_actor_id, draft.id, false
          )
        ELSE NULL::jsonb
      END AS normalized
    ) AS source ON true
    WHERE draft.actor_user_id = p_actor_id
      AND draft.context_type IN ('one_off', 'group')
      AND NOT EXISTS (
        SELECT 1 FROM public.expense_unconfirmed_publications AS publication
        WHERE publication.draft_id = draft.id AND publication.is_live
      )
  ),
  private_edit AS (
    SELECT pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|expense|' || binding.expense_id::text) AS presentation_key,
      'private_draft'::text AS presentation_state,
      CASE
        WHEN pg_catalog.jsonb_typeof(binding.payload->'title') = 'string'
          AND pg_catalog.char_length(pg_catalog.btrim(binding.payload->>'title'))
            BETWEEN 1 AND 200
          AND (binding.payload->>'title') !~ '[[:cntrl:]]'
          AND pg_catalog.translate(binding.payload->>'title',
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '')
              = binding.payload->>'title'
          THEN pg_catalog.btrim(binding.payload->>'title')
        ELSE binding.expense_title
      END AS title,
      binding.expense_total_minor AS total_minor,
      binding.expense_currency AS currency,
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || binding.expense_id::text
        || '/breyta?step=split&draft=' || binding.draft_id::text AS href,
      'visible_updated_at'::text AS order_basis,
      pg_catalog.to_char(binding.draft_updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_primary,
      pg_catalog.to_char(binding.draft_created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', CASE WHEN identity.target_user_id IS NOT NULL
            THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
              || p_actor_id::text || '|' || identity.target_user_id::text)
            ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
              || p_actor_id::text || '|edit|' || binding.group_id::text
              || '|' || member.id::text)
          END,
          'label', CASE
            WHEN identity.private_name IS NOT NULL
              AND pg_catalog.strpos(identity.private_name, '@') = 0
              AND identity.private_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.private_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.private_name
              THEN identity.private_name
            WHEN identity.profile_name IS NOT NULL
              AND pg_catalog.strpos(identity.profile_name, '@') = 0
              AND identity.profile_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.profile_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.profile_name
              THEN identity.profile_name
            WHEN pg_catalog.strpos(member.display_name, '@') = 0
              AND member.display_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(member.display_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = member.display_name
              THEN pg_catalog.btrim(member.display_name)
            WHEN identity.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
            ELSE 'Gestur'
          END,
          'kind', CASE WHEN identity.target_user_id IS NULL
            THEN 'manual' ELSE 'durable' END
        ) ORDER BY member.id)
        FROM public.expense_group_members AS member
        LEFT JOIN public.expense_member_identity_bindings AS identity_binding
          ON identity_binding.group_id = member.group_id
         AND identity_binding.member_id = member.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(member.user_id, identity_binding.target_user_id) AS target_user_id,
            NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
            NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
          FROM (SELECT 1) AS singleton
          LEFT JOIN public.relationships AS relationship
            ON relationship.owner_id = p_actor_id
           AND relationship.counterpart_user_id
             = COALESCE(member.user_id, identity_binding.target_user_id)
          LEFT JOIN public.profiles AS profile
            ON profile.id = COALESCE(member.user_id, identity_binding.target_user_id)
        ) AS identity ON true
        WHERE member.group_id = binding.group_id
          AND member.status = 'active'
          AND identity.target_user_id IS DISTINCT FROM p_actor_id
          AND (
            binding.payload->'payerKeys' @> pg_catalog.jsonb_build_array(member.id::text)
            OR COALESCE((binding.payload->'included'->>member.id::text)::boolean, false)
          )
      ), '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || context.circle_id::text),
          'label', pg_catalog.btrim(circle.name)
        ))
        FROM public.relationship_circle_expense_contexts AS context
        JOIN public.relationship_circles AS circle
          ON circle.id = context.circle_id AND circle.status = 'active'
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE context.group_id = binding.group_id
          AND pg_catalog.strpos(circle.name, '@') = 0
          AND circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM exact_bindings AS binding
    WHERE binding.mode = 'private' AND binding.actor_user_id = p_actor_id
      AND pg_catalog.jsonb_typeof(binding.payload->'included') = 'object'
      AND pg_catalog.jsonb_typeof(binding.payload->'payerKeys') = 'array'
  ),
  shared_presentations AS (
    SELECT CASE WHEN binding.draft_id IS NOT NULL
      THEN pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|expense|' || binding.expense_id::text)
      ELSE pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|draft|' || publication.draft_id::text)
      END AS presentation_key,
      'shared_draft'::text AS presentation_state,
      publication.title, publication.total_minor, publication.currency,
      CASE
        WHEN publication.actor_user_id = p_actor_id AND binding.draft_id IS NOT NULL
          THEN '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || binding.expense_id::text
            || '/breyta?step=split&draft=' || binding.draft_id::text
        WHEN publication.actor_user_id = p_actor_id
          AND publication.context_type = 'group'
          THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || publication.group_id::text
            || '/nytt-utgjald?draft=' || publication.draft_id::text
        WHEN publication.actor_user_id = p_actor_id
          THEN '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=' || publication.draft_id::text
        ELSE '/auth-mvp/utlagt-og-endurgreitt/drog/' || publication.publication_id::text
      END AS href,
      'visible_updated_at'::text AS order_basis,
      pg_catalog.to_char(publication.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_primary,
      pg_catalog.to_char(publication.published_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE(facets.facets, '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || circle_source.circle_id::text),
          'label', pg_catalog.btrim(authorized_circle.name)
        ))
        FROM (
          SELECT context.circle_id
          FROM public.relationship_circle_expense_contexts AS context
          WHERE publication.context_type = 'group'
            AND context.group_id = publication.group_id
          UNION ALL
          SELECT source.circle_id
          FROM shared_one_off_sources AS source
          WHERE publication.context_type = 'one_off'
            AND source.draft_id = publication.draft_id
        ) AS circle_source
        JOIN public.relationship_circles AS authorized_circle
          ON authorized_circle.id = circle_source.circle_id
         AND authorized_circle.status = 'active'
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = authorized_circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE pg_catalog.strpos(authorized_circle.name, '@') = 0
          AND authorized_circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(authorized_circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '')
              = authorized_circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM visible_live_publications AS publication
    LEFT JOIN exact_bindings AS binding ON binding.draft_id = publication.draft_id
    LEFT JOIN publication_person_facets AS facets ON facets.draft_id = publication.draft_id
    WHERE (
        (binding.draft_id IS NOT NULL AND binding.mode = 'shared')
        OR (binding.draft_id IS NULL
          AND publication.context_type IN ('one_off', 'group')
          AND public.expense_sql159_snapshot_is_valid(publication.draft_id))
      )
  ),
  canonical_member_ids AS (
    SELECT payment.expense_id, payment.member_id FROM public.expense_payments AS payment
    UNION
    SELECT share_row.expense_id, share_row.member_id FROM public.expense_shares AS share_row
  ),
  canonical_presentations AS (
    SELECT pg_catalog.md5('expense-sql170-presentation-v1|'
        || p_actor_id::text || '|expense|' || expense.id::text) AS presentation_key,
      CASE
        WHEN expense.status = 'cancelled' THEN 'cancelled'
        WHEN EXISTS (
          SELECT 1 FROM public.expense_settlement_eligible_balances_v1(
            expense.group_id, false
          ) AS balance
        ) OR EXISTS (
          SELECT 1 FROM public.expense_repayments AS repayment
          WHERE repayment.group_id = expense.group_id
            AND repayment.status = 'reported'
        ) THEN 'confirmed'
        ELSE 'settled'
      END::text AS presentation_state,
      expense.title, expense.total_minor, expense.currency,
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || expense.id::text AS href,
      'incurred_on'::text AS order_basis,
      expense.incurred_on::text AS order_primary,
      pg_catalog.to_char(expense.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS order_secondary,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', CASE WHEN identity.target_user_id IS NOT NULL
            THEN pg_catalog.md5('expense-sql170-durable-person-v1|'
              || p_actor_id::text || '|' || identity.target_user_id::text)
            ELSE pg_catalog.md5('expense-sql170-manual-person-v1|'
              || p_actor_id::text || '|expense|' || expense.group_id::text
              || '|' || member.id::text)
          END,
          'label', CASE
            WHEN identity.private_name IS NOT NULL
              AND pg_catalog.strpos(identity.private_name, '@') = 0
              AND identity.private_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.private_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.private_name
              THEN identity.private_name
            WHEN identity.profile_name IS NOT NULL
              AND pg_catalog.strpos(identity.profile_name, '@') = 0
              AND identity.profile_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(identity.profile_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = identity.profile_name
              THEN identity.profile_name
            WHEN pg_catalog.strpos(member.display_name, '@') = 0
              AND member.display_name !~ '[[:cntrl:]]'
              AND pg_catalog.translate(member.display_name,
                U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = member.display_name
              THEN pg_catalog.btrim(member.display_name)
            WHEN identity.target_user_id IS NOT NULL THEN 'Teskeiðarnotandi'
            ELSE 'Gestur'
          END,
          'kind', CASE WHEN identity.target_user_id IS NULL
            THEN 'manual' ELSE 'durable' END
        ) ORDER BY member.id)
        FROM canonical_member_ids AS selected
        JOIN public.expense_group_members AS member
          ON member.id = selected.member_id AND member.group_id = expense.group_id
        LEFT JOIN public.expense_member_identity_bindings AS identity_binding
          ON identity_binding.group_id = member.group_id
         AND identity_binding.member_id = member.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(member.user_id, identity_binding.target_user_id) AS target_user_id,
            NULLIF(pg_catalog.btrim(relationship.private_display_name), '') AS private_name,
            NULLIF(pg_catalog.btrim(profile.display_name), '') AS profile_name
          FROM (SELECT 1) AS singleton
          LEFT JOIN public.relationships AS relationship
            ON relationship.owner_id = p_actor_id
           AND relationship.counterpart_user_id
             = COALESCE(member.user_id, identity_binding.target_user_id)
          LEFT JOIN public.profiles AS profile
            ON profile.id = COALESCE(member.user_id, identity_binding.target_user_id)
        ) AS identity ON true
        WHERE selected.expense_id = expense.id
          AND identity.target_user_id IS DISTINCT FROM p_actor_id
      ), '[]'::jsonb) AS person_facets,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'key', pg_catalog.md5('expense-sql170-circle-v1|'
            || p_actor_id::text || '|' || context.circle_id::text),
          'label', pg_catalog.btrim(circle.name)
        ))
        FROM public.relationship_circle_expense_contexts AS context
        JOIN public.relationship_circles AS circle
          ON circle.id = context.circle_id AND circle.status = 'active'
        JOIN public.relationship_circle_members AS actor_circle_member
          ON actor_circle_member.circle_id = circle.id
         AND actor_circle_member.user_id = p_actor_id
         AND actor_circle_member.status = 'active'
        WHERE context.group_id = expense.group_id
          AND pg_catalog.strpos(circle.name, '@') = 0
          AND circle.name !~ '[[:cntrl:]]'
          AND pg_catalog.translate(circle.name,
            U&'\202A\202B\202C\202D\202E\2066\2067\2068\2069', '') = circle.name
      ), '[]'::jsonb) AS circle_facets
    FROM public.expenses AS expense
    JOIN actor_groups AS actor_group ON actor_group.group_id = expense.group_id
    JOIN public.expense_groups AS group_row ON group_row.id = expense.group_id
    WHERE group_row.status IN ('active', 'settling', 'settled', 'closed')
      AND NOT EXISTS (
        SELECT 1 FROM public.expense_edit_revision_bindings AS binding
        WHERE binding.expense_id = expense.id
      )
  ),
  candidates AS (
    SELECT * FROM private_creation
    UNION ALL SELECT * FROM private_edit
    UNION ALL SELECT * FROM shared_presentations
    UNION ALL SELECT * FROM canonical_presentations
  ),
  limited AS (
    SELECT candidate.*
    FROM candidates AS candidate
    ORDER BY CASE candidate.presentation_state
      WHEN 'private_draft' THEN 1 WHEN 'shared_draft' THEN 2
      WHEN 'confirmed' THEN 3 WHEN 'settled' THEN 4 ELSE 5 END,
      candidate.order_primary DESC, candidate.order_secondary DESC,
      candidate.presentation_key
    LIMIT 101
  )
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT limited.presentation_key)::integer,
    (SELECT pg_catalog.count(*)::integer FROM invalid_visible_states),
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'presentation_key', limited.presentation_key,
      'presentation_state', limited.presentation_state,
      'title', limited.title,
      'total_minor', limited.total_minor,
      'currency', limited.currency,
      'href', limited.href,
      'order', pg_catalog.jsonb_build_object(
        'basis', limited.order_basis,
        'primary', limited.order_primary,
        'secondary', limited.order_secondary,
        'tie_breaker', limited.presentation_key
      ),
      'person_facets', limited.person_facets,
      'circle_facets', limited.circle_facets
    ) ORDER BY CASE limited.presentation_state
      WHEN 'private_draft' THEN 1 WHEN 'shared_draft' THEN 2
      WHEN 'confirmed' THEN 3 WHEN 'settled' THEN 4 ELSE 5 END,
      limited.order_primary DESC, limited.order_secondary DESC,
      limited.presentation_key), '[]'::jsonb)
  INTO v_candidate_count, v_distinct_candidate_count, v_invalid_state_count, v_rows
  FROM limited;

  IF v_candidate_count > 100
     OR v_candidate_count IS DISTINCT FROM v_distinct_candidate_count
     OR v_invalid_state_count <> 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'status', CASE WHEN v_candidate_count = 0 THEN 'none' ELSE 'ready' END,
    'rows', v_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'contract_version', 1, 'status', 'unavailable', 'rows', '[]'::jsonb
  );
END;
$function$;

COMMENT ON FUNCTION public.expense_list_dashboard_presentations_v1(uuid) IS
  'SQL170 service-only read projection for one-visible Expense dashboard rows and actor-safe facets.';
ALTER FUNCTION public.expense_list_dashboard_presentations_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.expense_list_dashboard_presentations_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_list_dashboard_presentations_v1(uuid)
  TO service_role;

WITH target AS MATERIALIZED (
  SELECT resolved.target_oid,
    procedure_row.prokind,
    procedure_row.pronargs,
    procedure_row.proargnames,
    procedure_row.proargmodes,
    procedure_row.provolatile,
    procedure_row.prosecdef,
    procedure_row.proisstrict,
    procedure_row.proleakproof,
    procedure_row.proparallel,
    procedure_row.pronargdefaults,
    procedure_row.proconfig,
    procedure_row.prosrc,
    procedure_row.proacl,
    procedure_row.proowner,
    pg_catalog.pg_get_function_arguments(procedure_row.oid) AS rendered_arguments,
    pg_catalog.pg_get_function_result(procedure_row.oid) AS rendered_result,
    owner_role.rolname AS owner_name,
    language_row.lanname AS language_name
  FROM (
    SELECT pg_catalog.to_regprocedure(
      'public.expense_list_dashboard_presentations_v1(uuid)'
    ) AS target_oid
  ) AS resolved
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = resolved.target_oid
  LEFT JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = procedure_row.proowner
  LEFT JOIN pg_catalog.pg_language AS language_row
    ON language_row.oid = procedure_row.prolang
), acl_rows AS MATERIALIZED (
  SELECT COALESCE(grantee_role.rolname::text, 'PUBLIC') AS grantee,
    COALESCE(grantor_role.rolname::text, '<missing>') AS grantor,
    acl.privilege_type,
    acl.is_grantable
  FROM target
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    target.proacl,
    pg_catalog.acldefault('f', target.proowner)
  )) AS acl
  LEFT JOIN pg_catalog.pg_roles AS grantee_role
    ON grantee_role.oid = acl.grantee
  LEFT JOIN pg_catalog.pg_roles AS grantor_role
    ON grantor_role.oid = acl.grantor
), acl_state AS MATERIALIZED (
  SELECT pg_catalog.count(*)::integer AS actual_acl_entry_count,
    pg_catalog.array_agg(grantee ORDER BY grantee COLLATE pg_catalog."C")
      AS actual_acl_grantees,
    pg_catalog.array_agg(grantor ORDER BY grantee COLLATE pg_catalog."C")
      AS actual_acl_grantors,
    pg_catalog.array_agg(privilege_type ORDER BY grantee COLLATE pg_catalog."C")
      AS actual_acl_privileges,
    pg_catalog.array_agg(is_grantable ORDER BY grantee COLLATE pg_catalog."C")
      AS actual_acl_grantables,
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantee', grantee,
      'grantor', grantor,
      'privilege', privilege_type,
      'is_grantable', is_grantable
    ) ORDER BY grantee COLLATE pg_catalog."C"), '[]'::jsonb)
      AS actual_acl_exploded
  FROM acl_rows
), evidence AS MATERIALIZED (
  SELECT target.target_oid IS NOT NULL AS target_exists,
    COALESCE(target.prokind = 'f'::"char", false) AS prokind_exact,
    COALESCE(target.pronargs = 1, false) AS pronargs_exact,
    COALESCE(target.proargnames = ARRAY['p_actor_id']::text[], false)
      AS proargnames_exact,
    target.target_oid IS NOT NULL AND target.proargmodes IS NULL
      AS proargmodes_exact,
    COALESCE(target.rendered_arguments = 'p_actor_id uuid', false)
      AS arguments_exact,
    COALESCE(target.rendered_result = 'jsonb', false) AS result_exact,
    COALESCE(target.provolatile = 'v'::"char", false) AS volatility_exact,
    COALESCE(target.prosecdef, false) AS security_definer_exact,
    COALESCE(NOT target.proisstrict, false) AS strictness_exact,
    COALESCE(NOT target.proleakproof, false) AS leakproof_exact,
    COALESCE(target.proparallel = 'u'::"char", false) AS parallel_exact,
    COALESCE(target.pronargdefaults = 0, false) AS defaults_exact,
    COALESCE(target.proconfig = ARRAY['search_path=""']::text[], false)
      AS proconfig_exact,
    COALESCE(
      pg_catalog.md5(pg_catalog.replace(target.prosrc, E'\r\n', E'\n'))
        = 'dbf8086df87d9574e29a914c7201257b',
      false
    ) AS source_hash_exact,
    COALESCE(target.owner_name = 'postgres', false) AS owner_exact,
    COALESCE(target.language_name = 'plpgsql', false) AS language_exact,
    acl_state.actual_acl_entry_count = 2 AS acl_count_exact,
    COALESCE(
      acl_state.actual_acl_grantees = ARRAY['postgres','service_role']::text[],
      false
    ) AS acl_grantees_exact,
    COALESCE((SELECT pg_catalog.bool_and(grantor = 'postgres') FROM acl_rows), false)
      AS acl_grantor_exact,
    COALESCE((SELECT pg_catalog.bool_and(privilege_type = 'EXECUTE') FROM acl_rows), false)
      AS acl_privilege_exact,
    COALESCE((SELECT pg_catalog.bool_and(NOT is_grantable) FROM acl_rows), false)
      AS acl_grantable_exact,
    target.prokind AS actual_prokind,
    target.pronargs AS actual_pronargs,
    target.proargnames AS actual_proargnames,
    target.proargmodes AS actual_proargmodes,
    target.rendered_arguments AS actual_arguments,
    target.rendered_result AS actual_result,
    target.provolatile AS actual_volatility,
    target.prosecdef AS actual_security_definer,
    target.proisstrict AS actual_is_strict,
    target.proleakproof AS actual_leakproof,
    target.proparallel AS actual_parallel,
    target.pronargdefaults AS actual_default_count,
    target.proconfig AS actual_proconfig,
    pg_catalog.md5(target.prosrc) AS actual_source_md5_raw,
    pg_catalog.md5(pg_catalog.replace(target.prosrc, E'\r\n', E'\n'))
      AS actual_source_md5_normalized,
    target.owner_name AS actual_owner,
    target.language_name AS actual_language,
    acl_state.actual_acl_entry_count,
    acl_state.actual_acl_grantees,
    acl_state.actual_acl_grantors,
    acl_state.actual_acl_privileges,
    acl_state.actual_acl_grantables,
    acl_state.actual_acl_exploded
  FROM target CROSS JOIN acl_state
)
SELECT evidence.*,
  target_exists
    AND prokind_exact
    AND pronargs_exact
    AND proargnames_exact
    AND proargmodes_exact
    AND arguments_exact
    AND result_exact
    AND volatility_exact
    AND security_definer_exact
    AND strictness_exact
    AND leakproof_exact
    AND parallel_exact
    AND defaults_exact
    AND proconfig_exact
    AND source_hash_exact
    AND owner_exact
    AND language_exact
    AND acl_count_exact
    AND acl_grantees_exact
    AND acl_grantor_exact
    AND acl_privilege_exact
    AND acl_grantable_exact AS postcondition_exact
FROM evidence;

ROLLBACK;
