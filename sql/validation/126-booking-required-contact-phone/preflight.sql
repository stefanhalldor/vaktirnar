SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  pg_catalog.to_regclass('public.booking_requests') IS NOT NULL AS booking_requests_ok,
  pg_catalog.to_regprocedure('public.booking_require_contact_phone()') IS NULL AS migration_slot_clear,
  pg_catalog.to_regclass('public.booking_requests') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.booking_require_contact_phone()') IS NULL
    AS prerequisites_ok;
