-- SQL108: private custom relationship labels, reusable relationship circles,
-- consent-bound invitations, and optional expense context snapshots.
--
-- Invited users are deliberately allowed to inspect the full active member
-- list before accepting. Private labels, nicknames and notes are never part of
-- that shared projection.

BEGIN;

CREATE TABLE IF NOT EXISTS public.relationship_label_definitions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  normalized_name text        NOT NULL,
  version         bigint      NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationship_label_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT relationship_label_normalized_check CHECK (
    char_length(normalized_name) BETWEEN 1 AND 60 AND normalized_name = lower(btrim(normalized_name))
  ),
  CONSTRAINT relationship_label_version_check CHECK (version > 0),
  CONSTRAINT relationship_label_owner_name_unique UNIQUE (owner_id, normalized_name),
  CONSTRAINT relationship_label_owner_id_unique UNIQUE (owner_id, id)
);

CREATE TABLE IF NOT EXISTS public.relationship_label_assignments (
  owner_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label_id        uuid        NOT NULL,
  relationship_id uuid        NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (label_id, relationship_id),
  CONSTRAINT relationship_label_assignment_owner_label_fk
    FOREIGN KEY (owner_id, label_id)
    REFERENCES public.relationship_label_definitions(owner_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.relationship_circles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name        text        NOT NULL,
  description text        NULL,
  status      text        NOT NULL DEFAULT 'active',
  version     bigint      NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationship_circle_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT relationship_circle_description_check CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT relationship_circle_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT relationship_circle_version_check CHECK (version > 0),
  CONSTRAINT relationship_circle_owner_id_unique UNIQUE (owner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS relationship_circle_owner_name_idx
  ON public.relationship_circles (owner_id, lower(btrim(name)))
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.relationship_circle_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  uuid        NOT NULL REFERENCES public.relationship_circles(id) ON DELETE RESTRICT,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role       text        NOT NULL DEFAULT 'member',
  status     text        NOT NULL DEFAULT 'active',
  joined_at  timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationship_circle_member_role_check CHECK (role IN ('owner', 'member')),
  CONSTRAINT relationship_circle_member_status_check CHECK (status IN ('active', 'left', 'removed')),
  CONSTRAINT relationship_circle_member_lifecycle_check CHECK (
    (status = 'active' AND ended_at IS NULL) OR (status <> 'active' AND ended_at IS NOT NULL)
  ),
  CONSTRAINT relationship_circle_member_circle_id_unique UNIQUE (circle_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS relationship_circle_active_user_idx
  ON public.relationship_circle_members (circle_id, user_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS relationship_circle_active_owner_idx
  ON public.relationship_circle_members (circle_id) WHERE status = 'active' AND role = 'owner';
CREATE INDEX IF NOT EXISTS relationship_circle_member_user_idx
  ON public.relationship_circle_members (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.relationship_circle_invitations (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id               uuid        NOT NULL REFERENCES public.relationship_circles(id) ON DELETE RESTRICT,
  invited_by              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  invitee_user_id         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  invitee_email_canonical text        NULL,
  status                  text        NOT NULL DEFAULT 'pending',
  expires_at              timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  responded_at            timestamptz NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationship_circle_invitation_identity_check CHECK (
    invitee_user_id IS NOT NULL OR invitee_email_canonical IS NOT NULL
  ),
  CONSTRAINT relationship_circle_invitation_email_check CHECK (
    invitee_email_canonical IS NULL OR (
      invitee_email_canonical = public.normalize_email_canonical(invitee_email_canonical)
      AND char_length(invitee_email_canonical) BETWEEN 3 AND 320
    )
  ),
  CONSTRAINT relationship_circle_invitation_status_check CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')
  ),
  CONSTRAINT relationship_circle_invitation_lifecycle_check CHECK (
    (status = 'pending' AND responded_at IS NULL)
    OR (status <> 'pending' AND responded_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS relationship_circle_pending_user_invite_idx
  ON public.relationship_circle_invitations (circle_id, invitee_user_id)
  WHERE status = 'pending' AND invitee_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS relationship_circle_pending_email_invite_idx
  ON public.relationship_circle_invitations (circle_id, invitee_email_canonical)
  WHERE status = 'pending' AND invitee_email_canonical IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.relationship_circle_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id          uuid        NOT NULL REFERENCES public.relationship_circles(id) ON DELETE RESTRICT,
  event_type         text        NOT NULL,
  actor_user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_user_id    uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  invitation_id      uuid        NULL REFERENCES public.relationship_circle_invitations(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationship_circle_event_type_check CHECK (event_type IN (
    'circle_created', 'circle_updated', 'circle_archived', 'member_invited',
    'invitation_accepted', 'invitation_declined', 'invitation_cancelled',
    'member_removed', 'member_left', 'ownership_transferred'
  ))
);

CREATE INDEX IF NOT EXISTS relationship_circle_events_circle_idx
  ON public.relationship_circle_events (circle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.relationship_circle_expense_contexts (
  group_id             uuid        PRIMARY KEY REFERENCES public.expense_groups(id) ON DELETE RESTRICT,
  circle_id            uuid        NOT NULL REFERENCES public.relationship_circles(id) ON DELETE RESTRICT,
  circle_name_snapshot text        NOT NULL,
  linked_by            uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationship_circle_expense_name_check
    CHECK (char_length(btrim(circle_name_snapshot)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS relationship_circle_expense_circle_idx
  ON public.relationship_circle_expense_contexts (circle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.relationship_mutation_requests (
  actor_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id    uuid        NOT NULL,
  operation     text        NOT NULL,
  fingerprint   text        NOT NULL,
  result        jsonb       NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz NULL,
  PRIMARY KEY (actor_user_id, request_id),
  CONSTRAINT relationship_mutation_operation_check CHECK (char_length(operation) BETWEEN 1 AND 80),
  CONSTRAINT relationship_mutation_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{32}$')
);

CREATE OR REPLACE FUNCTION public.relationship_begin_request(
  p_actor_id uuid, p_request_id uuid, p_operation text, p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_existing public.relationship_mutation_requests%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 10801));
  IF p_actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor_id)
     OR p_request_id IS NULL OR char_length(p_operation) NOT BETWEEN 1 AND 80
     OR p_fingerprint !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'relationship_invalid_input';
  END IF;
  INSERT INTO public.relationship_mutation_requests(actor_user_id, request_id, operation, fingerprint)
  VALUES (p_actor_id, p_request_id, p_operation, p_fingerprint)
  ON CONFLICT (actor_user_id, request_id) DO NOTHING;
  IF FOUND THEN RETURN NULL; END IF;
  SELECT request.* INTO v_existing FROM public.relationship_mutation_requests AS request
  WHERE request.actor_user_id = p_actor_id AND request.request_id = p_request_id FOR UPDATE;
  IF v_existing.operation <> p_operation OR v_existing.fingerprint <> p_fingerprint THEN
    RAISE EXCEPTION 'relationship_idempotency_conflict';
  END IF;
  IF v_existing.result IS NULL THEN RAISE EXCEPTION 'relationship_idempotency_incomplete'; END IF;
  RETURN v_existing.result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_finish_request(
  p_actor_id uuid, p_request_id uuid, p_result jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.relationship_mutation_requests
  SET result = p_result, completed_at = now()
  WHERE actor_user_id = p_actor_id AND request_id = p_request_id AND result IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'relationship_idempotency_incomplete'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_save_label(
  p_actor_id uuid, p_label_id uuid, p_expected_version bigint,
  p_name text, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_name text := btrim(p_name); v_normalized text := lower(btrim(p_name));
  v_existing public.relationship_label_definitions%ROWTYPE; v_version bigint; v_replay jsonb; v_result jsonb;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'relationship_invalid_input'; END IF;
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'save_label',
    md5(concat_ws('|', p_label_id::text, coalesce(p_expected_version::text, ''), v_normalized)));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT label.* INTO v_existing FROM public.relationship_label_definitions AS label
  WHERE label.id = p_label_id AND label.owner_id = p_actor_id FOR UPDATE;
  IF v_existing.id IS NULL THEN
    IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'relationship_conflict'; END IF;
    INSERT INTO public.relationship_label_definitions(id, owner_id, name, normalized_name)
    VALUES (p_label_id, p_actor_id, v_name, v_normalized);
    v_version := 1;
  ELSE
    IF v_existing.version <> p_expected_version THEN RAISE EXCEPTION 'relationship_conflict'; END IF;
    UPDATE public.relationship_label_definitions AS label
    SET name = v_name, normalized_name = v_normalized, version = label.version + 1, updated_at = now()
    WHERE label.id = p_label_id AND label.owner_id = p_actor_id AND label.version = p_expected_version
    RETURNING label.version INTO v_version;
  END IF;
  v_result := jsonb_build_object('label_id', p_label_id, 'version', v_version);
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_set_label_assignment(
  p_actor_id uuid, p_relationship_id uuid, p_label_id uuid,
  p_assigned boolean, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_replay jsonb; v_result jsonb := jsonb_build_object('assigned', p_assigned);
BEGIN
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'set_label_assignment',
    md5(concat_ws('|', p_relationship_id::text, p_label_id::text, p_assigned::text)));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.relationships WHERE id = p_relationship_id AND owner_id = p_actor_id)
     OR NOT EXISTS (SELECT 1 FROM public.relationship_label_definitions WHERE id = p_label_id AND owner_id = p_actor_id) THEN
    RAISE EXCEPTION 'relationship_not_found';
  END IF;
  IF p_assigned THEN
    INSERT INTO public.relationship_label_assignments(owner_id, label_id, relationship_id)
    VALUES (p_actor_id, p_label_id, p_relationship_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.relationship_label_assignments
    WHERE owner_id = p_actor_id AND label_id = p_label_id AND relationship_id = p_relationship_id;
  END IF;
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_delete_label(
  p_actor_id uuid, p_label_id uuid, p_expected_version bigint, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_replay jsonb; v_result jsonb := jsonb_build_object('deleted', true); v_count bigint;
BEGIN
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'delete_label',
    md5(concat_ws('|', p_label_id::text, p_expected_version::text)));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  DELETE FROM public.relationship_label_definitions WHERE id = p_label_id AND owner_id = p_actor_id AND version = p_expected_version;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'relationship_conflict'; END IF;
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_create_circle(
  p_actor_id uuid, p_circle_id uuid, p_name text, p_description text, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_name text := btrim(p_name); v_description text := NULLIF(btrim(p_description), '');
  v_replay jsonb; v_result jsonb;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 120 OR char_length(coalesce(v_description, '')) > 1000 THEN
    RAISE EXCEPTION 'relationship_invalid_input';
  END IF;
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'create_circle',
    md5(concat_ws('|', p_circle_id::text, lower(v_name), coalesce(v_description, ''))));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  INSERT INTO public.relationship_circles(id, owner_id, name, description)
  VALUES (p_circle_id, p_actor_id, v_name, v_description);
  INSERT INTO public.relationship_circle_members(circle_id, user_id, role, status)
  VALUES (p_circle_id, p_actor_id, 'owner', 'active');
  INSERT INTO public.relationship_circle_events(circle_id, event_type, actor_user_id, subject_user_id)
  VALUES (p_circle_id, 'circle_created', p_actor_id, p_actor_id);
  v_result := jsonb_build_object('circle_id', p_circle_id);
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_invite_to_circle(
  p_actor_id uuid, p_circle_id uuid, p_relationship_id uuid,
  p_invitation_id uuid, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_relationship public.relationships%ROWTYPE; v_replay jsonb; v_result jsonb;
BEGIN
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'invite_to_circle',
    md5(concat_ws('|', p_circle_id::text, p_relationship_id::text, p_invitation_id::text)));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.relationship_circle_members
    WHERE circle_id = p_circle_id AND user_id = p_actor_id AND role = 'owner' AND status = 'active') THEN
    RAISE EXCEPTION 'relationship_not_allowed';
  END IF;
  SELECT relationship.* INTO v_relationship FROM public.relationships AS relationship
  WHERE relationship.id = p_relationship_id AND relationship.owner_id = p_actor_id;
  IF v_relationship.id IS NULL OR (v_relationship.counterpart_user_id IS NULL AND v_relationship.email_canonical IS NULL)
     OR v_relationship.counterpart_user_id = p_actor_id THEN RAISE EXCEPTION 'relationship_not_found'; END IF;
  IF v_relationship.counterpart_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.relationship_circle_members WHERE circle_id = p_circle_id
      AND user_id = v_relationship.counterpart_user_id AND status = 'active'
  ) THEN RAISE EXCEPTION 'relationship_conflict'; END IF;
  INSERT INTO public.relationship_circle_invitations(
    id, circle_id, invited_by, invitee_user_id, invitee_email_canonical
  ) VALUES (
    p_invitation_id, p_circle_id, p_actor_id,
    v_relationship.counterpart_user_id, v_relationship.email_canonical
  );
  INSERT INTO public.relationship_circle_events(circle_id, event_type, actor_user_id, subject_user_id, invitation_id)
  VALUES (p_circle_id, 'member_invited', p_actor_id, v_relationship.counterpart_user_id, p_invitation_id);
  v_result := jsonb_build_object('invitation_id', p_invitation_id);
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_respond_circle_invitation(
  p_actor_id uuid, p_actor_email text, p_invitation_id uuid,
  p_action text, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_invitation public.relationship_circle_invitations%ROWTYPE; v_replay jsonb; v_result jsonb; v_event text;
BEGIN
  IF p_action NOT IN ('accept', 'decline') THEN RAISE EXCEPTION 'relationship_invalid_input'; END IF;
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'respond_circle_invitation',
    md5(concat_ws('|', p_invitation_id::text, p_action)));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT invitation.* INTO v_invitation FROM public.relationship_circle_invitations AS invitation
  WHERE invitation.id = p_invitation_id AND invitation.status = 'pending' FOR UPDATE;
  IF v_invitation.id IS NULL OR v_invitation.expires_at <= now() THEN RAISE EXCEPTION 'relationship_not_found'; END IF;
  IF v_invitation.invitee_user_id IS DISTINCT FROM p_actor_id
     AND public.normalize_email_canonical(v_invitation.invitee_email_canonical)
         IS DISTINCT FROM public.normalize_email_canonical(p_actor_email) THEN
    RAISE EXCEPTION 'relationship_not_allowed';
  END IF;
  IF p_action = 'accept' THEN
    INSERT INTO public.relationship_circle_members(circle_id, user_id, role, status)
    VALUES (v_invitation.circle_id, p_actor_id, 'member', 'active')
    ON CONFLICT DO NOTHING;
    UPDATE public.relationship_circle_invitations SET status = 'accepted', responded_at = now(), invitee_user_id = p_actor_id
    WHERE id = p_invitation_id;
    v_event := 'invitation_accepted';
  ELSE
    UPDATE public.relationship_circle_invitations SET status = 'declined', responded_at = now()
    WHERE id = p_invitation_id;
    v_event := 'invitation_declined';
  END IF;
  INSERT INTO public.relationship_circle_events(circle_id, event_type, actor_user_id, subject_user_id, invitation_id)
  VALUES (v_invitation.circle_id, v_event, p_actor_id, p_actor_id, p_invitation_id);
  v_result := jsonb_build_object('circle_id', v_invitation.circle_id, 'status', CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'declined' END);
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_remove_circle_member(
  p_actor_id uuid, p_circle_id uuid, p_member_id uuid, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_replay jsonb; v_result jsonb; v_subject uuid; v_count bigint;
BEGIN
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'remove_circle_member',
    md5(concat_ws('|', p_circle_id::text, p_member_id::text)));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.relationship_circle_members
    WHERE circle_id = p_circle_id AND user_id = p_actor_id AND role = 'owner' AND status = 'active') THEN
    RAISE EXCEPTION 'relationship_not_allowed';
  END IF;
  SELECT user_id INTO v_subject FROM public.relationship_circle_members
  WHERE id = p_member_id AND circle_id = p_circle_id AND role = 'member' AND status = 'active' FOR UPDATE;
  IF v_subject IS NULL THEN RAISE EXCEPTION 'relationship_not_found'; END IF;
  UPDATE public.relationship_circle_members SET status = 'removed', ended_at = now(), updated_at = now()
  WHERE id = p_member_id AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'relationship_conflict'; END IF;
  INSERT INTO public.relationship_circle_events(circle_id, event_type, actor_user_id, subject_user_id)
  VALUES (p_circle_id, 'member_removed', p_actor_id, v_subject);
  v_result := jsonb_build_object('circle_id', p_circle_id, 'removed', true);
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_leave_circle(
  p_actor_id uuid, p_circle_id uuid, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_replay jsonb; v_result jsonb; v_count bigint;
BEGIN
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'leave_circle', md5(p_circle_id::text));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  UPDATE public.relationship_circle_members SET status = 'left', ended_at = now(), updated_at = now()
  WHERE circle_id = p_circle_id AND user_id = p_actor_id AND role = 'member' AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'relationship_not_allowed'; END IF;
  INSERT INTO public.relationship_circle_events(circle_id, event_type, actor_user_id, subject_user_id)
  VALUES (p_circle_id, 'member_left', p_actor_id, p_actor_id);
  v_result := jsonb_build_object('circle_id', p_circle_id, 'left', true);
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_transfer_circle_ownership(
  p_actor_id uuid, p_circle_id uuid, p_new_owner_member_id uuid,
  p_expected_version bigint, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_replay jsonb; v_result jsonb; v_new_owner uuid; v_count bigint;
BEGIN
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'transfer_circle_ownership',
    md5(concat_ws('|', p_circle_id::text, p_new_owner_member_id::text, p_expected_version::text)));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.relationship_circle_members
    WHERE circle_id = p_circle_id AND user_id = p_actor_id AND role = 'owner' AND status = 'active') THEN
    RAISE EXCEPTION 'relationship_not_allowed';
  END IF;
  SELECT user_id INTO v_new_owner FROM public.relationship_circle_members
  WHERE id = p_new_owner_member_id AND circle_id = p_circle_id AND role = 'member' AND status = 'active' FOR UPDATE;
  IF v_new_owner IS NULL THEN RAISE EXCEPTION 'relationship_not_found'; END IF;
  UPDATE public.relationship_circles SET owner_id = v_new_owner, version = version + 1, updated_at = now()
  WHERE id = p_circle_id AND owner_id = p_actor_id AND status = 'active' AND version = p_expected_version;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'relationship_conflict'; END IF;
  UPDATE public.relationship_circle_members SET role = 'member', updated_at = now()
  WHERE circle_id = p_circle_id AND user_id = p_actor_id AND role = 'owner' AND status = 'active';
  UPDATE public.relationship_circle_members SET role = 'owner', updated_at = now()
  WHERE id = p_new_owner_member_id;
  INSERT INTO public.relationship_circle_events(circle_id, event_type, actor_user_id, subject_user_id)
  VALUES (p_circle_id, 'ownership_transferred', p_actor_id, v_new_owner);
  v_result := jsonb_build_object('circle_id', p_circle_id, 'version', p_expected_version + 1);
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_archive_circle(
  p_actor_id uuid, p_circle_id uuid, p_expected_version bigint, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_replay jsonb; v_result jsonb; v_count bigint;
BEGIN
  v_replay := public.relationship_begin_request(p_actor_id, p_request_id, 'archive_circle',
    md5(concat_ws('|', p_circle_id::text, p_expected_version::text)));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  UPDATE public.relationship_circles SET status = 'archived', version = version + 1, updated_at = now()
  WHERE id = p_circle_id AND owner_id = p_actor_id AND status = 'active' AND version = p_expected_version;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'relationship_conflict'; END IF;
  UPDATE public.relationship_circle_members SET status = 'removed', ended_at = now(), updated_at = now()
  WHERE circle_id = p_circle_id AND status = 'active';
  INSERT INTO public.relationship_circle_events(circle_id, event_type, actor_user_id, subject_user_id)
  VALUES (p_circle_id, 'circle_archived', p_actor_id, p_actor_id);
  v_result := jsonb_build_object('circle_id', p_circle_id, 'archived', true);
  PERFORM public.relationship_finish_request(p_actor_id, p_request_id, v_result); RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_create_expense_with_circle_context(
  p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid,
  p_title text, p_total_minor bigint, p_currency text, p_incurred_on date,
  p_category text, p_note text, p_split_method text, p_one_off_members jsonb,
  p_payments jsonb, p_shares jsonb, p_obligations jsonb,
  p_known_relationship_members jsonb, p_circle_id uuid, p_known_circle_members jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_result jsonb; v_group_id uuid; v_circle public.relationship_circles%ROWTYPE;
  v_mapping jsonb; v_member_id uuid; v_circle_member_id uuid; v_circle_member public.relationship_circle_members%ROWTYPE;
  v_display_name text; v_existing_member public.expense_group_members%ROWTYPE;
BEGIN
  IF p_group_id IS NOT NULL OR p_circle_id IS NULL OR jsonb_typeof(p_known_circle_members) <> 'array'
     OR jsonb_array_length(p_known_circle_members) > 49 THEN RAISE EXCEPTION 'expense_members_invalid'; END IF;
  SELECT circle.* INTO v_circle FROM public.relationship_circles AS circle
  WHERE circle.id = p_circle_id AND circle.status = 'active';
  IF v_circle.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.relationship_circle_members
    WHERE circle_id = p_circle_id AND user_id = p_actor_id AND status = 'active') THEN
    RAISE EXCEPTION 'expense_not_allowed';
  END IF;
  v_result := public.expense_create_expense_with_known_members(
    p_actor_id, p_request_id, p_expense_id, p_group_id, p_title, p_total_minor,
    p_currency, p_incurred_on, p_category, p_note, p_split_method,
    p_one_off_members, p_payments, p_shares, p_obligations, p_known_relationship_members
  );
  v_group_id := (v_result->>'group_id')::uuid;
  FOR v_mapping IN SELECT value FROM jsonb_array_elements(p_known_circle_members)
  LOOP
    IF jsonb_typeof(v_mapping) <> 'object' OR NOT (v_mapping ?& ARRAY['member_id', 'circle_member_id']::text[]) THEN
      RAISE EXCEPTION 'expense_members_invalid';
    END IF;
    v_member_id := (v_mapping->>'member_id')::uuid;
    v_circle_member_id := (v_mapping->>'circle_member_id')::uuid;
    SELECT member.* INTO v_circle_member FROM public.relationship_circle_members AS member
    WHERE member.id = v_circle_member_id AND member.circle_id = p_circle_id AND member.status = 'active';
    IF v_circle_member.id IS NULL OR v_circle_member.user_id = p_actor_id THEN RAISE EXCEPTION 'expense_member_invalid'; END IF;
    SELECT coalesce(NULLIF(btrim(profile.display_name), ''), 'Teskeiðarnotandi') INTO v_display_name
    FROM public.profiles AS profile WHERE profile.id = v_circle_member.user_id;
    v_display_name := coalesce(v_display_name, 'Teskeiðarnotandi');
    SELECT member.* INTO v_existing_member FROM public.expense_group_members AS member
    WHERE member.id = v_member_id AND member.group_id = v_group_id FOR UPDATE;
    IF v_existing_member.id IS NULL OR v_existing_member.role <> 'member'
       OR EXISTS (SELECT 1 FROM public.expense_group_members AS duplicate
         WHERE duplicate.group_id = v_group_id AND duplicate.user_id = v_circle_member.user_id
           AND duplicate.id <> v_member_id) THEN RAISE EXCEPTION 'expense_member_invalid'; END IF;
    UPDATE public.expense_group_members SET user_id = v_circle_member.user_id,
      display_name = left(v_display_name, 120), status = 'invited'
    WHERE id = v_member_id AND group_id = v_group_id;
  END LOOP;
  INSERT INTO public.relationship_circle_expense_contexts(group_id, circle_id, circle_name_snapshot, linked_by)
  VALUES (v_group_id, p_circle_id, v_circle.name, p_actor_id);
  RETURN v_result;
END;
$$;

-- Backfill old fixed tags into private labels. `unclassified` is intentionally omitted.
INSERT INTO public.relationship_label_definitions(owner_id, name, normalized_name)
SELECT DISTINCT relationship.owner_id,
  CASE tag.tag WHEN 'family' THEN 'Fjölskylda' WHEN 'friends' THEN 'Vinir' ELSE 'Viðtakendur' END,
  CASE tag.tag WHEN 'family' THEN 'fjölskylda' WHEN 'friends' THEN 'vinir' ELSE 'viðtakendur' END
FROM public.relationship_tags AS tag
JOIN public.relationships AS relationship ON relationship.id = tag.relationship_id
WHERE tag.tag IN ('family', 'friends', 'recipients')
ON CONFLICT (owner_id, normalized_name) DO NOTHING;

INSERT INTO public.relationship_label_assignments(owner_id, label_id, relationship_id)
SELECT relationship.owner_id, label.id, relationship.id
FROM public.relationship_tags AS tag
JOIN public.relationships AS relationship ON relationship.id = tag.relationship_id
JOIN public.relationship_label_definitions AS label ON label.owner_id = relationship.owner_id
 AND label.normalized_name = CASE tag.tag WHEN 'family' THEN 'fjölskylda' WHEN 'friends' THEN 'vinir' ELSE 'viðtakendur' END
WHERE tag.tag IN ('family', 'friends', 'recipients')
ON CONFLICT DO NOTHING;

ALTER TABLE public.relationship_label_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_label_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circle_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circle_expense_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_label_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_label_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circle_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circle_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circle_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_circle_expense_contexts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_mutation_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.relationship_label_definitions, public.relationship_label_assignments,
  public.relationship_circles, public.relationship_circle_members,
  public.relationship_circle_invitations, public.relationship_circle_events,
  public.relationship_circle_expense_contexts, public.relationship_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.relationship_label_definitions, public.relationship_label_assignments,
  public.relationship_circles, public.relationship_circle_members,
  public.relationship_circle_invitations, public.relationship_circle_events,
  public.relationship_circle_expense_contexts TO service_role;

REVOKE ALL ON FUNCTION public.relationship_begin_request(uuid, uuid, text, text),
  public.relationship_finish_request(uuid, uuid, jsonb),
  public.relationship_save_label(uuid, uuid, bigint, text, uuid),
  public.relationship_set_label_assignment(uuid, uuid, uuid, boolean, uuid),
  public.relationship_delete_label(uuid, uuid, bigint, uuid),
  public.relationship_create_circle(uuid, uuid, text, text, uuid),
  public.relationship_invite_to_circle(uuid, uuid, uuid, uuid, uuid),
  public.relationship_respond_circle_invitation(uuid, text, uuid, text, uuid),
  public.relationship_remove_circle_member(uuid, uuid, uuid, uuid),
  public.relationship_leave_circle(uuid, uuid, uuid),
  public.relationship_transfer_circle_ownership(uuid, uuid, uuid, bigint, uuid),
  public.relationship_archive_circle(uuid, uuid, bigint, uuid),
  public.expense_create_expense_with_circle_context(uuid, uuid, uuid, uuid, text, bigint, text, date, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relationship_save_label(uuid, uuid, bigint, text, uuid),
  public.relationship_set_label_assignment(uuid, uuid, uuid, boolean, uuid),
  public.relationship_delete_label(uuid, uuid, bigint, uuid),
  public.relationship_create_circle(uuid, uuid, text, text, uuid),
  public.relationship_invite_to_circle(uuid, uuid, uuid, uuid, uuid),
  public.relationship_respond_circle_invitation(uuid, text, uuid, text, uuid),
  public.relationship_remove_circle_member(uuid, uuid, uuid, uuid),
  public.relationship_leave_circle(uuid, uuid, uuid),
  public.relationship_transfer_circle_ownership(uuid, uuid, uuid, bigint, uuid),
  public.relationship_archive_circle(uuid, uuid, bigint, uuid),
  public.expense_create_expense_with_circle_context(uuid, uuid, uuid, uuid, text, bigint, text, date, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb)
  TO service_role;

COMMIT;
