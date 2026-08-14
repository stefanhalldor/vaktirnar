import { describe, expect, it } from 'vitest'
import { consumeWeatherOverviewProviderFetchGate } from '@/lib/weather/overviewProviderFetch'

describe('weather overview provider fetch gate', () => {
  it('does zero provider work during a direct route mount and allows a later explicit Weather switch', () => {
    const directRouteGuard = { current: true }

    // React's initial default context must not leak a provider fetch before
    // the URL-context effect commits the direct route entry.
    expect(consumeWeatherOverviewProviderFetchGate('weather', directRouteGuard)).toBe(false)
    // React development Strict Mode repeats the mount effect before the
    // URL-driven context update; the second setup must remain blocked too.
    expect(consumeWeatherOverviewProviderFetchGate('weather', directRouteGuard)).toBe(false)
    expect(directRouteGuard.current).toBe(true)
    expect(consumeWeatherOverviewProviderFetchGate('route', directRouteGuard)).toBe(false)
    expect(directRouteGuard.current).toBe(false)
    expect(consumeWeatherOverviewProviderFetchGate('weather', directRouteGuard)).toBe(true)
  })

  it('allows the normal Weather overview to load immediately', () => {
    expect(consumeWeatherOverviewProviderFetchGate('weather', { current: false })).toBe(true)
  })
})
