-- SQL142: private Household Chores circles, typed memberships, assignments,
-- immutable points/history, in-app invitation events, and fail-closed account
-- deletion preparation.
--
-- LOCAL SOURCE ONLY. Stebbi runs SQL manually after an independently reviewed
-- read-only preflight. Codex does not execute this migration.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

DO $preflight$
DECLARE
  v_recent_expression text;
  v_recent_normalized text;
  v_recent_sources text[];
BEGIN
  IF current_user <> 'postgres' AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = current_user
      AND role_row.rolsuper
  ) THEN
    RAISE EXCEPTION 'household_chore_142_executor_invalid';
  END IF;

  IF pg_catalog.current_setting('server_version_num') <> '170006' THEN
    RAISE EXCEPTION 'household_chore_142_server_version_unreviewed:%',
      pg_catalog.current_setting('server_version_num');
  END IF;

  IF pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.relationships') IS NULL
     OR pg_catalog.to_regclass('public.feature_access') IS NULL
     OR pg_catalog.to_regclass('public.recent_events') IS NULL
     OR pg_catalog.to_regprocedure('public.normalize_email_canonical(text)') IS NULL
     OR pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_prepare_account_deletion(uuid)') IS NULL THEN
    RAISE EXCEPTION 'household_chore_142_prerequisite_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
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
    RAISE EXCEPTION 'household_chore_142_prerequisite_column_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_row
    WHERE attribute_row.attrelid = 'public.recent_events'::pg_catalog.regclass
      AND attribute_row.attname = 'id'
      AND attribute_row.attidentity = 'a'
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_row
    JOIN pg_catalog.pg_attrdef AS default_row
      ON default_row.adrelid = attribute_row.attrelid
     AND default_row.adnum = attribute_row.attnum
    WHERE attribute_row.attrelid = 'public.recent_events'::pg_catalog.regclass
      AND attribute_row.attname = 'created_at'
      AND attribute_row.atthasdef
      AND pg_catalog.pg_get_expr(
        default_row.adbin, default_row.adrelid, false
      ) = 'now()'
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
  ) THEN
    RAISE EXCEPTION 'household_chore_142_recent_default_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('auth', 'users', 'id'),
      ('public', 'relationships', 'id')
    ) AS parent_key(schema_name, relation_name, column_name)
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
  ) THEN
    RAISE EXCEPTION 'household_chore_142_parent_key_drift';
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
    RAISE EXCEPTION 'household_chore_142_email_normalizer_drift';
  END IF;

  IF NOT EXISTS (
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
        WHERE dependency_row.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency_row.objid = procedure_row.oid
          AND dependency_row.refclassid =
            'pg_catalog.pg_extension'::pg_catalog.regclass
          AND dependency_row.deptype = 'e'
          AND extension_row.extname = 'pgcrypto'
      )
  ) OR pg_catalog.encode(extensions.digest(
    pg_catalog.decode('', 'hex'), 'sha256'
  ), 'hex') IS DISTINCT FROM
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' THEN
    RAISE EXCEPTION 'household_chore_142_digest_dependency_drift';
  END IF;

  IF NOT EXISTS (
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
  ) THEN
    RAISE EXCEPTION 'household_chore_142_account_deletion_dependency_drift';
  END IF;

  IF NOT EXISTS (
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
  ) THEN
    RAISE EXCEPTION 'household_chore_142_recent_conflict_key_missing';
  END IF;

  IF (
    SELECT pg_catalog.count(*) FILTER (
      WHERE role_row.rolname IN (
        'postgres', 'anon', 'authenticated', 'service_role'
      )
    )
    FROM pg_catalog.pg_roles AS role_row
  ) <> 4 THEN
    RAISE EXCEPTION 'household_chore_142_roles_missing';
  END IF;

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
    RAISE EXCEPTION 'household_chore_142_feature_constraint_drift';
  END IF;

  SELECT pg_catalog.pg_get_expr(
    constraint_row.conbin,
    constraint_row.conrelid,
    false
  )
  INTO v_recent_expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.recent_events'::pg_catalog.regclass
    AND constraint_row.conname = 'recent_events_source_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated;
  SELECT pg_catalog.array_agg(match_row.value[1] ORDER BY match_row.value[1])
  INTO v_recent_sources
  FROM pg_catalog.regexp_matches(
    COALESCE(v_recent_expression, ''),
    '''([^'']+)''',
    'g'
  ) AS match_row(value);
  v_recent_normalized := pg_catalog.lower(pg_catalog.regexp_replace(
    COALESCE(v_recent_expression, ''), '[[:space:]]+', '', 'g'
  ));
  IF v_recent_expression IS NULL
     OR v_recent_sources IS DISTINCT FROM ARRAY[
       'events', 'expenses', 'loans'
     ]::text[]
     OR v_recent_normalized NOT IN (
       'source=any(array[''loans''::text,''expenses''::text,''events''::text])',
       '(source=any(array[''loans''::text,''expenses''::text,''events''::text]))'
     ) THEN
    RAISE EXCEPTION 'household_chore_142_recent_source_drift';
  END IF;

  -- SQL142 is one-shot.  Reject every relation-like object in its dedicated
  -- public namespace, including stale indexes and identity sequences from an
  -- earlier partial/local draft, rather than checking table names alone.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND (
        pg_catalog.left(relation_row.relname::text, 16) =
          'household_chore_'
        OR relation_row.relname =
          'recent_events_household_chore_entity_idx'
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_142_target_relation_exists';
  END IF;

  IF EXISTS (
    SELECT 1
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
  ) THEN
    RAISE EXCEPTION 'household_chore_142_target_type_exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    WHERE NOT trigger_row.tgisinternal
      AND namespace_row.nspname = 'auth'
      AND relation_row.relname = 'users'
      AND trigger_row.tgname = 'household_chore_auth_delete_guard'
  ) THEN
    RAISE EXCEPTION 'household_chore_142_target_exists:function_or_trigger';
  END IF;
END;
$preflight$;

ALTER TABLE public.recent_events
  DROP CONSTRAINT recent_events_source_check;
ALTER TABLE public.recent_events
  ADD CONSTRAINT recent_events_source_check
  CHECK (source IN ('loans', 'expenses', 'events', 'heimilisverkin'));
CREATE INDEX recent_events_household_chore_entity_idx
  ON public.recent_events (entity_type, entity_id, user_id)
  WHERE source = 'heimilisverkin';

CREATE TABLE public.household_chore_circles (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  display_reference text        NOT NULL,
  version           bigint      NOT NULL DEFAULT 1,
  created_by         uuid        NULL REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_circles_name_check CHECK (
    name = pg_catalog.btrim(name)
    AND pg_catalog.char_length(name) BETWEEN 1 AND 120
  ),
  CONSTRAINT household_chore_circles_reference_check CHECK (
    display_reference ~ '^[0-9A-HJKMNP-TV-Z]{8}$'
  ),
  CONSTRAINT household_chore_circles_reference_key UNIQUE (display_reference),
  CONSTRAINT household_chore_circles_version_check CHECK (version > 0),
  CONSTRAINT household_chore_circles_id_key UNIQUE (id)
);

