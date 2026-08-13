SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  pg_catalog.to_regprocedure('public.booking_require_contact_phone()') IS NOT NULL AS function_ok,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.booking_requests'::pg_catalog.regclass
      AND trigger_row.tgname = 'booking_requests_require_contact_phone'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
  ) AS trigger_ok,
  NOT pg_catalog.has_function_privilege('anon', 'public.booking_require_contact_phone()', 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', 'public.booking_require_contact_phone()', 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', 'public.booking_require_contact_phone()', 'EXECUTE')
    AS no_direct_execute_ok,
  pg_catalog.to_regprocedure('public.booking_require_contact_phone()') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid = 'public.booking_requests'::pg_catalog.regclass
        AND trigger_row.tgname = 'booking_requests_require_contact_phone'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled = 'O'
    ) AS postconditions_ok;
