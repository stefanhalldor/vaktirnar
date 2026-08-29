-- SQL164 emergency capability removal. Run only after separate approval.
-- The protective unique index and every draft/financial/Event row remain intact.
BEGIN;
SET LOCAL search_path = '';

-- Read-only exact-installed-state guard. The REVOKE below is the first mutation.
DO $guard$
DECLARE
  v_function_exact boolean;
  v_index_exact boolean;
  v_dependencies_exact boolean;
  v_relation_exact boolean;
  v_schema_acl_exact boolean;
BEGIN
  WITH routine AS MATERIALIZED (
    SELECT proc.*, language_row.lanname AS language_name,
      pg_catalog.md5(pg_catalog.replace(proc.prosrc, E'\r\n', E'\n')) AS source_hash
    FROM (SELECT pg_catalog.to_regprocedure(
      'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'
    ) AS oid) AS target
    LEFT JOIN pg_catalog.pg_proc AS proc ON proc.oid = target.oid
    LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = proc.prolang
  )
  SELECT COALESCE(routine.oid IS NOT NULL
    AND routine.source_hash = 'e655a802f4fe1cd5f98b2f0d22815178'
    AND pg_catalog.pg_get_function_arguments(routine.oid) =
      'p_actor_id uuid, p_draft_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid, p_current_step text, p_payload jsonb, p_expected_version bigint DEFAULT NULL::bigint'
    AND pg_catalog.pg_get_function_result(routine.oid) =
      'TABLE(draft_id uuid, draft_version bigint, saved_at timestamp with time zone)'
    AND routine.pronargdefaults = 1 AND routine.proargdefaults IS NOT NULL
    AND routine.proargmodes = ARRAY['i','i','i','i','i','i','i','i','t','t','t']::"char"[]
    AND routine.proargnames = ARRAY[
      'p_actor_id','p_draft_id','p_context_type','p_group_id','p_expense_id',
      'p_current_step','p_payload','p_expected_version','draft_id','draft_version','saved_at'
    ]::text[]
    AND routine.proretset AND routine.language_name = 'plpgsql'
    AND routine.provolatile = 'v' AND NOT routine.proisstrict
    AND routine.prosecdef AND NOT routine.proleakproof AND routine.proparallel = 'u'
    AND routine.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
    AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
    AND (SELECT pg_catalog.count(*) = 2
      FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantor = routine.proowner AND NOT privilege.is_grantable
        AND (privilege.grantee = routine.proowner
          OR grantee_role.rolname = 'service_role'))
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
      WHERE privilege.privilege_type <> 'EXECUTE'
         OR privilege.grantor <> routine.proowner OR privilege.is_grantable
         OR privilege.grantee = 0
         OR (privilege.grantee <> routine.proowner
           AND grantee_role.rolname IS DISTINCT FROM 'service_role')
    )
    AND NOT pg_catalog.has_function_privilege(
      pg_catalog.to_regrole('anon'), routine.oid, 'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      pg_catalog.to_regrole('authenticated'), routine.oid, 'EXECUTE'
    )
    AND pg_catalog.has_function_privilege(
      pg_catalog.to_regrole('service_role'), routine.oid, 'EXECUTE'
    ), false) INTO v_function_exact
  FROM routine;

  WITH named_object AS MATERIALIZED (
    SELECT index_class.*, index_row.indexrelid, index_row.indrelid,
      index_row.indisunique, index_row.indisvalid, index_row.indisready,
      index_row.indislive, index_row.indnkeyatts, index_row.indnatts,
      index_row.indkey, index_row.indpred
    FROM pg_catalog.pg_class AS index_class
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = index_class.relnamespace
    LEFT JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid = index_class.oid
    WHERE namespace.nspname = 'public'
      AND index_class.relname = 'expense_private_drafts_one_edit_per_actor_expense_idx'
  ), state AS MATERIALIZED (
    SELECT named_object.*, table_namespace.nspname AS table_schema,
      table_class.relname AS table_name, access_method.amname,
      pg_catalog.pg_get_indexdef(named_object.oid) AS index_definition,
      pg_catalog.replace(pg_catalog.pg_get_expr(
        named_object.indpred, named_object.indrelid
      ), ' ', '') AS predicate,
      (SELECT pg_catalog.array_agg(attribute_row.attname ORDER BY key_column.ordinality)
       FROM pg_catalog.unnest(named_object.indkey::smallint[]) WITH ORDINALITY
         AS key_column(attnum, ordinality)
       JOIN pg_catalog.pg_attribute AS attribute_row
         ON attribute_row.attrelid = table_class.oid
        AND attribute_row.attnum = key_column.attnum) AS key_columns
    FROM named_object
    LEFT JOIN pg_catalog.pg_class AS table_class ON table_class.oid = named_object.indrelid
    LEFT JOIN pg_catalog.pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
    LEFT JOIN pg_catalog.pg_am AS access_method ON access_method.oid = named_object.relam
  )
  SELECT pg_catalog.count(*) = 1 AND COALESCE(pg_catalog.bool_and(
    state.relkind = 'i' AND state.relpersistence = 'p'
    AND pg_catalog.pg_get_userbyid(state.relowner) = 'postgres'
    AND state.indisunique AND state.indisvalid AND state.indisready AND state.indislive
    AND state.amname = 'btree' AND state.table_schema = 'public'
    AND state.table_name = 'expense_private_drafts'
    AND state.indnkeyatts = 2 AND state.indnatts = 2
    AND state.key_columns = ARRAY['actor_user_id','expense_id']::name[]
    AND state.predicate = '(context_type=''edit''::text)'
    AND state.index_definition =
      'CREATE UNIQUE INDEX expense_private_drafts_one_edit_per_actor_expense_idx ON public.expense_private_drafts USING btree (actor_user_id, expense_id) WHERE (context_type = ''edit''::text)'
  ), false) INTO v_index_exact
  FROM state;

  WITH expected(signature, arguments, result, volatility, source_hash, config) AS (
    VALUES
      ('public.expense_assert_private_draft_context(uuid,text,uuid,uuid)',
        'p_actor_id uuid, p_context_type text, p_group_id uuid, p_expense_id uuid',
        'void','v','aeb9b8246978d630fb69db9365a22f34',ARRAY['search_path=pg_catalog, public']::text[]),
      ('public.expense_sql162_event_relation_tuple(jsonb)',
        'p_payload jsonb','jsonb','i','0fa02c46d2b8b7c0c24506be5549743c',ARRAY['search_path=""']::text[])
  )
  SELECT pg_catalog.count(proc.oid) = 2 AND COALESCE(pg_catalog.bool_and(
    pg_catalog.md5(pg_catalog.replace(proc.prosrc, E'\r\n', E'\n')) = expected.source_hash
    AND pg_catalog.pg_get_function_arguments(proc.oid) = expected.arguments
    AND pg_catalog.pg_get_function_result(proc.oid) = expected.result
    AND proc.provolatile::text = expected.volatility AND language_row.lanname = 'plpgsql'
    AND NOT proc.proisstrict AND NOT proc.proretset
    AND proc.pronargdefaults = 0 AND proc.proargdefaults IS NULL
    AND proc.proargmodes IS NULL AND proc.proallargtypes IS NULL
    AND proc.prosecdef AND NOT proc.proleakproof AND proc.proparallel = 'u'
    AND proc.proconfig = expected.config
    AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'
    AND (SELECT pg_catalog.count(*) = 1
      FROM pg_catalog.aclexplode(COALESCE(
        proc.proacl, pg_catalog.acldefault('f', proc.proowner)
      )) AS privilege
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.grantee = proc.proowner AND privilege.grantor = proc.proowner
        AND NOT privilege.is_grantable)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
        proc.proacl, pg_catalog.acldefault('f', proc.proowner)
      )) AS privilege
      WHERE privilege.privilege_type <> 'EXECUTE'
         OR privilege.grantee <> proc.proowner OR privilege.grantor <> proc.proowner
         OR privilege.is_grantable
    )
  ), false) INTO v_dependencies_exact
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS proc
    ON proc.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = proc.prolang;

  SELECT COALESCE(table_row.oid IS NOT NULL AND table_row.relkind = 'r'
    AND table_row.relrowsecurity AND table_row.relforcerowsecurity
    AND pg_catalog.pg_get_userbyid(table_row.relowner) = 'postgres'
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS role_row(role_name)
      WHERE pg_catalog.has_table_privilege(
        role_row.role_name::name, table_row.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
    ), false) INTO v_relation_exact
  FROM (SELECT pg_catalog.to_regclass('public.expense_private_drafts') AS oid) AS target
  LEFT JOIN pg_catalog.pg_class AS table_row ON table_row.oid = target.oid;

  WITH expected_schema_acl(grantee, grantor, privilege_type, is_grantable) AS (
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
  )
  SELECT COALESCE(state.schema_oid = 2200::oid
    AND state.owner_oid = 6171::oid AND state.owner_name = 'pg_database_owner'
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
      SELECT 1 FROM expected_schema_roles AS expected_role
      LEFT JOIN pg_catalog.pg_roles AS role
        ON role.oid = expected_role.role_oid AND role.rolname = expected_role.role_name
      WHERE CASE WHEN expected_role.subject = 'PUBLIC' THEN
        (EXISTS (SELECT 1 FROM schema_acl_rows AS acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'USAGE'))
          IS DISTINCT FROM expected_role.expected_usage
        OR (EXISTS (SELECT 1 FROM schema_acl_rows AS acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'CREATE'))
          IS DISTINCT FROM expected_role.expected_create
      ELSE role.oid IS NULL
        OR pg_catalog.has_schema_privilege(role.oid, state.schema_oid, 'USAGE')
          IS DISTINCT FROM expected_role.expected_usage
        OR pg_catalog.has_schema_privilege(role.oid, state.schema_oid, 'CREATE')
          IS DISTINCT FROM expected_role.expected_create
      END
    ), false) INTO v_schema_acl_exact
  FROM schema_state AS state;

  IF NOT COALESCE(v_function_exact AND v_index_exact
    AND v_dependencies_exact AND v_relation_exact AND v_schema_acl_exact, false) THEN
    RAISE EXCEPTION 'expense_sql164_recovery_installed_state_drift';
  END IF;
