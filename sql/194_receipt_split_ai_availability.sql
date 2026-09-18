-- SQL194 MIGRATION: read-only receipt AI availability; no quota reservation or business-row changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
    OR to_regclass('receipt_split.ai_usage') IS NULL
    OR to_regclass('receipt_split.ai_quota_exemptions') IS NULL
    OR to_regprocedure('receipt_split.assert_actor(uuid)') IS NULL
    OR to_regprocedure('public.receipt_split_reserve_ai_v1(uuid,uuid,date,integer,integer,integer)') IS NULL
    OR to_regprocedure('public.receipt_split_ai_availability_v1(uuid,integer,integer,integer)') IS NOT NULL
  THEN RAISE EXCEPTION 'SQL194 prerequisite mismatch; stop'; END IF;
END;
$guard$;

CREATE FUNCTION public.receipt_split_ai_availability_v1(
  p_actor_id uuid, p_user_daily_limit integer,
  p_global_daily_limit integer, p_exempt_minute_limit integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_date date := (v_now AT TIME ZONE 'Atlantic/Reykjavik')::date;
  v_exempt boolean;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_user_daily_limit IS NULL OR p_user_daily_limit NOT BETWEEN 1 AND 10
    OR p_global_daily_limit IS NULL OR p_global_daily_limit NOT BETWEEN 1 AND 10000
    OR p_exempt_minute_limit IS NULL OR p_exempt_minute_limit NOT BETWEEN 1 AND 20
  THEN RAISE EXCEPTION 'receipt_ai_quota_invalid'; END IF;

  SELECT coalesce(enabled, false) INTO v_exempt
  FROM receipt_split.ai_quota_exemptions WHERE user_id = p_actor_id;
  v_exempt := coalesce(v_exempt, false);

  IF (SELECT count(*) FROM receipt_split.ai_usage WHERE usage_date = v_date) >= p_global_daily_limit THEN
    RETURN to_jsonb('capacity'::text);
  END IF;
  IF NOT v_exempt AND (SELECT count(*) FROM receipt_split.ai_usage WHERE user_id = p_actor_id AND usage_date = v_date) >= p_user_daily_limit THEN
    RETURN to_jsonb('daily'::text);
  END IF;
  IF v_exempt AND EXISTS (
    SELECT 1 FROM receipt_split.ai_usage
    WHERE user_id = p_actor_id AND finished_at IS NULL AND reserved_at > v_now - interval '2 minutes'
  ) THEN
    RETURN to_jsonb('burst'::text);
  END IF;
  IF v_exempt AND (SELECT count(*) FROM receipt_split.ai_usage WHERE user_id = p_actor_id AND reserved_at > v_now - interval '1 minute') >= p_exempt_minute_limit THEN
    RETURN to_jsonb('burst'::text);
  END IF;
  RETURN to_jsonb('available'::text);
END;
$fn$;

REVOKE ALL ON FUNCTION public.receipt_split_ai_availability_v1(uuid,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receipt_split_ai_availability_v1(uuid,integer,integer,integer) TO service_role;
COMMENT ON FUNCTION public.receipt_split_ai_availability_v1(uuid,integer,integer,integer)
  IS 'SQL194: advisory read only; SQL185 atomic reservation remains authoritative.';
NOTIFY pgrst, 'reload schema';
COMMIT;
