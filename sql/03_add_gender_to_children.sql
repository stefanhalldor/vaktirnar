-- Add gender column to children table
-- Run this in Supabase SQL Editor

ALTER TABLE children
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('boy', 'girl', 'other'));
