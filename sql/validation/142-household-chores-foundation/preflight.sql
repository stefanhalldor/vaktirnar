-- SQL142 preflight: catalog-only proof that the Household Chores foundation
-- can be applied to the expected SQL141 baseline.
-- Read-only. This file never creates, changes, or deletes database objects.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

WITH
required_relations(object_name, object_identity) AS (
  VALUES
    ('auth.users', 'auth.users'),
    ('public.profiles', 'public.profiles'),
    ('public.relationships', 'public.relationships'),
    ('public.feature_access', 'public.feature_access'),
    ('public.recent_events', 'public.recent_events')
),
relation_contract AS (
  SELECT pg_catalog.count(*) FILTER (
    WHERE pg_catalog.to_regclass(required_relations.object_identity) IS NOT NULL
  ) = 5 AS ok
  FROM required_relations
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
column_contract AS (
  SELECT NOT EXISTS (
    SELECT 1
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
  ) AS ok
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
    )
    AND EXISTS (
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
    ) AS ok
),
required_parent_keys(schema_name, relation_name, column_name) AS (
  VALUES
    ('auth', 'users', 'id'),
    ('public', 'relationships', 'id')
),
parent_key_contract AS (
  SELECT NOT EXISTS (
    SELECT 1
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
  ) AS ok
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
function_contract AS (
  SELECT
    dependency_contract.email_normalizer_ok
    AND dependency_contract.digest_ok
    AND dependency_contract.account_deletion_ok AS ok
  FROM dependency_contract
),
role_contract AS (
  SELECT pg_catalog.count(*) FILTER (
    WHERE role_row.rolname IN ('postgres', 'anon', 'authenticated', 'service_role')
  ) = 4 AS ok
  FROM pg_catalog.pg_roles AS role_row
),
feature_contract AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
      pg_catalog.to_regclass('public.feature_access')
      AND constraint_row.conname = 'feature_access_feature_key_check'
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
      AND constraint_row.conkey = ARRAY[(
        SELECT attribute_row.attnum
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = constraint_row.conrelid
          AND attribute_row.attname = 'feature_key'
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
      )]::smallint[]
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid, false
      ))) = '97736909cf1a3a5432eeb34275cf3cfc'
      AND (
        SELECT pg_catalog.array_agg(
          match_row.value[1] ORDER BY match_row.value[1] COLLATE "C"
        )
        FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        ), '''([^'']+)''', 'g') AS match_row(value)
      ) = ARRAY[
        'afmaeli-og-vidburdir', 'agent-collaboration-private-beta',
        'auglysandi', 'bokanir', 'bokhaldid', 'elta-vedrid',
        'facebook-oauth', 'ferdalagid', 'kviss', 'road-intelligence-v1',
        'tengsl', 'teskeid-routing-v1', 'umonnun',
        'utlagt-og-endurgreitt', 'vedrid',
        'weather-provider-vedurstofan', 'weather-provider-vegagerdin',
        'weather-pulse'
      ]::text[]
  ) AS ok
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
target_relations AS (
  SELECT pg_catalog.count(*)::integer AS found
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation_row.relnamespace
  WHERE namespace_row.nspname = 'public'
    AND (
      pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
      OR relation_row.relname = 'recent_events_household_chore_entity_idx'
    )
),
target_types AS (
  SELECT pg_catalog.count(*)::integer AS found
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
target_functions AS (
  SELECT pg_catalog.count(*)::integer AS found
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
),
target_triggers AS (
  SELECT pg_catalog.count(*)::integer AS found
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation_row.relnamespace
  WHERE NOT trigger_row.tgisinternal
    AND namespace_row.nspname = 'auth'
    AND relation_row.relname = 'users'
    AND trigger_row.tgname = 'household_chore_auth_delete_guard'
),
checks AS (
  SELECT
    (
      current_user = 'postgres'
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS role_row
        WHERE role_row.rolname = current_user
          AND role_row.rolsuper
      )
    ) AS executor_ok,
    pg_catalog.current_setting('server_version_num') = '170006'
      AS server_version_ok,
    COALESCE((SELECT role_contract.ok FROM role_contract), false) AS roles_ok,
    COALESCE((SELECT relation_contract.ok FROM relation_contract), false)
      AS relations_ok,
    COALESCE((SELECT column_contract.ok FROM column_contract), false)
      AS baseline_columns_ok,
    COALESCE((SELECT recent_default_contract.ok FROM recent_default_contract), false)
      AS recent_defaults_ok,
    COALESCE((SELECT parent_key_contract.ok FROM parent_key_contract), false)
      AS baseline_parent_keys_ok,
    COALESCE((SELECT function_contract.ok FROM function_contract), false)
      AS functions_ok,
    COALESCE((SELECT feature_contract.ok FROM feature_contract), false)
      AS rollout_state_unchanged_ok,
    COALESCE((
      SELECT
        recent_shape.sources IS NOT DISTINCT FROM
          ARRAY['events', 'expenses', 'loans']::text[]
        AND recent_shape.normalized_expression IN (
          'source=any(array[''loans''::text,''expenses''::text,''events''::text])',
          '(source=any(array[''loans''::text,''expenses''::text,''events''::text]))'
        )
      FROM recent_shape
    ), false) AS recent_source_baseline_ok,
    COALESCE((
      SELECT recent_conflict_contract.ok FROM recent_conflict_contract
    ), false) AS recent_conflict_key_ok,
    (SELECT target_relations.found = 0 FROM target_relations)
      AS target_relations_clear,
    (SELECT target_types.found = 0 FROM target_types)
      AS target_types_clear,
    (SELECT target_functions.found = 0 FROM target_functions)
      AS target_functions_clear,
    (SELECT target_triggers.found = 0 FROM target_triggers)
      AS target_triggers_clear
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  checks.executor_ok,
  checks.server_version_ok,
  checks.roles_ok,
  checks.relations_ok,
  checks.baseline_columns_ok,
  checks.recent_defaults_ok,
  checks.baseline_parent_keys_ok,
  checks.functions_ok,
  checks.rollout_state_unchanged_ok,
  checks.recent_source_baseline_ok,
  checks.recent_conflict_key_ok,
  checks.target_relations_clear,
  checks.target_types_clear,
  checks.target_functions_clear,
  checks.target_triggers_clear,
  (
    checks.executor_ok
    AND checks.server_version_ok
    AND checks.roles_ok
    AND checks.relations_ok
    AND checks.baseline_columns_ok
    AND checks.recent_defaults_ok
    AND checks.baseline_parent_keys_ok
    AND checks.functions_ok
    AND checks.rollout_state_unchanged_ok
    AND checks.recent_source_baseline_ok
    AND checks.recent_conflict_key_ok
    AND checks.target_relations_clear
    AND checks.target_types_clear
    AND checks.target_functions_clear
    AND checks.target_triggers_clear
  ) AS prerequisites_ok
FROM checks;

ROLLBACK;
