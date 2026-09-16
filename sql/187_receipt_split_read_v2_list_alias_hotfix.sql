-- SQL187: disambiguate the split table alias in the v2 list branch.
-- Stebbi runs only after the matching preflight returns READY.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = '';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
    OR to_regclass('receipt_split.item_dismissals') IS NULL
    OR to_regprocedure('public.receipt_split_read_v2(uuid,uuid)') IS NULL
    OR pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure)
       NOT LIKE '%FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id=s.id%'
    OR pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure)
       LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%'
  THEN RAISE EXCEPTION 'SQL187 prerequisite mismatch; stop'; END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.receipt_split_read_v2(p_actor_id uuid,p_split_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE s receipt_split.splits%ROWTYPE; result jsonb; self_token uuid;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_split_id IS NULL THEN
    SELECT coalesce(jsonb_agg(x.row ORDER BY x.created_at DESC),'[]'::jsonb) INTO result FROM (
      SELECT jsonb_build_object('id',split_row.id,'title',split_row.title,'state',split_row.state,'incurredOn',split_row.incurred_on) row,split_row.created_at
      FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id
      WHERE m.user_id=p_actor_id AND split_row.state<>'deleted'
        AND (split_row.state<>'deleting' OR split_row.owner_id=p_actor_id)
      ORDER BY split_row.created_at DESC LIMIT 100
    ) x;
    RETURN result;
  END IF;
  SELECT * INTO s FROM receipt_split.splits WHERE id=p_split_id AND state<>'deleted';
  IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
  SELECT token INTO self_token FROM receipt_split.members WHERE split_id=p_split_id AND user_id=p_actor_id;
  IF self_token IS NULL THEN RAISE EXCEPTION 'split_not_found'; END IF;
  IF s.state='deleting' AND s.owner_id<>p_actor_id THEN RAISE EXCEPTION 'split_not_found'; END IF;
  RETURN jsonb_build_object(
    'contractVersion',2,'quantityScale',3000,'sourceContractVersion',s.contract_version,
    'id',s.id,'state',s.state,'version',s.version,'title',s.title,'currency',s.currency,
    'incurredOn',s.incurred_on,'receiptTotalMinor',s.total_minor,'isOwner',s.owner_id=p_actor_id,'reviewSaved',s.review_saved,
    'imageAvailable',s.image_path IS NOT NULL AND NOT s.image_deleted AND NOT s.image_deleting AND s.state<>'deleting',
    'deleteScope',CASE WHEN s.owner_id=p_actor_id THEN CASE WHEN s.state='deleting' THEN 'split' WHEN s.image_deleting THEN 'image' END END,
    'inviteToken',CASE WHEN s.owner_id=p_actor_id AND s.state='sharing' AND s.invite_expires_at>now() THEN s.invite_token END,
    'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('token',m.token,'name',m.display_name,'isSelf',m.user_id=p_actor_id) ORDER BY m.token),'[]'::jsonb)
      FROM receipt_split.members m WHERE m.split_id=s.id),
    'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'description',i.description,'quantityUnits',coalesce(i.quantity_units,i.quantity_milli*3),
        'itemRevision',i.item_revision,'originalDescription',coalesce(i.original_description,i.description),
        'explanation',i.explanation,'explanationNeedsReview',i.explanation_needs_review,'totalMinor',i.total_minor) ORDER BY i.ordinal),'[]'::jsonb)
      FROM receipt_split.items i WHERE i.split_id=s.id),
    'claims',(SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',c.item_id,'memberToken',c.member_token,'quantityUnits',coalesce(c.quantity_units,c.quantity_milli*3)) ORDER BY c.item_id,c.member_token),'[]'::jsonb)
      FROM receipt_split.claims c WHERE c.split_id=s.id),
    'dismissedItemIds',(SELECT coalesce(jsonb_agg(d.item_id ORDER BY d.item_id),'[]'::jsonb)
      FROM receipt_split.item_dismissals d WHERE d.split_id=s.id AND d.member_token=self_token)
  );
END;
$fn$;

ALTER FUNCTION public.receipt_split_read_v2(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_read_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_read_v2(uuid,uuid) TO service_role;

COMMIT;
