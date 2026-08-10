import { createClient } from '@supabase/supabase-js'

function createConfiguredLegacyClient(supabaseUrl: string, supabaseAnonKey: string) {
  return createClient(supabaseUrl, supabaseAnonKey)
}

type LegacySupabaseClient = ReturnType<typeof createConfiguredLegacyClient>

let legacySupabaseClient: LegacySupabaseClient | null = null

/**
 * Legacy playdate routes still use the older browser-key client on the server.
 * Construct it on first request instead of at module import so `next build` can
 * collect route metadata without requiring runtime environment variables.
 */
export function getLegacySupabaseClient(): LegacySupabaseClient {
  if (legacySupabaseClient) return legacySupabaseClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and anon key are required at request time')
  }

  legacySupabaseClient = createConfiguredLegacyClient(supabaseUrl, supabaseAnonKey)
  return legacySupabaseClient
}
