import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
  'utf8',
)
const messagesIs = readFileSync(join(process.cwd(), 'messages/is.json'), 'utf8')
const messagesEn = readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8')

describe('RoadMap Vegagerðin live-mode contracts', () => {
  it('keeps live location opt-in, authenticated and limited to the current route mode', () => {
    expect(source).toContain('!isAuthenticated ||')
    expect(source).toContain('!routeActiveRef.current ||')
    expect(source).toContain("routeWeatherModeRef.current !== 'now' ||")
    expect(source).toContain("lastMapContextRef.current !== 'route'")
    expect(source).toContain("routeContextViewRef.current !== 'map'")
    expect(source).toContain("if (document.visibilityState === 'hidden') stopRouteLiveLocation()")
    expect(source).toContain("routeLiveLocationStopRef.current?.()")
    expect(source).toContain('{isAuthenticated ? (')
    expect(source).toContain('{isAuthenticated &&\n        mapViewVisible &&')
    expect(source).toContain("routeWeatherMode === 'now'")
    expect(source).toContain('enableHighAccuracy: true')
    expect(source).toContain('maximumAgeMs: 0')
    expect(source).not.toContain('DeviceOrientationEvent')
  })

  it('advertises the trial publicly without exposing the geolocation action', () => {
    expect(source).toContain("buildRoadMapLiveLocationSignInReturnHref(navigation)")
    expect(source).toContain("onClick={() => persistRouteReturnSnapshot('map')}")
    expect(source).toContain("t('roadMapPrototypeLiveLocationPublicCta')")
    expect(source).toContain("t('roadMapPrototypeLiveLocationPrivacy')")
    expect(messagesIs).toContain('"roadMapPrototypeLiveLocationTrial": "Í prófun"')
    expect(messagesEn).toContain('"roadMapPrototypeLiveLocationTrial": "In testing"')
    expect(messagesIs).toContain('"roadMapPrototypeLiveLocationPublicCta": "Skrá inn og prófa"')
    expect(messagesEn).toContain('"roadMapPrototypeLiveLocationPublicCta": "Sign in and try it"')
    expect(messagesIs).toContain('"roadMapPrototypeLiveLocationPrivacy": "Staðsetningin er aðeins notuð til að færa kortið og er ekki vistuð af Teskeið."')
    expect(messagesEn).toContain('"roadMapPrototypeLiveLocationPrivacy": "Your location is used only to move the map and is not stored by Teskeið."')

    const publicBranchStart = source.indexOf("t('roadMapPrototypeLiveLocationPublicDescription')")
    const publicBranchEnd = source.indexOf("t('roadMapPrototypeLiveLocationPrivacy')", publicBranchStart)
    const publicBranch = source.slice(publicBranchStart, publicBranchEnd)
    expect(publicBranchStart).toBeGreaterThan(-1)
    expect(publicBranchEnd).toBeGreaterThan(publicBranchStart)
    expect(publicBranch).not.toContain('handleToggleRouteLiveLocation')
    expect(publicBranch).not.toContain('watchLiveLocation')
  })

  it('keeps the trial and current follow state visible on the route map', () => {
    expect(source).toContain("t('roadMapPrototypeLiveLocationFollowing')")
    expect(source).toContain("t('roadMapPrototypeLiveLocationLoadingCompact')")
    expect(source).toContain("t('roadMapPrototypeLiveLocationTrial')")
    expect(source).toContain("routeLiveLocationFollowMode === 'free'")
    expect(source).toContain('aria-hidden="true"')
  })

  it('separates user camera gestures from programmatic following and offers recenter', () => {
    expect(source).toContain("map.on('dragstart', leaveFollowForUserGesture)")
    expect(source).toContain("map.on('zoomstart', leaveFollowForUserGesture)")
    expect(source).toContain("map.on('rotatestart', leaveFollowForUserGesture)")
    expect(source).toContain("map.on('pitchstart', leaveFollowForUserGesture)")
    expect(source).toContain("event.originalEvent ? 'user_camera' : 'programmatic_camera'")
    expect(source).toContain('reduceLiveLocationFollowMode(')
    expect(source).toContain('routeLiveLocationFollowModeRef.current = decision.mode')
    expect(source).toContain("'recenter',")
    expect(source).toContain('handleRecenterRouteLiveLocation')
    expect(messagesIs).toContain('"roadMapPrototypeLiveLocationRecenter": "Elta mig aftur"')
    expect(messagesEn).toContain('"roadMapPrototypeLiveLocationRecenter": "Follow me again"')
    expect(messagesIs).toContain('"roadMapPrototypeLiveLocationActiveUnknownAccuracy"')
    expect(messagesEn).toContain('"roadMapPrototypeLiveLocationActiveUnknownAccuracy"')
  })

  it('keeps follow zoom bounded and persists only that preference', () => {
    expect(source).toContain('LIVE_LOCATION_FOLLOW_ZOOM_MIN')
    expect(source).toContain('LIVE_LOCATION_FOLLOW_ZOOM_MAX')
    expect(source).toContain('LIVE_LOCATION_FOLLOW_ZOOM_DEFAULT')
    expect(source).toContain('routeLiveLocationFollowZoomRef.current + delta')
    expect(source).toContain(
      'window.localStorage.setItem(LIVE_LOCATION_FOLLOW_ZOOM_STORAGE_KEY, String(nextZoom))',
    )
    expect(source).not.toMatch(/localStorage\.setItem\([^\n]*(lat|lon|heading|speed)/i)
    expect(source).toContain("'zoom_changed',")
    expect(source).toContain('if (decision.moveCamera) moveRouteLiveLocationCamera()')
    expect(source).toContain('className="inline-flex h-10 w-10 items-center justify-center')
  })

  it('keeps the directional puck geographically aligned and honors reduced motion', () => {
    expect(source).toContain('point.headingDeg - map.getBearing()')
    expect(source).toContain('nearestEquivalentHeadingDegrees(')
    expect(source).toContain('routeLiveLocationPuckVisualAngleRef.current = visualHeading')
    expect(source).toContain('routeLiveLocationPuckVisualAngleRef.current = null')
    expect(source).toContain("...(point.headingDeg !== null ? { bearing: point.headingDeg } : {})")
    expect(source).toContain("map.on('rotate', syncMapDirections)")
    expect(source).toContain("map.off('rotate', syncMapDirections)")
    expect(source).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    expect(source).toContain('duration: reduceMotion ? 0 : 350')
  })

  it('cleans up the watch, marker and map listeners at every exit boundary', () => {
    expect(source).toContain('routeLiveLocationMapListenersCleanupRef.current?.()')
    expect(source).toContain('routeLiveLocationMarkerRef.current?.remove()')
    expect(source).toContain("routeWeatherMode !== 'now' ||")
    expect(source).toContain("lastMapContext !== 'route'")
    expect(source).toContain("routeContextView !== 'map'")
    expect(source).toContain('isChatOpen ||')
    expect(source).toContain('stopRouteLiveLocation(false)')
    expect(source).toContain("map.off('dragstart', leaveFollowForUserGesture)")
    expect(source).toContain("map.off('zoomstart', leaveFollowForUserGesture)")
    expect(source).toContain("map.off('rotatestart', leaveFollowForUserGesture)")
    expect(source).toContain("map.off('pitchstart', leaveFollowForUserGesture)")
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
    const windArrowStart = source.indexOf('function renderRouteWindArrows(')
    const windArrowEnd = source.indexOf('\n  function renderVegagerdinStations(', windArrowStart)
    const windArrowBlock = source.slice(windArrowStart, windArrowEnd)
    expect(windArrowStart).toBeGreaterThan(-1)
    expect(windArrowEnd).toBeGreaterThan(windArrowStart)
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
    expect(windArrowBlock).not.toContain('map.getBearing()')
    expect(windArrowBlock).not.toContain("map.on('rotate'")
  })

  it('keeps station-card arrows in the same geographic frame when the map rotates', () => {
    expect(source).toContain('resolveWindTowardBearingDeg(')
    expect(source).toContain('direction.dataset.windTowardBearing = String(windTowardBearing)')
    expect(source).toContain("querySelectorAll<HTMLElement>('[data-wind-toward-bearing]')")
    expect(source).toContain('windTowardBearing - mapBearing')
    expect(source).toContain("map.on('rotate', updateViewportWindDirectionMarkers)")
    expect(source).toContain('directionDegrees: point.windDirectionDeg')
    expect(source).toContain('directionDegrees: station.windDirectionDeg')
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
