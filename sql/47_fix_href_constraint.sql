BEGIN;

-- Tighten the href constraint to reject protocol-relative URLs (e.g. //evil.com).
-- Migration 46 only checked href LIKE '/%', which allows '//' prefixes.
ALTER TABLE public.recent_events
  DROP CONSTRAINT IF EXISTS recent_events_href_local,
  ADD CONSTRAINT recent_events_href_local CHECK (
    href LIKE '/%' AND href NOT LIKE '//%'
  );

COMMIT;
