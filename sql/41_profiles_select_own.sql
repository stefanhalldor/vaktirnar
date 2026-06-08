-- =============================================================================
-- sql/41_profiles_select_own.sql
-- Harden profiles_select: authenticated users may only read their own row.
--
-- Before this migration:
--   CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
--   USING (true);  -- any authenticated user can read any profile row
--
-- After this migration:
--   CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
--   USING (id = auth.uid());  -- authenticated users read only their own row
--
-- Unaffected:
--   - service_role (BYPASSRLS): all loan RPCs and legacy RPCs are unaffected.
--   - anon: already has no access (no grant).
--   - profiles_update and profiles_insert_own (sql/26): unchanged; already
--     use USING/WITH CHECK (id = auth.uid()).
--
-- Legacy impact (Path A, accepted by Stebbi 2026-06-08):
--   app/(app)/children/[id]/page.tsx reads co-parent profiles via the
--   authenticated client. After this migration the embedded relation returns
--   null for co-parents. The page uses defensive optional chaining
--   (row.parent?.id, row.parent?.display_name) so it degrades gracefully.
--   LEGACY_ENABLED=false is the production setting; the page is
--   middleware-blocked in production.
--
-- Deployment order:
--   1. Run preflight (read-only):
--      SELECT policyname, cmd, qual
--      FROM pg_policies
--      WHERE tablename = 'profiles' AND schemaname = 'public';
--      Expected: profiles_select with qual = true (or already migrated).
--   2. Apply this migration.
--   3. Deploy app with optional-chaining fix to children/[id]/page.tsx.
--      (No other app code change needed.)
--
-- Rollback:
--   DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
--   CREATE POLICY "profiles_select" ON public.profiles
--     FOR SELECT TO authenticated USING (true);
--
-- Safety:
--   - Schema change only. No INSERT, UPDATE, DELETE, DROP TABLE, or
--     ALTER TABLE on any data table.
--   - No existing rows are modified or deleted.
--   - ON CONFLICT not applicable (policy replace, not row upsert).
--   - Safe to re-run: DROP IF EXISTS before CREATE.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

COMMIT;
