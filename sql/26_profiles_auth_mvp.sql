-- Teskeið auth MVP: minimal, idempotent profiles hardening
-- Does NOT change profiles_select (kept as USING(true) — needed for co-parent display in Krakkavaktin)
-- Does NOT drop or rename any tables or columns

-- 1. Harden profiles_update with WITH CHECK (was missing)
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. Add insert-own policy for upsert fallback when trigger fails
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- 3. Explicit grants for authenticated (no grants exist in 01_schema.sql)
-- anon gets no access; DELETE not granted
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

-- 4. Fix handle_new_user: ON CONFLICT DO NOTHING + preserve search_path fix from 02_fix_handle_new_user.sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
