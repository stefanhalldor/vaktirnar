-- ============================================================
-- Út að leika / PlaydateSync — New Dedicated Supabase Schema
-- Run this on a fresh Supabase project (public schema)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES (linked to auth.users)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. CHILDREN
-- ============================================================
CREATE TABLE children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  birth_year INTEGER,
  avatar_emoji TEXT NOT NULL DEFAULT '🧒',
  current_custodial_parent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. PARENT_CHILD (junction)
-- ============================================================
CREATE TABLE parent_child (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'coparent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, child_id)
);

-- ============================================================
-- 4. CUSTODY_SCHEDULE (weekly plan — not used in MVP)
-- ============================================================
CREATE TABLE custody_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  UNIQUE (child_id, day_of_week)
);

-- ============================================================
-- 5. INVITE_CODES
-- ============================================================
CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id),
  UNIQUE (code)
);

-- ============================================================
-- 6. CONTACTS
-- ============================================================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_a_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  child_b_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_a_id, child_b_id)
);

-- ============================================================
-- 7. CHATS (ephemeral playdate conversations)
-- ============================================================
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_a_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  child_b_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. MESSAGES
-- ============================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'activity', 'system')),
  activity_category TEXT CHECK (activity_category IN ('screen', 'physical', 'other')),
  activity_minutes INTEGER,
  activity_child_ids UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. PUSH_SUBSCRIPTIONS
-- ============================================================
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endpoint)
);

-- ============================================================
-- DB FUNCTION: get_custodial_parent
-- ============================================================
CREATE OR REPLACE FUNCTION get_custodial_parent(p_child_id UUID)
RETURNS UUID AS $$
DECLARE
  v_override UUID;
  v_scheduled UUID;
  v_primary UUID;
BEGIN
  -- 1. Manual override
  SELECT current_custodial_parent_id INTO v_override
  FROM children WHERE id = p_child_id;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;

  -- 2. Weekly schedule (EXTRACT(DOW ...) returns 0=Sunday, 6=Saturday)
  SELECT parent_id INTO v_scheduled
  FROM custody_schedule
  WHERE child_id = p_child_id
    AND day_of_week = EXTRACT(DOW FROM NOW())::INTEGER;
  IF v_scheduled IS NOT NULL THEN RETURN v_scheduled; END IF;

  -- 3. Fallback: primary parent
  SELECT parent_id INTO v_primary
  FROM parent_child WHERE child_id = p_child_id AND role = 'primary'
  LIMIT 1;
  RETURN v_primary;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_child ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Profiles: read all, write own
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Children: parents can see and update their children
CREATE POLICY "children_select" ON children FOR SELECT TO authenticated
  USING (id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid()));
CREATE POLICY "children_insert" ON children FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "children_update" ON children FOR UPDATE TO authenticated
  USING (id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid()));
CREATE POLICY "children_delete" ON children FOR DELETE TO authenticated
  USING (id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid()));

-- Parent_child: own rows
CREATE POLICY "parent_child_select" ON parent_child FOR SELECT TO authenticated USING (parent_id = auth.uid());
CREATE POLICY "parent_child_insert" ON parent_child FOR INSERT TO authenticated WITH CHECK (parent_id = auth.uid());
CREATE POLICY "parent_child_delete" ON parent_child FOR DELETE TO authenticated USING (parent_id = auth.uid());

-- Invite codes: see codes for your children
CREATE POLICY "invite_codes_select" ON invite_codes FOR SELECT TO authenticated
  USING (child_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
         OR created_by = auth.uid());
CREATE POLICY "invite_codes_insert" ON invite_codes FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "invite_codes_upsert" ON invite_codes FOR UPDATE TO authenticated USING (created_by = auth.uid());

-- Contacts: see contacts involving your children
CREATE POLICY "contacts_select" ON contacts FOR SELECT TO authenticated
  USING (
    child_a_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
    OR child_b_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
  );
CREATE POLICY "contacts_insert" ON contacts FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "contacts_delete" ON contacts FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Chats: see chats involving your children
CREATE POLICY "chats_select" ON chats FOR SELECT TO authenticated
  USING (
    child_a_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
    OR child_b_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
  );
CREATE POLICY "chats_insert" ON chats FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "chats_update" ON chats FOR UPDATE TO authenticated
  USING (
    child_a_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
    OR child_b_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
  );

-- Messages: see messages in your chats
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated
  USING (
    chat_id IN (
      SELECT id FROM chats WHERE
        child_a_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
        OR child_b_id IN (SELECT child_id FROM parent_child WHERE parent_id = auth.uid())
    )
  );
CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

-- Push subscriptions: own only
CREATE POLICY "push_select" ON push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "push_insert" ON push_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_update" ON push_subscriptions FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "push_delete" ON push_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- Enable Realtime for messages
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chats;
