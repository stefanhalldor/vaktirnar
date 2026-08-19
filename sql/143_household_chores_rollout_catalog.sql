-- SQL143: closed-rollout catalog support for Verkefnin.
--
-- This migration only extends the reviewed feature-key constraint, installs
-- fail-closed guards for future manual entitlement inserts and auth-email
-- lifecycle changes, and updates the existing legacy idea row in place. It
-- does not grant, revoke, update, or otherwise mutate any feature_access row.
--
-- LOCAL SOURCE ONLY. Stebbi alone runs SQL manually after the separate
-- read-only SQL143 preflight has passed. Codex does not execute this file.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

DO $prerequisites$
DECLARE
  v_idea_count integer;
BEGIN
  IF current_user <> 'postgres' AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = current_user
      AND role_row.rolsuper
  ) THEN
    RAISE EXCEPTION 'household_chore_143_executor_invalid';
  END IF;

  IF pg_catalog.current_setting('server_version_num') <> '170006' THEN
    RAISE EXCEPTION 'household_chore_143_server_version_unreviewed:%',
      pg_catalog.current_setting('server_version_num');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('postgres'), ('anon'), ('authenticated'), ('service_role')
    ) AS required_role(role_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = required_role.role_name
    )
  ) THEN
    RAISE EXCEPTION 'household_chore_143_role_missing';
  END IF;

  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.feature_access') IS NULL
     OR pg_catalog.to_regclass('public.ideas') IS NULL
     OR pg_catalog.to_regclass('public.votes') IS NULL
     OR pg_catalog.to_regclass('public.followers') IS NULL
     OR pg_catalog.to_regclass('public.submissions') IS NULL
     OR pg_catalog.to_regclass('public.analytics_events') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_circles') IS NULL
     OR pg_catalog.to_regclass(
       'public.household_chore_deletion_markers'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.normalize_email_canonical(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.household_chore_private_lock_user(uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'household_chore_143_prerequisite_missing';
  END IF;

  IF EXISTS (
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
      ('public.ideas', 'id', 'uuid', true),
      ('public.ideas', 'title', 'text', true),
      ('public.ideas', 'slug', 'text', true),
      ('public.ideas', 'short_description', 'text', true),
      ('public.ideas', 'problem_description', 'text', false),
      ('public.ideas', 'possible_solution', 'text', false),
      ('public.ideas', 'category', 'idea_category', true),
      ('public.ideas', 'status', 'idea_status', true),
      ('public.ideas', 'source', 'idea_source', true),
      ('public.ideas', 'votes_count', 'integer', true),
      ('public.ideas', 'followers_count', 'integer', true),
      ('public.ideas', 'is_public', 'boolean', true),
      ('public.ideas', 'is_featured', 'boolean', true),
      ('public.ideas', 'created_at', 'timestamp with time zone', true),
      ('public.ideas', 'updated_at', 'timestamp with time zone', true),
      ('public.votes', 'id', 'uuid', true),
      ('public.votes', 'idea_id', 'uuid', true),
      ('public.followers', 'id', 'uuid', true),
      ('public.followers', 'idea_id', 'uuid', true),
      ('public.submissions', 'id', 'uuid', true),
      ('public.submissions', 'idea_id', 'uuid', false),
      ('public.analytics_events', 'id', 'uuid', true),
      ('public.analytics_events', 'idea_id', 'uuid', false)
    ) AS required_column(
      object_identity, column_name, expected_type, expected_not_null
    )
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
  ) THEN
    RAISE EXCEPTION 'household_chore_143_prerequisite_column_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_attribute AS attribute_row
    WHERE attribute_row.attrelid =
      'public.feature_access'::pg_catalog.regclass
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
  ) <> 3 OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('feature_key', 1), ('email', 2), ('granted_at', 3)
    ) AS expected_column(column_name, attribute_number)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
      WHERE attribute_row.attrelid =
        'public.feature_access'::pg_catalog.regclass
        AND attribute_row.attname = expected_column.column_name
        AND attribute_row.attnum = expected_column.attribute_number
        AND NOT attribute_row.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'household_chore_143_feature_column_count_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_row
    JOIN pg_catalog.pg_attrdef AS default_row
      ON default_row.adrelid = attribute_row.attrelid
     AND default_row.adnum = attribute_row.attnum
    WHERE attribute_row.attrelid =
      'public.feature_access'::pg_catalog.regclass
      AND attribute_row.attname = 'granted_at'
      AND attribute_row.atthasdef
      AND pg_catalog.pg_get_expr(
        default_row.adbin, default_row.adrelid, false
      ) = 'now()'
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_row
    WHERE attribute_row.attrelid =
      'public.feature_access'::pg_catalog.regclass
      AND attribute_row.attname IN ('feature_key', 'email')
      AND attribute_row.atthasdef
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
  ) THEN
    RAISE EXCEPTION 'household_chore_143_feature_default_drift';
  END IF;

  IF NOT EXISTS (
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
        SELECT 1
        FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid = relation_row.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = relation_row.oid
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
          AND attribute_row.attacl IS NOT NULL
      )
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.aclexplode(COALESCE(
          relation_row.relacl,
          pg_catalog.acldefault('r', relation_row.relowner)
        )) AS acl_row
      ) = 16
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
             (
               acl_row.grantee = relation_row.relowner
               AND acl_row.privilege_type IN (
                 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                 'REFERENCES', 'TRIGGER', 'MAINTAIN'
               )
             )
             OR (
               grantee_role.rolname IS NOT DISTINCT FROM 'service_role'
               AND acl_row.privilege_type IN (
                 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                 'REFERENCES', 'TRIGGER', 'MAINTAIN'
               )
             )
           )
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_143_feature_privacy_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
      'public.feature_access'::pg_catalog.regclass
  ) <> 3 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
      'public.feature_access'::pg_catalog.regclass
      AND constraint_row.conname = 'feature_access_pkey'
      AND constraint_row.contype = 'p'
      AND constraint_row.convalidated
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred
      AND constraint_row.conkey = ARRAY[
        (
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = constraint_row.conrelid
            AND attribute_row.attname = 'feature_key'
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
        ),
        (
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = constraint_row.conrelid
            AND attribute_row.attname = 'email'
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
        )
      ]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
      'public.feature_access'::pg_catalog.regclass
      AND constraint_row.conname = 'feature_access_email_check'
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
      AND constraint_row.conkey = ARRAY[(
        SELECT attribute_row.attnum
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = constraint_row.conrelid
          AND attribute_row.attname = 'email'
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
      )]::smallint[]
      AND pg_catalog.lower(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid, false
      )) LIKE '%email%lower%email%email%<>%'
      AND (
        SELECT pg_catalog.array_agg(
          match_row.value[1] ORDER BY match_row.value[1] COLLATE "C"
        )
        FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(
          constraint_row.conbin, constraint_row.conrelid, false
        ), '''([^'']*)''', 'g') AS match_row(value)
      ) = ARRAY['']::text[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
      'public.feature_access'::pg_catalog.regclass
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
  ) THEN
    RAISE EXCEPTION 'household_chore_143_feature_constraint_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indrelid = 'public.feature_access'::pg_catalog.regclass
  ) <> 2 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_row.indexrelid
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'feature_access_pkey'
      AND index_row.indrelid = 'public.feature_access'::pg_catalog.regclass
      AND index_row.indisunique
      AND index_row.indisprimary
      AND index_row.indimmediate
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indnkeyatts = 2
      AND index_row.indnatts = 2
      AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_row.indexrelid
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute_row
      ON attribute_row.attrelid = index_row.indrelid
     AND attribute_row.attnum = index_row.indkey[0]
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'feature_access_email_idx'
      AND index_row.indrelid = 'public.feature_access'::pg_catalog.regclass
      AND NOT index_row.indisunique
      AND NOT index_row.indisprimary
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indnkeyatts = 1
      AND index_row.indnatts = 1
      AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
      AND attribute_row.attname = 'email'
  ) THEN
    RAISE EXCEPTION 'household_chore_143_feature_index_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE (
      trigger_row.tgrelid = 'public.feature_access'::pg_catalog.regclass
      OR (
        trigger_row.tgrelid = 'auth.users'::pg_catalog.regclass
        AND pg_catalog.left(
          trigger_row.tgname::text,
          pg_catalog.char_length(
            'feature_access_heimilisverkin_auth_email_'
          )
        ) = 'feature_access_heimilisverkin_auth_email_'
      )
    )
      AND NOT trigger_row.tgisinternal
  ) OR EXISTS (
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
  ) THEN
    RAISE EXCEPTION 'household_chore_143_guard_target_not_clear';
  END IF;

  IF NOT EXISTS (
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
  ) THEN
    RAISE EXCEPTION 'household_chore_143_normalizer_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
      'public.household_chore_private_lock_user(uuid)'
    )
      AND procedure_row.prokind = 'f'
      AND procedure_row.prorettype = 'void'::pg_catalog.regtype
      AND NOT procedure_row.proretset
      AND procedure_row.prosecdef
      AND procedure_row.provolatile = 'v'
      AND NOT procedure_row.proisstrict
      AND procedure_row.proparallel = 'u'
      AND NOT procedure_row.proleakproof
      AND procedure_row.pronargdefaults = 0
      AND language_row.lanname = 'sql'
      AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(procedure_row.oid) =
        'p_user_id uuid'
      AND pg_catalog.md5(pg_catalog.replace(
        procedure_row.prosrc, E'\r\n', E'\n'
      )) =
        'd076df528726fff6ea25ff012caa64b2'
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
      ) = 1
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantee <> procedure_row.proowner
           OR privilege.grantor <> procedure_row.proowner
           OR privilege.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_143_lock_helper_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = procedure_row.prolang
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
      'public.teskeid_set_updated_at()'
    )
      AND procedure_row.prokind = 'f'
      AND procedure_row.prorettype = 'trigger'::pg_catalog.regtype
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
        )) AS privilege
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantee = procedure_row.proowner
          AND privilege.grantor = procedure_row.proowner
          AND NOT privilege.is_grantable
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> procedure_row.proowner
           OR privilege.is_grantable
           OR (
             privilege.grantee <> 0
             AND privilege.grantee <> procedure_row.proowner
             AND grantee_role.rolname IS DISTINCT FROM 'anon'
             AND grantee_role.rolname IS DISTINCT FROM 'authenticated'
             AND grantee_role.rolname IS DISTINCT FROM 'service_role'
           )
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_143_idea_touch_dependency_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.ideas'::pg_catalog.regclass
      AND NOT trigger_row.tgisinternal
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_proc AS function_row
      ON function_row.oid = trigger_row.tgfoid
    JOIN pg_catalog.pg_namespace AS function_namespace
      ON function_namespace.oid = function_row.pronamespace
    WHERE trigger_row.tgrelid = 'public.ideas'::pg_catalog.regclass
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
  ) THEN
    RAISE EXCEPTION 'household_chore_143_idea_trigger_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.votes', 'idea_id', 'c'),
      ('public.followers', 'idea_id', 'c'),
      ('public.submissions', 'idea_id', 'n'),
      ('public.analytics_events', 'idea_id', 'n')
    ) AS expected_fk(child_relation, child_column, delete_action)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
        pg_catalog.to_regclass(expected_fk.child_relation)
        AND constraint_row.confrelid = 'public.ideas'::pg_catalog.regclass
        AND constraint_row.contype = 'f'
        AND constraint_row.convalidated
        AND constraint_row.confdeltype::text = expected_fk.delete_action
        AND constraint_row.conkey = ARRAY[(
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = constraint_row.conrelid
            AND attribute_row.attname = expected_fk.child_column
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
  ) THEN
    RAISE EXCEPTION 'household_chore_143_idea_reference_drift';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_idea_count
  FROM public.ideas AS idea_row
  WHERE idea_row.slug = 'fyrsta-vakt-krakkanna';
  IF v_idea_count <> 1 OR EXISTS (
    SELECT 1
    FROM public.ideas AS idea_row
    WHERE idea_row.slug IN ('heimilisverkin', 'verkefnin')
  ) THEN
    RAISE EXCEPTION 'household_chore_143_legacy_idea_not_exact';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ideas AS idea_row
    WHERE idea_row.slug = 'fyrsta-vakt-krakkanna'
      AND (
        (
          idea_row.title = 'Fyrsta vakt krakkanna'
          AND idea_row.short_description =
            'Krakkar safna stigum fyrir heimilisverk og fá sitt fyrsta bragð af ábyrgð, umbun og eigin vakt.'
          AND idea_row.problem_description =
            'Börn vilja oft hjálpa, en heimilisverk verða fljótt að nöldri, mútum eða einhverju sem gleymist. Foreldrar þurfa að minna á allt og krakkar sjá ekki alltaf tenginguna milli ábyrgðar, þátttöku og umbunar.'
          AND idea_row.possible_solution =
            'Einfalt kerfi þar sem krakkar fá verkefni við hæfi, safna stigum og sjá hvernig þeirra framlag skiptir máli. Fyrsta litla vaktin þeirra, með ábyrgð, hvatningu og umbun sem fjölskyldan getur stillt saman.'
          AND idea_row.category::text = 'Börn'
        )
        OR (
          idea_row.title = 'Verkefnin'
          AND idea_row.short_description =
            'Sameiginlegt yfirlit yfir verkefni, úthlutanir, verklok og stig.'
          AND idea_row.problem_description =
            'Verkefni og ábyrgð dreifast auðveldlega á milli samtala, miða og minnis. Þá verður óljóst hvað þarf að gera, hver tekur verkefnið að sér og hvað er þegar búið.'
          AND idea_row.possible_solution =
            'Með Verkefnunum geturðu stofnað hringi fyrir mismunandi samhengi, skilgreint endurnýtanleg verkefni og stig og haldið utan um úthlutanir, verklok og sögu á einum stað.'
          AND idea_row.category::text = 'Annað'
        )
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_143_legacy_idea_copy_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_enum AS enum_row
    WHERE enum_row.enumtypid = 'public.idea_category'::pg_catalog.regtype
      AND enum_row.enumlabel = 'Annað'
  ) THEN
    RAISE EXCEPTION 'household_chore_143_target_category_missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.feature_access AS access_row
    WHERE access_row.feature_key = 'heimilisverkin'
  ) THEN
    RAISE EXCEPTION 'household_chore_143_unexpected_entitlement';
  END IF;
