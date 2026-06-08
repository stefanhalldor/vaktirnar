import 'server-only'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { isAuthMvpAllowedEmail } from '@/lib/auth/allowlist'

export interface LoanAccess {
  user: User
}

/**
 * Non-redirecting server-side feature availability check.
 * Returns true only if both LOANS_ENABLED is 'true' AND the user's email
 * is on the allowlist for the given featureKey.
 *
 * Fail-closed: any allowlist lookup error returns false.
 * Unknown feature keys return false (no accidental allow-by-default).
 * Never throws, never redirects.
 */
export async function checkFeatureAccess(
  _userId: string,
  email: string,
  featureKey: string,
): Promise<boolean> {
  if (featureKey !== 'lanad-og-skilad') {
    return false
  }
  if (process.env.LOANS_ENABLED !== 'true') {
    return false
  }
  try {
    return await isAuthMvpAllowedEmail(email.toLowerCase().trim())
  } catch {
    console.error('[feature-access] allowlist lookup failed')
    return false
  }
}

/**
 * Redirecting companion to checkFeatureAccess.
 * Redirects to / if the user does not have access to featureKey.
 */
export async function guardFeatureAccess(
  email: string,
  featureKey: string,
): Promise<void> {
  const allowed = await checkFeatureAccess('', email, featureKey)
  if (!allowed) {
    redirect('/')
  }
}

/**
 * Guards all access to the Lánað og skilað feature.
 * Checks (in order):
 *   1. LOANS_ENABLED feature flag (before any Supabase work)
 *   2. AUTH_MVP_ENABLED + session + email (via guardTeskeidSession)
 *   3. Email on allowlist (via checkFeatureAccess)
 *
 * Redirects on auth/access failure — never leaks allowlist information.
 * Called from layout (access guard), pages (user needed for RPC), and
 * every server action (defense-in-depth).
 */
export async function guardLoanAccess(): Promise<LoanAccess> {
  // 1. LOANS_ENABLED checked first — before any Supabase work.
  if (process.env.LOANS_ENABLED !== 'true') {
    redirect('/')
  }

  // 2. AUTH_MVP_ENABLED, session, email
  const { user } = await guardTeskeidSession()

  // 3. Allowlist (feature access)
  await guardFeatureAccess(user.email!, 'lanad-og-skilad')

  return { user }
}
