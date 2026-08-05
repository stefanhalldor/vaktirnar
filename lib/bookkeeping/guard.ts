import 'server-only'

import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { BOOKKEEPING_FEATURE_KEY } from './constants'

export interface BookkeepingAccess {
  user: User
}

export async function guardBookkeepingAccess(): Promise<BookkeepingAccess> {
  if (process.env.BOOKKEEPING_ENABLED !== 'true') redirect('/')
  const { user } = await guardTeskeidSession()
  if (!user.email) redirect('/')
  const allowed = await checkFeatureAccess(user.id, user.email, BOOKKEEPING_FEATURE_KEY)
  if (!allowed) redirect('/')
  return { user }
}
