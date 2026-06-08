import 'server-only'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'

export interface LoanAccess {
  user: User
}

/**
 * Non-redirecting server-side feature availability check.
 * Returns true when LOANS_ENABLED is 'true' for the lanad-og-skilad feature.
 * All authenticated users have access when the feature is enabled.
 *
 * Unknown feature keys return false (no accidental allow-by-default).
 * Never throws, never redirects.
 */
export async function checkFeatureAccess(
  _userId: string,
  _email: string,
  featureKey: string,
): Promise<boolean> {
  if (featureKey !== 'lanad-og-skilad') {
    return false
  }
  return process.env.LOANS_ENABLED === 'true'
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
 *
 * Redirects on auth/access failure.
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

  return { user }
}
