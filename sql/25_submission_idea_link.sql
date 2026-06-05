-- Link submissions to ideas they were converted into
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_idea_id ON submissions (idea_id);