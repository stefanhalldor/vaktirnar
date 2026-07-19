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
  | 'no-vegagerdin'    // weather-provider-vegagerdin feature row missing (when WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true)
  | 'no-pulse'         // weather-pulse feature row missing

/**
 * Checks all access layers required for Veðurpúls / chat.
 *
 * Common layers (all providers):
 * 1. authenticated session (user must have email)
 * 2. TESKEID_CHAT_ENABLED=true
 * 3. base weather shell access
 *
 * Provider-specific layers:
 * - provider='vedurstofan' (default): requires weather-provider-vedurstofan feature row,
 *   then weather-pulse row (graduation pattern: only when WEATHER_PULSE_ACCESS_REQUIRED=true).
 * - provider='vegagerdin': requires weather-provider-vegagerdin feature row only when
 *   WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true; otherwise open to all weather users.
 */
export async function checkChatAccess(
  user: User | null,
  options?: { provider?: 'vedurstofan' | 'vegagerdin' },
): Promise<ChatAccessResult> {
  if (!user?.email) return 'no-session'
  if (process.env.TESKEID_CHAT_ENABLED !== 'true') return 'chat-disabled'

  const shellAccess = await resolveAuthenticatedWeatherShellAccess(user)
  if (shellAccess.mode === 'blocked') return 'no-weather'

  const provider = options?.provider ?? 'vedurstofan'

  if (provider === 'vegagerdin') {
    // Vegagerðin provider gate: active only when WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true.
    // Unset = open to all weather-enabled users (graduated pattern matching Veðurstofan pulse).
    if (process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED === 'true') {
      const hasVegagerdin = await checkFeatureAccess(user.id, user.email, 'weather-provider-vegagerdin').catch(() => false)
      if (!hasVegagerdin) return 'no-vegagerdin'
    }
    return 'allowed'
  }

  // Veðurstofan (default): requires provider feature row + optional pulse gate.
  const hasVedurstofan = await checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
  if (!hasVedurstofan) return 'no-vedurstofan'

  // Graduation pattern: per-user pulse gate active only when WEATHER_PULSE_ACCESS_REQUIRED=true.
  // Unset (delete from Vercel) = open to all Veðurstofan-provider users.
  if (process.env.WEATHER_PULSE_ACCESS_REQUIRED !== 'true') return 'allowed'

  const hasPulse = await checkFeatureAccess(user.id, user.email, 'weather-pulse').catch(() => false)
  if (!hasPulse) return 'no-pulse'

  return 'allowed'
}
