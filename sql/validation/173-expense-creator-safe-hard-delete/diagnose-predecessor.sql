-- SQL173 PREDECESSOR DIAGNOSTIC: catalog-only explanation of failed gates.
--
-- This query reads PostgreSQL catalogs only. It does not invoke the runtime
-- deletion capability and does not mutate an Expense or any application row.
WITH
expected_constraints(
  constraint_name, constraint_type, exact_definition, no_inherit
) AS (
  VALUES
    (
      'relationship_sources_relationship_id_source_type_source_id_key',
      'u',
      'UNIQUE (relationship_id, source_type, source_id)',
      true
    ),
    (
      'relationship_sources_source_type_check',
      'c',
      'CHECK ((source_type = ANY (ARRAY[''loans''::text, ''expenses''::text])))',
      false
    )
),
constraint_diagnostics AS MATERIALIZED (
  SELECT
    expected.constraint_name AS object_name,
    pg_catalog.jsonb_build_object(
      'present', constraint_row.oid IS NOT NULL,
      'expected_type', expected.constraint_type,
      'actual_type', constraint_row.contype::text,
      'expected_definition', expected.exact_definition,
      'actual_definition', pg_catalog.pg_get_constraintdef(constraint_row.oid),
      'expected_no_inherit', expected.no_inherit,
      'validated', constraint_row.convalidated,
      'deferrable', constraint_row.condeferrable,
      'initially_deferred', constraint_row.condeferred,
      'no_inherit', constraint_row.connoinherit,
      'is_local', constraint_row.conislocal,
      'inheritance_count', constraint_row.coninhcount,
      'exact', constraint_row.oid IS NOT NULL
        AND constraint_row.contype::text = expected.constraint_type
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid) = expected.exact_definition
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND constraint_row.connoinherit = expected.no_inherit
        AND constraint_row.conislocal
        AND constraint_row.coninhcount = 0
    ) AS details
  FROM expected_constraints AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass('public.relationship_sources')
   AND constraint_row.conname = expected.constraint_name
),
expected_relations(relation_name, service_dml) AS (
  VALUES
    ('relationship_sources', true),
    ('expense_mutation_requests', false)
),
relation_diagnostics AS MATERIALIZED (
  SELECT
    expected.relation_name AS object_name,
    pg_catalog.jsonb_build_object(
      'present', relation.oid IS NOT NULL,
      'owner', pg_catalog.pg_get_userbyid(relation.relowner),
      'relation_kind', relation.relkind,
      'row_security', relation.relrowsecurity,
      'force_row_security', relation.relforcerowsecurity,
      'relacl_is_null', relation.relacl IS NULL,
      'expected_total_acl_entries', CASE WHEN expected.service_dml THEN 12 ELSE 8 END,
      'actual_total_acl_entries', acl_summary.total_entries,
      'expected_postgres_entries', 8,
      'actual_postgres_entries', acl_summary.postgres_entries,
      'expected_service_role_entries', CASE WHEN expected.service_dml THEN 4 ELSE 0 END,
      'actual_service_role_entries', acl_summary.service_role_entries,
      'acl_entries', acl_summary.entries
    ) AS details
  FROM expected_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.relation_name)
  LEFT JOIN LATERAL (
    SELECT
      pg_catalog.count(*) AS total_entries,
      pg_catalog.count(*) FILTER (
        WHERE acl.grantee = pg_catalog.to_regrole('postgres')::oid
          AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
          AND acl.privilege_type = ANY(
            ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
          )
          AND NOT acl.is_grantable
      ) AS postgres_entries,
      pg_catalog.count(*) FILTER (
        WHERE acl.grantee = pg_catalog.to_regrole('service_role')::oid
          AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
          AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE'])
          AND NOT acl.is_grantable
      ) AS service_role_entries,
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
            'grantee', CASE
              WHEN acl.grantee = 0 THEN 'PUBLIC'
              ELSE pg_catalog.pg_get_userbyid(acl.grantee)
            END,
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          ORDER BY acl.grantee, acl.privilege_type COLLATE "C"
        ),
        '[]'::pg_catalog.jsonb
      ) AS entries
    FROM pg_catalog.aclexplode(
      COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
    ) AS acl
  ) AS acl_summary ON relation.oid IS NOT NULL
)
SELECT 'constraint'::text AS category, object_name, details
FROM constraint_diagnostics
UNION ALL
SELECT 'relation_acl'::text AS category, object_name, details
FROM relation_diagnostics
ORDER BY category, object_name;
