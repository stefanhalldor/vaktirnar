import 'server-only'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAuthMvpAllowedEmail } from '@/lib/auth/allowlist'

export interface TeskeidAccess {
  user: User
}

/**
 * Guards all access to Teskeið authenticated routes.
 * Checks (in order):
 *   1. AUTH_MVP_ENABLED feature flag (before any Supabase work)
 *   2. Valid Supabase session
 *   3. Email present on session
 *   4. Email on auth_mvp_allowlist
 *
 * Redirects on any failure — never leaks allowlist information.
 */
export async function guardTeskeidAccess(): Promise<TeskeidAccess> {
  // 1. Feature flag — checked before any Supabase work
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
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
