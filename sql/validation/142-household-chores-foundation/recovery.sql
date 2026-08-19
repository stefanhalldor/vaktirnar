-- SQL142 recovery assessment.
-- Read-only by design. A failed SQL142 transaction should be rolled back by
-- PostgreSQL; this file only reports whether any target catalog objects exist.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL quote_all_identifiers = off;

WITH
target_relations AS (
  SELECT
    pg_catalog.count(*)::integer AS found,
    COALESCE((
      pg_catalog.array_agg(
        pg_catalog.format('%I.%I', namespace_row.nspname, relation_row.relname)
        ORDER BY namespace_row.nspname, relation_row.relname
      )
    )[1:100],
      ARRAY[]::text[]
    ) AS names
  FROM pg_catalog.pg_class AS relation_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation_row.relnamespace
  WHERE namespace_row.nspname = 'public'
    AND (
      pg_catalog.left(relation_row.relname::text, 16) = 'household_chore_'
      OR relation_row.relname = 'recent_events_household_chore_entity_idx'
    )
),
target_functions AS (
  SELECT
    pg_catalog.count(*)::integer AS found,
    COALESCE((
      pg_catalog.array_agg(
        pg_catalog.format(
          '%I.%I(%s)', namespace_row.nspname, function_row.proname,
          pg_catalog.pg_get_function_identity_arguments(function_row.oid)
        ) ORDER BY function_row.proname,
          pg_catalog.pg_get_function_identity_arguments(function_row.oid)
      )
    )[1:100],
      ARRAY[]::text[]
    ) AS names
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND pg_catalog.left(function_row.proname::text, 16) = 'household_chore_'
),
target_types AS (
  SELECT
    pg_catalog.count(*)::integer AS found,
    COALESCE((
      pg_catalog.array_agg(
        type_row.typname::text ORDER BY type_row.typname::text
      )
    )[1:100], ARRAY[]::text[]) AS names
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
target_triggers AS (
  SELECT
    pg_catalog.count(*)::integer AS found,
    COALESCE((
      pg_catalog.array_agg(
        pg_catalog.format(
          '%I.%I:%I', namespace_row.nspname, relation_row.relname,
          trigger_row.tgname
        ) ORDER BY namespace_row.nspname, relation_row.relname,
          trigger_row.tgname
      )
    )[1:100],
      ARRAY[]::text[]
    ) AS names
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
  ) AS exact_ok
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  (SELECT target_relations.found FROM target_relations) AS target_relation_objects,
  (SELECT target_relations.names FROM target_relations) AS target_relation_names,
  (SELECT target_functions.found FROM target_functions) AS target_functions,
  (SELECT target_functions.names FROM target_functions) AS target_function_names,
  (SELECT target_types.found FROM target_types) AS target_type_objects,
  (SELECT target_types.names FROM target_types) AS target_type_names,
  (SELECT target_triggers.found FROM target_triggers) AS target_triggers,
  (SELECT target_triggers.names FROM target_triggers) AS target_trigger_names,
  COALESCE((SELECT feature_contract.exact_ok FROM feature_contract), false)
    AS rollout_constraint_exact_ok,
  COALESCE((
    SELECT pg_catalog.pg_get_expr(
      constraint_row.conbin,
      constraint_row.conrelid,
      false
    )
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.recent_events')
      AND constraint_row.conname = 'recent_events_source_check'
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
  ), '<missing>') AS recent_source_expression,
  'No destructive recovery is provided. Failed SQL142 runs roll back; after a committed run use a reviewed forward fix.'::text
    AS operator_note;

ROLLBACK;
