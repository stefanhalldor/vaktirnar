-- SQL164 read-only preflight. Any false pass_* value or STOP state blocks work.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';

WITH expected AS MATERIALIZED (
  SELECT
    'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'::text AS signature,
    'p_actor_id uuid, p_draft_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid, p_current_step text, p_payload jsonb, p_expected_version bigint DEFAULT NULL::bigint'::text AS arguments,
    'TABLE(draft_id uuid, draft_version bigint, saved_at timestamp with time zone)'::text AS result,
    '59f7c91049839431bf068d58f8462673'::text AS predecessor_hash,
    'e655a802f4fe1cd5f98b2f0d22815178'::text AS installed_hash
), expected_schema_acl(grantee, grantor, privilege_type, is_grantable) AS (
  VALUES
    (0::oid,6171::oid,'USAGE'::text,false),
    (6171::oid,6171::oid,'CREATE'::text,false),
    (6171::oid,6171::oid,'USAGE'::text,false),
    (16388::oid,6171::oid,'USAGE'::text,false),
    (16484::oid,6171::oid,'USAGE'::text,false),
    (16485::oid,6171::oid,'USAGE'::text,false),
    (16486::oid,6171::oid,'USAGE'::text,false)
), expected_schema_roles(subject, role_oid, role_name, expected_usage, expected_create) AS (
  VALUES
    ('PUBLIC'::text,0::oid,NULL::name,true,false),
    ('anon',16484::oid,'anon'::name,true,false),
    ('authenticated',16485::oid,'authenticated'::name,true,false),
    ('service_role',16486::oid,'service_role'::name,true,false),
    ('postgres',16388::oid,'postgres'::name,true,true),
    ('schema_owner',6171::oid,'pg_database_owner'::name,true,true)
), schema_state AS MATERIALIZED (
  SELECT namespace.oid AS schema_oid, namespace.nspowner AS owner_oid,
    owner_role.rolname AS owner_name, namespace.nspacl,
    namespace.nspacl IS NULL AS stored_acl_is_null
  FROM pg_catalog.pg_namespace AS namespace
  LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = namespace.nspowner
  WHERE namespace.nspname = 'public'
), schema_acl_rows AS MATERIALIZED (
  SELECT privilege.grantee, privilege.grantor,
    privilege.privilege_type, privilege.is_grantable
  FROM schema_state AS state
  CROSS JOIN LATERAL pg_catalog.aclexplode(state.nspacl) AS privilege
), schema_acl_contract AS MATERIALIZED (
  SELECT COALESCE(state.schema_oid = 2200::oid
    AND state.owner_oid = 6171::oid
    AND state.owner_name = 'pg_database_owner'
    AND NOT state.stored_acl_is_null
    AND pg_catalog.current_setting('server_version_num')::integer = 170006
    AND (SELECT pg_catalog.count(*) FROM schema_acl_rows) = 7
    AND NOT EXISTS (
      SELECT acl.* FROM schema_acl_rows AS acl
      EXCEPT SELECT expected.* FROM expected_schema_acl AS expected
    )
    AND NOT EXISTS (
      SELECT expected.* FROM expected_schema_acl AS expected
      EXCEPT SELECT acl.* FROM schema_acl_rows AS acl
    )
    AND NOT EXISTS (
      SELECT 1
      FROM expected_schema_roles AS expected_role
      LEFT JOIN pg_catalog.pg_roles AS role
        ON role.oid = expected_role.role_oid
       AND role.rolname = expected_role.role_name
      WHERE CASE WHEN expected_role.subject = 'PUBLIC' THEN
        (EXISTS (SELECT 1 FROM schema_acl_rows AS acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'USAGE'))
          IS DISTINCT FROM expected_role.expected_usage
        OR (EXISTS (SELECT 1 FROM schema_acl_rows AS acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'CREATE'))
          IS DISTINCT FROM expected_role.expected_create
      ELSE role.oid IS NULL
        OR pg_catalog.has_schema_privilege(
          role.oid, state.schema_oid, 'USAGE'
        ) IS DISTINCT FROM expected_role.expected_usage
        OR pg_catalog.has_schema_privilege(
          role.oid, state.schema_oid, 'CREATE'
        ) IS DISTINCT FROM expected_role.expected_create
      END
    ), false) AS schema_acl_exact
  FROM schema_state AS state
), routine_state AS MATERIALIZED (
  SELECT routine.*, language_row.lanname AS language_name,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
), routine_contract AS MATERIALIZED (
  SELECT routine_state.*,
    COALESCE(routine_state.oid IS NOT NULL
      AND pg_catalog.pg_get_function_arguments(routine_state.oid) = expected.arguments
      AND pg_catalog.pg_get_function_result(routine_state.oid) = expected.result
      AND routine_state.pronargdefaults = 1
      AND routine_state.proargdefaults IS NOT NULL
      AND routine_state.proargmodes = ARRAY['i','i','i','i','i','i','i','i','t','t','t']::"char"[]
      AND routine_state.proargnames = ARRAY[
        'p_actor_id','p_draft_id','p_context_type','p_group_id','p_expense_id',
        'p_current_step','p_payload','p_expected_version','draft_id','draft_version','saved_at'
      ]::text[]
      AND routine_state.proretset AND routine_state.language_name = 'plpgsql'
      AND routine_state.provolatile = 'v' AND NOT routine_state.proisstrict
      AND routine_state.prosecdef AND NOT routine_state.proleakproof
      AND routine_state.proparallel = 'u'
      AND routine_state.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
      AND pg_catalog.pg_get_userbyid(routine_state.proowner) = 'postgres', false)
      AS common_contract_exact,
    COALESCE((SELECT pg_catalog.count(*) = 2
      FROM pg_catalog.aclexplode(COALESCE(
        routine_state.proacl, pg_catalog.acldefault('f', routine_state.proowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantor = routine_state.proowner
        AND NOT privilege.is_grantable
        AND (privilege.grantee = routine_state.proowner
          OR grantee_role.rolname = 'service_role')), false)
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
          routine_state.proacl, pg_catalog.acldefault('f', routine_state.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> routine_state.proowner
           OR privilege.is_grantable OR privilege.grantee = 0
           OR (privilege.grantee <> routine_state.proowner
             AND grantee_role.rolname IS DISTINCT FROM 'service_role')
      )
      AND COALESCE(
        NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('anon'), routine_state.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('authenticated'), routine_state.oid, 'EXECUTE'
        )
        AND pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('service_role'), routine_state.oid, 'EXECUTE'
        ), false
      ) AS acl_exact
  FROM routine_state CROSS JOIN expected
), named_index_object AS MATERIALIZED (
  SELECT named_object.*, index_row.indexrelid, index_row.indrelid,
    index_row.indisunique, index_row.indisvalid, index_row.indisready,
    index_row.indislive, index_row.indnkeyatts, index_row.indnatts,
    index_row.indkey, index_row.indpred
  FROM pg_catalog.pg_class AS named_object
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = named_object.relnamespace
  LEFT JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid = named_object.oid
  WHERE index_namespace.nspname = 'public'
    AND named_object.relname = 'expense_private_drafts_one_edit_per_actor_expense_idx'
), index_state AS MATERIALIZED (
  SELECT index_class.oid, index_class.relkind, index_class.relpersistence,
    pg_catalog.pg_get_userbyid(index_class.relowner) AS index_owner,
    index_row.indisunique,
    index_row.indisvalid, index_row.indisready, index_row.indislive,
    index_row.indnkeyatts, index_row.indnatts,
    access_method.amname, access_method.amname = 'btree' AS access_method_exact,
    table_namespace.nspname AS table_schema,
    table_class.relname AS table_name,
    table_class.relname = 'expense_private_drafts' AS table_exact,
    CASE WHEN index_row.indexrelid IS NOT NULL
      THEN pg_catalog.pg_get_indexdef(index_class.oid) ELSE NULL
    END AS index_definition,
    pg_catalog.replace(pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid), ' ', '') AS predicate,
    (SELECT pg_catalog.array_agg(attribute_row.attname ORDER BY key_column.ordinality)
     FROM pg_catalog.unnest(index_row.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ordinality)
     JOIN pg_catalog.pg_attribute AS attribute_row
       ON attribute_row.attrelid = table_class.oid
      AND attribute_row.attnum = key_column.attnum) AS key_columns
  FROM named_index_object AS index_row
  JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_row.oid
  LEFT JOIN pg_catalog.pg_class AS table_class ON table_class.oid = index_row.indrelid
  LEFT JOIN pg_catalog.pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
  LEFT JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_class.relam
), index_contract AS MATERIALIZED (
  SELECT (SELECT pg_catalog.count(*) FROM named_index_object) AS named_object_count,
    pg_catalog.count(*) = 1 AND COALESCE(pg_catalog.bool_and(
    index_state.relkind = 'i' AND index_state.relpersistence = 'p'
    AND index_state.index_owner = 'postgres' AND index_state.indisunique
    AND index_state.indisvalid AND index_state.indisready AND index_state.indislive
    AND index_state.access_method_exact
    AND index_state.table_schema = 'public'
    AND index_state.table_exact
    AND index_state.indnkeyatts = 2 AND index_state.indnatts = 2
    AND index_state.key_columns = ARRAY['actor_user_id','expense_id']::name[]
    AND index_state.predicate = '(context_type=''edit''::text)'
    AND index_state.index_definition =
      'CREATE UNIQUE INDEX expense_private_drafts_one_edit_per_actor_expense_idx ON public.expense_private_drafts USING btree (actor_user_id, expense_id) WHERE (context_type = ''edit''::text)'
  ), false) AS index_exact
  FROM index_state
), dependency_contract AS MATERIALIZED (
  SELECT pg_catalog.count(routine.oid) = 2 AND COALESCE(pg_catalog.bool_and(
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) = dependency.source_hash
    AND pg_catalog.pg_get_function_arguments(routine.oid) = dependency.arguments
    AND pg_catalog.pg_get_function_result(routine.oid) = dependency.result
    AND routine.provolatile::text = dependency.volatility
    AND language_row.lanname = 'plpgsql'
    AND NOT routine.proisstrict AND NOT routine.proretset
    AND routine.pronargdefaults = 0 AND routine.proargdefaults IS NULL
    AND routine.proargmodes IS NULL AND routine.proallargtypes IS NULL
    AND routine.prosecdef AND NOT routine.proleakproof AND routine.proparallel = 'u'
    AND routine.proconfig = dependency.config
    AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
    AND (SELECT pg_catalog.count(*) = 1
      FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS privilege
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantee = routine.proowner
        AND privilege.grantor = routine.proowner
        AND NOT privilege.is_grantable)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS privilege
      WHERE privilege.privilege_type <> 'EXECUTE'
         OR privilege.grantee <> routine.proowner
         OR privilege.grantor <> routine.proowner
         OR privilege.is_grantable
    )
  ), false) AS dependencies_exact
  FROM (VALUES
    ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)',
      'p_actor_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid',
      'void','v','aeb9b8246978d630fb69db9365a22f34',ARRAY['search_path=pg_catalog, public']::text[]),
    ('public.expense_sql162_event_relation_tuple(jsonb)',
      'p_payload jsonb','jsonb','i','0fa02c46d2b8b7c0c24506be5549743c',ARRAY['search_path=""']::text[])
  ) AS dependency(signature, arguments, result, volatility, source_hash, config)
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(dependency.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
), relation_contract AS MATERIALIZED (
  SELECT COALESCE(table_row.oid IS NOT NULL AND table_row.relkind = 'r'
    AND table_row.relrowsecurity AND table_row.relforcerowsecurity
    AND pg_catalog.pg_get_userbyid(table_row.relowner) = 'postgres'
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role_row(role_name)
      WHERE pg_catalog.has_table_privilege(
        role_row.role_name::name, table_row.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
    ), false) AS private_drafts_security_exact
  FROM (SELECT pg_catalog.to_regclass('public.expense_private_drafts') AS oid) AS target
  LEFT JOIN pg_catalog.pg_class AS table_row ON table_row.oid = target.oid
), duplicates AS MATERIALIZED (
  SELECT drafts.actor_user_id, drafts.expense_id
  FROM public.expense_private_drafts AS drafts
  WHERE drafts.context_type = 'edit'
  GROUP BY drafts.actor_user_id, drafts.expense_id
  HAVING count(*) > 1
), verdict AS MATERIALIZED (
  SELECT NOT EXISTS (SELECT 1 FROM duplicates) AS no_duplicates,
    routine_contract.common_contract_exact,
    routine_contract.acl_exact,
    routine_contract.source_hash,
    index_contract.index_exact,
    index_contract.named_object_count,
    dependency_contract.dependencies_exact,
    relation_contract.private_drafts_security_exact,
    schema_acl_contract.schema_acl_exact,
    expected.predecessor_hash, expected.installed_hash
  FROM routine_contract CROSS JOIN index_contract CROSS JOIN dependency_contract
    CROSS JOIN relation_contract CROSS JOIN schema_acl_contract CROSS JOIN expected
)
SELECT no_duplicates AS pass_no_duplicate_edit_identity,
  common_contract_exact AS pass_function_contract,
  acl_exact AS pass_function_acl,
  dependencies_exact AS pass_direct_dependencies,
  private_drafts_security_exact AS pass_private_drafts_security,
  schema_acl_exact AS pass_public_schema_acl,
  named_object_count = 0 OR index_exact AS pass_index_absent_or_exact,
  CASE
    WHEN no_duplicates AND common_contract_exact AND acl_exact
      AND dependencies_exact AND private_drafts_security_exact AND schema_acl_exact
      AND source_hash = predecessor_hash AND named_object_count = 0
      THEN 'ABSENT_READY'
    WHEN no_duplicates AND common_contract_exact AND acl_exact
      AND dependencies_exact AND private_drafts_security_exact AND schema_acl_exact
      AND source_hash = installed_hash AND index_exact
      THEN 'EXACT_INSTALLED_OR_LOST_RESPONSE'
    ELSE 'PARTIAL_OR_DRIFTED_STOP'
  END AS installation_state
FROM verdict;

COMMIT;
