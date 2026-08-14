export type WeatherOverviewContext = 'weather' | 'route'

/**
 * Releases the direct-route guard only after the route context is observed.
 * A direct `?context=route` mount starts with React's weather default before
 * the URL effect commits, and development Strict Mode may run that transient
 * effect more than once. Keeping the guard through every transient weather
 * invocation prevents provider work; switching to Weather after route context
 * was committed remains intentional and fetches.
 */
export function consumeWeatherOverviewProviderFetchGate(
  context: WeatherOverviewContext,
  skipInitialWeatherFetch: { current: boolean },
): boolean {
  if (context === 'route') {
    skipInitialWeatherFetch.current = false
    return false
  }
  if (skipInitialWeatherFetch.current) {
    return false
  }
  return true
}
