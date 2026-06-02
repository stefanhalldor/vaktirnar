-- Remove "Vaktaskipting" idea from production.
-- Safe: votes and followers reference ideas with ON DELETE CASCADE.
-- Idempotent: DELETE WHERE is a no-op if the row is already gone.

DELETE FROM ideas
WHERE slug = 'vaktaskipting';