END;
$prerequisites$;

-- Recompute, rather than replace, SQL142's stored catalog seal. SQL143 must
-- remain outside the frozen Household domain namespace.
CREATE TEMP VIEW sql143_sql142_catalog_digest AS
WITH
relation_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text,
      relation_row.relkind::text,
      relation_row.relpersistence::text,
      relation_row.relreplident::text,
      tablespace_row.spcname,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(
          option_row.option_value
          ORDER BY option_row.option_value COLLATE "C"
        )
        FROM pg_catalog.unnest(
          COALESCE(relation_row.reloptions, ARRAY[]::text[])
        ) AS option_row(option_value)
      ), '[]'::jsonb)
    ) ORDER BY relation_row.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = relation_row.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) =
      'household_chore_'
    AND relation_row.relkind = 'r'
),
column_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text,
      attribute_row.attnum,
      attribute_row.attname::text,
      pg_catalog.format_type(
        attribute_row.atttypid, attribute_row.atttypmod
      ),
      attribute_row.attnotnull,
      attribute_row.attidentity::text,
      attribute_row.attgenerated::text,
      attribute_row.atthasdef,
      collation_namespace.nspname,
      collation_row.collname,
      pg_catalog.pg_get_expr(
        default_row.adbin, default_row.adrelid, false
      )
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
    AND pg_catalog.left(relation_row.relname::text, 16) =
      'household_chore_'
    AND relation_row.relkind = 'r'
    AND attribute_row.attnum > 0
    AND NOT attribute_row.attisdropped
),
constraint_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text,
      constraint_row.conname::text,
      constraint_row.contype::text,
      constraint_row.condeferrable,
      constraint_row.condeferred,
      constraint_row.convalidated,
      constraint_row.connoinherit,
      constraint_row.conislocal,
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
    AND pg_catalog.left(relation_row.relname::text, 16) =
      'household_chore_'
    AND relation_row.relkind = 'r'
),
index_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_row.relname::text,
      index_namespace.nspname::text,
      index_relation.relname::text,
      access_method.amname::text,
      index_row.indisunique,
      index_row.indisprimary,
      index_row.indisexclusion,
      index_row.indimmediate,
      index_row.indisclustered,
      index_row.indisvalid,
      index_row.indisready,
      index_row.indislive,
      index_row.indisreplident,
      index_row.indnkeyatts,
      index_row.indnatts,
      tablespace_row.spcname,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(
          option_row.option_value
          ORDER BY option_row.option_value COLLATE "C"
        )
        FROM pg_catalog.unnest(
          COALESCE(index_relation.reloptions, ARRAY[]::text[])
        ) AS option_row(option_value)
      ), '[]'::jsonb),
      pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
    ) ORDER BY relation_row.relname::text COLLATE "C",
      index_namespace.nspname::text COLLATE "C",
      index_relation.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = index_relation.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) =
      'household_chore_'
    AND relation_row.relkind = 'r'
),
shared_index_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_namespace.nspname::text,
      relation_row.relname::text,
      index_namespace.nspname::text,
      index_relation.relname::text,
      access_method.amname::text,
      index_row.indisunique,
      index_row.indisprimary,
      index_row.indisexclusion,
      index_row.indimmediate,
      index_row.indisclustered,
      index_row.indisvalid,
      index_row.indisready,
      index_row.indislive,
      index_row.indisreplident,
      index_row.indnkeyatts,
      index_row.indnatts,
      tablespace_row.spcname,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(
          option_row.option_value
          ORDER BY option_row.option_value COLLATE "C"
        )
        FROM pg_catalog.unnest(
          COALESCE(index_relation.reloptions, ARRAY[]::text[])
        ) AS option_row(option_value)
      ), '[]'::jsonb),
      pg_catalog.pg_get_indexdef(index_row.indexrelid, 0, false)
    ) ORDER BY index_namespace.nspname::text COLLATE "C",
      index_relation.relname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_index AS index_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = index_row.indrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_row.indexrelid
  JOIN pg_catalog.pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_relation.relam
  LEFT JOIN pg_catalog.pg_tablespace AS tablespace_row
    ON tablespace_row.oid = index_relation.reltablespace
  WHERE relation_namespace.nspname = 'public'
    AND relation_row.relname = 'recent_events'
    AND index_namespace.nspname = 'public'
    AND index_relation.relname =
      'recent_events_household_chore_entity_idx'
),
sequence_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      sequence_namespace.nspname::text,
      sequence_relation.relname::text,
      pg_catalog.format_type(sequence_row.seqtypid, NULL),
      sequence_row.seqstart,
      sequence_row.seqincrement,
      sequence_row.seqmax,
      sequence_row.seqmin,
      sequence_row.seqcache,
      sequence_row.seqcycle
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
function_contract AS (
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
    AND pg_catalog.left(function_row.proname::text, 16) =
      'household_chore_'
),
trigger_contract AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      relation_namespace.nspname::text,
      relation_row.relname::text,
      trigger_row.tgname::text,
      pg_catalog.pg_get_triggerdef(trigger_row.oid, false)
    ) ORDER BY relation_namespace.nspname::text COLLATE "C",
      relation_row.relname::text COLLATE "C",
      trigger_row.tgname::text COLLATE "C"
  ), '[]'::jsonb) AS value
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  WHERE NOT trigger_row.tgisinternal
    AND (
      (
        relation_namespace.nspname = 'public'
        AND pg_catalog.left(relation_row.relname::text, 16) =
          'household_chore_'
      )
      OR (
        relation_namespace.nspname = 'auth'
        AND relation_row.relname = 'users'
        AND trigger_row.tgname = 'household_chore_auth_delete_guard'
      )
    )
)
SELECT
  pg_catalog.obj_description(
    'public.household_chore_circles'::pg_catalog.regclass, 'pg_class'
  ) AS stored_comment,
  pg_catalog.current_setting('server_version_num') AS server_version_num,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'contract_version', 1,
      'relations', relation_contract.value,
      'columns', column_contract.value,
      'constraints', constraint_contract.value,
      'indexes', index_contract.value,
      'shared_indexes', shared_index_contract.value,
      'sequences', sequence_contract.value,
      'functions', function_contract.value,
      'triggers', trigger_contract.value
    )::text,
    'UTF8'
  )), 'hex') AS current_digest
