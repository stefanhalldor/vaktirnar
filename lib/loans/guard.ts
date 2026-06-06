import 'server-only'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAuthMvpAllowedEmail } from '@/lib/auth/allowlist'

export interface LoanAccess {
  user: User
}

/**
 * Guards all access to the Lánað og skilað feature.
 * Checks (in order):
 *   1. AUTH_MVP_ENABLED + LOANS_ENABLED feature flags (both must be 'true')
 *   2. Valid Supabase session
 *   3. Email present on session
 *   4. Email on auth_mvp_allowlist
 *
 * Redirects on auth/access failure — never leaks allowlist information.
 * Called from layout (access guard), pages (user needed for RPC), and
 * every server action (defense-in-depth).
 */
export async function guardLoanAccess(): Promise<LoanAccess> {
  // 1. Feature flags — both must be exactly 'true'; checked before any Supabase work
  if (process.env.AUTH_MVP_ENABLED !== 'true' || process.env.LOANS_ENABLED !== 'true') {
    redirect('/')
  }

  // 2 + 3. Session and email
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    redirect('/auth-mvp/innskraning')
  }

  // 4. Allowlist
  const allowed = await isAuthMvpAllowedEmail(user.email.toLowerCase().trim())
  if (!allowed) {
    redirect('/')
  }

  return { user }
}
