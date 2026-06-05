import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'

/**
 * Returns true if the email is on the auth MVP allowlist.
 * Email must already be lowercased before calling.
 * Used as a guard in request-code and verify-code routes.
 */
export async function isAuthMvpAllowedEmail(email: string): Promise<boolean> {
  const { data } = await getAdmin()
    .from('auth_mvp_allowlist')
    .select('email')
    .eq('email', email)
    .maybeSingle()

  return data !== null
}
