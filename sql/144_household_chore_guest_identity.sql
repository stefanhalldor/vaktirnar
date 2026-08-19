-- SQL 144: rename guest participants and link them to an eligible Teskeið user.
-- This migration writes schema/functions only. Run validation preflight first.

BEGIN;

DO $migration$
BEGIN
  IF pg_catalog.to_regclass('public.household_chore_participants') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_invitations') IS NULL
     OR pg_catalog.to_regclass('public.household_chore_memberships') IS NULL
     OR pg_catalog.to_regclass('public.feature_access') IS NULL
     OR pg_catalog.to_regprocedure('public.household_chore_accept_invitation(uuid,uuid,uuid,bigint)') IS NULL
     OR pg_catalog.to_regprocedure('public.household_chore_private_start_mutation(uuid,uuid,text,bytea,boolean)') IS NULL THEN
    RAISE EXCEPTION 'household_chore_144_prerequisites_missing';
  END IF;
END;
$migration$;

ALTER TABLE public.household_chore_invitations
  ADD COLUMN IF NOT EXISTS target_participant_id uuid NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.household_chore_invitations'::pg_catalog.regclass
      AND conname = 'household_chore_invitations_target_participant_fk'
  ) THEN
    ALTER TABLE public.household_chore_invitations
      ADD CONSTRAINT household_chore_invitations_target_participant_fk
      FOREIGN KEY (circle_id, target_participant_id)
      REFERENCES public.household_chore_participants(circle_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.household_chore_invitations'::pg_catalog.regclass
      AND conname = 'household_chore_invitations_target_source_check'
  ) THEN
    ALTER TABLE public.household_chore_invitations
      ADD CONSTRAINT household_chore_invitations_target_source_check
      CHECK (target_participant_id IS NULL OR relationship_id IS NULL);
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS household_chore_invitations_pending_target_idx
  ON public.household_chore_invitations (circle_id, target_participant_id)
  WHERE status = 'pending' AND target_participant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.household_chore_get_participant_identity_links(
  p_actor_id uuid,
  p_circle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_links jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_circle_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_read_result(false, 'not_found');
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'invitation_id', invitation_row.id,
        'participant_id', invitation_row.target_participant_id
      ) ORDER BY invitation_row.created_at DESC, invitation_row.id
    ),
    '[]'::jsonb
  ) INTO v_links
  FROM public.household_chore_invitations AS invitation_row
  WHERE invitation_row.circle_id = p_circle_id
    AND invitation_row.target_participant_id IS NOT NULL
    AND invitation_row.status = 'pending'
    AND invitation_row.expires_at > pg_catalog.clock_timestamp()
    AND EXISTS (
      SELECT 1
      FROM public.household_chore_memberships AS inviter_membership
      WHERE inviter_membership.circle_id = invitation_row.circle_id
        AND inviter_membership.user_id = invitation_row.invited_by_user_id
        AND inviter_membership.status = 'active'
        AND inviter_membership.membership_type = 'member'
    );

  RETURN public.household_chore_private_read_result(
    true,
    'participant_identity_links_loaded',
    pg_catalog.jsonb_build_object('links', v_links)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_rename_participant(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_participant_id uuid,
  p_expected_version bigint,
  p_label text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_label text := pg_catalog.regexp_replace(pg_catalog.btrim(p_label), '\s+', ' ', 'g');
  v_fingerprint bytea;
  v_started jsonb;
  v_participant public.household_chore_participants%ROWTYPE;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'participant_id', p_participant_id,
      'expected_version', p_expected_version,
      'label', v_label
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'rename_participant', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  IF v_label IS NULL OR pg_catalog.char_length(v_label) NOT BETWEEN 1 AND 120
     OR pg_catalog.strpos(v_label, '@') > 0 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;

  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = p_participant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_participant.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_participant.identity_marker <> 'current'
     OR v_participant.linked_user_id IS NOT NULL THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  UPDATE public.household_chore_participants AS participant_row
  SET display_name_snapshot = v_label,
      version = participant_row.version + 1
  WHERE participant_row.id = p_participant_id
  RETURNING participant_row.* INTO v_participant;

  v_result := public.household_chore_private_result(
    true, 'participant_renamed', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_participant.id,
      'version', v_participant.version::text,
      'status', v_participant.status
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_link_participant(
  p_actor_id uuid,
  p_request_id uuid,
  p_circle_id uuid,
  p_participant_id uuid,
  p_expected_version bigint,
  p_recipient_email text,
  p_requested_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text := public.normalize_email_canonical(p_recipient_email);
  v_type text := pg_catalog.lower(pg_catalog.btrim(p_requested_type));
  v_fingerprint bytea;
  v_request public.household_chore_mutation_requests%ROWTYPE;
  v_started jsonb;
  v_participant public.household_chore_participants%ROWTYPE;
  v_circle public.household_chore_circles%ROWTYPE;
  v_target_ids uuid[];
  v_target_id uuid;
  v_invitation_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_inviter_label text;
  v_actor_email text;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'circle_id', p_circle_id,
      'participant_id', p_participant_id,
      'expected_version', p_expected_version,
      'recipient_email', v_email,
      'requested_type', v_type
    )
  );
  SELECT request_row.* INTO v_request
  FROM public.household_chore_mutation_requests AS request_row
  WHERE request_row.actor_user_id = p_actor_id
    AND request_row.request_id = p_request_id;
  IF FOUND AND v_request.status = 'completed' THEN
    IF v_request.operation = 'link_participant'
       AND v_request.fingerprint = v_fingerprint THEN
      RETURN v_request.result;
    END IF;
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.household_chore_delete_tombstones AS tombstone_row
    WHERE tombstone_row.actor_user_id = p_actor_id
      AND tombstone_row.request_id = p_request_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'conflict', p_request_id
    );
  END IF;

  IF v_email IS NULL OR v_type NOT IN ('member', 'child') OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'not_available', p_request_id
    );
  END IF;

  SELECT pg_catalog.array_agg(account.id ORDER BY account.id)
  INTO v_target_ids
  FROM auth.users AS account
  WHERE account.email_confirmed_at IS NOT NULL
    AND public.normalize_email_canonical(account.email) = v_email;
  IF pg_catalog.cardinality(v_target_ids) IS DISTINCT FROM 1 THEN
    RETURN public.household_chore_private_result(
      false, 'not_available', p_request_id
    );
  END IF;
  v_target_id := v_target_ids[1];
  IF v_target_id = p_actor_id OR NOT EXISTS (
    SELECT 1 FROM public.feature_access AS access_row
    WHERE access_row.feature_key = 'heimilisverkin'
      AND public.normalize_email_canonical(access_row.email) = v_email
  ) OR EXISTS (
    SELECT 1 FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = v_target_id
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'not_available', p_request_id
    );
  END IF;

  PERFORM public.household_chore_private_lock_user(lock_user.user_id)
  FROM (
    SELECT p_actor_id AS user_id
    UNION SELECT v_target_id
    ORDER BY user_id
  ) AS lock_user;

  -- Recheck the account/entitlement pair after the shared user lock. SQL 143
  -- uses the same lock to serialize auth-email and allowlist lifecycle changes.
  IF EXISTS (
    SELECT 1 FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id IN (p_actor_id, v_target_id)
  ) THEN
    RETURN public.household_chore_private_result(
      false, 'not_available', p_request_id
    );
  END IF;
  SELECT public.normalize_email_canonical(account.email) INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id AND account.email_confirmed_at IS NOT NULL
  FOR SHARE;
  IF v_actor_email IS NULL THEN
    RETURN public.household_chore_private_result(
      false, 'feature_unavailable', p_request_id
    );
  END IF;
  PERFORM access_row.email
  FROM public.feature_access AS access_row
  WHERE access_row.feature_key = 'heimilisverkin'
    AND public.normalize_email_canonical(access_row.email) = v_actor_email
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_result(
      false, 'feature_unavailable', p_request_id
    );
  END IF;
  PERFORM account.id
  FROM auth.users AS account
  WHERE account.id = v_target_id
    AND account.email_confirmed_at IS NOT NULL
    AND public.normalize_email_canonical(account.email) = v_email
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_result(
      false, 'not_available', p_request_id
    );
  END IF;
  PERFORM access_row.email
  FROM public.feature_access AS access_row
  WHERE access_row.feature_key = 'heimilisverkin'
    AND public.normalize_email_canonical(access_row.email) = v_email
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_result(
      false, 'not_available', p_request_id
    );
  END IF;

  v_started := public.household_chore_private_begin_request(
    p_actor_id, p_request_id, 'link_participant', v_fingerprint, v_target_id
  );
  IF v_started IS NOT NULL THEN RETURN v_started; END IF;

  SELECT circle_row.* INTO v_circle
  FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = p_circle_id
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
      AND membership_row.membership_type = 'member'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT participant_row.* INTO v_participant
  FROM public.household_chore_participants AS participant_row
  WHERE participant_row.circle_id = p_circle_id
    AND participant_row.id = p_participant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_participant.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_participant.status <> 'active'
     OR v_participant.identity_marker <> 'current'
     OR v_participant.linked_user_id IS NOT NULL THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_available', p_request_id)
    );
  END IF;

  PERFORM public.household_chore_private_expire_invitations(p_circle_id, v_target_id);
  IF EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id
      AND membership_row.user_id = v_target_id
      AND membership_row.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.circle_id = p_circle_id
      AND invitation_row.status = 'pending'
      AND (invitation_row.invitee_user_id = v_target_id
        OR invitation_row.target_participant_id = p_participant_id)
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'conflict', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*) FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = p_circle_id AND membership_row.status = 'active'
  ) >= 20 OR (
    SELECT pg_catalog.count(*) FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.circle_id = p_circle_id
      AND invitation_row.status = 'pending' AND invitation_row.expires_at > v_now
  ) >= 20 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;

  v_inviter_label := public.household_chore_private_safe_user_label(p_actor_id);
  INSERT INTO public.household_chore_invitations (
    id, circle_id, invitee_user_id, invited_by_user_id, relationship_id,
    target_participant_id, requested_type, inviter_label_snapshot,
    expires_at, created_at, updated_at
  ) VALUES (
    v_invitation_id, p_circle_id, v_target_id, p_actor_id, NULL,
    p_participant_id, v_type, v_inviter_label,
    v_now + interval '30 days', v_now, v_now
  );
  INSERT INTO public.recent_events (
    user_id, source, event_type, entity_type, entity_id, event_key,
    payload, href, occurred_at
  ) VALUES (
    v_target_id, 'heimilisverkin', 'household_chore_invitation_received',
    'household_chore_invitation', v_invitation_id,
    'household:invitation:' || v_invitation_id::text,
    pg_catalog.jsonb_build_object(
      'circle_name', v_circle.name,
      'display_reference', v_circle.display_reference,
      'inviter_label', v_inviter_label,
      'requested_type', v_type
    ),
    '/auth-mvp/heimilisverkin/bod/' || v_invitation_id::text,
    v_now
  ) ON CONFLICT (user_id, event_key) DO UPDATE
    SET payload = EXCLUDED.payload, href = EXCLUDED.href,
        occurred_at = EXCLUDED.occurred_at, ack_at = NULL;

  v_result := public.household_chore_private_result(
    true, 'participant_link_invitation_created', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_invitation_id, 'version', '1', 'status', 'pending'
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_accept_invitation(
  p_actor_id uuid,
  p_request_id uuid,
  p_invitation_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint bytea;
  v_started jsonb;
  v_probe public.household_chore_invitations%ROWTYPE;
  v_invitation public.household_chore_invitations%ROWTYPE;
  v_participant public.household_chore_participants%ROWTYPE;
  v_membership_id uuid := pg_catalog.gen_random_uuid();
  v_actor_email text;
  v_result jsonb;
BEGIN
  v_fingerprint := public.household_chore_private_fingerprint(
    pg_catalog.jsonb_build_object(
      'invitation_id', p_invitation_id,
      'expected_version', p_expected_version
    )
  );
  v_started := public.household_chore_private_start_mutation(
    p_actor_id, p_request_id, 'accept_invitation', v_fingerprint
  );
  IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;

  SELECT invitation_row.* INTO v_probe
  FROM public.household_chore_invitations AS invitation_row
  WHERE invitation_row.id = p_invitation_id
    AND invitation_row.invitee_user_id = p_actor_id;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;

  PERFORM public.household_chore_private_lock_user(p_actor_id);
  SELECT public.normalize_email_canonical(account.email) INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id AND account.email_confirmed_at IS NOT NULL
  FOR SHARE;
  IF v_actor_email IS NULL OR EXISTS (
    SELECT 1 FROM public.household_chore_deletion_markers AS marker_row
    WHERE marker_row.user_id = p_actor_id
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'feature_unavailable', p_request_id)
    );
  END IF;
  PERFORM access_row.email
  FROM public.feature_access AS access_row
  WHERE access_row.feature_key = 'heimilisverkin'
    AND public.normalize_email_canonical(access_row.email) = v_actor_email
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'feature_unavailable', p_request_id)
    );
  END IF;

  PERFORM 1 FROM public.household_chore_circles AS circle_row
  WHERE circle_row.id = v_probe.circle_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  SELECT invitation_row.* INTO v_invitation
  FROM public.household_chore_invitations AS invitation_row
  WHERE invitation_row.id = p_invitation_id
    AND invitation_row.circle_id = v_probe.circle_id
    AND invitation_row.invitee_user_id = p_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'not_found', p_request_id)
    );
  END IF;
  IF v_invitation.version IS DISTINCT FROM p_expected_version THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'stale_version', p_request_id)
    );
  END IF;
  IF v_invitation.status <> 'pending'
     OR v_invitation.expires_at <= pg_catalog.clock_timestamp() THEN
    IF v_invitation.status = 'pending' THEN
      UPDATE public.household_chore_invitations AS invitation_row
      SET status = 'expired', responded_at = pg_catalog.clock_timestamp(),
          version = invitation_row.version + 1
      WHERE invitation_row.id = v_invitation.id;
      v_invitation.status := 'expired';
    END IF;
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', v_invitation.status)
      )
    );
  END IF;
  IF v_invitation.invited_by_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS inviter_membership
    WHERE inviter_membership.circle_id = v_invitation.circle_id
      AND inviter_membership.user_id = v_invitation.invited_by_user_id
      AND inviter_membership.status = 'active'
      AND inviter_membership.membership_type = 'member'
  ) THEN
    UPDATE public.household_chore_invitations AS invitation_row
    SET status = 'cancelled', responded_at = pg_catalog.clock_timestamp(),
        version = invitation_row.version + 1
    WHERE invitation_row.id = v_invitation.id;
    DELETE FROM public.recent_events AS recent_row
    WHERE recent_row.user_id = p_actor_id
      AND recent_row.event_key = 'household:invitation:' || v_invitation.id::text;
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(
        false, 'terminal_state', p_request_id,
        pg_catalog.jsonb_build_object('current_status', 'cancelled')
      )
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = v_invitation.circle_id
      AND membership_row.user_id = p_actor_id
      AND membership_row.status = 'active'
  ) THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'conflict', p_request_id)
    );
  END IF;
  IF (
    SELECT pg_catalog.count(*) FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.circle_id = v_invitation.circle_id
      AND membership_row.status = 'active'
  ) >= 20 OR (
    SELECT pg_catalog.count(*) FROM public.household_chore_memberships AS membership_row
    WHERE membership_row.user_id = p_actor_id AND membership_row.status = 'active'
  ) >= 20 THEN
    RETURN public.household_chore_private_finish_request(
      p_actor_id, p_request_id,
      public.household_chore_private_result(false, 'cap_reached', p_request_id)
    );
  END IF;

  IF v_invitation.target_participant_id IS NOT NULL THEN
    SELECT participant_row.* INTO v_participant
    FROM public.household_chore_participants AS participant_row
    WHERE participant_row.circle_id = v_invitation.circle_id
      AND participant_row.id = v_invitation.target_participant_id
    FOR UPDATE;
    IF NOT FOUND OR v_participant.status <> 'active'
       OR v_participant.identity_marker <> 'current'
       OR v_participant.linked_user_id IS NOT NULL THEN
      RETURN public.household_chore_private_finish_request(
        p_actor_id, p_request_id,
        public.household_chore_private_result(false, 'conflict', p_request_id)
      );
    END IF;
    UPDATE public.household_chore_participants AS participant_row
    SET linked_user_id = p_actor_id,
        display_name_snapshot = public.household_chore_private_safe_user_label(p_actor_id),
        version = participant_row.version + 1
    WHERE participant_row.id = v_participant.id
    RETURNING participant_row.* INTO v_participant;
  ELSE
    SELECT participant_row.* INTO v_participant
    FROM public.household_chore_participants AS participant_row
    WHERE participant_row.circle_id = v_invitation.circle_id
      AND participant_row.linked_user_id = p_actor_id
    FOR UPDATE;
    IF NOT FOUND THEN
      IF (
        SELECT pg_catalog.count(*) FROM public.household_chore_participants AS participant_row
        WHERE participant_row.circle_id = v_invitation.circle_id
      ) >= 100 THEN
        RETURN public.household_chore_private_finish_request(
          p_actor_id, p_request_id,
          public.household_chore_private_result(false, 'cap_reached', p_request_id)
        );
      END IF;
      INSERT INTO public.household_chore_participants (
        circle_id, linked_user_id, display_name_snapshot
      ) VALUES (
        v_invitation.circle_id, p_actor_id,
        public.household_chore_private_safe_user_label(p_actor_id)
      ) RETURNING * INTO v_participant;
    ELSE
      UPDATE public.household_chore_participants AS participant_row
      SET status = 'active', archive_reason = NULL,
          version = participant_row.version + 1
      WHERE participant_row.id = v_participant.id
      RETURNING participant_row.* INTO v_participant;
    END IF;
  END IF;

  UPDATE public.household_chore_invitations AS invitation_row
  SET status = 'accepted', responded_at = pg_catalog.clock_timestamp(),
      version = invitation_row.version + 1
  WHERE invitation_row.id = v_invitation.id
  RETURNING invitation_row.* INTO v_invitation;
  INSERT INTO public.household_chore_memberships (
    id, circle_id, user_id, participant_id, initial_type, membership_type,
    origin, accepted_invitation_id
  ) VALUES (
    v_membership_id, v_invitation.circle_id, p_actor_id, v_participant.id,
    v_invitation.requested_type, v_invitation.requested_type,
    'invitation', v_invitation.id
  );
  DELETE FROM public.recent_events AS recent_row
  WHERE recent_row.user_id = p_actor_id
    AND recent_row.event_key = 'household:invitation:' || v_invitation.id::text;

  v_result := public.household_chore_private_result(
    true, 'invitation_accepted', p_request_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_membership_id,
      'circle_id', v_invitation.circle_id,
      'version', '1',
      'status', 'active',
      'membership_type', v_invitation.requested_type
    )
  );
  RETURN public.household_chore_private_finish_request(
    p_actor_id, p_request_id, v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.household_chore_guard_pending_participant_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'archived' AND EXISTS (
    SELECT 1 FROM public.household_chore_invitations AS invitation_row
    WHERE invitation_row.circle_id = OLD.circle_id
      AND invitation_row.target_participant_id = OLD.id
      AND invitation_row.status = 'pending'
      AND invitation_row.expires_at > pg_catalog.clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'household_chore_participant_link_pending';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS household_chore_participant_pending_link_guard
  ON public.household_chore_participants;
CREATE TRIGGER household_chore_participant_pending_link_guard
BEFORE UPDATE OF status ON public.household_chore_participants
FOR EACH ROW
EXECUTE FUNCTION public.household_chore_guard_pending_participant_link();

ALTER FUNCTION public.household_chore_get_participant_identity_links(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.household_chore_rename_participant(uuid, uuid, uuid, uuid, bigint, text) OWNER TO postgres;
ALTER FUNCTION public.household_chore_link_participant(uuid, uuid, uuid, uuid, bigint, text, text) OWNER TO postgres;
ALTER FUNCTION public.household_chore_accept_invitation(uuid, uuid, uuid, bigint) OWNER TO postgres;
ALTER FUNCTION public.household_chore_guard_pending_participant_link() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.household_chore_get_participant_identity_links(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_rename_participant(uuid, uuid, uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_link_participant(uuid, uuid, uuid, uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_accept_invitation(uuid, uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_chore_guard_pending_participant_link() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.household_chore_get_participant_identity_links(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_rename_participant(uuid, uuid, uuid, uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_link_participant(uuid, uuid, uuid, uuid, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.household_chore_accept_invitation(uuid, uuid, uuid, bigint) TO service_role;

COMMIT;
