-- SQL151 preflight (100% read-only).
WITH expected_dependencies(signature, expected_source_md5) AS (
  VALUES
    ('public.teskeid_event_get_actor_view_v2(uuid,uuid)',
      'df539138c44252719575a9d0d090968b'),
    ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
      '2eb6db6c327de83f1bf241f9368c3a0c'),
    ('public.teskeid_event_private_person_projection_v2(uuid,uuid,uuid,integer,boolean)',
      'dd6d4f6b57c109fb46d6992ce66462e8'),
    ('public.teskeid_event_private_organizer_projection_v2(uuid,uuid,integer)',
      'd42c11caf87eaac45646535539029977'),
    ('public.teskeid_event_private_normalize_shared_name_v2(text)',
      'd118ab08bc0346cdf31519344a2f65a7'),
    ('public.teskeid_event_private_valid_canonical_email_v2(text)',
      '3e64bc04485bc06cc544f59f46a2fb0e'),
    ('public.teskeid_event_valid_text(text,integer,integer)',
      '28c80b083a90683f15fd04f4d7d547d1')
), dependencies AS (
  SELECT expected.signature, expected.expected_source_md5,
    procedure_row.oid,
    pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc, E'\r\n', E'\n'
    )) AS normalized_source_md5
  FROM expected_dependencies AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), target AS (
  SELECT procedure_row.*
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)'
  )
), sql150_target AS (
  SELECT procedure_row.*
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_get_actor_view_v2(uuid,uuid)'
  )
), metrics AS (
  SELECT
    pg_catalog.current_database() AS database_name,
    current_user AS database_user,
    pg_catalog.clock_timestamp() AS checked_at,
    pg_catalog.current_setting('server_version_num')::integer >= 150000
      AS server_version_ok,
    current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    (SELECT pg_catalog.count(*) = 1 FROM target) AS function_exists_ok,
    COALESCE((SELECT pg_catalog.md5(pg_catalog.replace(
      prosrc, E'\r\n', E'\n'
    )) = 'ad66614815b29a02ee3dc928c17886c3' FROM target), false)
      AS predecessor_exact_ok,
    COALESCE((SELECT pg_catalog.md5(pg_catalog.replace(
      prosrc, E'\r\n', E'\n'
    )) = 'cfb3afa33af8fd230e6c26930424387f' FROM target), false)
      AS already_applied,
    COALESCE((
      SELECT owner_role.rolname = 'postgres'
        AND language_row.lanname = 'plpgsql'
        AND procedure_row.prokind = 'f'
        AND procedure_row.prosecdef
        AND NOT procedure_row.proisstrict
        AND NOT procedure_row.proleakproof
        AND NOT procedure_row.proretset
        AND procedure_row.pronargdefaults = 0
        AND procedure_row.provolatile = 's'
        AND procedure_row.proparallel = 'u'
        AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
        AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
          'p_actor_id uuid, p_relationship_id uuid, p_recipient_user_id uuid, p_recipient_email_canonical text'
        AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.pg_proc AS overload
          WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
            AND overload.proname =
              'teskeid_event_private_viewer_relationship_v2'
        ) = 1
      FROM target AS procedure_row
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = procedure_row.proowner
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
    ), false) AS function_security_exact_ok,
    COALESCE((
      SELECT NOT pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.grantee <> procedure_row.proowner
             OR privilege.is_grantable
        )
      FROM target AS procedure_row
    ), false) AS function_acl_exact_ok,
    (SELECT pg_catalog.count(*) = 7
       AND pg_catalog.bool_and(
         oid IS NOT NULL
         AND normalized_source_md5 = expected_source_md5
       ) FROM dependencies) AS direct_dependencies_exact_ok,
    (SELECT COALESCE(pg_catalog.array_agg(signature ORDER BY signature)
       FILTER (WHERE oid IS NULL
         OR normalized_source_md5 <> expected_source_md5), ARRAY[]::text[])
       FROM dependencies) AS dependency_mismatches,
    COALESCE((
      SELECT pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = 'df539138c44252719575a9d0d090968b'
        AND owner_role.rolname = 'postgres'
        AND language_row.lanname = 'plpgsql'
        AND procedure_row.prokind = 'f'
        AND procedure_row.prosecdef
        AND NOT procedure_row.proisstrict
        AND NOT procedure_row.proleakproof
        AND NOT procedure_row.proretset
        AND procedure_row.pronargdefaults = 0
        AND procedure_row.provolatile = 'v'
        AND procedure_row.proparallel = 'u'
        AND pg_catalog.pg_get_function_result(procedure_row.oid) = 'jsonb'
        AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
          'p_actor_id uuid, p_event_id uuid'
        AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.pg_proc AS overload
          WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
            AND overload.proname = 'teskeid_event_get_actor_view_v2'
        ) = 1
        AND pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = privilege.grantee
          WHERE grantee.rolname = 'service_role'
            AND privilege.privilege_type = 'EXECUTE'
            AND NOT privilege.is_grantable
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = privilege.grantee
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR (
               privilege.grantee <> procedure_row.proowner
               AND grantee.rolname IS DISTINCT FROM 'service_role'
             )
        )
      FROM sql150_target AS procedure_row
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = procedure_row.proowner
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
    ), false) AS sql150_boundary_exact_ok,
    GREATEST(3, 0) = 3 AS greatest_expression_ok
)
SELECT *,
  server_version_ok
  AND executor_ok
  AND function_exists_ok
  AND (predecessor_exact_ok OR already_applied)
  AND function_security_exact_ok
  AND function_acl_exact_ok
  AND direct_dependencies_exact_ok
  AND sql150_boundary_exact_ok
  AND greatest_expression_ok AS prerequisites_ok
FROM metrics;
