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

  it('hides stations without wind measurements by default while preserving measured statuses', () => {
    expect(source).toContain("status => status !== 'no_data' && status !== 'no_wind_data'")
    expect(source).toContain('createDefaultRouteVisibleWindStatuses,')
    expect(source).toContain('handleRouteStatusFilterChange(createDefaultRouteVisibleWindStatuses())')
    expect(source).toContain('combineNoWindDataStatuses\n            />')
    expect(source).toContain('routeStatusIsVisible(point.windDisplayStatus, statuses)')
    expect(source).toContain('applyRouteStatusFilterToMap(\n      map,\n      visibleRouteStatusesRef.current,')

    const successStart = source.indexOf('setRouteBridgeSummary({')
    const successEnd = source.indexOf("setRouteBridgeStatus('success')", successStart)
    const successBlock = source.slice(successStart, successEnd)
    expect(successStart).toBeGreaterThan(-1)
    expect(successEnd).toBeGreaterThan(successStart)
    expect(successBlock).toContain(
      'handleRouteStatusFilterChange(createDefaultRouteVisibleWindStatuses())',
    )
    expect(successBlock).not.toContain('handleRouteStatusFilterChange(new Set())')
  })

  it('preserves the chosen route-status filter when live measurements refresh', () => {
    const refreshStart = source.indexOf('applyRefreshedRouteVegagerdinDataRef.current = payload => {')
    const refreshEnd = source.indexOf('\n  useEffect(() => {', refreshStart)
    const refreshBlock = source.slice(refreshStart, refreshEnd)

    expect(refreshStart).toBeGreaterThan(-1)
    expect(refreshEnd).toBeGreaterThan(refreshStart)
    expect(refreshBlock).toContain('const render = renderVegagerdinStations(layer)')
    expect(refreshBlock).not.toContain('handleRouteStatusFilterChange(')
    expect(refreshBlock).not.toContain('setVisibleRouteStatuses(')
  })

  it('renders chosen route endpoints as confirmed places instead of searching their labels again', () => {
    expect(source).toContain('selectedPlace={fromResolved}')
    expect(source).toContain('selectedPlace={toResolved}')
  })

  it('renders wind arrows as map-aligned point symbols with true geographic bearings', () => {
    expect(source).toContain("const ROUTE_WIND_ARROW_IMAGE_ID = 'teskeid-route-wind-arrow'")
    expect(source).toContain("const VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID = 'vegagerdin-route-wind-arrows-source'")
    expect(source).toContain("const VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID = 'vegagerdin-route-wind-arrows'")
    expect(source).toContain("'symbol-placement': 'point'")
    expect(source).toContain("'icon-rotate': ['get', 'windTowardDeg']")
    expect(source).toContain("['get', 'iconOffset'],")
    expect(source).toContain("'icon-rotation-alignment': 'map'")
    expect(source).toContain("'icon-pitch-alignment': 'map'")
    expect(source).toContain("'icon-keep-upright': false")
    expect(source).toContain('The image points north/up at 0°')
    expect(source).toContain("context.fillStyle = '#334155'")
    expect(source).not.toContain('map.getBearing()')
    expect(source).not.toContain("map.on('rotate'")
  })

  it('keeps wind-arrow lifecycle tied to route filters, current mode, refresh and clear', () => {
    expect(source).toContain('VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID,\n] as const')
    expect(source).toContain('setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID, mode === \'now\')')
    expect(source).toContain('setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID, false)')
    expect(source).toContain('renderRouteWindArrows(validPoints, routeVegagerdinCacheStatusRef.current)')
    expect(source).toContain('renderRouteWindArrows(\n        routeVegagerdinPointsRef.current,')
    expect(source).toContain('map.getSource(VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID)')
    expect(source).toContain(";(existingSource as import('maplibre-gl').GeoJSONSource).setData(geojson as never)")
    expect(source).toContain('if (!map.getLayer(VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID))')
    expect(source).toContain('VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID,\n      VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,')
    expect(source).toContain("t('roadMapPrototypeWindArrowsExplanation')")
  })
})
