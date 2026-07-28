import 'server-only'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { getAdmin } from '@/lib/supabase/admin'

export const AGENT_COLLABORATION_FEATURE_KEY = 'agent-collaboration-private-beta'

/**
 * Fail-closed private-beta entitlement check.
 *
 * The email is canonicalized before the service-role lookup and is never
 * included in logs. Database RPCs repeat this authorization check so the
 * Next.js boundary is not the only protection.
 */
export async function hasAgentCollaborationBetaAccess(email: string): Promise<boolean> {
  const canonical = normalizeEmailForAccess(email)
  if (!canonical) return false

  try {
    const { data, error } = await getAdmin()
      .from('feature_access')
      .select('email')
      .eq('email', canonical)
      .eq('feature_key', AGENT_COLLABORATION_FEATURE_KEY)
      .maybeSingle()

    if (error) {
      console.error('[agent-collaboration/access] entitlement lookup failed')
      return false
    }
    return data !== null
  } catch {
    console.error('[agent-collaboration/access] entitlement lookup failed')
    return false
  }
}
