-- SQL185: daily receipt-AI cost quota and admin-managed user exemptions.
-- Stebbi runs this only after sql/validation/185-receipt-split-ai-quota/preflight.sql returns READY.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = '';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
    OR to_regprocedure('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)') IS NULL
    OR to_regclass('receipt_split.splits') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'receipt_split.splits'::regclass AND attname = 'contract_version'
        AND NOT attisdropped
    )
    OR to_regclass('receipt_split.ai_usage') IS NOT NULL
    OR to_regclass('receipt_split.ai_quota_exemptions') IS NOT NULL
    OR to_regprocedure('public.receipt_split_reserve_ai_v1(uuid,uuid,date,integer,integer,integer)') IS NOT NULL
    OR to_regprocedure('public.receipt_split_finish_ai_v1(uuid,uuid)') IS NOT NULL
    OR to_regprocedure('public.receipt_split_admin_list_ai_exemptions_v1()') IS NOT NULL
    OR to_regprocedure('public.receipt_split_admin_set_ai_exemption_v1(uuid,text,boolean,text)') IS NOT NULL
  THEN RAISE EXCEPTION 'SQL185 prerequisite mismatch; stop'; END IF;
END;
$guard$;

CREATE TABLE receipt_split.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  split_id uuid NOT NULL REFERENCES receipt_split.splits(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  CONSTRAINT ai_usage_split_unique UNIQUE (split_id),
  CONSTRAINT ai_usage_finished_order CHECK (finished_at IS NULL OR finished_at >= reserved_at)
);
CREATE INDEX ai_usage_user_day_idx ON receipt_split.ai_usage(user_id, usage_date);
CREATE INDEX ai_usage_day_idx ON receipt_split.ai_usage(usage_date);
CREATE INDEX ai_usage_active_idx ON receipt_split.ai_usage(user_id, reserved_at) WHERE finished_at IS NULL;
ALTER TABLE receipt_split.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.ai_usage FORCE ROW LEVEL SECURITY;
REVOKE ALL ON receipt_split.ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON receipt_split.ai_usage TO service_role;

CREATE TABLE receipt_split.ai_quota_exemptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 240),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE receipt_split.ai_quota_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.ai_quota_exemptions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON receipt_split.ai_quota_exemptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON receipt_split.ai_quota_exemptions TO service_role;

CREATE FUNCTION public.receipt_split_reserve_ai_v1(
  p_actor_id uuid, p_split_id uuid, p_reykjavik_date date,
  p_user_daily_limit integer, p_global_daily_limit integer, p_exempt_minute_limit integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_exempt boolean;
  v_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_split_id IS NULL
    OR p_reykjavik_date IS DISTINCT FROM (v_now AT TIME ZONE 'Atlantic/Reykjavik')::date
    OR p_user_daily_limit NOT BETWEEN 1 AND 10
    OR p_global_daily_limit NOT BETWEEN 1 AND 10000
    OR p_exempt_minute_limit NOT BETWEEN 1 AND 20
  THEN RAISE EXCEPTION 'receipt_ai_quota_invalid'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('receipt-ai:' || p_reykjavik_date::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM receipt_split.splits
    WHERE id = p_split_id AND owner_id = p_actor_id AND state = 'extracting'
  ) THEN RAISE EXCEPTION 'split_not_found'; END IF;

  SELECT id INTO v_id FROM receipt_split.ai_usage WHERE split_id = p_split_id;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'replay', 'exempt', false, 'reservationId', v_id);
  END IF;

  SELECT coalesce(enabled, false) INTO v_exempt
  FROM receipt_split.ai_quota_exemptions WHERE user_id = p_actor_id;
  v_exempt := coalesce(v_exempt, false);

  IF (SELECT count(*) FROM receipt_split.ai_usage WHERE usage_date = p_reykjavik_date) >= p_global_daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'capacity', 'exempt', v_exempt, 'reservationId', NULL);
  END IF;
  IF NOT v_exempt AND (SELECT count(*) FROM receipt_split.ai_usage WHERE user_id = p_actor_id AND usage_date = p_reykjavik_date) >= p_user_daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily', 'exempt', false, 'reservationId', NULL);
  END IF;
  IF v_exempt AND EXISTS (
    SELECT 1 FROM receipt_split.ai_usage
    WHERE user_id = p_actor_id AND finished_at IS NULL AND reserved_at > v_now - interval '2 minutes'
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'burst', 'exempt', true, 'reservationId', NULL);
  END IF;
  IF v_exempt AND (SELECT count(*) FROM receipt_split.ai_usage WHERE user_id = p_actor_id AND reserved_at > v_now - interval '1 minute') >= p_exempt_minute_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'burst', 'exempt', true, 'reservationId', NULL);
  END IF;

  INSERT INTO receipt_split.ai_usage(user_id, split_id, usage_date, reserved_at)
  VALUES (p_actor_id, p_split_id, p_reykjavik_date, v_now) RETURNING id INTO v_id;
  RETURN jsonb_build_object('allowed', true, 'reason', 'reserved', 'exempt', v_exempt, 'reservationId', v_id);
