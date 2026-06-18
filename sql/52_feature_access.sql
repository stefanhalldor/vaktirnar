BEGIN;

CREATE TABLE IF NOT EXISTS public.feature_access (
  feature_key text        NOT NULL,
  email       text        NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_key, email),
  CHECK (feature_key IN ('umonnun')),
  CHECK (email = lower(trim(email)) AND email <> '')
);

CREATE INDEX IF NOT EXISTS feature_access_email_idx
  ON public.feature_access (email);

ALTER TABLE public.feature_access ENABLE ROW LEVEL SECURITY;

-- No policies: service_role only
REVOKE ALL ON public.feature_access FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.feature_access TO service_role;

COMMIT;
