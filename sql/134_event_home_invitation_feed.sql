-- SQL134: session-scoped Event invitations for the authenticated home feed.
-- Write locally only. Run only after an explicit production migration approval.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $block$
BEGIN
  IF pg_catalog.to_regclass('public.teskeid_event_guest_invitations') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_events') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_assert_session_actor(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_attendance_sweep_expired(integer,uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_home_feed_prerequisite_missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.recent_events'::pg_catalog.regclass
      AND constraint_row.conname = 'recent_events_source_check'
      AND constraint_row.contype = 'c'
      AND constraint_row.convalidated
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid, true) LIKE '%loans%'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid, true) LIKE '%expenses%'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid, true) NOT LIKE '%events%'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_home_feed_recent_source_drift';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.teskeid_event_list_my_pending_invitations(uuid)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'teskeid_event_home_feed_target_exists';
  END IF;
END;
$block$;

ALTER TABLE public.recent_events
  DROP CONSTRAINT recent_events_source_check;
ALTER TABLE public.recent_events
  ADD CONSTRAINT recent_events_source_check
  CHECK (source IN ('loans', 'expenses', 'events'));

CREATE FUNCTION public.teskeid_event_list_my_pending_invitations(
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_email text;
  v_result jsonb;
BEGIN
  PERFORM public.teskeid_event_assert_session_actor(p_actor_id);
  PERFORM public.teskeid_event_attendance_sweep_expired(50, NULL);

  SELECT public.normalize_email_canonical(account.email)
  INTO v_actor_email
  FROM auth.users AS account
  WHERE account.id = p_actor_id
    AND account.email_confirmed_at IS NOT NULL;
  IF v_actor_email IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_unavailable';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'invitations', COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'invitation_id', invitation.id,
        'event_name', invitation.event_name_snapshot,
        'inviter_display_name', invitation.inviter_display_name_snapshot,
        'invited_at', invitation.created_at
      ) ORDER BY invitation.created_at DESC, invitation.id DESC
    ), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT candidate.*
    FROM public.teskeid_event_guest_invitations AS candidate
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = candidate.event_id
     AND guest.id = candidate.event_guest_id
    WHERE candidate.status = 'pending'
      AND candidate.expires_at > pg_catalog.now()
      AND candidate.attempt_number > 0
      AND candidate.recipient_email_canonical = v_actor_email
      AND guest.status = 'active'
      AND (
        candidate.invitation_kind = 'identity_and_access'
        OR guest.linked_user_id = p_actor_id
      )
    ORDER BY candidate.created_at DESC, candidate.id DESC
    LIMIT 100
  ) AS invitation;

  RETURN COALESCE(v_result, pg_catalog.jsonb_build_object(
    'invitations', '[]'::jsonb
  ));
END;
$function$;

ALTER FUNCTION public.teskeid_event_list_my_pending_invitations(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.teskeid_event_list_my_pending_invitations(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teskeid_event_list_my_pending_invitations(uuid)
  TO service_role;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = function_row.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = function_row.proowner
    WHERE namespace_row.nspname = 'public'
      AND function_row.oid = pg_catalog.to_regprocedure(
        'public.teskeid_event_list_my_pending_invitations(uuid)'
      )
      AND function_row.prosecdef
      AND function_row.provolatile = 'v'
      AND function_row.proretset = false
      AND function_row.prorettype = 'jsonb'::pg_catalog.regtype
      AND pg_catalog.cardinality(COALESCE(
        function_row.proconfig, ARRAY[]::text[]
      )) = 1
      AND function_row.proconfig[1] IN ('search_path=', 'search_path=""')
      AND owner_role.rolname = 'postgres'
      AND pg_catalog.has_function_privilege(
        'service_role', function_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon', function_row.oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', function_row.oid, 'EXECUTE'
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_home_feed_attestation_failed';
  END IF;
END;
$block$;

COMMIT;