CREATE TABLE public.household_chore_participants (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id             uuid        NOT NULL,
  linked_user_id        uuid        NULL REFERENCES auth.users(id),
  display_name_snapshot text        NULL,
  identity_marker       text        NOT NULL DEFAULT 'current',
  status                text        NOT NULL DEFAULT 'active',
  archive_reason        text        NULL,
  identity_retired_at   timestamptz NULL,
  version               bigint      NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_participants_circle_fk
    FOREIGN KEY (circle_id)
    REFERENCES public.household_chore_circles(id) ON DELETE CASCADE,
  CONSTRAINT household_chore_participants_circle_id_key UNIQUE (circle_id, id),
  CONSTRAINT household_chore_participants_link_key
    UNIQUE (circle_id, linked_user_id, id),
  CONSTRAINT household_chore_participants_label_check CHECK (
    display_name_snapshot IS NULL
    OR (
      display_name_snapshot = pg_catalog.btrim(display_name_snapshot)
      AND pg_catalog.char_length(display_name_snapshot) BETWEEN 1 AND 120
      AND pg_catalog.strpos(display_name_snapshot, '@') = 0
    )
  ),
  CONSTRAINT household_chore_participants_identity_check CHECK (
    ((identity_marker = 'current' AND display_name_snapshot IS NOT NULL
        AND identity_retired_at IS NULL
        AND archive_reason IS DISTINCT FROM 'account_erased')
      OR (identity_marker = 'former_member' AND display_name_snapshot IS NULL
        AND linked_user_id IS NULL AND status = 'archived'
        AND archive_reason = 'account_erased'
        AND identity_retired_at IS NOT NULL)) IS TRUE
  ),
  CONSTRAINT household_chore_participants_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT household_chore_participants_archive_check CHECK (
    ((status = 'active' AND archive_reason IS NULL)
      OR (
        status = 'archived'
        AND archive_reason IN (
          'manual', 'member_left', 'member_removed', 'account_erased'
        )
      )) IS TRUE
  ),
  CONSTRAINT household_chore_participants_retired_check CHECK (
    ((archive_reason = 'account_erased') IS TRUE)
      = (identity_marker = 'former_member')
  ),
  CONSTRAINT household_chore_participants_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX household_chore_participants_active_user_idx
  ON public.household_chore_participants (circle_id, linked_user_id)
  WHERE linked_user_id IS NOT NULL;

CREATE TABLE public.household_chore_invitations (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id                uuid        NOT NULL,
  invitee_user_id          uuid        NULL REFERENCES auth.users(id),
  invited_by_user_id       uuid        NULL REFERENCES auth.users(id),
  relationship_id          uuid        NULL
    REFERENCES public.relationships(id) ON DELETE SET NULL,
  requested_type           text        NOT NULL,
  inviter_label_snapshot   text        NULL,
  status                   text        NOT NULL DEFAULT 'pending',
  version                  bigint      NOT NULL DEFAULT 1,
  expires_at               timestamptz NOT NULL,
  responded_at             timestamptz NULL,
  identity_retired_at      timestamptz NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_invitations_circle_fk
    FOREIGN KEY (circle_id)
    REFERENCES public.household_chore_circles(id) ON DELETE CASCADE,
  CONSTRAINT household_chore_invitations_circle_id_key UNIQUE (circle_id, id),
  CONSTRAINT household_chore_invitations_proof_key
    UNIQUE (circle_id, invitee_user_id, requested_type, id),
  CONSTRAINT household_chore_invitations_type_check
    CHECK (requested_type IN ('member', 'child')),
  CONSTRAINT household_chore_invitations_label_check CHECK (
    inviter_label_snapshot IS NULL
    OR (
      inviter_label_snapshot = pg_catalog.btrim(inviter_label_snapshot)
      AND pg_catalog.char_length(inviter_label_snapshot) BETWEEN 1 AND 120
      AND pg_catalog.strpos(inviter_label_snapshot, '@') = 0
    )
  ),
  CONSTRAINT household_chore_invitations_status_check CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')
  ),
  CONSTRAINT household_chore_invitations_lifecycle_check CHECK (
    (status = 'pending' AND responded_at IS NULL
      AND invitee_user_id IS NOT NULL AND invited_by_user_id IS NOT NULL)
    OR (status <> 'pending' AND responded_at IS NOT NULL)
  ),
  CONSTRAINT household_chore_invitations_identity_check CHECK (
    (invitee_user_id IS NOT NULL AND identity_retired_at IS NULL)
    OR (invitee_user_id IS NULL AND status <> 'pending'
      AND identity_retired_at IS NOT NULL)
  ),
  CONSTRAINT household_chore_invitations_expiry_check
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days'),
  CONSTRAINT household_chore_invitations_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX household_chore_invitations_pending_user_idx
  ON public.household_chore_invitations (circle_id, invitee_user_id)
  WHERE status = 'pending' AND invitee_user_id IS NOT NULL;
CREATE INDEX household_chore_invitations_invitee_idx
  ON public.household_chore_invitations
  (invitee_user_id, status, expires_at, id)
  WHERE invitee_user_id IS NOT NULL;
CREATE INDEX household_chore_invitations_expiry_idx
  ON public.household_chore_invitations (status, expires_at, id);
CREATE INDEX household_chore_invitations_circle_expiry_idx
  ON public.household_chore_invitations
  (circle_id, status, expires_at, id);
CREATE INDEX household_chore_invitations_inviter_idx
  ON public.household_chore_invitations (invited_by_user_id, status, id)
  WHERE invited_by_user_id IS NOT NULL;
CREATE INDEX household_chore_invitations_relationship_idx
  ON public.household_chore_invitations (relationship_id)
  WHERE relationship_id IS NOT NULL;

CREATE TABLE public.household_chore_memberships (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id                uuid        NOT NULL,
  user_id                  uuid        NULL REFERENCES auth.users(id),
  participant_id           uuid        NOT NULL,
  initial_type             text        NOT NULL,
  membership_type          text        NOT NULL,
  origin                   text        NOT NULL,
  accepted_invitation_id   uuid        NULL,
  status                   text        NOT NULL DEFAULT 'active',
  version                  bigint      NOT NULL DEFAULT 1,
  joined_at                timestamptz NOT NULL DEFAULT now(),
  ended_at                 timestamptz NULL,
  identity_retired_at      timestamptz NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_memberships_circle_fk
    FOREIGN KEY (circle_id)
    REFERENCES public.household_chore_circles(id) ON DELETE CASCADE,
  CONSTRAINT household_chore_memberships_participant_fk
    FOREIGN KEY (circle_id, user_id, participant_id)
    REFERENCES public.household_chore_participants(circle_id, linked_user_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT household_chore_memberships_invitation_fk
    FOREIGN KEY (circle_id, user_id, initial_type, accepted_invitation_id)
    REFERENCES public.household_chore_invitations(
      circle_id, invitee_user_id, requested_type, id
    )
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT household_chore_memberships_circle_id_key UNIQUE (circle_id, id),
  CONSTRAINT household_chore_memberships_invitation_key
    UNIQUE (accepted_invitation_id),
  CONSTRAINT household_chore_memberships_type_check CHECK (
    initial_type IN ('member', 'child')
    AND membership_type IN ('member', 'child')
  ),
  CONSTRAINT household_chore_memberships_origin_check CHECK (
    (origin = 'creator' AND accepted_invitation_id IS NULL
      AND initial_type = 'member')
    OR (origin = 'invitation' AND accepted_invitation_id IS NOT NULL)
  ),
  CONSTRAINT household_chore_memberships_status_check
    CHECK (status IN ('active', 'left', 'removed')),
  CONSTRAINT household_chore_memberships_lifecycle_check CHECK (
    (status = 'active' AND user_id IS NOT NULL AND ended_at IS NULL
      AND identity_retired_at IS NULL)
    OR (status <> 'active' AND ended_at IS NOT NULL
      AND ((user_id IS NOT NULL AND identity_retired_at IS NULL)
        OR (user_id IS NULL AND identity_retired_at IS NOT NULL)))
  ),
  CONSTRAINT household_chore_memberships_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX household_chore_memberships_active_user_idx
  ON public.household_chore_memberships (circle_id, user_id)
  WHERE status = 'active' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX household_chore_memberships_creator_idx
  ON public.household_chore_memberships (circle_id)
  WHERE origin = 'creator';
CREATE INDEX household_chore_memberships_user_idx
  ON public.household_chore_memberships (user_id, status, circle_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX household_chore_memberships_participant_idx
  ON public.household_chore_memberships (circle_id, participant_id, id);
CREATE INDEX household_chore_circles_created_by_idx
  ON public.household_chore_circles (created_by)
  WHERE created_by IS NOT NULL;
CREATE INDEX household_chore_participants_linked_user_idx
  ON public.household_chore_participants (linked_user_id, circle_id)
  WHERE linked_user_id IS NOT NULL;

CREATE TABLE public.household_chore_membership_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id             uuid        NOT NULL,
  membership_id         uuid        NULL,
  subject_user_id       uuid        NULL REFERENCES auth.users(id),
  actor_user_id         uuid        NULL REFERENCES auth.users(id),
  actor_identity_marker text        NOT NULL DEFAULT 'current',
  event_type            text        NOT NULL,
  old_type              text        NULL,
  new_type              text        NULL,
  actor_label_snapshot  text        NULL,
  occurred_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_membership_events_circle_fk
    FOREIGN KEY (circle_id)
    REFERENCES public.household_chore_circles(id) ON DELETE CASCADE,
  CONSTRAINT household_chore_membership_events_membership_fk
    FOREIGN KEY (circle_id, membership_id)
    REFERENCES public.household_chore_memberships(circle_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT household_chore_membership_events_type_check CHECK (
    event_type IN ('type_changed', 'removed', 'left')
  ),
  CONSTRAINT household_chore_membership_events_shape_check CHECK (
    ((event_type = 'type_changed' AND old_type IN ('member', 'child')
        AND new_type IN ('member', 'child') AND old_type <> new_type)
      OR (event_type IN ('removed', 'left')
        AND old_type IN ('member', 'child') AND new_type IS NULL)) IS TRUE
  ),
  CONSTRAINT household_chore_membership_events_label_check CHECK (
    (actor_identity_marker = 'current' AND actor_user_id IS NOT NULL
      AND actor_label_snapshot IS NOT NULL
      AND pg_catalog.char_length(actor_label_snapshot) BETWEEN 1 AND 120
      AND pg_catalog.strpos(actor_label_snapshot, '@') = 0)
    OR (actor_identity_marker = 'former_member'
      AND actor_user_id IS NULL AND actor_label_snapshot IS NULL)
    OR (actor_identity_marker = 'system'
      AND actor_user_id IS NULL AND actor_label_snapshot IS NULL)
  )
);

CREATE INDEX household_chore_membership_events_subject_idx
  ON public.household_chore_membership_events
  (subject_user_id, occurred_at DESC, id DESC)
  WHERE subject_user_id IS NOT NULL;
CREATE INDEX household_chore_membership_events_actor_idx
  ON public.household_chore_membership_events (actor_user_id, occurred_at, id)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX household_chore_membership_events_membership_idx
  ON public.household_chore_membership_events
  (circle_id, membership_id, occurred_at, id)
  WHERE membership_id IS NOT NULL;

CREATE TABLE public.household_chore_definitions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id    uuid        NOT NULL,
  title        text        NOT NULL,
  description  text        NULL,
  materials    text        NULL,
  status       text        NOT NULL DEFAULT 'active',
  version      bigint      NOT NULL DEFAULT 1,
  created_by   uuid        NULL REFERENCES auth.users(id),
  archived_at  timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_definitions_circle_fk
    FOREIGN KEY (circle_id)
    REFERENCES public.household_chore_circles(id) ON DELETE CASCADE,
  CONSTRAINT household_chore_definitions_circle_id_key UNIQUE (circle_id, id),
  CONSTRAINT household_chore_definitions_title_check CHECK (
    title = pg_catalog.btrim(title)
    AND pg_catalog.char_length(title) BETWEEN 1 AND 120
  ),
  CONSTRAINT household_chore_definitions_description_check
    CHECK (description IS NULL OR pg_catalog.char_length(description) <= 2000),
  CONSTRAINT household_chore_definitions_materials_check
    CHECK (materials IS NULL OR pg_catalog.char_length(materials) <= 4000),
  CONSTRAINT household_chore_definitions_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT household_chore_definitions_archive_check CHECK (
    (status = 'active' AND archived_at IS NULL)
    OR (status = 'archived' AND archived_at IS NOT NULL)
  ),
  CONSTRAINT household_chore_definitions_version_check CHECK (version > 0)
);

CREATE TABLE public.household_chore_definition_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id     uuid        NOT NULL,
  definition_id uuid        NOT NULL,
  actor_user_id uuid        NULL REFERENCES auth.users(id),
  actor_identity_marker text NOT NULL DEFAULT 'current',
  event_type    text        NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_definition_events_definition_fk
    FOREIGN KEY (circle_id, definition_id)
    REFERENCES public.household_chore_definitions(circle_id, id)
    ON DELETE CASCADE,
  CONSTRAINT household_chore_definition_events_type_check CHECK (
    event_type IN ('created', 'updated', 'archived', 'reactivated')
  ),
  CONSTRAINT household_chore_definition_events_actor_check CHECK (
    (actor_identity_marker = 'current' AND actor_user_id IS NOT NULL)
    OR (actor_identity_marker IN ('former_member', 'system')
      AND actor_user_id IS NULL)
  )
);

CREATE INDEX household_chore_definitions_created_by_idx
  ON public.household_chore_definitions (created_by)
  WHERE created_by IS NOT NULL;
CREATE INDEX household_chore_definition_events_actor_idx
  ON public.household_chore_definition_events (actor_user_id, occurred_at, id)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX household_chore_definition_events_definition_idx
  ON public.household_chore_definition_events
  (circle_id, definition_id, occurred_at DESC, id DESC);

CREATE TABLE public.household_chore_participant_values (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id      uuid        NOT NULL,
  definition_id  uuid        NOT NULL,
  participant_id uuid        NOT NULL,
  points         integer     NOT NULL,
  status         text        NOT NULL DEFAULT 'active',
  version        bigint      NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_values_circle_fk
    FOREIGN KEY (circle_id)
    REFERENCES public.household_chore_circles(id) ON DELETE CASCADE,
  CONSTRAINT household_chore_values_definition_fk
    FOREIGN KEY (circle_id, definition_id)
    REFERENCES public.household_chore_definitions(circle_id, id),
  CONSTRAINT household_chore_values_participant_fk
    FOREIGN KEY (circle_id, participant_id)
    REFERENCES public.household_chore_participants(circle_id, id),
  CONSTRAINT household_chore_values_circle_pair_key
    UNIQUE (circle_id, definition_id, participant_id),
  CONSTRAINT household_chore_values_circle_id_key UNIQUE (circle_id, id),
  CONSTRAINT household_chore_values_points_check CHECK (points BETWEEN 1 AND 100),
  CONSTRAINT household_chore_values_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT household_chore_values_version_check CHECK (version > 0)
);

CREATE INDEX household_chore_values_participant_idx
  ON public.household_chore_participant_values
  (circle_id, participant_id, definition_id);

CREATE TABLE public.household_chore_assignments (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id                   uuid        NOT NULL,
  definition_id               uuid        NOT NULL,
  participant_id              uuid        NOT NULL,
  repeated_from_assignment_id uuid        NULL,
  definition_version_snapshot bigint      NOT NULL,
  title_snapshot              text        NOT NULL,
  description_snapshot        text        NULL,
  materials_snapshot          text        NULL,
  participant_label_snapshot  text        NULL,
  participant_identity_marker text        NOT NULL DEFAULT 'current',
  points_snapshot             integer     NOT NULL,
  origin                      text        NOT NULL,
  status                      text        NOT NULL DEFAULT 'open',
  completion_sequence         integer     NOT NULL DEFAULT 0,
  assigned_by_user_id         uuid        NULL REFERENCES auth.users(id),
  completed_by_user_id        uuid        NULL REFERENCES auth.users(id),
  completed_at                timestamptz NULL,
  cancelled_at                timestamptz NULL,
  cancellation_reason         text        NULL,
  version                     bigint      NOT NULL DEFAULT 1,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_assignments_circle_fk
    FOREIGN KEY (circle_id)
    REFERENCES public.household_chore_circles(id) ON DELETE CASCADE,
  CONSTRAINT household_chore_assignments_definition_fk
    FOREIGN KEY (circle_id, definition_id)
    REFERENCES public.household_chore_definitions(circle_id, id),
  CONSTRAINT household_chore_assignments_participant_fk
    FOREIGN KEY (circle_id, participant_id)
    REFERENCES public.household_chore_participants(circle_id, id),
  CONSTRAINT household_chore_assignments_repeat_fk
    FOREIGN KEY (circle_id, repeated_from_assignment_id)
    REFERENCES public.household_chore_assignments(circle_id, id),
  CONSTRAINT household_chore_assignments_circle_id_key UNIQUE (circle_id, id),
  CONSTRAINT household_chore_assignments_title_check CHECK (
    pg_catalog.char_length(title_snapshot) BETWEEN 1 AND 120
  ),
  CONSTRAINT household_chore_assignments_description_check CHECK (
    description_snapshot IS NULL
    OR pg_catalog.char_length(description_snapshot) <= 2000
  ),
  CONSTRAINT household_chore_assignments_materials_check CHECK (
    materials_snapshot IS NULL
    OR pg_catalog.char_length(materials_snapshot) <= 4000
  ),
  CONSTRAINT household_chore_assignments_label_check CHECK (
    (participant_identity_marker = 'current'
      AND participant_label_snapshot IS NOT NULL
      AND pg_catalog.char_length(participant_label_snapshot) BETWEEN 1 AND 120
      AND pg_catalog.strpos(participant_label_snapshot, '@') = 0)
    OR (participant_identity_marker = 'former_member'
      AND participant_label_snapshot IS NULL)
  ),
  CONSTRAINT household_chore_assignments_points_check
    CHECK (points_snapshot BETWEEN 1 AND 100),
  CONSTRAINT household_chore_assignments_definition_version_check
    CHECK (definition_version_snapshot > 0),
  CONSTRAINT household_chore_assignments_origin_check
    CHECK (
      (origin IN ('member_assigned', 'self_assigned')
        AND repeated_from_assignment_id IS NULL)
      OR (origin = 'member_repeated'
        AND repeated_from_assignment_id IS NOT NULL)
    ),
  CONSTRAINT household_chore_assignments_status_check
    CHECK (status IN ('open', 'completed', 'cancelled')),
  CONSTRAINT household_chore_assignments_completion_check CHECK (
    (status = 'open' AND completed_at IS NULL AND cancelled_at IS NULL
      AND cancellation_reason IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL
      AND cancelled_at IS NULL AND cancellation_reason IS NULL
      AND completion_sequence > 0)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL
      AND cancellation_reason IS NOT NULL)
  ),
  CONSTRAINT household_chore_assignments_sequence_check
    CHECK (completion_sequence >= 0),
  CONSTRAINT household_chore_assignments_cancel_reason_check CHECK (
    cancellation_reason IS NULL
    OR cancellation_reason IN (
      'member_cancelled', 'child_cancelled', 'participant_archived',
      'member_left', 'member_removed', 'account_erased',
      'undo_not_reopened', 'cap_not_reopened'
    )
  ),
  CONSTRAINT household_chore_assignments_version_check CHECK (version > 0)
);

CREATE INDEX household_chore_assignments_circle_open_idx
  ON public.household_chore_assignments (circle_id, created_at, id)
  WHERE status = 'open';
CREATE INDEX household_chore_assignments_participant_open_idx
  ON public.household_chore_assignments
  (circle_id, participant_id, origin, created_at, id)
  WHERE status = 'open';
CREATE INDEX household_chore_assignments_definition_idx
  ON public.household_chore_assignments
  (circle_id, definition_id, created_at DESC, id DESC);
CREATE INDEX household_chore_assignments_participant_idx
  ON public.household_chore_assignments
  (circle_id, participant_id, updated_at DESC, id DESC);
CREATE INDEX household_chore_assignments_repeat_idx
  ON public.household_chore_assignments
  (circle_id, repeated_from_assignment_id)
  WHERE repeated_from_assignment_id IS NOT NULL;
CREATE INDEX household_chore_assignments_recent_idx
  ON public.household_chore_assignments
  (circle_id, updated_at DESC, id DESC)
  WHERE status <> 'open';
CREATE INDEX household_chore_assignments_assigned_by_idx
  ON public.household_chore_assignments (assigned_by_user_id, circle_id)
  WHERE assigned_by_user_id IS NOT NULL;
CREATE INDEX household_chore_assignments_completed_by_idx
  ON public.household_chore_assignments (completed_by_user_id, circle_id)
  WHERE completed_by_user_id IS NOT NULL;

CREATE TABLE public.household_chore_assignment_events (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id                   uuid        NOT NULL,
  assignment_id               uuid        NOT NULL,
  definition_id               uuid        NOT NULL,
  participant_id              uuid        NOT NULL,
  event_type                  text        NOT NULL,
  status_after                text        NOT NULL,
  participant_label_snapshot  text        NULL,
  participant_identity_marker text        NOT NULL DEFAULT 'current',
  assignment_origin           text        NOT NULL,
  snapshot_points             integer     NOT NULL,
  actor_user_id               uuid        NULL REFERENCES auth.users(id),
  actor_label_snapshot        text        NULL,
  actor_identity_marker       text        NOT NULL DEFAULT 'current',
  completion_sequence         integer     NULL,
  points_delta                integer     NULL,
  cancellation_reason         text        NULL,
  reopen_outcome              text        NULL,
  occurred_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_events_assignment_fk
    FOREIGN KEY (circle_id, assignment_id)
    REFERENCES public.household_chore_assignments(circle_id, id)
    ON DELETE CASCADE,
  CONSTRAINT household_chore_events_definition_fk
    FOREIGN KEY (circle_id, definition_id)
    REFERENCES public.household_chore_definitions(circle_id, id),
  CONSTRAINT household_chore_events_participant_fk
    FOREIGN KEY (circle_id, participant_id)
    REFERENCES public.household_chore_participants(circle_id, id),
  CONSTRAINT household_chore_events_type_check CHECK (
    event_type IN (
      'created', 'completed', 'recompleted', 'cancelled',
      'completion_reversed'
    )
  ),
  CONSTRAINT household_chore_events_status_check
    CHECK (status_after IN ('open', 'completed', 'cancelled')),
  CONSTRAINT household_chore_events_origin_check
    CHECK (assignment_origin IN (
      'member_assigned', 'self_assigned', 'member_repeated'
    )),
  CONSTRAINT household_chore_events_points_check
    CHECK (snapshot_points BETWEEN 1 AND 100),
  CONSTRAINT household_chore_events_participant_label_check CHECK (
    (participant_identity_marker = 'current'
      AND participant_label_snapshot IS NOT NULL
      AND pg_catalog.char_length(participant_label_snapshot) BETWEEN 1 AND 120
      AND pg_catalog.strpos(participant_label_snapshot, '@') = 0)
    OR (participant_identity_marker = 'former_member'
      AND participant_label_snapshot IS NULL)
  ),
  CONSTRAINT household_chore_events_actor_label_check CHECK (
    (actor_identity_marker = 'current'
      AND actor_user_id IS NOT NULL AND actor_label_snapshot IS NOT NULL
      AND pg_catalog.char_length(actor_label_snapshot) BETWEEN 1 AND 120
      AND pg_catalog.strpos(actor_label_snapshot, '@') = 0)
    OR (actor_identity_marker = 'former_member'
      AND actor_user_id IS NULL AND actor_label_snapshot IS NULL)
    OR (actor_identity_marker = 'system'
      AND actor_user_id IS NULL AND actor_label_snapshot IS NULL)
  ),
  CONSTRAINT household_chore_events_shape_check CHECK (
    ((event_type = 'created' AND completion_sequence IS NULL
        AND points_delta IS NULL AND cancellation_reason IS NULL
        AND reopen_outcome IS NULL AND status_after = 'open')
      OR (event_type IN ('completed', 'recompleted')
        AND completion_sequence IS NOT NULL AND completion_sequence > 0
        AND points_delta = snapshot_points AND cancellation_reason IS NULL
        AND reopen_outcome IS NULL AND status_after = 'completed')
      OR (event_type = 'cancelled' AND completion_sequence IS NULL
        AND points_delta IS NULL AND cancellation_reason IS NOT NULL
        AND reopen_outcome IS NULL AND status_after = 'cancelled')
      OR (event_type = 'completion_reversed'
        AND completion_sequence IS NOT NULL AND completion_sequence > 0
        AND points_delta = -snapshot_points AND cancellation_reason IS NULL
        AND reopen_outcome IN ('open', 'cancelled')
        AND status_after = reopen_outcome)) IS TRUE
  )
);

CREATE INDEX household_chore_events_assignment_idx
  ON public.household_chore_assignment_events
  (circle_id, assignment_id, occurred_at DESC, id DESC);
CREATE INDEX household_chore_events_definition_idx
  ON public.household_chore_assignment_events
  (circle_id, definition_id, occurred_at DESC, id DESC);
CREATE INDEX household_chore_events_circle_recent_idx
  ON public.household_chore_assignment_events
  (circle_id, occurred_at DESC, id DESC);
CREATE INDEX household_chore_events_actor_idx
  ON public.household_chore_assignment_events (actor_user_id, occurred_at, id)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX household_chore_events_participant_idx
  ON public.household_chore_assignment_events
  (circle_id, participant_id, occurred_at DESC, id DESC);

CREATE TABLE public.household_chore_point_entries (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id           uuid        NOT NULL,
  assignment_id       uuid        NOT NULL,
  participant_id      uuid        NOT NULL,
  entry_kind          text        NOT NULL,
  completion_sequence integer     NOT NULL,
  points_delta        integer     NOT NULL,
  reverses_entry_id   uuid        NULL,
  actor_user_id       uuid        NULL REFERENCES auth.users(id),
  actor_identity_marker text      NOT NULL DEFAULT 'current',
  occurred_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_points_assignment_fk
    FOREIGN KEY (circle_id, assignment_id)
    REFERENCES public.household_chore_assignments(circle_id, id)
    ON DELETE CASCADE,
  CONSTRAINT household_chore_points_participant_fk
    FOREIGN KEY (circle_id, participant_id)
    REFERENCES public.household_chore_participants(circle_id, id),
  CONSTRAINT household_chore_points_circle_id_key UNIQUE (circle_id, id),
  CONSTRAINT household_chore_points_reversal_fk
    FOREIGN KEY (circle_id, reverses_entry_id)
    REFERENCES public.household_chore_point_entries(circle_id, id),
  CONSTRAINT household_chore_points_kind_check
    CHECK (entry_kind IN ('earned', 'reversal')),
  CONSTRAINT household_chore_points_shape_check CHECK (
    (entry_kind = 'earned' AND points_delta > 0 AND reverses_entry_id IS NULL)
    OR (entry_kind = 'reversal' AND points_delta < 0
      AND reverses_entry_id IS NOT NULL)
  ),
  CONSTRAINT household_chore_points_sequence_check
    CHECK (completion_sequence > 0),
  CONSTRAINT household_chore_points_actor_check CHECK (
    (actor_identity_marker = 'current' AND actor_user_id IS NOT NULL)
    OR (actor_identity_marker IN ('former_member', 'system')
      AND actor_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX household_chore_points_earned_idx
  ON public.household_chore_point_entries
  (circle_id, assignment_id, completion_sequence)
  WHERE entry_kind = 'earned';
CREATE UNIQUE INDEX household_chore_points_reversal_idx
  ON public.household_chore_point_entries (reverses_entry_id)
  WHERE entry_kind = 'reversal';
CREATE INDEX household_chore_points_assignment_idx
  ON public.household_chore_point_entries
  (circle_id, assignment_id, occurred_at DESC, id DESC);
CREATE INDEX household_chore_points_participant_idx
  ON public.household_chore_point_entries
  (circle_id, participant_id, occurred_at DESC, id DESC);
CREATE INDEX household_chore_points_actor_idx
  ON public.household_chore_point_entries (actor_user_id, occurred_at, id)
  WHERE actor_user_id IS NOT NULL;

CREATE TABLE public.household_chore_mutation_requests (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id           uuid        NOT NULL REFERENCES auth.users(id),
  request_id              uuid        NOT NULL,
  operation               text        NOT NULL,
  fingerprint             bytea       NOT NULL,
  resolved_target_user_id uuid        NULL REFERENCES auth.users(id),
  status                  text        NOT NULL DEFAULT 'pending',
  result                  jsonb       NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz NULL,

  CONSTRAINT household_chore_requests_actor_request_key
    UNIQUE (actor_user_id, request_id),
  CONSTRAINT household_chore_requests_operation_check CHECK (
    pg_catalog.char_length(operation) BETWEEN 1 AND 80
  ),
  CONSTRAINT household_chore_requests_fingerprint_check
    CHECK (pg_catalog.octet_length(fingerprint) = 32),
  CONSTRAINT household_chore_requests_status_check
    CHECK (status IN ('pending', 'completed')),
  CONSTRAINT household_chore_requests_result_check CHECK (
    (status = 'pending' AND result IS NULL AND completed_at IS NULL)
    OR (status = 'completed' AND result IS NOT NULL
      AND pg_catalog.jsonb_typeof(result) = 'object'
      AND pg_catalog.octet_length(result::text) <= 8192
      AND completed_at IS NOT NULL)
  )
);

CREATE INDEX household_chore_requests_target_idx
  ON public.household_chore_mutation_requests (resolved_target_user_id)
  WHERE resolved_target_user_id IS NOT NULL;

CREATE TABLE public.household_chore_rate_events (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rate_kind      text        NOT NULL,
  actor_user_id  uuid        NOT NULL REFERENCES auth.users(id),
  circle_id      uuid        NOT NULL,
  target_user_id uuid        NULL REFERENCES auth.users(id),
  participant_id uuid        NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_rate_events_circle_fk
    FOREIGN KEY (circle_id)
    REFERENCES public.household_chore_circles(id) ON DELETE CASCADE,
  CONSTRAINT household_chore_rate_events_participant_fk
    FOREIGN KEY (circle_id, participant_id)
    REFERENCES public.household_chore_participants(circle_id, id),
  CONSTRAINT household_chore_rate_events_kind_check
    CHECK (rate_kind IN (
      'invite_created', 'invite_declined', 'self_assign_created'
    )),
  CONSTRAINT household_chore_rate_events_shape_check CHECK (
    (rate_kind IN ('invite_created', 'invite_declined')
      AND target_user_id IS NOT NULL
      AND participant_id IS NULL)
    OR (rate_kind = 'self_assign_created' AND participant_id IS NOT NULL
      AND target_user_id IS NULL)
  )
);

CREATE INDEX household_chore_rate_invite_actor_idx
  ON public.household_chore_rate_events
  (actor_user_id, occurred_at, id)
  WHERE rate_kind = 'invite_created';
CREATE INDEX household_chore_rate_invite_pair_idx
  ON public.household_chore_rate_events
  (circle_id, target_user_id, occurred_at, id)
  WHERE rate_kind IN ('invite_created', 'invite_declined');
CREATE INDEX household_chore_rate_self_idx
  ON public.household_chore_rate_events
  (circle_id, participant_id, occurred_at, id)
  WHERE rate_kind = 'self_assign_created';
CREATE INDEX household_chore_rate_target_idx
  ON public.household_chore_rate_events (target_user_id, occurred_at, id)
  WHERE target_user_id IS NOT NULL;
CREATE INDEX household_chore_rate_actor_all_idx
  ON public.household_chore_rate_events (actor_user_id, occurred_at, id);

CREATE TABLE public.household_chore_deletion_markers (
  user_id          uuid        PRIMARY KEY,
  marker_token     uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  canonical_email  text        NULL,
  status           text        NOT NULL DEFAULT 'preparing',
  created_at       timestamptz NOT NULL DEFAULT now(),
  prepared_at      timestamptz NULL,

  CONSTRAINT household_chore_deletion_markers_status_check CHECK (
    (status = 'preparing' AND prepared_at IS NULL)
    OR (status = 'prepared' AND prepared_at IS NOT NULL)
  ),
  CONSTRAINT household_chore_deletion_markers_email_check CHECK (
    canonical_email IS NULL
    OR (
      canonical_email = pg_catalog.lower(pg_catalog.btrim(canonical_email))
      AND pg_catalog.char_length(canonical_email) BETWEEN 3 AND 320
    )
  )
);

CREATE TABLE public.household_chore_delete_authorizations (
  circle_id           uuid        PRIMARY KEY,
  authorization_kind  text        NOT NULL,
  actor_user_id       uuid        NOT NULL REFERENCES auth.users(id),
  request_id          uuid        NULL,
  marker_token        uuid        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_delete_auth_kind_check CHECK (
    (authorization_kind = 'request'
      AND request_id IS NOT NULL AND marker_token IS NULL)
    OR (authorization_kind = 'account_deletion'
      AND request_id IS NULL AND marker_token IS NOT NULL)
  )
);

CREATE INDEX household_chore_delete_auth_actor_idx
  ON public.household_chore_delete_authorizations (actor_user_id);

CREATE TABLE public.household_chore_delete_tombstones (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid        NULL REFERENCES auth.users(id),
  request_id     uuid        NOT NULL,
  fingerprint    bytea       NOT NULL,
  result         jsonb       NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_delete_tombstones_actor_key
    UNIQUE (actor_user_id, request_id),
  CONSTRAINT household_chore_delete_tombstones_fingerprint_check
    CHECK (pg_catalog.octet_length(fingerprint) = 32),
  CONSTRAINT household_chore_delete_tombstones_result_check CHECK (
    pg_catalog.jsonb_typeof(result) = 'object'
    AND pg_catalog.octet_length(result::text) <= 8192
  )
);

CREATE TABLE public.household_chore_type_authorizations (
  authorization_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id        uuid        NOT NULL,
  membership_id    uuid        NOT NULL,
  actor_user_id    uuid        NOT NULL REFERENCES auth.users(id),
  request_id       uuid        NOT NULL,
  old_type         text        NOT NULL,
  new_type         text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT household_chore_type_auth_membership_fk
    FOREIGN KEY (circle_id, membership_id)
    REFERENCES public.household_chore_memberships(circle_id, id)
    ON DELETE CASCADE,
  CONSTRAINT household_chore_type_auth_request_key
    UNIQUE (membership_id, request_id),
  CONSTRAINT household_chore_type_auth_shape_check CHECK (
    old_type IN ('member', 'child') AND new_type IN ('member', 'child')
    AND old_type <> new_type
  )
);

CREATE INDEX household_chore_type_auth_actor_idx
  ON public.household_chore_type_authorizations (actor_user_id, created_at)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX household_chore_type_auth_membership_idx
  ON public.household_chore_type_authorizations (circle_id, membership_id);

DO $private_relations$
DECLARE
  v_relation text;
BEGIN
  FOREACH v_relation IN ARRAY ARRAY[
    'household_chore_circles',
    'household_chore_participants',
    'household_chore_invitations',
    'household_chore_memberships',
    'household_chore_membership_events',
    'household_chore_definitions',
    'household_chore_definition_events',
    'household_chore_participant_values',
    'household_chore_assignments',
    'household_chore_assignment_events',
    'household_chore_point_entries',
    'household_chore_mutation_requests',
    'household_chore_rate_events',
    'household_chore_deletion_markers',
    'household_chore_delete_authorizations',
    'household_chore_delete_tombstones',
    'household_chore_type_authorizations'
  ]::text[] LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I OWNER TO postgres',
      v_relation
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      v_relation
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
      v_relation
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      v_relation
    );
  END LOOP;

  REVOKE ALL ON SEQUENCE public.household_chore_rate_events_id_seq
    FROM PUBLIC, anon, authenticated, service_role;
END;
$private_relations$;

CREATE OR REPLACE FUNCTION public.household_chore_private_lock_user(
  p_user_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9601)
  );
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_fingerprint(
  p_canonical_input jsonb
)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT extensions.digest(
    pg_catalog.convert_to(p_canonical_input::text, 'UTF8'),
    'sha256'
  );
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_result(
  p_ok boolean,
  p_code text,
  p_request_id uuid,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'ok', p_ok,
    'code', p_code,
    'request_id', p_request_id,
    'data', COALESCE(p_data, '{}'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_read_result(
  p_ok boolean,
  p_code text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'ok', p_ok,
    'code', p_code,
    'data', COALESCE(p_data, '{}'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_safe_user_label(
  p_user_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN candidate.label IS NULL
      OR candidate.label = ''
      OR pg_catalog.strpos(candidate.label, '@') > 0
      OR candidate.label ~ '[[:cntrl:]]'
      OR candidate.label
        ~ U&'[\0080-\009F\061C\200E\200F\202A-\202E\2066-\2069]'
    THEN 'Teskeiðarnotandi'
    ELSE pg_catalog.left(candidate.label, 120)
  END
  FROM (
    SELECT NULLIF(pg_catalog.btrim(profile_row.display_name), '') AS label
    FROM public.profiles AS profile_row
    WHERE profile_row.id = p_user_id
  ) AS candidate
  UNION ALL
  SELECT 'Teskeiðarnotandi'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile_row
    WHERE profile_row.id = p_user_id
  )
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_is_entitled(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM auth.users AS account
    JOIN public.feature_access AS access_row
      ON public.normalize_email_canonical(access_row.email)
       = public.normalize_email_canonical(account.email)
    WHERE account.id = p_user_id
      AND account.email_confirmed_at IS NOT NULL
      AND access_row.feature_key = 'heimilisverkin'
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_actor_ready(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM auth.users AS account
      WHERE account.id = p_user_id
    )
    AND public.household_chore_private_is_entitled(p_user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.household_chore_deletion_markers AS marker_row
      WHERE marker_row.user_id = p_user_id
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_begin_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_operation text,
  p_fingerprint bytea,
  p_resolved_target_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request public.household_chore_mutation_requests%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL
     OR p_operation IS NULL
     OR pg_catalog.char_length(p_operation) NOT BETWEEN 1 AND 80
     OR p_fingerprint IS NULL
     OR pg_catalog.octet_length(p_fingerprint) <> 32 THEN
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id, '{}'::jsonb
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_delete_tombstones AS tombstone_row
    WHERE tombstone_row.actor_user_id = p_actor_id
      AND tombstone_row.request_id = p_request_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id, '{}'::jsonb
    );
  END IF;

  SELECT request_row.*
  INTO v_request
  FROM public.household_chore_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_request.operation IS DISTINCT FROM p_operation
       OR v_request.fingerprint IS DISTINCT FROM p_fingerprint
       OR v_request.resolved_target_user_id IS DISTINCT FROM p_resolved_target_user_id THEN
      RETURN public.household_chore_private_result(
        false, 'conflict', p_request_id, '{}'::jsonb
      );
    END IF;

    IF v_request.status = 'completed' THEN
      RETURN v_request.result;
    END IF;

    RAISE EXCEPTION 'household_chore_request_incomplete';
  END IF;

  INSERT INTO public.household_chore_mutation_requests (
    actor_user_id,
    request_id,
    operation,
    fingerprint,
    resolved_target_user_id
  ) VALUES (
    p_actor_id,
    p_request_id,
    p_operation,
    p_fingerprint,
    p_resolved_target_user_id
  );

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_finish_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_result IS NULL
     OR pg_catalog.jsonb_typeof(p_result) <> 'object'
     OR pg_catalog.octet_length(p_result::text) > 8192 THEN
    RAISE EXCEPTION 'household_chore_result_invalid';
  END IF;

  UPDATE public.household_chore_mutation_requests AS request_row
  SET status = 'completed',
      result = p_result,
      completed_at = pg_catalog.clock_timestamp()
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id
    AND request_row.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'household_chore_request_missing';
  END IF;

  RETURN p_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cleanup_user_id uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1
      FROM public.household_chore_delete_authorizations AS authorization_row
      WHERE authorization_row.circle_id = OLD.circle_id
        AND (
          (
            authorization_row.authorization_kind = 'request'
            AND EXISTS (
              SELECT 1
              FROM public.household_chore_mutation_requests AS request_row
              WHERE request_row.actor_user_id = authorization_row.actor_user_id
                AND request_row.request_id = authorization_row.request_id
                AND request_row.operation = 'delete_circle'
                AND request_row.status = 'pending'
            )
          )
          OR (
            authorization_row.authorization_kind = 'account_deletion'
            AND EXISTS (
              SELECT 1
              FROM public.household_chore_deletion_markers AS marker_row
              WHERE marker_row.user_id = authorization_row.actor_user_id
                AND marker_row.marker_token = authorization_row.marker_token
                AND marker_row.status = 'preparing'
            )
          )
        )
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'household_chore_immutable_history';
  END IF;

  BEGIN
    v_cleanup_user_id := NULLIF(
      pg_catalog.current_setting('teskeid.household_identity_cleanup', true),
      ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_cleanup_user_id := NULL;
  END;

  IF v_cleanup_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = v_cleanup_user_id
  ) THEN
    RAISE EXCEPTION 'household_chore_immutable_history';
  END IF;

  v_old := pg_catalog.to_jsonb(OLD);
  v_new := pg_catalog.to_jsonb(NEW);

  IF TG_TABLE_NAME = 'household_chore_membership_events' THEN
    IF (v_old - ARRAY['subject_user_id','actor_user_id','actor_label_snapshot','actor_identity_marker']::text[])
       <> (v_new - ARRAY['subject_user_id','actor_user_id','actor_label_snapshot','actor_identity_marker']::text[])
       OR (OLD.subject_user_id IS DISTINCT FROM NEW.subject_user_id
         AND (OLD.subject_user_id IS DISTINCT FROM v_cleanup_user_id
           OR NEW.subject_user_id IS NOT NULL))
       OR (OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id
         AND (OLD.actor_user_id IS DISTINCT FROM v_cleanup_user_id
           OR NEW.actor_user_id IS NOT NULL
           OR NEW.actor_label_snapshot IS NOT NULL
           OR NEW.actor_identity_marker <> 'former_member')) THEN
      RAISE EXCEPTION 'household_chore_immutable_history';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'household_chore_definition_events' THEN
    IF (v_old - ARRAY['actor_user_id','actor_identity_marker']::text[])
       <> (v_new - ARRAY['actor_user_id','actor_identity_marker']::text[])
       OR OLD.actor_user_id IS DISTINCT FROM v_cleanup_user_id
       OR NEW.actor_user_id IS NOT NULL
       OR NEW.actor_identity_marker <> 'former_member' THEN
      RAISE EXCEPTION 'household_chore_immutable_history';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'household_chore_assignment_events' THEN
    IF (v_old - ARRAY[
         'participant_label_snapshot','participant_identity_marker',
         'actor_user_id','actor_label_snapshot','actor_identity_marker'
       ]::text[])
       <> (v_new - ARRAY[
         'participant_label_snapshot','participant_identity_marker',
         'actor_user_id','actor_label_snapshot','actor_identity_marker'
       ]::text[]) THEN
      RAISE EXCEPTION 'household_chore_immutable_history';
    END IF;
    IF OLD.actor_user_id = v_cleanup_user_id THEN
      NEW.actor_user_id := NULL;
      NEW.actor_label_snapshot := NULL;
      NEW.actor_identity_marker := 'former_member';
    ELSIF OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id
       OR OLD.actor_label_snapshot IS DISTINCT FROM NEW.actor_label_snapshot
       OR OLD.actor_identity_marker IS DISTINCT FROM NEW.actor_identity_marker THEN
      RAISE EXCEPTION 'household_chore_immutable_history';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'household_chore_point_entries' THEN
    IF (v_old - ARRAY['actor_user_id','actor_identity_marker']::text[])
       <> (v_new - ARRAY['actor_user_id','actor_identity_marker']::text[])
       OR OLD.actor_user_id IS DISTINCT FROM v_cleanup_user_id
       OR NEW.actor_user_id IS NOT NULL
       OR NEW.actor_identity_marker <> 'former_member' THEN
      RAISE EXCEPTION 'household_chore_immutable_history';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'household_chore_immutable_history';
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_type_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_authorization_id uuid;
BEGIN
  IF NEW.membership_type IS NOT DISTINCT FROM OLD.membership_type THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_authorization_id := NULLIF(
      pg_catalog.current_setting('teskeid.household_type_authorization', true),
      ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_authorization_id := NULL;
  END;

  IF v_authorization_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_type_authorizations AS authorization_row
    WHERE authorization_row.authorization_id = v_authorization_id
      AND authorization_row.circle_id = OLD.circle_id
      AND authorization_row.membership_id = OLD.id
      AND authorization_row.old_type = OLD.membership_type
      AND authorization_row.new_type = NEW.membership_type
  ) THEN
    RAISE EXCEPTION 'household_chore_membership_type_unauthorized';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_membership_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cleanup_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.initial_type <> NEW.membership_type THEN
      RAISE EXCEPTION 'household_chore_membership_initial_type_invalid';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.circle_id <> OLD.circle_id
     OR NEW.participant_id <> OLD.participant_id
     OR NEW.initial_type <> OLD.initial_type
     OR NEW.origin <> OLD.origin
     OR NEW.accepted_invitation_id IS DISTINCT FROM OLD.accepted_invitation_id
     OR NEW.joined_at <> OLD.joined_at THEN
    RAISE EXCEPTION 'household_chore_membership_provenance_immutable';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    BEGIN
      v_cleanup_user_id := NULLIF(
        pg_catalog.current_setting('teskeid.household_identity_cleanup', true),
        ''
      )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_cleanup_user_id := NULL;
    END;
    IF OLD.user_id IS NULL OR NEW.user_id IS NOT NULL
       OR v_cleanup_user_id IS DISTINCT FROM OLD.user_id
       OR NEW.status = 'active'
       OR NEW.identity_retired_at IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.household_chore_deletion_markers AS marker_row
         WHERE marker_row.user_id = OLD.user_id
       ) THEN
      RAISE EXCEPTION 'household_chore_membership_identity_unauthorized';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_invitation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cleanup_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.circle_id <> OLD.circle_id
     OR NEW.requested_type <> OLD.requested_type
     OR NEW.created_at <> OLD.created_at
     OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'household_chore_invitation_provenance_immutable';
  END IF;

  IF NEW.invitee_user_id IS DISTINCT FROM OLD.invitee_user_id
     OR NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id THEN
    BEGIN
      v_cleanup_user_id := NULLIF(
        pg_catalog.current_setting('teskeid.household_identity_cleanup', true),
        ''
      )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_cleanup_user_id := NULL;
    END;

    IF (NEW.invitee_user_id IS DISTINCT FROM OLD.invitee_user_id AND (
          OLD.invitee_user_id IS NULL OR NEW.invitee_user_id IS NOT NULL
          OR v_cleanup_user_id IS DISTINCT FROM OLD.invitee_user_id
          OR NEW.status = 'pending' OR NEW.identity_retired_at IS NULL
        ))
       OR (NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id AND (
          OLD.invited_by_user_id IS NULL OR NEW.invited_by_user_id IS NOT NULL
          OR v_cleanup_user_id IS DISTINCT FROM OLD.invited_by_user_id
        ))
       OR NOT EXISTS (
         SELECT 1
         FROM public.household_chore_deletion_markers AS marker_row
         WHERE marker_row.user_id = v_cleanup_user_id
       ) THEN
      RAISE EXCEPTION 'household_chore_invitation_identity_unauthorized';
    END IF;
  END IF;

  IF NEW.relationship_id IS DISTINCT FROM OLD.relationship_id
     OR NEW.inviter_label_snapshot IS DISTINCT FROM OLD.inviter_label_snapshot THEN
    -- Deleting a private Relationship must be allowed to perform its declared
    -- FK action without changing the durable invitation proof/snapshot.  This
    -- branch accepts only the exact OLD nonnull -> NEW null relationship
    -- transition; combining it with any business or identity mutation remains
    -- forbidden.
    IF OLD.relationship_id IS NOT NULL
       AND NEW.relationship_id IS NULL
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.circle_id IS NOT DISTINCT FROM OLD.circle_id
       AND NEW.invitee_user_id IS NOT DISTINCT FROM OLD.invitee_user_id
       AND NEW.invited_by_user_id IS NOT DISTINCT FROM OLD.invited_by_user_id
       AND NEW.requested_type IS NOT DISTINCT FROM OLD.requested_type
       AND NEW.inviter_label_snapshot IS NOT DISTINCT FROM OLD.inviter_label_snapshot
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.version IS NOT DISTINCT FROM OLD.version
       AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
       AND NEW.responded_at IS NOT DISTINCT FROM OLD.responded_at
       AND NEW.identity_retired_at IS NOT DISTINCT FROM OLD.identity_retired_at
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
      NULL;
    ELSE
      BEGIN
        v_cleanup_user_id := NULLIF(
          pg_catalog.current_setting('teskeid.household_identity_cleanup', true),
          ''
        )::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_cleanup_user_id := NULL;
      END;
      IF v_cleanup_user_id IS NULL
         OR OLD.invited_by_user_id IS DISTINCT FROM v_cleanup_user_id
         OR NEW.invited_by_user_id IS NOT NULL
         OR NEW.relationship_id IS NOT NULL
         OR NEW.inviter_label_snapshot IS NOT NULL
         OR NOT EXISTS (
           SELECT 1
           FROM public.household_chore_deletion_markers AS marker_row
           WHERE marker_row.user_id = v_cleanup_user_id
         ) THEN
        RAISE EXCEPTION 'household_chore_invitation_provenance_unauthorized';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_participant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cleanup_user_id uuid;
BEGIN
  IF NEW.circle_id <> OLD.circle_id THEN
    RAISE EXCEPTION 'household_chore_participant_circle_immutable';
  END IF;

  IF NEW.linked_user_id IS DISTINCT FROM OLD.linked_user_id
     OR NEW.identity_marker IS DISTINCT FROM OLD.identity_marker
     OR NEW.identity_retired_at IS DISTINCT FROM OLD.identity_retired_at THEN
    BEGIN
      v_cleanup_user_id := NULLIF(
        pg_catalog.current_setting('teskeid.household_identity_cleanup', true),
        ''
      )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_cleanup_user_id := NULL;
    END;

    IF OLD.linked_user_id IS NULL OR NEW.linked_user_id IS NOT NULL
       OR v_cleanup_user_id IS DISTINCT FROM OLD.linked_user_id
       OR NEW.identity_marker <> 'former_member'
       OR NEW.identity_retired_at IS NULL
       OR NEW.status <> 'archived'
       OR NEW.archive_reason <> 'account_erased'
       OR NOT EXISTS (
         SELECT 1
         FROM public.household_chore_deletion_markers AS marker_row
         WHERE marker_row.user_id = OLD.linked_user_id
       ) THEN
      RAISE EXCEPTION 'household_chore_participant_identity_unauthorized';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_point_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_earned public.household_chore_point_entries%ROWTYPE;
BEGIN
  SELECT assignment_row.*
  INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = NEW.circle_id
    AND assignment_row.id = NEW.assignment_id;

  IF NOT FOUND
     OR v_assignment.participant_id <> NEW.participant_id
     OR v_assignment.points_snapshot <> pg_catalog.abs(NEW.points_delta)
     OR v_assignment.completion_sequence <> NEW.completion_sequence THEN
    RAISE EXCEPTION 'household_chore_point_shape_invalid';
  END IF;

  IF NEW.entry_kind = 'reversal' THEN
    SELECT point_row.*
    INTO v_earned
    FROM public.household_chore_point_entries AS point_row
    WHERE point_row.circle_id = NEW.circle_id
      AND point_row.id = NEW.reverses_entry_id
      AND point_row.entry_kind = 'earned';

    IF NOT FOUND
       OR v_earned.assignment_id <> NEW.assignment_id
       OR v_earned.participant_id <> NEW.participant_id
       OR v_earned.completion_sequence <> NEW.completion_sequence
       OR NEW.points_delta <> -v_earned.points_delta THEN
      RAISE EXCEPTION 'household_chore_reversal_shape_invalid';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_validate_circle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_circle_id uuid;
  v_circle public.household_chore_circles%ROWTYPE;
BEGIN
  v_circle_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.circle_id
    ELSE NEW.circle_id
  END;

  SELECT circle_row.*
  INTO v_circle
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = v_circle_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = v_circle_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
      AND membership_row.user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'household_chore_circle_without_full_member';
  END IF;

  IF v_circle.created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = v_circle_id
      AND membership_row.origin = 'creator'
      AND membership_row.initial_type = 'member'
      AND membership_row.user_id = v_circle.created_by
  ) THEN
    RAISE EXCEPTION 'household_chore_creator_membership_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    LEFT JOIN public.household_chore_invitations AS invitation_row
      ON invitation_row.circle_id = membership_row.circle_id
     AND invitation_row.id = membership_row.accepted_invitation_id
    WHERE membership_row.circle_id = v_circle_id
      AND membership_row.origin = 'invitation'
      AND (
        invitation_row.id IS NULL
        OR invitation_row.status <> 'accepted'
        OR invitation_row.requested_type <> membership_row.initial_type
        OR invitation_row.invitee_user_id IS DISTINCT FROM membership_row.user_id
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_invitation_membership_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_invitations AS invitation_row
    LEFT JOIN public.household_chore_memberships AS membership_row
      ON membership_row.circle_id = invitation_row.circle_id
     AND membership_row.accepted_invitation_id = invitation_row.id
    WHERE invitation_row.circle_id = v_circle_id
      AND invitation_row.status = 'accepted'
      AND (
        membership_row.id IS NULL
        OR membership_row.initial_type <> invitation_row.requested_type
        OR membership_row.user_id IS DISTINCT FROM invitation_row.invitee_user_id
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_accepted_invitation_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_participants AS participant_row
    LEFT JOIN public.household_chore_memberships AS membership_row
      ON membership_row.circle_id = participant_row.circle_id
     AND membership_row.user_id = participant_row.linked_user_id
     AND membership_row.participant_id = participant_row.id
     AND membership_row.status = 'active'
    WHERE participant_row.circle_id = v_circle_id
      AND participant_row.status = 'active'
      AND participant_row.linked_user_id IS NOT NULL
      AND membership_row.id IS NULL
  ) THEN
    RAISE EXCEPTION 'household_chore_linked_participant_without_membership';
  END IF;

  RETURN NULL;
END;
$function$;

CREATE TRIGGER household_chore_circles_touch
  BEFORE UPDATE ON public.household_chore_circles
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_touch_updated_at();
CREATE TRIGGER household_chore_participants_touch
  BEFORE UPDATE ON public.household_chore_participants
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_touch_updated_at();
CREATE TRIGGER household_chore_invitations_touch
  BEFORE UPDATE ON public.household_chore_invitations
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_touch_updated_at();
CREATE TRIGGER household_chore_memberships_touch
  BEFORE UPDATE ON public.household_chore_memberships
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_touch_updated_at();
CREATE TRIGGER household_chore_definitions_touch
  BEFORE UPDATE ON public.household_chore_definitions
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_touch_updated_at();
CREATE TRIGGER household_chore_values_touch
  BEFORE UPDATE ON public.household_chore_participant_values
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_touch_updated_at();
CREATE TRIGGER household_chore_assignments_touch
  BEFORE UPDATE ON public.household_chore_assignments
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_touch_updated_at();

CREATE TRIGGER household_chore_membership_type_guard
  BEFORE UPDATE OF membership_type ON public.household_chore_memberships
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_type_guard();
CREATE TRIGGER household_chore_membership_provenance_guard
  BEFORE INSERT OR UPDATE ON public.household_chore_memberships
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_membership_guard();
CREATE TRIGGER household_chore_invitation_provenance_guard
  BEFORE UPDATE ON public.household_chore_invitations
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_invitation_guard();
CREATE TRIGGER household_chore_participant_identity_guard
  BEFORE UPDATE ON public.household_chore_participants
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_participant_guard();

CREATE TRIGGER household_chore_points_insert_guard
  BEFORE INSERT ON public.household_chore_point_entries
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_point_guard();

CREATE TRIGGER household_chore_membership_events_immutable
  BEFORE UPDATE OR DELETE ON public.household_chore_membership_events
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_immutable_guard();
CREATE TRIGGER household_chore_definition_events_immutable
  BEFORE UPDATE OR DELETE ON public.household_chore_definition_events
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_immutable_guard();
CREATE TRIGGER household_chore_assignment_events_immutable
  BEFORE UPDATE OR DELETE ON public.household_chore_assignment_events
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_immutable_guard();
CREATE TRIGGER household_chore_points_immutable
  BEFORE UPDATE OR DELETE ON public.household_chore_point_entries
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_immutable_guard();

CREATE CONSTRAINT TRIGGER household_chore_circle_membership_integrity
  AFTER INSERT OR UPDATE OR DELETE ON public.household_chore_memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_validate_circle();
CREATE CONSTRAINT TRIGGER household_chore_circle_invitation_integrity
  AFTER INSERT OR UPDATE OR DELETE ON public.household_chore_invitations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_validate_circle();
CREATE CONSTRAINT TRIGGER household_chore_circle_participant_integrity
  AFTER INSERT OR UPDATE OR DELETE ON public.household_chore_participants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_private_validate_circle();

CREATE OR REPLACE FUNCTION public.household_chore_get_root(
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_circles jsonb;
  v_invitations jsonb;
BEGIN
  IF p_actor_id IS NULL
     OR NOT public.household_chore_private_actor_ready(p_actor_id) THEN
    RETURN public.household_chore_private_read_result(
      false, 'feature_unavailable', '{}'::jsonb
    );
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.updated_at DESC, item.circle_id), '[]'::jsonb)
  INTO v_circles
  FROM (
    SELECT
      circle_row.id AS circle_id,
      circle_row.updated_at,
      pg_catalog.jsonb_build_object(
        'circle_id', circle_row.id,
        'name', circle_row.name,
        'display_reference', circle_row.display_reference,
        'membership_type', membership_row.membership_type,
        'open_count', (
          SELECT pg_catalog.count(*)::integer
          FROM public.household_chore_assignments AS assignment_row
          WHERE assignment_row.circle_id = circle_row.id
            AND assignment_row.status = 'open'
        )
      ) AS payload
    FROM public.household_chore_memberships AS membership_row
    JOIN public.household_chore_circles AS circle_row
      ON circle_row.id = membership_row.circle_id
    WHERE membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
    ORDER BY circle_row.updated_at DESC, circle_row.id
    LIMIT 20
  ) AS item;

  SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.created_at DESC, item.invitation_id), '[]'::jsonb)
  INTO v_invitations
  FROM (
    SELECT
      invitation_row.id AS invitation_id,
      invitation_row.created_at,
      pg_catalog.jsonb_build_object(
        'invitation_id', invitation_row.id,
        'circle_name', circle_row.name,
        'display_reference', circle_row.display_reference,
        'inviter_label', invitation_row.inviter_label_snapshot,
        'requested_type', invitation_row.requested_type,
        'version', invitation_row.version::text,
        'expires_at', invitation_row.expires_at,
        'href', '/auth-mvp/heimilisverkin/bod/' || invitation_row.id::text
      ) AS payload
    FROM public.household_chore_invitations AS invitation_row
    JOIN public.household_chore_circles AS circle_row
      ON circle_row.id = invitation_row.circle_id
    WHERE invitation_row.invitee_user_id = p_actor_id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at > pg_catalog.clock_timestamp()
      AND EXISTS (
        SELECT 1
        FROM public.household_chore_memberships AS inviter_membership
        WHERE inviter_membership.circle_id = invitation_row.circle_id
          AND inviter_membership.user_id = invitation_row.invited_by_user_id
          AND inviter_membership.status = 'active'
          AND inviter_membership.membership_type = 'member'
      )
    ORDER BY invitation_row.created_at DESC, invitation_row.id
    LIMIT 20
  ) AS item;

  RETURN public.household_chore_private_read_result(
    true,
    'get_root_loaded',
    pg_catalog.jsonb_build_object(
      'circles', v_circles,
      'pending_invitations', v_invitations
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_invitation_preview(
  p_actor_id uuid,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_invitation_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM auth.users AS account WHERE account.id = p_actor_id
     ) OR EXISTS (
       SELECT 1
       FROM public.household_chore_deletion_markers AS marker_row
       WHERE marker_row.user_id = p_actor_id
     ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'invitation_id', invitation_row.id,
    'circle_name', circle_row.name,
    'display_reference', circle_row.display_reference,
    'inviter_label', invitation_row.inviter_label_snapshot,
    'requested_type', invitation_row.requested_type,
    'version', invitation_row.version::text,
    'expires_at', invitation_row.expires_at,
    'accept_available', public.household_chore_private_is_entitled(p_actor_id)
  )
  INTO v_payload
  FROM public.household_chore_invitations AS invitation_row
  JOIN public.household_chore_circles AS circle_row
    ON circle_row.id = invitation_row.circle_id
  WHERE invitation_row.id = p_invitation_id
    AND invitation_row.invitee_user_id = p_actor_id
    AND invitation_row.status = 'pending'
    AND invitation_row.expires_at > pg_catalog.clock_timestamp()
    AND EXISTS (
      SELECT 1
      FROM public.household_chore_memberships AS inviter_membership
      WHERE inviter_membership.circle_id = invitation_row.circle_id
        AND inviter_membership.user_id = invitation_row.invited_by_user_id
        AND inviter_membership.status = 'active'
        AND inviter_membership.membership_type = 'member'
    );

  IF v_payload IS NULL THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  RETURN public.household_chore_private_read_result(
    true, 'get_invitation_preview_loaded', v_payload
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_memberships(
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_items jsonb;
  v_pending jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS account WHERE account.id = p_actor_id
  ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = p_actor_id
  ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'deletion_pending', '{}'::jsonb
    );
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.joined_at DESC, item.circle_id), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      membership_row.circle_id,
      membership_row.joined_at,
      pg_catalog.jsonb_build_object(
        'circle_id', circle_row.id,
        'circle_name', circle_row.name,
        'display_reference', circle_row.display_reference,
        'membership_type', membership_row.membership_type,
        'membership_status', membership_row.status,
        'circle_version', circle_row.version::text,
        'membership_version', membership_row.version::text,
        'can_leave',
          membership_row.membership_type = 'child'
          OR EXISTS (
            SELECT 1
            FROM public.household_chore_memberships AS other_membership
            WHERE other_membership.circle_id = membership_row.circle_id
              AND other_membership.id <> membership_row.id
              AND other_membership.status = 'active'
              AND other_membership.membership_type = 'member'
          ),
        'can_delete_circle',
          membership_row.membership_type = 'member'
          AND NOT EXISTS (
            SELECT 1
            FROM public.household_chore_memberships AS other_membership
            WHERE other_membership.circle_id = membership_row.circle_id
              AND other_membership.id <> membership_row.id
              AND other_membership.status = 'active'
              AND other_membership.membership_type = 'member'
          )
      ) AS payload
    FROM public.household_chore_memberships AS membership_row
    JOIN public.household_chore_circles AS circle_row
      ON circle_row.id = membership_row.circle_id
    WHERE membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
    ORDER BY membership_row.joined_at DESC, membership_row.circle_id
    LIMIT 20
  ) AS item;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      item.payload ORDER BY item.created_at DESC, item.invitation_id
    ),
    '[]'::jsonb
  )
  INTO v_pending
  FROM (
    SELECT
      invitation_row.id AS invitation_id,
      invitation_row.created_at,
      pg_catalog.jsonb_build_object(
        'invitation_id', invitation_row.id,
        'circle_name', circle_row.name,
        'display_reference', circle_row.display_reference,
        'inviter_label', invitation_row.inviter_label_snapshot,
        'requested_type', invitation_row.requested_type,
        'version', invitation_row.version::text,
        'expires_at', invitation_row.expires_at,
        'accept_available', public.household_chore_private_is_entitled(p_actor_id),
        'href', '/auth-mvp/heimilisverkin/bod/' || invitation_row.id::text
      ) AS payload
    FROM public.household_chore_invitations AS invitation_row
    JOIN public.household_chore_circles AS circle_row
      ON circle_row.id = invitation_row.circle_id
    WHERE invitation_row.invitee_user_id = p_actor_id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at > pg_catalog.clock_timestamp()
      AND EXISTS (
        SELECT 1
        FROM public.household_chore_memberships AS inviter_membership
        WHERE inviter_membership.circle_id = invitation_row.circle_id
          AND inviter_membership.user_id = invitation_row.invited_by_user_id
          AND inviter_membership.status = 'active'
          AND inviter_membership.membership_type = 'member'
      )
    ORDER BY invitation_row.created_at DESC, invitation_row.id
    LIMIT 20
  ) AS item;

  RETURN public.household_chore_private_read_result(
    true,
    'get_memberships_loaded',
    pg_catalog.jsonb_build_object(
      'memberships', v_items,
      'pending_invitations', v_pending
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_circle(
  p_actor_id uuid,
  p_circle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_membership public.household_chore_memberships%ROWTYPE;
  v_circle public.household_chore_circles%ROWTYPE;
  v_participants jsonb;
  v_definitions jsonb;
  v_open jsonb;
  v_recent jsonb;
  v_totals jsonb;
  v_memberships jsonb;
  v_pending jsonb;
  v_data jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL
     OR NOT public.household_chore_private_actor_ready(p_actor_id) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT membership_row.*
  INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active';

  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT circle_row.*
  INTO v_circle
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.sort_label, item.participant_id), '[]'::jsonb)
  INTO v_participants
  FROM (
    SELECT
      participant_row.id AS participant_id,
      COALESCE(participant_row.display_name_snapshot, '') AS sort_label,
      CASE
        WHEN v_membership.membership_type = 'member' THEN
          pg_catalog.jsonb_build_object(
            'participant_id', participant_row.id,
            'label', participant_row.display_name_snapshot,
            'identity_marker', participant_row.identity_marker,
            'status', participant_row.status,
            'version', participant_row.version::text
          )
        ELSE
          pg_catalog.jsonb_build_object(
            'participant_id', participant_row.id,
            'label', participant_row.display_name_snapshot
          )
      END AS payload
    FROM public.household_chore_participants AS participant_row
    WHERE participant_row.circle_id = p_circle_id
      AND (
        v_membership.membership_type = 'member'
        OR participant_row.status = 'active'
      )
    ORDER BY sort_label, participant_row.id
    LIMIT 100
  ) AS item;

  SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.sort_title, item.definition_id), '[]'::jsonb)
  INTO v_definitions
  FROM (
    SELECT
      definition_row.id AS definition_id,
      definition_row.title AS sort_title,
      CASE
        WHEN v_membership.membership_type = 'member' THEN
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'definition_id', definition_row.id,
            'title', definition_row.title,
            'description', definition_row.description,
            'materials', definition_row.materials,
            'status', definition_row.status,
            'version', definition_row.version::text
          ))
        ELSE
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'definition_id', definition_row.id,
            'title', definition_row.title,
            'description', definition_row.description,
            'materials', definition_row.materials
          ))
      END AS payload
    FROM public.household_chore_definitions AS definition_row
    WHERE definition_row.circle_id = p_circle_id
      AND (
        v_membership.membership_type = 'member'
        OR definition_row.status = 'active'
      )
    ORDER BY definition_row.title, definition_row.id
    LIMIT 200
  ) AS item;

  SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.created_at, item.assignment_id), '[]'::jsonb)
  INTO v_open
  FROM (
    SELECT
      assignment_row.id AS assignment_id,
      assignment_row.created_at,
      CASE
        WHEN v_membership.membership_type = 'member' THEN
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'assignment_id', assignment_row.id,
            'definition_id', assignment_row.definition_id,
            'title', assignment_row.title_snapshot,
            'description', assignment_row.description_snapshot,
            'materials', assignment_row.materials_snapshot,
            'participant_id', assignment_row.participant_id,
            'participant_label', assignment_row.participant_label_snapshot,
            'participant_identity_marker', assignment_row.participant_identity_marker,
            'points', assignment_row.points_snapshot,
            'origin', assignment_row.origin,
            'status', assignment_row.status,
            'version', assignment_row.version::text,
            'created_at', assignment_row.created_at,
            'can_complete', true,
            'can_cancel', true
          ))
        ELSE
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'assignment_id', assignment_row.id,
            'title', assignment_row.title_snapshot,
            'participant_label', assignment_row.participant_label_snapshot,
            'points', assignment_row.points_snapshot,
            'version', CASE
              WHEN assignment_row.participant_id = v_membership.participant_id
              THEN assignment_row.version::text ELSE NULL
            END,
            'can_complete',
              assignment_row.participant_id = v_membership.participant_id,
            'can_cancel',
              assignment_row.participant_id = v_membership.participant_id
          ))
      END AS payload
    FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.circle_id = p_circle_id
      AND assignment_row.status = 'open'
    ORDER BY assignment_row.created_at, assignment_row.id
    LIMIT 500
  ) AS item;

  SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.occurred_at DESC, item.event_id DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT
      event_row.id AS event_id,
      event_row.occurred_at,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'event_id', event_row.id,
        'assignment_id', event_row.assignment_id,
        'title', assignment_row.title_snapshot,
        'event_type', event_row.event_type,
        'occurred_at', event_row.occurred_at,
        'participant_label', event_row.participant_label_snapshot,
        'participant_identity_marker', event_row.participant_identity_marker,
        'assignment_origin', event_row.assignment_origin,
        'snapshot_points', event_row.snapshot_points,
        'status_after', event_row.status_after,
        'actor_kind', CASE
          WHEN event_row.actor_identity_marker = 'system' THEN 'system'
          WHEN event_row.actor_identity_marker = 'former_member' THEN 'former_member'
          WHEN event_row.actor_user_id = participant_row.linked_user_id THEN 'participant'
          ELSE 'member'
        END,
        'actor_label', event_row.actor_label_snapshot,
        'completion_sequence', event_row.completion_sequence,
        'completed_at', CASE
          WHEN event_row.event_type IN ('completed', 'recompleted')
          THEN event_row.occurred_at ELSE NULL
        END,
        'points_delta', event_row.points_delta,
        'cancellation_reason', event_row.cancellation_reason,
        'reopen_outcome', event_row.reopen_outcome
      )) AS payload
    FROM public.household_chore_assignment_events AS event_row
    JOIN public.household_chore_assignments AS assignment_row
      ON assignment_row.circle_id = event_row.circle_id
     AND assignment_row.id = event_row.assignment_id
    JOIN public.household_chore_participants AS participant_row
      ON participant_row.circle_id = event_row.circle_id
     AND participant_row.id = event_row.participant_id
    WHERE event_row.circle_id = p_circle_id
      AND event_row.event_type IN ('completed', 'recompleted')
      AND assignment_row.status = 'completed'
      AND assignment_row.completion_sequence = event_row.completion_sequence
    ORDER BY event_row.occurred_at DESC, event_row.id DESC
    LIMIT 50
  ) AS item;

  SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.sort_label, item.participant_id), '[]'::jsonb)
  INTO v_totals
  FROM (
    SELECT
      participant_row.id AS participant_id,
      COALESCE(participant_row.display_name_snapshot, '') AS sort_label,
      CASE
        WHEN v_membership.membership_type = 'member' THEN
          pg_catalog.jsonb_build_object(
            'participant_id', participant_row.id,
            'label', participant_row.display_name_snapshot,
            'identity_marker', participant_row.identity_marker,
            'points', COALESCE(pg_catalog.sum(point_row.points_delta), 0)
          )
        ELSE
          pg_catalog.jsonb_build_object(
            'participant_id', participant_row.id,
            'label', participant_row.display_name_snapshot,
            'points', COALESCE(pg_catalog.sum(point_row.points_delta), 0)
          )
      END AS payload
    FROM public.household_chore_participants AS participant_row
    LEFT JOIN public.household_chore_point_entries AS point_row
      ON point_row.circle_id = participant_row.circle_id
     AND point_row.participant_id = participant_row.id
    WHERE participant_row.circle_id = p_circle_id
      AND (
        v_membership.membership_type = 'member'
        OR participant_row.status = 'active'
      )
    GROUP BY participant_row.id, participant_row.display_name_snapshot,
      participant_row.identity_marker
    ORDER BY sort_label, participant_row.id
    LIMIT 100
  ) AS item;

  v_data := pg_catalog.jsonb_build_object(
    'viewer_type', v_membership.membership_type,
    'circle', CASE
      WHEN v_membership.membership_type = 'member' THEN
        pg_catalog.jsonb_build_object(
          'circle_id', v_circle.id,
          'name', v_circle.name,
          'display_reference', v_circle.display_reference,
          'version', v_circle.version::text,
          'member_count', (
            SELECT pg_catalog.count(*)::integer
            FROM public.household_chore_memberships AS membership_row
            WHERE membership_row.circle_id = p_circle_id
              AND membership_row.status = 'active'
          )
        )
      ELSE
        pg_catalog.jsonb_build_object(
          'name', v_circle.name,
          'display_reference', v_circle.display_reference
        )
    END,
    'participants', v_participants,
    'definitions', v_definitions,
    'open_assignments', v_open,
    'recent_assignments', v_recent,
    'point_totals', v_totals
  );

  IF v_membership.membership_type = 'child' THEN
    v_data := v_data || pg_catalog.jsonb_build_object(
      'own_participant_id', v_membership.participant_id
    );
  END IF;

  IF v_membership.membership_type = 'member' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.joined_at, item.membership_id), '[]'::jsonb)
    INTO v_memberships
    FROM (
      SELECT
        membership_row.id AS membership_id,
        membership_row.joined_at,
        pg_catalog.jsonb_build_object(
          'membership_id', membership_row.id,
          'participant_id', membership_row.participant_id,
          'label', participant_row.display_name_snapshot,
          'identity_marker', participant_row.identity_marker,
          'membership_type', membership_row.membership_type,
          'status', membership_row.status,
          'version', membership_row.version::text,
          'is_viewer', membership_row.user_id = p_actor_id
        ) AS payload
      FROM public.household_chore_memberships AS membership_row
      JOIN public.household_chore_participants AS participant_row
        ON participant_row.circle_id = membership_row.circle_id
       AND participant_row.id = membership_row.participant_id
      WHERE membership_row.circle_id = p_circle_id
        AND membership_row.status = 'active'
      ORDER BY membership_row.joined_at, membership_row.id
      LIMIT 20
    ) AS item;

    SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.created_at DESC, item.invitation_id), '[]'::jsonb)
    INTO v_pending
    FROM (
      SELECT
        invitation_row.id AS invitation_id,
        invitation_row.created_at,
        pg_catalog.jsonb_build_object(
          'invitation_id', invitation_row.id,
          'invitee_label', public.household_chore_private_safe_user_label(
            invitation_row.invitee_user_id
          ),
          'requested_type', invitation_row.requested_type,
          'version', invitation_row.version::text,
          'expires_at', invitation_row.expires_at
        ) AS payload
      FROM public.household_chore_invitations AS invitation_row
      WHERE invitation_row.circle_id = p_circle_id
        AND invitation_row.status = 'pending'
        AND invitation_row.expires_at > pg_catalog.clock_timestamp()
        AND EXISTS (
          SELECT 1
          FROM public.household_chore_memberships AS inviter_membership
          WHERE inviter_membership.circle_id = invitation_row.circle_id
            AND inviter_membership.user_id = invitation_row.invited_by_user_id
            AND inviter_membership.status = 'active'
            AND inviter_membership.membership_type = 'member'
        )
      ORDER BY invitation_row.created_at DESC, invitation_row.id
      LIMIT 20
    ) AS item;

    v_data := v_data || pg_catalog.jsonb_build_object(
      'memberships', v_memberships,
      'pending_invitations', v_pending
    );
  END IF;

  RETURN public.household_chore_private_read_result(
    true, 'get_circle_loaded', v_data
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_definition_detail(
  p_actor_id uuid,
  p_circle_id uuid,
  p_definition_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_definition public.household_chore_definitions%ROWTYPE;
  v_participant_values jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL OR p_definition_id IS NULL
     OR NOT public.household_chore_private_actor_ready(p_actor_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.household_chore_memberships AS membership_row
       WHERE membership_row.circle_id = p_circle_id
         AND membership_row.user_id = p_actor_id
         AND membership_row.status = 'active'
         AND membership_row.membership_type = 'member'
     ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT definition_row.*
  INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id;

  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      item.payload ORDER BY item.sort_label, item.participant_id
    ),
    '[]'::jsonb
  )
  INTO v_participant_values
  FROM (
    SELECT
      participant_row.id AS participant_id,
      COALESCE(participant_row.display_name_snapshot, '') AS sort_label,
      pg_catalog.jsonb_build_object(
        'participant_id', participant_row.id,
        'label', participant_row.display_name_snapshot,
        'identity_marker', participant_row.identity_marker,
        'participant_status', participant_row.status,
        'participant_version', participant_row.version::text,
        'value_status', CASE
          WHEN value_row.id IS NULL THEN 'missing'
          ELSE value_row.status
        END,
        'value_version', CASE
          WHEN value_row.id IS NULL THEN '0'
          ELSE value_row.version::text
        END,
        'points', value_row.points
      ) AS payload
    FROM public.household_chore_participants AS participant_row
    LEFT JOIN public.household_chore_participant_values AS value_row
      ON value_row.circle_id = participant_row.circle_id
     AND value_row.definition_id = p_definition_id
     AND value_row.participant_id = participant_row.id
    WHERE participant_row.circle_id = p_circle_id
    ORDER BY sort_label, participant_row.id
    LIMIT 100
  ) AS item;

  RETURN public.household_chore_private_read_result(
    true,
    'get_definition_detail_loaded',
    pg_catalog.jsonb_build_object(
      'definition', pg_catalog.jsonb_build_object(
        'definition_id', v_definition.id,
        'title', v_definition.title,
        'description', v_definition.description,
        'materials', v_definition.materials,
        'status', v_definition.status,
        'version', v_definition.version::text
      ),
      'participant_values', v_participant_values
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_invite_candidates(
  p_actor_id uuid,
  p_circle_id uuid,
  p_cursor_label text DEFAULT NULL,
  p_cursor_relationship_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
     OR ((p_cursor_label IS NULL) <> (p_cursor_relationship_id IS NULL))
     OR NOT public.household_chore_private_actor_ready(p_actor_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.household_chore_memberships AS membership_row
       WHERE membership_row.circle_id = p_circle_id
         AND membership_row.user_id = p_actor_id
         AND membership_row.status = 'active'
         AND membership_row.membership_type = 'member'
     ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  WITH eligible AS (
    SELECT
      relationship_row.id AS relationship_id,
      CASE
        WHEN NULLIF(pg_catalog.btrim(relationship_row.private_display_name), '') IS NOT NULL
          AND pg_catalog.strpos(pg_catalog.btrim(relationship_row.private_display_name), '@') = 0
        THEN pg_catalog.left(pg_catalog.btrim(relationship_row.private_display_name), 120)
        ELSE public.household_chore_private_safe_user_label(
          relationship_row.counterpart_user_id
        )
      END AS label
    FROM public.relationships AS relationship_row
    WHERE relationship_row.owner_id = p_actor_id
      AND relationship_row.counterpart_user_id IS NOT NULL
      AND relationship_row.counterpart_user_id <> p_actor_id
      AND public.household_chore_private_is_entitled(
        relationship_row.counterpart_user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.household_chore_memberships AS target_membership
        WHERE target_membership.circle_id = p_circle_id
          AND target_membership.user_id = relationship_row.counterpart_user_id
          AND target_membership.status = 'active'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.household_chore_invitations AS pending_invitation
        WHERE pending_invitation.circle_id = p_circle_id
          AND pending_invitation.invitee_user_id = relationship_row.counterpart_user_id
          AND pending_invitation.status = 'pending'
          AND pending_invitation.expires_at > pg_catalog.clock_timestamp()
      )
  ), page_rows AS (
    SELECT eligible.*
    FROM eligible
    WHERE p_cursor_label IS NULL
       OR (eligible.label, eligible.relationship_id)
          > (p_cursor_label, p_cursor_relationship_id)
    ORDER BY eligible.label, eligible.relationship_id
    LIMIT p_limit + 1
  ), visible AS (
    SELECT page_rows.*
    FROM page_rows
    ORDER BY page_rows.label, page_rows.relationship_id
    LIMIT p_limit
  )
  SELECT
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'relationship_id', visible.relationship_id,
        'label', visible.label
      ) ORDER BY visible.label, visible.relationship_id
    ), '[]'::jsonb),
    (SELECT pg_catalog.count(*) > p_limit FROM page_rows),
    CASE WHEN (SELECT pg_catalog.count(*) > p_limit FROM page_rows)
      THEN (
        SELECT pg_catalog.jsonb_build_object(
          'label', last_row.label,
          'relationship_id', last_row.relationship_id
        )
        FROM visible AS last_row
        ORDER BY last_row.label DESC, last_row.relationship_id DESC
        LIMIT 1
      )
      ELSE NULL
    END
  INTO v_items, v_has_more, v_next_cursor
  FROM visible;

  RETURN public.household_chore_private_read_result(
    true,
    'get_invite_candidates_loaded',
    pg_catalog.jsonb_build_object(
      'items', v_items,
      'next_cursor', v_next_cursor,
      'has_more', COALESCE(v_has_more, false)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_self_service(
  p_actor_id uuid,
  p_circle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_membership public.household_chore_memberships%ROWTYPE;
  v_items jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL
     OR NOT public.household_chore_private_actor_ready(p_actor_id) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT membership_row.*
  INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active'
    AND membership_row.membership_type IN ('member', 'child');

  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_allowed', '{}'::jsonb
    );
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.title, item.definition_id), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      definition_row.id AS definition_id,
      definition_row.title,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'definition_id', definition_row.id,
        'title', definition_row.title,
        'description', definition_row.description,
        'materials', definition_row.materials,
        'definition_version', definition_row.version::text,
        'participant_value_version', value_row.version::text,
        'points', value_row.points,
        'own_open_count', (
          SELECT pg_catalog.count(*)::integer
          FROM public.household_chore_assignments AS assignment_row
          WHERE assignment_row.circle_id = p_circle_id
            AND assignment_row.definition_id = definition_row.id
            AND assignment_row.participant_id = v_membership.participant_id
            AND assignment_row.status = 'open'
        )
      )) AS payload
    FROM public.household_chore_definitions AS definition_row
    JOIN public.household_chore_participant_values AS value_row
      ON value_row.circle_id = definition_row.circle_id
     AND value_row.definition_id = definition_row.id
     AND value_row.participant_id = v_membership.participant_id
    JOIN public.household_chore_participants AS participant_row
      ON participant_row.circle_id = value_row.circle_id
     AND participant_row.id = value_row.participant_id
    WHERE definition_row.circle_id = p_circle_id
      AND definition_row.status = 'active'
      AND value_row.status = 'active'
      AND participant_row.status = 'active'
      AND participant_row.linked_user_id = p_actor_id
    ORDER BY definition_row.title, definition_row.id
    LIMIT 200
  ) AS item;

  RETURN public.household_chore_private_read_result(
    true,
    'get_self_service_loaded',
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'participant_id', v_membership.participant_id,
      'items', v_items
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_history_page(
  p_actor_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_assignment_id uuid,
  p_include_created boolean,
  p_cursor_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
     OR ((p_cursor_at IS NULL) <> (p_cursor_id IS NULL))
     OR NOT public.household_chore_private_actor_ready(p_actor_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.household_chore_memberships AS membership_row
       WHERE membership_row.circle_id = p_circle_id
         AND membership_row.user_id = p_actor_id
         AND membership_row.status = 'active'
     ) THEN
    RETURN NULL;
  END IF;

  WITH page_rows AS (
    SELECT
      event_row.*,
      assignment_row.title_snapshot AS assignment_title,
      participant_row.linked_user_id AS participant_user_id
    FROM public.household_chore_assignment_events AS event_row
    JOIN public.household_chore_assignments AS assignment_row
      ON assignment_row.circle_id = event_row.circle_id
     AND assignment_row.id = event_row.assignment_id
    JOIN public.household_chore_participants AS participant_row
      ON participant_row.circle_id = event_row.circle_id
     AND participant_row.id = event_row.participant_id
    WHERE event_row.circle_id = p_circle_id
      AND (p_definition_id IS NULL OR event_row.definition_id = p_definition_id)
      AND (p_assignment_id IS NULL OR event_row.assignment_id = p_assignment_id)
      AND (p_include_created OR event_row.event_type <> 'created')
      AND (
        p_cursor_at IS NULL
        OR (event_row.occurred_at, event_row.id) < (p_cursor_at, p_cursor_id)
      )
    ORDER BY event_row.occurred_at DESC, event_row.id DESC
    LIMIT p_limit + 1
  ), visible AS (
    SELECT page_rows.*
    FROM page_rows
    ORDER BY page_rows.occurred_at DESC, page_rows.id DESC
    LIMIT p_limit
  )
  SELECT
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'event_id', visible.id,
        'assignment_id', visible.assignment_id,
        'title', visible.assignment_title,
        'event_type', visible.event_type,
        'occurred_at', visible.occurred_at,
        'participant_label', visible.participant_label_snapshot,
        'participant_identity_marker', visible.participant_identity_marker,
        'assignment_origin', visible.assignment_origin,
        'snapshot_points', visible.snapshot_points,
        'status_after', visible.status_after,
        'actor_kind', CASE
          WHEN visible.actor_identity_marker = 'system' THEN 'system'
          WHEN visible.actor_identity_marker = 'former_member' THEN 'former_member'
          WHEN visible.actor_user_id = visible.participant_user_id THEN 'participant'
          ELSE 'member'
        END,
        'actor_label', visible.actor_label_snapshot,
        'completion_sequence', visible.completion_sequence,
        'completed_at', CASE
          WHEN visible.event_type IN ('completed', 'recompleted')
          THEN visible.occurred_at ELSE NULL
        END,
        'points_delta', visible.points_delta,
        'cancellation_reason', visible.cancellation_reason,
        'reopen_outcome', visible.reopen_outcome
      )) ORDER BY visible.occurred_at DESC, visible.id DESC
    ), '[]'::jsonb),
    (SELECT pg_catalog.count(*) > p_limit FROM page_rows),
    CASE WHEN (SELECT pg_catalog.count(*) > p_limit FROM page_rows)
      THEN (
        SELECT pg_catalog.jsonb_build_object(
          'occurred_at', last_row.occurred_at,
          'event_id', last_row.id
        )
        FROM visible AS last_row
        ORDER BY last_row.occurred_at, last_row.id
        LIMIT 1
      )
      ELSE NULL
    END
  INTO v_items, v_has_more, v_next_cursor
  FROM visible;

  RETURN pg_catalog.jsonb_build_object(
    'items', v_items,
    'next_cursor', v_next_cursor,
    'has_more', COALESCE(v_has_more, false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_definition_history(
  p_actor_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_cursor_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_page jsonb;
BEGIN
  IF p_definition_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_definitions AS definition_row
    WHERE definition_row.circle_id = p_circle_id
      AND definition_row.id = p_definition_id
  ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  v_page := public.household_chore_private_history_page(
    p_actor_id, p_circle_id, p_definition_id, NULL, false,
    p_cursor_at, p_cursor_id, p_limit
  );
  IF v_page IS NULL THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  RETURN public.household_chore_private_read_result(
    true, 'get_definition_history_loaded', v_page
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_assignment_timeline(
  p_actor_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid,
  p_cursor_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_page jsonb;
BEGIN
  IF p_assignment_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.circle_id = p_circle_id
      AND assignment_row.id = p_assignment_id
  ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  v_page := public.household_chore_private_history_page(
    p_actor_id, p_circle_id, NULL, p_assignment_id, true,
    p_cursor_at, p_cursor_id, p_limit
  );
  IF v_page IS NULL THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;
  RETURN public.household_chore_private_read_result(
    true, 'get_assignment_timeline_loaded', v_page
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_get_assignment(
  p_actor_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_membership public.household_chore_memberships%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_assignment_payload jsonb;
  v_is_own_open boolean;
  v_timeline jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL OR p_assignment_id IS NULL
     OR NOT public.household_chore_private_actor_ready(p_actor_id) THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT membership_row.*
  INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  JOIN public.household_chore_participants AS participant_row
    ON participant_row.circle_id = membership_row.circle_id
   AND participant_row.id = membership_row.participant_id
   AND participant_row.linked_user_id = membership_row.user_id
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active'
    AND participant_row.status = 'active'
    AND participant_row.identity_marker = 'current';

  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  SELECT assignment_row.*
  INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  v_timeline := public.household_chore_private_history_page(
    p_actor_id, p_circle_id, NULL, p_assignment_id, true,
    NULL, NULL, 20
  );

  IF v_membership.membership_type = 'member' THEN
    v_assignment_payload := pg_catalog.jsonb_build_object(
      'assignment_id', v_assignment.id,
      'circle_id', v_assignment.circle_id,
      'definition_id', v_assignment.definition_id,
      'participant_id', v_assignment.participant_id,
      'title', v_assignment.title_snapshot,
      'description', v_assignment.description_snapshot,
      'materials', v_assignment.materials_snapshot,
      'participant_label', v_assignment.participant_label_snapshot,
      'participant_identity_marker', v_assignment.participant_identity_marker,
      'points', v_assignment.points_snapshot,
      'origin', v_assignment.origin,
      'status', v_assignment.status,
      'completion_sequence', v_assignment.completion_sequence,
      'version', v_assignment.version::text,
      'created_at', v_assignment.created_at,
      'completed_at', v_assignment.completed_at,
      'cancelled_at', v_assignment.cancelled_at
    );
  ELSIF v_membership.membership_type = 'child' THEN
    v_is_own_open := v_assignment.participant_id = v_membership.participant_id
      AND v_assignment.status = 'open';
    v_assignment_payload := pg_catalog.jsonb_build_object(
      'assignment_id', v_assignment.id,
      'title', v_assignment.title_snapshot,
      'description', v_assignment.description_snapshot,
      'materials', v_assignment.materials_snapshot,
      'participant_label', v_assignment.participant_label_snapshot,
      'participant_identity_marker', v_assignment.participant_identity_marker,
      'points', v_assignment.points_snapshot,
      'origin', v_assignment.origin,
      'status', v_assignment.status,
      'created_at', v_assignment.created_at,
      'completed_at', v_assignment.completed_at,
      'cancelled_at', v_assignment.cancelled_at,
      'own_assignment',
        v_assignment.participant_id = v_membership.participant_id,
      'version', CASE
        WHEN v_is_own_open THEN v_assignment.version::text ELSE NULL
      END,
      'can_complete', v_is_own_open,
      'can_cancel', v_is_own_open
    );
  ELSE
    RETURN public.household_chore_private_read_result(
      false, 'not_found', '{}'::jsonb
    );
  END IF;

  RETURN public.household_chore_private_read_result(
    true,
    'get_assignment_loaded',
    pg_catalog.jsonb_build_object(
      'viewer_type', v_membership.membership_type,
      'assignment', v_assignment_payload,
      'timeline_preview', COALESCE(v_timeline->'items', '[]'::jsonb)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_sync_recent(
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_inserted integer := 0;
  v_updated integer := 0;
  v_updated_second integer := 0;
  v_removed integer := 0;
  v_count integer;
  v_expired_invitation_ids uuid[] := ARRAY[]::uuid[];
  v_current_invitation_ids uuid[] := ARRAY[]::uuid[];
  v_stale_recent_ids bigint[] := ARRAY[]::bigint[];
  v_audit_event_ids uuid[] := ARRAY[]::uuid[];
  v_circle_ids uuid[] := ARRAY[]::uuid[];
  v_circle_id uuid;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN public.household_chore_private_read_result(
      false, 'feature_unavailable', '{}'::jsonb
    );
  END IF;

  -- This reconciler may run for an exact-session invitee even after the
  -- rollout entitlement is removed.  It still participates in the account
  -- deletion barrier because it writes user-bound recent-event rows.
  PERFORM public.household_chore_private_lock_user(p_actor_id);
  IF EXISTS (
    SELECT 1
    FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = p_actor_id
  ) THEN
    RETURN public.household_chore_private_read_result(
      false, 'deletion_pending', '{}'::jsonb
    );
  END IF;
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_read_result(
      false, 'feature_unavailable', '{}'::jsonb
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(scope.id ORDER BY scope.expires_at, scope.id),
    ARRAY[]::uuid[]
  )
  INTO v_expired_invitation_ids
  FROM (
    SELECT invitation_row.id, invitation_row.expires_at
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.invitee_user_id = p_actor_id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at <= pg_catalog.clock_timestamp()
    ORDER BY invitation_row.expires_at, invitation_row.id
    LIMIT 20
  ) AS scope;

  SELECT COALESCE(
    pg_catalog.array_agg(scope.id ORDER BY scope.created_at DESC, scope.id),
    ARRAY[]::uuid[]
  )
  INTO v_current_invitation_ids
  FROM (
    SELECT invitation_row.id, invitation_row.created_at
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.invitee_user_id = p_actor_id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at > pg_catalog.clock_timestamp()
      AND EXISTS (
        SELECT 1
        FROM public.household_chore_memberships AS inviter_membership
        WHERE inviter_membership.circle_id = invitation_row.circle_id
          AND inviter_membership.user_id = invitation_row.invited_by_user_id
          AND inviter_membership.status = 'active'
          AND inviter_membership.membership_type = 'member'
      )
    ORDER BY invitation_row.created_at DESC, invitation_row.id
    LIMIT 20
  ) AS scope;

  SELECT COALESCE(
    pg_catalog.array_agg(scope.id ORDER BY scope.id),
    ARRAY[]::bigint[]
  )
  INTO v_stale_recent_ids
  FROM (
    SELECT recent_row.id
    FROM public.recent_events AS recent_row
    WHERE recent_row.user_id = p_actor_id
      AND recent_row.source = 'heimilisverkin'
      AND recent_row.event_type = 'household_chore_invitation_received'
      AND recent_row.entity_type = 'household_chore_invitation'
      AND NOT EXISTS (
        SELECT 1
        FROM public.household_chore_invitations AS invitation_row
        WHERE invitation_row.id = recent_row.entity_id
          AND invitation_row.invitee_user_id = p_actor_id
          AND invitation_row.status = 'pending'
          AND invitation_row.expires_at > pg_catalog.clock_timestamp()
          AND EXISTS (
            SELECT 1
            FROM public.household_chore_memberships AS inviter_membership
            WHERE inviter_membership.circle_id = invitation_row.circle_id
              AND inviter_membership.user_id = invitation_row.invited_by_user_id
              AND inviter_membership.status = 'active'
              AND inviter_membership.membership_type = 'member'
          )
      )
    ORDER BY recent_row.id
    LIMIT 50
  ) AS scope;

  SELECT COALESCE(
    pg_catalog.array_agg(scope.id ORDER BY scope.occurred_at DESC, scope.id DESC),
    ARRAY[]::uuid[]
  )
  INTO v_audit_event_ids
  FROM (
    SELECT event_row.id, event_row.occurred_at
    FROM public.household_chore_membership_events AS event_row
    WHERE event_row.subject_user_id = p_actor_id
      AND event_row.event_type IN ('type_changed', 'removed')
    ORDER BY event_row.occurred_at DESC, event_row.id DESC
    LIMIT 50
  ) AS scope;

  -- Lock every circle whose bounded source row this sync may expire, project,
  -- update, or remove.  Target-user 9601 prevents a new invite/type event from
  -- appearing outside this snapshot; the sorted circle locks serialize this
  -- reconciler with circle deletion and inviter/account erasure.
  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT scope.circle_id ORDER BY scope.circle_id),
    ARRAY[]::uuid[]
  )
  INTO v_circle_ids
  FROM (
    SELECT invitation_row.circle_id
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.id = ANY (v_expired_invitation_ids)
       OR invitation_row.id = ANY (v_current_invitation_ids)
    UNION
    SELECT invitation_row.circle_id
    FROM public.recent_events AS recent_row
    JOIN public.household_chore_invitations AS invitation_row
      ON invitation_row.id = recent_row.entity_id
    WHERE recent_row.id = ANY (v_stale_recent_ids)
    UNION
    SELECT event_row.circle_id
    FROM public.household_chore_membership_events AS event_row
    WHERE event_row.id = ANY (v_audit_event_ids)
  ) AS scope;
  FOREACH v_circle_id IN ARRAY v_circle_ids LOOP
    PERFORM 1
    FROM public.household_chore_circles AS circle_row
    WHERE circle_row.id = v_circle_id
    FOR UPDATE;
  END LOOP;

  -- Expiry is durable, not merely hidden by the read projection.  Every
  -- affected circle above is already locked before invitation rows.
  WITH expired_invites AS (
    SELECT invitation_row.id
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.id = ANY (v_expired_invitation_ids)
      AND invitation_row.invitee_user_id = p_actor_id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at <= pg_catalog.clock_timestamp()
    FOR UPDATE
  )
  UPDATE public.household_chore_invitations AS invitation_row
  SET status = 'expired',
      responded_at = pg_catalog.clock_timestamp(),
      version = invitation_row.version + 1
  FROM expired_invites
  WHERE invitation_row.id = expired_invites.id;

  WITH current_invites AS (
    SELECT
      invitation_row.id,
      invitation_row.created_at,
      invitation_row.requested_type,
      invitation_row.inviter_label_snapshot,
      circle_row.name AS circle_name,
      circle_row.display_reference
    FROM public.household_chore_invitations AS invitation_row
    JOIN public.household_chore_circles AS circle_row
      ON circle_row.id = invitation_row.circle_id
    WHERE invitation_row.id = ANY (v_current_invitation_ids)
      AND invitation_row.invitee_user_id = p_actor_id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at > pg_catalog.clock_timestamp()
      AND EXISTS (
        SELECT 1
        FROM public.household_chore_memberships AS inviter_membership
        WHERE inviter_membership.circle_id = invitation_row.circle_id
          AND inviter_membership.user_id = invitation_row.invited_by_user_id
          AND inviter_membership.status = 'active'
          AND inviter_membership.membership_type = 'member'
      )
  ), upserted AS (
    INSERT INTO public.recent_events (
      user_id, source, event_type, entity_type, entity_id, event_key,
      payload, href, occurred_at
    )
    SELECT
      p_actor_id,
      'heimilisverkin',
      'household_chore_invitation_received',
      'household_chore_invitation',
      current_invites.id,
      'household:invitation:' || current_invites.id::text,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'circle_name', current_invites.circle_name,
        'display_reference', current_invites.display_reference,
        'inviter_label', current_invites.inviter_label_snapshot,
        'requested_type', current_invites.requested_type
      )),
      '/auth-mvp/heimilisverkin/bod/' || current_invites.id::text,
      current_invites.created_at
    FROM current_invites
    ON CONFLICT (user_id, event_key) DO UPDATE
      SET payload = EXCLUDED.payload,
          href = EXCLUDED.href,
          occurred_at = EXCLUDED.occurred_at
      WHERE public.recent_events.payload IS DISTINCT FROM EXCLUDED.payload
         OR public.recent_events.href IS DISTINCT FROM EXCLUDED.href
         OR public.recent_events.occurred_at IS DISTINCT FROM EXCLUDED.occurred_at
    RETURNING (xmax = 0) AS inserted
  )
  SELECT
    COALESCE(pg_catalog.count(*) FILTER (WHERE upserted.inserted), 0)::integer,
    COALESCE(pg_catalog.count(*) FILTER (WHERE NOT upserted.inserted), 0)::integer
  INTO v_inserted, v_updated
  FROM upserted;

  DELETE FROM public.recent_events AS recent_row
  WHERE recent_row.id = ANY (v_stale_recent_ids)
    AND recent_row.user_id = p_actor_id
    AND recent_row.source = 'heimilisverkin';
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  WITH audit_rows AS (
    SELECT
      event_row.id,
      event_row.event_type,
      event_row.new_type,
      event_row.actor_label_snapshot,
      event_row.occurred_at,
      circle_row.name AS circle_name,
      circle_row.display_reference
    FROM public.household_chore_membership_events AS event_row
    JOIN public.household_chore_circles AS circle_row
      ON circle_row.id = event_row.circle_id
    WHERE event_row.id = ANY (v_audit_event_ids)
      AND event_row.subject_user_id = p_actor_id
      AND event_row.event_type IN ('type_changed', 'removed')
  ), upserted AS (
    INSERT INTO public.recent_events (
      user_id, source, event_type, entity_type, entity_id, event_key,
      payload, href, occurred_at
    )
    SELECT
      p_actor_id,
      'heimilisverkin',
      CASE audit_rows.event_type
        WHEN 'type_changed' THEN 'household_chore_membership_type_changed'
        ELSE 'household_chore_membership_removed'
      END,
      'household_chore_membership_event',
      audit_rows.id,
      'household:membership:' || audit_rows.id::text,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'circle_name', audit_rows.circle_name,
        'display_reference', audit_rows.display_reference,
        'actor_label', audit_rows.actor_label_snapshot,
        'membership_type', audit_rows.new_type
      )),
      '/auth-mvp/heimilisverkin/adild',
      audit_rows.occurred_at
    FROM audit_rows
    ON CONFLICT (user_id, event_key) DO UPDATE
      SET payload = EXCLUDED.payload,
          href = EXCLUDED.href,
          occurred_at = EXCLUDED.occurred_at
      WHERE public.recent_events.payload IS DISTINCT FROM EXCLUDED.payload
         OR public.recent_events.href IS DISTINCT FROM EXCLUDED.href
         OR public.recent_events.occurred_at IS DISTINCT FROM EXCLUDED.occurred_at
    RETURNING (xmax = 0) AS inserted
  )
  SELECT
    COALESCE(pg_catalog.count(*) FILTER (WHERE upserted.inserted), 0)::integer,
    COALESCE(pg_catalog.count(*) FILTER (WHERE NOT upserted.inserted), 0)::integer
  INTO v_count, v_updated_second
  FROM upserted;
  v_inserted := v_inserted + v_count;
  v_updated := v_updated + v_updated_second;

  RETURN public.household_chore_private_read_result(
    true,
    'recent_synced',
    pg_catalog.jsonb_build_object(
      'inserted', v_inserted,
      'updated', v_updated,
      'removed', v_removed
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_start_mutation(
  p_actor_id uuid,
  p_request_id uuid,
  p_operation text,
  p_fingerprint bytea,
  p_require_entitlement boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request public.household_chore_mutation_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT request_row.*
  INTO v_request
  FROM public.household_chore_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id;

  IF FOUND AND v_request.status = 'completed' THEN
    IF v_request.operation IS NOT DISTINCT FROM p_operation
       AND v_request.fingerprint IS NOT DISTINCT FROM p_fingerprint
       AND v_request.resolved_target_user_id IS NULL THEN
      RETURN v_request.result;
    END IF;
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id, '{}'::jsonb
    );
  END IF;

  IF p_actor_id IS NULL OR p_request_id IS NULL THEN
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id, '{}'::jsonb
    );
  END IF;

  PERFORM public.household_chore_private_lock_user(p_actor_id);

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = p_actor_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'deletion_pending', p_request_id, '{}'::jsonb
    );
  END IF;

  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_actor_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_result(
      false, 'feature_unavailable', p_request_id, '{}'::jsonb
    );
  END IF;

  v_result := public.household_chore_private_begin_request(
    p_actor_id, p_request_id, p_operation, p_fingerprint, NULL
  );
  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;
  IF p_require_entitlement THEN
    PERFORM access_row.email
    FROM public.feature_access AS access_row
    JOIN auth.users AS account
      ON public.normalize_email_canonical(access_row.email)
       = public.normalize_email_canonical(account.email)
    WHERE account.id = p_actor_id
      AND account.email_confirmed_at IS NOT NULL
      AND access_row.feature_key = 'heimilisverkin'
    FOR SHARE OF access_row;
    IF NOT FOUND THEN
      RETURN public.household_chore_private_finish_request(
        p_actor_id, p_request_id,
        public.household_chore_private_result(
          false, 'feature_unavailable', p_request_id, '{}'::jsonb
        )
      );
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'started',
    'request_id', p_request_id,
    'data', '{}'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_start_target_mutation(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_fingerprint bytea,
  p_require_actor_entitlement boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request public.household_chore_mutation_requests%ROWTYPE;
  v_result jsonb;
  v_account_count integer;
BEGIN
  SELECT request_row.* INTO v_request
  FROM public.household_chore_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id;
  IF FOUND AND v_request.status = 'completed' THEN
    IF v_request.operation IS NOT DISTINCT FROM p_operation
       AND v_request.fingerprint IS NOT DISTINCT FROM p_fingerprint
       AND v_request.resolved_target_user_id IS NOT DISTINCT FROM p_target_user_id THEN
      RETURN v_request.result;
    END IF;
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;

  IF p_actor_id IS NULL OR p_target_user_id IS NULL OR p_request_id IS NULL THEN
    RETURN public.household_chore_private_result(
      false, 'not_found', p_request_id
    );
  END IF;

  PERFORM public.household_chore_private_lock_user(lock_user.user_id)
  FROM (
    SELECT p_actor_id AS user_id
    UNION SELECT p_target_user_id
    ORDER BY user_id
  ) AS lock_user;

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = p_actor_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'deletion_pending', p_request_id
    );
  END IF;
  IF p_target_user_id IS DISTINCT FROM p_actor_id AND EXISTS (
    SELECT 1
    FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = p_target_user_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'not_found', p_request_id
    );
  END IF;

  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id IN (p_actor_id, p_target_user_id)
  ORDER BY account.id
  FOR SHARE;
  SELECT pg_catalog.count(*)::integer
  INTO v_account_count
  FROM auth.users AS account
  WHERE account.id IN (p_actor_id, p_target_user_id);
  IF v_account_count <> (
    CASE WHEN p_actor_id = p_target_user_id THEN 1 ELSE 2 END
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'feature_unavailable', p_request_id
    );
  END IF;

  v_result := public.household_chore_private_begin_request(
    p_actor_id, p_request_id, p_operation, p_fingerprint, p_target_user_id
  );
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  IF p_require_actor_entitlement THEN
    PERFORM access_row.email
    FROM public.feature_access AS access_row
    JOIN auth.users AS account
      ON public.normalize_email_canonical(access_row.email)
       = public.normalize_email_canonical(account.email)
    WHERE account.id = p_actor_id
      AND account.email_confirmed_at IS NOT NULL
      AND access_row.feature_key = 'heimilisverkin'
    FOR SHARE OF access_row;
    IF NOT FOUND THEN
      RETURN public.household_chore_private_finish_request(
        p_actor_id, p_request_id,
        public.household_chore_private_result(
          false, 'feature_unavailable', p_request_id
        )
      );
    END IF;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'started', 'request_id', p_request_id,
    'data', '{}'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_expire_invitations(
  p_circle_id uuid,
  p_invitee_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ids uuid[];
  v_count integer := 0;
BEGIN
  SELECT COALESCE(pg_catalog.array_agg(candidate.id ORDER BY candidate.expires_at, candidate.id), ARRAY[]::uuid[])
  INTO v_ids
  FROM (
    SELECT invitation_row.id, invitation_row.expires_at
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.circle_id = p_circle_id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at <= pg_catalog.clock_timestamp()
      AND (p_invitee_user_id IS NULL
        OR invitation_row.invitee_user_id = p_invitee_user_id)
    ORDER BY invitation_row.expires_at, invitation_row.id
    LIMIT 20
    FOR UPDATE
  ) AS candidate;

  IF pg_catalog.cardinality(v_ids) > 0 THEN
    UPDATE public.household_chore_invitations AS invitation_row
    SET status = 'expired',
        responded_at = pg_catalog.clock_timestamp(),
        version = invitation_row.version + 1
    WHERE invitation_row.id = ANY(v_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_prune_rates(
  p_actor_id uuid,
  p_circle_id uuid,
  p_target_user_id uuid,
  p_participant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.household_chore_rate_events AS rate_row
  WHERE rate_row.occurred_at <= pg_catalog.clock_timestamp() - interval '24 hours'
    AND (
      rate_row.actor_user_id = p_actor_id
      OR (rate_row.circle_id = p_circle_id
        AND p_target_user_id IS NOT NULL
        AND rate_row.target_user_id = p_target_user_id)
      OR (rate_row.circle_id = p_circle_id
        AND p_participant_id IS NOT NULL
        AND rate_row.participant_id = p_participant_id)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_insert_assignment_event(
  p_assignment public.household_chore_assignments,
  p_event_type text,
  p_status_after text,
  p_actor_user_id uuid,
  p_actor_identity_marker text,
  p_completion_sequence integer,
  p_points_delta integer,
  p_cancellation_reason text,
  p_reopen_outcome text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_actor_label text;
BEGIN
  v_actor_label := CASE
    WHEN p_actor_identity_marker = 'current'
    THEN public.household_chore_private_safe_user_label(p_actor_user_id)
    ELSE NULL
  END;

  INSERT INTO public.household_chore_assignment_events (
    id, circle_id, assignment_id, definition_id, participant_id,
    event_type, status_after, participant_label_snapshot,
    participant_identity_marker, assignment_origin, snapshot_points,
    actor_user_id, actor_label_snapshot, actor_identity_marker,
    completion_sequence, points_delta, cancellation_reason, reopen_outcome
  ) VALUES (
    v_event_id, p_assignment.circle_id, p_assignment.id,
    p_assignment.definition_id, p_assignment.participant_id,
    p_event_type, p_status_after, p_assignment.participant_label_snapshot,
    p_assignment.participant_identity_marker, p_assignment.origin,
    p_assignment.points_snapshot,
    CASE WHEN p_actor_identity_marker = 'current' THEN p_actor_user_id ELSE NULL END,
    v_actor_label, p_actor_identity_marker,
    p_completion_sequence, p_points_delta, p_cancellation_reason,
    p_reopen_outcome
  );
  RETURN v_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_create_circle(
  p_actor_id uuid,
  p_request_id uuid,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text := NULLIF(pg_catalog.btrim(p_name), '');
  v_fingerprint bytea;
  v_started jsonb;
  v_circle_id uuid;
  v_participant_id uuid := pg_catalog.gen_random_uuid();
  v_reference text;
  v_label text;
  v_result jsonb;
  v_attempt integer;
  v_circle_inserted boolean := false;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object('name', v_name)
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'create_circle', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN
    RETURN v_started;
  END IF;

  IF v_name IS NULL OR pg_catalog.char_length(v_name) > 120 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'not_available', p_request_id, '{}'::jsonb
      )
    );
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
  ) >= 20 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'cap_reached', p_request_id, '{}'::jsonb
      )
    );
  END IF;

  FOR v_attempt IN 1..32 LOOP
    v_circle_id := pg_catalog.gen_random_uuid();
    v_reference := pg_catalog.upper(pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8
    ));
    BEGIN
      INSERT INTO public.household_chore_circles (
        id, name, display_reference, created_by
      ) VALUES (
        v_circle_id, v_name, v_reference, p_actor_id
      );
      v_circle_inserted := true;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_reference := NULL;
    END;
  END LOOP;
  IF NOT v_circle_inserted THEN
    RAISE EXCEPTION 'household_chore_reference_exhausted';
  END IF;

  v_label := public.household_chore_private_safe_user_label(p_actor_id);
  INSERT INTO public.household_chore_participants (
    id, circle_id, linked_user_id, display_name_snapshot
  ) VALUES (
    v_participant_id, v_circle_id, p_actor_id, v_label
  );
  INSERT INTO public.household_chore_memberships (
    circle_id, user_id, participant_id, initial_type, membership_type,
    origin
  ) VALUES (
    v_circle_id, p_actor_id, v_participant_id, 'member', 'member',
    'creator'
  );

  v_result := public.household_chore_private_result(
    true,
    'circle_created',
    p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_circle_id,
      'version', '1',
      'status', 'active',
      'display_reference', v_reference
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_rename_circle(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_expected_version bigint,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text := NULLIF(pg_catalog.btrim(p_name), '');
  v_fingerprint bytea;
  v_started jsonb;
  v_circle public.household_chore_circles%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'expected_version', p_expected_version,
      'name', v_name
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'rename_circle', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  SELECT circle_row.* INTO v_circle
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_circle.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_name IS NULL OR pg_catalog.char_length(v_name) > 120 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  UPDATE public.household_chore_circles AS circle_row
  SET name = v_name, version = circle_row.version + 1
  WHERE circle_row.id = p_circle_id
  RETURNING circle_row.* INTO v_circle;

  v_result := public.household_chore_private_result(
    true, 'circle_renamed', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_circle.id,
      'version', v_circle.version::text,
      'status', 'active'
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_delete_circle(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_expected_version bigint,
  p_display_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reference text := pg_catalog.upper(pg_catalog.btrim(p_display_reference));
  v_fingerprint bytea;
  v_tombstone public.household_chore_delete_tombstones%ROWTYPE;
  v_started jsonb;
  v_circle public.household_chore_circles%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'expected_version', p_expected_version,
      'display_reference', v_reference
    )
  );

  SELECT tombstone_row.* INTO v_tombstone
  FROM public.household_chore_delete_tombstones AS tombstone_row
  WHERE tombstone_row.actor_user_id = p_actor_id
    AND tombstone_row.request_id = p_request_id;
  IF FOUND THEN
    IF v_tombstone.fingerprint = v_fingerprint THEN
      RETURN v_tombstone.result;
    END IF;
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;

  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'delete_circle', v_fingerprint, false
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  SELECT circle_row.* INTO v_circle
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_circle.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_reference IS NULL
     OR v_reference !~ '^[0-9A-HJKMNP-TV-Z]{8}$'
     OR v_circle.display_reference IS DISTINCT FROM v_reference THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) <> 1 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_allowed', p_request_id)
    );
  END IF;

  INSERT INTO public.household_chore_delete_authorizations (
    circle_id, authorization_kind, actor_user_id, request_id
  ) VALUES (
    p_circle_id, 'request', p_actor_id, p_request_id
  );
  DELETE FROM public.recent_events AS recent_row
  WHERE recent_row.source = 'heimilisverkin'
    AND (
      (recent_row.entity_type = 'household_chore_invitation'
        AND recent_row.entity_id IN (
          SELECT invitation_row.id
          FROM public.household_chore_invitations AS invitation_row
          WHERE invitation_row.circle_id = p_circle_id
        ))
      OR (recent_row.entity_type = 'household_chore_membership_event'
        AND recent_row.entity_id IN (
          SELECT event_row.id
          FROM public.household_chore_membership_events AS event_row
          WHERE event_row.circle_id = p_circle_id
        ))
    );
  DELETE FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id;
  DELETE FROM public.household_chore_delete_authorizations AS authorization_row
  WHERE authorization_row.circle_id = p_circle_id
    AND authorization_row.authorization_kind = 'request'
    AND authorization_row.actor_user_id = p_actor_id
    AND authorization_row.request_id = p_request_id;
  v_result := public.household_chore_private_result(
    true, 'circle_deleted', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', p_circle_id,
      'version', p_expected_version::text,
      'status', 'deleted'
    )
  );
  PERFORM public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
  INSERT INTO public.household_chore_delete_tombstones (
    actor_user_id, request_id, fingerprint, result
  ) VALUES (
    p_actor_id, p_request_id, v_fingerprint, v_result
  );
  DELETE FROM public.household_chore_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_create_invitation(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_relationship_id uuid,
  p_requested_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_type text := pg_catalog.lower(pg_catalog.btrim(p_requested_type));
  v_fingerprint bytea;
  v_request public.household_chore_mutation_requests%ROWTYPE;
  v_relationship public.relationships%ROWTYPE;
  v_locked_relationship public.relationships%ROWTYPE;
  v_user_id uuid;
  v_circle public.household_chore_circles%ROWTYPE;
  v_invitation_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_result jsonb;
  v_started jsonb;
  v_locked_account_count integer;
  v_locked_access_count integer;
  v_inviter_label text;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'relationship_id', p_relationship_id,
      'requested_type', v_type
    )
  );

  SELECT request_row.* INTO v_request
  FROM public.household_chore_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id;
  IF FOUND AND v_request.status = 'completed' THEN
    IF v_request.operation = 'create_invitation'
       AND v_request.fingerprint = v_fingerprint THEN
      RETURN v_request.result;
    END IF;
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.household_chore_delete_tombstones AS tombstone_row
    WHERE tombstone_row.actor_user_id = p_actor_id
      AND tombstone_row.request_id = p_request_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;

  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_circle_id IS NULL
     OR p_relationship_id IS NULL OR v_type IS NULL
     OR v_type NOT IN ('member', 'child') THEN
    RETURN public.household_chore_private_result(
      false, 'not_available', p_request_id
    );
  END IF;

  SELECT relationship_row.* INTO v_relationship
  FROM public.relationships AS relationship_row
  WHERE relationship_row.id = p_relationship_id
    AND relationship_row.owner_id = p_actor_id
    AND relationship_row.counterpart_user_id IS NOT NULL
    AND relationship_row.counterpart_user_id <> p_actor_id;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_result(
      false, 'not_found', p_request_id
    );
  END IF;
  v_user_id := v_relationship.counterpart_user_id;

  PERFORM public.household_chore_private_lock_user(lock_user.user_id)
  FROM (
    SELECT p_actor_id AS user_id
    UNION SELECT v_user_id
    ORDER BY user_id
  ) AS lock_user;

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = p_actor_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'deletion_pending', p_request_id
    );
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = v_user_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'feature_unavailable', p_request_id
    );
  END IF;

  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id IN (p_actor_id, v_user_id)
  ORDER BY account.id
  FOR SHARE;
  SELECT pg_catalog.count(*)::integer
  INTO v_locked_account_count
  FROM auth.users AS account
  WHERE account.id IN (p_actor_id, v_user_id)
    AND account.email_confirmed_at IS NOT NULL
    AND public.normalize_email_canonical(account.email) IS NOT NULL;
  IF v_locked_account_count <> 2 THEN
    RETURN public.household_chore_private_result(
      false, 'feature_unavailable', p_request_id
    );
  END IF;

  v_started := public.household_chore_private_begin_request(
    p_actor_id, p_request_id, 'create_invitation', v_fingerprint, v_user_id
  );
  IF v_started IS NOT NULL THEN RETURN v_started; END IF;

  WITH locked_access AS MATERIALIZED (
    SELECT account.id AS user_id
    FROM public.feature_access AS access_row
    JOIN auth.users AS account
      ON public.normalize_email_canonical(access_row.email)
       = public.normalize_email_canonical(account.email)
    WHERE account.id IN (p_actor_id, v_user_id)
      AND account.email_confirmed_at IS NOT NULL
      AND access_row.feature_key = 'heimilisverkin'
    ORDER BY account.id, access_row.email
    FOR SHARE OF access_row
  )
  SELECT pg_catalog.count(DISTINCT locked_access.user_id)::integer
  INTO v_locked_access_count
  FROM locked_access;
  IF v_locked_access_count <> 2 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'feature_unavailable', p_request_id
      )
    );
  END IF;

  SELECT relationship_row.* INTO v_locked_relationship
  FROM public.relationships AS relationship_row
  WHERE relationship_row.id = p_relationship_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_locked_relationship.owner_id <> p_actor_id
     OR v_locked_relationship.counterpart_user_id IS DISTINCT FROM v_user_id
     OR v_locked_relationship.counterpart_user_id = p_actor_id THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;

  SELECT circle_row.* INTO v_circle
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;

  PERFORM public.household_chore_private_expire_invitations(
    p_circle_id, v_user_id
  );
  PERFORM public.household_chore_private_expire_invitations(
    p_circle_id, NULL
  );
  PERFORM public.household_chore_private_prune_rates(
    p_actor_id, p_circle_id, v_user_id, NULL
  );

  IF EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = v_user_id
      AND membership_row.status = 'active'
  ) OR EXISTS (
    SELECT 1
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.circle_id = p_circle_id
      AND invitation_row.invitee_user_id = v_user_id
      AND invitation_row.status = 'pending'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'conflict', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.status = 'active'
  ) >= 20 OR (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.circle_id = p_circle_id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at > v_now
  ) >= 20 OR (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.invitee_user_id = v_user_id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at > v_now
  ) >= 20 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_rate_events AS rate_row
    WHERE rate_row.rate_kind = 'invite_created'
      AND rate_row.actor_user_id = p_actor_id
      AND rate_row.occurred_at > v_now - interval '24 hours'
  ) >= 20 OR (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_rate_events AS rate_row
    WHERE rate_row.rate_kind = 'invite_created'
      AND rate_row.circle_id = p_circle_id
      AND rate_row.target_user_id = v_user_id
      AND rate_row.occurred_at > v_now - interval '24 hours'
  ) >= 3 OR EXISTS (
    SELECT 1
    FROM public.household_chore_rate_events AS rate_row
    WHERE rate_row.rate_kind = 'invite_declined'
      AND rate_row.circle_id = p_circle_id
      AND rate_row.target_user_id = v_user_id
      AND rate_row.occurred_at > v_now - interval '24 hours'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'rate_limited', p_request_id,
        pg_catalog.jsonb_build_object('retry_after_seconds', 3600)
      )
    );
  END IF;

  v_inviter_label := public.household_chore_private_safe_user_label(p_actor_id);
  INSERT INTO public.household_chore_invitations (
    id, circle_id, invitee_user_id, invited_by_user_id, relationship_id,
    requested_type, inviter_label_snapshot, expires_at, created_at,
    updated_at
  ) VALUES (
    v_invitation_id, p_circle_id, v_user_id, p_actor_id, p_relationship_id,
    v_type, v_inviter_label,
    v_now + interval '30 days', v_now, v_now
  );
  INSERT INTO public.recent_events (
    user_id, source, event_type, entity_type, entity_id, event_key,
    payload, href, occurred_at
  ) VALUES (
    v_user_id,
    'heimilisverkin',
    'household_chore_invitation_received',
    'household_chore_invitation',
    v_invitation_id,
    'household:invitation:' || v_invitation_id::text,
    pg_catalog.jsonb_build_object(
      'circle_name', v_circle.name,
      'display_reference', v_circle.display_reference,
      'inviter_label', v_inviter_label,
      'requested_type', v_type
    ),
    '/auth-mvp/heimilisverkin/bod/' || v_invitation_id::text,
    v_now
  ) ON CONFLICT (user_id, event_key) DO UPDATE
    SET payload = EXCLUDED.payload,
        href = EXCLUDED.href,
        occurred_at = EXCLUDED.occurred_at,
        ack_at = NULL;
  INSERT INTO public.household_chore_rate_events (
    rate_kind, actor_user_id, circle_id, target_user_id, occurred_at
  ) VALUES (
    'invite_created', p_actor_id, p_circle_id, v_user_id, v_now
  );

  v_result := public.household_chore_private_result(
    true, 'invitation_created', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_invitation_id,
      'version', '1',
      'status', 'pending'
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_cancel_invitation(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_invitation_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_invitation public.household_chore_invitations%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'invitation_id', p_invitation_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'cancel_invitation', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT invitation_row.* INTO v_invitation
  FROM public.household_chore_invitations AS invitation_row
  WHERE invitation_row.circle_id = p_circle_id
    AND invitation_row.id = p_invitation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_invitation.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_invitation.status <> 'pending'
     OR v_invitation.expires_at <= pg_catalog.clock_timestamp() THEN
    IF v_invitation.status = 'pending' THEN
      UPDATE public.household_chore_invitations AS invitation_row
      SET status = 'expired', responded_at = pg_catalog.clock_timestamp(),
          version = invitation_row.version + 1
      WHERE invitation_row.id = v_invitation.id;
      v_invitation.status := 'expired';
    END IF;
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_invitation.status)
      )
    );
  END IF;

  UPDATE public.household_chore_invitations AS invitation_row
  SET status = 'cancelled', responded_at = pg_catalog.clock_timestamp(),
      version = invitation_row.version + 1
  WHERE invitation_row.id = v_invitation.id
  RETURNING invitation_row.* INTO v_invitation;
  DELETE FROM public.recent_events AS recent_row
  WHERE recent_row.user_id = v_invitation.invitee_user_id
    AND recent_row.event_key = 'household:invitation:' || v_invitation.id::text;

  v_result := public.household_chore_private_result(
    true, 'invitation_cancelled', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_invitation.id,
      'version', v_invitation.version::text,
      'status', v_invitation.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_accept_invitation(
  p_actor_id uuid,
  p_request_id uuid,
  p_invitation_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_probe public.household_chore_invitations%ROWTYPE;
  v_invitation public.household_chore_invitations%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_membership_id uuid := pg_catalog.gen_random_uuid();
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'invitation_id', p_invitation_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'accept_invitation', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  SELECT invitation_row.* INTO v_probe
  FROM public.household_chore_invitations AS invitation_row
  WHERE invitation_row.id = p_invitation_id
    AND invitation_row.invitee_user_id = p_actor_id;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;

  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = v_probe.circle_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT invitation_row.* INTO v_invitation
  FROM public.household_chore_invitations AS invitation_row
  WHERE invitation_row.id = p_invitation_id
    AND invitation_row.circle_id = v_probe.circle_id
    AND invitation_row.invitee_user_id = p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_invitation.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_invitation.status <> 'pending'
     OR v_invitation.expires_at <= pg_catalog.clock_timestamp() THEN
    IF v_invitation.status = 'pending' THEN
      UPDATE public.household_chore_invitations AS invitation_row
      SET status = 'expired', responded_at = pg_catalog.clock_timestamp(),
          version = invitation_row.version + 1
      WHERE invitation_row.id = v_invitation.id;
      v_invitation.status := 'expired';
    END IF;
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_invitation.status)
      )
    );
  END IF;
  IF v_invitation.invited_by_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS inviter_membership
    WHERE inviter_membership.circle_id = v_invitation.circle_id
      AND inviter_membership.user_id = v_invitation.invited_by_user_id
      AND inviter_membership.status = 'active'
      AND inviter_membership.membership_type = 'member'
  ) THEN
    UPDATE public.household_chore_invitations AS invitation_row
    SET status = 'cancelled', responded_at = pg_catalog.clock_timestamp(),
        version = invitation_row.version + 1
    WHERE invitation_row.id = v_invitation.id;
    DELETE FROM public.recent_events AS recent_row
    WHERE recent_row.user_id = p_actor_id
      AND recent_row.event_key =
        'household:invitation:' || v_invitation.id::text;
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', 'cancelled')
      )
    );
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = v_invitation.circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'conflict', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = v_invitation.circle_id
      AND membership_row.status = 'active'
  ) >= 20 OR (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
  ) >= 20 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;

  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = v_invitation.circle_id
    AND participant_row.linked_user_id = p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    IF (
      SELECT pg_catalog.count(*)
      FROM public.household_chore_participants AS participant_row
      WHERE participant_row.circle_id = v_invitation.circle_id
    ) >= 100 THEN
      RETURN public.household_chore_private_finish_request(
        p_actor_id, p_request_id,
        public.household_chore_private_result(false, 'cap_reached', p_request_id)
      );
    END IF;
    INSERT INTO public.household_chore_participants (
      circle_id, linked_user_id, display_name_snapshot
    ) VALUES (
      v_invitation.circle_id, p_actor_id,
      public.household_chore_private_safe_user_label(p_actor_id)
    ) RETURNING * INTO v_participant;
  ELSE
    UPDATE public.household_chore_participants AS participant_row
    SET status = 'active', archive_reason = NULL,
        version = participant_row.version + 1
    WHERE participant_row.id = v_participant.id
    RETURNING participant_row.* INTO v_participant;
  END IF;

  UPDATE public.household_chore_invitations AS invitation_row
  SET status = 'accepted', responded_at = pg_catalog.clock_timestamp(),
      version = invitation_row.version + 1
  WHERE invitation_row.id = v_invitation.id
  RETURNING invitation_row.* INTO v_invitation;
  INSERT INTO public.household_chore_memberships (
    id, circle_id, user_id, participant_id, initial_type, membership_type,
    origin, accepted_invitation_id
  ) VALUES (
    v_membership_id, v_invitation.circle_id, p_actor_id, v_participant.id,
    v_invitation.requested_type, v_invitation.requested_type,
    'invitation', v_invitation.id
  );
  DELETE FROM public.recent_events AS recent_row
  WHERE recent_row.user_id = p_actor_id
    AND recent_row.event_key = 'household:invitation:' || v_invitation.id::text;

  v_result := public.household_chore_private_result(
    true, 'invitation_accepted', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_membership_id,
      'circle_id', v_invitation.circle_id,
      'version', '1',
      'status', 'active',
      'membership_type', v_invitation.requested_type
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_decline_invitation(
  p_actor_id uuid,
  p_request_id uuid,
  p_invitation_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_probe public.household_chore_invitations%ROWTYPE;
  v_invitation public.household_chore_invitations%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'invitation_id', p_invitation_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'decline_invitation', v_fingerprint, false
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  SELECT invitation_row.* INTO v_probe
  FROM public.household_chore_invitations AS invitation_row
  WHERE invitation_row.id = p_invitation_id
    AND invitation_row.invitee_user_id = p_actor_id;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = v_probe.circle_id FOR UPDATE;
  SELECT invitation_row.* INTO v_invitation
  FROM public.household_chore_invitations AS invitation_row
  WHERE invitation_row.id = p_invitation_id
    AND invitation_row.circle_id = v_probe.circle_id
    AND invitation_row.invitee_user_id = p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_invitation.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_invitation.status <> 'pending'
     OR v_invitation.expires_at <= pg_catalog.clock_timestamp() THEN
    IF v_invitation.status = 'pending' THEN
      UPDATE public.household_chore_invitations AS invitation_row
      SET status = 'expired', responded_at = pg_catalog.clock_timestamp(),
          version = invitation_row.version + 1
      WHERE invitation_row.id = v_invitation.id;
      v_invitation.status := 'expired';
    END IF;
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_invitation.status)
      )
    );
  END IF;

  UPDATE public.household_chore_invitations AS invitation_row
  SET status = 'declined', responded_at = pg_catalog.clock_timestamp(),
      version = invitation_row.version + 1
  WHERE invitation_row.id = v_invitation.id
  RETURNING invitation_row.* INTO v_invitation;
  INSERT INTO public.household_chore_rate_events (
    rate_kind, actor_user_id, circle_id, target_user_id, occurred_at
  ) VALUES (
    'invite_declined', p_actor_id, v_invitation.circle_id, p_actor_id,
    pg_catalog.clock_timestamp()
  );
  DELETE FROM public.recent_events AS recent_row
  WHERE recent_row.user_id = p_actor_id
    AND recent_row.event_key = 'household:invitation:' || v_invitation.id::text;

  v_result := public.household_chore_private_result(
    true, 'invitation_declined', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_invitation.id,
      'version', v_invitation.version::text,
      'status', v_invitation.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_change_membership_type(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_membership_id uuid,
  p_expected_version bigint,
  p_new_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_type text := pg_catalog.lower(pg_catalog.btrim(p_new_type));
  v_fingerprint bytea;
  v_request public.household_chore_mutation_requests%ROWTYPE;
  v_probe public.household_chore_memberships%ROWTYPE;
  v_membership public.household_chore_memberships%ROWTYPE;
  v_started jsonb;
  v_authorization_id uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_circle_name text;
  v_reference text;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'membership_id', p_membership_id,
      'expected_version', p_expected_version,
      'new_type', v_type
    )
  );
  SELECT request_row.* INTO v_request
  FROM public.household_chore_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id;
  IF FOUND AND v_request.status = 'completed' THEN
    IF v_request.operation = 'change_membership_type'
       AND v_request.fingerprint = v_fingerprint THEN
      RETURN v_request.result;
    END IF;
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.household_chore_delete_tombstones AS tombstone_row
    WHERE tombstone_row.actor_user_id = p_actor_id
      AND tombstone_row.request_id = p_request_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS actor_membership
    WHERE actor_membership.circle_id = p_circle_id
      AND actor_membership.user_id = p_actor_id
      AND actor_membership.status = 'active'
      AND actor_membership.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'not_found', p_request_id
    );
  END IF;
  SELECT membership_row.* INTO v_probe
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.id = p_membership_id
    AND membership_row.status = 'active'
    AND membership_row.user_id IS NOT NULL;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_result(
      false, 'not_found', p_request_id
    );
  END IF;
  v_started := public.household_chore_private_start_target_mutation(
    p_actor_id, v_probe.user_id, p_request_id,
    'change_membership_type', v_fingerprint, true
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  SELECT circle_row.name, circle_row.display_reference
  INTO v_circle_name, v_reference
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS actor_membership
    WHERE actor_membership.circle_id = p_circle_id
      AND actor_membership.user_id = p_actor_id
      AND actor_membership.status = 'active'
      AND actor_membership.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.id = p_membership_id
    AND membership_row.status = 'active'
    AND membership_row.user_id = v_probe.user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_membership.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_type IS NULL OR v_type NOT IN ('member', 'child')
     OR v_type IS NOT DISTINCT FROM v_membership.membership_type THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  IF v_membership.membership_type = 'member' AND v_type = 'child' AND (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) <= 1 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'last_full_member', p_request_id)
    );
  END IF;

  INSERT INTO public.household_chore_type_authorizations (
    authorization_id, circle_id, membership_id, actor_user_id, request_id,
    old_type, new_type
  ) VALUES (
    v_authorization_id, p_circle_id, p_membership_id, p_actor_id, p_request_id,
    v_membership.membership_type, v_type
  );
  PERFORM pg_catalog.set_config(
    'teskeid.household_type_authorization', v_authorization_id::text, true
  );
  UPDATE public.household_chore_memberships AS membership_row
  SET membership_type = v_type,
      version = membership_row.version + 1
  WHERE membership_row.id = p_membership_id
  RETURNING membership_row.* INTO v_membership;
  DELETE FROM public.household_chore_type_authorizations AS authorization_row
  WHERE authorization_row.authorization_id = v_authorization_id;

  IF v_type = 'child' THEN
    UPDATE public.household_chore_invitations AS invitation_row
    SET status = 'cancelled', responded_at = pg_catalog.clock_timestamp(),
        version = invitation_row.version + 1
    WHERE invitation_row.circle_id = p_circle_id
      AND invitation_row.invited_by_user_id = v_membership.user_id
      AND invitation_row.status = 'pending';
    DELETE FROM public.recent_events AS recent_row
    WHERE recent_row.source = 'heimilisverkin'
      AND recent_row.entity_type = 'household_chore_invitation'
      AND recent_row.entity_id IN (
        SELECT invitation_row.id
        FROM public.household_chore_invitations AS invitation_row
        WHERE invitation_row.circle_id = p_circle_id
          AND invitation_row.invited_by_user_id = v_membership.user_id
          AND invitation_row.status = 'cancelled'
      );
  END IF;

  INSERT INTO public.household_chore_membership_events (
    id, circle_id, membership_id, subject_user_id, actor_user_id,
    event_type, old_type, new_type, actor_label_snapshot
  ) VALUES (
    v_event_id, p_circle_id, p_membership_id, v_membership.user_id,
    p_actor_id, 'type_changed', v_probe.membership_type, v_type,
    public.household_chore_private_safe_user_label(p_actor_id)
  );
  INSERT INTO public.recent_events (
    user_id, source, event_type, entity_type, entity_id, event_key,
    payload, href, occurred_at
  ) VALUES (
    v_membership.user_id, 'heimilisverkin',
    'household_chore_membership_type_changed',
    'household_chore_membership_event', v_event_id,
    'household:membership:' || v_event_id::text,
    pg_catalog.jsonb_build_object(
      'circle_name', v_circle_name,
      'display_reference', v_reference,
      'actor_label', public.household_chore_private_safe_user_label(p_actor_id),
      'membership_type', v_type
    ),
    '/auth-mvp/heimilisverkin/adild',
    pg_catalog.clock_timestamp()
  ) ON CONFLICT (user_id, event_key) DO NOTHING;

  v_result := public.household_chore_private_result(
    true, 'membership_type_changed', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_membership.id,
      'version', v_membership.version::text,
      'status', v_membership.status,
      'membership_type', v_membership.membership_type
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_end_membership(
  p_actor_id uuid,
  p_membership public.household_chore_memberships,
  p_new_status text,
  p_cancel_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_event_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF p_new_status IS NULL OR p_new_status NOT IN ('left', 'removed')
     OR p_cancel_reason IS NULL
     OR p_cancel_reason NOT IN ('member_left', 'member_removed') THEN
    RAISE EXCEPTION 'household_chore_end_membership_invalid';
  END IF;

  FOR v_assignment IN
    SELECT assignment_row.*
    FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.circle_id = p_membership.circle_id
      AND assignment_row.participant_id = p_membership.participant_id
      AND assignment_row.status = 'open'
    ORDER BY assignment_row.id
    FOR UPDATE
  LOOP
    UPDATE public.household_chore_assignments AS assignment_row
    SET status = 'cancelled',
        cancelled_at = pg_catalog.clock_timestamp(),
        cancellation_reason = p_cancel_reason,
        version = assignment_row.version + 1
    WHERE assignment_row.id = v_assignment.id
    RETURNING assignment_row.* INTO v_assignment;
    PERFORM public.household_chore_private_insert_assignment_event(
      v_assignment, 'cancelled', 'cancelled', p_actor_id, 'current',
      NULL, NULL, p_cancel_reason, NULL
    );
  END LOOP;

  UPDATE public.household_chore_participant_values AS value_row
  SET status = 'inactive', version = value_row.version + 1
  WHERE value_row.circle_id = p_membership.circle_id
    AND value_row.participant_id = p_membership.participant_id
    AND value_row.status = 'active';
  UPDATE public.household_chore_participants AS participant_row
  SET status = 'archived', archive_reason = p_cancel_reason,
      version = participant_row.version + 1
  WHERE participant_row.circle_id = p_membership.circle_id
    AND participant_row.id = p_membership.participant_id;
  UPDATE public.household_chore_invitations AS invitation_row
  SET status = 'cancelled', responded_at = pg_catalog.clock_timestamp(),
      version = invitation_row.version + 1
  WHERE invitation_row.circle_id = p_membership.circle_id
    AND invitation_row.invited_by_user_id = p_membership.user_id
    AND invitation_row.status = 'pending';
  DELETE FROM public.recent_events AS recent_row
  WHERE recent_row.source = 'heimilisverkin'
    AND recent_row.entity_type = 'household_chore_invitation'
    AND recent_row.entity_id IN (
      SELECT invitation_row.id
      FROM public.household_chore_invitations AS invitation_row
      WHERE invitation_row.circle_id = p_membership.circle_id
        AND invitation_row.invited_by_user_id = p_membership.user_id
        AND invitation_row.status = 'cancelled'
    );
  UPDATE public.household_chore_memberships AS membership_row
  SET status = p_new_status,
      ended_at = pg_catalog.clock_timestamp(),
      version = membership_row.version + 1
  WHERE membership_row.id = p_membership.id;

  INSERT INTO public.household_chore_membership_events (
    id, circle_id, membership_id, subject_user_id, actor_user_id,
    event_type, old_type, new_type, actor_label_snapshot
  ) VALUES (
    v_event_id, p_membership.circle_id, p_membership.id,
    p_membership.user_id, p_actor_id, p_new_status,
    p_membership.membership_type, NULL,
    public.household_chore_private_safe_user_label(p_actor_id)
  );
  RETURN v_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_remove_member(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_membership_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_request public.household_chore_mutation_requests%ROWTYPE;
  v_probe public.household_chore_memberships%ROWTYPE;
  v_membership public.household_chore_memberships%ROWTYPE;
  v_started jsonb;
  v_event_id uuid;
  v_circle public.household_chore_circles%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'membership_id', p_membership_id,
      'expected_version', p_expected_version
    )
  );
  SELECT request_row.* INTO v_request
  FROM public.household_chore_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id;
  IF FOUND AND v_request.status = 'completed' THEN
    IF v_request.operation = 'remove_member'
       AND v_request.fingerprint = v_fingerprint THEN
      RETURN v_request.result;
    END IF;
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.household_chore_delete_tombstones AS tombstone_row
    WHERE tombstone_row.actor_user_id = p_actor_id
      AND tombstone_row.request_id = p_request_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS actor_membership
    WHERE actor_membership.circle_id = p_circle_id
      AND actor_membership.user_id = p_actor_id
      AND actor_membership.status = 'active'
      AND actor_membership.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'not_found', p_request_id
    );
  END IF;
  SELECT membership_row.* INTO v_probe
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.id = p_membership_id
    AND membership_row.status = 'active'
    AND membership_row.user_id IS NOT NULL;
  IF NOT FOUND OR v_probe.user_id = p_actor_id THEN
    RETURN public.household_chore_private_result(
      false, 'not_found', p_request_id
    );
  END IF;
  v_started := public.household_chore_private_start_target_mutation(
    p_actor_id, v_probe.user_id, p_request_id,
    'remove_member', v_fingerprint, true
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  SELECT circle_row.* INTO v_circle
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS actor_membership
    WHERE actor_membership.circle_id = p_circle_id
      AND actor_membership.user_id = p_actor_id
      AND actor_membership.status = 'active'
      AND actor_membership.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.id = p_membership_id
    AND membership_row.status = 'active'
    AND membership_row.user_id = v_probe.user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_membership.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_membership.membership_type = 'member' AND (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) <= 1 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'last_full_member', p_request_id)
    );
  END IF;

  v_event_id := public.household_chore_private_end_membership(
    p_actor_id, v_membership, 'removed', 'member_removed'
  );
  INSERT INTO public.recent_events (
    user_id, source, event_type, entity_type, entity_id, event_key,
    payload, href, occurred_at
  ) VALUES (
    v_membership.user_id, 'heimilisverkin',
    'household_chore_membership_removed',
    'household_chore_membership_event', v_event_id,
    'household:membership:' || v_event_id::text,
    pg_catalog.jsonb_build_object(
      'circle_name', v_circle.name,
      'display_reference', v_circle.display_reference,
      'actor_label', public.household_chore_private_safe_user_label(p_actor_id)
    ),
    '/auth-mvp/heimilisverkin/adild',
    pg_catalog.clock_timestamp()
  ) ON CONFLICT (user_id, event_key) DO NOTHING;

  v_result := public.household_chore_private_result(
    true, 'membership_removed', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_membership.id,
      'version', (v_membership.version + 1)::text,
      'status', 'removed'
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_leave_circle(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_membership public.household_chore_memberships%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'leave_circle', v_fingerprint, false
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_membership.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_membership.membership_type = 'member' AND (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) <= 1 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'last_full_member', p_request_id)
    );
  END IF;

  PERFORM public.household_chore_private_end_membership(
    p_actor_id, v_membership, 'left', 'member_left'
  );
  v_result := public.household_chore_private_result(
    true, 'membership_left', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_membership.id,
      'version', (v_membership.version + 1)::text,
      'status', 'left'
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_create_participant(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_label text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_label text := NULLIF(pg_catalog.btrim(p_label), '');
  v_fingerprint bytea;
  v_started jsonb;
  v_participant public.household_chore_participants%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object('circle_id', p_circle_id, 'label', v_label)
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'create_participant', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_label IS NULL OR pg_catalog.char_length(v_label) > 120
     OR pg_catalog.strpos(v_label, '@') > 0 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_participants AS participant_row
    WHERE participant_row.circle_id = p_circle_id
  ) >= 100 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;

  INSERT INTO public.household_chore_participants (
    circle_id, display_name_snapshot
  ) VALUES (
    p_circle_id, v_label
  ) RETURNING * INTO v_participant;
  v_result := public.household_chore_private_result(
    true, 'participant_created', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_participant.id,
      'version', v_participant.version::text,
      'status', v_participant.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_archive_participant(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_participant_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_participant public.household_chore_participants%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'participant_id', p_participant_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'archive_participant', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = p_participant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_participant.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_participant.status <> 'active' OR EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.participant_id = p_participant_id
      AND membership_row.status = 'active'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  FOR v_assignment IN
    SELECT assignment_row.*
    FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.circle_id = p_circle_id
      AND assignment_row.participant_id = p_participant_id
      AND assignment_row.status = 'open'
    ORDER BY assignment_row.id
    FOR UPDATE
  LOOP
    UPDATE public.household_chore_assignments AS assignment_row
    SET status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp(),
        cancellation_reason = 'participant_archived',
        version = assignment_row.version + 1
    WHERE assignment_row.id = v_assignment.id
    RETURNING assignment_row.* INTO v_assignment;
    PERFORM public.household_chore_private_insert_assignment_event(
      v_assignment, 'cancelled', 'cancelled', p_actor_id, 'current',
      NULL, NULL, 'participant_archived', NULL
    );
  END LOOP;
  UPDATE public.household_chore_participant_values AS value_row
  SET status = 'inactive', version = value_row.version + 1
  WHERE value_row.circle_id = p_circle_id
    AND value_row.participant_id = p_participant_id
    AND value_row.status = 'active';
  UPDATE public.household_chore_participants AS participant_row
  SET status = 'archived', archive_reason = 'manual',
      version = participant_row.version + 1
  WHERE participant_row.id = p_participant_id
  RETURNING participant_row.* INTO v_participant;

  v_result := public.household_chore_private_result(
    true, 'participant_archived', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_participant.id,
      'version', v_participant.version::text,
      'status', v_participant.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_reactivate_participant(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_participant_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_participant public.household_chore_participants%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'participant_id', p_participant_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'reactivate_participant', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = p_participant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_participant.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_participant.status <> 'archived'
     OR v_participant.identity_marker <> 'current'
     OR (v_participant.linked_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.household_chore_memberships AS membership_row
       WHERE membership_row.circle_id = p_circle_id
         AND membership_row.participant_id = p_participant_id
         AND membership_row.user_id = v_participant.linked_user_id
         AND membership_row.status = 'active'
     )) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  UPDATE public.household_chore_participants AS participant_row
  SET status = 'active', archive_reason = NULL,
      version = participant_row.version + 1
  WHERE participant_row.id = p_participant_id
  RETURNING participant_row.* INTO v_participant;
  v_result := public.household_chore_private_result(
    true, 'participant_reactivated', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_participant.id,
      'version', v_participant.version::text,
      'status', v_participant.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_create_definition(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_title text,
  p_description text,
  p_materials text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_title text := NULLIF(pg_catalog.btrim(p_title), '');
  v_description text := NULLIF(pg_catalog.btrim(p_description), '');
  v_materials text := NULLIF(pg_catalog.btrim(p_materials), '');
  v_fingerprint bytea;
  v_started jsonb;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'title', v_title,
      'description', v_description, 'materials', v_materials
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'create_definition', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_title IS NULL OR pg_catalog.char_length(v_title) > 120
     OR pg_catalog.char_length(COALESCE(v_description, '')) > 2000
     OR pg_catalog.char_length(COALESCE(v_materials, '')) > 4000 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*)
    FROM public.household_chore_definitions AS definition_row
    WHERE definition_row.circle_id = p_circle_id
  ) >= 200 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;
  INSERT INTO public.household_chore_definitions (
    circle_id, title, description, materials, created_by
  ) VALUES (
    p_circle_id, v_title, v_description, v_materials, p_actor_id
  ) RETURNING * INTO v_definition;
  INSERT INTO public.household_chore_definition_events (
    circle_id, definition_id, actor_user_id, event_type
  ) VALUES (
    p_circle_id, v_definition.id, p_actor_id, 'created'
  );
  v_result := public.household_chore_private_result(
    true, 'definition_created', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_definition.id,
      'version', v_definition.version::text,
      'status', v_definition.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_update_definition(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_expected_version bigint,
  p_title text,
  p_description text,
  p_materials text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_title text := NULLIF(pg_catalog.btrim(p_title), '');
  v_description text := NULLIF(pg_catalog.btrim(p_description), '');
  v_materials text := NULLIF(pg_catalog.btrim(p_materials), '');
  v_fingerprint bytea;
  v_started jsonb;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'definition_id', p_definition_id,
      'expected_version', p_expected_version, 'title', v_title,
      'description', v_description, 'materials', v_materials
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'update_definition', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_definition.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_definition.status <> 'active' OR v_title IS NULL
     OR pg_catalog.char_length(v_title) > 120
     OR pg_catalog.char_length(COALESCE(v_description, '')) > 2000
     OR pg_catalog.char_length(COALESCE(v_materials, '')) > 4000 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  UPDATE public.household_chore_definitions AS definition_row
  SET title = v_title, description = v_description, materials = v_materials,
      version = definition_row.version + 1
  WHERE definition_row.id = p_definition_id
  RETURNING definition_row.* INTO v_definition;
  INSERT INTO public.household_chore_definition_events (
    circle_id, definition_id, actor_user_id, event_type
  ) VALUES (
    p_circle_id, p_definition_id, p_actor_id, 'updated'
  );
  v_result := public.household_chore_private_result(
    true, 'definition_updated', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_definition.id,
      'version', v_definition.version::text,
      'status', v_definition.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_archive_definition(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'definition_id', p_definition_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'archive_definition', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_definition.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_definition.status <> 'active' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_definition.status))
    );
  END IF;
  UPDATE public.household_chore_definitions AS definition_row
  SET status = 'archived', archived_at = pg_catalog.clock_timestamp(),
      version = definition_row.version + 1
  WHERE definition_row.id = p_definition_id
  RETURNING definition_row.* INTO v_definition;
  INSERT INTO public.household_chore_definition_events (
    circle_id, definition_id, actor_user_id, event_type
  ) VALUES (p_circle_id, p_definition_id, p_actor_id, 'archived');
  v_result := public.household_chore_private_result(
    true, 'definition_archived', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_definition.id,
      'version', v_definition.version::text,
      'status', v_definition.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_reactivate_definition(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'definition_id', p_definition_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'reactivate_definition', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_definition.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_definition.status <> 'archived' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  UPDATE public.household_chore_definitions AS definition_row
  SET status = 'active', archived_at = NULL,
      version = definition_row.version + 1
  WHERE definition_row.id = p_definition_id
  RETURNING definition_row.* INTO v_definition;
  INSERT INTO public.household_chore_definition_events (
    circle_id, definition_id, actor_user_id, event_type
  ) VALUES (p_circle_id, p_definition_id, p_actor_id, 'reactivated');
  v_result := public.household_chore_private_result(
    true, 'definition_reactivated', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_definition.id,
      'version', v_definition.version::text,
      'status', v_definition.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_set_participant_value(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_participant_id uuid,
  p_expected_definition_version bigint,
  p_expected_value_version bigint,
  p_points integer,
  p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_value public.household_chore_participant_values%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'definition_id', p_definition_id,
      'participant_id', p_participant_id,
      'expected_definition_version', p_expected_definition_version,
      'expected_value_version', p_expected_value_version,
      'points', p_points, 'active', p_active
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'set_participant_value', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id FOR UPDATE;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = p_participant_id FOR UPDATE;
  IF v_definition.id IS NULL OR v_participant.id IS NULL THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_definition.version IS DISTINCT FROM p_expected_definition_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  SELECT value_row.* INTO v_value
  FROM public.household_chore_participant_values AS value_row
  WHERE value_row.circle_id = p_circle_id
    AND value_row.definition_id = p_definition_id
    AND value_row.participant_id = p_participant_id
  FOR UPDATE;

  IF p_active IS TRUE THEN
    IF p_points IS NULL OR p_points NOT BETWEEN 1 AND 100
       OR v_definition.status <> 'active'
       OR v_participant.status <> 'active' THEN
      RETURN public.household_chore_private_finish_request(
        p_actor_id, p_request_id,
        public.household_chore_private_result(false, 'not_available', p_request_id)
      );
    END IF;
    IF FOUND THEN
      IF p_expected_value_version <= 0
         OR v_value.version IS DISTINCT FROM p_expected_value_version THEN
        RETURN public.household_chore_private_finish_request(
          p_actor_id, p_request_id,
          public.household_chore_private_result(false, 'stale_value', p_request_id)
        );
      END IF;
      UPDATE public.household_chore_participant_values AS value_row
      SET points = p_points, status = 'active',
          version = value_row.version + 1
      WHERE value_row.id = v_value.id
      RETURNING value_row.* INTO v_value;
    ELSE
      IF p_expected_value_version IS DISTINCT FROM 0 THEN
        RETURN public.household_chore_private_finish_request(
          p_actor_id, p_request_id,
          public.household_chore_private_result(false, 'stale_value', p_request_id)
        );
      END IF;
      INSERT INTO public.household_chore_participant_values (
        circle_id, definition_id, participant_id, points
      ) VALUES (
        p_circle_id, p_definition_id, p_participant_id, p_points
      ) RETURNING * INTO v_value;
    END IF;
  ELSIF p_active IS FALSE THEN
    IF p_points IS NOT NULL OR NOT FOUND OR p_expected_value_version <= 0
       OR v_value.version IS DISTINCT FROM p_expected_value_version THEN
      RETURN public.household_chore_private_finish_request(
        p_actor_id, p_request_id,
        public.household_chore_private_result(
          false,
          CASE WHEN v_value.id IS NULL THEN 'not_found' ELSE 'stale_value' END,
          p_request_id
        )
      );
    END IF;
    UPDATE public.household_chore_participant_values AS value_row
    SET status = 'inactive', version = value_row.version + 1
    WHERE value_row.id = v_value.id
    RETURNING value_row.* INTO v_value;
  ELSE
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  v_result := public.household_chore_private_result(
    true, 'participant_value_set', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_value.id,
      'version', v_value.version::text,
      'status', v_value.status,
      'points', v_value.points
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_create_assignment(
  p_actor_id uuid,
  p_definition public.household_chore_definitions,
  p_participant public.household_chore_participants,
  p_value public.household_chore_participant_values,
  p_origin text,
  p_repeated_from_assignment_id uuid
)
RETURNS public.household_chore_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_assignment public.household_chore_assignments%ROWTYPE;
BEGIN
  INSERT INTO public.household_chore_assignments (
    circle_id, definition_id, participant_id,
    repeated_from_assignment_id, definition_version_snapshot,
    title_snapshot, description_snapshot, materials_snapshot,
    participant_label_snapshot, participant_identity_marker,
    points_snapshot, origin, assigned_by_user_id
  ) VALUES (
    p_definition.circle_id, p_definition.id, p_participant.id,
    p_repeated_from_assignment_id, p_definition.version,
    p_definition.title, p_definition.description, p_definition.materials,
    p_participant.display_name_snapshot, p_participant.identity_marker,
    p_value.points, p_origin, p_actor_id
  ) RETURNING * INTO v_assignment;
  PERFORM public.household_chore_private_insert_assignment_event(
    v_assignment, 'created', 'open', p_actor_id, 'current',
    NULL, NULL, NULL, NULL
  );
  RETURN v_assignment;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_assign(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_participant_id uuid,
  p_expected_definition_version bigint,
  p_expected_value_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_value public.household_chore_participant_values%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'definition_id', p_definition_id,
      'participant_id', p_participant_id,
      'expected_definition_version', p_expected_definition_version,
      'expected_value_version', p_expected_value_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'assign', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id FOR UPDATE;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = p_participant_id FOR UPDATE;
  SELECT value_row.* INTO v_value
  FROM public.household_chore_participant_values AS value_row
  WHERE value_row.circle_id = p_circle_id
    AND value_row.definition_id = p_definition_id
    AND value_row.participant_id = p_participant_id FOR UPDATE;
  IF v_definition.id IS NULL OR v_participant.id IS NULL OR v_value.id IS NULL THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_definition.version IS DISTINCT FROM p_expected_definition_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_value.version IS DISTINCT FROM p_expected_value_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_value', p_request_id)
    );
  END IF;
  IF v_definition.status <> 'active' OR v_participant.status <> 'active'
     OR v_value.status <> 'active' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*) FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.circle_id = p_circle_id AND assignment_row.status = 'open'
  ) >= 500 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;
  v_assignment := public.household_chore_private_create_assignment(
    p_actor_id, v_definition, v_participant, v_value,
    'member_assigned', NULL
  );
  v_result := public.household_chore_private_result(
    true, 'assignment_created', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'version', v_assignment.version::text,
      'status', v_assignment.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_self_assign(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_definition_id uuid,
  p_expected_definition_version bigint,
  p_expected_value_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_membership public.household_chore_memberships%ROWTYPE;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_value public.household_chore_participant_values%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'definition_id', p_definition_id,
      'expected_definition_version', p_expected_definition_version,
      'expected_value_version', p_expected_value_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'self_assign', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active'
    AND membership_row.membership_type IN ('member', 'child')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_allowed', p_request_id)
    );
  END IF;
  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = p_definition_id FOR UPDATE;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = v_membership.participant_id
    AND participant_row.linked_user_id = p_actor_id FOR UPDATE;
  SELECT value_row.* INTO v_value
  FROM public.household_chore_participant_values AS value_row
  WHERE value_row.circle_id = p_circle_id
    AND value_row.definition_id = p_definition_id
    AND value_row.participant_id = v_membership.participant_id FOR UPDATE;
  IF v_definition.id IS NULL OR v_participant.id IS NULL OR v_value.id IS NULL THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  IF v_definition.version IS DISTINCT FROM p_expected_definition_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_value.version IS DISTINCT FROM p_expected_value_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_value', p_request_id)
    );
  END IF;
  IF v_definition.status <> 'active' OR v_participant.status <> 'active'
     OR v_value.status <> 'active' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  PERFORM public.household_chore_private_prune_rates(
    p_actor_id, p_circle_id, NULL, v_membership.participant_id
  );
  IF (
    SELECT pg_catalog.count(*) FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.circle_id = p_circle_id AND assignment_row.status = 'open'
  ) >= 500 OR (
    SELECT pg_catalog.count(*) FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.circle_id = p_circle_id
      AND assignment_row.participant_id = v_membership.participant_id
      AND assignment_row.origin = 'self_assigned'
      AND assignment_row.status = 'open'
  ) >= 25 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*) FROM public.household_chore_rate_events AS rate_row
    WHERE rate_row.rate_kind = 'self_assign_created'
      AND rate_row.circle_id = p_circle_id
      AND rate_row.participant_id = v_membership.participant_id
      AND rate_row.occurred_at > v_now - interval '24 hours'
  ) >= 20 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'rate_limited', p_request_id,
        pg_catalog.jsonb_build_object('retry_after_seconds', 3600)
      )
    );
  END IF;
  v_assignment := public.household_chore_private_create_assignment(
    p_actor_id, v_definition, v_participant, v_value,
    'self_assigned', NULL
  );
  INSERT INTO public.household_chore_rate_events (
    rate_kind, actor_user_id, circle_id, participant_id, occurred_at
  ) VALUES (
    'self_assign_created', p_actor_id, p_circle_id,
    v_membership.participant_id, v_now
  );
  v_result := public.household_chore_private_result(
    true, 'assignment_created', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'version', v_assignment.version::text,
      'status', v_assignment.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_repeat_assignment(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_source_assignment_id uuid,
  p_expected_source_version bigint,
  p_expected_definition_version bigint,
  p_expected_value_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_source public.household_chore_assignments%ROWTYPE;
  v_definition public.household_chore_definitions%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_value public.household_chore_participant_values%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'source_assignment_id', p_source_assignment_id,
      'expected_source_version', p_expected_source_version,
      'expected_definition_version', p_expected_definition_version,
      'expected_value_version', p_expected_value_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'repeat_assignment', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT assignment_row.* INTO v_source
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_source_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_source.version IS DISTINCT FROM p_expected_source_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_source.status = 'open' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  SELECT definition_row.* INTO v_definition
  FROM public.household_chore_definitions AS definition_row
  WHERE definition_row.circle_id = p_circle_id
    AND definition_row.id = v_source.definition_id FOR UPDATE;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = v_source.participant_id FOR UPDATE;
  SELECT value_row.* INTO v_value
  FROM public.household_chore_participant_values AS value_row
  WHERE value_row.circle_id = p_circle_id
    AND value_row.definition_id = v_source.definition_id
    AND value_row.participant_id = v_source.participant_id FOR UPDATE;
  IF v_definition.id IS NULL OR v_participant.id IS NULL OR v_value.id IS NULL
     OR v_definition.status <> 'active' OR v_participant.status <> 'active'
     OR v_value.status <> 'active' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;
  IF v_definition.version IS DISTINCT FROM p_expected_definition_version
     OR v_source.definition_id <> v_definition.id THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_value.version IS DISTINCT FROM p_expected_value_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_value', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*) FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.circle_id = p_circle_id AND assignment_row.status = 'open'
  ) >= 500 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;
  v_assignment := public.household_chore_private_create_assignment(
    p_actor_id, v_definition, v_participant, v_value,
    'member_repeated', v_source.id
  );
  v_result := public.household_chore_private_result(
    true, 'assignment_repeated', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'source_assignment_id', v_source.id,
      'version', v_assignment.version::text,
      'status', v_assignment.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_complete_assignment(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_membership public.household_chore_memberships%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_sequence integer;
  v_event_type text;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'assignment_id', p_assignment_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'complete_assignment', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT assignment_row.* INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_assignment.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_assignment.status <> 'open' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_assignment.status)
      )
    );
  END IF;
  IF v_membership.membership_type = 'child'
     AND v_assignment.participant_id <> v_membership.participant_id THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_allowed', p_request_id)
    );
  END IF;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = v_assignment.participant_id FOR UPDATE;
  IF NOT FOUND OR v_participant.status <> 'active'
     OR (v_participant.linked_user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.household_chore_memberships AS target_membership
       WHERE target_membership.circle_id = p_circle_id
         AND target_membership.participant_id = v_participant.id
         AND target_membership.user_id = v_participant.linked_user_id
         AND target_membership.status = 'active'
     )) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  v_sequence := v_assignment.completion_sequence + 1;
  v_event_type := CASE WHEN v_sequence = 1 THEN 'completed' ELSE 'recompleted' END;
  UPDATE public.household_chore_assignments AS assignment_row
  SET status = 'completed', completion_sequence = v_sequence,
      completed_by_user_id = p_actor_id,
      completed_at = pg_catalog.clock_timestamp(),
      cancelled_at = NULL, cancellation_reason = NULL,
      version = assignment_row.version + 1
  WHERE assignment_row.id = p_assignment_id
  RETURNING assignment_row.* INTO v_assignment;
  INSERT INTO public.household_chore_point_entries (
    circle_id, assignment_id, participant_id, entry_kind,
    completion_sequence, points_delta, actor_user_id
  ) VALUES (
    p_circle_id, p_assignment_id, v_assignment.participant_id, 'earned',
    v_sequence, v_assignment.points_snapshot, p_actor_id
  );
  PERFORM public.household_chore_private_insert_assignment_event(
    v_assignment, v_event_type, 'completed', p_actor_id, 'current',
    v_sequence, v_assignment.points_snapshot, NULL, NULL
  );
  v_result := public.household_chore_private_result(
    true, 'assignment_completed', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'version', v_assignment.version::text,
      'status', v_assignment.status,
      'completion_sequence', v_sequence::text,
      'points_delta', v_assignment.points_snapshot
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_cancel_assignment(
  p_actor_id uuid,
  p_assignment public.household_chore_assignments,
  p_reason text
)
RETURNS public.household_chore_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_assignment public.household_chore_assignments%ROWTYPE;
BEGIN
  UPDATE public.household_chore_assignments AS assignment_row
  SET status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp(),
      cancellation_reason = p_reason,
      version = assignment_row.version + 1
  WHERE assignment_row.id = p_assignment.id
    AND assignment_row.circle_id = p_assignment.circle_id
    AND assignment_row.status = 'open'
  RETURNING assignment_row.* INTO v_assignment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'household_chore_cancel_assignment_drift';
  END IF;
  PERFORM public.household_chore_private_insert_assignment_event(
    v_assignment, 'cancelled', 'cancelled', p_actor_id, 'current',
    NULL, NULL, p_reason, NULL
  );
  RETURN v_assignment;
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_cancel_assignment(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'assignment_id', p_assignment_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'cancel_assignment', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT assignment_row.* INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_assignment.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_assignment.status <> 'open' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_assignment.status)
      )
    );
  END IF;
  v_assignment := public.household_chore_private_cancel_assignment(
    p_actor_id, v_assignment, 'member_cancelled'
  );
  v_result := public.household_chore_private_result(
    true, 'assignment_cancelled', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'version', v_assignment.version::text,
      'status', v_assignment.status,
      'points_delta', 0
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_cancel_own_assignment(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_membership public.household_chore_memberships%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'assignment_id', p_assignment_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'cancel_own_assignment', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  SELECT membership_row.* INTO v_membership
  FROM public.household_chore_memberships AS membership_row
  WHERE membership_row.circle_id = p_circle_id
    AND membership_row.user_id = p_actor_id
    AND membership_row.status = 'active'
    AND membership_row.membership_type = 'child'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_allowed', p_request_id)
    );
  END IF;
  SELECT assignment_row.* INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.participant_id <> v_membership.participant_id THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_assignment.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_assignment.status <> 'open' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_assignment.status)
      )
    );
  END IF;
  v_assignment := public.household_chore_private_cancel_assignment(
    p_actor_id, v_assignment, 'child_cancelled'
  );
  v_result := public.household_chore_private_result(
    true, 'assignment_cancelled', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'version', v_assignment.version::text,
      'status', v_assignment.status,
      'points_delta', 0
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_undo_completion(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_assignment_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_earned public.household_chore_point_entries%ROWTYPE;
  v_reopen boolean := false;
  v_reason text;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id, 'assignment_id', p_assignment_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'undo_completion', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;
  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT assignment_row.* INTO v_assignment
  FROM public.household_chore_assignments AS assignment_row
  WHERE assignment_row.circle_id = p_circle_id
    AND assignment_row.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_assignment.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_assignment.status <> 'completed' THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_assignment.status)
      )
    );
  END IF;
  SELECT point_row.* INTO v_earned
  FROM public.household_chore_point_entries AS point_row
  WHERE point_row.circle_id = p_circle_id
    AND point_row.assignment_id = p_assignment_id
    AND point_row.completion_sequence = v_assignment.completion_sequence
    AND point_row.entry_kind = 'earned'
  FOR UPDATE;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.household_chore_point_entries AS reversal_row
    WHERE reversal_row.reverses_entry_id = v_earned.id
  ) THEN
    RAISE EXCEPTION 'household_chore_reversal_state_invalid';
  END IF;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = v_assignment.participant_id FOR UPDATE;

  v_reopen := v_participant.id IS NOT NULL
    AND v_participant.status = 'active'
    AND (
      v_participant.linked_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.household_chore_memberships AS target_membership
        WHERE target_membership.circle_id = p_circle_id
          AND target_membership.participant_id = v_participant.id
          AND target_membership.user_id = v_participant.linked_user_id
          AND target_membership.status = 'active'
      )
    )
    AND (
      SELECT pg_catalog.count(*) FROM public.household_chore_assignments AS open_row
      WHERE open_row.circle_id = p_circle_id AND open_row.status = 'open'
    ) < 500
    AND (
      v_assignment.origin <> 'self_assigned'
      OR (
        SELECT pg_catalog.count(*) FROM public.household_chore_assignments AS self_row
        WHERE self_row.circle_id = p_circle_id
          AND self_row.participant_id = v_assignment.participant_id
          AND self_row.origin = 'self_assigned'
          AND self_row.status = 'open'
      ) < 25
    );

  IF v_reopen THEN
    UPDATE public.household_chore_assignments AS assignment_row
    SET status = 'open', completed_by_user_id = NULL, completed_at = NULL,
        cancelled_at = NULL, cancellation_reason = NULL,
        version = assignment_row.version + 1
    WHERE assignment_row.id = p_assignment_id
    RETURNING assignment_row.* INTO v_assignment;
    v_reason := NULL;
  ELSE
    v_reason := CASE
      WHEN v_participant.id IS NULL OR v_participant.status <> 'active'
        THEN 'undo_not_reopened'
      ELSE 'cap_not_reopened'
    END;
    UPDATE public.household_chore_assignments AS assignment_row
    SET status = 'cancelled', completed_by_user_id = NULL,
        completed_at = NULL, cancelled_at = pg_catalog.clock_timestamp(),
        cancellation_reason = v_reason,
        version = assignment_row.version + 1
    WHERE assignment_row.id = p_assignment_id
    RETURNING assignment_row.* INTO v_assignment;
  END IF;

  INSERT INTO public.household_chore_point_entries (
    circle_id, assignment_id, participant_id, entry_kind,
    completion_sequence, points_delta, reverses_entry_id, actor_user_id
  ) VALUES (
    p_circle_id, p_assignment_id, v_assignment.participant_id, 'reversal',
    v_assignment.completion_sequence, -v_earned.points_delta, v_earned.id,
    p_actor_id
  );
  PERFORM public.household_chore_private_insert_assignment_event(
    v_assignment, 'completion_reversed', v_assignment.status,
    p_actor_id, 'current', v_assignment.completion_sequence,
    -v_earned.points_delta, NULL,
    CASE WHEN v_reopen THEN 'open' ELSE 'cancelled' END
  );
  v_result := public.household_chore_private_result(
    true, 'completion_reversed', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_assignment.id,
      'version', v_assignment.version::text,
      'status', v_assignment.status,
      'points_delta', -v_earned.points_delta,
      'reopen_outcome', CASE WHEN v_reopen THEN 'open' ELSE 'cancelled' END,
      'reopen_reason', v_reason
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_private_user_has_references(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.household_chore_circles WHERE created_by = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_participants WHERE linked_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_invitations
      WHERE invitee_user_id = p_user_id OR invited_by_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_memberships WHERE user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_membership_events
      WHERE subject_user_id = p_user_id OR actor_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_definitions WHERE created_by = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_definition_events WHERE actor_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_assignments
      WHERE assigned_by_user_id = p_user_id OR completed_by_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_assignment_events WHERE actor_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_point_entries WHERE actor_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_mutation_requests
      WHERE actor_user_id = p_user_id OR resolved_target_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_rate_events
      WHERE actor_user_id = p_user_id OR target_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_delete_authorizations
      WHERE actor_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_delete_tombstones WHERE actor_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.household_chore_type_authorizations WHERE actor_user_id = p_user_id
    UNION ALL SELECT 1 FROM public.recent_events
      WHERE user_id = p_user_id AND source = 'heimilisverkin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_prepare_account_deletion(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_account_email text;
  v_email_canonical text;
  v_marker public.household_chore_deletion_markers%ROWTYPE;
  v_circle_ids uuid[] := ARRAY[]::uuid[];
  v_locked_circle_ids uuid[] := ARRAY[]::uuid[];
  v_circle_id uuid;
  v_membership public.household_chore_memberships%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_assignment public.household_chore_assignments%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_deleted_circles integer := 0;
  v_preserved_circles integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'not_found', 'marker_token', NULL,
      'data', '{}'::jsonb
    );
  END IF;

  PERFORM public.household_chore_private_lock_user(p_user_id);
  SELECT marker_row.* INTO v_marker
  FROM public.household_chore_deletion_markers AS marker_row
  WHERE marker_row.user_id = p_user_id
  FOR UPDATE;
  IF FOUND AND v_marker.status = 'prepared' THEN
    IF public.household_chore_private_user_has_references(p_user_id)
       OR EXISTS (
         SELECT 1
         FROM public.feature_access AS access_row
         WHERE access_row.feature_key = 'heimilisverkin'
           AND v_marker.canonical_email IS NOT NULL
           AND public.normalize_email_canonical(access_row.email) =
             v_marker.canonical_email
       ) THEN
      RAISE EXCEPTION 'household_chore_deletion_prepared_drift';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'account_deletion_prepared',
      'marker_token', v_marker.marker_token,
      'data', pg_catalog.jsonb_build_object(
        'deleted_circles', 0, 'preserved_circles', 0
      )
    );
  ELSIF FOUND THEN
    RAISE EXCEPTION 'household_chore_deletion_prepare_incomplete';
  END IF;

  SELECT account.email INTO v_account_email
  FROM auth.users AS account
  WHERE account.id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'not_found', 'marker_token', NULL,
      'data', '{}'::jsonb
    );
  END IF;
  v_email_canonical := public.normalize_email_canonical(v_account_email);
  IF v_email_canonical IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_email_canonical, 9702)
    );
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(scope.circle_id ORDER BY scope.circle_id), ARRAY[]::uuid[])
  INTO v_circle_ids
  FROM (
    SELECT circle_row.id AS circle_id
    FROM public.household_chore_circles AS circle_row
    WHERE circle_row.created_by = p_user_id
    UNION
    SELECT membership_row.circle_id
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.user_id = p_user_id
    UNION
    SELECT participant_row.circle_id
    FROM public.household_chore_participants AS participant_row
    WHERE participant_row.linked_user_id = p_user_id
    UNION
    SELECT invitation_row.circle_id
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.invitee_user_id = p_user_id
       OR invitation_row.invited_by_user_id = p_user_id
    UNION
    SELECT assignment_row.circle_id
    FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.assigned_by_user_id = p_user_id
       OR assignment_row.completed_by_user_id = p_user_id
    UNION
    SELECT event_row.circle_id
    FROM public.household_chore_assignment_events AS event_row
    WHERE event_row.actor_user_id = p_user_id
  ) AS scope;

  FOREACH v_circle_id IN ARRAY v_circle_ids LOOP
    PERFORM 1
    FROM public.household_chore_circles AS circle_row
    WHERE circle_row.id = v_circle_id
    FOR UPDATE;
  END LOOP;

  SELECT COALESCE(pg_catalog.array_agg(scope.circle_id ORDER BY scope.circle_id), ARRAY[]::uuid[])
  INTO v_locked_circle_ids
  FROM (
    SELECT circle_row.id AS circle_id
    FROM public.household_chore_circles AS circle_row
    WHERE circle_row.created_by = p_user_id
    UNION
    SELECT membership_row.circle_id
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.user_id = p_user_id
    UNION
    SELECT participant_row.circle_id
    FROM public.household_chore_participants AS participant_row
    WHERE participant_row.linked_user_id = p_user_id
    UNION
    SELECT invitation_row.circle_id
    FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.invitee_user_id = p_user_id
       OR invitation_row.invited_by_user_id = p_user_id
    UNION
    SELECT assignment_row.circle_id
    FROM public.household_chore_assignments AS assignment_row
    WHERE assignment_row.assigned_by_user_id = p_user_id
       OR assignment_row.completed_by_user_id = p_user_id
    UNION
    SELECT event_row.circle_id
    FROM public.household_chore_assignment_events AS event_row
    WHERE event_row.actor_user_id = p_user_id
  ) AS scope;
  IF v_locked_circle_ids IS DISTINCT FROM v_circle_ids THEN
    RAISE EXCEPTION 'household_chore_deletion_scope_drift';
  END IF;

  INSERT INTO public.household_chore_deletion_markers (
    user_id, canonical_email, status, created_at
  ) VALUES (
    p_user_id, v_email_canonical, 'preparing', v_now
  ) RETURNING * INTO v_marker;
  PERFORM pg_catalog.set_config(
    'teskeid.household_identity_cleanup', p_user_id::text, true
  );

  FOREACH v_circle_id IN ARRAY v_circle_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.household_chore_circles AS circle_row
      WHERE circle_row.id = v_circle_id
    ) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.household_chore_memberships AS membership_row
      WHERE membership_row.circle_id = v_circle_id
        AND membership_row.status = 'active'
        AND membership_row.membership_type = 'member'
        AND membership_row.user_id IS DISTINCT FROM p_user_id
    ) THEN
      INSERT INTO public.household_chore_delete_authorizations (
        circle_id, authorization_kind, actor_user_id, marker_token
      ) VALUES (
        v_circle_id, 'account_deletion', p_user_id, v_marker.marker_token
      );
      DELETE FROM public.recent_events AS recent_row
      WHERE recent_row.source = 'heimilisverkin'
        AND (
          (recent_row.entity_type = 'household_chore_invitation'
            AND recent_row.entity_id IN (
              SELECT invitation_row.id
              FROM public.household_chore_invitations AS invitation_row
              WHERE invitation_row.circle_id = v_circle_id
            ))
          OR (recent_row.entity_type = 'household_chore_membership_event'
            AND recent_row.entity_id IN (
              SELECT event_row.id
              FROM public.household_chore_membership_events AS event_row
              WHERE event_row.circle_id = v_circle_id
            ))
        );
      DELETE FROM public.household_chore_circles AS circle_row
      WHERE circle_row.id = v_circle_id;
      DELETE FROM public.household_chore_delete_authorizations AS authorization_row
      WHERE authorization_row.circle_id = v_circle_id
        AND authorization_row.authorization_kind = 'account_deletion'
        AND authorization_row.actor_user_id = p_user_id
        AND authorization_row.marker_token = v_marker.marker_token;
      v_deleted_circles := v_deleted_circles + 1;
      CONTINUE;
    END IF;
    v_preserved_circles := v_preserved_circles + 1;

    FOR v_membership IN
      SELECT membership_row.*
      FROM public.household_chore_memberships AS membership_row
      WHERE membership_row.circle_id = v_circle_id
        AND membership_row.user_id = p_user_id
      ORDER BY membership_row.id
      FOR UPDATE
    LOOP
      SELECT participant_row.* INTO v_participant
      FROM public.household_chore_participants AS participant_row
      WHERE participant_row.circle_id = v_circle_id
        AND participant_row.id = v_membership.participant_id
      FOR UPDATE;

      FOR v_assignment IN
        SELECT assignment_row.*
        FROM public.household_chore_assignments AS assignment_row
        WHERE assignment_row.circle_id = v_circle_id
          AND assignment_row.participant_id = v_membership.participant_id
          AND assignment_row.status = 'open'
        ORDER BY assignment_row.id
        FOR UPDATE
      LOOP
        UPDATE public.household_chore_assignments AS assignment_row
        SET status = 'cancelled', cancelled_at = v_now,
            cancellation_reason = 'account_erased',
            version = assignment_row.version + 1
        WHERE assignment_row.id = v_assignment.id
        RETURNING assignment_row.* INTO v_assignment;
        PERFORM public.household_chore_private_insert_assignment_event(
          v_assignment, 'cancelled', 'cancelled', NULL, 'system',
          NULL, NULL, 'account_erased', NULL
        );
      END LOOP;

      UPDATE public.household_chore_participant_values AS value_row
      SET status = 'inactive', version = value_row.version + 1
      WHERE value_row.circle_id = v_circle_id
        AND value_row.participant_id = v_membership.participant_id
        AND value_row.status = 'active';
      UPDATE public.household_chore_memberships AS membership_row
      SET status = CASE WHEN membership_row.status = 'active'
          THEN 'removed' ELSE membership_row.status END,
          ended_at = COALESCE(membership_row.ended_at, v_now),
          user_id = NULL, identity_retired_at = v_now,
          version = membership_row.version + 1
      WHERE membership_row.id = v_membership.id;
      UPDATE public.household_chore_participants AS participant_row
      SET linked_user_id = NULL, display_name_snapshot = NULL,
          identity_marker = 'former_member', status = 'archived',
          archive_reason = 'account_erased', identity_retired_at = v_now,
          version = participant_row.version + 1
      WHERE participant_row.id = v_membership.participant_id;
      UPDATE public.household_chore_assignments AS assignment_row
      SET participant_label_snapshot = NULL,
          participant_identity_marker = 'former_member'
      WHERE assignment_row.circle_id = v_circle_id
        AND assignment_row.participant_id = v_membership.participant_id;
      UPDATE public.household_chore_assignment_events AS event_row
      SET participant_label_snapshot = NULL,
          participant_identity_marker = 'former_member'
      WHERE event_row.circle_id = v_circle_id
        AND event_row.participant_id = v_membership.participant_id;
    END LOOP;

    UPDATE public.household_chore_circles AS circle_row
    SET created_by = NULL
    WHERE circle_row.id = v_circle_id
      AND circle_row.created_by = p_user_id;
  END LOOP;

  -- Remove user-addressed rows and rows whose payload snapshots identify the
  -- deleting user before their source rows are scrubbed.
  DELETE FROM public.recent_events AS recent_row
  WHERE recent_row.source = 'heimilisverkin'
    AND (
      recent_row.user_id = p_user_id
      OR (recent_row.entity_type = 'household_chore_invitation'
        AND recent_row.entity_id IN (
          SELECT invitation_row.id
          FROM public.household_chore_invitations AS invitation_row
          WHERE invitation_row.invitee_user_id = p_user_id
             OR invitation_row.invited_by_user_id = p_user_id
        ))
      OR (recent_row.entity_type = 'household_chore_membership_event'
        AND recent_row.entity_id IN (
          SELECT event_row.id
          FROM public.household_chore_membership_events AS event_row
          WHERE event_row.subject_user_id = p_user_id
             OR event_row.actor_user_id = p_user_id
        ))
    );

  UPDATE public.household_chore_invitations AS invitation_row
  SET status = CASE WHEN invitation_row.status = 'pending'
        THEN 'cancelled' ELSE invitation_row.status END,
      responded_at = CASE WHEN invitation_row.status = 'pending'
        THEN v_now ELSE invitation_row.responded_at END,
      invitee_user_id = CASE WHEN invitation_row.invitee_user_id = p_user_id
        THEN NULL ELSE invitation_row.invitee_user_id END,
      invited_by_user_id = CASE WHEN invitation_row.invited_by_user_id = p_user_id
        THEN NULL ELSE invitation_row.invited_by_user_id END,
      inviter_label_snapshot = CASE
        WHEN invitation_row.invited_by_user_id = p_user_id
        THEN NULL ELSE invitation_row.inviter_label_snapshot END,
      relationship_id = CASE WHEN invitation_row.invited_by_user_id = p_user_id
        THEN NULL ELSE invitation_row.relationship_id END,
      identity_retired_at = CASE WHEN invitation_row.invitee_user_id = p_user_id
        THEN v_now ELSE invitation_row.identity_retired_at END,
      version = invitation_row.version + 1
  WHERE invitation_row.invitee_user_id = p_user_id
     OR invitation_row.invited_by_user_id = p_user_id;

  UPDATE public.household_chore_membership_events AS event_row
  SET subject_user_id = CASE WHEN event_row.subject_user_id = p_user_id
        THEN NULL ELSE event_row.subject_user_id END,
      actor_user_id = CASE WHEN event_row.actor_user_id = p_user_id
        THEN NULL ELSE event_row.actor_user_id END,
      actor_label_snapshot = CASE WHEN event_row.actor_user_id = p_user_id
        THEN NULL ELSE event_row.actor_label_snapshot END,
      actor_identity_marker = CASE WHEN event_row.actor_user_id = p_user_id
        THEN 'former_member' ELSE event_row.actor_identity_marker END
  WHERE event_row.subject_user_id = p_user_id
     OR event_row.actor_user_id = p_user_id;
  UPDATE public.household_chore_definitions AS definition_row
  SET created_by = NULL
  WHERE definition_row.created_by = p_user_id;
  UPDATE public.household_chore_definition_events AS event_row
  SET actor_user_id = NULL, actor_identity_marker = 'former_member'
  WHERE event_row.actor_user_id = p_user_id;
  UPDATE public.household_chore_assignments AS assignment_row
  SET assigned_by_user_id = CASE WHEN assignment_row.assigned_by_user_id = p_user_id
        THEN NULL ELSE assignment_row.assigned_by_user_id END,
      completed_by_user_id = CASE WHEN assignment_row.completed_by_user_id = p_user_id
        THEN NULL ELSE assignment_row.completed_by_user_id END
  WHERE assignment_row.assigned_by_user_id = p_user_id
     OR assignment_row.completed_by_user_id = p_user_id;
  UPDATE public.household_chore_assignment_events AS event_row
  SET actor_user_id = NULL, actor_label_snapshot = NULL,
      actor_identity_marker = 'former_member'
  WHERE event_row.actor_user_id = p_user_id;
  UPDATE public.household_chore_point_entries AS point_row
  SET actor_user_id = NULL, actor_identity_marker = 'former_member'
  WHERE point_row.actor_user_id = p_user_id;

  DELETE FROM public.household_chore_type_authorizations AS authorization_row
  WHERE authorization_row.actor_user_id = p_user_id;
  DELETE FROM public.household_chore_delete_authorizations AS authorization_row
  WHERE authorization_row.actor_user_id = p_user_id;
  DELETE FROM public.household_chore_rate_events AS rate_row
  WHERE rate_row.actor_user_id = p_user_id
     OR rate_row.target_user_id = p_user_id;
  DELETE FROM public.household_chore_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_user_id
     OR request_row.resolved_target_user_id = p_user_id;
  DELETE FROM public.household_chore_delete_tombstones AS tombstone_row
  WHERE tombstone_row.actor_user_id = p_user_id;
  DELETE FROM public.recent_events AS recent_row
  WHERE recent_row.user_id = p_user_id
    AND recent_row.source = 'heimilisverkin';
  IF v_email_canonical IS NOT NULL THEN
    DELETE FROM public.feature_access AS access_row
    WHERE access_row.feature_key = 'heimilisverkin'
      AND public.normalize_email_canonical(access_row.email) = v_email_canonical;
  END IF;

  IF public.household_chore_private_user_has_references(p_user_id) THEN
    RAISE EXCEPTION 'household_chore_deletion_references_remain';
  END IF;

  UPDATE public.household_chore_deletion_markers AS marker_row
  SET status = 'prepared', prepared_at = v_now
  WHERE marker_row.user_id = p_user_id
  RETURNING marker_row.* INTO v_marker;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'account_deletion_prepared',
    'marker_token', v_marker.marker_token,
    'data', pg_catalog.jsonb_build_object(
      'deleted_circles', v_deleted_circles,
      'preserved_circles', v_preserved_circles
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_abort_account_deletion(
  p_user_id uuid,
  p_marker_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_marker public.household_chore_deletion_markers%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_marker_token IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'not_found', 'marker_token', NULL,
      'data', '{}'::jsonb
    );
  END IF;
  PERFORM public.household_chore_private_lock_user(p_user_id);
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = p_user_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'not_found', 'marker_token', NULL,
      'data', '{}'::jsonb
    );
  END IF;
  SELECT marker_row.* INTO v_marker
  FROM public.household_chore_deletion_markers AS marker_row
  WHERE marker_row.user_id = p_user_id
    AND marker_row.marker_token = p_marker_token
    AND marker_row.status = 'prepared'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'not_found', 'marker_token', NULL,
      'data', '{}'::jsonb
    );
  END IF;
  DELETE FROM public.household_chore_deletion_markers AS marker_row
  WHERE marker_row.user_id = p_user_id;
  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'account_deletion_aborted',
    'marker_token', p_marker_token,
    'data', pg_catalog.jsonb_build_object('state_restored', false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_auth_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_marker public.household_chore_deletion_markers%ROWTYPE;
  v_email_canonical text;
  v_has_refs boolean;
BEGIN
  v_email_canonical := public.normalize_email_canonical(OLD.email);
  SELECT marker_row.* INTO v_marker
  FROM public.household_chore_deletion_markers AS marker_row
  WHERE marker_row.user_id = OLD.id
  FOR UPDATE;

  v_has_refs := public.household_chore_private_user_has_references(OLD.id);

  IF v_marker.user_id IS NULL THEN
    IF v_has_refs OR EXISTS (
      SELECT 1 FROM public.feature_access AS access_row
      WHERE access_row.feature_key = 'heimilisverkin'
        AND v_email_canonical IS NOT NULL
        AND public.normalize_email_canonical(access_row.email) = v_email_canonical
    ) THEN
      RAISE EXCEPTION 'household_chore_account_deletion_not_prepared';
    END IF;
    RETURN OLD;
  END IF;

  IF v_marker.status <> 'prepared' OR v_has_refs OR EXISTS (
    SELECT 1 FROM public.feature_access AS access_row
    WHERE access_row.feature_key = 'heimilisverkin'
      AND v_email_canonical IS NOT NULL
      AND public.normalize_email_canonical(access_row.email) = v_email_canonical
  ) THEN
    RAISE EXCEPTION 'household_chore_account_deletion_incomplete';
  END IF;

  DELETE FROM public.household_chore_deletion_markers AS marker_row
  WHERE marker_row.user_id = OLD.id
    AND marker_row.marker_token = v_marker.marker_token;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER household_chore_auth_delete_guard
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.household_chore_auth_delete_guard();

DO $secure_functions$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT
      namespace_row.nspname,
      function_row.proname,
      pg_catalog.pg_get_function_identity_arguments(function_row.oid) AS args
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER FUNCTION %I.%I(%s) OWNER TO postgres',
      v_function.nspname, v_function.proname, v_function.args
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated, service_role',
      v_function.nspname, v_function.proname, v_function.args
    );
  END LOOP;