END;
$guard$;

-- First mutation: remove only the exact callable capability.
REVOKE ALL ON FUNCTION public.expense_save_private_draft(
  uuid,uuid,text,uuid,uuid,text,jsonb,bigint
) FROM PUBLIC, anon, authenticated, service_role;

DO $verify$
DECLARE
  v_routine_oid oid := pg_catalog.to_regprocedure(
    'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'
  );
BEGIN
  IF v_routine_oid IS NULL OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS privilege
    WHERE routine.oid = v_routine_oid
      AND privilege.privilege_type = 'EXECUTE'
      AND privilege.grantee <> routine.proowner
  ) OR pg_catalog.has_function_privilege(
    pg_catalog.to_regrole('anon'), v_routine_oid, 'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    pg_catalog.to_regrole('authenticated'), v_routine_oid, 'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    pg_catalog.to_regrole('service_role'), v_routine_oid, 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'expense_sql164_recovery_unexpected_execute_grants';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indexrelid = pg_catalog.to_regclass(
      'public.expense_private_drafts_one_edit_per_actor_expense_idx'
    ) AND index_row.indisunique AND index_row.indisvalid
      AND index_row.indisready AND index_row.indislive
  ) THEN
    RAISE EXCEPTION 'expense_sql164_recovery_protective_index_missing';
  END IF;
END;
$verify$;

COMMIT;
