-- SQL143 preflight: exact, read-only proof that rollout/catalog support can
-- be applied to the reviewed SQL142 foundation. Returns one bounded row.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

WITH
required_roles AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('postgres'), ('anon'), ('authenticated'), ('service_role')
    ) AS expected(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = expected.role_name
    )
  ) AS ok
),
required_relations AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('auth.users'),
      ('public.feature_access'),
      ('public.ideas'),
      ('public.votes'),
      ('public.followers'),
      ('public.submissions'),
      ('public.analytics_events'),
      ('public.household_chore_circles'),
      ('public.household_chore_deletion_markers')
    ) AS expected(object_identity)
    WHERE pg_catalog.to_regclass(expected.object_identity) IS NULL
  ) AS ok
),
required_columns AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('auth.users', 'id', 'uuid', true),
      ('auth.users', 'email', 'textlike', false),
      ('auth.users', 'email_confirmed_at',
        'timestamp with time zone', false),
      ('public.feature_access', 'feature_key', 'text', true),
      ('public.feature_access', 'email', 'text', true),
      ('public.feature_access', 'granted_at',
        'timestamp with time zone', true),
      ('public.votes', 'id', 'uuid', true),
      ('public.votes', 'idea_id', 'uuid', true),
      ('public.followers', 'id', 'uuid', true),
      ('public.followers', 'idea_id', 'uuid', true),
      ('public.submissions', 'id', 'uuid', true),
      ('public.submissions', 'idea_id', 'uuid', false),
      ('public.analytics_events', 'id', 'uuid', true),
      ('public.analytics_events', 'idea_id', 'uuid', false)
    ) AS expected(
      object_identity, column_name, expected_type, expected_not_null
    )
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid =
        pg_catalog.to_regclass(expected.object_identity)
        AND attribute_row.attname = expected.column_name
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
        AND (
          (expected.expected_type = 'textlike'
            AND attribute_row.atttypid IN (
              'text'::pg_catalog.regtype,
              'character varying'::pg_catalog.regtype
            ))
          OR (expected.expected_type <> 'textlike'
            AND pg_catalog.format_type(
              attribute_row.atttypid, attribute_row.atttypmod
            ) = expected.expected_type)
        )
        AND attribute_row.attnotnull IS NOT DISTINCT FROM
          expected.expected_not_null
    )
  ) AS ok
),
feature_columns AS (
  SELECT
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_attribute AS attribute_row
     WHERE attribute_row.attrelid =
       pg_catalog.to_regclass('public.feature_access')
       AND attribute_row.attnum > 0
       AND NOT attribute_row.attisdropped) = 3
    AND NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('feature_key', 1, 'text', true),
        ('email', 2, 'text', true),
        ('granted_at', 3, 'timestamp with time zone', true)
      ) AS expected(column_name, ordinal_position, data_type, not_null)
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid =
          pg_catalog.to_regclass('public.feature_access')
          AND attribute_row.attname = expected.column_name
          AND attribute_row.attnum = expected.ordinal_position
          AND pg_catalog.format_type(
            attribute_row.atttypid, attribute_row.atttypmod
          ) = expected.data_type
          AND attribute_row.attnotnull = expected.not_null
          AND attribute_row.attidentity = ''
          AND attribute_row.attgenerated = ''
          AND NOT attribute_row.attisdropped
      )
    ) AS ok
),
feature_defaults AS (
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid =
        pg_catalog.to_regclass('public.feature_access')
        AND attribute_row.attname IN ('feature_key', 'email')
        AND attribute_row.atthasdef
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
        pg_catalog.to_regclass('public.feature_access')
        AND attribute_row.attname = 'granted_at'
        AND attribute_row.atthasdef
        AND pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid, false
        ) = 'now()'
    ) AS ok
),
feature_security AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation_row.relowner
    WHERE namespace_row.nspname = 'public'
      AND relation_row.relname = 'feature_access'
      AND relation_row.relkind = 'r'
      AND relation_row.relpersistence = 'p'
      AND relation_row.relreplident = 'd'
      AND owner_role.rolname = 'postgres'
      AND relation_row.relrowsecurity
      AND NOT relation_row.relforcerowsecurity
      AND relation_row.reloptions IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid = relation_row.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = relation_row.oid
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      )
      AND (SELECT pg_catalog.count(*)
           FROM pg_catalog.aclexplode(COALESCE(
             relation_row.relacl,
             pg_catalog.acldefault('r', relation_row.relowner)
           )) AS acl_row) = 16
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation_row.relacl,
          pg_catalog.acldefault('r', relation_row.relowner)
        )) AS acl_row
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = acl_row.grantee
        WHERE acl_row.grantor <> relation_row.relowner
           OR acl_row.grantee = 0
           OR acl_row.is_grantable
           OR NOT (
             (acl_row.grantee = relation_row.relowner
               AND acl_row.privilege_type IN (
                 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                 'REFERENCES', 'TRIGGER', 'MAINTAIN'
               ))
             OR (grantee_role.rolname IS NOT DISTINCT FROM 'service_role'
               AND acl_row.privilege_type IN (
                 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                 'REFERENCES', 'TRIGGER', 'MAINTAIN'
               ))
           )
      )
  ) AS ok
),
feature_constraints AS (
  SELECT
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_constraint AS constraint_row
     WHERE constraint_row.conrelid =
       pg_catalog.to_regclass('public.feature_access')) = 3
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
        pg_catalog.to_regclass('public.feature_access')
        AND constraint_row.conname = 'feature_access_pkey'
        AND constraint_row.contype = 'p'
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND constraint_row.conkey = ARRAY[1, 2]::smallint[]
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
        pg_catalog.to_regclass('public.feature_access')
        AND constraint_row.conname = 'feature_access_email_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND constraint_row.conkey = ARRAY[2]::smallint[]
        AND pg_catalog.lower(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        )) LIKE '%email%lower%email%email%<>%'
        AND (SELECT pg_catalog.array_agg(
          match_row.value[1] ORDER BY match_row.value[1] COLLATE "C"
        ) FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        ), '''([^'']*)''', 'g') AS match_row(value)) = ARRAY['']::text[]
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
        pg_catalog.to_regclass('public.feature_access')
        AND constraint_row.conname = 'feature_access_feature_key_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND constraint_row.conkey = ARRAY[1]::smallint[]
        AND pg_catalog.md5(pg_catalog.lower(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        ))) = '97736909cf1a3a5432eeb34275cf3cfc'
        AND (SELECT pg_catalog.array_agg(
          match_row.value[1] ORDER BY match_row.value[1] COLLATE "C"
        ) FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        ), '''([^'']+)''', 'g') AS match_row(value)) = ARRAY[
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
feature_indexes AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index AS index_row
     WHERE index_row.indrelid =
       pg_catalog.to_regclass('public.feature_access')) = 2
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS index_row
      JOIN pg_catalog.pg_class AS index_relation
        ON index_relation.oid = index_row.indexrelid
      JOIN pg_catalog.pg_namespace AS index_namespace
        ON index_namespace.oid = index_relation.relnamespace
      WHERE index_row.indrelid =
          pg_catalog.to_regclass('public.feature_access')
        AND index_namespace.nspname = 'public'
        AND index_relation.relname = 'feature_access_pkey'
        AND index_row.indisunique AND index_row.indisprimary
        AND index_row.indimmediate AND index_row.indisvalid
        AND index_row.indisready AND index_row.indnkeyatts = 2
        AND index_row.indnatts = 2
        AND index_row.indexprs IS NULL AND index_row.indpred IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS index_row
      JOIN pg_catalog.pg_class AS index_relation
        ON index_relation.oid = index_row.indexrelid
      JOIN pg_catalog.pg_namespace AS index_namespace
        ON index_namespace.oid = index_relation.relnamespace
      WHERE index_row.indrelid =
          pg_catalog.to_regclass('public.feature_access')
        AND index_namespace.nspname = 'public'
        AND index_relation.relname = 'feature_access_email_idx'
        AND NOT index_row.indisunique AND NOT index_row.indisprimary
        AND index_row.indisvalid AND index_row.indisready
        AND index_row.indnkeyatts = 1 AND index_row.indnatts = 1
        AND index_row.indkey[0] = 2
        AND index_row.indexprs IS NULL AND index_row.indpred IS NULL
    ) AS ok
),
critical_functions AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.normalize_email_canonical(text)', 'text', 'sql', 'i', true,
        false, '3083103976aa8cb3780937b9da1be236', 2),
      ('public.household_chore_private_lock_user(uuid)', 'void', 'sql', 'v',
        false, true, 'd076df528726fff6ea25ff012caa64b2', 1)
    ) AS expected(
      function_identity, result_type, language_name, volatility,
      is_strict, is_security_definer, body_md5, execute_count
    )
    LEFT JOIN LATERAL (
      SELECT procedure_row.*, language_row.lanname
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = procedure_row.prolang
      WHERE procedure_row.oid =
        pg_catalog.to_regprocedure(expected.function_identity)
    ) AS actual ON true
    WHERE actual.oid IS NULL
       OR actual.prokind <> 'f'
       OR pg_catalog.format_type(actual.prorettype, NULL) <>
         expected.result_type
       OR actual.proretset
       OR actual.prosecdef <> expected.is_security_definer
       OR actual.provolatile <> expected.volatility
       OR actual.proisstrict <> expected.is_strict
       OR actual.proparallel <> CASE
         WHEN expected.function_identity =
           'public.normalize_email_canonical(text)' THEN 's'::"char"
         ELSE 'u'::"char" END
       OR actual.proleakproof
       OR actual.pronargdefaults <> 0
       OR actual.lanname <> expected.language_name
       OR pg_catalog.pg_get_userbyid(actual.proowner) <> 'postgres'
       OR pg_catalog.md5(pg_catalog.replace(
         actual.prosrc, E'\r\n', E'\n'
       )) <> expected.body_md5
       OR pg_catalog.cardinality(COALESCE(
         actual.proconfig, ARRAY[]::text[]
       )) <> 1
       OR actual.proconfig[1] NOT IN ('search_path=', 'search_path=""')
       OR (SELECT pg_catalog.count(*)
           FROM pg_catalog.aclexplode(COALESCE(
             actual.proacl,
             pg_catalog.acldefault('f', actual.proowner)
           )) AS acl_row
           WHERE acl_row.privilege_type = 'EXECUTE') <>
         expected.execute_count
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           actual.proacl,
           pg_catalog.acldefault('f', actual.proowner)
         )) AS acl_row
         LEFT JOIN pg_catalog.pg_roles AS grantee_role
           ON grantee_role.oid = acl_row.grantee
         WHERE acl_row.privilege_type <> 'EXECUTE'
            OR acl_row.grantee = 0
            OR acl_row.is_grantable
            OR acl_row.grantor <> actual.proowner
            OR (
              acl_row.grantee <> actual.proowner
              AND (
                expected.function_identity <>
                  'public.normalize_email_canonical(text)'
                OR grantee_role.rolname IS DISTINCT FROM 'service_role'
              )
            )
       )
  ) AS ok
),
idea_columns AS (
  SELECT
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_attribute AS attribute_row
     WHERE attribute_row.attrelid = pg_catalog.to_regclass('public.ideas')
       AND attribute_row.attnum > 0
       AND NOT attribute_row.attisdropped) = 15
    AND NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('id', 1, 'uuid', true),
        ('title', 2, 'text', true),
        ('slug', 3, 'text', true),
        ('short_description', 4, 'text', true),
        ('problem_description', 5, 'text', false),
        ('possible_solution', 6, 'text', false),
        ('category', 7, 'idea_category', true),
        ('status', 8, 'idea_status', true),
        ('source', 9, 'idea_source', true),
        ('votes_count', 10, 'integer', true),
        ('followers_count', 11, 'integer', true),
        ('is_public', 12, 'boolean', true),
        ('is_featured', 13, 'boolean', true),
        ('created_at', 14, 'timestamp with time zone', true),
        ('updated_at', 15, 'timestamp with time zone', true)
      ) AS expected(column_name, ordinal_position, data_type, not_null)
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = pg_catalog.to_regclass('public.ideas')
          AND attribute_row.attname = expected.column_name
          AND attribute_row.attnum = expected.ordinal_position
          AND pg_catalog.format_type(
            attribute_row.atttypid, attribute_row.atttypmod
          ) = expected.data_type
          AND attribute_row.attnotnull = expected.not_null
          AND attribute_row.attidentity = ''
          AND attribute_row.attgenerated = ''
          AND NOT attribute_row.attisdropped
      )
    ) AS ok
),
idea_defaults AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('id', 'gen_random_uuid()'),
      ('title', NULL),
      ('slug', NULL),
      ('short_description', NULL),
      ('problem_description', NULL),
      ('possible_solution', NULL),
      ('category', '''Annað''::idea_category'),
      ('status', '''idea''::idea_status'),
      ('source', '''seed''::idea_source'),
      ('votes_count', '0'),
      ('followers_count', '0'),
      ('is_public', 'true'),
      ('is_featured', 'false'),
      ('created_at', 'now()'),
      ('updated_at', 'now()')
    ) AS expected(column_name, default_expression)
    LEFT JOIN LATERAL (
      SELECT attribute_row.atthasdef,
        pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid, false
        ) AS actual_expression
      FROM pg_catalog.pg_attribute AS attribute_row
      LEFT JOIN pg_catalog.pg_attrdef AS default_row
        ON default_row.adrelid = attribute_row.attrelid
       AND default_row.adnum = attribute_row.attnum
      WHERE attribute_row.attrelid = pg_catalog.to_regclass('public.ideas')
        AND attribute_row.attname = expected.column_name
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
    ) AS actual ON true
    WHERE actual.atthasdef IS NULL
       OR (expected.default_expression IS NULL AND actual.atthasdef)
       OR (expected.default_expression IS NOT NULL
         AND (NOT actual.atthasdef OR actual.actual_expression IS DISTINCT FROM
           expected.default_expression))
  ) AS ok
),
idea_constraints AS (
  SELECT
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_constraint AS constraint_row
     WHERE constraint_row.conrelid =
       pg_catalog.to_regclass('public.ideas')) = 7
    AND NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('ideas_pkey', 'p', 'PRIMARY KEY (id)'),
        ('ideas_slug_key', 'u', 'UNIQUE (slug)'),
        ('ideas_title_check', 'c',
          'CHECK ((char_length(title) <= 200))'),
        ('ideas_slug_check', 'c',
          'CHECK ((char_length(slug) <= 200))'),
        ('ideas_short_description_check', 'c',
          'CHECK ((char_length(short_description) <= 500))'),
        ('ideas_problem_description_check', 'c',
          'CHECK ((char_length(problem_description) <= 2000))'),
        ('ideas_possible_solution_check', 'c',
          'CHECK ((char_length(possible_solution) <= 2000))')
      ) AS expected(constraint_name, constraint_type, definition)
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
        WHERE constraint_row.conrelid =
          pg_catalog.to_regclass('public.ideas')
          AND constraint_row.conname = expected.constraint_name
          AND constraint_row.contype::text = expected.constraint_type
          AND constraint_row.convalidated
          AND NOT constraint_row.condeferrable
          AND NOT constraint_row.condeferred
          AND pg_catalog.pg_get_constraintdef(
            constraint_row.oid, false
          ) = expected.definition
      )
    ) AS ok
),
idea_touch_function AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid =
        pg_catalog.to_regprocedure('public.teskeid_set_updated_at()')
      AND procedure_row.prokind = 'f'
      AND procedure_row.prorettype =
        pg_catalog.to_regtype('trigger')
      AND NOT procedure_row.proretset
      AND NOT procedure_row.prosecdef
      AND procedure_row.provolatile = 'v'
      AND NOT procedure_row.proisstrict
      AND procedure_row.proparallel = 'u'
      AND NOT procedure_row.proleakproof
      AND procedure_row.pronargdefaults = 0
      AND language_row.lanname = 'plpgsql'
      AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_identity_arguments(
        procedure_row.oid
      ) = ''
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) = '301a884953d37769916294bb60562e05'
      AND pg_catalog.cardinality(COALESCE(
        procedure_row.proconfig, ARRAY[]::text[]
      )) = 0
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS acl_row
        WHERE acl_row.privilege_type = 'EXECUTE'
          AND acl_row.grantee = procedure_row.proowner
          AND acl_row.grantor = procedure_row.proowner
          AND NOT acl_row.is_grantable
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS acl_row
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = acl_row.grantee
        WHERE acl_row.privilege_type <> 'EXECUTE'
           OR acl_row.grantor <> procedure_row.proowner
           OR acl_row.is_grantable
           OR (acl_row.grantee <> 0
             AND acl_row.grantee <> procedure_row.proowner
             AND grantee_role.rolname IS DISTINCT FROM 'anon'
             AND grantee_role.rolname IS DISTINCT FROM 'authenticated'
             AND grantee_role.rolname IS DISTINCT FROM 'service_role')
      )
  ) AS ok
),
idea_trigger AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger_row
     WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.ideas')
       AND NOT trigger_row.tgisinternal) = 1
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_proc AS function_row
        ON function_row.oid = trigger_row.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace
        ON function_namespace.oid = function_row.pronamespace
      WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.ideas')
        AND trigger_row.tgname = 'ideas_updated_at'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgtype::integer = 19
        AND trigger_row.tgenabled = 'O'
        AND trigger_row.tgconstraint = 0
        AND NOT trigger_row.tgdeferrable
        AND NOT trigger_row.tginitdeferred
        AND trigger_row.tgqual IS NULL
        AND trigger_row.tgnargs = 0
        AND trigger_row.tgoldtable IS NULL
        AND trigger_row.tgnewtable IS NULL
        AND pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 0
        AND function_namespace.nspname = 'public'
        AND function_row.proname = 'teskeid_set_updated_at'
    ) AS ok
),
idea_references AS (
  SELECT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.votes', 'votes_idea_id_fkey', 'idea_id', 'c'),
      ('public.followers', 'followers_idea_id_fkey', 'idea_id', 'c'),
      ('public.submissions', 'submissions_idea_id_fkey', 'idea_id', 'n'),
      ('public.analytics_events', 'analytics_events_idea_id_fkey',
        'idea_id', 'n')
    ) AS expected(
      child_relation, constraint_name, child_column, delete_action
    )
    WHERE (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
          pg_catalog.to_regclass(expected.child_relation)
        AND constraint_row.confrelid = pg_catalog.to_regclass('public.ideas')
        AND constraint_row.conkey = ARRAY[(
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = constraint_row.conrelid
            AND attribute_row.attname = expected.child_column
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
        )]::smallint[]
    ) <> 1 OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
          pg_catalog.to_regclass(expected.child_relation)
        AND constraint_row.confrelid = pg_catalog.to_regclass('public.ideas')
        AND constraint_row.conname = expected.constraint_name
        AND constraint_row.contype = 'f'
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND constraint_row.confdeltype::text = expected.delete_action
        AND constraint_row.confupdtype = 'a'
        AND constraint_row.confmatchtype = 's'
        AND constraint_row.conkey = ARRAY[(
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = constraint_row.conrelid
            AND attribute_row.attname = expected.child_column
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
        )]::smallint[]
        AND constraint_row.confkey = ARRAY[(
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = constraint_row.confrelid
            AND attribute_row.attname = 'id'
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
        )]::smallint[]
    )
  ) AS ok
),
legacy_idea AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.ideas AS idea_row
     WHERE idea_row.slug = 'fyrsta-vakt-krakkanna') = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.ideas AS idea_row
      WHERE idea_row.slug IN ('heimilisverkin', 'verkefnin')
    )
    AND EXISTS (
      SELECT 1 FROM public.ideas AS idea_row
      WHERE idea_row.slug = 'fyrsta-vakt-krakkanna'
        AND (
          (idea_row.title = 'Fyrsta vakt krakkanna'
            AND idea_row.short_description =
              'Krakkar safna stigum fyrir heimilisverk og fá sitt fyrsta bragð af ábyrgð, umbun og eigin vakt.'
            AND idea_row.problem_description =
              'Börn vilja oft hjálpa, en heimilisverk verða fljótt að nöldri, mútum eða einhverju sem gleymist. Foreldrar þurfa að minna á allt og krakkar sjá ekki alltaf tenginguna milli ábyrgðar, þátttöku og umbunar.'
            AND idea_row.possible_solution =
              'Einfalt kerfi þar sem krakkar fá verkefni við hæfi, safna stigum og sjá hvernig þeirra framlag skiptir máli. Fyrsta litla vaktin þeirra, með ábyrgð, hvatningu og umbun sem fjölskyldan getur stillt saman.'
            AND idea_row.category::text = 'Börn')
          OR
          (idea_row.title = 'Verkefnin'
            AND idea_row.short_description =
              'Sameiginlegt yfirlit yfir verkefni, úthlutanir, verklok og stig.'
            AND idea_row.problem_description =
              'Verkefni og ábyrgð dreifast auðveldlega á milli samtala, miða og minnis. Þá verður óljóst hvað þarf að gera, hver tekur verkefnið að sér og hvað er þegar búið.'
            AND idea_row.possible_solution =
              'Með Verkefnunum geturðu stofnað hringi fyrir mismunandi samhengi, skilgreint endurnýtanleg verkefni og stig og haldið utan um úthlutanir, verklok og sögu á einum stað.'
            AND idea_row.category::text = 'Annað')
        )
    ) AS ok
),
target_category AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_enum AS enum_row
    WHERE enum_row.enumtypid = pg_catalog.to_regtype('public.idea_category')
      AND enum_row.enumlabel = 'Annað'
  ) AS ok
),
targets AS (
  SELECT
    pg_catalog.to_regprocedure(
      'public.feature_access_heimilisverkin_insert_guard()'
    ) IS NULL
    AND pg_catalog.to_regprocedure(
      'public.feature_access_heimilisverkin_update_guard()'
    ) IS NULL
    AND pg_catalog.to_regprocedure(
      'public.feature_access_heimilisverkin_auth_email_guard()'
    ) IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      JOIN pg_catalog.pg_namespace AS namespace_row
        ON namespace_row.oid = procedure_row.pronamespace
      WHERE namespace_row.nspname = 'public'
        AND procedure_row.proname IN (
          'feature_access_heimilisverkin_insert_guard',
          'feature_access_heimilisverkin_update_guard',
          'feature_access_heimilisverkin_auth_email_guard'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
      WHERE (
        trigger_row.tgrelid =
          pg_catalog.to_regclass('public.feature_access')
        OR (
          trigger_row.tgrelid = pg_catalog.to_regclass('auth.users')
          AND pg_catalog.left(
            trigger_row.tgname::text,
            pg_catalog.char_length(
              'feature_access_heimilisverkin_auth_email_'
            )
          ) = 'feature_access_heimilisverkin_auth_email_'
        )
      )
        AND NOT trigger_row.tgisinternal
    ) AS ok
),
entitlements AS (
  SELECT NOT EXISTS (
    SELECT 1 FROM public.feature_access AS access_row
    WHERE access_row.feature_key = 'heimilisverkin'
  ) AS ok
),
hc_relation_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text, relation_row.relkind::text,
      relation_row.relpersistence::text, relation_row.relreplident::text,
      tablespace_row.spcname,
      COALESCE((SELECT pg_catalog.jsonb_agg(
        option_row.option_value ORDER BY option_row.option_value COLLATE "C"
      ) FROM pg_catalog.unnest(COALESCE(
        relation_row.reloptions, ARRAY[]::text[]
      )) AS option_row(option_value)), '[]'::jsonb)
    ) ORDER BY relation_row.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = relation_row.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
),
hc_column_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text, attribute_row.attnum,
      attribute_row.attname::text,
      pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod),
      attribute_row.attnotnull, attribute_row.attidentity::text,
      attribute_row.attgenerated::text, attribute_row.atthasdef,
      collation_namespace.nspname, collation_row.collname,
      pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid, false)
    ) ORDER BY relation_row.relname::text COLLATE "C", attribute_row.attnum
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_attribute AS attribute_row
    ON attribute_row.attrelid = relation_row.oid
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = attribute_row.attrelid
   AND default_row.adnum = attribute_row.attnum
  LEFT JOIN pg_catalog.pg_collation AS collation_row
    ON collation_row.oid = attribute_row.attcollation
  LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
    ON collation_namespace.oid = collation_row.collnamespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
    AND attribute_row.attnum > 0 AND NOT attribute_row.attisdropped
),
hc_constraint_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text, constraint_row.conname::text,
      constraint_row.contype::text, constraint_row.condeferrable,
      constraint_row.condeferred, constraint_row.convalidated,
      constraint_row.connoinherit, constraint_row.conislocal,
      constraint_row.coninhcount,
      pg_catalog.pg_get_constraintdef(constraint_row.oid, false)
    ) ORDER BY relation_row.relname::text COLLATE "C",
      constraint_row.conname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
),
hc_index_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text, index_namespace.nspname::text,
      index_relation.relname::text, access_method.amname::text,
      index_row.indisunique, index_row.indisprimary,
      index_row.indisexclusion, index_row.indimmediate,
      index_row.indisclustered, index_row.indisvalid,
      index_row.indisready, index_row.indislive,
      index_row.indisreplident, index_row.indnkeyatts, index_row.indnatts,
      tablespace_row.spcname,
      COALESCE((SELECT pg_catalog.jsonb_agg(
        option_row.option_value ORDER BY option_row.option_value COLLATE "C"
      ) FROM pg_catalog.unnest(COALESCE(
        index_relation.reloptions, ARRAY[]::text[]
      )) AS option_row(option_value)), '[]'::jsonb),
      pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
    ) ORDER BY relation_row.relname::text COLLATE "C",
      index_namespace.nspname::text COLLATE "C",
      index_relation.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation_row ON relation_row.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = index_relation.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r'
),
hc_shared_index_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_namespace.nspname::text, relation_row.relname::text,
      index_namespace.nspname::text, index_relation.relname::text,
      access_method.amname::text, index_row.indisunique,
      index_row.indisprimary, index_row.indisexclusion,
      index_row.indimmediate, index_row.indisclustered,
      index_row.indisvalid, index_row.indisready, index_row.indislive,
      index_row.indisreplident, index_row.indnkeyatts, index_row.indnatts,
      tablespace_row.spcname,
      COALESCE((SELECT pg_catalog.jsonb_agg(
        option_row.option_value ORDER BY option_row.option_value COLLATE "C"
      ) FROM pg_catalog.unnest(COALESCE(
        index_relation.reloptions, ARRAY[]::text[]
      )) AS option_row(option_value)), '[]'::jsonb),
      pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
    ) ORDER BY index_namespace.nspname::text COLLATE "C",
      index_relation.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation_row ON relation_row.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = index_relation.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND relation_row.relname = 'recent_events'
    AND index_namespace.nspname = 'public'
    AND index_relation.relname = 'recent_events_household_chore_entity_idx'
),
hc_sequence_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      sequence_namespace.nspname::text, sequence_relation.relname::text,
      pg_catalog.format_type(sequence_row.seqtypid, NULL),
      sequence_row.seqstart, sequence_row.seqincrement, sequence_row.seqmax,
      sequence_row.seqmin, sequence_row.seqcache, sequence_row.seqcycle
    ) ORDER BY sequence_namespace.nspname::text COLLATE "C",
      sequence_relation.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_sequence AS sequence_row
  JOIN pg_catalog.pg_class AS sequence_relation
    ON sequence_relation.oid = sequence_row.seqrelid
  JOIN pg_catalog.pg_namespace AS sequence_namespace
    ON sequence_namespace.oid = sequence_relation.relnamespace
  WHERE sequence_namespace.nspname = 'public'
    AND sequence_relation.relname = 'household_chore_rate_events_id_seq'
),
hc_function_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      function_row.proname::text,
      pg_catalog.pg_get_function_identity_arguments(function_row.oid),
      pg_catalog.pg_get_function_arguments(function_row.oid),
      pg_catalog.pg_get_function_result(function_row.oid),
      pg_catalog.pg_get_functiondef(function_row.oid)
    ) ORDER BY function_row.proname::text COLLATE "C",
      pg_catalog.pg_get_function_identity_arguments(function_row.oid)
        COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_row.pronamespace
  WHERE function_namespace.nspname = 'public'
    AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
),
hc_trigger_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_namespace.nspname::text, relation_row.relname::text,
      trigger_row.tgname::text,
      pg_catalog.pg_get_triggerdef(trigger_row.oid, false)
    ) ORDER BY relation_namespace.nspname::text COLLATE "C",
      relation_row.relname::text COLLATE "C",
      trigger_row.tgname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation_row ON relation_row.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  WHERE NOT trigger_row.tgisinternal
    AND ((relation_namespace.nspname = 'public'
      AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_')
      OR (relation_namespace.nspname = 'auth'
        AND relation_row.relname = 'users'
        AND trigger_row.tgname = 'household_chore_auth_delete_guard'))
),
sql142_catalog AS (
  SELECT
    pg_catalog.obj_description(
      pg_catalog.to_regclass('public.household_chore_circles'), 'pg_class'
    ) AS stored_comment,
    pg_catalog.current_setting('server_version_num') AS server_version_num,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'contract_version', 1,
        'relations', hc_relation_contract.value,
        'columns', hc_column_contract.value,
        'constraints', hc_constraint_contract.value,
        'indexes', hc_index_contract.value,
        'shared_indexes', hc_shared_index_contract.value,
        'sequences', hc_sequence_contract.value,
        'functions', hc_function_contract.value,
        'triggers', hc_trigger_contract.value
      )::text, 'UTF8'
    )), 'hex') AS current_digest
  FROM hc_relation_contract CROSS JOIN hc_column_contract
  CROSS JOIN hc_constraint_contract CROSS JOIN hc_index_contract
  CROSS JOIN hc_shared_index_contract CROSS JOIN hc_sequence_contract
  CROSS JOIN hc_function_contract CROSS JOIN hc_trigger_contract
),
sql142_seal AS (
  SELECT EXISTS (
    SELECT 1 FROM sql142_catalog AS seal_row
    WHERE COALESCE(seal_row.stored_comment ~
      '^teskeid:sql142:catalog-v1:[0-9]{5,8}:[0-9a-f]{64}$', false)
      AND pg_catalog.split_part(seal_row.stored_comment, ':', 4) =
        seal_row.server_version_num
      AND pg_catalog.split_part(seal_row.stored_comment, ':', 5) =
        seal_row.current_digest
  ) AS ok
),
checks AS (
  SELECT
    pg_catalog.current_setting('server_version_num') = '170006'
      AS server_version_ok,
    (current_user = 'postgres' OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = current_user AND role_row.rolsuper
    )) AS executor_ok,
    required_roles.ok AS roles_ok,
    required_relations.ok AS relations_ok,
    required_columns.ok AS baseline_columns_ok,
    feature_columns.ok AS feature_columns_exact_ok,
    feature_defaults.ok AS feature_defaults_exact_ok,
    feature_security.ok AS feature_security_exact_ok,
    feature_constraints.ok AS old_feature_constraint_exact_ok,
    feature_indexes.ok AS feature_indexes_exact_ok,
    critical_functions.ok AS critical_functions_exact_ok,
    idea_columns.ok AND idea_defaults.ok AND idea_constraints.ok
      AS idea_schema_exact_ok,
    idea_touch_function.ok AND idea_trigger.ok AS idea_trigger_exact_ok,
    idea_references.ok AS idea_references_exact_ok,
    legacy_idea.ok AS legacy_idea_exact_ok,
    target_category.ok AS target_category_ok,
    targets.ok AS targets_clear,
    entitlements.ok AS no_household_entitlements_ok,
    sql142_seal.ok AS sql142_catalog_unchanged_ok
  FROM required_roles CROSS JOIN required_relations CROSS JOIN required_columns
  CROSS JOIN feature_columns CROSS JOIN feature_defaults
  CROSS JOIN feature_security CROSS JOIN feature_constraints
  CROSS JOIN feature_indexes CROSS JOIN critical_functions
  CROSS JOIN idea_columns CROSS JOIN idea_defaults CROSS JOIN idea_constraints
  CROSS JOIN idea_touch_function CROSS JOIN idea_trigger
  CROSS JOIN idea_references CROSS JOIN legacy_idea CROSS JOIN target_category
  CROSS JOIN targets CROSS JOIN entitlements CROSS JOIN sql142_seal
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  checks.*,
  checks.server_version_ok
    AND checks.executor_ok
    AND checks.roles_ok
    AND checks.relations_ok
    AND checks.baseline_columns_ok
    AND checks.feature_columns_exact_ok
    AND checks.feature_defaults_exact_ok
    AND checks.feature_security_exact_ok
    AND checks.old_feature_constraint_exact_ok
    AND checks.feature_indexes_exact_ok
    AND checks.critical_functions_exact_ok
    AND checks.idea_schema_exact_ok
    AND checks.idea_trigger_exact_ok
    AND checks.idea_references_exact_ok
    AND checks.legacy_idea_exact_ok
    AND checks.target_category_ok
    AND checks.targets_clear
    AND checks.no_household_entitlements_ok
    AND checks.sql142_catalog_unchanged_ok AS prerequisites_ok
FROM checks;

ROLLBACK;
