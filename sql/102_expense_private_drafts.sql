-- SQL102: Private autosave drafts for Útlagt og endurgreitt.
-- Stebbi alone runs this migration after the read-only preflight is green.
-- Drafts are private, non-financial JSON snapshots. They never create ledger
-- rows, obligations, repayments, activity events or invitations.

BEGIN;

CREATE TABLE IF NOT EXISTS public.expense_private_drafts (
  id             uuid        PRIMARY KEY,
  actor_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type   text        NOT NULL,
  group_id       uuid        NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  expense_id     uuid        NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  current_step   text        NOT NULL DEFAULT 'details',
  payload        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  version        bigint      NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_private_drafts_context_check CHECK (
    (context_type = 'one_off' AND group_id IS NULL AND expense_id IS NULL)
    OR (context_type = 'group' AND group_id IS NOT NULL AND expense_id IS NULL)
    OR (context_type = 'edit' AND group_id IS NOT NULL AND expense_id IS NOT NULL)
  ),
  CONSTRAINT expense_private_drafts_step_check
    CHECK (current_step IN ('details', 'people', 'split', 'review')),
  CONSTRAINT expense_private_drafts_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT expense_private_drafts_payload_size_check
    CHECK (octet_length(payload::text) <= 65536),
  CONSTRAINT expense_private_drafts_version_check CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS expense_private_drafts_actor_updated_idx
  ON public.expense_private_drafts (actor_user_id, updated_at DESC, id);

ALTER TABLE public.expense_private_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_private_drafts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.expense_private_drafts
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expense_assert_private_draft_context(
  p_actor_id uuid,
  p_context_type text,
  p_group_id uuid,
  p_expense_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
  v_expense_created_by uuid;
  v_expense_status text;
  v_group_status text;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);

  IF p_context_type = 'one_off' THEN
    IF p_group_id IS NOT NULL OR p_expense_id IS NOT NULL THEN
      RAISE EXCEPTION 'expense_draft_invalid_context';
    END IF;
    RETURN;
  END IF;

  IF p_context_type = 'group' THEN
    IF p_group_id IS NULL OR p_expense_id IS NOT NULL THEN
      RAISE EXCEPTION 'expense_draft_invalid_context';
    END IF;
    SELECT public.expense_active_member_role(p_actor_id, p_group_id), groups.status
      INTO v_role, v_group_status
    FROM public.expense_groups AS groups
    WHERE groups.id = p_group_id;
    IF v_role IS NULL OR v_group_status <> 'active' THEN
      RAISE EXCEPTION 'expense_not_allowed';
    END IF;
    RETURN;
  END IF;

  IF p_context_type <> 'edit' OR p_group_id IS NULL OR p_expense_id IS NULL THEN
    RAISE EXCEPTION 'expense_draft_invalid_context';
  END IF;

  SELECT expenses.created_by, expenses.status, groups.status,
         public.expense_active_member_role(p_actor_id, groups.id)
    INTO v_expense_created_by, v_expense_status, v_group_status, v_role
  FROM public.expenses AS expenses
  JOIN public.expense_groups AS groups ON groups.id = expenses.group_id
  WHERE expenses.id = p_expense_id
    AND expenses.group_id = p_group_id;

  IF v_role IS NULL
     OR v_expense_status <> 'active'
     OR v_group_status <> 'active'
     OR (v_expense_created_by IS DISTINCT FROM p_actor_id AND v_role NOT IN ('owner', 'admin'))
     OR EXISTS (
       SELECT 1
       FROM public.expense_repayments AS repayments
       WHERE repayments.group_id = p_group_id
         AND repayments.status IN ('reported', 'confirmed')
     ) THEN
    RAISE EXCEPTION 'expense_not_allowed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_assert_private_draft_context(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expense_save_private_draft(
  p_actor_id uuid,
  p_draft_id uuid,
  p_context_type text,
  p_group_id uuid,
  p_expense_id uuid,
  p_current_step text,
  p_payload jsonb,
  p_expected_version bigint DEFAULT NULL
)
RETURNS TABLE(draft_id uuid, draft_version bigint, saved_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.expense_private_drafts%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_draft_id IS NULL
     OR p_current_step NOT IN ('details', 'people', 'split', 'review')
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION 'expense_draft_invalid_input';
  END IF;

  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, p_context_type, p_group_id, p_expense_id
  );

  IF p_expected_version IS NULL THEN
    INSERT INTO public.expense_private_drafts (
      id, actor_user_id, context_type, group_id, expense_id,
      current_step, payload, version
    ) VALUES (
      p_draft_id, p_actor_id, p_context_type, p_group_id, p_expense_id,
      p_current_step, p_payload, 1
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      SELECT * INTO v_row
      FROM public.expense_private_drafts AS drafts
      WHERE drafts.id = p_draft_id
        AND drafts.actor_user_id = p_actor_id;
      IF v_row.id IS NULL
         OR v_row.context_type <> p_context_type
         OR v_row.group_id IS DISTINCT FROM p_group_id
         OR v_row.expense_id IS DISTINCT FROM p_expense_id
         OR v_row.current_step <> p_current_step
         OR v_row.payload <> p_payload THEN
        RAISE EXCEPTION 'expense_draft_conflict';
      END IF;
    END IF;
  ELSE
    UPDATE public.expense_private_drafts AS drafts
    SET current_step = p_current_step,
        payload = p_payload,
        version = drafts.version + 1,
        updated_at = now()
    WHERE drafts.id = p_draft_id
      AND drafts.actor_user_id = p_actor_id
      AND drafts.context_type = p_context_type
      AND drafts.group_id IS NOT DISTINCT FROM p_group_id
      AND drafts.expense_id IS NOT DISTINCT FROM p_expense_id
      AND drafts.version = p_expected_version
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'expense_draft_conflict';
    END IF;
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.version, v_row.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_get_private_draft(
  p_actor_id uuid,
  p_draft_id uuid
)
RETURNS TABLE(
  draft_id uuid,
  context_type text,
  group_id uuid,
  expense_id uuid,
  current_step text,
  payload jsonb,
  draft_version bigint,
  saved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.expense_private_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.expense_private_drafts AS drafts
  WHERE drafts.id = p_draft_id
    AND drafts.actor_user_id = p_actor_id;
  IF v_row.id IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.expense_assert_private_draft_context(
    p_actor_id, v_row.context_type, v_row.group_id, v_row.expense_id
  );
  RETURN QUERY SELECT
    v_row.id, v_row.context_type, v_row.group_id, v_row.expense_id,
    v_row.current_step, v_row.payload, v_row.version, v_row.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_delete_private_draft(
  p_actor_id uuid,
  p_draft_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted_count bigint;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  DELETE FROM public.expense_private_drafts AS drafts
  WHERE drafts.id = p_draft_id
    AND drafts.actor_user_id = p_actor_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_save_private_draft(uuid, uuid, text, uuid, uuid, text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_get_private_draft(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_delete_private_draft(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.expense_save_private_draft(uuid, uuid, text, uuid, uuid, text, jsonb, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_private_draft(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_delete_private_draft(uuid, uuid)
  TO service_role;

-- Create a one-off expense and atomically promote members selected from the
-- actor's registered Relationships to consent-gated invited members. Calling
-- the existing SQL96 RPC inside this wrapper keeps its validation, ledger and
-- idempotency contract; any failed relationship check rolls the whole call
-- back, including the nested create.
CREATE OR REPLACE FUNCTION public.expense_create_expense_with_known_members(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_group_id uuid,
  p_title text,
  p_total_minor bigint,
  p_currency text,
  p_incurred_on date,
  p_category text,
  p_note text,
  p_split_method text,
  p_one_off_members jsonb,
  p_payments jsonb,
  p_shares jsonb,
  p_obligations jsonb,
  p_known_relationship_members jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
  v_group_id uuid;
  v_mapping jsonb;
  v_member_id uuid;
  v_relationship_id uuid;
  v_counterpart_user_id uuid;
  v_display_name text;
  v_existing_member public.expense_group_members%ROWTYPE;
BEGIN
  IF p_group_id IS NOT NULL
     OR p_known_relationship_members IS NULL
     OR jsonb_typeof(p_known_relationship_members) <> 'array'
     OR jsonb_array_length(p_known_relationship_members) > 49
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_known_relationship_members) AS mapping
       WHERE jsonb_typeof(mapping) <> 'object'
          OR (mapping - ARRAY['member_id', 'relationship_id']::text[]) <> '{}'::jsonb
          OR NOT (mapping ?& ARRAY['member_id', 'relationship_id']::text[])
          OR (mapping->>'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR (mapping->>'relationship_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_known_relationship_members) AS mapping
       GROUP BY mapping->>'member_id' HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_known_relationship_members) AS mapping
       GROUP BY mapping->>'relationship_id' HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'expense_members_invalid';
  END IF;

  v_result := public.expense_create_expense(
    p_actor_id, p_request_id, p_expense_id, p_group_id, p_title,
    p_total_minor, p_currency, p_incurred_on, p_category, p_note,
    p_split_method, p_one_off_members, p_payments, p_shares, p_obligations
  );
  v_group_id := (v_result->>'group_id')::uuid;

  FOR v_mapping IN SELECT value FROM jsonb_array_elements(p_known_relationship_members)
  LOOP
    v_member_id := (v_mapping->>'member_id')::uuid;
    v_relationship_id := (v_mapping->>'relationship_id')::uuid;

    SELECT relationship.counterpart_user_id,
           coalesce(NULLIF(btrim(profile.display_name), ''), 'Teskeiðarnotandi')
      INTO v_counterpart_user_id, v_display_name
    FROM public.relationships AS relationship
    JOIN auth.users AS account ON account.id = relationship.counterpart_user_id
    LEFT JOIN public.profiles AS profile ON profile.id = relationship.counterpart_user_id
    WHERE relationship.id = v_relationship_id
      AND relationship.owner_id = p_actor_id
      AND relationship.counterpart_user_id IS NOT NULL
      AND relationship.counterpart_user_id <> p_actor_id;

    IF v_counterpart_user_id IS NULL THEN
      RAISE EXCEPTION 'expense_relationship_not_available';
    END IF;

    SELECT member.* INTO v_existing_member
    FROM public.expense_group_members AS member
    WHERE member.id = v_member_id
      AND member.group_id = v_group_id
    FOR UPDATE;

    IF v_existing_member.id IS NULL
       OR v_existing_member.role <> 'member'
       OR (
         v_existing_member.user_id IS NOT NULL
         AND v_existing_member.user_id IS DISTINCT FROM v_counterpart_user_id
       )
       OR EXISTS (
         SELECT 1 FROM public.expense_group_members AS duplicate
         WHERE duplicate.group_id = v_group_id
           AND duplicate.user_id = v_counterpart_user_id
           AND duplicate.id <> v_member_id
       ) THEN
      RAISE EXCEPTION 'expense_member_invalid';
    END IF;

    IF v_existing_member.user_id IS NULL THEN
      UPDATE public.expense_group_members AS member
      SET user_id = v_counterpart_user_id,
          display_name = left(v_display_name, 120),
          status = 'invited'
      WHERE member.id = v_member_id
        AND member.group_id = v_group_id;

      PERFORM public.expense_record_activity(
        v_group_id, p_actor_id, 'expense_group_invitation_received',
        'expense_group_invitation', v_group_id,
        'expense_group_invitation_received', NULL, btrim(p_title),
        ARRAY[v_counterpart_user_id], true
      );
    ELSIF v_existing_member.status <> 'invited' THEN
      RAISE EXCEPTION 'expense_member_invalid';
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_create_expense_with_known_members(
  uuid, uuid, uuid, uuid, text, bigint, text, date, text, text,
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_create_expense_with_known_members(
  uuid, uuid, uuid, uuid, text, bigint, text, date, text, text,
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) TO service_role;

COMMENT ON TABLE public.expense_private_drafts IS
  'Private non-financial autosave snapshots. No activity, obligations, repayments or invitations originate here.';

COMMIT;
