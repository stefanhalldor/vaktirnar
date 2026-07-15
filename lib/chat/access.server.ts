import 'server-only'
import type { User } from '@supabase/supabase-js'
import { resolveAuthenticatedWeatherShellAccess } from '@/lib/weather/weatherBaseAccess.server'
import { checkFeatureAccess } from '@/lib/loans/guard'

/**
 * Result of a chat access check.
 * Callers can map each variant to an appropriate HTTP response.
 */
export type ChatAccessResult =
  | 'allowed'
  | 'no-session'       // user is null or has no email
  | 'chat-disabled'    // TESKEID_CHAT_ENABLED !== 'true'
  | 'no-weather'       // WEATHER_ENABLED=off or mode blocked
  | 'no-vedurstofan'   // weather-provider-vedurstofan feature row missing
  | 'no-pulse'         // weather-pulse feature row missing

/**
 * Checks all access layers required for Veðurpúls / chat:
 *
 * 1. authenticated session (user must have email)
 * 2. TESKEID_CHAT_ENABLED=true
 * 3. base weather shell access — uses resolveAuthenticatedWeatherShellAccess()
 *    which respects WEATHER_ENABLED=All|Authenticated without requiring a
 *    private `vedrid` feature row for base access
 * 4. weather-provider-vedurstofan feature row
 * 5. weather-pulse feature row (unless WEATHER_PULSE_ACCESS_REQUIRED=false)
 */
export async function checkChatAccess(user: User | null): Promise<ChatAccessResult> {
  if (!user?.email) return 'no-session'
  if (process.env.TESKEID_CHAT_ENABLED !== 'true') return 'chat-disabled'

  const shellAccess = await resolveAuthenticatedWeatherShellAccess(user)
  if (shellAccess.mode === 'blocked') return 'no-weather'

  const hasVedurstofan = await checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
  if (!hasVedurstofan) return 'no-vedurstofan'

  // WEATHER_PULSE_ACCESS_REQUIRED=false graduates Veðurpúls to all Veðurstofan-provider users.
  // Default (unset or true) keeps it per-user gated.
  if (process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'false') return 'allowed'

  const hasPulse = await checkFeatureAccess(user.id, user.email, 'weather-pulse').catch(() => false)
  if (!hasPulse) return 'no-pulse'

  return 'allowed'
}
