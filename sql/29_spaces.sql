-- Platform catch-up: personal spaces and owner memberships.
--
-- Production has not applied this historical foundation, while later Kviss
-- authoring depends on it. This is intentionally a one-time, fail-closed
-- migration: run the dedicated read-only preflight first. If any target object
-- already exists, the transaction stops without changing anything.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $spaces_foundation_preconditions$
DECLARE
  v_collision text;
BEGIN
  IF pg_catalog.to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'spaces_foundation_missing_dependency:auth.users';
  END IF;
  IF pg_catalog.to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'spaces_foundation_missing_dependency:auth.uid()';
  END IF;
  IF pg_catalog.to_regprocedure('public.teskeid_set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'spaces_foundation_missing_dependency:public.teskeid_set_updated_at()';
  END IF;
  IF pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'spaces_foundation_missing_dependency:gen_random_uuid()';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS required(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = required.role_name
    )
  ) THEN
    RAISE EXCEPTION 'spaces_foundation_missing_required_role';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
      AND (role.rolsuper OR role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'spaces_foundation_owner_cannot_bypass_rls:%', current_user;
  END IF;
  IF NOT pg_catalog.has_schema_privilege('authenticated', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'spaces_foundation_authenticated_missing_public_schema_usage';
  END IF;

  SELECT collision.name
    INTO v_collision
  FROM (
    SELECT target.name
    FROM (VALUES
      ('spaces'),
      ('space_members'),
      ('spaces_one_personal_per_user'),
      ('space_members_user_id_idx')
    ) AS target(name)
    WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL

    UNION ALL

    SELECT procedure.proname || '(' || pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')'
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN ('is_space_member', 'ensure_personal_space')
  ) AS collision
  ORDER BY collision.name
  LIMIT 1;

  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'spaces_foundation_collision:%', v_collision;
  END IF;
END;
$spaces_foundation_preconditions$;

CREATE TABLE public.spaces (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  type text NOT NULL,
  name text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT spaces_pkey PRIMARY KEY (id),
  CONSTRAINT spaces_type_check CHECK (type = 'personal'),
  CONSTRAINT spaces_name_check CHECK (name IS NULL OR pg_catalog.char_length(name) <= 200),
  CONSTRAINT spaces_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- One personal space per auth user. This is also the conflict target used by
-- ensure_personal_space() during concurrent first access.
CREATE UNIQUE INDEX spaces_one_personal_per_user
  ON public.spaces (created_by)
  WHERE type = 'personal';

CREATE TABLE public.space_members (
  space_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT space_members_pkey PRIMARY KEY (space_id, user_id),
  CONSTRAINT space_members_space_id_fkey
    FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE,
  CONSTRAINT space_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT space_members_role_check CHECK (role IN ('owner', 'member'))
);

CREATE INDEX space_members_user_id_idx
  ON public.space_members (user_id);

CREATE TRIGGER spaces_updated_at
  BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

-- Default deny. No table policies are created: callers use the two narrowly
-- granted SECURITY DEFINER functions below.
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_members FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.spaces
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.space_members
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.is_space_member(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_members AS membership
    WHERE membership.space_id = p_space_id
      AND membership.user_id = auth.uid()
  );
$$;

CREATE FUNCTION public.ensure_personal_space()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_space_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ensure_personal_space:not_authenticated';
  END IF;

  SELECT space.id
    INTO v_space_id
  FROM public.spaces AS space
  WHERE space.created_by = v_user_id
    AND space.type = 'personal';

  IF v_space_id IS NULL THEN
    INSERT INTO public.spaces (type, created_by)
    VALUES ('personal', v_user_id)
    ON CONFLICT (created_by) WHERE type = 'personal' DO NOTHING
    RETURNING id INTO v_space_id;

    -- A concurrent first request may have won the unique-index race.
    IF v_space_id IS NULL THEN
      SELECT space.id
        INTO v_space_id
      FROM public.spaces AS space
      WHERE space.created_by = v_user_id
        AND space.type = 'personal';
    END IF;
  END IF;

  IF v_space_id IS NULL THEN
    RAISE EXCEPTION 'ensure_personal_space:creation_failed';
  END IF;

  INSERT INTO public.space_members AS membership (space_id, user_id, role)
  VALUES (v_space_id, v_user_id, 'owner')
  ON CONFLICT (space_id, user_id) DO UPDATE
    SET role = EXCLUDED.role
    WHERE membership.role IS DISTINCT FROM EXCLUDED.role;

  RETURN v_space_id;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.is_space_member(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.ensure_personal_space()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_space_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_personal_space() TO authenticated;

COMMIT;