FROM relation_contract
CROSS JOIN column_contract
CROSS JOIN constraint_contract
CROSS JOIN index_contract
CROSS JOIN shared_index_contract
CROSS JOIN sequence_contract
CROSS JOIN function_contract
CROSS JOIN trigger_contract;

DO $sql142_preseal$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_temp.sql143_sql142_catalog_digest AS seal_row
    WHERE COALESCE(seal_row.stored_comment ~
      '^teskeid:sql142:catalog-v1:[0-9]{5,8}:[0-9a-f]{64}$', false)
      AND pg_catalog.split_part(seal_row.stored_comment, ':', 4) =
        seal_row.server_version_num
      AND pg_catalog.split_part(seal_row.stored_comment, ':', 5) =
        seal_row.current_digest
  ) THEN
    RAISE EXCEPTION 'household_chore_143_sql142_catalog_seal_failed';
  END IF;
END;
$sql142_preseal$;

-- Freeze the complete entitlement table while its constraint and guards are
-- installed. Snapshot every row so the final attestation can prove, with
-- EXCEPT ALL in both directions, that SQL143 performed zero entitlement DML.
LOCK TABLE public.feature_access IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.ideas, public.votes, public.followers,
  public.submissions, public.analytics_events IN SHARE ROW EXCLUSIVE MODE;

