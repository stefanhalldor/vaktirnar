-- SQL173 PREDECESSOR ACL HARDENING: remove only legacy service-role overgrant.
--
-- This transaction changes table privileges only. It never invokes the runtime
-- deletion capability and never mutates an Expense or any application row.
BEGIN;

DO $do$
DECLARE
  v_total_entries bigint;
  v_owner_entries bigint;
  v_service_dml_entries bigint;
  v_service_all_entries bigint;
BEGIN
  IF (
    SELECT pg_catalog.pg_get_userbyid(relation.relowner)
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = pg_catalog.to_regclass('public.relationship_sources')
      AND relation.relkind = 'r'
  ) IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'expense_sql173_acl_hardening_relationship_sources_owner_drift';
  END IF;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE acl.grantee = pg_catalog.to_regrole('postgres')::oid
        AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
        AND acl.privilege_type = ANY(
          ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
        )
        AND NOT acl.is_grantable
    ),
    pg_catalog.count(*) FILTER (
      WHERE acl.grantee = pg_catalog.to_regrole('service_role')::oid
        AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
        AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE'])
        AND NOT acl.is_grantable
    ),
    pg_catalog.count(*) FILTER (
      WHERE acl.grantee = pg_catalog.to_regrole('service_role')::oid
        AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
        AND acl.privilege_type = ANY(
          ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
        )
        AND NOT acl.is_grantable
    )
  INTO
    v_total_entries,
    v_owner_entries,
    v_service_dml_entries,
    v_service_all_entries
  FROM pg_catalog.pg_class AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) AS acl
  WHERE relation.oid = pg_catalog.to_regclass('public.relationship_sources');

  IF NOT (
    v_owner_entries = 8
    AND (
      (
        v_total_entries = 16
        AND v_service_dml_entries = 4
        AND v_service_all_entries = 8
      )
      OR (
        v_total_entries = 12
        AND v_service_dml_entries = 4
        AND v_service_all_entries = 4
      )
    )
  ) THEN
    RAISE EXCEPTION 'expense_sql173_acl_hardening_relationship_sources_acl_drift';
  END IF;

  IF (
    SELECT pg_catalog.pg_get_userbyid(relation.relowner)
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = pg_catalog.to_regclass('public.expense_mutation_requests')
      AND relation.relkind = 'r'
  ) IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'expense_sql173_acl_hardening_mutation_requests_owner_drift';
  END IF;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE acl.grantee = pg_catalog.to_regrole('postgres')::oid
        AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
        AND acl.privilege_type = ANY(
          ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
        )
        AND NOT acl.is_grantable
    )
  INTO v_total_entries, v_owner_entries
  FROM pg_catalog.pg_class AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) AS acl
  WHERE relation.oid = pg_catalog.to_regclass('public.expense_mutation_requests');

  IF NOT (v_total_entries = 8 AND v_owner_entries = 8) THEN
    RAISE EXCEPTION 'expense_sql173_acl_hardening_mutation_requests_acl_drift';
  END IF;
END
$do$;

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.relationship_sources
  FROM service_role;

DO $do$
DECLARE
  v_total_entries bigint;
  v_owner_entries bigint;
  v_service_dml_entries bigint;
BEGIN
  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE acl.grantee = pg_catalog.to_regrole('postgres')::oid
        AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
        AND acl.privilege_type = ANY(
          ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
        )
        AND NOT acl.is_grantable
    ),
    pg_catalog.count(*) FILTER (
      WHERE acl.grantee = pg_catalog.to_regrole('service_role')::oid
        AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
        AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE'])
        AND NOT acl.is_grantable
    )
  INTO v_total_entries, v_owner_entries, v_service_dml_entries
  FROM pg_catalog.pg_class AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) AS acl
  WHERE relation.oid = pg_catalog.to_regclass('public.relationship_sources');

  IF NOT (
    v_total_entries = 12
    AND v_owner_entries = 8
    AND v_service_dml_entries = 4
  ) THEN
    RAISE EXCEPTION 'expense_sql173_acl_hardening_postcondition_failed';
  END IF;
END
$do$;

COMMIT;
