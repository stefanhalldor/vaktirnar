import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'

export async function getVegagerdinAccessDenialStatus(): Promise<401 | 403 | 404 | null> {
  if (process.env.AUTH_MVP_ENABLED !== 'true' || getWeatherEnabledMode() === 'off') {
    return 404
  }
  if (process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED !== 'true') {
    return null
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return 401
  return await checkFeatureAccess(user.id, user.email, 'weather-provider-vegagerdin')
    ? null
    : 403
}
