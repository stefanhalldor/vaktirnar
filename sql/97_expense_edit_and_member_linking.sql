-- Migration 97: expense editing and consent-bound guest member linking.
--
-- IMPORTANT: Writing this migration does not apply it. Stebbi alone reviews
-- and runs the production preflight and this migration. The migration is
-- additive except for replacing existing expense RPC bodies and widening
-- bounded CHECK constraints. It never grants browser access to expense data.

BEGIN;

-- Fail closed when SQL96 or the reusable relationships foundation is absent.
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.expense_groups') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_groups');
  END IF;
  IF to_regclass('public.expense_group_members') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_group_members');
  END IF;
  IF to_regclass('public.expenses') IS NULL THEN
    v_missing := array_append(v_missing, 'expenses');
  END IF;
  IF to_regclass('public.expense_payments') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_payments');
  END IF;
  IF to_regclass('public.expense_shares') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_shares');
  END IF;
  IF to_regclass('public.expense_repayments') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_repayments');
  END IF;
  IF to_regclass('public.expense_activity') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_activity');
  END IF;
  IF to_regclass('public.relationships') IS NULL THEN
    v_missing := array_append(v_missing, 'relationships');
  END IF;
  IF to_regclass('public.relationship_sources') IS NULL THEN
    v_missing := array_append(v_missing, 'relationship_sources');
  END IF;
  IF to_regprocedure('public.normalize_email_canonical(text)') IS NULL THEN
    v_missing := array_append(v_missing, 'normalize_email_canonical(text)');
  END IF;
  IF to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_begin_request(uuid,uuid,text,text)');
  END IF;
  IF to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_finish_request(uuid,uuid,jsonb)');
  END IF;
  IF to_regprocedure('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)') IS NULL THEN
    v_missing := array_append(v_missing, 'expense_record_activity(...)');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'sql97_missing_prerequisites:%', array_to_string(v_missing, ',');
  END IF;
END;
$$;

