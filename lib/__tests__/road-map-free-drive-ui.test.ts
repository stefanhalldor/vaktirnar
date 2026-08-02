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
const navigationSource = readFileSync(
  join(process.cwd(), 'lib/weather/roadMapNavigation.ts'),
  'utf8',
)
const messagesIs = readFileSync(join(process.cwd(), 'messages/is.json'), 'utf8')
const messagesEn = readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8')

describe('RoadMap free-drive Phase 1 contracts', () => {
  it('offers free-drive before route planning without fabricating route state', () => {
    const freeDriveUi = source.indexOf('id="road-map-free-drive-title"')
    const routeForm = source.indexOf('<form ref={formRef}', freeDriveUi)
    expect(freeDriveUi).toBeGreaterThan(-1)
    expect(routeForm).toBeGreaterThan(freeDriveUi)
    expect(source).toContain("type LiveDriveMode,")
    expect(source).toContain("setLiveDriveModeState('free-drive')")
    expect(source).toContain("startRouteLiveLocation('free-drive')")
    expect(source).toContain("t('roadMapPrototypeFreeDrivePlanInstead')")
    expect(source).toContain('onClick={openRoutePlanningDestination}')
    expect(source).toContain("type RoutePlanningStep = 'idle' | 'destination' | 'origin' | 'thresholds'")
    expect(messagesIs).toContain(
      '"roadMapPrototypeFreeDrivePlanInstead": "Eða skipuleggja ferð"',
    )
    expect(messagesEn).toContain(
      '"roadMapPrototypeFreeDrivePlanInstead": "Or plan a trip"',
    )
    expect(source).toContain('id="road-map-plan-trip-title"')
    expect(source).toContain("t('roadMapPrototypeFreeDrivePlanStart')")
    expect(messagesIs).toContain(
      '"roadMapPrototypeFreeDrivePlanStart": "Skipuleggja ferð"',
    )
    const startHandlerStart = source.indexOf('function beginFreeDrive()')
    const startHandlerEnd = source.indexOf('\n  function handleStartFreeDrive()', startHandlerStart)
    const startHandler = source.slice(startHandlerStart, startHandlerEnd)
    const invalidationStart = source.indexOf('function invalidateRouteRequests()')
    const invalidationEnd = source.indexOf('\n  function openRoutePlanningDestination()', invalidationStart)
    const invalidation = source.slice(invalidationStart, invalidationEnd)
    expect(startHandler).toContain('invalidateRouteRequests()')
    expect(invalidation).toContain('abortControllerRef(routeBridgeRequestRef)')
    expect(invalidation).toContain('abortControllerRef(routeDiscoveryRequestRef)')
    expect(startHandler).not.toContain('handleRouteBridgeSubmit')
  })

  it('uses a destination-first planning wizard while preserving the existing route submit', () => {
    expect(source).toContain("const [routePlanningStep, setRoutePlanningStep] = useState<RoutePlanningStep>('idle')")
    expect(source).toContain("setRoutePlanningStep('destination')")
    expect(source).toContain("setActiveRouteFieldState('to')")
    expect(source).toContain("setRoutePlanningStep('origin')")
    expect(source).toContain("setRoutePlanningStep('thresholds')")
    expect(source).toContain("setActiveRouteFieldState('from')")
    expect(source).toContain("routePlanningStep === 'destination'")
    expect(source).toContain("t('roadMapPrototypeRoutePlanningDestinationTitle')")
    expect(source).toContain("t('roadMapPrototypeRoutePlanningOriginTitle')")
    expect(source).toContain("t('roadMapPrototypeRoutePlanningThresholdsTitle')")
    expect(source).toContain("t('roadMapPrototypeRoutePlanningLoadingTitle')")
    expect(source).toContain("t('roadMapPrototypeRoutePlanningDestinationStep')")
    expect(source).toContain("t('roadMapPrototypeRoutePlanningOriginStep')")
    expect(source).toContain("t('roadMapPrototypeRoutePlanningThresholdsStep')")
    expect(source).toContain("aria-current={routePlanningStep === 'destination' ? 'step' : undefined}")
    expect(source).toContain("t('roadMapPrototypeRoutePlanningContinue')")
    expect(source).toContain('onSubmit={handleRouteBridgeSubmit}')
    const originStepStart = source.indexOf("{routePlanningStep === 'origin' && (")
    const originStepEnd = source.indexOf("{routePlanningStep === 'thresholds' && (", originStepStart)
    const originStep = source.slice(originStepStart, originStepEnd)
    expect(originStep).toContain('allowCurrentLocation')
    expect(originStep).toContain('showCurrentLocationOnAllViewports')
    expect(source).toContain("setActiveRouteFieldState(routePlanningStep === 'origin' ? 'from' : 'to')")
    expect(source).toContain("if (routePlanningStep !== 'origin' && !toResolved)")
    expect(messagesIs).toContain('"roadMapPrototypeRoutePlanningDestinationTitle": "Hvert ertu að fara?"')
    expect(messagesIs).toContain('"roadMapPrototypeRoutePlanningLoadingTitle": "Finn leiðir og skoða veðurspárgildi"')
    expect(messagesEn).toContain('"roadMapPrototypeRoutePlanningDestinationTitle": "Where are you going?"')
  })

  it('lets resolved planning steps navigate through one guarded transition path', () => {
    const transitionStart = source.indexOf('function goToRoutePlanningStep(')
    const transitionEnd = source.indexOf('\n  function handleRoutePlanningContinue()', transitionStart)
    const transition = source.slice(transitionStart, transitionEnd)
    const continueStart = transitionEnd
    const continueEnd = source.indexOf('\n  function handleRoutePlanningBack()', continueStart)
    const continueHandler = source.slice(continueStart, continueEnd)
    const stepsStart = source.indexOf("aria-label={t('roadMapPrototypeRoutePlanningStepsLabel')}")
    const stepsEnd = source.indexOf('\n\n                    {routePlanningStep === \'destination\'', stepsStart)
    const steps = source.slice(stepsStart, stepsEnd)

    expect(transitionStart).toBeGreaterThan(-1)
    expect(transitionEnd).toBeGreaterThan(transitionStart)
    expect(transition).toContain("if (target === routePlanningStep) return")
    expect(transition).toContain("if (target === 'destination')")
    expect(transition).toContain('if (!toResolved)')
    expect(transition).toContain("if (target === 'origin')")
    expect(transition).toContain('if (!fromResolved)')
    expect(continueHandler).toContain("goToRoutePlanningStep('origin')")
    expect(continueHandler).toContain("goToRoutePlanningStep('thresholds')")

    expect(steps).toContain('type="button"')
    expect(steps).toContain("onClick={() => goToRoutePlanningStep('destination')}")
    expect(steps).toContain("onClick={() => goToRoutePlanningStep('origin')}")
    expect(steps).toContain("onClick={() => goToRoutePlanningStep('thresholds')}")
    expect(steps).toContain('disabled={!toResolved}')
    expect(steps).toContain('disabled={!toResolved || !fromResolved}')
    expect(steps).toContain('aria-current={routePlanningStep === \'destination\' ? \'step\' : undefined}')
    expect(steps).toContain('min-h-10')
    expect(steps).toContain('focus-visible:ring-2')
    expect(steps).toContain('disabled:cursor-not-allowed')
  })

  it('shows the route-loading title before the wind-limit planning title', () => {
    const panelHeaderStart = source.indexOf('{/* Panel header */}')
    const headerStart = source.indexOf('{routeBridgeSummary', panelHeaderStart)
    const headerEnd = source.indexOf('</p>', headerStart)
    const header = source.slice(headerStart, headerEnd)
    const loadingTitle = header.indexOf("t('roadMapPrototypeRoutePlanningLoadingTitle')")
    const thresholdsTitle = header.indexOf("t('roadMapPrototypeRoutePlanningThresholdsTitle')")

    expect(loadingTitle).toBeGreaterThan(-1)
    expect(thresholdsTitle).toBeGreaterThan(loadingTitle)
  })

  it('keeps fresh planning thresholds explicit and separate from saved live-drive values', () => {
    const openerStart = source.indexOf('function openRoutePlanningDestination()')
    const openerEnd = source.indexOf('\n  function handleRoutePlanningContinue()', openerStart)
    const opener = source.slice(openerStart, openerEnd)
    expect(opener).toContain("setRoutePlanningCautionWind('')")
    expect(opener).toContain("setRoutePlanningRedWind('')")
    expect(opener).not.toContain('savedRouteThresholds')

    expect(source).toContain("const [routePlanningCautionWind, setRoutePlanningCautionWind] = useState('')")
    expect(source).toContain("const [routePlanningRedWind, setRoutePlanningRedWind] = useState('')")
    expect(source).toContain('cautionValue={routePlanningCautionWind}')
    expect(source).toContain('dangerValue={routePlanningRedWind}')
    expect(source).toContain("t('roadMapPrototypeRoutePlanningUseSavedThresholds'")
    expect(source).toContain("const isPlanningSubmission = routePlanningStep === 'thresholds'")
  })

  it('hides the free-drive card throughout the active planning wizard', () => {
    const formStart = source.indexOf('<form ref={formRef}')
    const freeDriveSectionStart = source.lastIndexOf("{routePlanningStep === 'idle' && (", formStart)
    expect(freeDriveSectionStart).toBeGreaterThan(-1)
    expect(freeDriveSectionStart).toBeLessThan(formStart)
    expect(source).toContain("disabled={!toResolved}")
    expect(source).toContain("disabled={!fromResolved}")
  })

  it('stops free-drive tracking before opening the destination planning step', () => {
    const handlerStart = source.indexOf('function handlePlanRoute()')
    const handlerEnd = source.indexOf('\n  function handleOpenFreeDriveSetup()', handlerStart)
    const handler = source.slice(handlerStart, handlerEnd)
    expect(handler.indexOf('routeLiveLocationPointRef.current')).toBeLessThan(
      handler.indexOf('stopRouteLiveLocation()'),
    )
    expect(handler).toContain('routeOriginFromLiveLocation(')
    expect(source).toContain(
      "const tPlaceSearch = useTranslations('teskeid.vedrid.placeSearch')",
    )
    expect(handler).toContain("tPlaceSearch('currentLocationName')")
    expect(handler).not.toContain("t('currentLocationName')")
    expect(handler).not.toContain("t('placeSearch.currentLocationName')")
    expect(handler).toContain('stopRouteLiveLocation()')
    expect(handler).toContain("setLiveDriveModeState('off')")
    expect(handler).toContain('handleEditRoute()')
    expect(handler).toContain('openRoutePlanningDestination()')
    expect(handler).toContain('setFromResolved(freeDriveOrigin)')
    expect(handler).toContain("openRouteContext('information')")
  })

  it('returns authenticated users to threshold setup and never starts GPS on mount', () => {
    const hydrationStart = source.indexOf("if (params.get('drive') === '1')")
    const hydrationEnd = source.indexOf("if (params.get('restoreRoute')", hydrationStart)
    const hydrationBlock = source.slice(hydrationStart, hydrationEnd)
    expect(hydrationStart).toBeGreaterThan(-1)
    expect(hydrationEnd).toBeGreaterThan(hydrationStart)
    expect(hydrationBlock).toContain('setFreeDriveSetupOpen(true)')
    expect(hydrationBlock).toContain("openRouteContext('information')")
    expect(hydrationBlock).not.toContain("setLiveDriveModeState('free-drive')")
    expect(hydrationBlock).not.toContain('startRouteLiveLocation(')

    expect(navigationSource).toContain("view: 'information'")
    expect(navigationSource).toContain("drive: '1'")
    const publicStart = source.indexOf('buildRoadMapFreeDriveSignInReturnHref(navigation)')
    const publicEnd = source.indexOf("t('roadMapPrototypeFreeDrivePrivacySafety')", publicStart)
    const publicBlock = source.slice(publicStart, publicEnd)
    expect(publicBlock).not.toContain('persistRouteReturnSnapshot')
    expect(publicBlock).not.toContain('watchLiveLocation')
  })

  it('keeps free-drive free of route layers and route-specific live presentation', () => {
    const contextStart = source.indexOf('function applyMapContextVisibility(')
    const branchStart = source.indexOf(
      "if (liveDriveModeRef.current === 'free-drive') {",
      contextStart,
    )
    const branchEnd = source.indexOf('\n    clearWeatherChaseMapMarkers()', branchStart + 1)
    const branch = source.slice(branchStart, branchEnd)
    expect(branch).toContain("setRouteLayerLayoutVisibility(map, 'travel-bridge-route', false)")
    expect(branch).toContain('setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, false)')
    expect(branch).toContain('updateOverviewMarkerVisibility(')
    expect(source).toContain("if (mode === 'route') applyLiveRouteMapPresentation(true)")
  })

  it('clears an existing route before free-drive and rejects stale route visibility updates', () => {
    const beginStart = source.indexOf('function beginFreeDrive()')
    const beginEnd = source.indexOf('\n  function handleStartFreeDrive()', beginStart)
    const begin = source.slice(beginStart, beginEnd)
    const clearStart = source.indexOf('function resetRouteOwnedState()')
    const clearEnd = source.indexOf('\n  function updateViewportWindDirectionMarkers()', clearStart)
    const clear = source.slice(clearStart, clearEnd)
    const visibilityStart = source.indexOf('function updateRouteWeatherLayerVisibility(')
    const routeActiveCheck = source.indexOf('\n    if (routeActiveRef.current) {', visibilityStart)
    const freeDriveGuard = source.slice(visibilityStart, routeActiveCheck)

    expect(beginStart).toBeGreaterThan(-1)
    expect(begin.indexOf('invalidateRouteRequests()')).toBeLessThan(
      begin.indexOf('resetRouteOwnedState()'),
    )
    expect(begin.indexOf('resetRouteOwnedState()')).toBeLessThan(
      begin.indexOf('clearRouteOwnedMapPresentation()'),
    )
    expect(begin.indexOf('clearRouteOwnedMapPresentation()')).toBeLessThan(
      begin.indexOf("setLiveDriveModeState('free-drive')"),
    )
    expect(begin).not.toContain('stopRouteLiveLocation()')

    expect(clear).toContain('routeActiveRef.current = false')
    expect(clear).toContain('setRouteActive(false)')
    expect(clear).toContain('setRouteBridgeSummary(null)')
    expect(clear).toContain('setRouteHandoffOnlySummary(null)')
    expect(clear).toContain('setRouteTravelResult(null)')
    expect(clear).toContain('setRouteSurfaceChoices([])')
    expect(clear).toContain("setRoutePlanningStep('idle')")
    expect(begin).toContain('clearRouteOwnedMapPresentation()')
    expect(clear).not.toContain('setRouteCautionWind(')
    expect(clear).not.toContain('setRouteRedWind(')

    expect(freeDriveGuard).toContain("if (liveDriveModeRef.current === 'free-drive')")
    expect(freeDriveGuard).toContain('setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, false)')
    expect(freeDriveGuard).toContain('setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID, false)')
    expect(freeDriveGuard).toContain('updateOverviewMarkerVisibility(')
    expect(freeDriveGuard).toContain('freeDriveVisibleStatusesRef.current')
    expect(freeDriveGuard).toContain('return')
    expect(freeDriveGuard).not.toContain('hideOverviewStationMarkers()')
  })

  it('keeps station refresh visible-only, single-flight and independent of GPS callbacks', () => {
    const pollingStart = source.indexOf("if (liveDriveMode !== 'free-drive' || overviewVegagerdinRestricted) return")
    const pollingEnd = source.indexOf('\n  useEffect(() => {', pollingStart + 1)
    const polling = source.slice(pollingStart, pollingEnd)
    expect(polling).toContain('if (disposed || inFlight || document.visibilityState')
    expect(polling).toContain("fetch('/api/teskeid/weather/vegagerdin/current', {")
    expect(polling).toContain("cache: 'no-store'")
    expect(polling).toContain('requestController?.abort()')
    expect(polling).not.toMatch(/routeLiveLocationPoint|accuracyM|headingDeg|speedMs/)

    const gpsStart = source.indexOf('function startRouteLiveLocation(')
    const gpsEnd = source.indexOf('\n  function handleToggleRouteLiveLocation', gpsStart)
    expect(source.slice(gpsStart, gpsEnd)).not.toContain('/api/teskeid/weather/vegagerdin/current')
  })

  it('shares one live-location controller and the same live presentation across both drive modes', () => {
    expect(source.match(/watchLiveLocation\(/g)).toHaveLength(1)
    expect(source).toContain("mode: Exclude<LiveDriveMode, 'off'>")
    expect(source.match(/<LiveLocationControls/g)).toHaveLength(2)
    expect(source.match(/<LiveDriveMapControls/g)).toHaveLength(2)
    expect(liveLocationControlsSource).toContain('export function LiveLocationControls(')
    expect(liveDriveControlsSource).toContain('export function LiveDriveMapControls(')
    expect(liveLocationControlsSource).toContain('onZoomChange: (delta: -1 | 1) => void')
  })

  it('separates station freshness and keeps aggregate counts inside one wind status', () => {
    expect(liveStationSource).toContain('classifyLiveVegagerdinStationWindStatus(station, thresholds)')
    expect(source).toContain('freeDriveAggregateStatus(rawStatus)')
    expect(source).toContain('overviewStationClusterKey(spatialKey, status, freeDrive)')
    expect(source).toContain('FREE_DRIVE_AGGREGATE_MARKER_OFFSETS[group.status]')
    expect(source).toContain('if (freeDrive) return freeDriveAggregateStationCountLabel(entries.length)')
    expect(source).toContain('createDefaultFreeDriveVisibleWindStatuses()')
    expect(source).toContain('createDefaultFreeDriveVisibleWindStatuses,')
    expect(source).toContain('const effectiveStatuses = freeDrive ? freeDriveVisibleStatusesRef.current : statuses')
    expect(source).not.toContain('if (freeDrive) return `${formatNum(averageOverviewWindMs')
  })

  it('self-heals free-drive station markers and never clears them before map readiness', () => {
    const markerEffectStart = source.indexOf("const useLivePresentation = liveDriveMode === 'free-drive'")
    const markerEffectEnd = source.indexOf('\n  useEffect(() => {', markerEffectStart + 1)
    const markerEffect = source.slice(markerEffectStart, markerEffectEnd)
    expect(markerEffect.indexOf("if (!map?.isStyleLoaded() || !Marker)")).toBeLessThan(
      markerEffect.indexOf('clearOverviewMarkerSet(overviewVegagerdinMarkersRef)'),
    )
    expect(markerEffect).toContain("map?.once('idle', retryWhenReady)")
    expect(markerEffect).toContain('overviewMarkerReconcileVersion')

    const hideStart = source.indexOf('function hideOverviewStationMarkers()')
    const hideEnd = source.indexOf('\n  function setRouteLayerLayoutVisibility(', hideStart)
    const hide = source.slice(hideStart, hideEnd)
    expect(hide).toContain("if (liveDriveModeRef.current === 'free-drive')")
    expect(hide).toContain('scheduleOverviewMarkerReconciliation()')
    expect(source).toContain("map.on('idle', scheduleOverviewMarkerReconciliation)")
  })

  it('hides place names only at the free-drive country overview', () => {
    const visibilityStart = source.indexOf('function reconcilePlaceMarkerVisibility()')
    const visibilityEnd = source.indexOf('\n  function clearWeatherChaseMapMarkers()', visibilityStart)
    const visibility = source.slice(visibilityStart, visibilityEnd)
    expect(visibility).toContain("liveDriveModeRef.current === 'free-drive'")
    expect(visibility).toContain("overviewDensityLevelForZoom(zoom) === 'aggregate'")
    expect(visibility).toContain('!freeDriveCountryOverview')
  })

  it('uses the route station-card renderer on the map and removes the bespoke nearby drawer', () => {
    expect(source).toContain('function createLiveVegagerdinStationLabel(')
    expect(source).toContain('liveVegagerdinStationFromCurrent(station, overviewThresholds)')
    expect(source).toContain('liveVegagerdinStationFromRoutePoint(point, routeThresholdsRef.current)')
    expect(source).toContain("const useLivePresentation = liveDriveMode === 'free-drive'")
    expect(source).toContain('? createLiveVegagerdinStationLabel(liveStation, {')
    expect(source).toContain('updateLiveVegagerdinStationLabelInPlace(current.element, element)')
    expect(source).toContain('updateLiveVegagerdinStationLabelInPlace(current.element, nextElement)')
    expect(source).toContain("element.dataset.liveVegagerdinStation = 'true'")
    expect(source).toContain('additionalAriaParts: [')
    expect(source).toContain('LIVE_DRIVE_TEMPERATURE_MAX_C')
    expect(source).toContain('liveTemperatureMetrics: true')
    expect(source).toContain("'[data-live-route-temperature-metric=\"true\"]'")
    expect(source).toContain("'[data-live-route-temperature-row=\"true\"]'")
    expect(source).toContain("metric.style.display = suppressed ? 'none' : 'flex'")
    expect(source).toContain("temperatureRow.style.display = 'none'")
    expect(source).toContain('`repeat(${visibleMetrics.length}, minmax(0, 1fr))`')
    expect(source).toContain("metric.textContent = suppressed\n        ? ''")
    expect(source).not.toContain('freeDriveNearbyStations')
    expect(source).not.toContain('free-drive-nearby-stations')
  })

  it('requires valid shared thresholds before the explicit GPS gesture and autosaves them', () => {
    const openSetup = source.indexOf('function handleOpenFreeDriveSetup()')
    const beginDrive = source.indexOf('function beginFreeDrive()')
    const confirmDrive = source.indexOf('function handleStartFreeDrive()')
    expect(openSetup).toBeGreaterThan(-1)
    expect(beginDrive).toBeGreaterThan(openSetup)
    expect(confirmDrive).toBeGreaterThan(beginDrive)
    expect(source.slice(openSetup, beginDrive)).not.toContain('startRouteLiveLocation(')
    const confirmBlock = source.slice(confirmDrive, source.indexOf('\n  function handleResumeFreeDrive()', confirmDrive))
    expect(confirmBlock).toContain('resolveRouteThresholdInputs()')
    expect(confirmBlock).toContain('beginFreeDrive()')
    expect(confirmBlock).toContain("method: 'PUT'")
    expect(confirmBlock).toContain("'/api/teskeid/weather/preferences/thresholds'")
    expect(source).toContain('<LiveDriveThresholdFields')
    expect(source).toContain('idPrefix="free-drive"')
    expect(source).toContain('idPrefix="route-planning"')
    const preferencesStart = source.indexOf("fetch('/api/teskeid/weather/preferences/thresholds'")
    const preferencesEnd = source.indexOf('\n  useEffect(() => {', preferencesStart + 1)
    const preferences = source.slice(preferencesStart, preferencesEnd)
    expect(preferences).toContain('setSavedRouteThresholds')
    expect(preferences).not.toContain('setRouteCautionWind(')
    expect(preferences).not.toContain('setRouteRedWind(')
    expect(source.slice(openSetup, beginDrive)).toContain("setRouteCautionWind('')")
    expect(source.slice(openSetup, beginDrive)).toContain("setRouteRedWind('')")
    expect(source.match(/roadMapPrototypeRoutePlanningUseSavedThresholds/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('stops tracking in the background and requires an explicit resume gesture', () => {
    expect(source).toContain('setFreeDrivePaused(true)')
    expect(source).toContain('onClick={handleResumeFreeDrive}')
    expect(source).toContain('onClick={handleStopFreeDrive}')
    expect(source).toContain('onClick={handleFreeDriveWithoutLocation}')
    expect(source).toContain('footer={(')
  })

  it('ships concise Icelandic and English privacy and safety copy', () => {
    expect(messagesIs).toContain('"roadMapPrototypeFreeDriveStart": "Af stað"')
    expect(messagesIs).toContain('"roadMapPrototypeFreeDrivePrivacySafety"')
    expect(messagesIs).toContain('"roadMapPrototypeFreeDriveSafety"')
    expect(messagesEn).toContain('"roadMapPrototypeFreeDriveStart": "Set off"')
    expect(messagesEn).toContain('"roadMapPrototypeFreeDrivePrivacySafety"')
    expect(messagesEn).toContain('"roadMapPrototypeFreeDriveSafety"')
  })
})
