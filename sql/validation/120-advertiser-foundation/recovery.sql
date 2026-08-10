-- SQL120 advertiser-foundation recovery — DESTRUCTIVE and NOT RUN.
-- This is only an empty-beta rollback. Stebbi must inspect row counts and give
-- separate approval before running it. The feature-key union is not narrowed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $advertiser_empty_beta_recovery$
BEGIN
  IF pg_catalog.to_regclass('public.business_profiles') IS NULL
     OR pg_catalog.to_regclass('public.advertiser_creatives') IS NULL
     OR pg_catalog.to_regclass('public.advertiser_audit_events') IS NULL THEN
    RAISE EXCEPTION 'advertiser_recovery_contract_missing';
  END IF;

  IF EXISTS (SELECT 1 FROM public.business_profiles)
     OR EXISTS (SELECT 1 FROM public.advertiser_creatives)
     OR EXISTS (SELECT 1 FROM public.advertiser_audit_events) THEN
    RAISE EXCEPTION 'advertiser_recovery_non_empty';
  END IF;
END;
$advertiser_empty_beta_recovery$;

DROP TRIGGER advertiser_audit_immutable_guard
  ON public.advertiser_audit_events;

DROP FUNCTION public.advertiser_audit_immutable();
DROP FUNCTION public.advertiser_resolve_public(text);
DROP FUNCTION public.advertiser_admin_review(
  uuid, uuid, integer, text, text, uuid
);
DROP FUNCTION public.advertiser_owner_transition(
  uuid, uuid, uuid, integer, text, uuid
);
DROP FUNCTION public.advertiser_upsert_creative(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text
);
DROP FUNCTION public.advertiser_upsert_business_profile(
  uuid, uuid, uuid, integer, text, text, text, text
);
DROP FUNCTION public.advertiser_assert_owner(uuid, uuid);

DROP TABLE public.advertiser_audit_events;
DROP TABLE public.advertiser_creatives;
DROP TABLE public.business_profiles;

-- Deliberately retain 'auglysandi' in feature_access_feature_key_check.
-- Narrowing a shared feature-key union in rollback could reject surviving rows
-- or erase knowledge needed for a later safe re-apply.

COMMIT;
