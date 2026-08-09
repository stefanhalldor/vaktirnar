import 'server-only'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { createClient } from '@/lib/supabase/server'

export async function guardKvissCreator(): Promise<{ user: User; spaceId: string }> {
  const { user } = await guardTeskeidSession()
  if (!(await checkFeatureAccess(user.id, user.email!, 'kviss'))) redirect('/')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('ensure_personal_space')
  if (error || typeof data !== 'string') throw new Error('kviss_space_unavailable')
  return { user, spaceId: data }
}
export async function requireKvissCreatorApi(): Promise<
  { ok: true; user: User; spaceId: string } | { ok: false; status: 404 | 401 }
> {
  if (process.env.KVISS_ENABLED !== 'true') return { ok: false, status: 404 }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, status: 401 }
  if (!(await checkFeatureAccess(user.id, user.email, 'kviss'))) return { ok: false, status: 404 }
  const { data, error } = await supabase.rpc('ensure_personal_space')
  if (error || typeof data !== 'string') return { ok: false, status: 404 }
  return { ok: true, user, spaceId: data }
}
