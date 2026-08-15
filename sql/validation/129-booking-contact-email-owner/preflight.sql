SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  pg_catalog.to_regclass('public.booking_requests') IS NOT NULL AS booking_requests_ok,
  pg_catalog.to_regclass('public.booking_access_members') IS NOT NULL AS booking_access_members_ok,
  pg_catalog.to_regprocedure(
    'public.booking_create_request(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
  ) IS NOT NULL AS base_create_function_ok,
  pg_catalog.to_regprocedure(
    'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
  ) IS NULL AS migration_slot_clear,
  pg_catalog.to_regclass('public.booking_requests') IS NOT NULL
    AND pg_catalog.to_regclass('public.booking_access_members') IS NOT NULL
    AND pg_catalog.to_regprocedure(
      'public.booking_create_request(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
    ) IS NOT NULL
    AND pg_catalog.to_regprocedure(
      'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
    ) IS NULL
    AS prerequisites_ok;
