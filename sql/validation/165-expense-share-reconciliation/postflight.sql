-- SQL165 postflight: read-only exact installed-contract verification.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';

WITH
role_oids AS MATERIALIZED (
  SELECT
    pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
),
expected_function_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
  SELECT roles.postgres_oid, roles.postgres_oid, 'EXECUTE'::text, false
  FROM role_oids AS roles
  UNION ALL
  SELECT roles.service_role_oid, roles.postgres_oid, 'EXECUTE'::text, false
  FROM role_oids AS roles
),
target_function AS MATERIALIZED (
  SELECT routine.*,
    language_row.lanname AS language_name,
    pg_catalog.pg_get_userbyid(routine.proowner) AS owner_name,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash,
    pg_catalog.pg_get_function_arguments(routine.oid) AS arguments
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
  )
),
function_acl_rows AS MATERIALIZED (
  SELECT privilege_row.grantee, privilege_row.grantor,
    privilege_row.privilege_type, privilege_row.is_grantable
  FROM target_function AS routine
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    routine.proacl, pg_catalog.acldefault('f', routine.proowner)
  )) AS privilege_row
),
function_acl_evidence AS MATERIALIZED (
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
    AND roles.service_role_oid IS NOT NULL
    AND roles.anon_oid IS NOT NULL
    AND roles.authenticated_oid IS NOT NULL
    AND (SELECT pg_catalog.count(*) FROM expected_function_acl) = 2
    AND (SELECT pg_catalog.count(*) FROM function_acl_rows) = 2
    AND NOT EXISTS (
      SELECT acl.* FROM function_acl_rows AS acl
      EXCEPT ALL
      SELECT expected.* FROM expected_function_acl AS expected
    )
    AND NOT EXISTS (
      SELECT expected.* FROM expected_function_acl AS expected
      EXCEPT ALL
      SELECT acl.* FROM function_acl_rows AS acl
    )
    AND NOT EXISTS (
      SELECT 1 FROM function_acl_rows AS acl WHERE acl.grantee = 0::oid
    )
    AND COALESCE((
      SELECT routine.proacl IS NOT NULL
        AND routine.proowner = roles.postgres_oid
        AND pg_catalog.has_function_privilege(
          roles.service_role_oid, routine.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.anon_oid, routine.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.authenticated_oid, routine.oid, 'EXECUTE'
        )
      FROM target_function AS routine
    ), false),
    false
  ) AS function_acl_exact
  FROM role_oids AS roles
),
function_evidence AS MATERIALIZED (
  SELECT
    pg_catalog.count(*) = 1 AS function_exists,
    COALESCE(pg_catalog.bool_and(
      prokind = 'f' AND pronargs = 15
      AND prorettype = 'jsonb'::pg_catalog.regtype AND NOT proretset
      AND prosecdef AND provolatile = 'v' AND NOT proisstrict
      AND NOT proleakproof AND proparallel = 'u'
      AND pronargdefaults = 0 AND proargdefaults IS NULL
      AND proallargtypes IS NULL AND proargmodes IS NULL
      AND proconfig = ARRAY['search_path=""']::text[]
      AND language_name = 'plpgsql' AND owner_name = 'postgres'
      AND arguments = 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_preserve_shares boolean, p_new_guest_members jsonb, p_payments jsonb, p_shares jsonb'
    ), false) AS contract_exact,
    COALESCE(pg_catalog.bool_and(source_hash = '675891833b4bb9aeb130f74da94994b3'), false)
      AS predecessor_exact,
    COALESCE(pg_catalog.bool_and(source_hash = '30ba02f3b79d2c7a9387ee504d198d12'), false)
      AS target_exact
  FROM target_function
),
wrapper_function AS MATERIALIZED (
  SELECT wrapper.*,
    wrapper_language.lanname AS language_name,
    pg_catalog.md5(pg_catalog.replace(wrapper.prosrc, E'\r\n', E'\n')) AS source_hash,
    pg_catalog.pg_get_function_arguments(wrapper.oid) AS arguments
  FROM pg_catalog.pg_proc AS wrapper
  JOIN pg_catalog.pg_language AS wrapper_language
    ON wrapper_language.oid = wrapper.prolang
  WHERE wrapper.oid = pg_catalog.to_regprocedure(
    'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
  )
),
wrapper_acl_rows AS MATERIALIZED (
  SELECT privilege_row.grantee, privilege_row.grantor,
    privilege_row.privilege_type, privilege_row.is_grantable
  FROM wrapper_function AS wrapper
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    wrapper.proacl, pg_catalog.acldefault('f', wrapper.proowner)
  )) AS privilege_row
),
wrapper_acl_evidence AS MATERIALIZED (
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
    AND roles.service_role_oid IS NOT NULL
    AND roles.anon_oid IS NOT NULL
    AND roles.authenticated_oid IS NOT NULL
    AND (SELECT pg_catalog.count(*) FROM expected_function_acl) = 2
    AND (SELECT pg_catalog.count(*) FROM wrapper_acl_rows) = 2
    AND NOT EXISTS (
      SELECT acl.* FROM wrapper_acl_rows AS acl
      EXCEPT ALL
      SELECT expected.* FROM expected_function_acl AS expected
    )
    AND NOT EXISTS (
      SELECT expected.* FROM expected_function_acl AS expected
      EXCEPT ALL
      SELECT acl.* FROM wrapper_acl_rows AS acl
    )
    AND NOT EXISTS (
      SELECT 1 FROM wrapper_acl_rows AS acl WHERE acl.grantee = 0::oid
    )
    AND COALESCE((
      SELECT wrapper.proacl IS NOT NULL
        AND wrapper.proowner = roles.postgres_oid
        AND pg_catalog.has_function_privilege(
          roles.service_role_oid, wrapper.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.anon_oid, wrapper.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          roles.authenticated_oid, wrapper.oid, 'EXECUTE'
        )
      FROM wrapper_function AS wrapper
    ), false),
    false
  ) AS wrapper_acl_exact
  FROM role_oids AS roles
),
wrapper_evidence AS MATERIALIZED (
  SELECT
    pg_catalog.count(*) = 1 AND COALESCE(pg_catalog.bool_and(
      wrapper.prokind = 'f' AND wrapper.pronargs = 17
      AND wrapper.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT wrapper.proretset AND wrapper.provolatile = 'v'
      AND wrapper.prosecdef AND NOT wrapper.proisstrict
      AND NOT wrapper.proleakproof AND wrapper.proparallel = 'u'
      AND wrapper.pronargdefaults = 0 AND wrapper.proargdefaults IS NULL
      AND wrapper.proallargtypes IS NULL AND wrapper.proargmodes IS NULL
      AND wrapper.proconfig = ARRAY['search_path=""']::text[]
      AND wrapper.language_name = 'plpgsql'
      AND pg_catalog.pg_get_userbyid(wrapper.proowner) = 'postgres'
      AND wrapper.arguments = 'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_preserve_shares boolean, p_new_guest_members jsonb, p_new_participant_invitations jsonb, p_removed_member_ids uuid[], p_payments jsonb, p_shares jsonb'
    ), false) AS wrapper_contract_exact,
    COALESCE(pg_catalog.bool_and(
      wrapper.source_hash = 'c3a1ab7746d50ed552c625bbc95efbab'
    ), false) AS wrapper_source_exact,
    COALESCE(pg_catalog.bool_and(
      pg_catalog.length(wrapper.prosrc)
        - pg_catalog.length(pg_catalog.replace(
          wrapper.prosrc, 'v_result := public.expense_update_expense(', ''
        )) = pg_catalog.length('v_result := public.expense_update_expense(')
      AND pg_catalog.length(wrapper.prosrc)
        - pg_catalog.length(pg_catalog.replace(
          wrapper.prosrc, 'public.expense_update_expense(', ''
        )) = pg_catalog.length('public.expense_update_expense(')
      AND pg_catalog.to_regprocedure(
        'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
      ) IS NOT NULL
    ), false) AS wrapper_base_call_exact
  FROM wrapper_function AS wrapper
),
foreign_key_evidence AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 2
    AND COALESCE(pg_catalog.bool_and(
      constraint_row.contype = 'f'
      AND constraint_row.convalidated
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred
      AND constraint_row.confdeltype = 'r'
      AND constraint_row.confupdtype = 'a'
      AND constraint_row.confmatchtype = 's'
      AND constraint_row.confrelid = 'public.expense_shares'::pg_catalog.regclass
      AND ARRAY(
        SELECT attribute.attname::text
        FROM pg_catalog.unnest(constraint_row.confkey) WITH ORDINALITY AS key(attnum, ordinal)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.confrelid AND attribute.attnum = key.attnum
        ORDER BY key.ordinal
      ) = ARRAY['expense_id', 'member_id']::text[]
      AND (
        (constraint_row.conname = 'expense_share_collaborators_expense_share_fk'
          AND constraint_row.conrelid = 'public.expense_share_collaborators'::pg_catalog.regclass
          AND ARRAY(
            SELECT attribute.attname::text
            FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinal)
            JOIN pg_catalog.pg_attribute AS attribute
              ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key.attnum
            ORDER BY key.ordinal
          ) = ARRAY['expense_id', 'share_member_id']::text[])
        OR
        (constraint_row.conname = 'expense_member_invitations_shared_share_fk'
          AND constraint_row.conrelid = 'public.expense_member_invitations'::pg_catalog.regclass
          AND ARRAY(
            SELECT attribute.attname::text
            FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinal)
            JOIN pg_catalog.pg_attribute AS attribute
              ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key.attnum
            ORDER BY key.ordinal
          ) = ARRAY['shared_expense_id', 'shared_share_member_id']::text[])
      )
    ), false) AS share_foreign_keys_exact,
    (
      SELECT pg_catalog.count(*) = 2
      FROM pg_catalog.pg_constraint AS inbound_constraint
      WHERE inbound_constraint.contype = 'f'
        AND inbound_constraint.confrelid = 'public.expense_shares'::pg_catalog.regclass
    ) AS inbound_share_foreign_key_count_exact
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE (
    (constraint_row.conrelid = 'public.expense_share_collaborators'::pg_catalog.regclass
      AND constraint_row.conname = 'expense_share_collaborators_expense_share_fk')
    OR
    (constraint_row.conrelid = 'public.expense_member_invitations'::pg_catalog.regclass
      AND constraint_row.conname = 'expense_member_invitations_shared_share_fk')
  )
),
expected_schema_acl(grantee, privilege_type) AS (
  VALUES
    ('PUBLIC'::text, 'USAGE'::text),
    ('pg_database_owner', 'CREATE'),
    ('pg_database_owner', 'USAGE'),
    ('postgres', 'USAGE'),
    ('anon', 'USAGE'),
    ('authenticated', 'USAGE'),
    ('service_role', 'USAGE')
),
schema_acl_rows AS MATERIALIZED (
  SELECT COALESCE(grantee_role.rolname, 'PUBLIC')::text AS grantee,
    privilege_row.privilege_type,
    grantor_role.rolname AS grantor,
    privilege_row.is_grantable
  FROM pg_catalog.pg_namespace AS namespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl) AS privilege_row
  LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = privilege_row.grantee
  LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = privilege_row.grantor
  WHERE namespace.nspname = 'public'
),
schema_acl_evidence AS MATERIALIZED (
  SELECT COALESCE(
    (SELECT pg_catalog.pg_get_userbyid(namespace.nspowner) = 'pg_database_owner'
       AND namespace.nspacl IS NOT NULL
     FROM pg_catalog.pg_namespace AS namespace WHERE namespace.nspname = 'public')
    AND (SELECT pg_catalog.count(*) FROM schema_acl_rows) = 7
    AND NOT EXISTS (SELECT grantee, privilege_type FROM schema_acl_rows
      EXCEPT SELECT grantee, privilege_type FROM expected_schema_acl)
    AND NOT EXISTS (SELECT grantee, privilege_type FROM expected_schema_acl
      EXCEPT SELECT grantee, privilege_type FROM schema_acl_rows)
    AND NOT EXISTS (SELECT 1 FROM schema_acl_rows
      WHERE grantor IS DISTINCT FROM 'pg_database_owner' OR is_grantable),
    false
  ) AS public_schema_acl_exact
),
evidence AS (
  SELECT
    current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    function_evidence.*,
    function_acl_evidence.function_acl_exact AS acl_exact,
    wrapper_evidence.wrapper_contract_exact,
    wrapper_acl_evidence.wrapper_acl_exact,
    wrapper_evidence.wrapper_source_exact,
    wrapper_evidence.wrapper_base_call_exact,
    foreign_key_evidence.share_foreign_keys_exact,
    foreign_key_evidence.inbound_share_foreign_key_count_exact,
    schema_acl_evidence.public_schema_acl_exact
  FROM function_evidence
  CROSS JOIN function_acl_evidence
  CROSS JOIN wrapper_evidence
  CROSS JOIN wrapper_acl_evidence
  CROSS JOIN foreign_key_evidence
  CROSS JOIN schema_acl_evidence
)
SELECT
  executor_ok,
  function_exists,
  contract_exact,
  acl_exact,
  wrapper_contract_exact,
  wrapper_acl_exact,
  wrapper_source_exact,
  wrapper_base_call_exact,
  share_foreign_keys_exact,
  inbound_share_foreign_key_count_exact,
  public_schema_acl_exact,
  target_exact AS source_hash_exact,
  executor_ok AND function_exists AND contract_exact AND acl_exact
    AND wrapper_contract_exact AND wrapper_acl_exact
    AND wrapper_source_exact AND wrapper_base_call_exact
    AND share_foreign_keys_exact AND inbound_share_foreign_key_count_exact
    AND public_schema_acl_exact AND target_exact
    AS postconditions_ok
FROM evidence;
ROLLBACK;
