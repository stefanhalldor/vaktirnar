-- SQL111: Private, read-only directory for incomplete UL drafts.
-- Stebbi alone runs this migration after the read-only preflight is green.
-- This does not create ledger entries. It exposes only the caller's own
-- recoverable draft snapshots to the service-role app boundary.

BEGIN;

CREATE OR REPLACE FUNCTION public.expense_list_my_private_drafts(
  p_actor_id uuid
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
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'expense_draft_invalid_input';
  END IF;

  PERFORM public.expense_assert_beta_actor(p_actor_id);

  RETURN QUERY
  SELECT
    draft.id,
    draft.context_type,
    draft.group_id,
    draft.expense_id,
    draft.current_step,
    draft.payload,
    draft.version,
    draft.updated_at
  FROM public.expense_private_drafts AS draft
  WHERE draft.actor_user_id = p_actor_id
    AND (
      draft.context_type = 'one_off'
      OR (
        draft.context_type = 'group'
        AND EXISTS (
          SELECT 1
          FROM public.expense_groups AS expense_group
          WHERE expense_group.id = draft.group_id
            AND expense_group.status = 'active'
            AND public.expense_active_member_role(p_actor_id, expense_group.id) IS NOT NULL
        )
      )
      OR (
        draft.context_type = 'edit'
        AND EXISTS (
          SELECT 1
          FROM public.expenses AS expense
          JOIN public.expense_groups AS expense_group ON expense_group.id = expense.group_id
          WHERE expense.id = draft.expense_id
            AND expense.group_id = draft.group_id
            AND expense.status = 'active'
            AND expense_group.status = 'active'
            AND public.expense_active_member_role(p_actor_id, expense_group.id) IS NOT NULL
            AND (
              expense.created_by = p_actor_id
              OR public.expense_active_member_role(p_actor_id, expense_group.id) IN ('owner', 'admin')
            )
            AND NOT EXISTS (
              SELECT 1
              FROM public.expense_repayments AS repayment
              WHERE repayment.group_id = expense_group.id
                AND repayment.status IN ('reported', 'confirmed')
            )
        )
      )
    )
  ORDER BY draft.updated_at DESC, draft.id
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_list_my_private_drafts(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_list_my_private_drafts(uuid)
  TO service_role;

COMMENT ON FUNCTION public.expense_list_my_private_drafts(uuid) IS
  'Bounded, actor-exact private draft directory for recoverable UL work. Never creates ledger state.';

COMMIT;
