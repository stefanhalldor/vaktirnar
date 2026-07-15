import 'server-only'

export type WeatherEnabledMode = 'all' | 'authenticated' | 'off'

/**
 * Returns the current weather base-access mode from WEATHER_ENABLED.
 *
 * Allowed values:
 * - 'All'  → everyone gets base MET/Yr weather (public + authenticated)
 * - 'Authenticated' → only signed-in users get base weather
 * - anything else / missing → weather is closed
 *
 * Legacy fallback (transition only):
 * - WEATHER_ENABLED=true + WEATHER_PUBLIC_ENABLED=true → 'all'
 * - WEATHER_ENABLED=true (no public flag)              → 'authenticated'
 */
export function getWeatherEnabledMode(): WeatherEnabledMode {
  switch (process.env.WEATHER_ENABLED) {
    case 'All':
      return 'all'
    case 'Authenticated':
      return 'authenticated'
    case 'true':
      return process.env.WEATHER_PUBLIC_ENABLED === 'true' ? 'all' : 'authenticated'
    default:
      return 'off'
  }
}
