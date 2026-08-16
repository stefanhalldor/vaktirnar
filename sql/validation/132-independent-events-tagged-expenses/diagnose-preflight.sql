-- SQL132 preflight diagnostics -- READ ONLY.
-- Run only when recent_events_acl_exact_ok or feature_constraint_exact_ok is
-- false. This reports catalog metadata only; it does not expose user rows.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;

WITH expected_feature_keys(feature_key) AS (
  VALUES
    ('afmaeli-og-vidburdir'), ('agent-collaboration-private-beta'),
    ('auglysandi'), ('bokanir'), ('bokhaldid'), ('elta-vedrid'),
    ('facebook-oauth'), ('ferdalagid'), ('kviss'), ('road-intelligence-v1'),
    ('tengsl'), ('teskeid-routing-v1'), ('umonnun'),
    ('utlagt-og-endurgreitt'), ('vedrid'),
    ('weather-provider-vedurstofan'), ('weather-provider-vegagerdin'),
    ('weather-pulse')
), recent AS (
  SELECT
    relation.oid,
    relation.relkind,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    relation.relowner,
    relation.relacl,
    pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass('public.recent_events')
), recent_acl AS (
  SELECT
    privilege.grantee AS grantee_oid,
    COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
    privilege.grantor AS grantor_oid,
    COALESCE(grantor.rolname, 'PUBLIC') AS grantor,
    privilege.privilege_type,
    privilege.is_grantable,
    recent.relowner AS owner_oid
  FROM recent
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    recent.relacl,
    pg_catalog.acldefault('r', recent.relowner)
  )) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS grantee
    ON grantee.oid = privilege.grantee
  LEFT JOIN pg_catalog.pg_roles AS grantor
    ON grantor.oid = privilege.grantor
), recent_column_acl AS (
  SELECT
    attribute.attname AS column_name,
    privilege.grantee AS grantee_oid,
    COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type,
    privilege.is_grantable,
    recent.relowner AS owner_oid
  FROM recent
  JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = recent.oid
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS grantee
    ON grantee.oid = privilege.grantee
), browser AS (
  SELECT
    role_name,
    pg_catalog.has_table_privilege(role_name, recent.oid, 'SELECT') AS tbl_select,
    pg_catalog.has_table_privilege(role_name, recent.oid, 'INSERT') AS tbl_insert,
    pg_catalog.has_table_privilege(role_name, recent.oid, 'UPDATE') AS tbl_update,
    pg_catalog.has_table_privilege(role_name, recent.oid, 'DELETE') AS tbl_delete,
    pg_catalog.has_table_privilege(role_name, recent.oid, 'TRUNCATE') AS tbl_truncate,
    pg_catalog.has_table_privilege(role_name, recent.oid, 'REFERENCES') AS tbl_references,
    pg_catalog.has_table_privilege(role_name, recent.oid, 'TRIGGER') AS tbl_trigger,
    pg_catalog.has_table_privilege(role_name, recent.oid, 'MAINTAIN') AS tbl_maintain,
    pg_catalog.has_any_column_privilege(role_name, recent.oid, 'SELECT') AS col_select,
    pg_catalog.has_any_column_privilege(role_name, recent.oid, 'INSERT') AS col_insert,
    pg_catalog.has_any_column_privilege(role_name, recent.oid, 'UPDATE') AS col_update,
    pg_catalog.has_any_column_privilege(role_name, recent.oid, 'REFERENCES') AS col_references
  FROM recent
  CROSS JOIN (VALUES
    ('anon'::name), ('authenticated'::name)
  ) AS roles(role_name)
), feature AS (
  SELECT
    constraint_row.convalidated,
    constraint_row.conkey,
    pg_catalog.pg_get_expr(
      constraint_row.conbin, constraint_row.conrelid
    ) AS expression,
    (
      SELECT attribute.attnum
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = constraint_row.conrelid
        AND attribute.attname = 'feature_key'
        AND NOT attribute.attisdropped
    ) AS feature_key_attnum
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
), actual_feature_keys(feature_key) AS (
  SELECT (match.value)[1]
  FROM feature
  CROSS JOIN LATERAL pg_catalog.regexp_matches(
    feature.expression, '''([^'']+)''', 'g'
  ) AS match(value)
)
SELECT
  pg_catalog.jsonb_build_object(
    'exists', EXISTS (SELECT 1 FROM recent),
    'relkind', (SELECT relkind FROM recent),
    'rls_enabled', (SELECT relrowsecurity FROM recent),
    'force_rls', (SELECT relforcerowsecurity FROM recent),
    'owner', (SELECT owner_name FROM recent),
    'policy_count', (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid = (SELECT oid FROM recent)
    ),
    'service_effective', pg_catalog.jsonb_build_object(
      'select', (SELECT pg_catalog.has_table_privilege(
        'service_role', oid, 'SELECT'
      ) FROM recent),
      'insert', (SELECT pg_catalog.has_table_privilege(
        'service_role', oid, 'INSERT'
      ) FROM recent),
      'update', (SELECT pg_catalog.has_table_privilege(
        'service_role', oid, 'UPDATE'
      ) FROM recent),
      'delete', (SELECT pg_catalog.has_table_privilege(
        'service_role', oid, 'DELETE'
      ) FROM recent),
      'truncate', (SELECT pg_catalog.has_table_privilege(
        'service_role', oid, 'TRUNCATE'
      ) FROM recent),
      'references', (SELECT pg_catalog.has_table_privilege(
        'service_role', oid, 'REFERENCES'
      ) FROM recent),
      'trigger', (SELECT pg_catalog.has_table_privilege(
        'service_role', oid, 'TRIGGER'
      ) FROM recent),
      'maintain', (SELECT pg_catalog.has_table_privilege(
        'service_role', oid, 'MAINTAIN'
      ) FROM recent)
    ),
    'direct_acl', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'grantee', grantee,
        'grantor', grantor,
        'privilege', privilege_type,
        'grantable', is_grantable
      ) ORDER BY grantee, privilege_type)
      FROM recent_acl
    ), '[]'::jsonb),
    'unexpected_direct_acl', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'grantee', grantee,
        'grantor', grantor,
        'privilege', privilege_type,
        'grantable', is_grantable
      ) ORDER BY grantee, privilege_type)
      FROM recent_acl
      WHERE grantee_oid = 0
         OR is_grantable
         OR (grantee_oid <> owner_oid AND (
           grantee IS DISTINCT FROM 'service_role'
           OR privilege_type NOT IN (
             'SELECT', 'INSERT', 'MAINTAIN', 'REFERENCES',
             'TRIGGER', 'TRUNCATE', 'UPDATE', 'DELETE'
           )
          ))
         OR (grantee = 'service_role' AND grantor_oid <> owner_oid)
    ), '[]'::jsonb),
    'column_acl', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'column', column_name,
        'grantee', grantee,
        'privilege', privilege_type,
        'grantable', is_grantable
      ) ORDER BY column_name, grantee, privilege_type)
      FROM recent_column_acl
    ), '[]'::jsonb),
    'unexpected_column_acl', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'column', column_name,
        'grantee', grantee,
        'privilege', privilege_type,
        'grantable', is_grantable
      ) ORDER BY column_name, grantee, privilege_type)
      FROM recent_column_acl
      WHERE grantee_oid <> owner_oid OR is_grantable
    ), '[]'::jsonb),
    'browser_effective', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(browser) ORDER BY role_name
      )
      FROM browser
    ), '[]'::jsonb)
  ) AS recent_events_diagnostic,
  pg_catalog.jsonb_build_object(
    'validated', (SELECT convalidated FROM feature),
    'conkey', (SELECT conkey FROM feature),
    'feature_key_attnum', (SELECT feature_key_attnum FROM feature),
    'expression', (SELECT expression FROM feature),
    'expression_md5', (
      SELECT pg_catalog.md5(pg_catalog.lower(expression)) FROM feature
    ),
    'literal_sequence', COALESCE((
      SELECT pg_catalog.jsonb_agg(feature_key ORDER BY feature_key COLLATE "C")
      FROM actual_feature_keys
    ), '[]'::jsonb),
    'missing_expected', pg_catalog.to_jsonb(ARRAY(
      SELECT feature_key FROM expected_feature_keys
      EXCEPT SELECT feature_key FROM actual_feature_keys
      ORDER BY 1
    )),
    'unexpected', pg_catalog.to_jsonb(ARRAY(
      SELECT feature_key FROM actual_feature_keys
      EXCEPT SELECT feature_key FROM expected_feature_keys
      ORDER BY 1
    )),
    'duplicate_literals', pg_catalog.to_jsonb(ARRAY(
      SELECT feature_key FROM actual_feature_keys
      GROUP BY feature_key
      HAVING pg_catalog.count(*) <> 1
      ORDER BY 1
    )),
    'or_count', (
      SELECT pg_catalog.count(*)
      FROM feature
      CROSS JOIN LATERAL pg_catalog.regexp_matches(
        pg_catalog.lower(feature.expression), E'\\mor\\M', 'g'
      )
    )
  ) AS feature_constraint_diagnostic;

ROLLBACK;
