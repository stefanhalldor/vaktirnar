-- SUPERSEDED by sql/23_relax_vote_ip_unique.sql — do NOT run for soft launch.
-- The IP unique index blocked multiple users on the same WiFi.
-- If already applied, run sql/23 to drop the index.
--
-- Original purpose: add unique index on (idea_id, ip_hash) to block duplicate
-- votes from the same IP across different browsers/devices.
--
-- IMPORTANT: Run this migration before any public traffic creates duplicate
-- (idea_id, ip_hash) rows. If duplicates already exist, the CREATE UNIQUE
-- INDEX will fail. Deduplicate first with:
--
--   DELETE FROM votes v1
--   USING votes v2
--   WHERE v1.id > v2.id
--     AND v1.idea_id = v2.idea_id
--     AND v1.ip_hash IS NOT NULL
--     AND v1.ip_hash = v2.ip_hash;
--
-- The WHERE ip_hash IS NOT NULL partial index means rows with null ip_hash
-- (e.g. from localhost / unknown IP) are not affected.

CREATE UNIQUE INDEX IF NOT EXISTS votes_idea_ip_hash_idx
  ON votes (idea_id, ip_hash)
  WHERE ip_hash IS NOT NULL;
