-- Analytics events table for internal usage tracking.
-- No raw IPs, no raw user agents, no emails stored.
-- visitor_hash = HMAC(VOTE_SECRET, teskeid_voter_id cookie) — same hash as votes.
-- All inserts happen server-side via getAdmin() (service role). No public INSERT grant.

CREATE TABLE IF NOT EXISTS analytics_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_hash  TEXT        NOT NULL CHECK (char_length(visitor_hash) <= 128),
  event_type    TEXT        NOT NULL CHECK (event_type IN (
    'page_view', 'vote', 'follow', 'submit'
  )),
  path          TEXT        NOT NULL CHECK (char_length(path) <= 500),
  idea_id       UUID        REFERENCES ideas(id) ON DELETE SET NULL,
  referrer      TEXT        CHECK (char_length(referrer) <= 500),
  device_type   TEXT        CHECK (device_type IN ('mobile', 'tablet', 'desktop')),
  browser       TEXT        CHECK (char_length(browser) <= 100),
  country       TEXT        CHECK (char_length(country) <= 2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ae_created  ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS idx_ae_idea     ON analytics_events (idea_id) WHERE idea_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ae_type     ON analytics_events (event_type);
CREATE INDEX IF NOT EXISTS idx_ae_visitor  ON analytics_events (visitor_hash, idea_id);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
-- No public access — API route inserts via getAdmin() (service role)
REVOKE ALL ON analytics_events FROM anon, authenticated;
