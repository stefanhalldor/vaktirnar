-- SQL150 postflight (read-only).
WITH target AS (
  SELECT procedure_row.*
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid = pg_catalog.to_regprocedure(
    'public.teskeid_event_get_actor_view_v2(uuid,uuid)'
  )
), dependencies AS (
  SELECT expected.signature, expected.source_md5,
    procedure_row.oid,
    pg_catalog.md5(pg_catalog.replace(
      procedure_row.prosrc, E'\r\n', E'\n'
    )) AS actual_source_md5
  FROM (VALUES
    ('public.teskeid_event_private_normalize_shared_name_v2(text)',
      'd118ab08bc0346cdf31519344a2f65a7'),
    ('public.teskeid_event_private_format_utc_timestamp_v2(timestamp with time zone)',
      '7017190619681901af3813e1fc3b305c'),
    ('public.teskeid_event_private_claim_participations_v2(uuid)',
      'b57bf9fa43754dfcd05cb7e063829bc6'),
    ('public.teskeid_event_private_assert_viewer_v2(uuid,uuid)',
      '211fbfb65b4edaa4b0307c2fb5878a60'),
    ('public.teskeid_event_private_people_projection_v2(uuid,uuid,text)',
      '2eb6db6c327de83f1bf241f9368c3a0c')
  ) AS expected(signature, source_md5)
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), metrics AS (
  SELECT
    pg_catalog.current_database() AS database_name,
    current_user AS database_user,
    pg_catalog.clock_timestamp() AS checked_at,
    (SELECT pg_catalog.count(*) = 1 FROM target) AS function_exists_ok,
    COALESCE((SELECT pg_catalog.md5(pg_catalog.replace(
      prosrc, E'\r\n', E'\n'
    )) =
      'df539138c44252719575a9d0d090968b' FROM target), false)
      AS function_body_exact_ok,
    COALESCE((
      SELECT owner_role.rolname = 'postgres'
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
      FROM target AS procedure_row
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = procedure_row.proowner
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
    ), false) AS function_security_exact_ok,
    COALESCE((
      SELECT pg_catalog.has_function_privilege(
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
      FROM target AS procedure_row
    ), false) AS function_acl_exact_ok,
    (SELECT pg_catalog.count(*) = 5
       AND pg_catalog.bool_and(
         oid IS NOT NULL AND actual_source_md5 = source_md5
       ) FROM dependencies) AS direct_dependencies_unchanged_ok,
    pg_catalog.to_char(
      date '2000-01-01' + time '00:00:00', 'HH24:MI:SS'
    ) = '00:00:00'
      AND pg_catalog.to_char(
        date '2000-01-01' + time '04:05:06', 'HH24:MI:SS'
      ) = '04:05:06'
      AND pg_catalog.to_char(
        date '2000-01-01' + time '23:59:59', 'HH24:MI:SS'
      ) = '23:59:59' AS time_formatter_edges_ok
)
SELECT *,
  function_exists_ok
  AND function_body_exact_ok
  AND function_security_exact_ok
  AND function_acl_exact_ok
  AND direct_dependencies_unchanged_ok
  AND time_formatter_edges_ok AS postconditions_ok
FROM metrics;