END;
$fn$;

CREATE FUNCTION public.receipt_split_finish_ai_v1(p_actor_id uuid, p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  UPDATE receipt_split.ai_usage SET finished_at = coalesce(finished_at, clock_timestamp())
  WHERE id = p_reservation_id AND user_id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_ai_quota_not_found'; END IF;
END;
$fn$;

CREATE FUNCTION public.receipt_split_admin_list_ai_exemptions_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'userId', e.user_id, 'email', lower(u.email), 'enabled', e.enabled,
    'note', e.note, 'updatedAt', e.updated_at
  ) ORDER BY lower(u.email)), '[]'::jsonb)
  FROM receipt_split.ai_quota_exemptions e
  JOIN auth.users u ON u.id = e.user_id
  WHERE e.enabled AND u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL;
$fn$;

CREATE FUNCTION public.receipt_split_admin_set_ai_exemption_v1(
  p_admin_actor_id uuid, p_email text, p_enabled boolean, p_note text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user auth.users%ROWTYPE; v_row receipt_split.ai_quota_exemptions%ROWTYPE;
BEGIN
  IF p_admin_actor_id IS NULL OR p_enabled IS NULL OR length(coalesce(p_note,'')) > 240
    OR lower(btrim(coalesce(p_email,''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_admin_actor_id)
  THEN RAISE EXCEPTION 'receipt_ai_admin_invalid'; END IF;
  SELECT * INTO v_user FROM auth.users
  WHERE lower(email) = lower(btrim(p_email)) AND email_confirmed_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_ai_user_not_found'; END IF;
  INSERT INTO receipt_split.ai_quota_exemptions(user_id, enabled, note, updated_by)
  VALUES(v_user.id, p_enabled, btrim(coalesce(p_note,'')), p_admin_actor_id)
  ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, note = excluded.note,
    updated_by = excluded.updated_by, updated_at = now()
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('userId',v_row.user_id,'email',lower(v_user.email),
    'enabled',v_row.enabled,'note',v_row.note,'updatedAt',v_row.updated_at);
END;
$fn$;

REVOKE ALL ON FUNCTION public.receipt_split_reserve_ai_v1(uuid,uuid,date,integer,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_split_finish_ai_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_split_admin_list_ai_exemptions_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receipt_split_admin_set_ai_exemption_v1(uuid,text,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receipt_split_reserve_ai_v1(uuid,uuid,date,integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_finish_ai_v1(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_admin_list_ai_exemptions_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_admin_set_ai_exemption_v1(uuid,text,boolean,text) TO service_role;

COMMENT ON TABLE receipt_split.ai_usage IS 'SQL185: charged provider-attempt reservations by Reykjavik day.';
COMMENT ON TABLE receipt_split.ai_quota_exemptions IS 'SQL185: admin-managed user exemptions; global and burst caps still apply.';
COMMIT;
