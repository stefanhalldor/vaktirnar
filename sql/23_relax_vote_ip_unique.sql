-- Relax voting: remove IP-based unique constraint.
--
-- The per-IP uniqueness blocked multiple people on the same WiFi from
-- voting for the same idea. For soft launch, cookie-based dedup
-- (UNIQUE on idea_id, voter_token) is sufficient.
--
-- ip_hash is still stored for audit/future rate limiting but is no
-- longer used as a uniqueness constraint.
--
-- Run this migration if sql/22_harden_votes.sql was already applied.

DROP INDEX IF EXISTS votes_idea_ip_hash_idx;
