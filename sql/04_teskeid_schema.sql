-- Teskeið schema — idempotent migration
-- Run in Supabase SQL editor or via CLI

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

DO $$
BEGIN
  CREATE TYPE idea_category AS ENUM (
    'Heimili',
    'Börn',
    'Pör',
    'Umönnun',
    'Útgjöld',
    'Lánað og skilað',
    'Viðburðir',
    'Minningar',
    'Vaktir og skipulag',
    'Annað'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE idea_status AS ENUM (
    'idea',
    'reviewing',
    'planned',
    'building',
    'launched',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE idea_source AS ENUM (
    'seed',
    'user-submitted',
    'imported-from-vaktirnar'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE submission_status AS ENUM (
    'pending',
    'approved',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS ideas (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT        NOT NULL CHECK (char_length(title) <= 200),
  slug                TEXT        NOT NULL UNIQUE CHECK (char_length(slug) <= 200),
  short_description   TEXT        NOT NULL CHECK (char_length(short_description) <= 500),
  problem_description TEXT        CHECK (char_length(problem_description) <= 2000),
  possible_solution   TEXT        CHECK (char_length(possible_solution) <= 2000),
  category            idea_category NOT NULL DEFAULT 'Annað',
  status              idea_status   NOT NULL DEFAULT 'idea',
  source              idea_source   NOT NULL DEFAULT 'seed',
  votes_count         INTEGER     NOT NULL DEFAULT 0,
  followers_count     INTEGER     NOT NULL DEFAULT 0,
  is_public           BOOLEAN     NOT NULL DEFAULT true,
  is_featured         BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_description TEXT              NOT NULL CHECK (char_length(problem_description) <= 2000),
  current_solution    TEXT              CHECK (char_length(current_solution) <= 2000),
  dream_solution      TEXT              CHECK (char_length(dream_solution) <= 2000),
  category            idea_category,
  allow_publication   TEXT              NOT NULL DEFAULT 'anonymous'
                        CHECK (allow_publication IN ('yes', 'no', 'anonymous')),
  name                TEXT              CHECK (char_length(name) <= 200),
  email               TEXT              CHECK (char_length(email) <= 320),
  status              submission_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS votes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id      UUID        NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  voter_token  TEXT        NOT NULL CHECK (char_length(voter_token) <= 100),
  ip_hash      TEXT        CHECK (char_length(ip_hash) <= 128),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idea_id, voter_token)
);

CREATE TABLE IF NOT EXISTS followers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id    UUID        NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL CHECK (char_length(email) <= 320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idea_id, email)
);

-- Case-insensitive unique index on email per idea
CREATE UNIQUE INDEX IF NOT EXISTS followers_idea_lower_email_idx
  ON followers (idea_id, lower(email));

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at on ideas
CREATE OR REPLACE FUNCTION teskeid_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ideas_updated_at ON ideas;
CREATE TRIGGER ideas_updated_at
  BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION teskeid_set_updated_at();

-- votes_count on ideas
CREATE OR REPLACE FUNCTION teskeid_update_votes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ideas SET votes_count = votes_count + 1 WHERE id = NEW.idea_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ideas SET votes_count = GREATEST(votes_count - 1, 0) WHERE id = OLD.idea_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS votes_count_trigger ON votes;
CREATE TRIGGER votes_count_trigger
  AFTER INSERT OR DELETE ON votes
  FOR EACH ROW EXECUTE FUNCTION teskeid_update_votes_count();

-- followers_count on ideas
CREATE OR REPLACE FUNCTION teskeid_update_followers_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ideas SET followers_count = followers_count + 1 WHERE id = NEW.idea_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ideas SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.idea_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS followers_count_trigger ON followers;
CREATE TRIGGER followers_count_trigger
  AFTER INSERT OR DELETE ON followers
  FOR EACH ROW EXECUTE FUNCTION teskeid_update_followers_count();

-- ============================================================
-- ENABLE RLS
-- ============================================================

ALTER TABLE ideas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE followers   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ideas: public read of public ideas only
DROP POLICY IF EXISTS "ideas_public_select" ON ideas;
CREATE POLICY "ideas_public_select" ON ideas
  FOR SELECT TO anon, authenticated
  USING (is_public = true);

-- submissions: public insert only, no select; status must be pending
DROP POLICY IF EXISTS "submissions_public_insert" ON submissions;
CREATE POLICY "submissions_public_insert" ON submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');

-- votes: public insert only on public ideas, no select
DROP POLICY IF EXISTS "votes_public_insert" ON votes;
CREATE POLICY "votes_public_insert" ON votes
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ideas
      WHERE ideas.id = idea_id
        AND ideas.is_public = true
    )
  );

-- followers: public insert only on public ideas, no select
DROP POLICY IF EXISTS "followers_public_insert" ON followers;
CREATE POLICY "followers_public_insert" ON followers
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ideas
      WHERE ideas.id = idea_id
        AND ideas.is_public = true
    )
  );

-- ============================================================
-- EXPLICIT GRANTS
-- ============================================================

-- Revoke any broader privileges before re-granting narrowly
REVOKE ALL ON ideas       FROM anon, authenticated;
REVOKE ALL ON submissions FROM anon, authenticated;
REVOKE ALL ON votes       FROM anon, authenticated;
REVOKE ALL ON followers   FROM anon, authenticated;

-- ideas: public read only
GRANT SELECT ON ideas TO anon, authenticated;

-- submissions: public insert only (no SELECT, UPDATE, DELETE)
GRANT INSERT ON submissions TO anon, authenticated;

-- votes: public insert only (no SELECT, UPDATE, DELETE)
GRANT INSERT ON votes TO anon, authenticated;

-- followers: public insert only (no SELECT, UPDATE, DELETE)
GRANT INSERT ON followers TO anon, authenticated;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS ideas_slug_idx      ON ideas (slug);
CREATE INDEX IF NOT EXISTS ideas_category_idx  ON ideas (category);
CREATE INDEX IF NOT EXISTS ideas_is_public_idx ON ideas (is_public) WHERE is_public = true;

CREATE INDEX IF NOT EXISTS votes_idea_id_idx             ON votes (idea_id);
CREATE INDEX IF NOT EXISTS votes_idea_voter_token_idx    ON votes (idea_id, voter_token);

CREATE INDEX IF NOT EXISTS followers_idea_id_idx         ON followers (idea_id);
