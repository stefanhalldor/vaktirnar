-- SQL173 RUNTIME CAPABILITY DIAGNOSTIC: explain one confirmed Expense denial.
--
-- Replace only the UUID literal below with the Expense UUID from the detail URL.
-- This statement is read-only. It calls only the reviewed STABLE capability and
-- receipt-classification functions, reads the minimum related state needed to
-- identify the blocking branch, and returns no names, emails, amounts or payloads.
WITH
diagnostic_input(requested_expense_id) AS (
  VALUES ('00000000-0000-0000-0000-000000000000'::uuid)
),
target AS MATERIALIZED (
  SELECT
    diagnostic_input.requested_expense_id,
    expense.id AS expense_id,
    expense.created_by AS expense_created_by,
    expense.status AS expense_status,
    expense.group_id AS expense_group_id,
    group_row.id AS group_id,
    group_row.created_by AS group_created_by,
    group_row.kind AS group_kind,
    group_row.status AS group_status,
    group_row.financial_version
  FROM diagnostic_input
  LEFT JOIN public.expenses AS expense
    ON expense.id = diagnostic_input.requested_expense_id
  LEFT JOIN public.expense_groups AS group_row
    ON group_row.id = expense.group_id
),
group_member_ids AS MATERIALIZED (
  SELECT COALESCE(
    pg_catalog.array_agg(member.id ORDER BY member.id)
      FILTER (WHERE member.id IS NOT NULL),
    ARRAY[]::uuid[]
  ) AS ids
  FROM target
  LEFT JOIN public.expense_group_members AS member
    ON target.group_kind = 'one_off'
   AND member.group_id = target.group_id
),
invitation_ids AS MATERIALIZED (
  SELECT COALESCE(
    pg_catalog.array_agg(invitation.id ORDER BY invitation.id)
      FILTER (WHERE invitation.id IS NOT NULL),
    ARRAY[]::uuid[]
  ) AS ids,
  pg_catalog.count(invitation.id)::bigint AS invitation_count
  FROM target
  LEFT JOIN public.expense_member_invitations AS invitation
    ON invitation.shared_expense_id = target.expense_id
    OR (target.group_kind = 'one_off' AND invitation.group_id = target.group_id)
),
receipt_draft_ids AS MATERIALIZED (
  SELECT COALESCE(
    pg_catalog.array_agg(source.draft_id ORDER BY source.draft_id),
    ARRAY[]::uuid[]
  ) AS ids
  FROM target
  LEFT JOIN LATERAL (
    SELECT finalization.draft_id
    FROM public.expense_unconfirmed_finalizations AS finalization
    WHERE finalization.expense_id = target.expense_id
    UNION
    SELECT CASE
      WHEN request.result->>'draft_id'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (request.result->>'draft_id')::uuid
      ELSE NULL::uuid
    END
    FROM public.expense_mutation_requests AS request
    WHERE request.result->>'expense_id' = target.expense_id::text
      AND request.result ? 'draft_id'
      AND request.result->>'draft_id'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND public.expense_hard_delete_receipt_shape_known(
        request.operation,
        request.result
      )
  ) AS source ON true
  WHERE source.draft_id IS NOT NULL
),
related_receipts AS MATERIALIZED (
  SELECT request.operation, request.result
  FROM target
  CROSS JOIN group_member_ids
  CROSS JOIN invitation_ids
  CROSS JOIN receipt_draft_ids
  JOIN public.expense_mutation_requests AS request
    ON request.result IS NOT NULL
   AND (
     request.result->>'expense_id' = target.expense_id::text
     OR (target.group_kind = 'one_off'
       AND request.result->>'group_id' = target.group_id::text)
     OR (target.group_kind = 'one_off'
       AND COALESCE(request.result->'group_ids', '[]'::jsonb) ? target.group_id::text)
     OR (target.group_kind = 'one_off' AND EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(group_member_ids.ids) AS member_id
       WHERE request.result->>'member_id' = member_id::text
          OR request.result->>'share_member_id' = member_id::text
     ))
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(receipt_draft_ids.ids) AS draft_id
       WHERE request.result->>'draft_id' = draft_id::text
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(invitation_ids.ids) AS invitation_id
       WHERE request.result->>'invitation_id' = invitation_id::text
          OR COALESCE(request.result->'invitation_ids', '[]'::jsonb)
               ? invitation_id::text
     )
   )
),
unknown_receipt_shapes AS MATERIALIZED (
  SELECT
    related_receipts.operation,
    COALESCE(keys.result_keys, ARRAY[]::text[]) AS result_keys,
    pg_catalog.count(*)::bigint AS receipt_count
  FROM related_receipts
  CROSS JOIN LATERAL (
    SELECT pg_catalog.array_agg(key_name ORDER BY key_name) AS result_keys
    FROM pg_catalog.jsonb_object_keys(
      CASE
        WHEN pg_catalog.jsonb_typeof(related_receipts.result) = 'object'
        THEN related_receipts.result
        ELSE '{}'::jsonb
      END
    ) AS key_name
  ) AS keys
  WHERE NOT public.expense_hard_delete_receipt_shape_known(
    related_receipts.operation,
    related_receipts.result
  )
  GROUP BY related_receipts.operation, keys.result_keys
),
facts AS MATERIALIZED (
  SELECT
    target.*,
    invitation_ids.ids AS invitation_ids,
    invitation_ids.invitation_count,
    (target.expense_id IS NOT NULL) AS expense_exists,
    (target.group_id IS NOT NULL) AS group_exists,
    (target.expense_status = 'active') AS expense_active,
    (target.group_status = 'active') AS group_active,
    (target.financial_version < 9007199254740991) AS financial_version_safe,
    CASE WHEN target.group_kind = 'one_off'
      THEN target.group_created_by IS NOT DISTINCT FROM target.expense_created_by
      ELSE NULL
    END AS one_off_creator_matches,
    (SELECT pg_catalog.count(*)::bigint
      FROM public.expense_event_contexts AS event_context
      WHERE event_context.group_id = target.group_id) AS event_context_count,
    (SELECT pg_catalog.count(*)::bigint
      FROM public.expenses AS group_expense
      WHERE group_expense.group_id = target.group_id) AS group_expense_count,
    (SELECT pg_catalog.count(*)::bigint
      FROM public.expense_claim_disputes AS dispute
      WHERE dispute.group_id = target.group_id
        AND dispute.expense_id = target.expense_id) AS claim_dispute_count,
    CASE WHEN target.expense_id IS NOT NULL AND target.group_id IS NOT NULL
      THEN public.expense_hard_delete_receipts_classified(
        target.expense_id,
        target.group_id,
        target.group_kind = 'one_off',
        invitation_ids.ids
      )
      ELSE NULL
    END AS receipts_classified,
    (SELECT pg_catalog.count(*)::bigint
      FROM public.expense_edit_revision_bindings AS binding
      WHERE binding.expense_id = target.expense_id
         OR (target.group_kind = 'one_off' AND binding.group_id = target.group_id)
    ) AS edit_binding_count,
    (SELECT pg_catalog.count(*)::bigint
      FROM public.expense_private_drafts AS draft
      WHERE draft.expense_id = target.expense_id
         OR (target.group_kind = 'one_off' AND draft.group_id = target.group_id)
    ) AS private_draft_count,
    (SELECT pg_catalog.count(*)::bigint
      FROM public.expense_unconfirmed_publications AS publication
      WHERE target.group_kind = 'one_off'
        AND publication.group_id = target.group_id
    ) AS unconfirmed_publication_count,
    (SELECT pg_catalog.count(*)::bigint
      FROM public.expense_repayments AS repayment
      WHERE repayment.group_id = target.group_id) AS repayment_count,
    (SELECT pg_catalog.count(*)::bigint
      FROM public.expense_settlement_batch_items AS item
      WHERE item.group_id = target.group_id) AS settlement_batch_item_count,
    (SELECT pg_catalog.count(*)::bigint
      FROM public.expense_obligations AS obligation
      WHERE obligation.group_id = target.group_id) AS obligation_count,
    (SELECT COALESCE(pg_catalog.sum(shape.receipt_count), 0)::bigint
      FROM unknown_receipt_shapes AS shape) AS unknown_receipt_count,
    (SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'operation', shape.operation,
          'result_keys', shape.result_keys,
          'receipt_count', shape.receipt_count
        ) ORDER BY shape.operation, shape.result_keys
      ),
      '[]'::jsonb
    ) FROM unknown_receipt_shapes AS shape) AS unknown_receipt_shapes,
    CASE
      WHEN target.expense_id IS NOT NULL AND target.expense_created_by IS NOT NULL
      THEN public.expense_get_own_delete_capability(
        target.expense_created_by,
        target.expense_id
      )
      ELSE NULL::jsonb
    END AS capability
  FROM target
  CROSS JOIN invitation_ids
)
SELECT
  1 AS diagnostic_contract_version,
  facts.expense_exists,
  facts.group_exists,
  COALESCE((facts.capability->>'visible')::boolean, false) AS capability_visible,
  COALESCE((facts.capability->>'allowed')::boolean, false) AS capability_allowed,
  facts.capability->>'reason' AS capability_reason,
  facts.group_kind,
  facts.expense_active,
  facts.group_active,
  facts.financial_version_safe,
  facts.one_off_creator_matches,
  facts.event_context_count,
  facts.group_expense_count,
  facts.claim_dispute_count,
  facts.receipts_classified,
  facts.unknown_receipt_count,
  facts.unknown_receipt_shapes,
  facts.edit_binding_count,
  facts.private_draft_count,
  facts.unconfirmed_publication_count,
  facts.repayment_count,
  facts.settlement_batch_item_count,
  facts.obligation_count,
  facts.invitation_count,
  CASE
    WHEN NOT facts.expense_exists THEN 'expense_not_found'
    WHEN NOT facts.group_exists OR NOT facts.group_active OR NOT facts.expense_active
      THEN 'not_active'
    WHEN NOT facts.financial_version_safe
      THEN 'unsafe_context:financial_version_out_of_range'
    WHEN facts.group_kind = 'one_off' AND NOT facts.one_off_creator_matches
      THEN 'unsafe_context:one_off_creator_mismatch'
    WHEN facts.group_kind = 'one_off' AND facts.event_context_count > 0
      THEN 'unsafe_context:one_off_event_context_present'
    WHEN facts.group_kind = 'one_off' AND facts.group_expense_count <> 1
      THEN 'unsafe_context:one_off_expense_count_not_one'
    WHEN facts.claim_dispute_count > 0
      THEN 'unsafe_context:claim_dispute_present'
    WHEN NOT facts.receipts_classified
      THEN 'unsafe_context:receipt_classification_failed'
    WHEN facts.edit_binding_count > 0
      THEN 'open_revision:edit_binding_present'
    WHEN facts.private_draft_count > 0
      THEN 'open_revision:private_draft_present'
    WHEN facts.group_kind = 'one_off' AND facts.unconfirmed_publication_count > 0
      THEN 'open_revision:unconfirmed_publication_present'
    WHEN facts.repayment_count > 0
      THEN 'settlement_history:repayment_present'
    WHEN facts.settlement_batch_item_count > 0
      THEN 'settlement_history:settlement_batch_item_present'
    WHEN facts.obligation_count > 0
      THEN 'settlement_history:obligation_present'
    ELSE 'none'
  END AS first_blocking_subcondition
FROM facts;
