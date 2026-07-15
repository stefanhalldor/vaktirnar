import 'server-only'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherEnabledMode } from './weatherEnabledMode.server'

export type { WeatherEnabledMode } from './weatherEnabledMode.server'
export { getWeatherEnabledMode }

export type WeatherBaseAccess =
  | { mode: 'authenticated'; userId: string; actor: 'authenticated' }
  | { mode: 'public'; userId: null; actor: 'public' }
  | { mode: 'blocked' }

/**
 * Resolves base MET/Yr weather API access for a request.
 *
 * Used by public-capable API routes (travel, routes, place search).
 * In All mode, signed-in users without private vedrid get userId: null to keep
 * analytics/rate-limit semantics consistent with unauthenticated guests.
 *
 * - WEATHER_ENABLED=off (or missing/unknown) → blocked for everyone.
 * - Signed-in user with private `vedrid`, any enabled mode → authenticated.
 * - Signed-in user without `vedrid`, WEATHER_ENABLED=Authenticated → authenticated
 *   (all signed-in users get base weather; vedrid is not required).
 * - Signed-in user without `vedrid`, WEATHER_ENABLED=All → public (userId: null).
 * - Signed-out user, WEATHER_ENABLED=All → public (userId: null).
 * - Signed-out user, WEATHER_ENABLED=Authenticated → blocked.
 *
 * Does NOT gate Veðurstofan provider, saved places, or admin/provider operations.
 */
export async function resolveWeatherBaseAccess(
  user: { id: string; email?: string | null } | null,
): Promise<WeatherBaseAccess> {
  const mode = getWeatherEnabledMode()
  if (mode === 'off') return { mode: 'blocked' }
  if (user?.email) {
    const hasVedrid = await checkFeatureAccess(user.id, user.email, 'vedrid').catch(() => false)
    if (hasVedrid || mode === 'authenticated') {
      return { mode: 'authenticated', userId: user.id, actor: 'authenticated' }
    }
  }
  if (mode === 'all') return { mode: 'public', userId: null, actor: 'public' }
  return { mode: 'blocked' }
}

export type AuthenticatedWeatherShellAccess =
  | { mode: 'authenticated'; userId: string; hasPrivateVedrid: true }
  | { mode: 'authenticated-public'; userId: string; hasPrivateVedrid: false }
  | { mode: 'blocked' }

/**
 * Resolves weather shell access for signed-in users.
 *
 * Used by authenticated UI routes (/auth-mvp/vedrid) and saved-places APIs
 * where the user's identity must be preserved even when base access is via
 * public tier (no private vedrid). Unlike resolveWeatherBaseAccess, this
 * helper keeps userId for all allowed signed-in users.
 *
 * - WEATHER_ENABLED=off → blocked.
 * - User must be signed in (must have email) → blocked otherwise.
 * - authenticated: user has private `vedrid` access.
 * - authenticated-public: WEATHER_ENABLED=All or Authenticated, user has no `vedrid`.
 * - blocked: WEATHER_ENABLED=off, or user is signed out.
 *
 * Does NOT gate Veðurstofan provider — that is separately gated via
 * `weather-provider-vedurstofan` / `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`.
 */
export async function resolveAuthenticatedWeatherShellAccess(
  user: { id: string; email?: string | null },
): Promise<AuthenticatedWeatherShellAccess> {
  const mode = getWeatherEnabledMode()
  if (mode === 'off') return { mode: 'blocked' }
  if (!user.email) return { mode: 'blocked' }

  const hasPrivateVedrid = await checkFeatureAccess(user.id, user.email, 'vedrid').catch(() => false)
  if (hasPrivateVedrid) {
    return { mode: 'authenticated', userId: user.id, hasPrivateVedrid: true }
  }

  if (mode === 'all' || mode === 'authenticated') return { mode: 'authenticated-public', userId: user.id, hasPrivateVedrid: false }
  return { mode: 'blocked' }
}
