-- Platform: spaces and space_members
-- Idempotent migration.
-- Dependency: teskeid_set_updated_at() must exist (04_teskeid_schema.sql).
-- All access to these tables goes through SECURITY DEFINER functions.
-- Direct client access is revoked; no policies are needed (RLS default = deny all).

-- ============================================================
-- SPACES
-- ============================================================

CREATE TABLE IF NOT EXISTS spaces (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text        NOT NULL CHECK (type = 'personal'),
  name       text        CHECK (char_length(name) <= 200),
  created_by uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One personal space per user. Conflict target for ensure_personal_space().
CREATE UNIQUE INDEX IF NOT EXISTS spaces_one_personal_per_user
  ON spaces (created_by) WHERE type = 'personal';

-- ============================================================
-- SPACE_MEMBERS
-- ============================================================

CREATE TABLE IF NOT EXISTS space_members (
  space_id   uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS space_members_user_id_idx
  ON space_members (user_id);

CREATE INDEX IF NOT EXISTS space_members_space_user_idx
  ON space_members (space_id, user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS spaces_updated_at ON spaces;
CREATE TRIGGER spaces_updated_at
  BEFORE UPDATE ON spaces
  FOR EACH ROW EXECUTE FUNCTION teskeid_set_updated_at();

-- ============================================================
-- RLS
-- Enable RLS. No policies = deny all by default.
-- If a grant is accidentally added later, RLS will still deny.
-- ============================================================

ALTER TABLE spaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GRANTS
-- No direct access for any role. All reads/writes via SECURITY DEFINER functions.
-- ============================================================

REVOKE ALL ON spaces        FROM anon, authenticated;
REVOKE ALL ON space_members FROM anon, authenticated;

-- ============================================================
-- FUNCTION: public.is_space_member
-- Used in loan_items RLS to check membership without recursive
-- policy evaluation on space_members.
--
-- SECURITY DEFINER: runs as function owner (migration/admin role),
-- bypasses RLS on space_members. search_path = '' prevents schema
-- injection. User identity sourced from auth.uid() only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_members
    WHERE space_id = p_space_id
      AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_space_member(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_space_member(uuid) TO authenticated;
-- anon: no access

-- ============================================================
-- FUNCTION: public.ensure_personal_space
-- Idempotently creates a personal space and owner membership for
-- the authenticated user. Returns the space_id (uuid).
--
-- SECURITY DEFINER: runs as function owner. Uses auth.uid() internally;
-- takes no user-controlled parameters. Concurrent-safe via partial
-- unique index + ON CONFLICT. Never returns null on success.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_personal_space()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_space_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ensure_personal_space: not authenticated';
  END IF;

  -- 1. Try to get existing personal space
  SELECT id INTO v_space_id
  FROM public.spaces
  WHERE created_by = v_user_id
    AND type = 'personal';

  -- 2. Create if not found (partial unique index handles concurrent creation)
  IF v_space_id IS NULL THEN
    INSERT INTO public.spaces (type, created_by)
    VALUES ('personal', v_user_id)
    ON CONFLICT (created_by) WHERE type = 'personal' DO NOTHING
    RETURNING id INTO v_space_id;

    -- Concurrent creation: another transaction won the INSERT; fetch existing row
    IF v_space_id IS NULL THEN
      SELECT id INTO v_space_id
      FROM public.spaces
      WHERE created_by = v_user_id
        AND type = 'personal';
    END IF;
  END IF;

  -- 3. Ensure owner membership (idempotent; also repairs missing membership)
  INSERT INTO public.space_members (space_id, user_id, role)
  VALUES (v_space_id, v_user_id, 'owner')
  ON CONFLICT (space_id, user_id) DO NOTHING;

  RETURN v_space_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_personal_space() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ensure_personal_space() TO authenticated;
-- anon: no access
