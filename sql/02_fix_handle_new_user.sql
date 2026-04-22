-- Fix: handle_new_user trigger fails with "Database error saving new user"
-- Cause: SECURITY DEFINER functions need explicit search_path
-- Run this in Supabase SQL Editor if signup returns "Database error saving new user"

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
