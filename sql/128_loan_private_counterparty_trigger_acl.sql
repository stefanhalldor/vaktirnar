-- SQL128: remove the unnecessary direct service-role grant from SQL127's
-- trigger-only function. Trigger execution itself does not require callers to
-- retain EXECUTE on the trigger function after the trigger has been created.

BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.loan_clear_private_counterparty_name_on_invitation()'
  ) IS NULL THEN
    RAISE EXCEPTION 'missing_sql127_trigger_function';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.loan_clear_private_counterparty_name_on_invitation()
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Recovery (manual, only if direct invocation is intentionally introduced):
-- GRANT EXECUTE ON FUNCTION
--   public.loan_clear_private_counterparty_name_on_invitation()
--   TO service_role;
