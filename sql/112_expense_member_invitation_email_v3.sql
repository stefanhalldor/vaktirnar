-- TODO #95 / SQL112: immutable UL participant invitation email v3 cutover.
-- Stebbi alone runs this migration after the v3-compatible app is deployed
-- and the read-only preflight is green. Existing v1/v2 invitation rows and
-- reserved attempts are never rewritten; only newly created invitations use
-- v3 and snapshot the group title plus its emoji for byte-stable retries.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
BEGIN
  IF to_regclass('public.expense_member_invitations') IS NULL
     OR to_regclass('public.expense_groups') IS NULL
     OR to_regclass('public.expense_group_members') IS NULL THEN
    RAISE EXCEPTION 'sql112_missing_required_relations';
  END IF;
  IF to_regprocedure(
    'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'sql112_missing_sql110_helper';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_groups'
      AND column_name = 'emoji'
  ) THEN
    RAISE EXCEPTION 'sql112_missing_group_emoji';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_member_invitations AS invitation
    WHERE invitation.email_template_version IS NOT NULL
      AND invitation.email_template_version NOT IN ('v1', 'v2', 'v3')
  ) THEN
    RAISE EXCEPTION 'sql112_unexpected_template_version';
  END IF;
END;
$preflight$;

ALTER TABLE public.expense_member_invitations
  DROP CONSTRAINT IF EXISTS expense_member_invitations_template_check;

ALTER TABLE public.expense_member_invitations
  ADD CONSTRAINT expense_member_invitations_template_check
  CHECK (email_template_version IN ('v1', 'v2', 'v3')) NOT VALID;

ALTER TABLE public.expense_member_invitations
  VALIDATE CONSTRAINT expense_member_invitations_template_check;

CREATE OR REPLACE FUNCTION public.expense_create_unified_participant_invitation(
  p_actor_id uuid,
  p_group_id uuid,
  p_member_id uuid,
  p_recipient_email text DEFAULT NULL,
  p_relationship_id uuid DEFAULT NULL,
  p_participant_source text DEFAULT 'guest_link'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_invitation public.expense_member_invitations%ROWTYPE;
  v_role text;
  v_recipient_email text;
  v_actor_email text;
  v_inviter_name text;
  v_recipient_user_id uuid;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_group_id IS NULL OR p_member_id IS NULL
     OR p_participant_source NOT IN ('guest_link', 'manual_email', 'relationship')
     OR ((p_relationship_id IS NULL) = (p_participant_source = 'relationship'))
     OR (p_relationship_id IS NOT NULL AND p_recipient_email IS NOT NULL) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  IF p_relationship_id IS NOT NULL THEN
    SELECT account.email
      INTO v_recipient_email
    FROM public.relationships AS relationship
    JOIN auth.users AS account ON account.id = relationship.counterpart_user_id
    WHERE relationship.id = p_relationship_id
      AND relationship.owner_id = p_actor_id
      AND relationship.counterpart_user_id IS NOT NULL
      AND relationship.counterpart_user_id <> p_actor_id;
  ELSE
    v_recipient_email := p_recipient_email;
  END IF;
  v_recipient_email := public.normalize_email_canonical(v_recipient_email);
  IF v_recipient_email IS NULL
     OR char_length(v_recipient_email) NOT BETWEEN 3 AND 320
     OR v_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'expense_recipient_unavailable';
  END IF;
  SELECT public.normalize_email_canonical(account.email)
    INTO v_actor_email FROM auth.users AS account WHERE account.id = p_actor_id;
  IF v_actor_email IS NULL OR v_actor_email = v_recipient_email THEN
    RAISE EXCEPTION 'expense_recipient_unavailable';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_recipient_email, 11002)
  );
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row WHERE group_row.id = p_group_id FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id AND member.id = p_member_id FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_group.id IS NULL OR v_group.status NOT IN ('active', 'settling', 'settled')
     OR coalesce(v_role, '') NOT IN ('owner', 'admin')
     OR v_member.id IS NULL OR v_member.status <> 'active'
     OR v_member.role = 'owner' OR v_member.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'expense_member_link_not_allowed';
  END IF;

  PERFORM public.expense_terminalize_member_invitations(
    ARRAY(SELECT invitation.id FROM public.expense_member_invitations AS invitation
      WHERE invitation.group_id = p_group_id AND invitation.status = 'pending'
        AND invitation.expires_at <= now()), 'expired'
  );
  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.group_id = p_group_id AND invitation.member_id = p_member_id
    AND invitation.status = 'pending' FOR UPDATE;
  IF v_invitation.id IS NOT NULL
     AND v_invitation.recipient_email_canonical = v_recipient_email
     AND v_invitation.participant_source = p_participant_source
     AND v_invitation.relationship_id IS NOT DISTINCT FROM p_relationship_id THEN
    RETURN v_invitation.id;
  END IF;
  IF v_invitation.id IS NOT NULL THEN
    PERFORM public.expense_terminalize_member_invitations(ARRAY[v_invitation.id], 'cancelled');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_member_invitations AS duplicate
    WHERE duplicate.group_id = p_group_id AND duplicate.status = 'pending'
      AND duplicate.recipient_email_canonical = v_recipient_email
  ) OR EXISTS (
    SELECT 1 FROM public.expense_group_members AS duplicate
    JOIN auth.users AS account ON account.id = duplicate.user_id
    WHERE duplicate.group_id = p_group_id AND duplicate.id <> p_member_id
      AND duplicate.status IN ('active', 'invited')
      AND public.normalize_email_canonical(account.email) = v_recipient_email
  ) THEN
    RAISE EXCEPTION 'expense_recipient_unavailable';
  END IF;

  SELECT coalesce(NULLIF(btrim(profile.display_name), ''), 'Teskeiðarnotandi')
    INTO v_inviter_name FROM public.profiles AS profile WHERE profile.id = p_actor_id;
  v_inviter_name := coalesce(v_inviter_name, 'Teskeiðarnotandi');
  INSERT INTO public.expense_member_invitations (
    group_id, member_id, recipient_email_canonical, invited_by, status,
    context_title_snapshot, guest_display_name_snapshot,
    inviter_display_name_snapshot, email_template_version,
    participant_source, relationship_id
  ) VALUES (
    p_group_id, p_member_id, v_recipient_email, p_actor_id, 'pending',
    left(concat_ws(' ', NULLIF(btrim(v_group.name), ''), NULLIF(btrim(v_group.emoji), '')), 200),
    btrim(v_member.display_name), left(v_inviter_name, 120), 'v3',
    p_participant_source, p_relationship_id
  ) RETURNING * INTO v_invitation;

  SELECT account.id INTO v_recipient_user_id FROM auth.users AS account
  WHERE public.normalize_email_canonical(account.email) = v_recipient_email
  ORDER BY account.id LIMIT 1;
  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_member_invitation_received',
    'expense_member_invitation', v_invitation.id,
    'expense_member_invitation_received', NULL, v_invitation.context_title_snapshot,
    CASE WHEN v_recipient_user_id IS NULL THEN ARRAY[]::uuid[]
      ELSE ARRAY[v_recipient_user_id] END, true
  );
  RETURN v_invitation.id;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_create_unified_participant_invitation(
  uuid, uuid, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.expense_create_unified_participant_invitation(
  uuid, uuid, uuid, text, uuid, text
) IS 'Private UL invitation helper. SQL112 creates immutable v3 email snapshots for new invitations only.';

COMMIT;
