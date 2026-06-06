-- =============================================================================
-- sql/33_loan_preflight.sql
-- READ-ONLY preflight for "Lánað og skilað" — run BEFORE sql/30, 31, 32.
--
-- Purpose : Inspect the current state of the database and confirm that all
--           prerequisites are in place before running the loan migrations.
--
-- Safety  : This file contains only SELECT statements.  It does not contain
--           INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, GRANT, REVOKE,
--           TRUNCATE, or any function call that writes data.
--           It does not read rows from user-data tables (auth.users, profiles,
--           auth_mvp_allowlist, loan_items, loan_invitations).
--
-- How to use:
--   1. Run this script in the Supabase SQL Editor for the intended project.
--      It inspects metadata only and does not depend on an application JWT.
--   2. Review every result section.
--   3. The final "Readiness summary" section must show
--        ready_for_sql_30_to_32 = true
--      before running sql/30.
--   4. If loan_tables_absent = false, stop and investigate — do NOT proceed.
-- =============================================================================


-- =============================================================================
-- Section 1 — Environment identification
-- =============================================================================

SELECT
  current_database()  AS current_database,
  current_user        AS current_user,
  now()               AS current_timestamp;


-- =============================================================================
-- Section 2 — Table existence (to_regclass returns NULL if not found)
--
-- Expected state BEFORE migration:
--   profiles           → present (dependency)
--   auth_mvp_allowlist → present (dependency)
--   loan_items         → NULL    (not yet created — good)
--   loan_invitations   → NULL    (not yet created — good)
-- =============================================================================

SELECT
  'public.profiles'            AS table_ref,
  to_regclass('public.profiles')            AS oid_if_present;

SELECT
  'public.auth_mvp_allowlist'  AS table_ref,
  to_regclass('public.auth_mvp_allowlist')  AS oid_if_present;

SELECT
  'public.loan_items'          AS table_ref,
  to_regclass('public.loan_items')          AS oid_if_present;

SELECT
  'public.loan_invitations'    AS table_ref,
  to_regclass('public.loan_invitations')    AS oid_if_present;


-- =============================================================================
-- Section 3 — Dependency function existence (to_regprocedure)
--
-- Expected state BEFORE migration:
--   teskeid_set_updated_at() → present (dependency for sql/30 and sql/31)
-- =============================================================================

SELECT
  'public.teskeid_set_updated_at()' AS function_ref,
  to_regprocedure('public.teskeid_set_updated_at()') AS oid_if_present;


-- =============================================================================
-- Section 4 — Column metadata for the four tables
-- (Returns no rows for tables that do not yet exist — expected before migration)
-- =============================================================================

SELECT
  table_name,
  column_name,
  ordinal_position,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'auth_mvp_allowlist', 'loan_items', 'loan_invitations')
ORDER BY table_name, ordinal_position;


-- =============================================================================
-- Section 5 — Function metadata
-- Lists teskeid_set_updated_at and all 13 loan functions defined in sql/32.
-- Returns no rows for functions that do not yet exist.
-- =============================================================================

SELECT
  n.nspname                  AS schema,
  p.proname                  AS function_name,
  pg_catalog.pg_get_function_arguments(p.oid) AS argument_types,
  pg_catalog.pg_get_function_result(p.oid)    AS return_type,
  p.prosecdef                AS security_definer,
  p.proconfig                AS config  -- expect search_path='' for all loan functions
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'teskeid_set_updated_at',
    'create_loan',
    'update_loan',
    'get_my_loans',
    'get_my_pending_invitations',
    'get_invitation_for_claim',
    'claim_loan_invitation',
    'reserve_invitation_send',
    'update_invitation_delivery',
    'mark_returned',
    'undo_return',
    'cancel_invitation',
    'decline_invitation',
    'delete_loan'
  )
ORDER BY p.proname;


