-- SQL142 preflight diagnosis: one bounded, catalog-only row.
-- Read-only. It never reads Household/Relationship/user application rows and
-- never returns auth identities, emails, labels, chores, points, or payloads.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

WITH
required_roles(role_name) AS (
  VALUES ('postgres'), ('anon'), ('authenticated'), ('service_role')
),
missing_roles AS (
  SELECT COALESCE(
    pg_catalog.jsonb_agg(required_roles.role_name ORDER BY required_roles.role_name),
    '[]'::jsonb
  ) AS items
  FROM required_roles
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = required_roles.role_name
  )
),
required_relations(object_identity) AS (
  VALUES
    ('auth.users'),
    ('public.profiles'),
    ('public.relationships'),
    ('public.feature_access'),
    ('public.recent_events')
),
missing_relations AS (
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      required_relations.object_identity ORDER BY required_relations.object_identity
    ),
    '[]'::jsonb
  ) AS items
  FROM required_relations
  WHERE pg_catalog.to_regclass(required_relations.object_identity) IS NULL
),
required_columns(
  object_identity, column_name, expected_type, expected_not_null
) AS (
  VALUES
    ('auth.users', 'id', 'uuid', true),
    ('auth.users', 'email', 'textlike', false),
    ('auth.users', 'email_confirmed_at', 'timestamp with time zone', false),
    ('public.profiles', 'id', 'uuid', true),
    ('public.profiles', 'display_name', 'text', true),
    ('public.relationships', 'id', 'uuid', true),
    ('public.relationships', 'owner_id', 'uuid', true),
    ('public.relationships', 'counterpart_user_id', 'uuid', false),
    ('public.relationships', 'private_display_name', 'text', false),
    ('public.feature_access', 'email', 'text', true),
    ('public.feature_access', 'feature_key', 'text', true),
    ('public.recent_events', 'id', 'bigint', true),
    ('public.recent_events', 'user_id', 'uuid', true),
    ('public.recent_events', 'source', 'text', true),
    ('public.recent_events', 'event_type', 'text', true),
    ('public.recent_events', 'entity_type', 'text', true),
    ('public.recent_events', 'entity_id', 'uuid', false),
    ('public.recent_events', 'event_key', 'text', true),
    ('public.recent_events', 'payload', 'jsonb', true),
    ('public.recent_events', 'href', 'text', true),
    ('public.recent_events', 'occurred_at', 'timestamp with time zone', true),
    ('public.recent_events', 'ack_at', 'timestamp with time zone', false),
    ('public.recent_events', 'created_at', 'timestamp with time zone', true)
),
missing_columns AS (
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      required_column.object_identity || '.' || required_column.column_name ||
      ' expected=' || required_column.expected_type ||
      CASE WHEN required_column.expected_not_null
        THEN ' not-null' ELSE ' nullable' END
      ORDER BY required_column.object_identity, required_column.column_name
    ),
    '[]'::jsonb
  ) AS items
  FROM required_columns AS required_column
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_row
    WHERE attribute_row.attrelid =
      pg_catalog.to_regclass(required_column.object_identity)
      AND attribute_row.attname = required_column.column_name
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
      AND (
        (
          required_column.expected_type = 'textlike'
          AND attribute_row.atttypid IN (
            'text'::pg_catalog.regtype,
            'character varying'::pg_catalog.regtype
          )
        )
        OR (
          required_column.expected_type <> 'textlike'
          AND pg_catalog.format_type(
            attribute_row.atttypid, attribute_row.atttypmod
          ) = required_column.expected_type
        )
      )
      AND attribute_row.attnotnull IS NOT DISTINCT FROM
        required_column.expected_not_null
  )
),
required_parent_keys(schema_name, relation_name, column_name) AS (
  VALUES
    ('auth', 'users', 'id'),
    ('public', 'relationships', 'id')
),
missing_parent_keys AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    parent_key.schema_name || '.' || parent_key.relation_name ||
      '(' || parent_key.column_name || ')'
    ORDER BY parent_key.schema_name, parent_key.relation_name
  ), '[]'::jsonb) AS items
  FROM required_parent_keys AS parent_key
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute_row
      ON attribute_row.attrelid = relation_row.oid
     AND attribute_row.attnum = index_row.indkey[0]
    WHERE namespace_row.nspname = parent_key.schema_name
      AND relation_row.relname = parent_key.relation_name
      AND attribute_row.attname = parent_key.column_name
      AND index_row.indisunique
      AND index_row.indimmediate
      AND NOT index_row.indisexclusion
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indnkeyatts = 1
      AND index_row.indnatts = 1
      AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
  )
),
recent_default_contract AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid =
        pg_catalog.to_regclass('public.recent_events')
        AND attribute_row.attname = 'id'
        AND attribute_row.attidentity = 'a'
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
    ) AS identity_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      JOIN pg_catalog.pg_attrdef AS default_row
        ON default_row.adrelid = attribute_row.attrelid
       AND default_row.adnum = attribute_row.attnum
      WHERE attribute_row.attrelid =
        pg_catalog.to_regclass('public.recent_events')
        AND attribute_row.attname = 'created_at'
        AND attribute_row.atthasdef
        AND pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid, false
        ) = 'now()'
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
    ) AS created_default_ok
),
required_functions(object_identity) AS (
  VALUES
    ('public.normalize_email_canonical(text)'),
    ('extensions.digest(bytea,text)'),
    ('public.expense_prepare_account_deletion(uuid)')
),
missing_functions AS (
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      required_functions.object_identity ORDER BY required_functions.object_identity
    ),
    '[]'::jsonb
  ) AS items
  FROM required_functions
  WHERE pg_catalog.to_regprocedure(required_functions.object_identity) IS NULL
),
dependency_contract AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.normalize_email_canonical(text)'
      )
        AND procedure_row.prokind = 'f'
        AND procedure_row.prorettype = 'text'::pg_catalog.regtype
        AND NOT procedure_row.proretset
        AND NOT procedure_row.prosecdef
        AND procedure_row.provolatile = 'i'
        AND procedure_row.proisstrict
        AND procedure_row.proparallel = 's'
        AND NOT procedure_row.proleakproof
        AND procedure_row.pronargdefaults = 0
        AND language_row.lanname = 'sql'
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
          'p_email text'
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = '3083103976aa8cb3780937b9da1be236'
        AND pg_catalog.cardinality(COALESCE(
          procedure_row.proconfig, ARRAY[]::text[]
        )) = 1
        AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          WHERE privilege.privilege_type = 'EXECUTE'
        ) = 2
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee_role
            ON grantee_role.oid = privilege.grantee
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR privilege.grantor <> procedure_row.proowner
             OR (
               privilege.grantee <> procedure_row.proowner
               AND grantee_role.rolname IS DISTINCT FROM 'service_role'
             )
        )
    ) AS email_normalizer_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'extensions.digest(bytea,text)'
      )
        AND procedure_row.prokind = 'f'
        AND procedure_row.prorettype = 'bytea'::pg_catalog.regtype
        AND NOT procedure_row.proretset
        AND NOT procedure_row.prosecdef
        AND procedure_row.provolatile = 'i'
        AND procedure_row.proisstrict
        AND procedure_row.proparallel = 's'
        AND NOT procedure_row.proleakproof
        AND procedure_row.pronargdefaults = 0
        AND pg_catalog.cardinality(COALESCE(
          procedure_row.proconfig, ARRAY[]::text[]
        )) = 0
        AND language_row.lanname = 'c'
        AND procedure_row.prosrc = 'pg_digest'
        AND procedure_row.probin = '$libdir/pgcrypto'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_depend AS dependency_row
          JOIN pg_catalog.pg_extension AS extension_row
            ON extension_row.oid = dependency_row.refobjid
          WHERE dependency_row.classid =
              'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency_row.objid = procedure_row.oid
            AND dependency_row.refclassid =
              'pg_catalog.pg_extension'::pg_catalog.regclass
            AND dependency_row.deptype = 'e'
            AND extension_row.extname = 'pgcrypto'
        )
    ) AS digest_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.expense_prepare_account_deletion(uuid)'
      )
        AND procedure_row.prokind = 'f'
        AND procedure_row.prorettype = 'jsonb'::pg_catalog.regtype
        AND NOT procedure_row.proretset
        AND procedure_row.prosecdef
        AND procedure_row.provolatile = 'v'
        AND NOT procedure_row.proisstrict
        AND procedure_row.proparallel = 'u'
        AND NOT procedure_row.proleakproof
        AND procedure_row.pronargdefaults = 0
        AND language_row.lanname = 'plpgsql'
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
          'p_user_id uuid'
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = '0562edbfaa608cead23d23d49ec36a66'
        AND pg_catalog.cardinality(COALESCE(
          procedure_row.proconfig, ARRAY[]::text[]
        )) = 1
        AND procedure_row.proconfig[1] IN ('search_path=', 'search_path=""')
        AND (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          WHERE privilege.privilege_type = 'EXECUTE'
        ) = 2
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee_role
            ON grantee_role.oid = privilege.grantee
          WHERE privilege.privilege_type <> 'EXECUTE'
             OR privilege.grantee = 0
             OR privilege.is_grantable
             OR privilege.grantor <> procedure_row.proowner
             OR (
               privilege.grantee <> procedure_row.proowner
               AND grantee_role.rolname IS DISTINCT FROM 'service_role'
             )
        )
    ) AS account_deletion_ok
),
feature_contract AS (
  SELECT
    pg_catalog.pg_get_expr(
      constraint_row.conbin, constraint_row.conrelid, false
    ) AS expression,
    constraint_row.conkey,
    (
      SELECT attribute_row.attnum
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid = constraint_row.conrelid
        AND attribute_row.attname = 'feature_key'
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
    ) AS feature_key_attnum
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated
),
feature_shape AS (
  SELECT
    feature_contract.expression,
    pg_catalog.md5(pg_catalog.lower(feature_contract.expression))
      AS expression_md5,
    literal_rows.items AS allowed_keys,
    feature_contract.conkey =
      ARRAY[feature_contract.feature_key_attnum]::smallint[]
    AND pg_catalog.md5(pg_catalog.lower(feature_contract.expression)) =
      '97736909cf1a3a5432eeb34275cf3cfc'
    AND literal_rows.items = ARRAY[
      'afmaeli-og-vidburdir', 'agent-collaboration-private-beta',
      'auglysandi', 'bokanir', 'bokhaldid', 'elta-vedrid',
      'facebook-oauth', 'ferdalagid', 'kviss', 'road-intelligence-v1',
      'tengsl', 'teskeid-routing-v1', 'umonnun',
      'utlagt-og-endurgreitt', 'vedrid',
      'weather-provider-vedurstofan', 'weather-provider-vegagerdin',
      'weather-pulse'
    ]::text[] AS exact_ok
  FROM feature_contract
  CROSS JOIN LATERAL (
    SELECT pg_catalog.array_agg(
      match_row.value[1] ORDER BY match_row.value[1] COLLATE "C"
    ) AS items
    FROM pg_catalog.regexp_matches(
      feature_contract.expression, '''([^'']+)''', 'g'
    ) AS match_row(value)
  ) AS literal_rows
),
recent_contract AS (
  SELECT pg_catalog.pg_get_expr(
    constraint_row.conbin,
    constraint_row.conrelid,
    false
  ) AS expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.recent_events')
    AND constraint_row.conname = 'recent_events_source_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated
),
recent_shape AS (
  SELECT
    recent_contract.expression,
    pg_catalog.lower(pg_catalog.regexp_replace(
      COALESCE(recent_contract.expression, ''), '[[:space:]]+', '', 'g'
    )) AS normalized_expression,
    (
      SELECT pg_catalog.array_agg(match_row.value[1] ORDER BY match_row.value[1])
      FROM pg_catalog.regexp_matches(
        COALESCE(recent_contract.expression, ''),
        '''([^'']+)''',
        'g'
      ) AS match_row(value)
    ) AS sources
  FROM recent_contract
),
recent_conflict_contract AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    JOIN pg_catalog.pg_attribute AS first_attribute
      ON first_attribute.attrelid = relation_row.oid
     AND first_attribute.attnum = index_row.indkey[0]
    JOIN pg_catalog.pg_attribute AS second_attribute
      ON second_attribute.attrelid = relation_row.oid
     AND second_attribute.attnum = index_row.indkey[1]
    WHERE namespace_row.nspname = 'public'
      AND relation_row.relname = 'recent_events'
      AND index_row.indisunique
      AND index_row.indimmediate
      AND NOT index_row.indisexclusion
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indnkeyatts = 2
      AND index_row.indnatts = 2
      AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
      AND first_attribute.attname = 'user_id'
      AND second_attribute.attname = 'event_key'
  ) AS ok
),
found_target_relations AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(item.description ORDER BY item.description), '[]'::jsonb)
    AS items
  FROM (
    SELECT pg_catalog.format(
      '%I.%I [%s]', namespace_row.nspname, relation_row.relname,
      relation_row.relkind
    ) AS description
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND (
        pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
        OR relation_row.relname = 'recent_events_household_chore_entity_idx'
      )
    ORDER BY namespace_row.nspname, relation_row.relname
    LIMIT 100
  ) AS item
),
found_target_types AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    type_row.typname::text ORDER BY type_row.typname::text
  ), '[]'::jsonb) AS items
  FROM pg_catalog.pg_type AS type_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = type_row.typnamespace
  WHERE namespace_row.nspname = 'public'
    AND type_row.typrelid = 0
    AND type_row.typname::text = ANY (ARRAY[
      'household_chore_assignment_events',
      'household_chore_assignments',
      'household_chore_circles',
      'household_chore_definition_events',
      'household_chore_definitions',
      'household_chore_delete_authorizations',
      'household_chore_delete_tombstones',
      'household_chore_deletion_markers',
      'household_chore_invitations',
      'household_chore_membership_events',
      'household_chore_memberships',
      'household_chore_mutation_requests',
      'household_chore_participant_values',
      'household_chore_participants',
      'household_chore_point_entries',
      'household_chore_rate_events',
      'household_chore_type_authorizations'
    ]::text[])
),
found_target_functions AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(item.description ORDER BY item.description), '[]'::jsonb)
    AS items
  FROM (
    SELECT pg_catalog.format(
      '%I.%I(%s)', namespace_row.nspname, function_row.proname,
      pg_catalog.pg_get_function_identity_arguments(function_row.oid)
    ) AS description
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
    ORDER BY function_row.proname,
      pg_catalog.pg_get_function_identity_arguments(function_row.oid)
    LIMIT 100
  ) AS item
),
found_target_triggers AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(item.description ORDER BY item.description), '[]'::jsonb)
    AS items
  FROM (
    SELECT pg_catalog.format(
      '%I.%I:%I', namespace_row.nspname, relation_row.relname,
      trigger_row.tgname
    ) AS description
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    WHERE NOT trigger_row.tgisinternal
      AND namespace_row.nspname = 'auth'
      AND relation_row.relname = 'users'
      AND trigger_row.tgname = 'household_chore_auth_delete_guard'
    ORDER BY namespace_row.nspname, relation_row.relname, trigger_row.tgname
    LIMIT 100
  ) AS item
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.current_setting('server_version_num') AS server_version_num,
  pg_catalog.current_setting('server_version_num') = '170006'
    AS server_version_ok,
  pg_catalog.clock_timestamp() AS checked_at,
  (SELECT missing_roles.items FROM missing_roles) AS missing_roles,
  (SELECT missing_relations.items FROM missing_relations) AS missing_relations,
  (SELECT missing_columns.items FROM missing_columns) AS missing_columns,
  (SELECT missing_parent_keys.items FROM missing_parent_keys)
    AS missing_parent_keys,
  (SELECT recent_default_contract.identity_ok FROM recent_default_contract)
    AS recent_identity_ok,
  (SELECT recent_default_contract.created_default_ok FROM recent_default_contract)
    AS recent_created_default_ok,
  (SELECT missing_functions.items FROM missing_functions) AS missing_functions,
  (SELECT dependency_contract.email_normalizer_ok FROM dependency_contract)
    AS email_normalizer_exact_ok,
  (SELECT dependency_contract.digest_ok FROM dependency_contract)
    AS digest_exact_ok,
  (SELECT dependency_contract.account_deletion_ok FROM dependency_contract)
    AS account_deletion_dependency_exact_ok,
  (SELECT feature_shape.expression FROM feature_shape)
    AS actual_feature_key_constraint,
  (SELECT feature_shape.expression_md5 FROM feature_shape)
    AS feature_key_constraint_md5,
  (SELECT feature_shape.allowed_keys FROM feature_shape)
    AS actual_feature_keys,
  COALESCE((SELECT feature_shape.exact_ok FROM feature_shape), false)
    AS rollout_constraint_exact_ok,
  (SELECT recent_shape.expression FROM recent_shape)
    AS actual_recent_source_expression,
  (SELECT recent_shape.normalized_expression FROM recent_shape)
    AS normalized_recent_source_expression,
  (SELECT recent_shape.sources FROM recent_shape) AS actual_recent_sources,
  (SELECT recent_conflict_contract.ok FROM recent_conflict_contract)
    AS recent_conflict_key_ok,
  (SELECT found_target_relations.items FROM found_target_relations)
    AS found_target_relations,
  (SELECT found_target_types.items FROM found_target_types)
    AS found_target_types,
  (SELECT found_target_functions.items FROM found_target_functions)
    AS found_target_functions,
  (SELECT found_target_triggers.items FROM found_target_triggers)
    AS found_target_triggers;

ROLLBACK;
