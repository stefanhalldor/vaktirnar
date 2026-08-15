SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  pg_catalog.to_regprocedure(
    'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
  ) IS NOT NULL AS function_ok,
  pg_catalog.to_regprocedure(
    'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
  ) IS NOT NULL
    AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)',
      'EXECUTE'
    )
    AND pg_catalog.has_function_privilege(
      'service_role',
      'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)',
      'EXECUTE'
    ) AS exact_execute_acl_ok,
  pg_catalog.to_regprocedure(
    'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
  ) IS NOT NULL
    AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)',
      'EXECUTE'
    )
    AND pg_catalog.has_function_privilege(
      'service_role',
      'public.booking_create_request_for_contact_owner(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)',
      'EXECUTE'
    ) AS postconditions_ok;
