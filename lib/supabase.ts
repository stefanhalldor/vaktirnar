// lib/supabase.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';

type PlaydateSyncClient = SupabaseClient<any, 'playdatesync'>;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let _supabase: PlaydateSyncClient | null = null;

export function getSupabase(): PlaydateSyncClient {
  if (!_supabase) {
    _supabase = createClient(
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      { db: { schema: 'playdatesync' } }
    );
  }
  return _supabase;
}

export const supabase = getSupabase();