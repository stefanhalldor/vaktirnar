-- TODO #95 / SQL110: unified UL participant invitations.
-- WRITE-ONLY HANDOFF: Stebbi alone runs this migration after the read-only
-- preflight. It never grants the recipient general UL access and never changes
-- shares, payments, obligations or historical activity when identity is linked.

BEGIN;

ALTER TABLE public.expense_member_invitations
  ADD COLUMN IF NOT EXISTS participant_source text NOT NULL DEFAULT 'guest_link',
  ADD COLUMN IF NOT EXISTS relationship_id uuid NULL
    REFERENCES public.relationships(id) ON DELETE SET NULL;

ALTER TABLE public.expense_member_invitations
  DROP CONSTRAINT IF EXISTS expense_member_invitations_template_check,
  ADD CONSTRAINT expense_member_invitations_template_check
    CHECK (email_template_version IN ('v1', 'v2')),
  DROP CONSTRAINT IF EXISTS expense_member_invitations_participant_source_check,
  ADD CONSTRAINT expense_member_invitations_participant_source_check
    CHECK (participant_source IN ('guest_link', 'manual_email', 'relationship')),
  DROP CONSTRAINT IF EXISTS expense_member_invitations_relationship_source_check,
  ADD CONSTRAINT expense_member_invitations_relationship_source_check
    CHECK ((participant_source = 'relationship') = (relationship_id IS NOT NULL));

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
    left(btrim(v_group.name), 200), btrim(v_member.display_name),
    left(v_inviter_name, 120), 'v2', p_participant_source, p_relationship_id
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