-- SQL96 activity projection extended for identity invitations. Recipient-only
-- invitation events never inherit the group's current-member audience.
CREATE OR REPLACE FUNCTION public.expense_record_activity(
  p_group_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary_code text,
  p_expense_title text DEFAULT NULL,
  p_group_title text DEFAULT NULL,
  p_extra_user_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_project_recent boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_activity_id uuid := gen_random_uuid();
  v_created_at timestamptz := now();
  v_actor_display_name text;
  v_href text;
  v_payload jsonb;
BEGIN
  SELECT member.display_name
  INTO v_actor_display_name
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.user_id = p_actor_id
  ORDER BY CASE member.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,
           member.created_at DESC
  LIMIT 1;

  IF v_actor_display_name IS NULL THEN
    SELECT NULLIF(btrim(profile.display_name), '')
    INTO v_actor_display_name
    FROM public.profiles AS profile
    WHERE profile.id = p_actor_id;
  END IF;
  v_actor_display_name := coalesce(v_actor_display_name, 'Teskeiðarnotandi');

  INSERT INTO public.expense_activity (
    id, group_id, event_type, entity_type, entity_id, summary_code,
    actor_user_id, actor_display_name, expense_title, group_title, created_at
  ) VALUES (
    v_activity_id, p_group_id, p_event_type, p_entity_type, p_entity_id,
    p_summary_code, p_actor_id, v_actor_display_name,
    NULLIF(btrim(p_expense_title), ''), NULLIF(btrim(p_group_title), ''),
    v_created_at
  );

  INSERT INTO public.expense_activity_audience (activity_id, user_id)
  SELECT v_activity_id, recipient.user_id
  FROM (
    SELECT member.user_id
    FROM public.expense_group_members AS member
    WHERE member.group_id = p_group_id
      AND member.status = 'active'
      AND member.user_id IS NOT NULL
      AND p_event_type NOT IN (
        'expense_group_invitation_received',
        'expense_member_invitation_received',
        'expense_member_invitation_declined',
        'expense_member_invitation_cancelled'
      )
    UNION
    SELECT unnest(coalesce(p_extra_user_ids, ARRAY[]::uuid[]))
    UNION
    SELECT p_actor_id
  ) AS recipient
  WHERE recipient.user_id IS NOT NULL
    AND public.expense_has_beta_access(recipient.user_id)
  ON CONFLICT (activity_id, user_id) DO NOTHING;

  IF NOT p_project_recent THEN
    RETURN v_activity_id;
  END IF;

  IF p_event_type NOT IN (
    'expense_created', 'expense_updated', 'expense_cancelled',
    'expense_group_member_added', 'expense_group_member_removed',
    'expense_group_invitation_received', 'expense_group_invitation_accepted',
    'expense_group_invitation_declined', 'expense_group_member_left',
    'expense_group_settling', 'expense_group_settled',
    'expense_repayment_reported', 'expense_repayment_confirmed',
    'expense_repayment_rejected', 'expense_repayment_cancelled',
    'expense_member_invitation_received', 'expense_member_invitation_accepted',
    'expense_member_invitation_declined', 'expense_member_invitation_cancelled'
  ) THEN
    RAISE EXCEPTION 'expense_recent_projection_invalid';
  END IF;

  v_href := CASE p_entity_type
    WHEN 'expense' THEN
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || p_entity_id::text
    WHEN 'expense_repayment' THEN
      '/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/' || p_entity_id::text
    WHEN 'expense_group_invitation' THEN
      '/auth-mvp/utlagt-og-endurgreitt/bod/' || p_entity_id::text
    WHEN 'expense_member_invitation' THEN
      '/auth-mvp/utlagt-og-endurgreitt/bod/adili/' || p_entity_id::text
    WHEN 'expense_group' THEN
      '/auth-mvp/utlagt-og-endurgreitt/hopar/' || p_entity_id::text
    ELSE NULL
  END;
  IF v_href IS NULL THEN
    RAISE EXCEPTION 'expense_recent_projection_invalid';
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'expenseTitle', NULLIF(btrim(p_expense_title), ''),
    'groupTitle', NULLIF(btrim(p_group_title), ''),
    'actorUserId', p_actor_id
  ));

  INSERT INTO public.recent_events (
    user_id, source, event_type, entity_type, entity_id, event_key,
    payload, href, occurred_at, ack_at
  )
  SELECT
    audience.user_id,
    'expenses',
    p_event_type,
    p_entity_type,
    p_entity_id,
    'expenses:activity:' || v_activity_id::text,
    v_payload,
    v_href,
    v_created_at,
    CASE WHEN audience.user_id = p_actor_id THEN v_created_at ELSE NULL END
  FROM public.expense_activity_audience AS audience
  WHERE audience.activity_id = v_activity_id
  ON CONFLICT (user_id, event_key) DO NOTHING;

  RETURN v_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_link_guest_member_email(
  p_actor_id uuid,
  p_group_id uuid,
  p_member_id uuid,
  p_recipient_email text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_invitation record;
  v_role text;
  v_actor_email text;
  v_actor_email_canonical text;
  v_recipient_email_canonical text;
  v_inviter_display_name text;
  v_recipient_user_id uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_activity_id uuid;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  v_recipient_email_canonical := public.normalize_email_canonical(p_recipient_email);
  IF p_group_id IS NULL OR p_member_id IS NULL
     OR v_recipient_email_canonical IS NULL
     OR char_length(v_recipient_email_canonical) NOT BETWEEN 3 AND 320
     OR v_recipient_email_canonical !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  SELECT account.email INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id;
  v_actor_email_canonical := public.normalize_email_canonical(v_actor_email);
  IF v_actor_email_canonical IS NULL
     OR v_actor_email_canonical = v_recipient_email_canonical THEN
    RAISE EXCEPTION 'expense_recipient_unavailable';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id,
    'memberId', p_member_id,
    'recipientEmailCanonical', v_recipient_email_canonical
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_link_guest_member_email', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_recipient_email_canonical, 9702)
  );

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id AND member.id = p_member_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);

  IF v_group.id IS NULL OR v_group.status <> 'active'
     OR coalesce(v_role, '') NOT IN ('owner', 'admin')
     OR v_member.id IS NULL OR v_member.status <> 'active'
     OR v_member.role = 'owner' OR v_member.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'expense_member_link_not_allowed';
  END IF;

  -- Check recipient eligibility only after proving manager/member access, so
  -- this RPC cannot be used as a feature-allowlist oracle.
  IF NOT EXISTS (
    SELECT 1 FROM public.feature_access AS access
    WHERE access.feature_key = 'utlagt-og-endurgreitt'
      AND public.normalize_email_canonical(access.email) = v_recipient_email_canonical
  ) THEN
    RAISE EXCEPTION 'expense_recipient_unavailable';
  END IF;

  PERFORM public.expense_terminalize_member_invitations(
    ARRAY(
      SELECT invitation.id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.group_id = p_group_id
        AND invitation.status = 'pending'
        AND invitation.expires_at <= now()
    ),
    'expired'
  );

  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.group_id = p_group_id
    AND invitation.member_id = p_member_id
    AND invitation.status = 'pending'
  FOR UPDATE;

  IF EXISTS (
       SELECT 1
       FROM public.expense_group_members AS existing_member
       JOIN auth.users AS account ON account.id = existing_member.user_id
       WHERE existing_member.group_id = p_group_id
         AND existing_member.id <> p_member_id
         AND existing_member.status IN ('active', 'invited')
         AND public.normalize_email_canonical(account.email) = v_recipient_email_canonical
     )
     OR EXISTS (
       SELECT 1 FROM public.expense_member_invitations AS existing_invitation
       WHERE existing_invitation.group_id = p_group_id
         AND existing_invitation.member_id <> p_member_id
         AND existing_invitation.status = 'pending'
         AND existing_invitation.recipient_email_canonical = v_recipient_email_canonical
     ) THEN
    RAISE EXCEPTION 'expense_recipient_unavailable';
  END IF;

  IF v_invitation.id IS NOT NULL
     AND v_invitation.recipient_email_canonical = v_recipient_email_canonical THEN
    v_result := jsonb_build_object(
      'invitation_id', v_invitation.id,
      'group_id', p_group_id,
      'member_id', p_member_id,
      'status', 'pending',
      'created', false
    );
    PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  IF v_invitation.id IS NOT NULL THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[v_invitation.id], 'cancelled'
    );
  END IF;

  SELECT coalesce(
    (SELECT NULLIF(btrim(profile.display_name), '')
     FROM public.profiles AS profile WHERE profile.id = p_actor_id),
    'Teskeiðarnotandi'
  ) INTO v_inviter_display_name;

  INSERT INTO public.expense_member_invitations (
    group_id, member_id, recipient_email_canonical, invited_by, status,
    context_title_snapshot, guest_display_name_snapshot,
    inviter_display_name_snapshot
  ) VALUES (
    p_group_id, p_member_id, v_recipient_email_canonical, p_actor_id, 'pending',
    left(btrim(v_group.name), 200), btrim(v_member.display_name),
    left(v_inviter_display_name, 120)
  )
  RETURNING * INTO v_invitation;

  SELECT account.id INTO v_recipient_user_id
  FROM auth.users AS account
  WHERE public.normalize_email_canonical(account.email) = v_recipient_email_canonical
    AND public.expense_has_beta_access(account.id)
  ORDER BY account.id
  LIMIT 1;

  v_activity_id := public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_member_invitation_received',
    'expense_member_invitation', v_invitation.id,
    'expense_member_invitation_received', NULL,
    v_invitation.context_title_snapshot,
    CASE WHEN v_recipient_user_id IS NULL
      THEN ARRAY[]::uuid[] ELSE ARRAY[v_recipient_user_id] END,
    true
  );

  v_result := jsonb_build_object(
    'invitation_id', v_invitation.id,
    'group_id', p_group_id,
    'member_id', p_member_id,
    'status', 'pending',
    'created', true,
    'activity_id', v_activity_id
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- Safe consent inbox. It deliberately omits group/member IDs, email, amounts,
-- notes, payers, shares and all other ledger data before acceptance.
CREATE OR REPLACE FUNCTION public.expense_get_my_member_invitations(p_actor_id uuid)
RETURNS TABLE (
  invitation_id uuid,
  context_title text,
  inviter_display_name text,
  status text,
  expires_at timestamptz,
  invited_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    invitation.id,
    invitation.context_title_snapshot,
    invitation.inviter_display_name_snapshot,
    invitation.status,
    invitation.expires_at,
    invitation.created_at
  FROM public.expense_member_invitations AS invitation
  JOIN public.expense_groups AS group_row
    ON group_row.id = invitation.group_id AND group_row.status = 'active'
  JOIN public.expense_group_members AS member
    ON member.group_id = invitation.group_id
   AND member.id = invitation.member_id
   AND member.status = 'active'
   AND member.user_id IS NULL
  JOIN auth.users AS account ON account.id = p_actor_id
  WHERE public.expense_has_beta_access(p_actor_id)
    AND invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND invitation.recipient_email_canonical
      = public.normalize_email_canonical(account.email)
  ORDER BY invitation.created_at DESC, invitation.id
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_reserve_member_invitation_send(
  p_actor_id uuid,
  p_invitation_id uuid
)
RETURNS TABLE (
  attempt_number integer,
  can_send boolean,
  reason text,
  recipient_email text,
  email_template_version text,
  context_title text,
  inviter_display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_recipient_email_canonical text;
  v_group public.expense_groups%ROWTYPE;
  v_member record;
  v_invitation record;
  v_role text;
  v_new_attempt integer;
BEGIN
  IF NOT public.expense_has_beta_access(p_actor_id) THEN
    RETURN QUERY SELECT 0, false, 'not_found'::text, NULL::text, NULL::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT invitation.group_id, invitation.recipient_email_canonical
  INTO v_group_id, v_recipient_email_canonical
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id;
  IF v_group_id IS NULL THEN
    RETURN QUERY SELECT 0, false, 'not_found'::text, NULL::text, NULL::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_recipient_email_canonical IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_recipient_email_canonical, 9702)
    );
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_group_id
    AND member.id = (
      SELECT invitation.member_id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.id = p_invitation_id
    )
  FOR UPDATE;
  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id
    AND invitation.group_id = v_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group_id);

  IF v_invitation.id IS NULL
     OR (v_invitation.invited_by IS DISTINCT FROM p_actor_id
       AND coalesce(v_role, '') NOT IN ('owner', 'admin')) THEN
    RETURN QUERY SELECT 0, false, 'not_found'::text, NULL::text, NULL::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_group.status <> 'active'
     OR v_member.id IS NULL
     OR v_member.status <> 'active'
     OR v_member.user_id IS NOT NULL
     OR v_member.id IS DISTINCT FROM v_invitation.member_id THEN
    IF v_invitation.status = 'pending' THEN
      PERFORM public.expense_terminalize_member_invitations(
        ARRAY[p_invitation_id], 'cancelled'
      );
    END IF;
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'not_pending'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'not_pending'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.expires_at <= now() THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[p_invitation_id], 'expired'
    );
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'expired'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.feature_access AS access
    WHERE access.feature_key = 'utlagt-og-endurgreitt'
      AND public.normalize_email_canonical(access.email)
        = v_invitation.recipient_email_canonical
  ) THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false,
      'recipient_unavailable'::text, NULL::text, NULL::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_invitation.attempt_status = 'reserved'
     AND v_invitation.attempt_at >= now() - interval '24 hours' THEN
    RETURN QUERY SELECT
      v_invitation.attempt_number, true, 'ok'::text,
      v_invitation.recipient_email_canonical,
      v_invitation.email_template_version,
      v_invitation.context_title_snapshot,
      v_invitation.inviter_display_name_snapshot;
    RETURN;
  END IF;
  IF v_invitation.attempt_status = 'reserved' THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'key_expired'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.attempt_status = 'sent'
     AND v_invitation.email_sent_at > now() - interval '24 hours' THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'already_sent'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.attempt_status = 'failed'
     AND v_invitation.attempt_at > now() - interval '5 minutes' THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'cooldown'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_invitation.attempt_number >= 3 THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'max_sends'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9701)
  );
  IF (
    SELECT count(*) FROM public.expense_member_invitations AS invitation
    WHERE invitation.invited_by = p_actor_id
      AND invitation.attempt_at > now() - interval '24 hours'
  ) >= 10 THEN
    RETURN QUERY SELECT v_invitation.attempt_number, false, 'rate_limited'::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  v_new_attempt := v_invitation.attempt_number + 1;
  UPDATE public.expense_member_invitations AS invitation
  SET attempt_number = v_new_attempt,
      attempt_status = 'reserved',
      attempt_at = now(),
      email_template_version = 'v1'
  WHERE invitation.id = p_invitation_id;

  RETURN QUERY SELECT
    v_new_attempt, true, 'ok'::text,
    v_invitation.recipient_email_canonical,
    'v1'::text,
    v_invitation.context_title_snapshot,
    v_invitation.inviter_display_name_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_update_member_invitation_delivery(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_attempt_number integer,
  p_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_invitation record;
  v_role text;
BEGIN
  IF p_attempt_number IS NULL OR p_attempt_number < 1 THEN
    RETURN 'invalid_attempt';
  END IF;
  IF p_status IS NULL
     OR p_status NOT IN ('sent', 'failed')
     OR NOT public.expense_has_beta_access(p_actor_id) THEN
    RETURN 'invalid_status';
  END IF;
  SELECT invitation.group_id INTO v_group_id
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id;
  IF v_group_id IS NULL THEN RETURN 'not_found'; END IF;

  PERFORM group_row.id FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id FOR UPDATE;
  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id AND invitation.group_id = v_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group_id);

  IF v_invitation.id IS NULL
     OR (v_invitation.invited_by IS DISTINCT FROM p_actor_id
       AND coalesce(v_role, '') NOT IN ('owner', 'admin')) THEN
    RETURN 'not_found';
  END IF;
  IF v_invitation.attempt_number <> p_attempt_number THEN RETURN 'stale_attempt'; END IF;
  IF v_invitation.attempt_status = 'sent' AND p_status = 'sent' THEN RETURN 'ok'; END IF;
  IF v_invitation.attempt_status <> 'reserved' THEN RETURN 'stale_attempt'; END IF;

  UPDATE public.expense_member_invitations AS invitation
  SET attempt_status = p_status,
      attempt_at = now(),
      email_sent_at = CASE
        WHEN p_status = 'sent' THEN now()
        ELSE invitation.email_sent_at
      END
  WHERE invitation.id = p_invitation_id;
  RETURN 'ok';
