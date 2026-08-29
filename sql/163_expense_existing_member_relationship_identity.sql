-- SQL163: bind an existing manual Expense member through exact actor-owned Tengsl.
BEGIN;

CREATE FUNCTION public.expense_get_relationship_identity_management_v1(p_actor_id uuid, p_expense_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_group_id uuid; v_version bigint; v_members jsonb;
BEGIN
  SELECT expense.group_id, group_row.financial_version INTO v_group_id, v_version
  FROM public.expenses expense JOIN public.expense_groups group_row ON group_row.id = expense.group_id
  WHERE expense.id = p_expense_id AND expense.status = 'active' AND group_row.kind = 'one_off'
    AND group_row.status <> 'closed'
    AND public.expense_active_member_role(p_actor_id, expense.group_id) IN ('owner','admin');
  IF v_group_id IS NULL THEN RETURN NULL; END IF;
  SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'member_id', eligible.member_id, 'candidates', eligible.candidates
  ) ORDER BY eligible.member_id), '[]'::jsonb) INTO v_members
  FROM (
    SELECT member.id AS member_id, pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'relationship_id', relationship.id, 'display_name', pg_catalog.btrim(profile.display_name)
    ) ORDER BY pg_catalog.btrim(profile.display_name), relationship.id) AS candidates
    FROM public.expense_group_members member
    CROSS JOIN public.relationships relationship
    JOIN auth.users account ON account.id = relationship.counterpart_user_id
    JOIN public.profiles profile ON profile.id = relationship.counterpart_user_id
    WHERE member.group_id = v_group_id AND member.status = 'active' AND member.role <> 'owner'
      AND member.user_id IS NULL AND relationship.owner_id = p_actor_id
      AND relationship.counterpart_user_id IS NOT NULL AND relationship.counterpart_user_id <> p_actor_id
      AND pg_catalog.char_length(pg_catalog.btrim(profile.display_name)) BETWEEN 1 AND 120
      AND pg_catalog.strpos(profile.display_name, '@') = 0
      AND NOT EXISTS (SELECT 1 FROM public.teskeid_event_expense_participant_sources source
        WHERE source.group_id = v_group_id AND source.expense_id = p_expense_id
          AND source.expense_member_id = member.id)
      AND NOT EXISTS (SELECT 1 FROM public.expense_group_members represented
        WHERE represented.group_id = v_group_id AND represented.user_id = relationship.counterpart_user_id
          AND represented.status IN ('active','invited'))
    GROUP BY member.id
  ) eligible;
  RETURN pg_catalog.jsonb_build_object('expense_id', p_expense_id, 'financial_version', v_version, 'members', v_members);
END;
$function$;

CREATE FUNCTION public.expense_bind_member_relationship_identity_v1(
  p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid,
  p_relationship_id uuid, p_expected_financial_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_fingerprint text; v_replay jsonb; v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE; v_actor public.expense_group_members%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE; v_group_id uuid; v_target_user_id uuid;
  v_new_version bigint; v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_expense_id IS NULL OR p_member_id IS NULL
    OR p_relationship_id IS NULL OR p_expected_financial_version IS NULL OR p_expected_financial_version < 0
  THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object('expenseId',p_expense_id,
    'memberId',p_member_id,'relationshipId',p_relationship_id,
    'expectedFinancialVersion',p_expected_financial_version)::text);
  v_replay := public.expense_begin_request(p_actor_id,p_request_id,
    'expense_bind_member_relationship_identity_v1',v_fingerprint);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT expense.group_id INTO v_group_id FROM public.expenses expense WHERE expense.id = p_expense_id;
  SELECT * INTO v_group FROM public.expense_groups WHERE id = v_group_id FOR UPDATE;
  SELECT * INTO v_expense FROM public.expenses WHERE group_id = v_group_id AND id = p_expense_id FOR UPDATE;
  SELECT * INTO v_actor FROM public.expense_group_members WHERE group_id = v_group_id
    AND user_id = p_actor_id AND status = 'active' AND role IN ('owner','admin') FOR UPDATE;
  SELECT * INTO v_member FROM public.expense_group_members WHERE group_id = v_group_id AND id = p_member_id FOR UPDATE;
  IF v_group.id IS NULL OR v_group.kind <> 'one_off' OR v_group.status = 'closed'
    OR v_group.financial_version <> p_expected_financial_version OR v_expense.id IS NULL
    OR v_expense.status <> 'active' OR v_actor.id IS NULL OR v_member.id IS NULL
    OR v_member.status <> 'active' OR v_member.role = 'owner' OR v_member.user_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.teskeid_event_expense_participant_sources source
      WHERE source.group_id = v_group_id AND source.expense_id = p_expense_id
        AND source.expense_member_id = p_member_id)
    OR EXISTS (SELECT 1 FROM public.expense_claim_disputes dispute
      WHERE dispute.group_id = v_group_id AND dispute.status = 'disputed')
  THEN RAISE EXCEPTION 'expense_update_not_allowed'; END IF;
  SELECT relationship.counterpart_user_id INTO v_target_user_id
  FROM public.relationships relationship JOIN auth.users account ON account.id = relationship.counterpart_user_id
  WHERE relationship.id = p_relationship_id AND relationship.owner_id = p_actor_id
    AND relationship.counterpart_user_id IS NOT NULL FOR SHARE OF relationship, account;
  IF v_target_user_id IS NULL OR v_target_user_id = p_actor_id OR EXISTS (
    SELECT 1 FROM public.expense_group_members represented WHERE represented.group_id = v_group_id
      AND represented.user_id = v_target_user_id AND represented.status IN ('active','invited')
  ) THEN RAISE EXCEPTION 'expense_member_link_not_allowed'; END IF;
  v_new_version := public.expense_apply_identity_binding(p_actor_id,v_group_id,p_member_id,
    v_target_user_id,'relationship',p_relationship_id,NULL,NULL,true);
  v_result := pg_catalog.jsonb_build_object('expense_id',p_expense_id,'group_id',v_group_id,
    'member_id',p_member_id,'financial_version',v_new_version);
  PERFORM public.expense_finish_request(p_actor_id,p_request_id,v_result);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.expense_get_relationship_identity_management_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.expense_get_relationship_identity_management_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_get_relationship_identity_management_v1(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint) TO service_role;
COMMIT;
