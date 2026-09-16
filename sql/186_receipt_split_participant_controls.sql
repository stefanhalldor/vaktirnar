-- SQL186: invite preview, participant history dates and per-member item dismissal.
-- Stebbi runs only after the matching preflight returns READY.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = '';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
    OR to_regclass('receipt_split.splits') IS NULL
    OR to_regclass('receipt_split.members') IS NULL
    OR to_regclass('receipt_split.items') IS NULL
    OR to_regclass('receipt_split.claims') IS NULL
    OR to_regclass('receipt_split.requests') IS NULL
    OR to_regclass('receipt_split.ai_usage') IS NULL
    OR to_regclass('receipt_split.ai_quota_exemptions') IS NULL
    OR to_regprocedure('public.receipt_split_read_v2(uuid,uuid)') IS NULL
    OR to_regprocedure('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)') IS NULL
    OR to_regprocedure('public.receipt_split_reserve_ai_v1(uuid,uuid,date,integer,integer,integer)') IS NULL
    OR to_regprocedure('public.receipt_split_finish_ai_v1(uuid,uuid)') IS NULL
    OR to_regclass('receipt_split.item_dismissals') IS NOT NULL
    OR to_regprocedure('public.receipt_split_invite_preview_v1(text)') IS NOT NULL
    OR to_regprocedure('public.receipt_split_set_item_dismissed_v1(uuid,uuid,uuid,uuid,boolean)') IS NOT NULL
    OR to_regprocedure('receipt_split.clear_item_dismissal_on_claim()') IS NOT NULL
  THEN RAISE EXCEPTION 'SQL186 prerequisite mismatch; stop'; END IF;
END;
$guard$;

CREATE TABLE receipt_split.item_dismissals (
  split_id uuid NOT NULL,
  item_id uuid NOT NULL,
  member_token uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (split_id,item_id,member_token),
  FOREIGN KEY (split_id,item_id) REFERENCES receipt_split.items(split_id,id) ON DELETE CASCADE,
  FOREIGN KEY (split_id,member_token) REFERENCES receipt_split.members(split_id,token) ON DELETE CASCADE
);
ALTER TABLE receipt_split.item_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.item_dismissals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON receipt_split.item_dismissals FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION receipt_split.clear_item_dismissal_on_claim()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  DELETE FROM receipt_split.item_dismissals
  WHERE split_id=NEW.split_id AND item_id=NEW.item_id AND member_token=NEW.member_token;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER claims_clear_personal_dismissal
AFTER INSERT OR UPDATE OF quantity_milli,quantity_units ON receipt_split.claims
FOR EACH ROW EXECUTE FUNCTION receipt_split.clear_item_dismissal_on_claim();

CREATE FUNCTION public.receipt_split_invite_preview_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE result jsonb;
BEGIN
  IF coalesce(p_token,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'split_not_found'; END IF;
  SELECT jsonb_build_object('title',s.title) INTO result
  FROM receipt_split.splits s
  WHERE s.invite_token=p_token AND s.state='sharing' AND s.invite_expires_at>now();
  IF result IS NULL THEN RAISE EXCEPTION 'split_not_found'; END IF;
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.receipt_split_read_v2(p_actor_id uuid,p_split_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE s receipt_split.splits%ROWTYPE; result jsonb; self_token uuid;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_split_id IS NULL THEN
    SELECT coalesce(jsonb_agg(x.row ORDER BY x.created_at DESC),'[]'::jsonb) INTO result FROM (
      SELECT jsonb_build_object('id',s.id,'title',s.title,'state',s.state,'incurredOn',s.incurred_on) row,s.created_at
      FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id=s.id
      WHERE m.user_id=p_actor_id AND s.state<>'deleted' AND (s.state<>'deleting' OR s.owner_id=p_actor_id)
      ORDER BY s.created_at DESC LIMIT 100
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

CREATE FUNCTION public.receipt_split_set_item_dismissed_v1(
  p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_item_id uuid,p_dismissed boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE s receipt_split.splits%ROWTYPE; i receipt_split.items%ROWTYPE; r receipt_split.requests%ROWTYPE;
  member uuid; used bigint; mine bigint; payload_hash bytea; result jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_split_id IS NULL OR p_item_id IS NULL OR p_dismissed IS NULL
    THEN RAISE EXCEPTION 'split_invalid'; END IF;
  payload_hash:=sha256(convert_to(jsonb_build_object('itemId',p_item_id,'dismissed',p_dismissed)::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text,0));
  SELECT * INTO r FROM receipt_split.requests WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.command<>'dismiss:v1' OR r.split_id IS DISTINCT FROM p_split_id OR r.payload_hash<>payload_hash
      THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN r.result;
  END IF;
  SELECT * INTO s FROM receipt_split.splits WHERE id=p_split_id AND state='sharing' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
  SELECT token INTO member FROM receipt_split.members WHERE split_id=s.id AND user_id=p_actor_id;
  IF member IS NULL THEN RAISE EXCEPTION 'split_not_found'; END IF;
  SELECT * INTO i FROM receipt_split.items WHERE split_id=s.id AND id=p_item_id;
  IF NOT FOUND OR i.kind<>'item' OR i.total_minor<=0 THEN RAISE EXCEPTION 'split_invalid'; END IF;
  SELECT coalesce(sum(coalesce(quantity_units,quantity_milli*3)),0),
    coalesce(max(coalesce(quantity_units,quantity_milli*3)) FILTER(WHERE member_token=member),0)
    INTO used,mine FROM receipt_split.claims WHERE split_id=s.id AND item_id=i.id;
  IF p_dismissed THEN
    IF mine<>0 OR used>=coalesce(i.quantity_units,i.quantity_milli*3) THEN RAISE EXCEPTION 'split_conflict'; END IF;
    INSERT INTO receipt_split.item_dismissals(split_id,item_id,member_token) VALUES(s.id,i.id,member)
      ON CONFLICT(split_id,item_id,member_token) DO UPDATE SET dismissed_at=now();
  ELSE
    DELETE FROM receipt_split.item_dismissals WHERE split_id=s.id AND item_id=i.id AND member_token=member;
  END IF;
  UPDATE receipt_split.splits SET version=version+1 WHERE id=s.id;
  result:=jsonb_build_object('id',s.id);
  INSERT INTO receipt_split.requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,'dismiss:v1',p_split_id,payload_hash,result);
  RETURN result;
END;
$fn$;

ALTER FUNCTION public.receipt_split_invite_preview_v1(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_invite_preview_v1(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_invite_preview_v1(text) TO service_role;
ALTER FUNCTION public.receipt_split_read_v2(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_read_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_read_v2(uuid,uuid) TO service_role;
ALTER FUNCTION public.receipt_split_set_item_dismissed_v1(uuid,uuid,uuid,uuid,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_set_item_dismissed_v1(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_set_item_dismissed_v1(uuid,uuid,uuid,uuid,boolean) TO service_role;
ALTER FUNCTION receipt_split.clear_item_dismissal_on_claim() OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.clear_item_dismissal_on_claim() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
