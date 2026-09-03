-- SQL170 DIAGNOSTIC: bounded catalog-only helper-dependency and relation-ACL evidence.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';

WITH
helper_manifest(signature, expected_language) AS MATERIALIZED (
  VALUES
    ('public.teskeid_event_assert_session_actor(uuid)', 'plpgsql'::text),
    ('public.expense_assert_beta_actor(uuid)', 'plpgsql'::text),
    ('public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)', 'plpgsql'::text),
    ('public.expense_sql159_snapshot_is_valid(uuid)', 'sql'::text),
    ('public.expense_sql159_audience_allows(uuid,uuid)', 'sql'::text),
    ('public.expense_settlement_eligible_balances_v1(uuid,boolean)', 'plpgsql'::text)
), helper_observed AS MATERIALIZED (
  SELECT manifest.signature, manifest.expected_language,
    routine.oid IS NOT NULL AS helper_exists,
    manifest.expected_language <> 'sql' AS language_dependency_required,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = routine.oid
        AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
        AND dependency.refobjid = pg_catalog.to_regnamespace('public')
    ) AS namespace_dependency_present,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend AS dependency
      JOIN pg_catalog.pg_language AS language_row
        ON language_row.oid = dependency.refobjid
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = routine.oid
        AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
        AND language_row.lanname = manifest.expected_language
    ) AS language_dependency_present,
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = routine.oid
        AND dependency.deptype = 'e'
    ) AS extension_dependency_absent
  FROM helper_manifest AS manifest
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(manifest.signature)
), helper_items AS MATERIALIZED (
  SELECT observed.*,
    observed.helper_exists
      AND observed.namespace_dependency_present
      AND (NOT observed.language_dependency_required
        OR observed.language_dependency_present)
      AND observed.extension_dependency_absent AS item_exact
  FROM helper_observed AS observed
), relation_manifest(name, expected_nonowner_acl) AS MATERIALIZED (
  VALUES
    ('expense_private_drafts', ARRAY[]::text[]),
    ('expense_unconfirmed_publications', ARRAY[]::text[]),
    ('expense_unconfirmed_publication_parties', ARRAY[]::text[]),
    ('expense_unconfirmed_publication_audience', ARRAY[]::text[]),
    ('expense_edit_revision_bindings', ARRAY[]::text[]),
    ('expense_groups', ARRAY['service_role:SELECT']::text[]),
    ('expense_group_members', ARRAY['service_role:SELECT']::text[]),
    ('expenses', ARRAY['service_role:SELECT']::text[]),
    ('expense_payments', ARRAY['service_role:SELECT']::text[]),
    ('expense_shares', ARRAY['service_role:SELECT']::text[]),
    ('expense_repayments', ARRAY['service_role:SELECT']::text[]),
    ('expense_member_identity_bindings', ARRAY[]::text[]),
    ('relationships', ARRAY[
      'service_role:DELETE','service_role:INSERT',
      'service_role:SELECT','service_role:UPDATE']::text[]),
    ('profiles', ARRAY[
      'authenticated:INSERT','authenticated:SELECT',
      'authenticated:UPDATE','service_role:INSERT',
      'service_role:SELECT']::text[]),
    ('relationship_circles', ARRAY['service_role:SELECT']::text[]),
    ('relationship_circle_members', ARRAY['service_role:SELECT']::text[]),
    ('relationship_circle_expense_contexts', ARRAY['service_role:SELECT']::text[])
), relation_observed AS MATERIALIZED (
  SELECT manifest.name, manifest.expected_nonowner_acl,
    class_row.oid IS NOT NULL AS relation_exists,
    COALESCE(acl_state.actual_nonowner_acl, ARRAY[]::text[])
      AS actual_nonowner_acl,
    COALESCE(acl_state.unexpected_grantor_or_grantable, false)
      AS unexpected_grantor_or_grantable,
    COALESCE(column_state.column_acl_count, 0)::integer AS column_acl_count
  FROM relation_manifest AS manifest
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass('public.' || manifest.name)
  LEFT JOIN LATERAL (
    SELECT COALESCE(pg_catalog.array_agg(
        COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type
        ORDER BY (COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type)
          COLLATE pg_catalog."C"
      ) FILTER (WHERE acl.grantee <> class_row.relowner), ARRAY[]::text[])
        AS actual_nonowner_acl,
      COALESCE(pg_catalog.bool_or(
        acl.grantor <> class_row.relowner OR acl.is_grantable
      ), false) AS unexpected_grantor_or_grantable
    FROM pg_catalog.aclexplode(COALESCE(
      class_row.relacl, pg_catalog.acldefault('r', class_row.relowner)
    )) AS acl
    LEFT JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = acl.grantee
  ) AS acl_state ON true
  LEFT JOIN LATERAL (
    SELECT pg_catalog.count(*)::integer AS column_acl_count
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = class_row.oid
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attacl IS NOT NULL
  ) AS column_state ON true
), relation_items AS MATERIALIZED (
  SELECT observed.*,
    observed.relation_exists
      AND observed.actual_nonowner_acl = observed.expected_nonowner_acl
      AND NOT observed.unexpected_grantor_or_grantable
      AND observed.column_acl_count = 0 AS item_exact
  FROM relation_observed AS observed
), diagnostic_counts AS MATERIALIZED (
  SELECT
    (SELECT pg_catalog.count(*)::integer FROM helper_manifest)
      AS expected_helper_count,
    (SELECT pg_catalog.count(DISTINCT signature)::integer FROM helper_manifest)
      AS distinct_helper_count,
    (SELECT pg_catalog.count(*)::integer FROM helper_items WHERE helper_exists)
      AS observed_helper_count,
    (SELECT pg_catalog.count(*)::integer FROM helper_items WHERE NOT item_exact)
      AS helper_drift_count,
    (SELECT pg_catalog.count(*)::integer FROM relation_manifest)
      AS expected_relation_count,
    (SELECT pg_catalog.count(DISTINCT name)::integer FROM relation_manifest)
      AS distinct_relation_count,
    (SELECT pg_catalog.count(*)::integer FROM relation_items WHERE relation_exists)
      AS observed_relation_count,
    (SELECT pg_catalog.count(*)::integer FROM relation_items WHERE NOT item_exact)
      AS relation_drift_count
), diagnostic_items AS MATERIALIZED (
  SELECT
    COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'item_kind', 'helper_dependency',
        'item_name', item.signature,
        'expected_language', item.expected_language,
        'language_dependency_required', item.language_dependency_required,
        'namespace_dependency_present', item.namespace_dependency_present,
        'language_dependency_present', item.language_dependency_present,
        'extension_dependency_absent', item.extension_dependency_absent,
        'item_exact', item.item_exact
      ) ORDER BY item.signature COLLATE pg_catalog."C")
      FROM helper_items AS item
    ), '[]'::jsonb) AS helper_dependency_diagnostics,
    COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'item_kind', 'relation_acl',
        'item_name', item.name,
        'expected_nonowner_acl', item.expected_nonowner_acl,
        'actual_nonowner_acl', item.actual_nonowner_acl,
        'unexpected_grantor_or_grantable', item.unexpected_grantor_or_grantable,
        'column_acl_count', item.column_acl_count,
        'item_exact', item.item_exact
      ) ORDER BY item.name COLLATE pg_catalog."C")
      FROM relation_items AS item
    ), '[]'::jsonb) AS relation_acl_diagnostics
)
SELECT pg_catalog.jsonb_build_object(
  'contract_version', 1,
  'expected_helper_count', counts.expected_helper_count,
  'observed_helper_count', counts.observed_helper_count,
  'helper_drift_count', counts.helper_drift_count,
  'expected_relation_count', counts.expected_relation_count,
  'observed_relation_count', counts.observed_relation_count,
  'relation_drift_count', counts.relation_drift_count,
  'helper_dependency_diagnostics', items.helper_dependency_diagnostics,
  'relation_acl_diagnostics', items.relation_acl_diagnostics,
  'classification', CASE
    WHEN counts.expected_helper_count <> 6
      OR counts.distinct_helper_count <> 6
      OR counts.observed_helper_count <> 6
      OR counts.expected_relation_count <> 17
      OR counts.distinct_relation_count <> 17
      OR counts.observed_relation_count <> 17
      THEN 'STOP_DIAGNOSTIC_INCOMPLETE'
    WHEN counts.helper_drift_count = 0 AND counts.relation_drift_count = 0
      THEN 'DIAGNOSTIC_EXPECTATIONS_EXACT'
    WHEN counts.helper_drift_count > 0 AND counts.relation_drift_count > 0
      THEN 'STOP_HELPER_DEPENDENCY_AND_RELATION_ACL_DRIFT'
    WHEN counts.helper_drift_count > 0
      THEN 'STOP_HELPER_DEPENDENCY_DRIFT'
    WHEN counts.relation_drift_count > 0
      THEN 'STOP_RELATION_ACL_DRIFT'
    ELSE 'STOP_DIAGNOSTIC_INCOMPLETE'
  END
) AS diagnostic
FROM diagnostic_counts AS counts
CROSS JOIN diagnostic_items AS items;

ROLLBACK;
