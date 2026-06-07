import 'server-only'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidAccess } from '@/lib/auth/guard'

export interface LoanAccess {
  user: User
}

/**
 * Guards all access to the Lánað og skilað feature.
 * Checks (in order):
 *   1. LOANS_ENABLED feature flag (before any Supabase work)
 *   2. AUTH_MVP_ENABLED + session + email + allowlist (via guardTeskeidAccess)
 *
 * Redirects on auth/access failure — never leaks allowlist information.
 * Called from layout (access guard), pages (user needed for RPC), and
 * every server action (defense-in-depth).
 */
export async function guardLoanAccess(): Promise<LoanAccess> {
  // 1. LOANS_ENABLED checked first — before any Supabase work.
  // AUTH_MVP_ENABLED is additionally checked inside guardTeskeidAccess.
  if (process.env.LOANS_ENABLED !== 'true') {
    redirect('/')
  }

  // 2-4. AUTH_MVP_ENABLED, session, email, allowlist
  return guardTeskeidAccess()
}
