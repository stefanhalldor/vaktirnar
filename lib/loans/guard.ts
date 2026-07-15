import 'server-only'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { getWeatherEnabledMode } from '@/lib/weather/weatherEnabledMode.server'

export interface LoanAccess {
  user: User
}

/**
 * Non-redirecting server-side feature availability check.
 * Returns true when the user has access to the given feature.
 *
 * lanad-og-skilad: global LOANS_ENABLED env var. All authenticated users
 * have access when the flag is on.
 *
 * umonnun: two-level gate.
 *   1. UMONNUN_ENABLED must be 'true' (global kill-switch).
 *   2. If UMONNUN_FLAG is 'true', the user's canonical email must be in the
 *      feature_access table. If UMONNUN_FLAG is unset or not 'true', all
 *      authenticated users have access (graduation path: just unset the flag).
 *
 * Unknown feature keys return false (no accidental allow-by-default).
 * Never throws, never redirects.
 */
async function checkPerUserAccess(email: string, featureKey: string): Promise<boolean> {
  const canonical = normalizeEmailForAccess(email)
  if (!canonical) return false
  try {
    const { data, error } = await getAdmin()
      .from('feature_access')
      .select('email')
      .eq('email', canonical)
      .eq('feature_key', featureKey)
      .maybeSingle()
    if (error) {
      console.error('[loans/guard] feature_access lookup failed')
      return false
    }
    return data !== null
  } catch {
    console.error('[loans/guard] feature_access lookup failed')
    return false
  }
}

export async function checkFeatureAccess(
  _userId: string,
  email: string,
  featureKey: string,
): Promise<boolean> {
  if (featureKey === 'lanad-og-skilad') return process.env.LOANS_ENABLED === 'true'
  if (featureKey === 'umonnun') {
    if (process.env.UMONNUN_ENABLED !== 'true') return false
    if (process.env.UMONNUN_FLAG !== 'true') return true
    return checkPerUserAccess(email, 'umonnun')
  }
  if (featureKey === 'tengsl') {
    if (process.env.TENGSL_ENABLED !== 'true') return false
    if (process.env.TENGSL_FLAG !== 'true') return true
    return checkPerUserAccess(email, 'tengsl')
  }
  if (featureKey === 'facebook-oauth') {
    if (process.env.FACEBOOK_OAUTH_ENABLED !== 'true') return false
    if (process.env.FACEBOOK_OAUTH_FLAG !== 'true') return true
    return checkPerUserAccess(email, 'facebook-oauth')
  }
  if (featureKey === 'vedrid') {
    if (getWeatherEnabledMode() === 'off') return false
    // New var wins when present. Legacy WEATHER_FLAG is fallback when new var is absent.
    // WEATHER_AUTH_ACCESS_REQUIRED=true (or legacy WEATHER_FLAG=true) enables per-user gate.
    // If neither is set, all authenticated users have access (graduation path).
    const weatherAuthAccessRequired =
      process.env.WEATHER_AUTH_ACCESS_REQUIRED !== undefined
        ? process.env.WEATHER_AUTH_ACCESS_REQUIRED === 'true'
        : process.env.WEATHER_FLAG === 'true'
    if (!weatherAuthAccessRequired) return true
    return checkPerUserAccess(email, 'vedrid')
  }
  if (featureKey === 'ferdalagid') {
    if (getWeatherEnabledMode() === 'off') return false
    if (process.env.WEATHER_TRIP_FLAG !== 'true') return false
    return checkPerUserAccess(email, 'ferdalagid')
  }
  if (featureKey === 'elta-vedrid') {
    if (getWeatherEnabledMode() === 'off') return false
    if (process.env.WEATHER_ELTA_VEDRID_FLAG !== 'true') return false
    return checkPerUserAccess(email, 'elta-vedrid')
  }
  if (featureKey === 'weather-provider-vedurstofan') {
    if (getWeatherEnabledMode() === 'off') return false
    // Default: access required (per-user gate) unless explicitly set to 'false'.
    // WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false graduates provider to all weather users.
    // Legacy WEATHER_PROVIDER_VEDURSTOFAN_ENABLED is no longer read — remove from Vercel after deploy verification.
    const vedurstofanAccessRequired =
      process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED !== 'false'
    if (!vedurstofanAccessRequired) return true
    return checkPerUserAccess(email, 'weather-provider-vedurstofan')
  }
  return false
}

/**
 * Redirecting companion to checkFeatureAccess.
 * Redirects to / if the user does not have access to featureKey.
 */
export async function guardFeatureAccess(
  email: string,
  featureKey: string,
): Promise<void> {
  const allowed = await checkFeatureAccess('', email, featureKey)
  if (!allowed) {
    redirect('/')
  }
}

/**
 * Guards all access to the Lánað og skilað feature.
 * Checks (in order):
 *   1. LOANS_ENABLED feature flag (before any Supabase work)
 *   2. AUTH_MVP_ENABLED + session + email (via guardTeskeidSession)
 *
 * Redirects on auth/access failure.
 * Called from layout (access guard), pages (user needed for RPC), and
 * every server action (defense-in-depth).
 */
export async function guardLoanAccess(): Promise<LoanAccess> {
  // 1. LOANS_ENABLED checked first — before any Supabase work.
  if (process.env.LOANS_ENABLED !== 'true') {
    redirect('/')
  }

  // 2. AUTH_MVP_ENABLED, session, email
  const { user } = await guardTeskeidSession()

  return { user }
}