END;
$$;

-- Preserve the Loans source while allowing a durable expense member to be the
-- provenance for an owner-private relationship. No existing rows are changed.
ALTER TABLE public.relationship_sources
  DROP CONSTRAINT IF EXISTS relationship_sources_source_type_check;

ALTER TABLE public.relationship_sources
  ADD CONSTRAINT relationship_sources_source_type_check
  CHECK (source_type IN ('loans', 'expenses'));

CREATE TABLE IF NOT EXISTS public.expense_member_invitations (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                      uuid        NOT NULL,
  member_id                     uuid        NOT NULL,
  recipient_email_canonical     text        NULL,
  invited_by                    uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status                        text        NOT NULL DEFAULT 'pending',
  context_title_snapshot        text        NOT NULL,
  guest_display_name_snapshot   text        NULL,
  inviter_display_name_snapshot text        NULL,
  email_template_version        text        NOT NULL DEFAULT 'v1',
  attempt_number                integer     NOT NULL DEFAULT 0,
  attempt_status                text        NULL,
  attempt_at                    timestamptz NULL,
  email_sent_at                 timestamptz NULL,
  expires_at                    timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_member_invitations_group_member_fk
    FOREIGN KEY (group_id, member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE CASCADE,
  CONSTRAINT expense_member_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  CONSTRAINT expense_member_invitations_context_title_check
    CHECK (char_length(btrim(context_title_snapshot)) BETWEEN 1 AND 200),
  CONSTRAINT expense_member_invitations_guest_name_check
    CHECK (
      (status <> 'pending' OR guest_display_name_snapshot IS NOT NULL)
      AND (
        guest_display_name_snapshot IS NULL
        OR char_length(btrim(guest_display_name_snapshot)) BETWEEN 1 AND 120
      )
    ),
  CONSTRAINT expense_member_invitations_inviter_name_check
    CHECK (
      inviter_display_name_snapshot IS NULL
      OR char_length(btrim(inviter_display_name_snapshot)) BETWEEN 1 AND 120
    ),
  CONSTRAINT expense_member_invitations_template_check
    CHECK (email_template_version = 'v1'),
  CONSTRAINT expense_member_invitations_attempt_number_check
    CHECK (attempt_number BETWEEN 0 AND 3),
  CONSTRAINT expense_member_invitations_attempt_status_check
    CHECK (attempt_status IS NULL OR attempt_status IN ('reserved', 'sent', 'failed')),
  CONSTRAINT expense_member_invitations_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT expense_member_invitations_email_lifecycle_check
    CHECK (
      (
        status = 'pending'
        AND recipient_email_canonical IS NOT NULL
        AND recipient_email_canonical = public.normalize_email_canonical(recipient_email_canonical)
        AND char_length(recipient_email_canonical) BETWEEN 3 AND 320
        AND recipient_email_canonical ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
      OR (status <> 'pending' AND recipient_email_canonical IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_member_invitations_pending_member_unique
  ON public.expense_member_invitations (group_id, member_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS expense_member_invitations_pending_email_unique
  ON public.expense_member_invitations (group_id, recipient_email_canonical)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS expense_member_invitations_recipient_pending_idx
  ON public.expense_member_invitations (recipient_email_canonical, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS expense_member_invitations_inviter_idx
  ON public.expense_member_invitations (invited_by, created_at DESC)
  WHERE invited_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS expense_member_invitations_pending_expiry_idx
  ON public.expense_member_invitations (expires_at)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS expense_member_invitations_touch_updated_at
  ON public.expense_member_invitations;
CREATE TRIGGER expense_member_invitations_touch_updated_at
  BEFORE UPDATE ON public.expense_member_invitations
  FOR EACH ROW EXECUTE FUNCTION public.expense_touch_updated_at();

ALTER TABLE public.expense_member_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expense_member_invitations
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.expense_member_invitations TO service_role;

-- Every terminal transition scrubs the email and acknowledges the associated
-- received projection. Durable expense_activity remains as the private audit
-- source, while Nýlegt never retains an unread, unresolvable invitation.
CREATE OR REPLACE FUNCTION public.expense_terminalize_member_invitations(
  p_invitation_ids uuid[],
  p_status text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_invitation_ids IS NULL OR cardinality(p_invitation_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_invitation_ids) > 50
     OR array_position(p_invitation_ids, NULL) IS NOT NULL
     OR p_status IS NULL
     OR p_status NOT IN ('accepted', 'declined', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  UPDATE public.expense_member_invitations AS invitation
  SET status = p_status,
      recipient_email_canonical = NULL,
      guest_display_name_snapshot = CASE WHEN p_status = 'accepted'
        THEN invitation.guest_display_name_snapshot ELSE NULL END
  WHERE invitation.id = ANY(p_invitation_ids)
    AND invitation.status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.recent_events AS event
  SET ack_at = coalesce(event.ack_at, now())
  WHERE event.source = 'expenses'
    AND event.event_type = 'expense_member_invitation_received'
    AND event.entity_type = 'expense_member_invitation'
    AND event.entity_id = ANY(p_invitation_ids);

  RETURN v_count;
END;
$$;

-- Backfills the recipient-only Nýlegt projection after a guest has created an
-- account. It matches only the authenticated actor's canonical email and
-- copies only the already-sanitized activity payload.
CREATE OR REPLACE FUNCTION public.expense_sync_my_member_invitation_events(
  p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_actor_email_canonical text;
  v_inserted integer := 0;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9601)
  );
  PERFORM public.expense_assert_beta_actor(p_actor_id);

  SELECT account.email INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id;
  v_actor_email_canonical := public.normalize_email_canonical(v_actor_email);
  IF v_actor_email_canonical IS NULL THEN RETURN 0; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_email_canonical, 9702)
  );

  -- Bounded lazy cleanup gives expires_at a real retention boundary even when
  -- a sender never revisits the group. Concurrent terminal paths remain safe
  -- because the helper updates pending rows only.
  PERFORM public.expense_terminalize_member_invitations(
    ARRAY(
      SELECT invitation.id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.status = 'pending'
        AND invitation.expires_at <= now()
      ORDER BY invitation.expires_at, invitation.id
      LIMIT 50
    ),
    'expired'
  );

  INSERT INTO public.expense_activity_audience (activity_id, user_id)
  SELECT activity.id, p_actor_id
  FROM public.expense_member_invitations AS invitation
  JOIN public.expense_groups AS group_row
    ON group_row.id = invitation.group_id AND group_row.status = 'active'
  JOIN public.expense_group_members AS member
    ON member.group_id = invitation.group_id
   AND member.id = invitation.member_id
   AND member.status = 'active'
   AND member.user_id IS NULL
  JOIN public.expense_activity AS activity
    ON activity.entity_type = 'expense_member_invitation'
   AND activity.entity_id = invitation.id
   AND activity.group_id = invitation.group_id
   AND activity.event_type = 'expense_member_invitation_received'
  WHERE invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND invitation.recipient_email_canonical = v_actor_email_canonical
  ON CONFLICT (activity_id, user_id) DO NOTHING;

  INSERT INTO public.recent_events (
    user_id, source, event_type, entity_type, entity_id, event_key,
    payload, href, occurred_at, ack_at
  )
  SELECT
    p_actor_id,
    'expenses',
    activity.event_type,
    activity.entity_type,
    activity.entity_id,
    'expenses:activity:' || activity.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'groupTitle', activity.group_title,
      'actorUserId', activity.actor_user_id
    )),
    '/auth-mvp/utlagt-og-endurgreitt/bod/adili/' || invitation.id::text,
    activity.created_at,
    NULL
  FROM public.expense_member_invitations AS invitation
  JOIN public.expense_groups AS group_row
    ON group_row.id = invitation.group_id AND group_row.status = 'active'
  JOIN public.expense_group_members AS member
    ON member.group_id = invitation.group_id
   AND member.id = invitation.member_id
   AND member.status = 'active'
   AND member.user_id IS NULL
  JOIN public.expense_activity AS activity
    ON activity.entity_type = 'expense_member_invitation'
   AND activity.entity_id = invitation.id
   AND activity.group_id = invitation.group_id
   AND activity.event_type = 'expense_member_invitation_received'
  JOIN public.expense_activity_audience AS audience
    ON audience.activity_id = activity.id
   AND audience.user_id = p_actor_id
  WHERE invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND invitation.recipient_email_canonical = v_actor_email_canonical
  ON CONFLICT (user_id, event_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN v_inserted;
END;
$$;

-- Add a separate identity-invitation event family. Its payload remains bounded
-- to public display snapshots; email and all financial fields are forbidden.
ALTER TABLE public.expense_activity
  DROP CONSTRAINT IF EXISTS expense_activity_event_entity_check;
ALTER TABLE public.expense_activity
  DROP CONSTRAINT IF EXISTS expense_activity_entity_type_check;
ALTER TABLE public.expense_activity
  DROP CONSTRAINT IF EXISTS expense_activity_event_type_check;

ALTER TABLE public.expense_activity
  ADD CONSTRAINT expense_activity_event_type_check CHECK (event_type IN (
    'expense_created', 'expense_updated', 'expense_cancelled',
    'expense_group_member_added', 'expense_group_member_removed',
    'expense_group_invitation_received', 'expense_group_invitation_accepted',
    'expense_group_invitation_declined', 'expense_group_member_left',
    'expense_group_settling', 'expense_group_settled',
    'expense_repayment_reported', 'expense_repayment_confirmed',
    'expense_repayment_rejected', 'expense_repayment_cancelled',
    'expense_member_invitation_received', 'expense_member_invitation_accepted',
    'expense_member_invitation_declined', 'expense_member_invitation_cancelled',
    'expense_payment_preference_saved',
    'expense_payment_preference_deactivated'
  ));

ALTER TABLE public.expense_activity
  ADD CONSTRAINT expense_activity_entity_type_check CHECK (entity_type IN (
    'expense', 'expense_group', 'expense_group_invitation',
    'expense_member_invitation', 'expense_repayment', 'payment_preference'
  ));

ALTER TABLE public.expense_activity
  ADD CONSTRAINT expense_activity_event_entity_check CHECK (
    (event_type IN ('expense_created', 'expense_updated', 'expense_cancelled')
      AND entity_type = 'expense' AND group_id IS NOT NULL AND expense_title IS NOT NULL)
    OR (event_type = 'expense_group_invitation_received'
      AND entity_type = 'expense_group_invitation'
      AND group_id IS NOT NULL AND entity_id = group_id AND group_title IS NOT NULL)
    OR (event_type IN (
        'expense_group_member_added', 'expense_group_member_removed',
        'expense_group_invitation_accepted', 'expense_group_invitation_declined',
        'expense_group_member_left', 'expense_group_settling', 'expense_group_settled'
      )
      AND entity_type = 'expense_group'
      AND group_id IS NOT NULL AND entity_id = group_id AND group_title IS NOT NULL)
    OR (event_type IN (
        'expense_member_invitation_received', 'expense_member_invitation_accepted',
        'expense_member_invitation_declined', 'expense_member_invitation_cancelled'
      )
      AND entity_type = 'expense_member_invitation'
      AND group_id IS NOT NULL AND group_title IS NOT NULL)
    OR (event_type IN (
        'expense_repayment_reported', 'expense_repayment_confirmed',
        'expense_repayment_rejected', 'expense_repayment_cancelled'
      )
      AND entity_type = 'expense_repayment' AND group_id IS NOT NULL
      AND (expense_title IS NOT NULL OR group_title IS NOT NULL))
    OR (event_type IN (
        'expense_payment_preference_saved',
        'expense_payment_preference_deactivated'
      )
      AND entity_type = 'payment_preference' AND group_id IS NULL
      AND expense_title IS NULL AND group_title IS NULL)
  );

-- Full, atomic expense edit. New name-only parties are allowed only in a
-- one-off expense and are inserted under the same group lock as the edit.
CREATE OR REPLACE FUNCTION public.expense_update_expense(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_expected_financial_version bigint,
  p_title text,
  p_total_minor bigint,
  p_currency text,
  p_incurred_on date,
  p_category text,
  p_note text,
  p_split_method text,
  p_preserve_shares boolean,
  p_new_guest_members jsonb,
  p_payments jsonb,
  p_shares jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_role text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_payment_sum bigint;
  v_share_sum bigint;
  v_member jsonb;
  v_new_member_id uuid;
  v_current_payments jsonb;
  v_current_shares jsonb;
  v_input_payments jsonb;
  v_input_shares jsonb;
  v_canonical_new_members jsonb;
  v_changed boolean;
  v_new_version bigint;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);

  IF p_expense_id IS NULL
     OR p_expected_financial_version IS NULL OR p_expected_financial_version < 0
     OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 200
     OR p_total_minor IS NULL OR p_total_minor NOT BETWEEN 1 AND 9007199254740991
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_incurred_on IS NULL
     OR (p_category IS NOT NULL AND p_category NOT IN (
       'food', 'accommodation', 'transport', 'travel', 'home',
       'entertainment', 'gifts', 'shopping', 'other'
     ))
     OR (p_note IS NOT NULL AND char_length(p_note) > 1000)
     OR p_split_method IS NULL OR p_split_method NOT IN (
       'equal', 'percentage', 'fixed', 'mixed_equal_remainder',
       'mixed_percentage_remainder', 'weighted'
     )
     OR p_preserve_shares IS NULL
     OR p_new_guest_members IS NULL
     OR p_payments IS NULL
     OR p_shares IS NULL
     OR jsonb_typeof(p_new_guest_members) <> 'array'
     OR jsonb_typeof(p_payments) <> 'array'
     OR jsonb_typeof(p_shares) <> 'array'
     OR jsonb_array_length(p_new_guest_members) > 48
     OR jsonb_array_length(p_payments) NOT BETWEEN 1 AND 50
     OR (NOT p_preserve_shares AND jsonb_array_length(p_shares) NOT BETWEEN 1 AND 50)
     OR (p_preserve_shares AND jsonb_array_length(p_shares) <> 0) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  IF EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY['id', 'display_name']::text[]) <> '{}'::jsonb
          OR NOT (item ?& ARRAY['id', 'display_name']::text[])
          OR (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR char_length(btrim(item->>'display_name')) NOT BETWEEN 1 AND 120
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS item
       GROUP BY item->>'id' HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_payments) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY['member_id', 'amount_minor']::text[]) <> '{}'::jsonb
          OR NOT (item ?& ARRAY['member_id', 'amount_minor']::text[])
          OR (item->>'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (item->>'amount_minor') !~ '^[0-9]+$'
          OR (item->>'amount_minor')::numeric NOT BETWEEN 1 AND 9007199254740991
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_payments) AS item
       GROUP BY item->>'member_id' HAVING count(*) > 1
     )
     OR (NOT p_preserve_shares AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_shares) AS item
       WHERE jsonb_typeof(item) <> 'object'
          OR (item - ARRAY['member_id', 'amount_minor']::text[]) <> '{}'::jsonb
          OR NOT (item ?& ARRAY['member_id', 'amount_minor']::text[])
          OR (item->>'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (item->>'amount_minor') !~ '^[0-9]+$'
          OR (item->>'amount_minor')::numeric NOT BETWEEN 0 AND 9007199254740991
     ))
     OR (NOT p_preserve_shares AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_shares) AS item
       GROUP BY item->>'member_id' HAVING count(*) > 1
     )) THEN
    RAISE EXCEPTION 'expense_split_invalid';
  END IF;

  SELECT sum((item->>'amount_minor')::bigint)
  INTO v_payment_sum
  FROM jsonb_array_elements(p_payments) AS item;
  IF v_payment_sum <> p_total_minor THEN
    RAISE EXCEPTION 'expense_split_total_mismatch';
  END IF;
  IF NOT p_preserve_shares THEN
    SELECT sum((item->>'amount_minor')::bigint)
    INTO v_share_sum
    FROM jsonb_array_elements(p_shares) AS item;
    IF v_share_sum <> p_total_minor THEN
      RAISE EXCEPTION 'expense_split_total_mismatch';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object('ordinal', item.ordinal, 'displayName', btrim(item.value->>'display_name'))
    ORDER BY item.ordinal
  ), '[]'::jsonb)
  INTO v_canonical_new_members
  FROM jsonb_array_elements(p_new_guest_members) WITH ORDINALITY AS item(value, ordinal);

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'memberRef', coalesce('new:' || new_member.ordinal::text, 'existing:' || payment.value->>'member_id'),
      'amountMinor', (payment.value->>'amount_minor')::bigint
    ) ORDER BY coalesce('new:' || new_member.ordinal::text, 'existing:' || payment.value->>'member_id')
  ), '[]'::jsonb)
  INTO v_input_payments
  FROM jsonb_array_elements(p_payments) AS payment(value)
  LEFT JOIN jsonb_array_elements(p_new_guest_members) WITH ORDINALITY AS new_member(value, ordinal)
    ON new_member.value->>'id' = payment.value->>'member_id';

  IF p_preserve_shares THEN
    v_input_shares := '[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'memberRef', coalesce('new:' || new_member.ordinal::text, 'existing:' || share.value->>'member_id'),
        'amountMinor', (share.value->>'amount_minor')::bigint
      ) ORDER BY coalesce('new:' || new_member.ordinal::text, 'existing:' || share.value->>'member_id')
    ), '[]'::jsonb)
    INTO v_input_shares
    FROM jsonb_array_elements(p_shares) AS share(value)
    LEFT JOIN jsonb_array_elements(p_new_guest_members) WITH ORDINALITY AS new_member(value, ordinal)
      ON new_member.value->>'id' = share.value->>'member_id';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'expenseId', p_expense_id,
    'expectedFinancialVersion', p_expected_financial_version,
    'title', btrim(p_title),
    'totalMinor', p_total_minor,
    'currency', p_currency,
    'incurredOn', p_incurred_on,
    'category', p_category,
    'note', NULLIF(btrim(p_note), ''),
    'splitMethod', p_split_method,
    'preserveShares', p_preserve_shares,
    'newGuestMembers', v_canonical_new_members,
    'payments', v_input_payments,
    'shares', v_input_shares
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_update_expense', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT expense.group_id INTO v_group_id
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'expense_not_found';
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id
    AND expense.group_id = v_group_id
  FOR UPDATE;

  v_role := public.expense_active_member_role(p_actor_id, v_group_id);
  IF v_group.id IS NULL OR v_expense.id IS NULL
     OR v_group.status <> 'active' OR v_expense.status <> 'active'
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id
       AND coalesce(v_role, '') NOT IN ('owner', 'admin'))
     OR EXISTS (
       SELECT 1 FROM public.expense_repayments AS repayment
       WHERE repayment.group_id = v_group_id
         AND repayment.status IN ('reported', 'confirmed')
     ) THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  IF v_group.financial_version <> p_expected_financial_version THEN
    RAISE EXCEPTION 'expense_financial_version_conflict';
  END IF;
  IF v_group.kind <> 'one_off' AND jsonb_array_length(p_new_guest_members) <> 0 THEN
    RAISE EXCEPTION 'expense_members_invalid';
  END IF;
  IF (
    SELECT count(*)
    FROM public.expense_group_members AS member
    WHERE member.group_id = v_group_id AND member.status = 'active'
  ) + jsonb_array_length(p_new_guest_members) > 50 THEN
    RAISE EXCEPTION 'expense_members_invalid';
  END IF;
  IF p_preserve_shares AND (
    p_total_minor <> v_expense.total_minor
    OR p_currency <> v_expense.currency
    OR p_split_method <> v_expense.split_method
  ) THEN
    RAISE EXCEPTION 'expense_preserve_shares_invalid';
  END IF;

  IF EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS item
       JOIN public.expense_group_members AS existing
         ON existing.id = (item->>'id')::uuid
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_payments) AS item
       WHERE NOT EXISTS (
         SELECT 1 FROM public.expense_group_members AS member
         WHERE member.id = (item->>'member_id')::uuid
           AND member.group_id = v_group_id AND member.status = 'active'
       ) AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS new_member
         WHERE new_member->>'id' = item->>'member_id'
       ) AND NOT EXISTS (
         -- A balanced member may have left after the expense was recorded.
         -- Permit only that member's exact historical payment, never a new or
         -- changed payment attributed to an inactive identity.
         SELECT 1
         FROM public.expense_payments AS historical_payment
         JOIN public.expense_group_members AS historical_member
           ON historical_member.id = historical_payment.member_id
          AND historical_member.group_id = historical_payment.group_id
         WHERE historical_payment.group_id = v_group_id
           AND historical_payment.expense_id = p_expense_id
           AND historical_payment.member_id = (item->>'member_id')::uuid
           AND historical_payment.amount_minor = (item->>'amount_minor')::bigint
       )
     )
     OR (NOT p_preserve_shares AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_shares) AS item
       WHERE NOT EXISTS (
         SELECT 1 FROM public.expense_group_members AS member
         WHERE member.id = (item->>'member_id')::uuid
           AND member.group_id = v_group_id AND member.status = 'active'
       ) AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS new_member
         WHERE new_member->>'id' = item->>'member_id'
       ) AND NOT EXISTS (
         -- As above, a non-preserved edit may carry an inactive member only
         -- when its historical share is byte-for-byte unchanged.
         SELECT 1
         FROM public.expense_shares AS historical_share
         JOIN public.expense_group_members AS historical_member
           ON historical_member.id = historical_share.member_id
          AND historical_member.group_id = historical_share.group_id
         WHERE historical_share.group_id = v_group_id
           AND historical_share.expense_id = p_expense_id
           AND historical_share.member_id = (item->>'member_id')::uuid
           AND historical_share.amount_minor = (item->>'amount_minor')::bigint
       )
     ))
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_new_guest_members) AS new_member
       WHERE NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_payments) AS payment
         WHERE payment->>'member_id' = new_member->>'id'
       ) AND (
         p_preserve_shares OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_shares) AS share
           WHERE share->>'member_id' = new_member->>'id'
         )
       )
     ) THEN
    RAISE EXCEPTION 'expense_member_invalid';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object('member_id', payment.member_id, 'amount_minor', payment.amount_minor)
    ORDER BY payment.member_id
  ), '[]'::jsonb)
  INTO v_current_payments
  FROM public.expense_payments AS payment
  WHERE payment.expense_id = p_expense_id;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('member_id', item->>'member_id', 'amount_minor', (item->>'amount_minor')::bigint)
    ORDER BY item->>'member_id'
  ), '[]'::jsonb)
  INTO v_input_payments
  FROM jsonb_array_elements(p_payments) AS item;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object('member_id', share.member_id, 'amount_minor', share.amount_minor)
    ORDER BY share.member_id
  ), '[]'::jsonb)
  INTO v_current_shares
  FROM public.expense_shares AS share
  WHERE share.expense_id = p_expense_id;
  IF NOT p_preserve_shares THEN
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('member_id', item->>'member_id', 'amount_minor', (item->>'amount_minor')::bigint)
      ORDER BY item->>'member_id'
    ), '[]'::jsonb)
    INTO v_input_shares
    FROM jsonb_array_elements(p_shares) AS item;
  ELSE
    v_input_shares := v_current_shares;
  END IF;

  v_changed := jsonb_array_length(p_new_guest_members) > 0
    OR v_expense.title IS DISTINCT FROM btrim(p_title)
    OR v_expense.total_minor IS DISTINCT FROM p_total_minor
    OR v_expense.currency IS DISTINCT FROM p_currency
    OR v_expense.incurred_on IS DISTINCT FROM p_incurred_on
    OR v_expense.category IS DISTINCT FROM p_category
    OR v_expense.note IS DISTINCT FROM NULLIF(btrim(p_note), '')
    OR v_expense.split_method IS DISTINCT FROM p_split_method
    OR v_current_payments IS DISTINCT FROM v_input_payments
    OR v_current_shares IS DISTINCT FROM v_input_shares;

  IF NOT v_changed THEN
    v_result := jsonb_build_object(
      'changed', false, 'group_id', v_group_id, 'expense_id', p_expense_id,
      'financial_version', v_group.financial_version
    );
    PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  FOR v_member IN SELECT value FROM jsonb_array_elements(p_new_guest_members)
  LOOP
    v_new_member_id := (v_member->>'id')::uuid;
    INSERT INTO public.expense_group_members (
      id, group_id, user_id, display_name, role, status
    ) VALUES (
      v_new_member_id, v_group_id, NULL, btrim(v_member->>'display_name'), 'member', 'active'
    );
  END LOOP;

  UPDATE public.expenses AS expense
  SET title = btrim(p_title),
      total_minor = p_total_minor,
      currency = p_currency,
      incurred_on = p_incurred_on,
      category = p_category,
      note = NULLIF(btrim(p_note), ''),
      split_method = p_split_method
  WHERE expense.id = p_expense_id;

  DELETE FROM public.expense_payments AS payment
  WHERE payment.expense_id = p_expense_id;
  INSERT INTO public.expense_payments (group_id, expense_id, member_id, amount_minor)
  SELECT v_group_id, p_expense_id, (item->>'member_id')::uuid, (item->>'amount_minor')::bigint
  FROM jsonb_array_elements(p_payments) AS item;

  IF NOT p_preserve_shares THEN
    DELETE FROM public.expense_shares AS share
    WHERE share.expense_id = p_expense_id;
    INSERT INTO public.expense_shares (group_id, expense_id, member_id, amount_minor)
    SELECT v_group_id, p_expense_id, (item->>'member_id')::uuid, (item->>'amount_minor')::bigint
    FROM jsonb_array_elements(p_shares) AS item;
  END IF;

  IF v_group.kind = 'one_off' THEN
    -- expense_groups.name is a compact one-off label (max 160 in SQL96),
    -- while the authoritative expense title may be up to 200 characters.
    -- Keep the full title on expenses and a bounded snapshot on the group.
    UPDATE public.expense_groups AS group_row
    SET name = left(btrim(p_title), 160), default_currency = p_currency
    WHERE group_row.id = v_group_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expense_group_balances(v_group_id, false) AS balance
    WHERE abs(balance.amount_minor) > 9007199254740991
  ) THEN
    RAISE EXCEPTION 'expense_amount_overflow';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_group_balances(v_group_id, false) AS balance
    JOIN public.expense_group_members AS member
      ON member.group_id = v_group_id AND member.id = balance.member_id
    WHERE member.status <> 'active' AND balance.amount_minor <> 0
  ) THEN
    RAISE EXCEPTION 'expense_inactive_member_balance';
  END IF;

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group_id
  RETURNING financial_version INTO v_new_version;

  PERFORM public.expense_record_activity(
    v_group_id, p_actor_id, 'expense_updated', 'expense', p_expense_id,
    'expense_updated', btrim(p_title),
    (SELECT group_row.name FROM public.expense_groups AS group_row WHERE group_row.id = v_group_id),
    ARRAY[]::uuid[], true
  );

  v_result := jsonb_build_object(
    'changed', true, 'group_id', v_group_id, 'expense_id', p_expense_id,
    'financial_version', v_new_version
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- Leaving the active state makes every still-unlinked identity invitation
-- unusable. Terminalize those invitations in the same group transaction so
-- email snapshots and unread consent notifications cannot linger.
CREATE OR REPLACE FUNCTION public.expense_set_group_status(
  p_actor_id uuid,
  p_group_id uuid,
  p_status text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_role text;
  v_event text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_status IS NULL OR p_status NOT IN ('settling', 'settled') THEN
    RAISE EXCEPTION 'expense_status_transition_invalid';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id, 'status', p_status
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_set_group_status', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_group.id IS NULL OR coalesce(v_role, '') NOT IN ('owner', 'admin')
     OR (p_status = 'settling' AND v_group.status <> 'active')
     OR (p_status = 'settled' AND v_group.status <> 'settling') THEN
    RAISE EXCEPTION 'expense_status_transition_invalid';
  END IF;
  IF p_status = 'settled' AND (
    EXISTS (
      SELECT 1 FROM public.expense_group_balances(p_group_id, false) AS balance
      WHERE balance.amount_minor <> 0
    )
    OR EXISTS (
      SELECT 1 FROM public.expense_repayments AS repayment
      WHERE repayment.group_id = p_group_id AND repayment.status = 'reported'
    )
  ) THEN
    RAISE EXCEPTION 'expense_group_not_settled';
  END IF;

  IF p_status = 'settling' THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY(
        SELECT invitation.id
        FROM public.expense_member_invitations AS invitation
        WHERE invitation.group_id = p_group_id
          AND invitation.status = 'pending'
      ),
      'cancelled'
    );
  END IF;

  UPDATE public.expense_groups AS group_row
  SET status = p_status,
      financial_version = group_row.financial_version + 1
  WHERE group_row.id = p_group_id;
  v_event := CASE p_status
    WHEN 'settling' THEN 'expense_group_settling'
    ELSE 'expense_group_settled'
  END;
  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, v_event, 'expense_group', p_group_id,
    v_event, NULL, v_group.name, ARRAY[]::uuid[], true
  );

  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_respond_member_invitation(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_action text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_member_id uuid;
  v_group public.expense_groups%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_invitation public.expense_member_invitations%ROWTYPE;
  v_actor_email text;
  v_actor_email_canonical text;
  v_public_display_name text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_new_version bigint;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_invitation_id IS NULL
     OR p_action IS NULL
     OR p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'invitationId', p_invitation_id, 'action', p_action
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_respond_member_invitation', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT account.email INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id;
  v_actor_email_canonical := public.normalize_email_canonical(v_actor_email);
  IF v_actor_email_canonical IS NULL THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_email_canonical, 9702)
  );

  SELECT invitation.group_id, invitation.member_id
  INTO v_group_id, v_member_id
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id;
  IF v_group_id IS NULL OR v_member_id IS NULL THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_group_id AND member.id = v_member_id
  FOR UPDATE;
  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id
    AND invitation.group_id = v_group_id
    AND invitation.member_id = v_member_id
  FOR UPDATE;

  IF v_group.id IS NULL OR v_invitation.id IS NULL
     OR v_invitation.status <> 'pending'
     OR v_actor_email_canonical IS NULL
     OR v_invitation.recipient_email_canonical IS DISTINCT FROM v_actor_email_canonical THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;

  IF v_invitation.expires_at <= now() THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[p_invitation_id], 'expired'
    );
    v_result := jsonb_build_object(
      'invitation_id', p_invitation_id,
      'status', 'expired'
    );
    PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  IF p_action = 'decline' THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[p_invitation_id], 'declined'
    );

    PERFORM public.expense_record_activity(
      v_group_id, p_actor_id, 'expense_member_invitation_declined',
      'expense_member_invitation', p_invitation_id,
      'expense_member_invitation_declined', NULL,
      v_invitation.context_title_snapshot,
      CASE WHEN v_invitation.invited_by IS NULL
        THEN ARRAY[]::uuid[] ELSE ARRAY[v_invitation.invited_by] END,
      true
    );

    v_result := jsonb_build_object(
      'invitation_id', p_invitation_id,
      'status', 'declined'
    );
    PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  IF v_group.status <> 'active'
     OR v_member.id IS NULL OR v_member.status <> 'active'
     OR v_member.user_id IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.expense_group_members AS existing_member
       WHERE existing_member.group_id = v_group_id
         AND existing_member.id <> v_member_id
         AND existing_member.user_id = p_actor_id
         AND existing_member.status IN ('active', 'invited')
     ) THEN
    RAISE EXCEPTION 'expense_invitation_conflict';
  END IF;

  SELECT NULLIF(btrim(profile.display_name), '')
  INTO v_public_display_name
  FROM public.profiles AS profile
  WHERE profile.id = p_actor_id;
  v_public_display_name := coalesce(v_public_display_name, 'Teskeiðarnotandi');

  UPDATE public.expense_group_members AS member
  SET user_id = p_actor_id,
      display_name = left(v_public_display_name, 120),
      status = 'active'
  WHERE member.id = v_member_id AND member.group_id = v_group_id;

  PERFORM public.expense_terminalize_member_invitations(
    ARRAY[p_invitation_id], 'accepted'
  );

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group_id
  RETURNING financial_version INTO v_new_version;

  PERFORM public.expense_record_activity(
    v_group_id, p_actor_id, 'expense_member_invitation_accepted',
    'expense_member_invitation', p_invitation_id,
    'expense_member_invitation_accepted', NULL,
    v_invitation.context_title_snapshot,
    ARRAY[p_actor_id], true
  );

  -- Persist only durable identifiers in the idempotency result. Private guest
  -- labels and canonical email addresses must not survive in request history.
  v_result := jsonb_build_object(
    'invitation_id', p_invitation_id,
    'status', 'accepted',
    'group_id', v_group_id,
    'member_id', v_member_id,
    'invited_by', v_invitation.invited_by,
    'counterpart_user_id', p_actor_id,
    'financial_version', v_new_version
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_cancel_member_invitation(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_group public.expense_groups%ROWTYPE;
  v_invitation public.expense_member_invitations%ROWTYPE;
  v_role text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_invitation_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;

  v_fingerprint := md5(jsonb_build_object('invitationId', p_invitation_id)::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_cancel_member_invitation', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT invitation.group_id INTO v_group_id
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'expense_invitation_not_found'; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id AND invitation.group_id = v_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group_id);

  IF v_invitation.id IS NULL OR v_invitation.status <> 'pending'
     OR (v_invitation.invited_by IS DISTINCT FROM p_actor_id
       AND coalesce(v_role, '') NOT IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;

  PERFORM public.expense_terminalize_member_invitations(
    ARRAY[p_invitation_id],
    CASE WHEN v_invitation.expires_at <= now() THEN 'expired' ELSE 'cancelled' END
  );

  PERFORM public.expense_record_activity(
    v_group_id, p_actor_id, 'expense_member_invitation_cancelled',
    'expense_member_invitation', p_invitation_id,
    'expense_member_invitation_cancelled', NULL,
    v_invitation.context_title_snapshot,
    ARRAY[p_actor_id], false
  );

  v_result := jsonb_build_object(
    'invitation_id', p_invitation_id,
    'status', CASE WHEN v_invitation.expires_at <= now() THEN 'expired' ELSE 'cancelled' END
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- Click-time authorization for both ordinary expense activity and the
-- email-matched consent route. A pending guest recipient gets no group access;
-- after acceptance the same activity resolves to the group instead.
CREATE OR REPLACE FUNCTION public.expense_resolve_recent_targets(
  p_actor_id uuid,
  p_activity_ids uuid[]
)
RETURNS TABLE (activity_id uuid, href text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.expense_has_beta_access(p_actor_id)
     OR p_activity_ids IS NULL
     OR cardinality(p_activity_ids) > 100
     OR array_position(p_activity_ids, NULL) IS NOT NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH resolved AS (
    SELECT
      activity.id,
      CASE
        WHEN invitation.status = 'pending'
          AND invitation.expires_at > now()
          AND invitation.recipient_email_canonical
            = public.normalize_email_canonical(account.email)
        THEN '/auth-mvp/utlagt-og-endurgreitt/bod/adili/' || invitation.id::text
        WHEN invitation.status = 'accepted'
          AND linked_member.user_id = p_actor_id
          AND linked_member.status = 'active'
        THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || invitation.group_id::text
        WHEN current_member.id IS NOT NULL
        THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || invitation.group_id::text
        ELSE NULL
      END AS resolved_href,
      activity.sequence_no
    FROM public.expense_activity AS activity
    JOIN public.expense_activity_audience AS audience
      ON audience.activity_id = activity.id AND audience.user_id = p_actor_id
    JOIN public.expense_member_invitations AS invitation
      ON invitation.id = activity.entity_id
     AND invitation.group_id = activity.group_id
    JOIN auth.users AS account ON account.id = p_actor_id
    JOIN public.expense_group_members AS linked_member
      ON linked_member.group_id = invitation.group_id
     AND linked_member.id = invitation.member_id
    LEFT JOIN public.expense_group_members AS current_member
      ON current_member.group_id = invitation.group_id
     AND current_member.user_id = p_actor_id
     AND current_member.status = 'active'
    WHERE activity.id = ANY(p_activity_ids)
      AND activity.entity_type = 'expense_member_invitation'

    UNION ALL

    SELECT
      activity.id,
      CASE activity.entity_type
        WHEN 'expense' THEN
          '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || activity.entity_id::text
        WHEN 'expense_repayment' THEN
          '/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/' || activity.entity_id::text
        WHEN 'expense_group_invitation' THEN CASE membership.status
          WHEN 'invited' THEN
            '/auth-mvp/utlagt-og-endurgreitt/bod/' || activity.group_id::text
          WHEN 'active' THEN
            '/auth-mvp/utlagt-og-endurgreitt/hopar/' || activity.group_id::text
          ELSE NULL
        END
        WHEN 'expense_group' THEN
          '/auth-mvp/utlagt-og-endurgreitt/hopar/' || activity.group_id::text
        ELSE NULL
      END AS resolved_href,
      activity.sequence_no
    FROM public.expense_activity AS activity
    JOIN public.expense_activity_audience AS audience
      ON audience.activity_id = activity.id AND audience.user_id = p_actor_id
    JOIN public.expense_group_members AS membership
      ON membership.group_id = activity.group_id
     AND membership.user_id = p_actor_id
     AND membership.status IN ('invited', 'active')
    WHERE activity.id = ANY(p_activity_ids)
      AND activity.group_id IS NOT NULL
      AND activity.entity_type NOT IN ('payment_preference', 'expense_member_invitation')
      AND (
        (activity.entity_type = 'expense_group_invitation'
          AND membership.status IN ('invited', 'active'))
        OR (activity.entity_type <> 'expense_group_invitation'
          AND membership.status = 'active')
      )
      AND CASE activity.entity_type
        WHEN 'expense' THEN EXISTS (
          SELECT 1 FROM public.expenses AS expense
          WHERE expense.id = activity.entity_id
            AND expense.group_id = activity.group_id
        )
        WHEN 'expense_repayment' THEN EXISTS (
          SELECT 1 FROM public.expense_repayments AS repayment
          WHERE repayment.id = activity.entity_id
            AND repayment.group_id = activity.group_id
        )
        WHEN 'expense_group_invitation' THEN activity.entity_id = activity.group_id
        WHEN 'expense_group' THEN activity.entity_id = activity.group_id
        ELSE false
      END
  )
  SELECT resolved.id, resolved.resolved_href
  FROM resolved
  WHERE resolved.resolved_href IS NOT NULL
  ORDER BY resolved.sequence_no;
END;
$$;

-- Replaces SQL96 with the same authorization/balance behavior plus pending
-- identity-invitation cancellation before the durable member is removed.
CREATE OR REPLACE FUNCTION public.expense_remove_group_member(
  p_actor_id uuid,
  p_group_id uuid,
  p_member_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_target public.expense_group_members%ROWTYPE;
  v_role text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb := '{}'::jsonb;
  v_extra uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id, 'memberId', p_member_id
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_remove_group_member', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  SELECT member.* INTO v_target
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_member_id
    AND member.status IN ('active', 'invited')
  FOR UPDATE;
  IF v_group.id IS NULL OR v_group.kind <> 'group'
     OR coalesce(v_role, '') NOT IN ('owner', 'admin')
     OR v_target.id IS NULL OR v_target.role = 'owner'
     OR v_target.user_id = p_actor_id
     OR NOT public.expense_member_can_exit(p_group_id, p_member_id) THEN
    RAISE EXCEPTION 'expense_member_cannot_remove';
  END IF;

  PERFORM public.expense_terminalize_member_invitations(
    ARRAY(
      SELECT invitation.id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.group_id = p_group_id
        AND invitation.member_id = p_member_id
        AND invitation.status = 'pending'
    ),
    'cancelled'
  );

  IF v_target.user_id IS NOT NULL THEN v_extra := ARRAY[v_target.user_id]; END IF;
  UPDATE public.expense_group_members AS member
  SET status = 'removed'
  WHERE member.id = p_member_id;

  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_group_member_removed',
    'expense_group', p_group_id, 'expense_group_member_removed',
    NULL, v_group.name, v_extra, true
  );

  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- Replaces SQL96 and scrubs pending guest-link emails when a one-off expense
-- is cancelled. Named-group invitations survive because the group survives.
CREATE OR REPLACE FUNCTION public.expense_cancel_expense(
  p_actor_id uuid,
  p_expense_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_role text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  v_fingerprint := md5(jsonb_build_object('expenseId', p_expense_id)::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_cancel_expense', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id;
  IF v_expense.id IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_expense.group_id
  FOR UPDATE;
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group.id);
  IF v_group.status <> 'active' OR v_expense.status <> 'active'
     OR (v_expense.created_by IS DISTINCT FROM p_actor_id
       AND coalesce(v_role, '') NOT IN ('owner', 'admin'))
     OR EXISTS (
       SELECT 1 FROM public.expense_repayments AS repayment
       WHERE repayment.group_id = v_group.id
         AND repayment.status IN ('reported', 'confirmed')
     ) THEN
    RAISE EXCEPTION 'expense_cancel_not_allowed';
  END IF;

  UPDATE public.expenses AS expense
  SET status = 'cancelled'
  WHERE expense.id = p_expense_id;

  IF v_group.kind = 'one_off' THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY(
        SELECT invitation.id
        FROM public.expense_member_invitations AS invitation
        WHERE invitation.group_id = v_group.id
          AND invitation.status = 'pending'
      ),
      'cancelled'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expense_group_balances(v_group.id, false) AS balance
    WHERE abs(balance.amount_minor) > 9007199254740991
  ) THEN
    RAISE EXCEPTION 'expense_amount_overflow';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_group_balances(v_group.id, false) AS balance
    JOIN public.expense_group_members AS member
      ON member.group_id = v_group.id AND member.id = balance.member_id
    WHERE member.status <> 'active' AND balance.amount_minor <> 0
  ) THEN
    RAISE EXCEPTION 'expense_inactive_member_balance';
  END IF;
  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group.id;

  PERFORM public.expense_record_activity(
    v_group.id, p_actor_id, 'expense_cancelled', 'expense', p_expense_id,
    'expense_cancelled', v_expense.title, v_group.name,
    ARRAY[]::uuid[], true
  );

  v_result := jsonb_build_object('group_id', v_group.id);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- SQL96 account-deletion preparation plus invitation-email scrubbing. The
-- actor advisory lock and sorted group locks serialize deletion against claim,
-- invitation and financial mutations without deleting shared ledger rows.
CREATE OR REPLACE FUNCTION public.expense_prepare_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_email_canonical text;
  v_preferences integer := 0;
  v_snapshots integer := 0;
  v_members integer := 0;
  v_invitations integer := 0;
  v_terminal_invitation_ids uuid[];
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9601)
  );

  SELECT account.email INTO v_email
  FROM auth.users AS account
  WHERE account.id = p_user_id;
  v_email_canonical := public.normalize_email_canonical(v_email);

  IF v_email_canonical IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_email_canonical, 9702)
    );
  END IF;

  IF v_email IS NOT NULL THEN
    DELETE FROM public.feature_access AS access
    WHERE access.feature_key = 'utlagt-og-endurgreitt'
      AND public.normalize_email_canonical(access.email) = v_email_canonical;
  END IF;

  PERFORM group_row.id
  FROM public.expense_groups AS group_row
  WHERE group_row.id IN (
    SELECT member.group_id
    FROM public.expense_group_members AS member
    WHERE member.user_id = p_user_id
    UNION
    SELECT invitation.group_id
    FROM public.expense_member_invitations AS invitation
    WHERE invitation.invited_by = p_user_id
       OR (
         v_email_canonical IS NOT NULL
         AND invitation.status = 'pending'
         AND invitation.recipient_email_canonical = v_email_canonical
       )
  )
  ORDER BY group_row.id
  FOR UPDATE;

  LOOP
    SELECT coalesce(array_agg(candidate.id), ARRAY[]::uuid[])
    INTO v_terminal_invitation_ids
    FROM (
      SELECT invitation.id
      FROM public.expense_member_invitations AS invitation
      WHERE invitation.status = 'pending'
        AND (
          invitation.invited_by = p_user_id
          OR (
            v_email_canonical IS NOT NULL
            AND invitation.recipient_email_canonical = v_email_canonical
          )
        )
      ORDER BY invitation.id
      LIMIT 50
    ) AS candidate;
    EXIT WHEN cardinality(v_terminal_invitation_ids) = 0;
    v_invitations := v_invitations
      + public.expense_terminalize_member_invitations(
          v_terminal_invitation_ids, 'cancelled'
        );
  END LOOP;

  UPDATE public.expense_member_invitations AS invitation
  SET invited_by = NULL,
      inviter_display_name_snapshot = NULL,
      guest_display_name_snapshot = NULL
  WHERE invitation.invited_by = p_user_id;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 9602)
  );

  DELETE FROM public.expense_payment_preferences AS preference
  WHERE preference.owner_user_id = p_user_id;
  GET DIAGNOSTICS v_preferences = ROW_COUNT;

  UPDATE public.expense_repayments AS repayment
  SET payment_preference_snapshot = NULL
  WHERE repayment.payment_preference_snapshot->>'owner_user_id' = p_user_id::text;
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  DELETE FROM public.recent_events AS event
  WHERE event.source = 'expenses'
    AND (event.user_id = p_user_id OR event.payload->>'actorUserId' = p_user_id::text);
  DELETE FROM public.expense_activity_audience AS audience
  WHERE audience.user_id = p_user_id;
  DELETE FROM public.expense_mutation_requests AS request
  WHERE request.actor_user_id = p_user_id;

  UPDATE public.expense_activity AS activity
  SET actor_user_id = NULL,
      actor_display_name = 'Teskeiðarnotandi'
  WHERE activity.actor_user_id = p_user_id;
  UPDATE public.expense_repayments AS repayment
  SET reported_by = NULL
  WHERE repayment.reported_by = p_user_id;
  UPDATE public.expenses AS expense
  SET created_by = NULL
  WHERE expense.created_by = p_user_id;
  UPDATE public.expense_groups AS group_row
  SET created_by = NULL
  WHERE group_row.created_by = p_user_id;

  UPDATE public.expense_group_members AS member
  SET user_id = NULL,
      status = CASE
        WHEN member.status IN ('invited', 'declined') THEN 'removed'
        ELSE member.status
      END
  WHERE member.user_id = p_user_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;

  RETURN jsonb_build_object(
    'preferences_removed', v_preferences,
    'snapshots_removed', v_snapshots,
    'parties_unlinked', v_members,
    'invitations_scrubbed', v_invitations
  );
