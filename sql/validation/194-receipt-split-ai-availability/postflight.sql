-- SQL194 POSTFLIGHT: read-only body/security seal and authenticated availability smoke.
BEGIN TRANSACTION READ ONLY;
DO $probe$
DECLARE
  v_body_ok boolean;
  v_security_ok boolean;
  v_actor uuid;
  v_result jsonb;
BEGIN
  SELECT md5(replace(prosrc, E'\r\n', E'\n')) = 'c7aa3ea202f1610bf430d9f5da85d148',
    prosecdef AND provolatile = 's' AND proowner = 'postgres'::regrole
      AND proconfig = ARRAY['search_path=""']::text[]
      AND NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
      AND has_function_privilege('service_role', oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE')
  INTO v_body_ok, v_security_ok FROM pg_proc
  WHERE oid = to_regprocedure('public.receipt_split_ai_availability_v1(uuid,integer,integer,integer)');
  IF NOT coalesce(v_body_ok AND v_security_ok, false) THEN
    RAISE EXCEPTION 'SQL194_POSTFLIGHT_DRIFT';
  END IF;
  BEGIN
    PERFORM public.receipt_split_ai_availability_v1(NULL, 1, 100, 5);
    RAISE EXCEPTION 'SQL194_INVALID_ACTOR_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'split_not_allowed' THEN RAISE; END IF;
  END;
  SELECT id INTO v_actor FROM auth.users
  WHERE email IS NOT NULL AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL
    AND (banned_until IS NULL OR banned_until <= now()) LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'SQL194_NO_VERIFIED_ACTOR_FOR_READ_PROBE'; END IF;
  v_result := public.receipt_split_ai_availability_v1(v_actor, 1, 100, 5);
  IF v_result IS NULL OR v_result NOT IN ('"available"'::jsonb, '"daily"'::jsonb, '"capacity"'::jsonb, '"burst"'::jsonb) THEN
    RAISE EXCEPTION 'SQL194_INVALID_RESULT';
  END IF;
  BEGIN
    PERFORM public.receipt_split_ai_availability_v1(v_actor, NULL, 100, 5);
    RAISE EXCEPTION 'SQL194_INVALID_LIMIT_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'receipt_ai_quota_invalid' THEN RAISE; END IF;
  END;
END;
$probe$;
SELECT 'PASS' AS gate, true AS body_ok, true AS function_security_ok,
  true AS read_only_probe_ok, true AS invalid_inputs_rejected;
COMMIT;
