import 'server-only'

import type { TeskeidLauncherId } from './launcherCatalog'

export type TeskeidFeatureRollout = 'open' | 'closed-testing'

/**
 * Canonical compatibility rule for the authenticated Weather per-user gate.
 * The explicit replacement variable wins whenever it is present; the legacy
 * flag is read only while the replacement is absent.
 */
export function isAuthenticatedWeatherPerUserAccessRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.WEATHER_AUTH_ACCESS_REQUIRED !== undefined
    ? env.WEATHER_AUTH_ACCESS_REQUIRED === 'true'
    : env.WEATHER_FLAG === 'true'
}

/**
 * Server-only presentation policy for authenticated launcher surfaces.
 * Access guards remain authoritative: callers render a closed-testing banner
 * only after their feature/session guard has succeeded.
 */
export function resolveTeskeidFeatureRollout(
  featureId: TeskeidLauncherId,
): TeskeidFeatureRollout {
  switch (featureId) {
    case 'lanad-og-skilad':
    case 'umonnun':
    case 'vedrid':
      return 'open'
    case 'utlagt-og-endurgreitt':
    case 'afmaeli-og-vidburdir':
    case 'bokhaldid':
    case 'kviss':
    case 'auglysandi':
    case 'bokanir':
      return 'closed-testing'
  }
}