END;
$secure_functions$;

GRANT EXECUTE ON FUNCTION public.household_chore_get_root(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_invitation_preview(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_memberships(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_circle(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_definition_detail(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_invite_candidates(uuid, uuid, text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_self_service(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_assignment(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_definition_history(uuid, uuid, uuid, timestamptz, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_get_assignment_timeline(uuid, uuid, uuid, timestamptz, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_sync_recent(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.household_chore_create_circle(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_rename_circle(uuid, uuid, uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_delete_circle(uuid, uuid, uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_create_invitation(uuid, uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_cancel_invitation(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_accept_invitation(uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_decline_invitation(uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_change_membership_type(uuid, uuid, uuid, uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_remove_member(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_leave_circle(uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_create_participant(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_archive_participant(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_reactivate_participant(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_create_definition(uuid, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_update_definition(uuid, uuid, uuid, uuid, bigint, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_archive_definition(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_reactivate_definition(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_set_participant_value(uuid, uuid, uuid, uuid, uuid, bigint, bigint, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_assign(uuid, uuid, uuid, uuid, uuid, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_self_assign(uuid, uuid, uuid, uuid, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_repeat_assignment(uuid, uuid, uuid, uuid, bigint, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_complete_assignment(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_cancel_assignment(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_cancel_own_assignment(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_undo_completion(uuid, uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_prepare_account_deletion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_abort_account_deletion(uuid, uuid) TO service_role;

-- Store a canonical snapshot of every Household relation, column/default,
-- constraint, index, sequence, function and trigger exactly as PostgreSQL
-- created it, plus the one shared recent-events index owned by SQL142. The
-- reviewed source manifest remains the intended-shape proof; this
-- transactional snapshot lets postflight detect any later catalog drift.
DO $catalog_snapshot$
DECLARE
  v_payload text;
  v_digest text;
  v_comment text;
BEGIN
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
        (relation_namespace.nspname = 'public'
          AND pg_catalog.left(relation_row.relname::text, 16) =
            'household_chore_')
        OR (relation_namespace.nspname = 'auth'
          AND relation_row.relname = 'users'
          AND trigger_row.tgname = 'household_chore_auth_delete_guard')
      )
  )
  SELECT pg_catalog.jsonb_build_object(
    'contract_version', 1,
    'relations', relation_contract.value,
    'columns', column_contract.value,
    'constraints', constraint_contract.value,
    'indexes', index_contract.value,
    'shared_indexes', shared_index_contract.value,
    'sequences', sequence_contract.value,
    'functions', function_contract.value,
    'triggers', trigger_contract.value
  )::text
  INTO v_payload
  FROM relation_contract
  CROSS JOIN column_contract
  CROSS JOIN constraint_contract
  CROSS JOIN index_contract
  CROSS JOIN shared_index_contract
  CROSS JOIN sequence_contract
  CROSS JOIN function_contract
  CROSS JOIN trigger_contract;

  v_digest := pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_payload, 'UTF8')
  ), 'hex');
  v_comment := pg_catalog.format(
    'teskeid:sql142:catalog-v1:%s:%s',
    pg_catalog.current_setting('server_version_num'),
    v_digest
  );
  EXECUTE pg_catalog.format(
    'COMMENT ON TABLE public.household_chore_circles IS %L', v_comment
  );
  IF pg_catalog.obj_description(
    'public.household_chore_circles'::pg_catalog.regclass, 'pg_class'
  ) IS DISTINCT FROM v_comment THEN
    RAISE EXCEPTION 'household_chore_142_catalog_snapshot_failed';
  END IF;
END;
$catalog_snapshot$;

DO $final_attestation$
DECLARE
  v_relation_count integer;
  v_relation_names text[];
  v_function_count integer;
  v_function_signatures text[];
  v_trigger_contracts text[];
  v_recent_expression text;
  v_recent_normalized text;
  v_recent_sources text[];
  v_expected_service_signatures text[] := ARRAY[
    'household_chore_abort_account_deletion(p_user_id uuid, p_marker_token uuid)',
    'household_chore_accept_invitation(p_actor_id uuid, p_request_id uuid, p_invitation_id uuid, p_expected_version bigint)',
    'household_chore_archive_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_version bigint)',
    'household_chore_archive_participant(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_participant_id uuid, p_expected_version bigint)',
    'household_chore_assign(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_participant_id uuid, p_expected_definition_version bigint, p_expected_value_version bigint)',
    'household_chore_cancel_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)',
    'household_chore_cancel_invitation(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_invitation_id uuid, p_expected_version bigint)',
    'household_chore_cancel_own_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)',
    'household_chore_change_membership_type(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_membership_id uuid, p_expected_version bigint, p_new_type text)',
    'household_chore_complete_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)',
    'household_chore_create_circle(p_actor_id uuid, p_request_id uuid, p_name text)',
    'household_chore_create_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_title text, p_description text, p_materials text)',
    'household_chore_create_invitation(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_relationship_id uuid, p_requested_type text)',
    'household_chore_create_participant(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_label text)',
    'household_chore_decline_invitation(p_actor_id uuid, p_request_id uuid, p_invitation_id uuid, p_expected_version bigint)',
    'household_chore_delete_circle(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_expected_version bigint, p_display_reference text)',
    'household_chore_get_assignment(p_actor_id uuid, p_circle_id uuid, p_assignment_id uuid)',
    'household_chore_get_assignment_timeline(p_actor_id uuid, p_circle_id uuid, p_assignment_id uuid, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer)',
    'household_chore_get_circle(p_actor_id uuid, p_circle_id uuid)',
    'household_chore_get_definition_detail(p_actor_id uuid, p_circle_id uuid, p_definition_id uuid)',
    'household_chore_get_definition_history(p_actor_id uuid, p_circle_id uuid, p_definition_id uuid, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer)',
    'household_chore_get_invitation_preview(p_actor_id uuid, p_invitation_id uuid)',
    'household_chore_get_invite_candidates(p_actor_id uuid, p_circle_id uuid, p_cursor_label text, p_cursor_relationship_id uuid, p_limit integer)',
    'household_chore_get_memberships(p_actor_id uuid)',
    'household_chore_get_root(p_actor_id uuid)',
    'household_chore_get_self_service(p_actor_id uuid, p_circle_id uuid)',
    'household_chore_leave_circle(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_expected_version bigint)',
    'household_chore_prepare_account_deletion(p_user_id uuid)',
    'household_chore_reactivate_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_version bigint)',
    'household_chore_reactivate_participant(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_participant_id uuid, p_expected_version bigint)',
    'household_chore_remove_member(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_membership_id uuid, p_expected_version bigint)',
    'household_chore_rename_circle(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_expected_version bigint, p_name text)',
    'household_chore_repeat_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_source_assignment_id uuid, p_expected_source_version bigint, p_expected_definition_version bigint, p_expected_value_version bigint)',
    'household_chore_self_assign(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_definition_version bigint, p_expected_value_version bigint)',
    'household_chore_set_participant_value(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_participant_id uuid, p_expected_definition_version bigint, p_expected_value_version bigint, p_points integer, p_active boolean)',
    'household_chore_sync_recent(p_actor_id uuid)',
    'household_chore_undo_completion(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)',
    'household_chore_update_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_version bigint, p_title text, p_description text, p_materials text)'
  ]::text[];
BEGIN
  SELECT pg_catalog.count(*)::integer,
         pg_catalog.array_agg(relation_row.relname::text ORDER BY relation_row.relname)
  INTO v_relation_count, v_relation_names
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation_row.relnamespace
  WHERE namespace_row.nspname = 'public'
    AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
    AND relation_row.relkind = 'r';
  IF v_relation_count <> 17 OR v_relation_names IS DISTINCT FROM ARRAY[
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
  ]::text[] THEN
    RAISE EXCEPTION 'household_chore_142_relation_attestation_failed:%', v_relation_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation_row.relowner
    WHERE namespace_row.nspname = 'public'
      AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
      AND relation_row.relkind = 'r'
      AND (owner_role.rolname <> 'postgres'
        OR NOT relation_row.relrowsecurity
        OR NOT relation_row.relforcerowsecurity
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute AS attribute_row
          WHERE attribute_row.attrelid = relation_row.oid
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
            AND attribute_row.attacl IS NOT NULL
        )
        OR (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.aclexplode(COALESCE(
            relation_row.relacl,
            pg_catalog.acldefault('r', relation_row.relowner)
          )) AS acl_row
        ) <> 8
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            relation_row.relacl,
            pg_catalog.acldefault('r', relation_row.relowner)
          )) AS acl_row
          WHERE acl_row.grantor <> relation_row.relowner
            OR acl_row.grantee <> relation_row.relowner
            OR acl_row.is_grantable
            OR acl_row.privilege_type NOT IN (
              'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
              'REFERENCES', 'TRIGGER', 'MAINTAIN'
            )
        ))
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy_row
    JOIN pg_catalog.pg_class AS relation_row ON relation_row.oid = policy_row.polrelid
    JOIN pg_catalog.pg_namespace AS namespace_row ON namespace_row.oid = relation_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS sequence_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = sequence_row.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = sequence_row.relowner
    WHERE namespace_row.nspname = 'public'
      AND sequence_row.relname = 'household_chore_rate_events_id_seq'
      AND sequence_row.relkind = 'S'
      AND owner_role.rolname = 'postgres'
      AND (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.aclexplode(COALESCE(
          sequence_row.relacl,
          pg_catalog.acldefault('s', sequence_row.relowner)
        )) AS acl_row
      ) = 3
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          sequence_row.relacl,
          pg_catalog.acldefault('s', sequence_row.relowner)
        )) AS acl_row
        WHERE acl_row.grantor <> sequence_row.relowner
          OR acl_row.grantee <> sequence_row.relowner
          OR acl_row.is_grantable
          OR acl_row.privilege_type NOT IN ('SELECT', 'UPDATE', 'USAGE')
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_142_rls_attestation_failed';
  END IF;

  SELECT pg_catalog.count(*)::integer,
         pg_catalog.array_agg(
           pg_catalog.format(
             '%s(%s)', function_row.proname,
             pg_catalog.pg_get_function_identity_arguments(function_row.oid)
           ) ORDER BY function_row.proname,
             pg_catalog.pg_get_function_identity_arguments(function_row.oid)
         )
  INTO v_function_count, v_function_signatures
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_';
  IF v_function_count <> 66
     OR pg_catalog.cardinality(v_expected_service_signatures) <> 38
     OR v_function_signatures IS DISTINCT FROM ARRAY[
    'household_chore_abort_account_deletion(p_user_id uuid, p_marker_token uuid)',
    'household_chore_accept_invitation(p_actor_id uuid, p_request_id uuid, p_invitation_id uuid, p_expected_version bigint)',
    'household_chore_archive_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_version bigint)',
    'household_chore_archive_participant(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_participant_id uuid, p_expected_version bigint)',
    'household_chore_assign(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_participant_id uuid, p_expected_definition_version bigint, p_expected_value_version bigint)',
    'household_chore_auth_delete_guard()',
    'household_chore_cancel_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)',
    'household_chore_cancel_invitation(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_invitation_id uuid, p_expected_version bigint)',
    'household_chore_cancel_own_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)',
    'household_chore_change_membership_type(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_membership_id uuid, p_expected_version bigint, p_new_type text)',
    'household_chore_complete_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)',
    'household_chore_create_circle(p_actor_id uuid, p_request_id uuid, p_name text)',
    'household_chore_create_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_title text, p_description text, p_materials text)',
    'household_chore_create_invitation(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_relationship_id uuid, p_requested_type text)',
    'household_chore_create_participant(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_label text)',
    'household_chore_decline_invitation(p_actor_id uuid, p_request_id uuid, p_invitation_id uuid, p_expected_version bigint)',
    'household_chore_delete_circle(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_expected_version bigint, p_display_reference text)',
    'household_chore_get_assignment(p_actor_id uuid, p_circle_id uuid, p_assignment_id uuid)',
    'household_chore_get_assignment_timeline(p_actor_id uuid, p_circle_id uuid, p_assignment_id uuid, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer)',
    'household_chore_get_circle(p_actor_id uuid, p_circle_id uuid)',
    'household_chore_get_definition_detail(p_actor_id uuid, p_circle_id uuid, p_definition_id uuid)',
    'household_chore_get_definition_history(p_actor_id uuid, p_circle_id uuid, p_definition_id uuid, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer)',
    'household_chore_get_invitation_preview(p_actor_id uuid, p_invitation_id uuid)',
    'household_chore_get_invite_candidates(p_actor_id uuid, p_circle_id uuid, p_cursor_label text, p_cursor_relationship_id uuid, p_limit integer)',
    'household_chore_get_memberships(p_actor_id uuid)',
    'household_chore_get_root(p_actor_id uuid)',
    'household_chore_get_self_service(p_actor_id uuid, p_circle_id uuid)',
    'household_chore_leave_circle(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_expected_version bigint)',
    'household_chore_prepare_account_deletion(p_user_id uuid)',
    'household_chore_private_actor_ready(p_user_id uuid)',
    'household_chore_private_begin_request(p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint bytea, p_resolved_target_user_id uuid)',
    'household_chore_private_cancel_assignment(p_actor_id uuid, p_assignment household_chore_assignments, p_reason text)',
    'household_chore_private_create_assignment(p_actor_id uuid, p_definition household_chore_definitions, p_participant household_chore_participants, p_value household_chore_participant_values, p_origin text, p_repeated_from_assignment_id uuid)',
    'household_chore_private_end_membership(p_actor_id uuid, p_membership household_chore_memberships, p_new_status text, p_cancel_reason text)',
    'household_chore_private_expire_invitations(p_circle_id uuid, p_invitee_user_id uuid)',
    'household_chore_private_fingerprint(p_canonical_input jsonb)',
    'household_chore_private_finish_request(p_actor_id uuid, p_request_id uuid, p_result jsonb)',
    'household_chore_private_history_page(p_actor_id uuid, p_circle_id uuid, p_definition_id uuid, p_assignment_id uuid, p_include_created boolean, p_cursor_at timestamp with time zone, p_cursor_id uuid, p_limit integer)',
    'household_chore_private_immutable_guard()',
    'household_chore_private_insert_assignment_event(p_assignment household_chore_assignments, p_event_type text, p_status_after text, p_actor_user_id uuid, p_actor_identity_marker text, p_completion_sequence integer, p_points_delta integer, p_cancellation_reason text, p_reopen_outcome text)',
    'household_chore_private_invitation_guard()',
    'household_chore_private_is_entitled(p_user_id uuid)',
    'household_chore_private_lock_user(p_user_id uuid)',
    'household_chore_private_membership_guard()',
    'household_chore_private_participant_guard()',
    'household_chore_private_point_guard()',
    'household_chore_private_prune_rates(p_actor_id uuid, p_circle_id uuid, p_target_user_id uuid, p_participant_id uuid)',
    'household_chore_private_read_result(p_ok boolean, p_code text, p_data jsonb)',
    'household_chore_private_result(p_ok boolean, p_code text, p_request_id uuid, p_data jsonb)',
    'household_chore_private_safe_user_label(p_user_id uuid)',
    'household_chore_private_start_mutation(p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint bytea, p_require_entitlement boolean)',
    'household_chore_private_start_target_mutation(p_actor_id uuid, p_target_user_id uuid, p_request_id uuid, p_operation text, p_fingerprint bytea, p_require_actor_entitlement boolean)',
    'household_chore_private_touch_updated_at()',
    'household_chore_private_type_guard()',
    'household_chore_private_user_has_references(p_user_id uuid)',
    'household_chore_private_validate_circle()',
    'household_chore_reactivate_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_version bigint)',
    'household_chore_reactivate_participant(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_participant_id uuid, p_expected_version bigint)',
    'household_chore_remove_member(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_membership_id uuid, p_expected_version bigint)',
    'household_chore_rename_circle(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_expected_version bigint, p_name text)',
    'household_chore_repeat_assignment(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_source_assignment_id uuid, p_expected_source_version bigint, p_expected_definition_version bigint, p_expected_value_version bigint)',
    'household_chore_self_assign(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_definition_version bigint, p_expected_value_version bigint)',
    'household_chore_set_participant_value(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_participant_id uuid, p_expected_definition_version bigint, p_expected_value_version bigint, p_points integer, p_active boolean)',
    'household_chore_sync_recent(p_actor_id uuid)',
    'household_chore_undo_completion(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_assignment_id uuid, p_expected_version bigint)',
    'household_chore_update_definition(p_actor_id uuid, p_request_id uuid, p_circle_id uuid, p_definition_id uuid, p_expected_version bigint, p_title text, p_description text, p_materials text)'
  ]::text[] OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = function_row.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = function_row.proowner
    WHERE namespace_row.nspname = 'public'
      AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
      AND (owner_role.rolname <> 'postgres'
        OR function_row.prokind <> 'f'
        OR function_row.proretset
        OR function_row.proleakproof
        OR function_row.proparallel <> 'u'
        OR NOT function_row.prosecdef
        OR pg_catalog.cardinality(
          COALESCE(function_row.proconfig, ARRAY[]::text[])
        ) <> 1
        OR function_row.proconfig[1]
          NOT IN ('search_path=', 'search_path=""')
        OR NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            function_row.proacl,
            pg_catalog.acldefault('f', function_row.proowner)
          )) AS acl_row
          WHERE acl_row.privilege_type = 'EXECUTE'
            AND acl_row.grantor = function_row.proowner
            AND acl_row.grantee = function_row.proowner
            AND NOT acl_row.is_grantable
        )
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(
            function_row.proacl,
            pg_catalog.acldefault('f', function_row.proowner)
          )) AS acl_row
          LEFT JOIN pg_catalog.pg_roles AS grantee_role
            ON grantee_role.oid = acl_row.grantee
          WHERE acl_row.privilege_type = 'EXECUTE'
            AND NOT (
              acl_row.grantor = function_row.proowner
              AND NOT acl_row.is_grantable
              AND (
                acl_row.grantee = function_row.proowner
                OR (
                  grantee_role.rolname = 'service_role'
                  AND pg_catalog.format(
                    '%s(%s)', function_row.proname,
                    pg_catalog.pg_get_function_identity_arguments(function_row.oid)
                  ) = ANY (v_expected_service_signatures)
                )
              )
            )
        )
        OR (
          pg_catalog.format(
            '%s(%s)', function_row.proname,
            pg_catalog.pg_get_function_identity_arguments(function_row.oid)
          ) = ANY (v_expected_service_signatures)
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
              COALESCE(
                function_row.proacl,
                pg_catalog.acldefault('f', function_row.proowner)
              )
            ) AS acl_row
            JOIN pg_catalog.pg_roles AS grantee_role
              ON grantee_role.oid = acl_row.grantee
            WHERE acl_row.privilege_type = 'EXECUTE'
              AND acl_row.grantor = function_row.proowner
              AND grantee_role.rolname = 'service_role'
              AND NOT acl_row.is_grantable
          )
        ))
  ) THEN
    RAISE EXCEPTION 'household_chore_142_function_attestation_failed:%', v_function_count;
  END IF;

  SELECT pg_catalog.array_agg(
    pg_catalog.format(
      '%s|%s.%s|%s.%s',
      trigger_row.tgname,
      relation_namespace.nspname,
      relation_row.relname,
      function_namespace.nspname,
      function_row.proname
    ) ORDER BY trigger_row.tgname
  )
  INTO v_trigger_contracts
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation_row
    ON relation_row.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS relation_namespace
    ON relation_namespace.oid = relation_row.relnamespace
  JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = trigger_row.tgfoid
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_row.pronamespace
  WHERE NOT trigger_row.tgisinternal
    AND (
      (relation_namespace.nspname = 'public'
        AND pg_catalog.left(relation_row.relname::text, 16) =
          'household_chore_')
      OR (relation_namespace.nspname = 'auth'
        AND relation_row.relname = 'users'
        AND trigger_row.tgname = 'household_chore_auth_delete_guard')
    );
  IF v_trigger_contracts IS DISTINCT FROM ARRAY[
    'household_chore_assignment_events_immutable|public.household_chore_assignment_events|public.household_chore_private_immutable_guard',
    'household_chore_assignments_touch|public.household_chore_assignments|public.household_chore_private_touch_updated_at',
    'household_chore_auth_delete_guard|auth.users|public.household_chore_auth_delete_guard',
    'household_chore_circle_invitation_integrity|public.household_chore_invitations|public.household_chore_private_validate_circle',
    'household_chore_circle_membership_integrity|public.household_chore_memberships|public.household_chore_private_validate_circle',
    'household_chore_circle_participant_integrity|public.household_chore_participants|public.household_chore_private_validate_circle',
    'household_chore_circles_touch|public.household_chore_circles|public.household_chore_private_touch_updated_at',
    'household_chore_definition_events_immutable|public.household_chore_definition_events|public.household_chore_private_immutable_guard',
    'household_chore_definitions_touch|public.household_chore_definitions|public.household_chore_private_touch_updated_at',
    'household_chore_invitation_provenance_guard|public.household_chore_invitations|public.household_chore_private_invitation_guard',
    'household_chore_invitations_touch|public.household_chore_invitations|public.household_chore_private_touch_updated_at',
    'household_chore_membership_events_immutable|public.household_chore_membership_events|public.household_chore_private_immutable_guard',
    'household_chore_membership_provenance_guard|public.household_chore_memberships|public.household_chore_private_membership_guard',
    'household_chore_membership_type_guard|public.household_chore_memberships|public.household_chore_private_type_guard',
    'household_chore_memberships_touch|public.household_chore_memberships|public.household_chore_private_touch_updated_at',
    'household_chore_participant_identity_guard|public.household_chore_participants|public.household_chore_private_participant_guard',
    'household_chore_participants_touch|public.household_chore_participants|public.household_chore_private_touch_updated_at',
    'household_chore_points_immutable|public.household_chore_point_entries|public.household_chore_private_immutable_guard',
    'household_chore_points_insert_guard|public.household_chore_point_entries|public.household_chore_private_point_guard',
    'household_chore_values_touch|public.household_chore_participant_values|public.household_chore_private_touch_updated_at'
  ]::text[] THEN
    RAISE EXCEPTION 'household_chore_142_trigger_attestation_failed';
  END IF;

  SELECT pg_catalog.pg_get_expr(
    constraint_row.conbin,
    constraint_row.conrelid,
    false
  )
  INTO v_recent_expression
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.recent_events'::pg_catalog.regclass
    AND constraint_row.conname = 'recent_events_source_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated;
  SELECT pg_catalog.array_agg(match_row.value[1] ORDER BY match_row.value[1])
  INTO v_recent_sources
  FROM pg_catalog.regexp_matches(
    COALESCE(v_recent_expression, ''),
    '''([^'']+)''',
    'g'
  ) AS match_row(value);
  v_recent_normalized := pg_catalog.lower(pg_catalog.regexp_replace(
    COALESCE(v_recent_expression, ''), '[[:space:]]+', '', 'g'
  ));
  IF v_recent_expression IS NULL
     OR v_recent_sources IS DISTINCT FROM ARRAY[
       'events', 'expenses', 'heimilisverkin', 'loans'
     ]::text[]
     OR v_recent_normalized NOT IN (
       'source=any(array[''loans''::text,''expenses''::text,''events''::text,''heimilisverkin''::text])',
       '(source=any(array[''loans''::text,''expenses''::text,''events''::text,''heimilisverkin''::text]))'
     )
     OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_row.indexrelid
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'recent_events_household_chore_entity_idx'
      AND index_row.indrelid = 'public.recent_events'::pg_catalog.regclass
      AND index_row.indisvalid
      AND index_row.indisready
      AND NOT index_row.indisunique
      AND index_row.indnkeyatts = 3
      AND index_row.indnatts = 3
      AND index_row.indexprs IS NULL
      AND index_row.indkey[0] = (
        SELECT attribute_row.attnum
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = 'public.recent_events'::pg_catalog.regclass
          AND attribute_row.attname = 'entity_type'
          AND NOT attribute_row.attisdropped
      )
      AND index_row.indkey[1] = (
        SELECT attribute_row.attnum
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = 'public.recent_events'::pg_catalog.regclass
          AND attribute_row.attname = 'entity_id'
          AND NOT attribute_row.attisdropped
      )
      AND index_row.indkey[2] = (
        SELECT attribute_row.attnum
        FROM pg_catalog.pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = 'public.recent_events'::pg_catalog.regclass
          AND attribute_row.attname = 'user_id'
          AND NOT attribute_row.attisdropped
      )
      AND pg_catalog.replace(
        pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid),
        ' ', ''
      ) IN (
        '(source=''heimilisverkin''::text)',
        'source=''heimilisverkin''::text'
      )
  ) THEN
    RAISE EXCEPTION 'household_chore_142_recent_contract_failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.feature_access AS access_row
    WHERE access_row.feature_key = 'heimilisverkin'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.feature_access'::pg_catalog.regclass
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
    RAISE EXCEPTION 'household_chore_142_feature_state_changed';
  END IF;
END;
$final_attestation$;

COMMIT;
