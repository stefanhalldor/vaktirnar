import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import { splitUser } from '@/lib/receipt-split/server'
import { publicMenuSchema } from './contracts'

export function restaurantsGloballyEnabled() {
  return process.env.RESTAURANTS_ENABLED === 'true'
}

export async function readPublicMenu(slug: string) {
  if (!restaurantsGloballyEnabled()) return null
  const { data, error } = await getAdmin().rpc('restaurant_resolve_public_menu_v1', { p_venue_slug: slug })
  if (error || !data) return null
  const parsed = publicMenuSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export async function requireRestaurantGuest() {
  if (!restaurantsGloballyEnabled()) throw new Error('restaurant_not_found')
  const user = await splitUser()
  if (!user?.email) throw new Error('restaurant_login')
  const { data, error } = await getAdmin().from('feature_access').select('email').eq('feature_key', 'veitingastadir_gestir')
    .eq('email', user.email.toLowerCase().trim()).maybeSingle()
  if (error || !data) throw new Error('restaurant_not_found')
  return user
}

export async function requireRestaurantRole(featureKey: 'veitingastadir' | 'veitingastadir_starfsfolk') {
  if (!restaurantsGloballyEnabled()) throw new Error('restaurant_not_found')
  const user = await splitUser()
  if (!user?.email) throw new Error('restaurant_login')
  const { data, error } = await getAdmin().from('feature_access').select('email').eq('feature_key', featureKey)
    .eq('email', user.email.toLowerCase().trim()).maybeSingle()
  if (error || !data) throw new Error('restaurant_not_found')
  return user
}
