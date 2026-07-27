import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
  'utf8',
)

describe('RoadMap Vegagerðin live-mode contracts', () => {
  it('keeps live location opt-in, authenticated and limited to the current route mode', () => {
    expect(source).toContain("if (!isAuthenticated || !routeActiveRef.current || routeWeatherModeRef.current !== 'now') return")
    expect(source).toContain("if (document.visibilityState === 'hidden') stopRouteLiveLocation()")
    expect(source).toContain("routeLiveLocationStopRef.current?.()")
    expect(source).toContain('{isAuthenticated && (')
    expect(source).toContain("routeWeatherMode === 'now'")
  })

  it('polls only the same-origin cache route and preserves fetched-version guards', () => {
    expect(source).toContain("fetch('/api/teskeid/weather/vegagerdin/current', {")
    expect(source).toContain("cache: 'no-store'")
    expect(source).toContain('routeBridgeRunIdRef.current !== routeRunId')
    expect(source).toContain('current.fetchedAtIso === payload.fetchedAtIso')
    expect(source).toContain('current.measurementFreshness !== payload.measurementFreshness')
  })

  it('uses station names in integrated cards and the same simple filter mode as the map', () => {
    expect(source).toContain('providerLabel: point.stationName')
    expect(source).toContain('showNameLabel: false')
    expect(source).toContain('mode={routeStatusFilterMode}')
    expect(source).not.toContain('alwaysShowWithinLimits\n              mode={routeStatusFilterMode}')
  })

  it('renders chosen route endpoints as confirmed places instead of searching their labels again', () => {
    expect(source).toContain('selectedPlace={fromResolved}')
    expect(source).toContain('selectedPlace={toResolved}')
  })
})