DO $locked_idea$
BEGIN
  PERFORM 1
  FROM public.ideas AS idea_row
  WHERE idea_row.slug = 'fyrsta-vakt-krakkanna'
    AND (
      (
        idea_row.title = 'Fyrsta vakt krakkanna'
        AND idea_row.short_description =
          'Krakkar safna stigum fyrir heimilisverk og fá sitt fyrsta bragð af ábyrgð, umbun og eigin vakt.'
        AND idea_row.problem_description =
          'Börn vilja oft hjálpa, en heimilisverk verða fljótt að nöldri, mútum eða einhverju sem gleymist. Foreldrar þurfa að minna á allt og krakkar sjá ekki alltaf tenginguna milli ábyrgðar, þátttöku og umbunar.'
        AND idea_row.possible_solution =
          'Einfalt kerfi þar sem krakkar fá verkefni við hæfi, safna stigum og sjá hvernig þeirra framlag skiptir máli. Fyrsta litla vaktin þeirra, með ábyrgð, hvatningu og umbun sem fjölskyldan getur stillt saman.'
        AND idea_row.category::text = 'Börn'
      )
      OR (
        idea_row.title = 'Verkefnin'
        AND idea_row.short_description =
          'Sameiginlegt yfirlit yfir verkefni, úthlutanir, verklok og stig.'
        AND idea_row.problem_description =
          'Verkefni og ábyrgð dreifast auðveldlega á milli samtala, miða og minnis. Þá verður óljóst hvað þarf að gera, hver tekur verkefnið að sér og hvað er þegar búið.'
        AND idea_row.possible_solution =
          'Með Verkefnunum geturðu stofnað hringi fyrir mismunandi samhengi, skilgreint endurnýtanleg verkefni og stig og haldið utan um úthlutanir, verklok og sögu á einum stað.'
        AND idea_row.category::text = 'Annað'
      )
    )
  FOR UPDATE;
  IF NOT FOUND OR EXISTS (
    SELECT 1
    FROM public.ideas AS idea_row
    WHERE idea_row.slug IN ('heimilisverkin', 'verkefnin')
  ) THEN
    RAISE EXCEPTION 'household_chore_143_locked_idea_drift';
  END IF;
END;
$locked_idea$;

CREATE TEMP TABLE sql143_feature_access_rows ON COMMIT DROP AS
SELECT access_row.feature_key, access_row.email, access_row.granted_at
FROM public.feature_access AS access_row;

CREATE TEMP TABLE sql143_feature_relation_snapshot ON COMMIT DROP AS
SELECT
  relation_row.relowner,
  relation_row.relrowsecurity,
  relation_row.relforcerowsecurity,
  relation_row.relreplident,
  relation_row.reloptions
FROM pg_catalog.pg_class AS relation_row
WHERE relation_row.oid = 'public.feature_access'::pg_catalog.regclass;

-- SQL52 granted only SELECT/INSERT/DELETE in source, but Supabase default
-- table privileges had already granted service_role every table privilege.
-- Narrow that historical 16-entry pre-state to the intended 11-entry ACL.
-- This changes no entitlement row and preserves all owner authority.
REVOKE ALL ON TABLE public.feature_access
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.feature_access TO service_role;

