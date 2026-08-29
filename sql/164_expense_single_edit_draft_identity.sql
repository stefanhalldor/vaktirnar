-- SQL164: One canonical private edit-draft identity per actor and Expense.
-- This migration performs no cleanup and no financial/Event mutation.

BEGIN;

DO $block$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'
  ) IS NULL OR (
  SELECT pg_catalog.md5(pg_catalog.replace(proc.prosrc, E'\r\n', E'\n'))
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = 'public.expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)'::regprocedure
  ) <> '59f7c91049839431bf068d58f8462673' THEN
    RAISE EXCEPTION 'expense_sql164_predecessor_drift';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.expense_private_drafts AS drafts
    WHERE drafts.context_type = 'edit'
    GROUP BY drafts.actor_user_id, drafts.expense_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'expense_duplicate_edit_drafts_require_separate_cleanup';
  END IF;
END;
$block$;

CREATE UNIQUE INDEX expense_private_drafts_one_edit_per_actor_expense_idx
  ON public.expense_private_drafts (actor_user_id, expense_id)
  WHERE context_type = 'edit';

-- Preserve SQL162's exact signature and return shape. On an initial edit save,
-- the server may return an already-existing canonical identity without writing
-- the proposed payload. The caller then applies that payload through ordinary
-- CAS against the returned identity/version.
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
AS $function$
DECLARE
  v_row public.expense_private_drafts%ROWTYPE;
  v_existing public.expense_private_drafts%ROWTYPE;
  v_incoming_relation jsonb;
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
  IF p_context_type = 'one_off' THEN
    v_incoming_relation := public.expense_sql162_event_relation_tuple(p_payload);
  END IF;

  IF p_expected_version IS NULL THEN
    IF p_context_type = 'one_off'
       AND (v_incoming_relation->>'link_to_event')::boolean THEN
      RAISE EXCEPTION 'expense_draft_event_relation_conflict';
    END IF;

    IF p_context_type = 'edit' THEN
      -- Every writer uses the same exact actor+Expense lock key. Hash collisions
      -- can only serialize unrelated saves; they cannot widen visibility.
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_actor_id::text || ':' || p_expense_id::text, 164)
      );
      SELECT * INTO v_row
      FROM public.expense_private_drafts AS drafts
      WHERE drafts.actor_user_id = p_actor_id
        AND drafts.context_type = 'edit'
        AND drafts.expense_id = p_expense_id
      FOR UPDATE;
      IF v_row.id IS NOT NULL THEN
        IF v_row.id = p_draft_id AND (
          v_row.group_id IS DISTINCT FROM p_group_id
          OR v_row.current_step <> p_current_step
          OR v_row.payload <> p_payload
        ) THEN
          -- A same-ID null-version replay is idempotent only. Never claim that
          -- changed payload was saved without a caller-supplied CAS version.
          RAISE EXCEPTION 'expense_draft_conflict';
        END IF;
        RETURN QUERY SELECT v_row.id, v_row.version, v_row.updated_at;
        RETURN;
      END IF;
    END IF;

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
    SELECT * INTO v_existing
    FROM public.expense_private_drafts AS drafts
    WHERE drafts.id = p_draft_id
      AND drafts.actor_user_id = p_actor_id
      AND drafts.context_type = p_context_type
      AND drafts.group_id IS NOT DISTINCT FROM p_group_id
      AND drafts.expense_id IS NOT DISTINCT FROM p_expense_id
      AND drafts.version = p_expected_version
    FOR UPDATE;
    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'expense_draft_conflict';
    END IF;
    IF p_context_type = 'one_off'
       AND public.expense_sql162_event_relation_tuple(v_existing.payload)
         IS DISTINCT FROM v_incoming_relation THEN
      RAISE EXCEPTION 'expense_draft_event_relation_conflict';
    END IF;
    UPDATE public.expense_private_drafts AS drafts
    SET current_step = p_current_step,
        payload = p_payload,
        version = drafts.version + 1,
        updated_at = now()
    WHERE drafts.id = p_draft_id
      AND drafts.actor_user_id = p_actor_id
      AND drafts.version = p_expected_version
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'expense_draft_conflict';
    END IF;
  END IF;
  RETURN QUERY SELECT v_row.id, v_row.version, v_row.updated_at;
END;
$function$;

ALTER FUNCTION public.expense_save_private_draft(
  uuid,uuid,text,uuid,uuid,text,jsonb,bigint
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.expense_save_private_draft(
  uuid,uuid,text,uuid,uuid,text,jsonb,bigint
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_save_private_draft(
  uuid,uuid,text,uuid,uuid,text,jsonb,bigint
) TO service_role;

COMMENT ON INDEX public.expense_private_drafts_one_edit_per_actor_expense_idx
  IS 'SQL164 exact actor+Expense canonical private edit-draft identity.';
COMMENT ON FUNCTION public.expense_save_private_draft(
  uuid,uuid,text,uuid,uuid,text,jsonb,bigint
) IS 'SQL164 private draft save with deterministic exact edit identity resolution and unchanged CAS semantics.';

COMMIT;
