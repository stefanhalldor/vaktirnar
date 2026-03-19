// lib/supabase.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

type PlaydateSyncClient = SupabaseClient<any, 'playdatesync'>;

let _supabase: PlaydateSyncClient | null = null;

export function getSupabase(): PlaydateSyncClient {
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
      db: { schema: 'playdatesync' }
    });
  }
  return _supabase;
}

export const supabase = getSupabase();