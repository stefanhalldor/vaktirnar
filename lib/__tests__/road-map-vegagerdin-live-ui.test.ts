import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
  'utf8',
)
const liveLocationControlsSource = readFileSync(
  join(process.cwd(), 'components/weather/LiveLocationControls.tsx'),
  'utf8',
)
const liveDriveControlsSource = readFileSync(
  join(process.cwd(), 'components/weather/LiveDriveMapControls.tsx'),
  'utf8',
)
const liveStationSource = readFileSync(
  join(process.cwd(), 'lib/weather/liveVegagerdinStation.ts'),
  'utf8',
)
const messagesIs = readFileSync(join(process.cwd(), 'messages/is.json'), 'utf8')
const messagesEn = readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8')

describe('RoadMap Vegagerðin live-mode contracts', () => {
  it('keeps live location opt-in, authenticated and limited to a current drive mode', () => {
    expect(source).toContain('!isAuthenticated ||')
    expect(source).toContain('!routeActiveRef.current ||')
    expect(source).toContain("routeWeatherModeRef.current !== 'now' ||")
    expect(source).toContain("lastMapContextRef.current !== 'route'")
    expect(source).toContain("routeContextViewRef.current !== 'map'")
    expect(source).toContain("if (document.visibilityState !== 'hidden') return")
    expect(source).toContain("liveDriveModeRef.current === 'free-drive'")
    expect(source).toContain("routeLiveLocationStopRef.current?.()")
    expect(source).toContain('{isAuthenticated ? (')
    expect(source).toContain('{isAuthenticated &&\n            routeWeatherMode === \'now\' &&')
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

  it('moves explicitly from planning into the current driving view and back', () => {
    const startHandlerStart = source.indexOf('function handleStartDrivingWithTeskeid()')
    const startHandlerEnd = source.indexOf('\n  function handlePlanRoute()', startHandlerStart)
    const startHandler = source.slice(startHandlerStart, startHandlerEnd)

    expect(startHandlerStart).toBeGreaterThan(-1)
    expect(startHandlerEnd).toBeGreaterThan(startHandlerStart)
    expect(startHandler).toContain('handleSelectRouteNow()')
    expect(startHandler).toContain("openRouteContext('map')")
    expect(startHandler).toContain("setLiveDriveModeState('route')")
    expect(startHandler).toContain("startRouteLiveLocation('route')")
    expect(source).toContain("t('roadMapPrototypeStartDriving')")
    expect(source).toContain("t('roadMapPrototypeStartDrivingPrivacy')")
    expect(source).toContain("onClick={handleStartDrivingWithTeskeid}")
    expect(source).toContain("onClick={() => persistRouteReturnSnapshot('map')}")
    expect(source).toContain("t('roadMapPrototypeDrivingNow')")
    expect(source).toContain('onPlan={handlePlanRoute}')
    expect(source).toContain("t('roadMapPrototypePlanRoute')")
    const planHandlerStart = source.indexOf('function handlePlanRoute()')
    const planHandlerEnd = source.indexOf('\n  useEffect(() => {', planHandlerStart)
    const planHandler = source.slice(planHandlerStart, planHandlerEnd)
    expect(planHandlerStart).toBeGreaterThan(-1)
    expect(planHandlerEnd).toBeGreaterThan(planHandlerStart)
    expect(planHandler).toContain('stopRouteLiveLocation()')
    expect(planHandler).toContain("openRouteContext('information')")
    expect(messagesIs).toContain(
      '"roadMapPrototypeStartDriving": "Keyra af stað með Teskeiðinni"',
    )
    expect(messagesEn).toContain(
      '"roadMapPrototypeStartDriving": "Start driving with Teskeið"',
    )
    expect(messagesIs).toContain(
      '"roadMapPrototypeStartDrivingPrivacy": "Kortið biður um staðsetningu til að elta þig. Hún er ekki vistuð."',
    )
    expect(messagesEn).toContain(
      '"roadMapPrototypeStartDrivingPrivacy": "The map asks for your location to follow you. It is not stored."',
    )
    expect(messagesIs).toContain('"roadMapPrototypeDrivingNow": "Á ferðinni núna"')
    expect(messagesEn).toContain('"roadMapPrototypeDrivingNow": "On the road now"')
    expect(messagesIs).toContain('"roadMapPrototypePlanRoute": "Skipuleggja"')
    expect(messagesEn).toContain('"roadMapPrototypePlanRoute": "Plan"')
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

  it('keeps a route compass visible and preserves an explicit live orientation mode', () => {
    expect(source).toContain("mapReady && mapViewVisible && lastMapContext === 'route'")
    expect(source).toContain('ref={setRouteMapCompassDirection}')
    expect(source).toContain('className="inline-flex h-11 w-11')
    expect(source).toContain('focus-visible:ring-2 focus-visible:ring-ring')
    expect(source).toContain('aria-label={routeMapCompassActionLabel}')
    expect(source).not.toContain('aria-pressed={routeLiveLocationIsTracking ? routeMapCompassNorthUpActive : undefined}')
    expect(source).toContain('title={routeMapCompassActionLabel}')
    expect(source).toContain('normalizeHeadingDegrees(-map.getBearing())')
    expect(source).toContain('routeMapCompassVisualAngleRef.current = visualHeading')
    expect(source).toContain("map.on('rotate', updateRouteMapCompassDirection)")
    expect(source).toContain("routeLiveLocationOrientationModeRef.current = 'heading-up'")
    expect(source).toContain('resolveLiveLocationCameraBearing(')
    expect(messagesIs).toContain(
      '"roadMapPrototypeCompassNorthUp": "Snúa kortinu þannig að norður sé upp"',
    )
    expect(messagesEn).toContain(
      '"roadMapPrototypeCompassNorthUp": "Rotate the map so north is up"',
    )
    const compassStart = source.indexOf('function handleRouteMapCompassClick()')
    const compassEnd = source.indexOf('\n  function handleRouteLiveLocationZoomChange', compassStart)
    const compassBlock = source.slice(compassStart, compassEnd)
    expect(compassStart).toBeGreaterThan(-1)
    expect(compassEnd).toBeGreaterThan(compassStart)
    expect(compassBlock).toContain("routeLiveLocationOrientationModeRef.current = 'north-up'")
    expect(compassBlock).toContain('map.easeTo({')
    expect(compassBlock).toContain('bearing: 0')
    expect(compassBlock).not.toContain('center:')
    expect(compassBlock).not.toContain('zoom:')
    expect(source).not.toContain('transition-transform duration-200')
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
    expect(source).not.toMatch(/localStorage\.setItem\([^\n]*orientation/i)
    expect(source).toContain("'zoom_changed',")
    expect(source).toContain('if (decision.moveCamera) moveRouteLiveLocationCamera()')
    expect(source.match(/<LiveLocationControls/g)).toHaveLength(2)
    expect(liveLocationControlsSource).toContain(
      'className="inline-flex h-10 w-10 items-center justify-center',
    )
  })

  it('keeps the live puck above collapsible mobile route settings', () => {
    expect(source).toContain('ref={routeBottomStripRef}')
    expect(source).toContain('resolveLiveLocationCameraOffset(')
    expect(source).toContain('map.getContainer().clientHeight')
    expect(source).toContain('offset,')
    expect(source).toContain('isRouteMapSettingsCollapsed')
    expect(source.match(/<LiveDriveMapControls/g)).toHaveLength(2)
    expect(liveDriveControlsSource).toContain('aria-controls="road-map-live-drive-settings"')
    expect(source).toContain("t('roadMapPrototypeRouteSettingsCollapse')")
    expect(source).toContain("t('roadMapPrototypeRouteSettingsExpand')")
    expect(messagesIs).toContain('"roadMapPrototypeRouteSettingsCollapse": "Fela stillingar"')
    expect(messagesIs).toContain('"roadMapPrototypeRouteSettingsExpand": "Sýna stillingar"')
    expect(messagesEn).toContain('"roadMapPrototypeRouteSettingsCollapse": "Hide settings"')
    expect(messagesEn).toContain('"roadMapPrototypeRouteSettingsExpand": "Show settings"')
  })

  it('keeps the directional puck geographically aligned and honors reduced motion', () => {
    expect(source).toContain('point.headingDeg - map.getBearing()')
    expect(source).toContain('nearestEquivalentHeadingDegrees(')
    expect(source).toContain('routeLiveLocationPuckVisualAngleRef.current = visualHeading')
    expect(source).toContain('routeLiveLocationPuckVisualAngleRef.current = null')
    expect(source).toContain('routeLiveLocationOrientationModeRef.current,')
    expect(source).toContain('...(bearing !== null ? { bearing } : {})')
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
    expect(source).toContain('providerLabel: station.stationName')
    expect(source).toContain('liveVegagerdinStationFromRoutePoint(point, routeThresholdsRef.current)')
    expect(source).toContain('showNameLabel: false')
    expect(source).toContain('mode={routeStatusFilterMode}')
    expect(source).not.toContain('alwaysShowWithinLimits\n              mode={routeStatusFilterMode}')
  })

  it('hides stations without wind measurements by default while preserving measured statuses', () => {
    expect(source).toContain("status => status !== 'no_data' && status !== 'no_wind_data'")
    expect(source).toContain('createDefaultRouteVisibleWindStatuses,')
    expect(source).toContain('handleRouteStatusFilterChange(createDefaultRouteVisibleWindStatuses())')
    expect(source).toMatch(/combineNoWindDataStatuses\s*\/>/)
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

  it('uses the mapped wind-gap length in the route detail explanation', () => {
    expect(source).toContain('const weatherCoverageGapKm = weatherEvidence?.measurementGaps.reduce(')
    expect(source).toContain('distance: formatNum(weatherCoverageGapKm, locale)')
  })

  it('updates Vegagerðin station cards in place during live refreshes', () => {
    const renderStart = source.indexOf('function renderVegagerdinStations(')
    const renderEnd = source.indexOf('\n  function routeSurfaceChoiceLabel(', renderStart)
    const renderBlock = source.slice(renderStart, renderEnd)

    expect(renderStart).toBeGreaterThan(-1)
    expect(renderEnd).toBeGreaterThan(renderStart)
    expect(renderBlock).toContain('currentMarkersByStationId')
    expect(renderBlock).toContain('updateLiveVegagerdinStationLabelInPlace(current.element, nextElement)')
    expect(renderBlock).toContain('current.point = point')
    expect(renderBlock).not.toContain('clearRouteVegagerdinLabelMarkers()')
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
    expect(source).toContain('directionDegrees: station.windDirectionDeg')
    expect(liveStationSource).toContain('windDirectionDeg: point.windDirectionDeg')
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

  it('uses the transient live presentation and keeps navigation endpoints separate from assessment', () => {
    expect(source).toContain('resolveLiveRouteMapPresentation({')
    expect(source).toContain('applyLiveRouteMapPresentation(true)')
    expect(source).toContain('applyLiveRouteMapPresentationRef.current(false)')
    expect(source).toContain('presentation.roadSegmentsFilter as Parameters<typeof map.setFilter>[1]')
    expect(source).toContain('shouldShowRouteEndpointMarker({')
    expect(source).toContain('livePuckVisible: routeLiveLocationMarkerRef.current !== null')
    expect(source).toContain('routeEndpointMarkersAreCurrentRef.current = false')
    expect(source).toContain('routeEndpointMarkersAreCurrentRef.current = true')
    expect(source).toContain('setRoutePlaceFallbackSuggestion(null)\n    clearRouteEndpointMarkers()')
    expect(source).toContain("kind: 'origin' | 'destination' | 'coverage-start' | 'coverage-end'")
    expect(source).toContain("t('roadMapPrototypeCoverageStartMarker'")
    expect(source).toContain("t('roadMapPrototypeCoverageEndMarker'")

    const routeChoiceStart = source.indexOf('async function handleSelectSurfaceRouteChoice(')
    const routeChoiceEnd = source.indexOf('\n  function requestWeatherResultsFocus(', routeChoiceStart)
    const routeChoiceBlock = source.slice(routeChoiceStart, routeChoiceEnd)

    expect(routeChoiceStart).toBeGreaterThan(-1)
    expect(routeChoiceEnd).toBeGreaterThan(routeChoiceStart)
    expect(routeChoiceBlock).toContain('from: resolvedPlaces.assessmentOrigin.name')
    expect(routeChoiceBlock).toContain('to: resolvedPlaces.assessmentDestination.name')
    expect(routeChoiceBlock).toMatch(
      /refreshRouteChoiceEnvelope\(\s*choice,\s*resolvedPlaces,\s*controller\.signal,\s*\)/,
    )
    expect(routeChoiceBlock).toMatch(
      /refreshRouteChoiceEnvelope\(\s*choiceToApply,\s*resolvedPlaces,\s*controller\.signal,\s*\)/,
    )
    expect(routeChoiceBlock).toContain('places: resolvedPlaces')

    expect(source).toContain(
      'resolvedPlaces?.navigationOrigin ?? routeHandoffOnlySummary?.navigationOrigin ?? null',
    )
    expect(source).toContain(
      'resolvedPlaces?.navigationDestination ?? routeHandoffOnlySummary?.navigationDestination ?? null',
    )

    const summaryStart = source.indexOf(
      ') : routeResultsVisibility.showSummary && routeBridgeSummary && routeTravelResult ? (',
    )
    const summaryEnd = source.indexOf(
      ") : routeResultsDisplayState === 'handoff-only' && routeHandoffOnlySummary ? (",
      summaryStart,
    )
    const summaryBlock = source.slice(summaryStart, summaryEnd)
    const cardsIndex = summaryBlock.indexOf('renderRouteSurfaceChoices()')
    const weatherIndex = summaryBlock.indexOf('data-route-weather-results="true"')
    const handoffIndex = summaryBlock.indexOf('<RouteNavigationHandoff')

    expect(summaryStart).toBeGreaterThan(-1)
    expect(summaryEnd).toBeGreaterThan(summaryStart)
    expect(cardsIndex).toBeGreaterThan(-1)
    expect(weatherIndex).toBeGreaterThan(cardsIndex)
    expect(handoffIndex).toBeGreaterThan(weatherIndex)
    expect(summaryBlock).toContain('originName: routeBridgeSummary.fromName')
    expect(summaryBlock).toContain('destinationName: routeBridgeSummary.toName')
    expect(summaryBlock).toContain('origin: routeBridgeSummary.navigationOrigin')
    expect(summaryBlock).toContain('destination: routeBridgeSummary.navigationDestination')
    expect(summaryBlock).toContain('originName: routeBridgeSummary.navigationOriginName')
    expect(summaryBlock).toContain('destinationName: routeBridgeSummary.navigationDestinationName')

    const handoffOnlyStart = summaryEnd
    const handoffOnlyEnd = source.indexOf(
      ") : routeResultsDisplayState === 'route-loading'",
      handoffOnlyStart,
    )
    const handoffOnlyBlock = source.slice(handoffOnlyStart, handoffOnlyEnd)

    expect(handoffOnlyEnd).toBeGreaterThan(handoffOnlyStart)
    expect(handoffOnlyBlock).toContain('<p role="status"')
    expect(handoffOnlyBlock).toContain('<RouteNavigationHandoff')
    expect(handoffOnlyBlock).toContain('assessment={routeHandoffOnlySummary.assessment}')
    expect(handoffOnlyBlock).toContain(
      "routeHandoffOnlySummary.reason === 'weather_unavailable'",
    )
    expect(handoffOnlyBlock).toContain('renderRouteSurfaceChoices()')
    expect(handoffOnlyBlock).toContain('handleRetryRouteForecast')
    expect(handoffOnlyBlock).not.toContain('<DriveJourneyPanel')
    expect(handoffOnlyBlock).not.toContain('roadMapPrototypeStartDriving')

    expect(source.match(/<RouteNavigationHandoff/g)).toHaveLength(2)
    expect(source).toContain('selectedRouteChoiceId === routeBridgeSummary.selectedRouteId')
    expect(source).toContain('routeResultsVisibility.showWeather && (')
    expect(source).toContain(
      '{routeResultsVisibility.showWeather && routeBridgeSummary && routeTravelResult && (',
    )
    expect(source).not.toContain("t('roadMapPrototypeRouteWarningBanner')")
    expect(source).not.toContain("t('roadMapPrototypeRouteWarningBannerEmphasis')")
    expect(messagesIs).toContain('"roadMapPrototypeCoverageAssessmentTitle"')
    expect(messagesIs).toContain('"roadMapPrototypeCoverageGoogleDirections"')
    expect(messagesIs).toContain('"roadMapPrototypeCoverageSettlementBoundary"')
    expect(messagesEn).toContain('"roadMapPrototypeCoverageRouteTitle"')
    expect(messagesEn).toContain('"roadMapPrototypeCoverageGoogleDirections"')
    expect(messagesEn).toContain('"roadMapPrototypeCoverageOfficialRoadBoundary"')
  })
})