CREATE OR REPLACE FUNCTION public.expense_create_expense_with_participants(
  p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid,
  p_title text, p_total_minor bigint, p_currency text, p_incurred_on date,
  p_category text, p_note text, p_split_method text, p_one_off_members jsonb,
  p_payments jsonb, p_shares jsonb, p_obligations jsonb,
  p_participant_invitations jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_item jsonb; v_ids jsonb := '[]'::jsonb; v_invitation_id uuid;
BEGIN
  IF p_group_id IS NOT NULL OR jsonb_typeof(p_participant_invitations) <> 'array'
     OR jsonb_array_length(p_participant_invitations) > 49 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_result := public.expense_create_expense_with_known_members(
    p_actor_id, p_request_id, p_expense_id, p_group_id, p_title, p_total_minor,
    p_currency, p_incurred_on, p_category, p_note, p_split_method,
    p_one_off_members, p_payments, p_shares, p_obligations, '[]'::jsonb
  );
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_participant_invitations) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR NOT (v_item ? 'member_id')
       OR ((v_item ? 'recipient_email') = (v_item ? 'relationship_id')) THEN
      RAISE EXCEPTION 'expense_invalid_input';
    END IF;
    v_invitation_id := public.expense_create_unified_participant_invitation(
      p_actor_id, (v_result->>'group_id')::uuid, (v_item->>'member_id')::uuid,
      v_item->>'recipient_email', CASE WHEN v_item ? 'relationship_id'
        THEN (v_item->>'relationship_id')::uuid ELSE NULL END,
      CASE WHEN v_item ? 'relationship_id' THEN 'relationship' ELSE 'manual_email' END
    );
    v_ids := v_ids || jsonb_build_array(v_invitation_id);
  END LOOP;
  RETURN v_result || jsonb_build_object('invitation_ids', v_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_update_expense_with_participants(
  p_actor_id uuid, p_request_id uuid, p_expense_id uuid,
  p_expected_financial_version bigint, p_title text, p_total_minor bigint,
  p_currency text, p_incurred_on date, p_category text, p_note text,
  p_split_method text, p_preserve_shares boolean, p_new_guest_members jsonb,
  p_new_participant_invitations jsonb, p_removed_member_ids uuid[],
  p_payments jsonb, p_shares jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_item jsonb; v_ids jsonb := '[]'::jsonb; v_invitation_id uuid;
  v_removed_id uuid; v_removed public.expense_group_members%ROWTYPE; v_group_name text;
BEGIN
  IF jsonb_typeof(p_new_participant_invitations) <> 'array'
     OR jsonb_array_length(p_new_participant_invitations) > 48
     OR coalesce(cardinality(p_removed_member_ids),0) > 48
     OR array_position(p_removed_member_ids,NULL) IS NOT NULL
     OR EXISTS(SELECT 1 FROM unnest(coalesce(p_removed_member_ids,ARRAY[]::uuid[])) AS removed(id)
       GROUP BY removed.id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_result := public.expense_update_expense(
    p_actor_id, p_request_id, p_expense_id, p_expected_financial_version,
    p_title, p_total_minor, p_currency, p_incurred_on, p_category, p_note,
    p_split_method, p_preserve_shares, p_new_guest_members, p_payments, p_shares
  );
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_new_participant_invitations) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR NOT (v_item ? 'member_id')
       OR ((v_item ? 'recipient_email') = (v_item ? 'relationship_id')) THEN
      RAISE EXCEPTION 'expense_invalid_input';
    END IF;
    v_invitation_id := public.expense_create_unified_participant_invitation(
      p_actor_id, (v_result->>'group_id')::uuid, (v_item->>'member_id')::uuid,
      v_item->>'recipient_email', CASE WHEN v_item ? 'relationship_id'
        THEN (v_item->>'relationship_id')::uuid ELSE NULL END,
      CASE WHEN v_item ? 'relationship_id' THEN 'relationship' ELSE 'manual_email' END
    );
    v_ids := v_ids || jsonb_build_array(v_invitation_id);
  END LOOP;
  SELECT group_row.name INTO v_group_name FROM public.expense_groups AS group_row
    WHERE group_row.id=(v_result->>'group_id')::uuid;
  FOREACH v_removed_id IN ARRAY coalesce(p_removed_member_ids,ARRAY[]::uuid[]) LOOP
    SELECT member.* INTO v_removed FROM public.expense_group_members AS member
      WHERE member.group_id=(v_result->>'group_id')::uuid AND member.id=v_removed_id FOR UPDATE;
    IF v_removed.id IS NULL OR v_removed.role='owner' OR v_removed.user_id=p_actor_id
       OR EXISTS(SELECT 1 FROM public.expense_payments AS payment
         WHERE payment.group_id=v_removed.group_id AND payment.member_id=v_removed_id)
       OR EXISTS(SELECT 1 FROM public.expense_shares AS share
         WHERE share.group_id=v_removed.group_id AND share.member_id=v_removed_id)
       OR EXISTS(SELECT 1 FROM public.expense_obligations AS obligation
         WHERE obligation.group_id=v_removed.group_id
           AND (obligation.from_member_id=v_removed_id OR obligation.to_member_id=v_removed_id))
       OR EXISTS(SELECT 1 FROM public.expense_repayments AS repayment
         WHERE repayment.group_id=v_removed.group_id
           AND (repayment.from_member_id=v_removed_id OR repayment.to_member_id=v_removed_id)) THEN
      RAISE EXCEPTION 'expense_member_cannot_remove';
    END IF;
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY(SELECT invitation.id FROM public.expense_member_invitations AS invitation
        WHERE invitation.group_id=v_removed.group_id AND invitation.member_id=v_removed_id
          AND invitation.status='pending'), 'cancelled'
    );
    UPDATE public.expense_group_members SET status='removed'
      WHERE group_id=v_removed.group_id AND id=v_removed_id;
    PERFORM public.expense_record_activity(
      v_removed.group_id,p_actor_id,'expense_group_member_removed','expense_group',
      v_removed.group_id,'expense_group_member_removed',NULL,v_group_name,
      CASE WHEN v_removed.user_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[v_removed.user_id] END,true
    );
  END LOOP;
  RETURN v_result || jsonb_build_object('invitation_ids', v_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_invite_existing_participant(
  p_actor_id uuid, p_group_id uuid, p_member_id uuid,
  p_recipient_email text, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  -- request id remains required for the service boundary; the pending-member
  -- unique index makes safe retries return the same invitation.
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  v_id := public.expense_create_unified_participant_invitation(
    p_actor_id, p_group_id, p_member_id, p_recipient_email, NULL, 'guest_link'
  );
  RETURN jsonb_build_object('invitation_id', v_id, 'group_id', p_group_id, 'member_id', p_member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_add_participant(
  p_actor_id uuid, p_group_id uuid, p_request_id uuid, p_member jsonb,
  p_recipient_email text DEFAULT NULL, p_relationship_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_invitation_id uuid;
BEGIN
  IF jsonb_typeof(p_member) <> 'object' OR NOT (p_member ?& ARRAY['id','display_name'])
     OR ((p_recipient_email IS NOT NULL) AND (p_relationship_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_result := public.expense_add_group_member(
    p_actor_id, p_group_id, p_request_id,
    jsonb_build_object('id', p_member->>'id', 'user_id', NULL,
      'display_name', p_member->>'display_name', 'status', 'active')
  );
  IF p_recipient_email IS NOT NULL OR p_relationship_id IS NOT NULL THEN
    v_invitation_id := public.expense_create_unified_participant_invitation(
      p_actor_id, p_group_id, (p_member->>'id')::uuid, p_recipient_email,
      p_relationship_id, CASE WHEN p_relationship_id IS NULL
        THEN 'manual_email' ELSE 'relationship' END
    );
  END IF;
  RETURN v_result || jsonb_build_object('member_id', p_member->>'id')
    || CASE WHEN v_invitation_id IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('invitation_id', v_invitation_id) END;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_get_scoped_member_invitation(
  p_actor_id uuid, p_invitation_id uuid
)
RETURNS TABLE(invitation_id uuid, context_title text, inviter_display_name text,
  status text, expires_at timestamptz, invited_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT invitation.id, invitation.context_title_snapshot,
    invitation.inviter_display_name_snapshot, invitation.status,
    invitation.expires_at, invitation.created_at
  FROM public.expense_member_invitations AS invitation
  JOIN public.expense_groups AS group_row ON group_row.id = invitation.group_id
    AND group_row.status IN ('active','settling','settled')
  JOIN public.expense_group_members AS member ON member.group_id = invitation.group_id
    AND member.id = invitation.member_id AND member.status = 'active'
    AND member.user_id IS NULL
  JOIN auth.users AS account ON account.id = p_actor_id
  WHERE invitation.id = p_invitation_id AND invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND invitation.recipient_email_canonical = public.normalize_email_canonical(account.email)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.expense_reserve_scoped_member_invitation_send(
  p_actor_id uuid, p_invitation_id uuid
)
RETURNS TABLE(attempt_number integer, can_send boolean, reason text,
  recipient_email text, email_template_version text, context_title text,
  inviter_display_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v record; v_role text; v_attempt integer;
BEGIN
  IF NOT public.expense_has_beta_access(p_actor_id) THEN
    RETURN QUERY SELECT 0,false,'not_found'::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  SELECT invitation.*, group_row.status AS group_status, member.status AS member_status,
    member.user_id AS member_user_id INTO v
  FROM public.expense_member_invitations AS invitation
  JOIN public.expense_groups AS group_row ON group_row.id = invitation.group_id
  JOIN public.expense_group_members AS member ON member.group_id = invitation.group_id
    AND member.id = invitation.member_id
  WHERE invitation.id = p_invitation_id FOR UPDATE OF invitation, group_row, member;
  IF v.id IS NULL THEN
    RETURN QUERY SELECT 0,false,'not_found'::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  v_role := public.expense_active_member_role(p_actor_id, v.group_id);
  IF v.invited_by IS DISTINCT FROM p_actor_id AND coalesce(v_role,'') NOT IN ('owner','admin') THEN
    RETURN QUERY SELECT 0,false,'not_found'::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  IF v.status <> 'pending' OR v.expires_at <= now() OR v.group_status NOT IN ('active','settling','settled')
     OR v.member_status <> 'active' OR v.member_user_id IS NOT NULL THEN
    IF v.status = 'pending' AND v.expires_at <= now() THEN
      PERFORM public.expense_terminalize_member_invitations(ARRAY[v.id], 'expired');
    END IF;
    RETURN QUERY SELECT v.attempt_number,false,'not_pending'::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  IF v.attempt_status = 'reserved' AND v.attempt_at >= now() - interval '24 hours' THEN
    RETURN QUERY SELECT v.attempt_number,true,'ok'::text,v.recipient_email_canonical,
      v.email_template_version,v.context_title_snapshot,v.inviter_display_name_snapshot; RETURN;
  END IF;
  IF (v.attempt_status = 'sent' AND v.email_sent_at > now() - interval '24 hours')
     OR v.attempt_number >= 3 THEN
    RETURN QUERY SELECT v.attempt_number,false,CASE WHEN v.attempt_number >= 3
      THEN 'max_sends' ELSE 'already_sent' END,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  IF v.attempt_status = 'failed' AND v.attempt_at > now() - interval '5 minutes' THEN
    RETURN QUERY SELECT v.attempt_number,false,'cooldown'::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  IF (SELECT count(*) FROM public.expense_member_invitations AS invitation
      WHERE invitation.invited_by = p_actor_id AND invitation.attempt_at > now() - interval '1 hour') >= 20 THEN
    RETURN QUERY SELECT v.attempt_number,false,'rate_limited'::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  v_attempt := v.attempt_number + 1;
  UPDATE public.expense_member_invitations AS invitation
  SET attempt_number = v_attempt, attempt_status = 'reserved', attempt_at = now()
  WHERE invitation.id = v.id;
  RETURN QUERY SELECT v_attempt,true,'ok'::text,v.recipient_email_canonical,
    v.email_template_version,v.context_title_snapshot,v.inviter_display_name_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_respond_scoped_member_invitation(
  p_actor_id uuid, p_invitation_id uuid, p_action text, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invitation public.expense_member_invitations%ROWTYPE;
  v_group public.expense_groups%ROWTYPE; v_member public.expense_group_members%ROWTYPE;
  v_actor_email text; v_name text; v_result jsonb; v_existing record; v_version bigint;
  v_fingerprint text;
BEGIN
  IF p_actor_id IS NULL OR p_invitation_id IS NULL OR p_request_id IS NULL
     OR p_action NOT IN ('accept','decline') THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  v_fingerprint := md5(jsonb_build_object('invitationId',p_invitation_id,'action',p_action)::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_id::text, 9601));
  INSERT INTO public.expense_mutation_requests(actor_user_id,request_id,operation,fingerprint)
    VALUES(p_actor_id,p_request_id,'expense_respond_scoped_member_invitation',v_fingerprint)
    ON CONFLICT(actor_user_id,request_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT request.* INTO v_existing FROM public.expense_mutation_requests AS request
    WHERE request.actor_user_id=p_actor_id AND request.request_id=p_request_id FOR UPDATE;
    IF v_existing.operation <> 'expense_respond_scoped_member_invitation'
       OR v_existing.fingerprint <> v_fingerprint THEN RAISE EXCEPTION 'expense_idempotency_conflict'; END IF;
    IF v_existing.result IS NULL THEN RAISE EXCEPTION 'expense_idempotency_incomplete'; END IF;
    RETURN v_existing.result;
  END IF;
  SELECT public.normalize_email_canonical(account.email) INTO v_actor_email
    FROM auth.users AS account WHERE account.id=p_actor_id;
  SELECT invitation.* INTO v_invitation FROM public.expense_member_invitations AS invitation
    WHERE invitation.id=p_invitation_id FOR UPDATE;
  IF v_invitation.id IS NULL OR v_invitation.status <> 'pending'
     OR v_invitation.recipient_email_canonical IS DISTINCT FROM v_actor_email THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;
  SELECT group_row.* INTO v_group FROM public.expense_groups AS group_row
    WHERE group_row.id=v_invitation.group_id FOR UPDATE;
  SELECT member.* INTO v_member FROM public.expense_group_members AS member
    WHERE member.group_id=v_invitation.group_id AND member.id=v_invitation.member_id FOR UPDATE;
  IF v_invitation.expires_at <= now() THEN
    PERFORM public.expense_terminalize_member_invitations(ARRAY[p_invitation_id],'expired');
    v_result:=jsonb_build_object('status','expired');
  ELSIF p_action='decline' THEN
    PERFORM public.expense_terminalize_member_invitations(ARRAY[p_invitation_id],'declined');
    PERFORM public.expense_record_activity(v_group.id,p_actor_id,'expense_member_invitation_declined',
      'expense_member_invitation',p_invitation_id,'expense_member_invitation_declined',NULL,
      v_invitation.context_title_snapshot,CASE WHEN v_invitation.invited_by IS NULL
        THEN ARRAY[]::uuid[] ELSE ARRAY[v_invitation.invited_by] END,true);
    v_result:=jsonb_build_object('status','declined');
  ELSE
    IF v_group.status NOT IN ('active','settling','settled') OR v_member.status <> 'active'
       OR v_member.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.expense_group_members AS duplicate
         WHERE duplicate.group_id=v_group.id AND duplicate.id<>v_member.id
           AND duplicate.user_id=p_actor_id AND duplicate.status IN ('active','invited')) THEN
      RAISE EXCEPTION 'expense_invitation_conflict';
    END IF;
    SELECT coalesce(NULLIF(btrim(profile.display_name),''),'Teskeiðarnotandi') INTO v_name
      FROM public.profiles AS profile WHERE profile.id=p_actor_id;
    UPDATE public.expense_group_members SET user_id=p_actor_id,
      display_name=left(coalesce(v_name,'Teskeiðarnotandi'),120),status='active'
      WHERE group_id=v_group.id AND id=v_member.id;
    PERFORM public.expense_terminalize_member_invitations(ARRAY[p_invitation_id],'accepted');
    UPDATE public.expense_groups SET financial_version=financial_version+1
      WHERE id=v_group.id RETURNING financial_version INTO v_version;
    PERFORM public.expense_record_activity(v_group.id,p_actor_id,'expense_member_invitation_accepted',
      'expense_member_invitation',p_invitation_id,'expense_member_invitation_accepted',NULL,
      v_invitation.context_title_snapshot,ARRAY[p_actor_id],true);
    v_result:=jsonb_build_object('status','accepted','group_id',v_group.id,
      'member_id',v_member.id,'invited_by',v_invitation.invited_by,
      'counterpart_user_id',p_actor_id,'financial_version',v_version,
      'participant_source',v_invitation.participant_source);
  END IF;
  UPDATE public.expense_mutation_requests SET result=v_result,completed_at=now()
    WHERE actor_user_id=p_actor_id AND request_id=p_request_id AND result IS NULL;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expense_invite_existing_participant(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expense_add_participant(uuid,uuid,uuid,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expense_get_scoped_member_invitation(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expense_reserve_scoped_member_invitation_send(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_invite_existing_participant(uuid,uuid,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_add_participant(uuid,uuid,uuid,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_scoped_member_invitation(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_reserve_scoped_member_invitation_send(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid) TO service_role;

COMMENT ON FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid) IS
  'Exact-email consent link. Identity changes only; financial rows and history remain intact.';

COMMIT;