END;
$$;

-- Browser roles receive neither table access nor RPC execution. Server actions
-- use only these service-role entry points; internal helpers remain private.
REVOKE ALL ON FUNCTION public.expense_update_expense(
  uuid, uuid, uuid, bigint, text, bigint, text, date, text, text,
  text, boolean, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_link_guest_member_email(
  uuid, uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_get_my_member_invitations(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_sync_my_member_invitation_events(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_reserve_member_invitation_send(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_update_member_invitation_delivery(
  uuid, uuid, integer, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_respond_member_invitation(
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_cancel_member_invitation(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_set_group_status(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.expense_record_activity(
  uuid, uuid, text, text, uuid, text, text, text, uuid[], boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_terminalize_member_invitations(uuid[], text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_remove_group_member(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_cancel_expense(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_resolve_recent_targets(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_prepare_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.expense_update_expense(
  uuid, uuid, uuid, bigint, text, bigint, text, date, text, text,
  text, boolean, jsonb, jsonb, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_link_guest_member_email(
  uuid, uuid, uuid, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_my_member_invitations(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_sync_my_member_invitation_events(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_reserve_member_invitation_send(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_update_member_invitation_delivery(
  uuid, uuid, integer, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_respond_member_invitation(
  uuid, uuid, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_cancel_member_invitation(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_set_group_status(uuid, uuid, text, uuid)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.expense_remove_group_member(uuid, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_cancel_expense(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_resolve_recent_targets(uuid, uuid[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_prepare_account_deletion(uuid)
  TO service_role;

COMMENT ON TABLE public.expense_member_invitations IS
  'Consent-bound email links for durable guest expense members. Terminal states scrub recipient email.';
COMMENT ON FUNCTION public.expense_update_expense(
  uuid, uuid, uuid, bigint, text, bigint, text, date, text, text,
  text, boolean, jsonb, jsonb, jsonb
) IS 'Atomic, version-checked expense edit. May add name-only one-off members without replacing durable party IDs.';
COMMENT ON FUNCTION public.expense_respond_member_invitation(uuid, uuid, text, uuid)
  IS 'Explicit email-matched accept/decline. Accept links the same durable member ID and never grants beta access.';
COMMENT ON FUNCTION public.expense_sync_my_member_invitation_events(uuid)
  IS 'Idempotently backfills sanitized recipient-only recent events after the invited email signs in.';

COMMIT;

-- Recovery remains a separately reviewed operation. It must drop the new RPCs
-- and table before restoring exact pre-SQL97 constraints. No rollback is run.
