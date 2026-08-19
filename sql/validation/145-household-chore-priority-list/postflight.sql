-- Read-only SQL145 postflight. Every returned boolean must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH checks AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.household_chore_definitions'::pg_catalog.regclass
        AND attname = 'cadence_days'
        AND atttypid = 'integer'::pg_catalog.regtype
        AND NOT attnotnull AND atthasdef = false
        AND attnum > 0 AND NOT attisdropped
    ) AS cadence_column_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.household_chore_definitions'::pg_catalog.regclass
        AND attname = 'completion_scope'
        AND atttypid = 'text'::pg_catalog.regtype
        AND attnotnull AND atthasdef
        AND attnum > 0 AND NOT attisdropped
    ) AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attrdef AS default_row
      JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid = default_row.adrelid
       AND attribute_row.attnum = default_row.adnum
      WHERE default_row.adrelid =
        'public.household_chore_definitions'::pg_catalog.regclass
        AND attribute_row.attname = 'completion_scope'
        AND pg_catalog.pg_get_expr(
          default_row.adbin, default_row.adrelid
        ) = '''global''::text'
    ) AS scope_column_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_definitions'::pg_catalog.regclass
        AND conname = 'household_chore_definitions_cadence_days_check'
        AND contype = 'c' AND convalidated
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_definitions'::pg_catalog.regclass
        AND conname = 'household_chore_definitions_completion_scope_check'
        AND contype = 'c' AND convalidated
    ) AS definition_constraints_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_assignments'::pg_catalog.regclass
        AND conname = 'household_chore_assignments_origin_check'
        AND contype = 'c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%quick_completed%'
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.household_chore_assignment_events'::pg_catalog.regclass
        AND conname = 'household_chore_events_origin_check'
        AND contype = 'c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%quick_completed%'
    ) AS origin_constraints_ok,
    pg_catalog.to_regclass(
      'public.household_chore_assignments_completed_definition_idx'
    ) IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.household_chore_assignments_completed_participant_idx'
      ) IS NOT NULL
      AND pg_catalog.to_regclass(
        'public.household_chore_assignments_definition_participant_open_idx'
      ) IS NOT NULL AS indexes_ok,
    pg_catalog.to_regprocedure(
      'public.household_chore_private_priority_token(jsonb)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_definition_detail_v2(uuid,uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_get_priority_dashboard(uuid,uuid)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_create_definition_v2(uuid,uuid,uuid,text,text,text,integer,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_update_definition_v2(uuid,uuid,uuid,uuid,bigint,text,text,text,integer,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_complete_locked_assignment(uuid,public.household_chore_assignments)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'
      ) IS NOT NULL AS functions_ok,
    NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('public.household_chore_get_definition_detail_v2(uuid,uuid,uuid)'::pg_catalog.regprocedure),
        ('public.household_chore_get_priority_dashboard(uuid,uuid)'::pg_catalog.regprocedure),
        ('public.household_chore_create_definition_v2(uuid,uuid,uuid,text,text,text,integer,text)'::pg_catalog.regprocedure),
        ('public.household_chore_update_definition_v2(uuid,uuid,uuid,uuid,bigint,text,text,text,integer,text)'::pg_catalog.regprocedure),
        ('public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'::pg_catalog.regprocedure)
      ) AS callable(function_oid)
      WHERE pg_catalog.has_function_privilege(
          'anon', callable.function_oid, 'EXECUTE'
        )
        OR pg_catalog.has_function_privilege(
          'authenticated', callable.function_oid, 'EXECUTE'
        )
        OR NOT pg_catalog.has_function_privilege(
          'service_role', callable.function_oid, 'EXECUTE'
        )
    ) AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.household_chore_private_priority_token(jsonb)',
      'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.household_chore_private_complete_locked_assignment(uuid,public.household_chore_assignments)',
      'EXECUTE'
    ) AS function_security_ok,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS function_row
      WHERE function_row.oid IN (
        'public.household_chore_private_priority_token(jsonb)'::pg_catalog.regprocedure,
        'public.household_chore_get_definition_detail_v2(uuid,uuid,uuid)'::pg_catalog.regprocedure,
        'public.household_chore_get_priority_dashboard(uuid,uuid)'::pg_catalog.regprocedure,
        'public.household_chore_create_definition_v2(uuid,uuid,uuid,text,text,text,integer,text)'::pg_catalog.regprocedure,
        'public.household_chore_update_definition_v2(uuid,uuid,uuid,uuid,bigint,text,text,text,integer,text)'::pg_catalog.regprocedure,
        'public.household_chore_private_complete_locked_assignment(uuid,public.household_chore_assignments)'::pg_catalog.regprocedure,
        'public.household_chore_complete_definition(uuid,uuid,uuid,uuid,uuid,text)'::pg_catalog.regprocedure
      )
        AND (
          NOT function_row.prosecdef
          OR pg_catalog.cardinality(
            COALESCE(function_row.proconfig, ARRAY[]::text[])
          ) <> 1
          OR function_row.proconfig[1] NOT IN ('search_path=', 'search_path=""')
        )
    ) AS function_security_shape_ok,
    NOT EXISTS (
      SELECT 1 FROM public.household_chore_definitions AS definition_row
      WHERE definition_row.completion_scope NOT IN ('global', 'per_participant')
        OR (definition_row.cadence_days IS NOT NULL
          AND definition_row.cadence_days NOT BETWEEN 1 AND 3650)
    ) AS definition_data_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.household_chore_definitions'::pg_catalog.regclass
        AND relrowsecurity AND relforcerowsecurity
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.household_chore_assignments'::pg_catalog.regclass
        AND relrowsecurity AND relforcerowsecurity
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid IN (
        'public.household_chore_definitions'::pg_catalog.regclass,
        'public.household_chore_assignments'::pg_catalog.regclass
      )
    ) AS rls_posture_ok,
    pg_catalog.to_regprocedure(
      'public.feature_access_heimilisverkin_auth_email_guard()'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_link_participant(uuid,uuid,uuid,uuid,bigint,text,text)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_undo_completion(uuid,uuid,uuid,uuid,bigint)'
      ) IS NOT NULL AS sql142_144_unchanged_ok
), final AS (
  SELECT *,
    cadence_column_ok AND scope_column_ok AND definition_constraints_ok
      AND origin_constraints_ok AND indexes_ok AND functions_ok
      AND function_security_ok AND function_security_shape_ok
      AND definition_data_ok AND rls_posture_ok
      AND sql142_144_unchanged_ok AS postconditions_ok
  FROM checks
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  cadence_column_ok,
  scope_column_ok,
  definition_constraints_ok,
  origin_constraints_ok,
  indexes_ok,
  functions_ok,
  function_security_ok,
  function_security_shape_ok,
  definition_data_ok,
  rls_posture_ok,
  sql142_144_unchanged_ok,
  postconditions_ok
FROM final;

ROLLBACK;
