-- SQL188: expose owner/version metadata for owner-only list deletion controls.
-- Stebbi runs only after the matching preflight returns READY.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = '';

DO $guard$
DECLARE definition text; replacement text;
BEGIN
  IF current_user <> 'postgres' OR to_regprocedure('public.receipt_split_read_v2(uuid,uuid)') IS NULL
    THEN RAISE EXCEPTION 'SQL188 prerequisite mismatch; stop'; END IF;
  definition:=pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure);
  IF definition NOT LIKE '%FROM receipt_split.splits split_row JOIN receipt_split.members m ON m.split_id=split_row.id%'
    OR definition NOT LIKE '%''state'',split_row.state,''incurredOn'',split_row.incurred_on%'
    OR definition LIKE '%''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id%'
    THEN RAISE EXCEPTION 'SQL188 prerequisite mismatch; stop'; END IF;
  replacement:=replace(definition,
    '''state'',split_row.state,''incurredOn'',split_row.incurred_on',
    '''state'',split_row.state,''incurredOn'',split_row.incurred_on,''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id');
  IF replacement=definition THEN RAISE EXCEPTION 'SQL188 replacement failed; stop'; END IF;
  EXECUTE replacement;
END;
$guard$;

ALTER FUNCTION public.receipt_split_read_v2(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_read_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_read_v2(uuid,uuid) TO service_role;
COMMIT;
