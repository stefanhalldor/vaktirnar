import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Returns a new admin client per call — consistent with server.ts pattern.
// Deferred so the build never evaluates SUPABASE_SERVICE_ROLE_KEY at module load time.
export function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
