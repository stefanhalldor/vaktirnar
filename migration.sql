-- PlaydateSync Migration to shared-prod schema
-- Target: ejrjyinnpzcmtrtfwrjl (shared-prod)
-- Schema: playdatesync

CREATE SCHEMA IF NOT EXISTS playdatesync;

-- Sessions table
CREATE TABLE IF NOT EXISTS playdatesync.sessions (
  id TEXT PRIMARY KEY,
  edit_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'open',
  CONSTRAINT valid_status CHECK (status IN ('open', 'closed'))
);

-- Kids table
CREATE TABLE IF NOT EXISTS playdatesync.kids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES playdatesync.sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster kid lookups by session
CREATE INDEX IF NOT EXISTS idx_playdatesync_kids_session_id ON playdatesync.kids(session_id);

-- Logs table
CREATE TABLE IF NOT EXISTS playdatesync.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES playdatesync.sessions(id) ON DELETE CASCADE,
  kid_ids TEXT[] NOT NULL,
  category TEXT NOT NULL,
  minutes INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_category CHECK (category IN ('screen', 'physical', 'other')),
  CONSTRAINT valid_log_status CHECK (status IN ('active', 'completed'))
);

-- Create indexes for faster log lookups
CREATE INDEX IF NOT EXISTS idx_playdatesync_logs_session_id ON playdatesync.logs(session_id);
CREATE INDEX IF NOT EXISTS idx_playdatesync_logs_created_at ON playdatesync.logs(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE playdatesync.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdatesync.kids ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdatesync.logs ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations
CREATE POLICY "Allow all operations on sessions" ON playdatesync.sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on kids" ON playdatesync.kids FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on logs" ON playdatesync.logs FOR ALL USING (true) WITH CHECK (true);

-- GRANT permissions
GRANT USAGE ON SCHEMA playdatesync TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA playdatesync TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA playdatesync TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA playdatesync
  GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA playdatesync
  GRANT ALL ON SEQUENCES TO anon, authenticated;

-- Function to get session data
CREATE OR REPLACE FUNCTION playdatesync.get_session_data(session_id_param TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'session', (SELECT row_to_json(s.*) FROM playdatesync.sessions s WHERE s.id = session_id_param),
    'kids', (SELECT COALESCE(json_agg(k.*), '[]'::json) FROM playdatesync.kids k WHERE k.session_id = session_id_param),
    'logs', (SELECT COALESCE(json_agg(l.* ORDER BY l.created_at DESC), '[]'::json) FROM playdatesync.logs l WHERE l.session_id = session_id_param)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql;
