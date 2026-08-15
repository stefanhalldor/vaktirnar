-- SQL129: make the booking form contact email the customer owner identity.
-- Written for review and manual execution only. Codex did not run this SQL.
--
-- Existing bookings are intentionally untouched. For new signed-in requests,
-- the authenticated browser user remains the audited submitter, while the
-- canonical contact email becomes the sole initial customer owner. Anonymous
-- guest/link bookings keep their existing capability-link contract.

BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.booking_requests') IS NULL
     OR pg_catalog.to_regclass('public.booking_access_members') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.booking_create_request(uuid,uuid,uuid,text,text,text,text,date,time without time zone,timestamp with time zone,text,text,date,integer)'
     ) IS NULL THEN
    RAISE EXCEPTION 'booking_sql129_prerequisites_missing';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_create_request_for_contact_owner(
  p_service_id uuid,
  p_request_id uuid,
  p_creator_user_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_contact_message text,
  p_requested_local_date date,
  p_requested_local_time time without time zone,
  p_requested_at timestamp with time zone,
  p_guest_capability_hash text,
  p_rate_limit_hash text,
  p_rate_limit_window_date date,
  p_rate_limit_max integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_booking_request_id uuid;
  v_actor_email text;
  v_contact_email text;
  v_updated_count integer;
BEGIN
  v_contact_email := public.booking_canonical_email(p_contact_email);
  IF v_contact_email IS NULL THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;

  -- The existing function remains the authoritative atomic creator for
  -- validation, rate limiting, snapshots, idempotency and event creation.
  v_result := public.booking_create_request(
    p_service_id,
    p_request_id,
    p_creator_user_id,
    p_contact_name,
    p_contact_email,
    p_contact_phone,
    p_contact_message,
    p_requested_local_date,
    p_requested_local_time,
    p_requested_at,
    p_guest_capability_hash,
    p_rate_limit_hash,
    p_rate_limit_window_date,
    p_rate_limit_max
  );

  -- Guest requests deliberately remain bearer-link bookings. Only the newly
  -- inserted signed-in row is rewritten, inside this same transaction. Exact
  -- retries return created=false and must never overwrite later membership
  -- edits made by a customer owner.
  IF p_creator_user_id IS NOT NULL
     AND COALESCE((v_result ->> 'created')::boolean, false) THEN
    SELECT public.booking_canonical_email(auth_user.email)
      INTO v_actor_email
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_creator_user_id
      AND auth_user.email_confirmed_at IS NOT NULL;

    IF v_actor_email IS NULL THEN
      RAISE EXCEPTION 'booking_invalid_input';
    END IF;

    v_booking_request_id := (v_result ->> 'id')::uuid;

    UPDATE public.booking_access_members AS member
    SET canonical_email = v_contact_email,
        user_id = CASE
          WHEN v_contact_email = v_actor_email THEN p_creator_user_id
          ELSE NULL
        END
    WHERE member.booking_request_id = v_booking_request_id
      AND member.canonical_email = v_actor_email
      AND member.role = 'owner'
      AND member.status = 'active'
      AND member.added_by_user_id = p_creator_user_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'booking_save_failed';
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.booking_create_request_for_contact_owner(
  uuid,uuid,uuid,text,text,text,text,date,time without time zone,
  timestamp with time zone,text,text,date,integer
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.booking_create_request_for_contact_owner(
  uuid,uuid,uuid,text,text,text,text,date,time without time zone,
  timestamp with time zone,text,text,date,integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.booking_create_request_for_contact_owner(
  uuid,uuid,uuid,text,text,text,text,date,time without time zone,
  timestamp with time zone,text,text,date,integer
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Recovery: point the application back to booking_create_request. This
-- migration is additive and does not rewrite existing booking data.