-- =============================================================================
-- Section 6 — RLS status (enabled and force)
-- Uses pg_class + pg_namespace because pg_tables does not expose
-- relforcerowsecurity (forcerowsecurity) in standard PostgreSQL.
-- Expected after migration:
--   loan_items         → rowsecurity = true,  forcerowsecurity = false
--   loan_invitations   → rowsecurity = true,  forcerowsecurity = false
-- (Returns no rows for tables that do not yet exist)
-- =============================================================================

SELECT
  n.nspname                AS schemaname,
  c.relname                AS tablename,
  c.relrowsecurity         AS rowsecurity,
  c.relforcerowsecurity    AS forcerowsecurity
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname IN ('profiles', 'auth_mvp_allowlist', 'loan_items', 'loan_invitations')
ORDER BY c.relname;


-- =============================================================================
-- Section 7 — RLS policies
-- Expected after migration: no explicit policies on loan_items or
-- loan_invitations (all access via service_role which bypasses RLS).
-- (Returns no rows for tables that do not yet exist)
-- =============================================================================

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'auth_mvp_allowlist', 'loan_items', 'loan_invitations')
ORDER BY tablename, policyname;


-- =============================================================================
-- Section 8 — Table grants for PUBLIC, anon, authenticated, service_role
-- Expected after migration:
--   loan_items / loan_invitations:
--     PUBLIC, anon, authenticated → no rows (all privileges revoked)
--     service_role                → SELECT, INSERT, UPDATE, DELETE
-- (Returns no rows for tables that do not yet exist)
-- =============================================================================

SELECT
  table_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'auth_mvp_allowlist', 'loan_items', 'loan_invitations')
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;


-- =============================================================================
-- Section 9a — Function EXECUTE privileges via information_schema
-- Used to detect PUBLIC grants (has_function_privilege is not used for PUBLIC).
-- Expected after migration: no rows with grantee = 'PUBLIC' for loan functions.
-- (Returns no rows for functions that do not yet exist)
-- =============================================================================

SELECT
  routine_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_loan', 'update_loan', 'get_my_loans',
    'get_my_pending_invitations', 'get_invitation_for_claim',
    'claim_loan_invitation', 'reserve_invitation_send',
    'update_invitation_delivery', 'mark_returned', 'undo_return',
    'cancel_invitation', 'decline_invitation', 'delete_loan'
  )
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY routine_name, grantee;


-- =============================================================================
-- Section 9b — Function EXECUTE via has_function_privilege (anon,
-- authenticated, service_role) using full signatures to avoid overload
-- ambiguity.  CASE guard prevents error when function does not yet exist.
--
-- Expected after migration:
--   anon, authenticated → false for all loan functions
--   service_role        → true  for all loan functions
-- =============================================================================

SELECT
  fname,
  sig,
  to_regprocedure(sig) IS NOT NULL AS function_exists,
  CASE WHEN to_regprocedure(sig) IS NOT NULL
    THEN has_function_privilege('anon',           to_regprocedure(sig), 'EXECUTE')
    ELSE NULL END AS anon_execute,
  CASE WHEN to_regprocedure(sig) IS NOT NULL
    THEN has_function_privilege('authenticated',  to_regprocedure(sig), 'EXECUTE')
    ELSE NULL END AS authenticated_execute,
  CASE WHEN to_regprocedure(sig) IS NOT NULL
    THEN has_function_privilege('service_role',   to_regprocedure(sig), 'EXECUTE')
    ELSE NULL END AS service_role_execute
