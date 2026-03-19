-- PlaydateSync Database Schema for Supabase

-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  edit_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'open',
  CONSTRAINT valid_status CHECK (status IN ('open', 'closed'))
);

-- Kids table
CREATE TABLE kids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster kid lookups by session
CREATE INDEX idx_kids_session_id ON kids(session_id);

-- Logs table
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
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

-- Create index for faster log lookups by session
CREATE INDEX idx_logs_session_id ON logs(session_id);
CREATE INDEX idx_logs_created_at ON logs(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (since we're handling auth with edit keys in the app layer)
CREATE POLICY "Allow all operations on sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on kids" ON kids FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on logs" ON logs FOR ALL USING (true) WITH CHECK (true);

-- Optional: Add some helpful functions

-- Function to get session with kids and logs
CREATE OR REPLACE FUNCTION get_session_data(session_id_param TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'session', (SELECT row_to_json(s.*) FROM sessions s WHERE s.id = session_id_param),
    'kids', (SELECT COALESCE(json_agg(k.*), '[]'::json) FROM kids k WHERE k.session_id = session_id_param),
    'logs', (SELECT COALESCE(json_agg(l.* ORDER BY l.created_at DESC), '[]'::json) FROM logs l WHERE l.session_id = session_id_param)
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
