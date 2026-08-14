import 'server-only'
import { googlePlacesProvider } from './googlePlaces.server'
import type { WeatherMapProvider } from './provider.types'

/**
 * Returns the configured map provider, or null if none is configured.
 * Reads WEATHER_MAP_PROVIDER at request time — no module-level singletons.
 */
export function getWeatherMapProvider(): WeatherMapProvider | null {
  const provider = process.env.WEATHER_MAP_PROVIDER
  if (provider === 'google') return googlePlacesProvider
  return null
}