CREATE TEMP TABLE sql143_idea_protected ON COMMIT DROP AS
SELECT
  idea_row.id,
  idea_row.slug,
  idea_row.status,
  idea_row.source,
  idea_row.votes_count,
  idea_row.followers_count,
  idea_row.is_public,
  idea_row.is_featured,
  idea_row.created_at,
  idea_row.updated_at
FROM public.ideas AS idea_row
WHERE idea_row.slug = 'fyrsta-vakt-krakkanna';

CREATE TEMP TABLE sql143_idea_references ON COMMIT DROP AS
SELECT 'votes'::text AS relation_name, vote_row.id AS reference_id
FROM public.votes AS vote_row
JOIN pg_temp.sql143_idea_protected AS idea_row
  ON idea_row.id = vote_row.idea_id
UNION ALL
SELECT 'followers'::text, follower_row.id
FROM public.followers AS follower_row
JOIN pg_temp.sql143_idea_protected AS idea_row
  ON idea_row.id = follower_row.idea_id
UNION ALL
SELECT 'submissions'::text, submission_row.id
FROM public.submissions AS submission_row
JOIN pg_temp.sql143_idea_protected AS idea_row
  ON idea_row.id = submission_row.idea_id
UNION ALL
SELECT 'analytics_events'::text, event_row.id
FROM public.analytics_events AS event_row
JOIN pg_temp.sql143_idea_protected AS idea_row
  ON idea_row.id = event_row.idea_id;

CREATE TEMP TABLE sql143_idea_update_outcome (
  updated_rows integer NOT NULL
) ON COMMIT DROP;

DO $feature_constraint$
DECLARE
  v_old_expression text;
BEGIN
  SELECT pg_catalog.pg_get_expr(
    constraint_row.conbin, constraint_row.conrelid, false
  )
  INTO STRICT v_old_expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid =
    'public.feature_access'::pg_catalog.regclass
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated;

  IF pg_catalog.md5(pg_catalog.lower(v_old_expression)) <>
       '97736909cf1a3a5432eeb34275cf3cfc' THEN
    RAISE EXCEPTION 'household_chore_143_feature_constraint_changed';
  END IF;

  ALTER TABLE public.feature_access
    DROP CONSTRAINT feature_access_feature_key_check;
  EXECUTE pg_catalog.format(
    'ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK ((%s) OR feature_key = %L)',
    v_old_expression,
    'heimilisverkin'
  );
END;
$feature_constraint$;

CREATE FUNCTION public.feature_access_heimilisverkin_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_canonical_email text;
  v_candidate_ids uuid[];
  v_user_id uuid;
  v_current_email text;
  v_confirmed_at timestamptz;
BEGIN
  IF NEW.feature_key IS DISTINCT FROM 'heimilisverkin' THEN
    RETURN NEW;
  END IF;

  v_canonical_email := public.normalize_email_canonical(NEW.email);
  IF v_canonical_email IS NULL
     OR NEW.email IS DISTINCT FROM v_canonical_email THEN
    RAISE EXCEPTION 'feature_access_heimilisverkin_email_invalid';
  END IF;

  SELECT pg_catalog.array_agg(account.id ORDER BY account.id)
  INTO v_candidate_ids
  FROM auth.users AS account
  WHERE public.normalize_email_canonical(account.email) =
    v_canonical_email;
  IF pg_catalog.cardinality(COALESCE(
    v_candidate_ids, ARRAY[]::uuid[]
  )) <> 1 THEN
    RAISE EXCEPTION 'feature_access_heimilisverkin_account_not_exact';
  END IF;
  v_user_id := v_candidate_ids[1];

  -- Take SQL142's shared user-9601 barrier first. The later email-9702 lock
  -- and auth-row re-read are safe because that common user barrier already
  -- serializes this insert against Household account-deletion preparation.
  PERFORM public.household_chore_private_lock_user(v_user_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_canonical_email, 9702)
  );

  SELECT account.email, account.email_confirmed_at
  INTO v_current_email, v_confirmed_at
  FROM auth.users AS account
  WHERE account.id = v_user_id
  FOR SHARE;
  IF NOT FOUND
     OR v_confirmed_at IS NULL
     OR public.normalize_email_canonical(v_current_email) IS DISTINCT FROM
       v_canonical_email THEN
    RAISE EXCEPTION 'feature_access_heimilisverkin_account_not_current';
  END IF;

  SELECT pg_catalog.array_agg(account.id ORDER BY account.id)
  INTO v_candidate_ids
  FROM auth.users AS account
  WHERE public.normalize_email_canonical(account.email) =
    v_canonical_email;
  IF v_candidate_ids IS DISTINCT FROM ARRAY[v_user_id]::uuid[] THEN
    RAISE EXCEPTION 'feature_access_heimilisverkin_account_ambiguous';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'feature_access_heimilisverkin_deletion_pending';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.feature_access_heimilisverkin_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Deliberately no SQL reads or locks: rejecting immediately avoids a
  -- feature-row -> user-9601 inversion against account-deletion preparation.
  IF OLD.feature_key = 'heimilisverkin'
     OR NEW.feature_key = 'heimilisverkin' THEN
    RAISE EXCEPTION 'feature_access_heimilisverkin_update_forbidden';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.feature_access_heimilisverkin_auth_email_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_canonical_email text;
  v_canonical_emails text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_canonical_email := public.normalize_email_canonical(NEW.email);
    IF v_canonical_email IS NOT NULL THEN
      -- There is no auth row or canonical user identity to lock yet. The
      -- blocking email barrier serializes this new account with a grant.
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_canonical_email, 9702)
      );
      IF EXISTS (
        SELECT 1
        FROM public.feature_access AS access_row
        WHERE access_row.feature_key = 'heimilisverkin'
          AND access_row.email = v_canonical_email
      ) THEN
        RAISE EXCEPTION
          'feature_access_heimilisverkin_auth_email_conflict';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT pg_catalog.array_agg(
      candidate.canonical_email
      ORDER BY candidate.canonical_email COLLATE "C"
    )
    INTO v_canonical_emails
    FROM (
      SELECT DISTINCT source_email.canonical_email
      FROM (VALUES
        (public.normalize_email_canonical(OLD.email)),
        (public.normalize_email_canonical(NEW.email))
      ) AS source_email(canonical_email)
      WHERE source_email.canonical_email IS NOT NULL
    ) AS candidate;

    FOREACH v_canonical_email IN ARRAY COALESCE(
      v_canonical_emails, ARRAY[]::text[]
    ) LOOP
      -- UPDATE already owns the auth row. Never wait for email-9702 here:
      -- failing immediately prevents auth-row -> email-lock deadlocks with a
      -- concurrent grant that takes its user barrier, email lock, then auth.
      IF NOT pg_catalog.pg_try_advisory_xact_lock(
        pg_catalog.hashtextextended(v_canonical_email, 9702)
      ) THEN
        RAISE EXCEPTION
          'feature_access_heimilisverkin_auth_email_lock_unavailable';
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM public.feature_access AS access_row
      WHERE access_row.feature_key = 'heimilisverkin'
        AND access_row.email = ANY(COALESCE(
          v_canonical_emails, ARRAY[]::text[]
        ))
    ) THEN
      RAISE EXCEPTION 'feature_access_heimilisverkin_auth_email_conflict';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'feature_access_heimilisverkin_auth_operation_invalid';
