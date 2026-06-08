-- Migration 42: IP-based OTP request rate-limit table and RPC
--
-- Stores HMAC-derived IP hashes (never raw IPs) keyed by rolling daily window.
-- The RPC is callable by service_role only; anon/authenticated have no access.
-- Stale rows are cleaned up inside the RPC (bounded DELETE, at most 100 rows
-- per call) so the table self-limits under sustained abuse.
--
-- Rollback: DROP FUNCTION public.check_and_increment_ip_rate_limit(TEXT,DATE,INT);
--           DROP TABLE public.otp_ip_rate_limit;

BEGIN;

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.otp_ip_rate_limit (
  ip_hash       TEXT        NOT NULL,
  window_date   DATE        NOT NULL,
  request_count INT         NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, window_date)
);

-- Index on window_date alone for the bounded cleanup scan in the RPC.
CREATE INDEX IF NOT EXISTS otp_ip_rate_limit_window_date_idx
  ON public.otp_ip_rate_limit (window_date);

-- RLS on: anon/authenticated clients have no access (no policies defined).
-- service_role bypasses RLS regardless of policies.
ALTER TABLE public.otp_ip_rate_limit ENABLE ROW LEVEL SECURITY;

-- ── RPC ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_and_increment_ip_rate_limit(
  p_ip_hash      TEXT,
  p_window_date  DATE,
  p_max_requests INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Insert for new (ip_hash, window_date) pair, or increment count for existing.
  INSERT INTO public.otp_ip_rate_limit (ip_hash, window_date, request_count, updated_at)
  VALUES (p_ip_hash, p_window_date, 1, now())
  ON CONFLICT (ip_hash, window_date) DO UPDATE
    SET request_count = public.otp_ip_rate_limit.request_count + 1,
        updated_at    = now()
  RETURNING request_count INTO v_count;

  -- Bounded cleanup: remove at most 100 stale rows (yesterday or older).
  -- Uses the window_date index so no full-table scan occurs.
  DELETE FROM public.otp_ip_rate_limit
  WHERE ctid IN (
    SELECT ctid
    FROM   public.otp_ip_rate_limit
    WHERE  window_date < p_window_date - INTERVAL '1 day'
    LIMIT  100
  );

  RETURN v_count <= p_max_requests;
END;
$$;

-- Restrict function execution to service_role only.
-- Explicit revokes from anon and authenticated match the pattern in sql/38.
REVOKE EXECUTE ON FUNCTION public.check_and_increment_ip_rate_limit(TEXT, DATE, INT)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_and_increment_ip_rate_limit(TEXT, DATE, INT)
  TO service_role;

-- Table access: service_role only.
REVOKE ALL ON public.otp_ip_rate_limit FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.otp_ip_rate_limit TO service_role;

COMMIT;
