-- Migration 54: create relationships, relationship_tags, relationship_sources.
--
-- Dependency: teskeid_set_updated_at() must exist (04_teskeid_schema.sql).
-- Does NOT touch the legacy 'contacts' table from sql/01_schema.sql.
-- service_role only — no authenticated or anon grants.
--
-- Rollback (in this order):
--   1. Set TENGSL_ENABLED= in env and redeploy if app code is already live.
--   2. DROP TABLE public.relationship_sources CASCADE;
--      DROP TABLE public.relationship_tags    CASCADE;
--      DROP TABLE public.relationships        CASCADE;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- relationships
-- Per-user record of a connection to another person.
-- owner_id:            the logged-in user who owns this relationship.
-- counterpart_user_id: the other party if they are a registered auth.users.
-- email_canonical:     the other party's normalised email if not yet registered,
--                      or kept alongside counterpart_user_id for lookup.
-- private_display_name: owner's private nickname — never visible to counterpart.
-- note:                owner's private note.
--
-- At least one of (counterpart_user_id, email_canonical, private_display_name)
-- must be non-null (relationships_has_identifier).
-- Partial unique indexes prevent duplicate entries per owner.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.relationships (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  counterpart_user_id   uuid        NULL     REFERENCES auth.users(id) ON DELETE SET NULL,
  email_canonical       text        NULL,
  private_display_name  text        NULL,
  note                  text        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT relationships_has_identifier CHECK (
    counterpart_user_id IS NOT NULL
    OR email_canonical   IS NOT NULL
    OR private_display_name IS NOT NULL
  ),
  CONSTRAINT relationships_not_self CHECK (
    counterpart_user_id IS NULL OR counterpart_user_id <> owner_id
  ),
  CONSTRAINT relationships_email_canonical_check CHECK (
    email_canonical IS NULL
    OR (
      email_canonical = lower(trim(email_canonical))
      AND email_canonical <> ''
      AND char_length(email_canonical) <= 320
    )
  ),
  CONSTRAINT relationships_private_display_name_check CHECK (
    private_display_name IS NULL
    OR (
      trim(private_display_name) <> ''
      AND char_length(private_display_name) <= 120
    )
  ),
  CONSTRAINT relationships_note_check CHECK (
    note IS NULL OR char_length(note) <= 1000
  )
);

-- Partial unique indexes: allow multiple local/private entries per owner
-- (those with only private_display_name), but prevent duplicates for the
-- same registered user or the same canonical email.
CREATE UNIQUE INDEX relationships_owner_counterpart_user_idx
  ON public.relationships (owner_id, counterpart_user_id)
  WHERE counterpart_user_id IS NOT NULL;

CREATE UNIQUE INDEX relationships_owner_email_canonical_idx
  ON public.relationships (owner_id, email_canonical)
  WHERE email_canonical IS NOT NULL;

CREATE TRIGGER relationships_set_updated_at
  BEFORE UPDATE ON public.relationships
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- relationship_tags
-- Tags on a relationship. v1 canonical values enforced by CHECK.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.relationship_tags (
  relationship_id  uuid NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  tag              text NOT NULL,
  PRIMARY KEY (relationship_id, tag),
  CONSTRAINT relationship_tags_tag_check
    CHECK (tag IN ('unclassified', 'family', 'friends', 'recipients'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- relationship_sources
-- Where the relationship came from. source_id is polymorphic (no FK).
-- Server code must verify source access before surfacing to the user.
-- UNIQUE on (relationship_id, source_type, source_id) for idempotency.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.relationship_sources (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id  uuid        NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  source_type      text        NOT NULL CHECK (source_type IN ('loans')),
  source_id        uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (relationship_id, source_type, source_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS and grants — service_role only
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.relationships        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.relationships        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.relationship_tags    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.relationship_sources FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationships        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationship_tags    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationship_sources TO service_role;

COMMIT;