END;
$function$;

ALTER FUNCTION public.feature_access_heimilisverkin_insert_guard()
  OWNER TO postgres;
ALTER FUNCTION public.feature_access_heimilisverkin_update_guard()
  OWNER TO postgres;
ALTER FUNCTION public.feature_access_heimilisverkin_auth_email_guard()
  OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.feature_access_heimilisverkin_insert_guard()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.feature_access_heimilisverkin_update_guard()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.feature_access_heimilisverkin_auth_email_guard()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER feature_access_heimilisverkin_insert_guard
  BEFORE INSERT ON public.feature_access
  FOR EACH ROW
  EXECUTE FUNCTION public.feature_access_heimilisverkin_insert_guard();

CREATE TRIGGER feature_access_heimilisverkin_update_guard
  BEFORE UPDATE OF feature_key, email ON public.feature_access
  FOR EACH ROW
  EXECUTE FUNCTION public.feature_access_heimilisverkin_update_guard();

CREATE TRIGGER feature_access_heimilisverkin_auth_email_insert_guard
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION
    public.feature_access_heimilisverkin_auth_email_guard();

CREATE TRIGGER feature_access_heimilisverkin_auth_email_update_guard
  BEFORE UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION
    public.feature_access_heimilisverkin_auth_email_guard();

WITH updated_idea AS (
  UPDATE public.ideas AS idea_row
  SET
    title = 'Verkefnin',
    short_description =
      'Sameiginlegt yfirlit yfir verkefni, úthlutanir, verklok og stig.',
    problem_description =
      'Verkefni og ábyrgð dreifast auðveldlega á milli samtala, miða og minnis. Þá verður óljóst hvað þarf að gera, hver tekur verkefnið að sér og hvað er þegar búið.',
    possible_solution =
      'Með Verkefnunum geturðu stofnað hringi fyrir mismunandi samhengi, skilgreint endurnýtanleg verkefni og stig og haldið utan um úthlutanir, verklok og sögu á einum stað.',
    category = 'Annað'
  WHERE idea_row.slug = 'fyrsta-vakt-krakkanna'
    AND ROW(
      idea_row.title,
      idea_row.short_description,
      idea_row.problem_description,
      idea_row.possible_solution,
      idea_row.category::text
    ) IS DISTINCT FROM ROW(
      'Verkefnin'::text,
      'Sameiginlegt yfirlit yfir verkefni, úthlutanir, verklok og stig.'::text,
      'Verkefni og ábyrgð dreifast auðveldlega á milli samtala, miða og minnis. Þá verður óljóst hvað þarf að gera, hver tekur verkefnið að sér og hvað er þegar búið.'::text,
      'Með Verkefnunum geturðu stofnað hringi fyrir mismunandi samhengi, skilgreint endurnýtanleg verkefni og stig og haldið utan um úthlutanir, verklok og sögu á einum stað.'::text,
      'Annað'::text
    )
  RETURNING 1
)
INSERT INTO pg_temp.sql143_idea_update_outcome (updated_rows)
SELECT pg_catalog.count(*)::integer
FROM updated_idea;

CREATE TEMP TABLE sql143_idea_references_after ON COMMIT DROP AS
SELECT 'votes'::text AS relation_name, vote_row.id AS reference_id
FROM public.votes AS vote_row
JOIN pg_temp.sql143_idea_protected AS idea_row
  ON idea_row.id = vote_row.idea_id
UNION ALL
SELECT 'followers'::text, follower_row.id
FROM public.followers AS follower_row
JOIN pg_temp.sql143_idea_protected AS idea_row
  ON idea_row.id = follower_row.idea_id
UNION ALL
SELECT 'submissions'::text, submission_row.id
FROM public.submissions AS submission_row
JOIN pg_temp.sql143_idea_protected AS idea_row
  ON idea_row.id = submission_row.idea_id
UNION ALL
SELECT 'analytics_events'::text, event_row.id
FROM public.analytics_events AS event_row
JOIN pg_temp.sql143_idea_protected AS idea_row
  ON idea_row.id = event_row.idea_id;

