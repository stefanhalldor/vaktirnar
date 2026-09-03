-- SQL170 ACL-HARDENING OPERATOR DESIGN: exact predecessor table ACLs; DO NOT RUN without separate approval.
-- Run this single DO statement standalone; do not wrap it in a caller-created explicit transaction.
-- Any error aborts the statement's implicit transaction and releases its locks.

DO $acl_hardening$
DECLARE
  v_profiles_oid oid := pg_catalog.to_regclass('public.profiles');
  v_relationships_oid oid := pg_catalog.to_regclass('public.relationships');
  v_profiles_acl text[];
  v_relationships_acl text[];
  v_profiles_unexpected_grant boolean;
  v_relationships_unexpected_grant boolean;
  v_profiles_column_acl_count integer;
  v_relationships_column_acl_count integer;
  v_profiles_before constant text[] := ARRAY[
    'anon:DELETE','anon:INSERT','anon:MAINTAIN','anon:REFERENCES',
    'anon:SELECT','anon:TRIGGER','anon:TRUNCATE','anon:UPDATE',
    'authenticated:DELETE','authenticated:INSERT','authenticated:MAINTAIN',
    'authenticated:REFERENCES','authenticated:SELECT','authenticated:TRIGGER',
    'authenticated:TRUNCATE','authenticated:UPDATE',
    'service_role:DELETE','service_role:INSERT','service_role:MAINTAIN',
    'service_role:REFERENCES','service_role:SELECT','service_role:TRIGGER',
    'service_role:TRUNCATE','service_role:UPDATE'
  ]::text[];
  v_profiles_target constant text[] := ARRAY[
    'authenticated:INSERT','authenticated:SELECT','authenticated:UPDATE',
    'service_role:INSERT','service_role:SELECT'
  ]::text[];
  v_relationships_before constant text[] := ARRAY[
    'service_role:DELETE','service_role:INSERT','service_role:MAINTAIN',
    'service_role:REFERENCES','service_role:SELECT','service_role:TRIGGER',
    'service_role:TRUNCATE','service_role:UPDATE'
  ]::text[];
  v_relationships_target constant text[] := ARRAY[
    'service_role:DELETE','service_role:INSERT',
    'service_role:SELECT','service_role:UPDATE'
  ]::text[];
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL search_path = '';

  -- Keep the catalog precondition and ACL mutations in one lock scope. These
  -- locks read no application rows and make a concurrent ACL/schema change stop
  -- or wait instead of racing the manifest comparison.
  LOCK TABLE public.profiles, public.relationships IN ACCESS EXCLUSIVE MODE;

  IF CURRENT_USER <> 'postgres' THEN
    RAISE EXCEPTION 'sql170_acl_hardening_stop_executor';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
    RAISE EXCEPTION 'sql170_acl_hardening_stop_roles';
  END IF;

  IF v_profiles_oid IS NULL OR v_relationships_oid IS NULL THEN
    RAISE EXCEPTION 'sql170_acl_hardening_stop_relations_absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = class_row.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = class_row.relowner
    WHERE class_row.oid = v_profiles_oid
      AND namespace_row.nspname = 'public'
      AND class_row.relkind = 'r'
      AND class_row.relpersistence = 'p'
      AND class_row.relrowsecurity
      AND NOT class_row.relforcerowsecurity
      AND owner_role.rolname = 'postgres'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = class_row.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = class_row.relowner
    WHERE class_row.oid = v_relationships_oid
      AND namespace_row.nspname = 'public'
      AND class_row.relkind = 'r'
      AND class_row.relpersistence = 'p'
      AND class_row.relrowsecurity
      AND NOT class_row.relforcerowsecurity
      AND owner_role.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION 'sql170_acl_hardening_stop_relation_identity';
  END IF;

  SELECT
    COALESCE((
      SELECT pg_catalog.array_agg(
        COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type
        ORDER BY (COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type)
          COLLATE pg_catalog."C"
      )::text[]
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl.grantee
      WHERE acl.grantee <> class_row.relowner
    ), ARRAY[]::text[]),
    COALESCE((
      SELECT pg_catalog.bool_or(
        acl.grantor <> class_row.relowner OR acl.is_grantable
      )
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS acl
    ), false),
    (SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = class_row.oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND attribute.attacl IS NOT NULL)
  INTO v_profiles_acl, v_profiles_unexpected_grant,
    v_profiles_column_acl_count
  FROM pg_catalog.pg_class AS class_row
  WHERE class_row.oid = v_profiles_oid;

  SELECT
    COALESCE((
      SELECT pg_catalog.array_agg(
        COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type
        ORDER BY (COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type)
          COLLATE pg_catalog."C"
      )::text[]
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl.grantee
      WHERE acl.grantee <> class_row.relowner
    ), ARRAY[]::text[]),
    COALESCE((
      SELECT pg_catalog.bool_or(
        acl.grantor <> class_row.relowner OR acl.is_grantable
      )
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS acl
    ), false),
    (SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = class_row.oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND attribute.attacl IS NOT NULL)
  INTO v_relationships_acl, v_relationships_unexpected_grant,
    v_relationships_column_acl_count
  FROM pg_catalog.pg_class AS class_row
  WHERE class_row.oid = v_relationships_oid;

  IF v_profiles_unexpected_grant OR v_relationships_unexpected_grant THEN
    RAISE EXCEPTION 'sql170_acl_hardening_stop_grantor_or_grant_option';
  END IF;

  IF v_profiles_column_acl_count <> 0 OR v_relationships_column_acl_count <> 0 THEN
    RAISE EXCEPTION 'sql170_acl_hardening_stop_column_acl';
  END IF;

  IF v_profiles_acl IS DISTINCT FROM v_profiles_before
     AND v_profiles_acl IS DISTINCT FROM v_profiles_target THEN
    RAISE EXCEPTION 'sql170_acl_hardening_stop_profiles_acl';
  END IF;

  IF v_relationships_acl IS DISTINCT FROM v_relationships_before
     AND v_relationships_acl IS DISTINCT FROM v_relationships_target THEN
    RAISE EXCEPTION 'sql170_acl_hardening_stop_relationships_acl';
  END IF;

  -- Remove only known excess privileges. Retained grants already exist in both
  -- admitted states, so a missing retained grant is drift and stops above rather
  -- than being silently recreated with possibly different provenance. These are
  -- exact constant commands; no identifier or input is interpolated.
  EXECUTE 'REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles FROM anon';
  EXECUTE 'REVOKE DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.profiles FROM authenticated';
  EXECUTE 'REVOKE DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles FROM service_role';

  -- DELETE is intentionally retained as an approved product capability: a
  -- Tengsl owner must be able to delete the relationship record itself.
  EXECUTE 'REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.relationships FROM service_role';

  -- Re-read every ACL postcondition while the same locks are still held.
  SELECT
    COALESCE((
      SELECT pg_catalog.array_agg(
        COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type
        ORDER BY (COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type)
          COLLATE pg_catalog."C"
      )::text[]
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl.grantee
      WHERE acl.grantee <> class_row.relowner
    ), ARRAY[]::text[]),
    COALESCE((
      SELECT pg_catalog.bool_or(
        acl.grantor <> class_row.relowner OR acl.is_grantable
      )
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS acl
    ), false),
    (SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = class_row.oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND attribute.attacl IS NOT NULL)
  INTO v_profiles_acl, v_profiles_unexpected_grant,
    v_profiles_column_acl_count
  FROM pg_catalog.pg_class AS class_row
  WHERE class_row.oid = v_profiles_oid;

  SELECT
    COALESCE((
      SELECT pg_catalog.array_agg(
        COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type
        ORDER BY (COALESCE(grantee_role.rolname, 'PUBLIC') || ':' || acl.privilege_type)
          COLLATE pg_catalog."C"
      )::text[]
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = acl.grantee
      WHERE acl.grantee <> class_row.relowner
    ), ARRAY[]::text[]),
    COALESCE((
      SELECT pg_catalog.bool_or(
        acl.grantor <> class_row.relowner OR acl.is_grantable
      )
      FROM pg_catalog.aclexplode(COALESCE(
        class_row.relacl,
        pg_catalog.acldefault('r', class_row.relowner)
      )) AS acl
    ), false),
    (SELECT pg_catalog.count(*)::integer
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = class_row.oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND attribute.attacl IS NOT NULL)
  INTO v_relationships_acl, v_relationships_unexpected_grant,
    v_relationships_column_acl_count
  FROM pg_catalog.pg_class AS class_row
  WHERE class_row.oid = v_relationships_oid;

  IF v_profiles_oid IS NULL OR v_relationships_oid IS NULL
     OR v_profiles_acl IS DISTINCT FROM v_profiles_target
     OR v_relationships_acl IS DISTINCT FROM v_relationships_target
     OR v_profiles_unexpected_grant
     OR v_relationships_unexpected_grant
     OR v_profiles_column_acl_count <> 0
     OR v_relationships_column_acl_count <> 0 THEN
    RAISE EXCEPTION 'sql170_acl_hardening_postcondition_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS class_row
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = class_row.relowner
    WHERE class_row.oid = v_profiles_oid
      AND class_row.relkind = 'r' AND class_row.relpersistence = 'p'
      AND class_row.relrowsecurity AND NOT class_row.relforcerowsecurity
      AND owner_role.rolname = 'postgres'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS class_row
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = class_row.relowner
    WHERE class_row.oid = v_relationships_oid
      AND class_row.relkind = 'r' AND class_row.relpersistence = 'p'
      AND class_row.relrowsecurity AND NOT class_row.relforcerowsecurity
      AND owner_role.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION 'sql170_acl_hardening_postcondition_identity_failed';
  END IF;
END
$acl_hardening$;
