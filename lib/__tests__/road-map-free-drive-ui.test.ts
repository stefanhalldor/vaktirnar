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
    expect(source).toContain('<h2 className="mb-3 text-sm font-semibold text-foreground">')
    expect(messagesIs).toContain(
      '"roadMapPrototypeFreeDrivePlanInstead": "Eða skipuleggja ferð"',
    )
    expect(messagesEn).toContain(
      '"roadMapPrototypeFreeDrivePlanInstead": "Or plan a trip"',
    )
    const startHandlerStart = source.indexOf('function beginFreeDrive()')
    const startHandlerEnd = source.indexOf('\n  function handleStartFreeDrive()', startHandlerStart)
    const startHandler = source.slice(startHandlerStart, startHandlerEnd)
    expect(startHandler).toContain('routeBridgeRequestRef.current?.abort()')
    expect(startHandler).toContain('routeDiscoveryRequestRef.current?.abort()')
    expect(startHandler).not.toContain('handleRouteBridgeSubmit')
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

  it('separates station freshness from shared wind status and lets the worst station represent a cluster', () => {
    expect(liveStationSource).toContain('classifyLiveVegagerdinStationWindStatus(station, thresholds)')
    expect(source).toContain('overviewMarkerStatus(selected, freeDrive)')
    expect(source).toContain('overviewMarkerStatus(entry, freeDrive)')
    expect(source).toContain('if (freeDrive) return String(entries.length)')
    expect(source).toContain('const freeDriveVisibleStatusesRef = useRef<Set<WindDisplayStatus>>(new Set())')
    expect(source).toContain('const effectiveStatuses = freeDrive ? freeDriveVisibleStatusesRef.current : statuses')
    expect(source).not.toContain('if (freeDrive) return `${formatNum(averageOverviewWindMs')
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
    expect(source).toContain('idPrefix="route"')
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
