import 'server-only'

import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { EVENT_FEATURE_KEY } from './contracts'

export interface EventAccess {
  user: User
}

async function hasEventEntitlement(email: string): Promise<boolean> {
  const canonicalEmail = normalizeEmailForAccess(email)
  if (!canonicalEmail) return false
  try {
    const { data, error } = await getAdmin()
      .from('feature_access')
      .select('email')
      .eq('email', canonicalEmail)
      .eq('feature_key', EVENT_FEATURE_KEY)
      .maybeSingle()
    if (error) {
      console.error('[events/guard] feature access lookup failed')
      return false
    }
    return data !== null
  } catch {
    console.error('[events/guard] feature access lookup failed')
    return false
  }
}

export async function guardEventAccess(): Promise<EventAccess> {
  if (process.env.EVENTS_ENABLED !== 'true') redirect('/')
  const { user } = await guardExpenseAccess()
  if (!user.email || !await hasEventEntitlement(user.email)) redirect('/')
  return { user }
}