FROM (VALUES
  ('create_loan',
   'public.create_loan(uuid,text,text,date,date,text,text,uuid)'),
  ('update_loan',
   'public.update_loan(uuid,uuid,text,text,date,date)'),
  ('get_my_loans',
   'public.get_my_loans(uuid)'),
  ('get_my_pending_invitations',
   'public.get_my_pending_invitations(uuid)'),
  ('get_invitation_for_claim',
   'public.get_invitation_for_claim(uuid,uuid)'),
  ('claim_loan_invitation',
   'public.claim_loan_invitation(uuid,uuid)'),
  ('reserve_invitation_send',
   'public.reserve_invitation_send(uuid,uuid)'),
  ('update_invitation_delivery',
   'public.update_invitation_delivery(uuid,uuid,integer,text)'),
  ('mark_returned',
   'public.mark_returned(uuid,uuid)'),
  ('undo_return',
   'public.undo_return(uuid,uuid)'),
  ('cancel_invitation',
   'public.cancel_invitation(uuid,uuid)'),
  ('decline_invitation',
   'public.decline_invitation(uuid,uuid)'),
  ('delete_loan',
   'public.delete_loan(uuid,uuid)')
) AS f(fname, sig)
ORDER BY fname;


-- =============================================================================
-- Section 10 — Role existence
-- Checks that the required Supabase/Postgres roles are present.
-- Does not read auth.users or any user data.
-- =============================================================================

SELECT
  rolname,
  rolcanlogin,
  rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY rolname;


-- =============================================================================
-- Section 11 — Readiness summary
--
-- dependency_objects_present   : profiles, auth_mvp_allowlist, and
--                                teskeid_set_updated_at() all exist
-- dependency_columns_compatible: profiles.id is uuid, profiles has display_name,
--                                auth_mvp_allowlist.email is text,
--                                teskeid_set_updated_at() returns trigger
-- required_roles_present       : anon, authenticated, service_role all exist
-- loan_tables_absent           : loan_items and loan_invitations do NOT exist
-- ready_for_sql_30_to_32       : all four conditions above are true
--
-- STOP if ready_for_sql_30_to_32 = false.
-- =============================================================================

WITH checks AS (
  SELECT
    -- Dependency objects
    to_regclass('public.profiles')           IS NOT NULL  AS profiles_exists,
    to_regclass('public.auth_mvp_allowlist') IS NOT NULL  AS allowlist_exists,
    -- Single exact-signature check: resolves the no-argument overload via
    -- to_regprocedure and confirms its return type on the same OID.
    -- Avoids matching a different overload that happens to return trigger.
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      WHERE p.oid = to_regprocedure('public.teskeid_set_updated_at()')
        AND p.prorettype = 'pg_catalog.trigger'::regtype
    ) AS trigger_function_compatible,

    -- Dependency column compatibility (reads only information_schema metadata)
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles'
        AND column_name = 'id' AND data_type = 'uuid'
    ) AS profiles_id_is_uuid,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles'
        AND column_name = 'display_name'
    ) AS profiles_has_display_name,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'auth_mvp_allowlist'
        AND column_name = 'email' AND data_type = 'text'
    ) AS allowlist_email_is_text,

    -- Required roles
    EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')           AS role_anon_exists,
    EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')  AS role_authenticated_exists,
    EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')   AS role_service_role_exists,

    -- Loan tables must be absent before migration
    to_regclass('public.loan_items')        IS NULL  AS loan_items_absent,
    to_regclass('public.loan_invitations')  IS NULL  AS loan_invitations_absent
)
SELECT
  (profiles_exists AND allowlist_exists AND trigger_function_compatible)
    AS dependency_objects_present,

  (profiles_id_is_uuid AND profiles_has_display_name AND
   allowlist_email_is_text AND trigger_function_compatible)
    AS dependency_columns_compatible,

  (role_anon_exists AND role_authenticated_exists AND role_service_role_exists)
    AS required_roles_present,

  (loan_items_absent AND loan_invitations_absent)
    AS loan_tables_absent,

  (profiles_exists AND allowlist_exists AND trigger_function_compatible AND
   profiles_id_is_uuid AND profiles_has_display_name AND
   allowlist_email_is_text AND
   role_anon_exists AND role_authenticated_exists AND role_service_role_exists AND
   loan_items_absent AND loan_invitations_absent)
    AS ready_for_sql_30_to_32
FROM checks;