DO $final_attestation$
DECLARE
  v_updated_rows integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
      'public.feature_access'::pg_catalog.regclass
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
      ))) = 'fefe253894973ff1ee1d7d56da941a07'
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
        'facebook-oauth', 'ferdalagid', 'heimilisverkin', 'kviss',
        'road-intelligence-v1', 'tengsl', 'teskeid-routing-v1', 'umonnun',
        'utlagt-og-endurgreitt', 'vedrid',
        'weather-provider-vedurstofan', 'weather-provider-vegagerdin',
        'weather-pulse'
      ]::text[]
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
      'public.feature_access'::pg_catalog.regclass
  ) <> 3 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indrelid = 'public.feature_access'::pg_catalog.regclass
  ) <> 2 THEN
    RAISE EXCEPTION 'household_chore_143_feature_constraint_seal_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_temp.sql143_feature_relation_snapshot AS snapshot_row
      ON snapshot_row.relowner = relation_row.relowner
    WHERE relation_row.oid = 'public.feature_access'::pg_catalog.regclass
      AND relation_row.relrowsecurity IS NOT DISTINCT FROM
        snapshot_row.relrowsecurity
      AND relation_row.relforcerowsecurity IS NOT DISTINCT FROM
        snapshot_row.relforcerowsecurity
      AND relation_row.relreplident IS NOT DISTINCT FROM
        snapshot_row.relreplident
      AND relation_row.reloptions IS NOT DISTINCT FROM snapshot_row.reloptions
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.aclexplode(COALESCE(
          relation_row.relacl,
          pg_catalog.acldefault('r', relation_row.relowner)
        )) AS acl_row
      ) = 11
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
              AND acl_row.privilege_type IN ('SELECT', 'INSERT', 'DELETE'))
           )
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_143_feature_security_seal_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND pg_catalog.left(
        procedure_row.proname::text,
        pg_catalog.char_length('feature_access_heimilisverkin_')
      ) = 'feature_access_heimilisverkin_'
  ) <> 3 OR EXISTS (
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
       OR actual.prorettype <> 'trigger'::pg_catalog.regtype
       OR actual.proretset
       OR actual.lanname <> 'plpgsql'
       OR actual.provolatile <> 'v'
       OR actual.proisstrict
       OR actual.proleakproof
       OR actual.proparallel <> 'u'
       OR NOT actual.prosecdef
       OR actual.pronargdefaults <> 0
       OR pg_catalog.md5(pg_catalog.replace(
         actual.prosrc, E'\r\n', E'\n'
       )) IS DISTINCT FROM expected.body_md5
       OR pg_catalog.cardinality(COALESCE(
         actual.proconfig, ARRAY[]::text[]
       )) <> 1
       OR actual.proconfig[1] NOT IN ('search_path=', 'search_path=""')
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode(COALESCE(
           actual.proacl,
           pg_catalog.acldefault('f', actual.proowner)
         )) AS acl_row
       ) <> 1
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           actual.proacl,
           pg_catalog.acldefault('f', actual.proowner)
         )) AS acl_row
         WHERE acl_row.privilege_type <> 'EXECUTE'
            OR acl_row.grantee <> actual.proowner
            OR acl_row.grantor <> actual.proowner
            OR acl_row.is_grantable
       )
  ) THEN
    RAISE EXCEPTION 'household_chore_143_guard_function_seal_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid =
      'public.feature_access'::pg_catalog.regclass
      AND NOT trigger_row.tgisinternal
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('feature_access_heimilisverkin_insert_guard',
        'feature_access_heimilisverkin_insert_guard', 7, 0),
      ('feature_access_heimilisverkin_update_guard',
        'feature_access_heimilisverkin_update_guard', 19, 2)
    ) AS expected(
      trigger_name, function_name, trigger_type, update_attribute_count
    )
    LEFT JOIN LATERAL (
      SELECT trigger_row.*, function_row.proname AS actual_function_name,
        function_namespace.nspname AS actual_function_schema
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_proc AS function_row
        ON function_row.oid = trigger_row.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace
        ON function_namespace.oid = function_row.pronamespace
      WHERE trigger_row.tgrelid =
        'public.feature_access'::pg_catalog.regclass
        AND trigger_row.tgname = expected.trigger_name
        AND NOT trigger_row.tgisinternal
    ) AS actual ON true
    WHERE actual.oid IS NULL
       OR actual.actual_function_schema <> 'public'
       OR actual.actual_function_name <> expected.function_name
       OR actual.tgtype::integer <> expected.trigger_type
       OR actual.tgenabled <> 'O'
       OR actual.tgconstraint <> 0
       OR actual.tgparentid <> 0
       OR actual.tgdeferrable
       OR actual.tginitdeferred
       OR actual.tgqual IS NOT NULL
       OR actual.tgnargs <> 0
       OR actual.tgoldtable IS NOT NULL
       OR actual.tgnewtable IS NOT NULL
       OR pg_catalog.cardinality(actual.tgattr::smallint[]) <>
         expected.update_attribute_count
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid =
      'public.feature_access'::pg_catalog.regclass
      AND trigger_row.tgname =
        'feature_access_heimilisverkin_update_guard'
      AND (
        SELECT pg_catalog.array_agg(
          update_attribute.attribute_number
          ORDER BY update_attribute.ordinal_position
        )
        FROM pg_catalog.unnest(
          trigger_row.tgattr::smallint[]
        ) WITH ORDINALITY AS update_attribute(
          attribute_number, ordinal_position
        )
      ) = ARRAY[
        (
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = trigger_row.tgrelid
            AND attribute_row.attname = 'feature_key'
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
        ),
        (
          SELECT attribute_row.attnum
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = trigger_row.tgrelid
            AND attribute_row.attname = 'email'
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
        )
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION 'household_chore_143_guard_trigger_seal_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'auth.users'::pg_catalog.regclass
      AND pg_catalog.left(
        trigger_row.tgname::text,
        pg_catalog.char_length(
          'feature_access_heimilisverkin_auth_email_'
        )
      ) = 'feature_access_heimilisverkin_auth_email_'
      AND NOT trigger_row.tgisinternal
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('feature_access_heimilisverkin_auth_email_insert_guard', 7, 0),
      ('feature_access_heimilisverkin_auth_email_update_guard', 19, 1)
    ) AS expected(
      trigger_name, trigger_type, update_attribute_count
    )
    LEFT JOIN LATERAL (
      SELECT trigger_row.*, function_row.proname AS actual_function_name,
        function_namespace.nspname AS actual_function_schema
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_proc AS function_row
        ON function_row.oid = trigger_row.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace
        ON function_namespace.oid = function_row.pronamespace
      WHERE trigger_row.tgrelid = 'auth.users'::pg_catalog.regclass
        AND trigger_row.tgname = expected.trigger_name
        AND NOT trigger_row.tgisinternal
    ) AS actual ON true
    WHERE actual.oid IS NULL
       OR actual.actual_function_schema <> 'public'
       OR actual.actual_function_name <>
         'feature_access_heimilisverkin_auth_email_guard'
       OR actual.tgtype::integer <> expected.trigger_type
       OR actual.tgenabled <> 'O'
       OR actual.tgconstraint <> 0
       OR actual.tgparentid <> 0
       OR actual.tgdeferrable
       OR actual.tginitdeferred
       OR actual.tgqual IS NOT NULL
       OR actual.tgnargs <> 0
       OR actual.tgoldtable IS NOT NULL
       OR actual.tgnewtable IS NOT NULL
       OR pg_catalog.cardinality(actual.tgattr::smallint[]) <>
         expected.update_attribute_count
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'auth.users'::pg_catalog.regclass
      AND trigger_row.tgname =
        'feature_access_heimilisverkin_auth_email_update_guard'
      AND (
        SELECT pg_catalog.array_agg(
          update_attribute.attribute_number
          ORDER BY update_attribute.ordinal_position
        )
        FROM pg_catalog.unnest(
          trigger_row.tgattr::smallint[]
        ) WITH ORDINALITY AS update_attribute(
          attribute_number, ordinal_position
        )
      ) = ARRAY[(
        SELECT attribute_row.attnum
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = trigger_row.tgrelid
          AND attribute_row.attname = 'email'
          AND attribute_row.attnum > 0
          AND NOT attribute_row.attisdropped
      )]::smallint[]
  ) THEN
    RAISE EXCEPTION 'household_chore_143_auth_trigger_seal_failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      (
        SELECT access_row.feature_key, access_row.email,
          access_row.granted_at
        FROM public.feature_access AS access_row
        EXCEPT ALL
        SELECT snapshot_row.feature_key, snapshot_row.email,
          snapshot_row.granted_at
        FROM pg_temp.sql143_feature_access_rows AS snapshot_row
      )
      UNION ALL
      (
        SELECT snapshot_row.feature_key, snapshot_row.email,
          snapshot_row.granted_at
        FROM pg_temp.sql143_feature_access_rows AS snapshot_row
        EXCEPT ALL
        SELECT access_row.feature_key, access_row.email,
          access_row.granted_at
        FROM public.feature_access AS access_row
      )
    ) AS row_difference
  ) OR EXISTS (
    SELECT 1
    FROM public.feature_access AS access_row
    WHERE access_row.feature_key = 'heimilisverkin'
  ) THEN
    RAISE EXCEPTION 'household_chore_143_entitlement_rows_changed';
  END IF;

  SELECT outcome.updated_rows
  INTO STRICT v_updated_rows
  FROM pg_temp.sql143_idea_update_outcome AS outcome;
  IF v_updated_rows NOT IN (0, 1) THEN
    RAISE EXCEPTION 'household_chore_143_idea_update_count_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ideas AS idea_row
    JOIN pg_temp.sql143_idea_protected AS snapshot_row
      ON snapshot_row.id = idea_row.id
    WHERE idea_row.slug = 'fyrsta-vakt-krakkanna'
      AND idea_row.title = 'Verkefnin'
      AND idea_row.short_description =
        'Sameiginlegt yfirlit yfir verkefni, úthlutanir, verklok og stig.'
      AND idea_row.problem_description =
        'Verkefni og ábyrgð dreifast auðveldlega á milli samtala, miða og minnis. Þá verður óljóst hvað þarf að gera, hver tekur verkefnið að sér og hvað er þegar búið.'
      AND idea_row.possible_solution =
        'Með Verkefnunum geturðu stofnað hringi fyrir mismunandi samhengi, skilgreint endurnýtanleg verkefni og stig og haldið utan um úthlutanir, verklok og sögu á einum stað.'
      AND idea_row.category::text = 'Annað'
      AND idea_row.slug IS NOT DISTINCT FROM snapshot_row.slug
      AND idea_row.status IS NOT DISTINCT FROM snapshot_row.status
      AND idea_row.source IS NOT DISTINCT FROM snapshot_row.source
      AND idea_row.votes_count IS NOT DISTINCT FROM snapshot_row.votes_count
      AND idea_row.followers_count IS NOT DISTINCT FROM
        snapshot_row.followers_count
      AND idea_row.is_public IS NOT DISTINCT FROM snapshot_row.is_public
      AND idea_row.is_featured IS NOT DISTINCT FROM snapshot_row.is_featured
      AND idea_row.created_at IS NOT DISTINCT FROM snapshot_row.created_at
      AND (
        (v_updated_rows = 0
          AND idea_row.updated_at IS NOT DISTINCT FROM snapshot_row.updated_at)
        OR (v_updated_rows = 1
          AND idea_row.updated_at IS DISTINCT FROM snapshot_row.updated_at
          AND idea_row.updated_at = pg_catalog.transaction_timestamp())
      )
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public.ideas AS idea_row
    WHERE idea_row.slug = 'fyrsta-vakt-krakkanna'
  ) <> 1 OR EXISTS (
    SELECT 1
    FROM public.ideas AS idea_row
    WHERE idea_row.slug IN ('heimilisverkin', 'verkefnin')
  ) THEN
    RAISE EXCEPTION 'household_chore_143_idea_seal_failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      (
        SELECT current_row.relation_name, current_row.reference_id
        FROM pg_temp.sql143_idea_references_after AS current_row
        EXCEPT ALL
        SELECT snapshot_row.relation_name, snapshot_row.reference_id
        FROM pg_temp.sql143_idea_references AS snapshot_row
      )
      UNION ALL
      (
        SELECT snapshot_row.relation_name, snapshot_row.reference_id
        FROM pg_temp.sql143_idea_references AS snapshot_row
        EXCEPT ALL
        SELECT current_row.relation_name, current_row.reference_id
        FROM pg_temp.sql143_idea_references_after AS current_row
      )
    ) AS reference_difference
  ) THEN
    RAISE EXCEPTION 'household_chore_143_idea_references_changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_temp.sql143_sql142_catalog_digest AS seal_row
    WHERE COALESCE(seal_row.stored_comment ~
      '^teskeid:sql142:catalog-v1:[0-9]{5,8}:[0-9a-f]{64}$', false)
      AND pg_catalog.split_part(seal_row.stored_comment, ':', 4) =
        seal_row.server_version_num
      AND pg_catalog.split_part(seal_row.stored_comment, ':', 5) =
        seal_row.current_digest
  ) THEN
    RAISE EXCEPTION 'household_chore_143_sql142_catalog_changed';
  END IF;
END;
$final_attestation$;

DROP VIEW pg_temp.sql143_sql142_catalog_digest;

COMMIT;
