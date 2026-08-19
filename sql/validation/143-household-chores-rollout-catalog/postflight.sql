-- SQL143 postflight: exact, read-only attestation of rollout/catalog support.
-- Returns one bounded row and no entitlement, email, auth-ID or idea data.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

WITH
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
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute_row
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
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid =
        pg_catalog.to_regclass('public.feature_access')
        AND attribute_row.attname IN ('feature_key', 'email')
        AND attribute_row.atthasdef
        AND attribute_row.attnum > 0 AND NOT attribute_row.attisdropped
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
          AND attribute_row.attnum > 0 AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      )
      AND (SELECT pg_catalog.count(*)
           FROM pg_catalog.aclexplode(COALESCE(
             relation_row.relacl,
             pg_catalog.acldefault('r', relation_row.relowner)
           )) AS acl_row) = 11
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          relation_row.relacl,
          pg_catalog.acldefault('r', relation_row.relowner)
        )) AS acl_row
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = acl_row.grantee
        WHERE acl_row.grantor <> relation_row.relowner
           OR acl_row.grantee = 0 OR acl_row.is_grantable
           OR NOT (
             (acl_row.grantee = relation_row.relowner
               AND acl_row.privilege_type IN (
                 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                 'REFERENCES', 'TRIGGER', 'MAINTAIN'
               ))
             OR (grantee_role.rolname IS NOT DISTINCT FROM 'service_role'
               AND acl_row.privilege_type IN ('SELECT', 'INSERT', 'DELETE'))
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
        ))) = 'fefe253894973ff1ee1d7d56da941a07'
        AND (SELECT pg_catalog.array_agg(
          match_row.value[1] ORDER BY match_row.value[1] COLLATE "C"
        ) FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        ), '''([^'']+)''', 'g') AS match_row(value)) = ARRAY[
          'afmaeli-og-vidburdir', 'agent-collaboration-private-beta',
          'auglysandi', 'bokanir', 'bokhaldid', 'elta-vedrid',
          'facebook-oauth', 'ferdalagid', 'heimilisverkin', 'kviss',
          'road-intelligence-v1', 'tengsl', 'teskeid-routing-v1', 'umonnun',
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
guard_functions AS (
  SELECT
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_proc AS procedure_row
     JOIN pg_catalog.pg_namespace AS namespace_row
       ON namespace_row.oid = procedure_row.pronamespace
     WHERE namespace_row.nspname = 'public'
       AND pg_catalog.left(
         procedure_row.proname::text,
         pg_catalog.char_length('feature_access_heimilisverkin_')
       ) = 'feature_access_heimilisverkin_') = 3
    AND NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('feature_access_heimilisverkin_insert_guard',
          'efe89415e70824ed0781f1ed1db88152'),
        ('feature_access_heimilisverkin_update_guard',
          '915995cbf0d7a0104d5303ec1b6026db'),
        ('feature_access_heimilisverkin_auth_email_guard',
          'e0a1f38579e20e80b213e07b59d9d08a')
      ) AS expected(function_name, body_md5)
      LEFT JOIN LATERAL (
        SELECT procedure_row.*, language_row.lanname,
          owner_role.rolname AS owner_name
        FROM pg_catalog.pg_proc AS procedure_row
        JOIN pg_catalog.pg_namespace AS namespace_row
          ON namespace_row.oid = procedure_row.pronamespace
        JOIN pg_catalog.pg_language AS language_row
          ON language_row.oid = procedure_row.prolang
        JOIN pg_catalog.pg_roles AS owner_role
          ON owner_role.oid = procedure_row.proowner
        WHERE namespace_row.nspname = 'public'
          AND procedure_row.proname = expected.function_name
          AND pg_catalog.pg_get_function_identity_arguments(
            procedure_row.oid
          ) = ''
      ) AS actual ON true
      WHERE actual.oid IS NULL
         OR actual.owner_name <> 'postgres'
         OR actual.prokind <> 'f'
         OR actual.prorettype <> pg_catalog.to_regtype('trigger')
         OR actual.proretset OR actual.lanname <> 'plpgsql'
         OR actual.provolatile <> 'v' OR actual.proisstrict
         OR actual.proleakproof OR actual.proparallel <> 'u'
         OR NOT actual.prosecdef OR actual.pronargdefaults <> 0
         OR pg_catalog.md5(pg_catalog.replace(
           actual.prosrc, E'\r\n', E'\n'
         )) IS DISTINCT FROM expected.body_md5
         OR pg_catalog.cardinality(COALESCE(
           actual.proconfig, ARRAY[]::text[]
         )) <> 1
         OR actual.proconfig[1] NOT IN ('search_path=', 'search_path=""')
         OR (SELECT pg_catalog.count(*)
             FROM pg_catalog.aclexplode(COALESCE(
               actual.proacl,
               pg_catalog.acldefault('f', actual.proowner)
             )) AS acl_row) <> 1
         OR EXISTS (
           SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
             actual.proacl,
             pg_catalog.acldefault('f', actual.proowner)
           )) AS acl_row
           WHERE acl_row.privilege_type <> 'EXECUTE'
              OR acl_row.grantee <> actual.proowner
              OR acl_row.grantor <> actual.proowner
              OR acl_row.is_grantable
         )
    ) AS ok
),
guard_authority AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.feature_access_heimilisverkin_insert_guard()'
      )
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = 'efe89415e70824ed0781f1ed1db88152'
        AND procedure_row.prosrc ~
          'normalize_email_canonical\(NEW[.]email\)'
        AND procedure_row.prosrc ~ 'auth[.]users'
        AND procedure_row.prosrc ~
          'household_chore_private_lock_user\(v_user_id\)'
        AND procedure_row.prosrc ~
          'hashtextextended\(v_canonical_email, 9702\)'
        AND pg_catalog.lower(procedure_row.prosrc) ~ 'for[[:space:]]+share'
        AND procedure_row.prosrc ~ 'email_confirmed_at'
        AND procedure_row.prosrc ~ 'household_chore_deletion_markers'
    ) AS insert_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.feature_access_heimilisverkin_update_guard()'
      )
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = '915995cbf0d7a0104d5303ec1b6026db'
        AND procedure_row.prosrc ~ 'OLD[.]feature_key'
        AND procedure_row.prosrc ~ 'NEW[.]feature_key'
        AND procedure_row.prosrc ~
          'feature_access_heimilisverkin_update_forbidden'
        AND pg_catalog.lower(procedure_row.prosrc) !~
          'pg_advisory|private_lock_user|auth[.]users|deletion_markers|for[[:space:]]+share'
    ) AS update_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.feature_access_heimilisverkin_auth_email_guard()'
      )
        AND pg_catalog.md5(pg_catalog.replace(
          procedure_row.prosrc, E'\r\n', E'\n'
        )) = 'e0a1f38579e20e80b213e07b59d9d08a'
        AND procedure_row.prosrc ~ 'TG_OP = ''INSERT'''
        AND procedure_row.prosrc ~ 'TG_OP = ''UPDATE'''
        AND procedure_row.prosrc ~
          'normalize_email_canonical\(OLD[.]email\)'
        AND procedure_row.prosrc ~
          'normalize_email_canonical\(NEW[.]email\)'
        AND procedure_row.prosrc ~
          'pg_advisory_xact_lock'
        AND procedure_row.prosrc ~
          'pg_try_advisory_xact_lock'
        AND procedure_row.prosrc ~
          'hashtextextended\(v_canonical_email, 9702\)'
        AND procedure_row.prosrc ~ 'public[.]feature_access'
        AND procedure_row.prosrc ~
          'feature_access_heimilisverkin_auth_email_conflict'
        AND procedure_row.prosrc !~ 'household_chore_private_lock_user'
    ) AS auth_email_ok
),
guard_triggers AS (
  SELECT
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_trigger AS trigger_row
     WHERE trigger_row.tgrelid =
       pg_catalog.to_regclass('public.feature_access')
       AND NOT trigger_row.tgisinternal) = 2
    AND NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('feature_access_heimilisverkin_insert_guard',
          'feature_access_heimilisverkin_insert_guard', 7, 0),
        ('feature_access_heimilisverkin_update_guard',
          'feature_access_heimilisverkin_update_guard', 19, 2)
      ) AS expected(
        trigger_name, function_name, trigger_type, attribute_count
      )
      LEFT JOIN LATERAL (
        SELECT trigger_row.*, function_row.proname AS function_name,
          function_namespace.nspname AS function_schema
        FROM pg_catalog.pg_trigger AS trigger_row
        JOIN pg_catalog.pg_proc AS function_row
          ON function_row.oid = trigger_row.tgfoid
        JOIN pg_catalog.pg_namespace AS function_namespace
          ON function_namespace.oid = function_row.pronamespace
        WHERE trigger_row.tgrelid =
          pg_catalog.to_regclass('public.feature_access')
          AND trigger_row.tgname = expected.trigger_name
          AND NOT trigger_row.tgisinternal
      ) AS actual ON true
      WHERE actual.oid IS NULL
         OR actual.function_schema <> 'public'
         OR actual.function_name <> expected.function_name
         OR actual.tgtype::integer <> expected.trigger_type
         OR actual.tgenabled <> 'O' OR actual.tgconstraint <> 0
         OR actual.tgparentid <> 0
         OR actual.tgdeferrable OR actual.tginitdeferred
         OR actual.tgqual IS NOT NULL OR actual.tgnargs <> 0
         OR actual.tgoldtable IS NOT NULL OR actual.tgnewtable IS NOT NULL
         OR pg_catalog.cardinality(actual.tgattr::smallint[]) <>
           expected.attribute_count
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid =
        pg_catalog.to_regclass('public.feature_access')
        AND trigger_row.tgname =
          'feature_access_heimilisverkin_update_guard'
        AND (SELECT pg_catalog.array_agg(
          item.attribute_number ORDER BY item.ordinal_position
        ) FROM pg_catalog.unnest(
          trigger_row.tgattr::smallint[]
        ) WITH ORDINALITY AS item(attribute_number, ordinal_position)) =
          ARRAY[1, 2]::smallint[]
    ) AS ok
),
auth_email_triggers AS (
  SELECT
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_trigger AS trigger_row
     WHERE trigger_row.tgrelid = pg_catalog.to_regclass('auth.users')
       AND pg_catalog.left(
         trigger_row.tgname::text,
         pg_catalog.char_length(
           'feature_access_heimilisverkin_auth_email_'
         )
       ) = 'feature_access_heimilisverkin_auth_email_'
       AND NOT trigger_row.tgisinternal) = 2
    AND NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('feature_access_heimilisverkin_auth_email_insert_guard', 7, 0),
        ('feature_access_heimilisverkin_auth_email_update_guard', 19, 1)
      ) AS expected(trigger_name, trigger_type, attribute_count)
      LEFT JOIN LATERAL (
        SELECT trigger_row.*, function_row.proname AS function_name,
          function_namespace.nspname AS function_schema
        FROM pg_catalog.pg_trigger AS trigger_row
        JOIN pg_catalog.pg_proc AS function_row
          ON function_row.oid = trigger_row.tgfoid
        JOIN pg_catalog.pg_namespace AS function_namespace
          ON function_namespace.oid = function_row.pronamespace
        WHERE trigger_row.tgrelid = pg_catalog.to_regclass('auth.users')
          AND trigger_row.tgname = expected.trigger_name
          AND NOT trigger_row.tgisinternal
      ) AS actual ON true
      WHERE actual.oid IS NULL
         OR actual.function_schema <> 'public'
         OR actual.function_name <>
           'feature_access_heimilisverkin_auth_email_guard'
         OR actual.tgtype::integer <> expected.trigger_type
         OR actual.tgenabled <> 'O' OR actual.tgconstraint <> 0
         OR actual.tgparentid <> 0
         OR actual.tgdeferrable OR actual.tginitdeferred
         OR actual.tgqual IS NOT NULL OR actual.tgnargs <> 0
         OR actual.tgoldtable IS NOT NULL OR actual.tgnewtable IS NOT NULL
         OR pg_catalog.cardinality(actual.tgattr::smallint[]) <>
           expected.attribute_count
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid = pg_catalog.to_regclass('auth.users')
        AND trigger_row.tgname =
          'feature_access_heimilisverkin_auth_email_update_guard'
        AND (SELECT pg_catalog.array_agg(
          item.attribute_number ORDER BY item.ordinal_position
        ) FROM pg_catalog.unnest(
          trigger_row.tgattr::smallint[]
        ) WITH ORDINALITY AS item(attribute_number, ordinal_position)) =
          ARRAY[(SELECT attribute_row.attnum
            FROM pg_catalog.pg_attribute AS attribute_row
            WHERE attribute_row.attrelid = trigger_row.tgrelid
              AND attribute_row.attname = 'email'
              AND attribute_row.attnum > 0
              AND NOT attribute_row.attisdropped)]::smallint[]
    ) AS ok
),
idea_contract AS (
  SELECT
    (SELECT pg_catalog.count(*)
     FROM pg_catalog.pg_attribute AS attribute_row
     WHERE attribute_row.attrelid = pg_catalog.to_regclass('public.ideas')
       AND attribute_row.attnum > 0 AND NOT attribute_row.attisdropped) = 15
    AND NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('id', 1, 'uuid', true), ('title', 2, 'text', true),
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
    )
    AND (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_constraint AS constraint_row
         WHERE constraint_row.conrelid =
           pg_catalog.to_regclass('public.ideas')) = 7
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger_row
         WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.ideas')
           AND NOT trigger_row.tgisinternal) = 1
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_proc AS function_row
        ON function_row.oid = trigger_row.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace
        ON function_namespace.oid = function_row.pronamespace
      WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.ideas')
        AND trigger_row.tgname = 'ideas_updated_at'
        AND trigger_row.tgtype::integer = 19
        AND trigger_row.tgenabled = 'O'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgconstraint = 0
        AND NOT trigger_row.tgdeferrable
        AND NOT trigger_row.tginitdeferred
        AND trigger_row.tgqual IS NULL AND trigger_row.tgnargs = 0
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
      SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint AS c
      WHERE c.conrelid = pg_catalog.to_regclass(expected.child_relation)
        AND c.confrelid = pg_catalog.to_regclass('public.ideas')
        AND c.conkey = ARRAY[(SELECT a.attnum
          FROM pg_catalog.pg_attribute AS a
          WHERE a.attrelid = c.conrelid AND a.attname = expected.child_column
            AND a.attnum > 0 AND NOT a.attisdropped)]::smallint[]
    ) <> 1 OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS c
      WHERE c.conrelid = pg_catalog.to_regclass(expected.child_relation)
        AND c.confrelid = pg_catalog.to_regclass('public.ideas')
        AND c.conname = expected.constraint_name AND c.contype = 'f'
        AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
        AND c.confdeltype::text = expected.delete_action
        AND c.confupdtype = 'a' AND c.confmatchtype = 's'
        AND c.conkey = ARRAY[(SELECT a.attnum
          FROM pg_catalog.pg_attribute AS a
          WHERE a.attrelid = c.conrelid AND a.attname = expected.child_column
            AND a.attnum > 0 AND NOT a.attisdropped)]::smallint[]
        AND c.confkey = ARRAY[(SELECT a.attnum
          FROM pg_catalog.pg_attribute AS a
          WHERE a.attrelid = c.confrelid AND a.attname = 'id'
            AND a.attnum > 0 AND NOT a.attisdropped)]::smallint[]
    )
  ) AS ok
),
final_idea AS (
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
        AND idea_row.title = 'Verkefnin'
        AND idea_row.short_description =
          'Sameiginlegt yfirlit yfir verkefni, úthlutanir, verklok og stig.'
        AND idea_row.problem_description =
          'Verkefni og ábyrgð dreifast auðveldlega á milli samtala, miða og minnis. Þá verður óljóst hvað þarf að gera, hver tekur verkefnið að sér og hvað er þegar búið.'
        AND idea_row.possible_solution =
          'Með Verkefnunum geturðu stofnað hringi fyrir mismunandi samhengi, skilgreint endurnýtanleg verkefni og stig og haldið utan um úthlutanir, verklok og sögu á einum stað.'
        AND idea_row.category::text = 'Annað'
    ) AS ok
),
entitlements AS (
  SELECT NOT EXISTS (
    SELECT 1 FROM public.feature_access AS access_row
    WHERE access_row.feature_key = 'heimilisverkin'
  ) AS ok
),
hc_relation_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_row.relname::text, relation_row.relkind::text,
    relation_row.relpersistence::text, relation_row.relreplident::text,
    tablespace_row.spcname,
    COALESCE((SELECT pg_catalog.jsonb_agg(option_row.option_value
      ORDER BY option_row.option_value COLLATE "C")
      FROM pg_catalog.unnest(COALESCE(
        relation_row.reloptions, ARRAY[]::text[]
      )) AS option_row(option_value)), '[]'::jsonb)
  ) ORDER BY relation_row.relname::text COLLATE "C"), '[]'::jsonb) AS value
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
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_row.relname::text, attribute_row.attnum,
    attribute_row.attname::text,
    pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod),
    attribute_row.attnotnull, attribute_row.attidentity::text,
    attribute_row.attgenerated::text, attribute_row.atthasdef,
    collation_namespace.nspname, collation_row.collname,
    pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid, false)
  ) ORDER BY relation_row.relname::text COLLATE "C", attribute_row.attnum),
  '[]'::jsonb) AS value
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
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_row.relname::text, constraint_row.conname::text,
    constraint_row.contype::text, constraint_row.condeferrable,
    constraint_row.condeferred, constraint_row.convalidated,
    constraint_row.connoinherit, constraint_row.conislocal,
    constraint_row.coninhcount,
    pg_catalog.pg_get_constraintdef(constraint_row.oid, false)
  ) ORDER BY relation_row.relname::text COLLATE "C",
    constraint_row.conname::text COLLATE "C"), '[]'::jsonb) AS value
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
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_row.relname::text, index_namespace.nspname::text,
    index_relation.relname::text, access_method.amname::text,
    index_row.indisunique, index_row.indisprimary, index_row.indisexclusion,
    index_row.indimmediate, index_row.indisclustered, index_row.indisvalid,
    index_row.indisready, index_row.indislive, index_row.indisreplident,
    index_row.indnkeyatts, index_row.indnatts, tablespace_row.spcname,
    COALESCE((SELECT pg_catalog.jsonb_agg(option_row.option_value
      ORDER BY option_row.option_value COLLATE "C")
      FROM pg_catalog.unnest(COALESCE(
        index_relation.reloptions, ARRAY[]::text[]
      )) AS option_row(option_value)), '[]'::jsonb),
    pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
  ) ORDER BY relation_row.relname::text COLLATE "C",
    index_namespace.nspname::text COLLATE "C",
    index_relation.relname::text COLLATE "C"), '[]'::jsonb) AS value
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
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_namespace.nspname::text, relation_row.relname::text,
    index_namespace.nspname::text, index_relation.relname::text,
    access_method.amname::text, index_row.indisunique,
    index_row.indisprimary, index_row.indisexclusion,
    index_row.indimmediate, index_row.indisclustered, index_row.indisvalid,
    index_row.indisready, index_row.indislive, index_row.indisreplident,
    index_row.indnkeyatts, index_row.indnatts, tablespace_row.spcname,
    COALESCE((SELECT pg_catalog.jsonb_agg(option_row.option_value
      ORDER BY option_row.option_value COLLATE "C")
      FROM pg_catalog.unnest(COALESCE(
        index_relation.reloptions, ARRAY[]::text[]
      )) AS option_row(option_value)), '[]'::jsonb),
    pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
  ) ORDER BY index_namespace.nspname::text COLLATE "C",
    index_relation.relname::text COLLATE "C"), '[]'::jsonb) AS value
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
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    sequence_namespace.nspname::text, sequence_relation.relname::text,
    pg_catalog.format_type(sequence_row.seqtypid, NULL), sequence_row.seqstart,
    sequence_row.seqincrement, sequence_row.seqmax, sequence_row.seqmin,
    sequence_row.seqcache, sequence_row.seqcycle
  ) ORDER BY sequence_namespace.nspname::text COLLATE "C",
    sequence_relation.relname::text COLLATE "C"), '[]'::jsonb) AS value
  FROM pg_catalog.pg_sequence AS sequence_row
  JOIN pg_catalog.pg_class AS sequence_relation
    ON sequence_relation.oid = sequence_row.seqrelid
  JOIN pg_catalog.pg_namespace AS sequence_namespace
    ON sequence_namespace.oid = sequence_relation.relnamespace
  WHERE sequence_namespace.nspname = 'public'
    AND sequence_relation.relname = 'household_chore_rate_events_id_seq'
),
hc_function_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    function_row.proname::text,
    pg_catalog.pg_get_function_identity_arguments(function_row.oid),
    pg_catalog.pg_get_function_arguments(function_row.oid),
    pg_catalog.pg_get_function_result(function_row.oid),
    pg_catalog.pg_get_functiondef(function_row.oid)
  ) ORDER BY function_row.proname::text COLLATE "C",
    pg_catalog.pg_get_function_identity_arguments(function_row.oid)
      COLLATE "C"), '[]'::jsonb) AS value
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_row.pronamespace
  WHERE function_namespace.nspname = 'public'
    AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
),
hc_trigger_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    relation_namespace.nspname::text, relation_row.relname::text,
    trigger_row.tgname::text,
    pg_catalog.pg_get_triggerdef(trigger_row.oid, false)
  ) ORDER BY relation_namespace.nspname::text COLLATE "C",
    relation_row.relname::text COLLATE "C",
    trigger_row.tgname::text COLLATE "C"), '[]'::jsonb) AS value
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
sql142_seal AS (
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT pg_catalog.obj_description(
        pg_catalog.to_regclass('public.household_chore_circles'), 'pg_class'
      ) AS stored_comment,
      pg_catalog.current_setting('server_version_num') AS server_version_num,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'contract_version', 1, 'relations', hc_relation_contract.value,
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
    ) AS seal_row
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
    feature_columns.ok AS feature_schema_exact_ok,
    feature_security.ok AS feature_security_exact_ok,
    feature_constraints.ok AS feature_constraint_exact_ok,
    feature_indexes.ok AS feature_indexes_exact_ok,
    guard_functions.ok AS guard_functions_exact_ok,
    guard_authority.insert_ok AS insert_authority_ok,
    guard_authority.update_ok AS update_lock_free_ok,
    guard_authority.auth_email_ok AS auth_email_lifecycle_ok,
    guard_triggers.ok AS guard_triggers_exact_ok,
    auth_email_triggers.ok AS auth_email_triggers_exact_ok,
    entitlements.ok AS no_household_entitlements_ok,
    idea_contract.ok AS idea_schema_trigger_exact_ok,
    idea_references.ok AS idea_reference_fks_exact_ok,
    final_idea.ok AS final_idea_copy_exact_ok,
    sql142_seal.ok AS sql142_catalog_unchanged_ok
  FROM feature_columns CROSS JOIN feature_security
  CROSS JOIN feature_constraints CROSS JOIN feature_indexes
  CROSS JOIN guard_functions CROSS JOIN guard_authority CROSS JOIN guard_triggers
  CROSS JOIN auth_email_triggers
  CROSS JOIN entitlements CROSS JOIN idea_contract CROSS JOIN idea_references
  CROSS JOIN final_idea CROSS JOIN sql142_seal
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  checks.*,
  checks.server_version_ok
    AND checks.executor_ok
    AND checks.feature_schema_exact_ok
    AND checks.feature_security_exact_ok
    AND checks.feature_constraint_exact_ok
    AND checks.feature_indexes_exact_ok
    AND checks.guard_functions_exact_ok
    AND checks.insert_authority_ok
    AND checks.update_lock_free_ok
    AND checks.auth_email_lifecycle_ok
    AND checks.guard_triggers_exact_ok
    AND checks.auth_email_triggers_exact_ok
    AND checks.no_household_entitlements_ok
    AND checks.idea_schema_trigger_exact_ok
    AND checks.idea_reference_fks_exact_ok
    AND checks.final_idea_copy_exact_ok
    AND checks.sql142_catalog_unchanged_ok AS postconditions_ok
FROM checks;

ROLLBACK;
