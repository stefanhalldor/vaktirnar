-- Require a contact phone on every new booking request while preserving
-- historical requests created when the field was optional.
BEGIN;

CREATE OR REPLACE FUNCTION public.booking_require_contact_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.contact_phone IS NULL
     OR NEW.contact_phone <> pg_catalog.btrim(NEW.contact_phone)
     OR pg_catalog.char_length(NEW.contact_phone) NOT BETWEEN 1 AND 40
     OR NEW.contact_phone ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'booking_invalid_input';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.booking_require_contact_phone() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.booking_require_contact_phone() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS booking_requests_require_contact_phone
  ON public.booking_requests;
CREATE TRIGGER booking_requests_require_contact_phone
BEFORE INSERT ON public.booking_requests
FOR EACH ROW
EXECUTE FUNCTION public.booking_require_contact_phone();

COMMIT;
