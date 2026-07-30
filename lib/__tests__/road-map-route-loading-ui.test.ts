import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  hasSaferRouteSearchFinished,
  resolveRouteResultsDisplayState,
  resolveRouteResultsVisibility,
  shouldRecalculateRouteChoice,
  type RouteBridgeDisplayStatus,
  type RouteResultsDisplayState,
} from '@/lib/road-intelligence/routeResultsDisplayState'
import {
  buildAssessmentTravelRequest,
  resolveAssessmentClientEndpoints,
} from '@/lib/road-intelligence/routeAssessmentClientFlow'
import { buildGoogleMapsDirectionsUrl } from '@/lib/iceland-routes/googleMapsDirectionsUrl'

type DisplayStateCase = {
  label: string
  bridgeStatus: RouteBridgeDisplayStatus
  hasSummary: boolean
  hasTravelResult: boolean
  safetySearchPending: boolean
  switchingChoiceId: string | null
  comparisonOpening: boolean
  hasHandoffOnly?: boolean
  expected: RouteResultsDisplayState
}

describe('road-map route results display state', () => {
  it.each<DisplayStateCase>([
    {
      label: 'initial request',
      bridgeStatus: 'loading',
      hasSummary: false,
      hasTravelResult: false,
      safetySearchPending: false,
      switchingChoiceId: null,
      comparisonOpening: true,
      expected: 'route-loading',
    },
    {
      label: 'unsafe first route while alternatives are searched',
      bridgeStatus: 'success',
      hasSummary: true,
      hasTravelResult: true,
      safetySearchPending: true,
      switchingChoiceId: null,
      comparisonOpening: true,
      expected: 'safety-search',
    },
    {
      label: 'different-route recalculation with preserved old results',
      bridgeStatus: 'success',
      hasSummary: true,
      hasTravelResult: true,
      safetySearchPending: false,
      switchingChoiceId: 'route-b',
      comparisonOpening: false,
      expected: 'route-switching',
    },
    {
      label: 'summary arrives before travel result',
      bridgeStatus: 'success',
      hasSummary: true,
      hasTravelResult: false,
      safetySearchPending: false,
      switchingChoiceId: null,
      comparisonOpening: false,
      expected: 'route-loading',
    },
    {
      label: 'travel result arrives before summary',
      bridgeStatus: 'success',
      hasSummary: false,
      hasTravelResult: true,
      safetySearchPending: false,
      switchingChoiceId: null,
      comparisonOpening: false,
      expected: 'route-loading',
    },
    {
      label: 'complete result waiting for default comparison map',
      bridgeStatus: 'success',
      hasSummary: true,
      hasTravelResult: true,
      safetySearchPending: false,
      switchingChoiceId: null,
      comparisonOpening: true,
      expected: 'comparison-opening',
    },
    {
      label: 'complete visible summary',
      bridgeStatus: 'success',
      hasSummary: true,
      hasTravelResult: true,
      safetySearchPending: false,
      switchingChoiceId: null,
      comparisonOpening: false,
      expected: 'summary',
    },
    {
      label: 'trusted assessment unavailable with exact navigation handoff',
      bridgeStatus: 'success',
      hasSummary: false,
      hasTravelResult: false,
      safetySearchPending: false,
      switchingChoiceId: null,
      comparisonOpening: false,
      hasHandoffOnly: true,
      expected: 'handoff-only',
    },
    {
      label: 'new request supersedes a stale handoff-only result',
      bridgeStatus: 'loading',
      hasSummary: false,
      hasTravelResult: false,
      safetySearchPending: false,
      switchingChoiceId: null,
      comparisonOpening: false,
      hasHandoffOnly: true,
      expected: 'route-loading',
    },
    {
      label: 'initial error',
      bridgeStatus: 'error',
      hasSummary: false,
      hasTravelResult: false,
      safetySearchPending: false,
      switchingChoiceId: null,
      comparisonOpening: false,
      expected: 'form',
    },
  ])('$label', ({ expected, label: _label, ...input }) => {
    expect(resolveRouteResultsDisplayState(input)).toBe(expected)
  })

  it('keeps exact navigation and verified assessment endpoints in separate purpose-specific contracts', () => {
    const navigationOrigin = {
      name: 'Núverandi staðsetning',
      lat: 64.083771,
      lon: -21.929006,
    }
    const navigationDestination = {
      name: 'Víðibakki',
      lat: 63.901234,
      lon: -20.201234,
    }
    const assessmentOrigin = { name: 'Garðabær', lat: 64.075, lon: -21.9 }
    const assessmentDestination = { name: 'Hella', lat: 63.9, lon: -20.203 }
    const places = {
      navigationOrigin,
      navigationDestination,
      navigationOriginName: navigationOrigin.name,
      navigationDestinationName: navigationDestination.name,
      assessmentOrigin,
      assessmentDestination,
      assessmentScope: { status: 'ready' as const, scopeId: 'assessment:v3:server-attested' },
    }

    const travelRequest = buildAssessmentTravelRequest(places, {
      trailerKind: 'none',
      // Even accidental caller fields cannot override the attested authority.
      origin: navigationOrigin,
      destination: navigationDestination,
      assessmentScopeId: 'client-forged-scope',
    })
    expect(travelRequest).toMatchObject({
      origin: assessmentOrigin,
      destination: assessmentDestination,
      assessmentScopeId: places.assessmentScope.scopeId,
    })

    const endpoints = resolveAssessmentClientEndpoints(places)
    expect(endpoints.navigation).toEqual({
      origin: navigationOrigin,
      destination: navigationDestination,
      originName: navigationOrigin.name,
      destinationName: navigationDestination.name,
    })
    expect(endpoints.assessment).toEqual({
      origin: assessmentOrigin,
      destination: assessmentDestination,
      scopeId: places.assessmentScope.scopeId,
    })
    const googleMapsUrl = buildGoogleMapsDirectionsUrl(endpoints.navigation)
    expect(googleMapsUrl).not.toBeNull()
    const parsedGoogleMapsUrl = new URL(googleMapsUrl!)
    expect(parsedGoogleMapsUrl.searchParams.get('origin')).toBe(
      `${navigationOrigin.lat},${navigationOrigin.lon}`,
    )
    expect(parsedGoogleMapsUrl.searchParams.get('destination')).toBe(
      `${navigationDestination.lat},${navigationDestination.lon}`,
    )
    expect(parsedGoogleMapsUrl.searchParams.get('origin')).not.toBe(
      `${assessmentOrigin.lat},${assessmentOrigin.lon}`,
    )
    expect(parsedGoogleMapsUrl.searchParams.get('destination')).not.toBe(
      `${assessmentDestination.lat},${assessmentDestination.lon}`,
    )

    const displayState = resolveRouteResultsDisplayState({
      bridgeStatus: 'success',
      hasSummary: true,
      hasTravelResult: true,
      safetySearchPending: false,
      switchingChoiceId: null,
      comparisonOpening: false,
    })
    expect(resolveRouteResultsVisibility({
      displayState,
      hasSummary: true,
      hasTravelResult: true,
      hasAssessedWeatherCoverage: true,
      routeChoiceCount: 2,
    })).toEqual({
      showSummary: true,
      showRouteCards: true,
      showWeather: true,
      showHandoffOnly: false,
    })
  })

  it('reuses the already-applied route and recalculates only a different selection', () => {
    expect(shouldRecalculateRouteChoice('route-a', 'route-a')).toBe(false)
    expect(shouldRecalculateRouteChoice('route-b', 'route-a')).toBe(true)
    expect(shouldRecalculateRouteChoice(null, 'route-a')).toBe(false)
  })

  it.each([
    ['active alternatives request', true, 'ready', 'loading', true, true, false],
    ['completed alternatives request', true, 'ready', 'none', true, true, true],
    ['candidate provider returned no route', true, 'no_route', 'idle', false, false, true],
    ['candidate provider became unavailable', true, 'unavailable', 'idle', false, false, true],
    ['candidate provider is slow but no longer blocks truthful Google results', true, 'slow', 'idle', false, false, true],
    ['alternatives are slow but the completed primary search remains usable', true, 'ready', 'slow', true, true, true],
    ['candidate provider is still loading', true, 'loading', 'idle', false, false, false],
    ['ready status before choices merge', true, 'ready', 'idle', false, false, false],
    ['automatic alternatives request is expected', true, 'ready', 'idle', true, true, false],
    ['all ready candidate choices were already assessed', true, 'ready', 'idle', false, true, true],
    ['candidate provider is disabled', false, 'idle', 'idle', false, false, true],
  ] as const)(
    '%s',
    (
      _label,
      routeCandidateEnabled,
      candidateStatus,
      alternativesStatus,
      automaticAlternativeSearchExpected,
      hasCandidateChoices,
      expected,
    ) => {
      expect(hasSaferRouteSearchFinished({
        routeCandidateEnabled,
        candidateStatus,
        alternativesStatus,
        automaticAlternativeSearchExpected,
        hasCandidateChoices,
      })).toBe(expected)
    },
  )

  it('connects every pending transition to the canonical loader, not route cards', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
      'utf8',
    )
    const pendingBranchStart = source.indexOf(
      ") : routeResultsDisplayState !== 'form' ? (",
    )
    const formBranchStart = source.indexOf('/* No route: route form */', pendingBranchStart)
    const pendingBranch = source.slice(pendingBranchStart, formBranchStart)

    expect(pendingBranchStart).toBeGreaterThan(-1)
    expect(formBranchStart).toBeGreaterThan(pendingBranchStart)
    expect(pendingBranch).toContain('<TeskeidLoader')
    expect(pendingBranch).not.toContain('renderRouteSurfaceChoices()')
    expect(pendingBranch).not.toContain('<DriveJourneyPanel')
    expect(source).toContain('setRouteSafetySearchPending(false)')
    expect(source).toContain('hasSaferRouteSearchFinished({')
    expect(source).toContain(
      'onClose={() => {\n            if (routeComparisonApplyPendingRef.current) return\n            restoreAppliedSurfaceRoutePreview()',
    )
    expect(source).toContain('if (!isAuthenticated || !teskeidRouteCandidateEnabled) return')
    expect(source).toContain('const scopedGoogleResult = await fetchRouteSurfaceChoices(')
    expect(source).toContain('const googleChoicesPromise = Promise.resolve(scopedGoogleResult.choices)')
    expect(source).toContain('launchFirstReadyDiscovery(runId, discoveries, applyProviderEvent)')
    expect(source).toContain('...(accessRouteEnvelope ? { accessRouteEnvelope } : {})')
    expect(source).toContain('if (!accessRouteEnvelope)')
    expect(source).toContain('assessmentScopeId,\n        alternatives,')
    expect(source).toContain("const isDepartureForecastLoading = routeForecastBuildStatus === 'loading'")
    expect(source).toContain("bridgeStatus: isRouteLoading ? 'loading' : routeBridgeStatus")
    expect(source).toContain("? t('roadMapPrototypeRouteReady')")
    expect(source).not.toContain('roadMapPrototypeRouteLoaderForecast')
    expect(source).toContain('{routeComparisonApplyPending && (')
    expect(source).toContain('className="fixed inset-0 z-[310] flex h-[100dvh]')
  })

  it('rederives scoped refreshes from navigation and suppresses node-only candidates for assessment', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
      'utf8',
    )
    const functionBlock = (startMarker: string, endMarker: string) => {
      const start = source.indexOf(startMarker)
      const end = source.indexOf(endMarker, start)
      expect(start).toBeGreaterThan(-1)
      expect(end).toBeGreaterThan(start)
      return source.slice(start, end)
    }

    const fetchChoicesBlock = functionBlock(
      'async function fetchRouteSurfaceChoices(',
      'async function fetchTeskeidCandidate(',
    )
    expect(fetchChoicesBlock).toContain(
      '...(expectedScopeId ? { expectedAssessmentScopeId: expectedScopeId } : {})',
    )
    expect(fetchChoicesBlock).toContain(
      "if (res.status === 409) throw new Error('assessment_scope_mismatch')",
    )
    expect(fetchChoicesBlock).toContain('assessmentScope.scopeId !== expectedScopeId')
    expect(fetchChoicesBlock).toContain(
      'envelope.assessmentScopeId === assessmentScope.scopeId',
    )
    expect(fetchChoicesBlock).toContain("assessmentScope.reason === 'road_graph_unavailable'")
    expect(fetchChoicesBlock).toContain("assessmentScope.reason === 'assessment_area_unavailable'")
    expect(fetchChoicesBlock).toContain("assessmentScope.reason === 'no_connected_official_road'")
    expect(fetchChoicesBlock).toContain('await waitForAbortableBrowser(delay, signal)')

    const accessBlock = functionBlock(
      'async function resolveTeskeidAccessEnvelope(',
      'async function refreshRouteChoiceEnvelope(',
    )
    expect(accessBlock).toMatch(
      /fetchRouteSurfaceChoices\(\s*places\.navigationOrigin,\s*places\.navigationDestination,\s*signal,\s*places\.assessmentScope\.scopeId,\s*\)/,
    )
    expect(accessBlock).toContain(
      'choice.routeEnvelope?.assessmentScopeId === places.assessmentScope.scopeId',
    )
    expect(accessBlock).not.toContain('places.assessmentOrigin')
    expect(accessBlock).not.toContain('places.assessmentDestination')

    const refreshBlock = functionBlock(
      'async function refreshRouteChoiceEnvelope(',
      'async function handleRetryTeskeidCandidate()',
    )
    expect(refreshBlock).toMatch(
      /resolveTeskeidAccessEnvelope\(\s*places,\s*signal,\s*\)/,
    )
    expect(refreshBlock).toMatch(
      /fetchTeskeidCandidateWithRetry\(\s*places\.assessmentOrigin,\s*places\.assessmentDestination,\s*places\.assessmentScope\.scopeId,\s*signal,/,
    )
    expect(refreshBlock).toContain('if (!canRequestTeskeidCandidate(places))')
    expect(refreshBlock).toMatch(
      /fetchRouteSurfaceChoices\(\s*places\.navigationOrigin,\s*places\.navigationDestination,\s*signal,\s*places\.assessmentScope\.scopeId,\s*\)/,
    )
    expect(refreshBlock).toContain("choice.route.provider === 'teskeid'")
    expect(refreshBlock).toContain('? exactRefreshedChoice')
    expect(refreshBlock).toContain("if (!refreshedChoice) throw new Error('route_unavailable')")

    const retryBlock = functionBlock(
      'async function handleRetryTeskeidCandidate()',
      'async function handleFindMoreTeskeidRoutes()',
    )
    expect(retryBlock).toMatch(
      /resolveTeskeidAccessEnvelope\(\s*places,\s*signal,\s*\)/,
    )
    expect(retryBlock).toMatch(
      /fetchTeskeidCandidateWithRetry\(\s*places\.assessmentOrigin,\s*places\.assessmentDestination,\s*places\.assessmentScope\.scopeId,\s*signal,/,
    )
    expect(retryBlock).toContain('!canRequestTeskeidCandidate(places)')

    const alternativesBlock = functionBlock(
      'async function handleFindMoreTeskeidRoutes()',
      'async function hydrateRouteSurfaceChoiceSummaries(',
    )
    expect(alternativesBlock).toMatch(
      /resolveTeskeidAccessEnvelope\(\s*places,\s*controller\.signal,\s*\)/,
    )
    expect(alternativesBlock).toMatch(
      /fetchTeskeidCandidateWithRetry\(\s*places\.assessmentOrigin,\s*places\.assessmentDestination,\s*places\.assessmentScope\.scopeId,\s*controller\.signal,/,
    )
    expect(alternativesBlock).toContain('!canRequestTeskeidCandidate(places)')
    expect(alternativesBlock).toContain("if (result.status === 'no_route')")
    expect(source).toContain('onFindMore={teskeidAlternativesCanRun')

    const submitBlock = functionBlock(
      'async function handleRouteBridgeSubmit(',
      'async function handleSelectSurfaceRouteChoice(',
    )
    expect(submitBlock).toMatch(
      /fetchRouteSurfaceChoices\(\s*origin,\s*destination,\s*discoveryController\.signal,\s*\)/,
    )
    expect(submitBlock).toContain('navigationOrigin: origin')
    expect(submitBlock).toContain('navigationDestination: destination')
    expect(submitBlock).toContain(
      'const teskeidCandidateAllowed = teskeidRouteCandidateEnabled\n        && canRequestTeskeidCandidate(places)',
    )
    expect(submitBlock).toContain('if (teskeidCandidateAllowed) {')
    const candidatePolicyStart = source.indexOf(
      'function canRequestTeskeidCandidate(places: ResolvedRoutePlaces)',
    )
    const candidatePolicyEnd = source.indexOf('\n}\n', candidatePolicyStart)
    const candidatePolicyBlock = source.slice(candidatePolicyStart, candidatePolicyEnd)
    expect(candidatePolicyBlock).toContain('assessmentScope.scopeId.length > 0')
    expect(candidatePolicyBlock).toContain("assessmentOrigin.source === 'official'")
    expect(candidatePolicyBlock).not.toContain('return false')
    const nonReadyStart = submitBlock.indexOf(
      "if (scopedGoogleResult.assessmentScope.status !== 'ready')",
    )
    const readyPlacesStart = submitBlock.indexOf('const places: ResolvedRoutePlaces', nonReadyStart)
    const nonReadyBlock = submitBlock.slice(nonReadyStart, readyPlacesStart)
    expect(nonReadyStart).toBeGreaterThan(-1)
    expect(readyPlacesStart).toBeGreaterThan(nonReadyStart)
    expect(nonReadyBlock).toContain('showRouteHandoffOnly({')
    expect(nonReadyBlock).toContain("reason: scopedGoogleResult.assessmentScope.status === 'same_area'")
    expect(nonReadyBlock).toContain('return')
    expect(source).toContain('function handleRetryUnavailableRoute()')
    expect(source).toContain("t('roadMapPrototypeRouteRetry')")
    expect(source).toContain("teskeidCandidateStatus === 'no_route'")

    const switchBlock = functionBlock(
      'async function handleSelectSurfaceRouteChoice(',
      'function requestWeatherResultsFocus(',
    )
    expect(switchBlock.match(/refreshRouteChoiceEnvelope\(/g)).toHaveLength(2)
    expect(switchBlock).toMatch(
      /refreshRouteChoiceEnvelope\(\s*choice,\s*resolvedPlaces,\s*controller\.signal,\s*\)/,
    )
    expect(switchBlock).toMatch(
      /refreshRouteChoiceEnvelope\(\s*choiceToApply,\s*resolvedPlaces,\s*controller\.signal,\s*\)/,
    )
    expect(switchBlock).toContain('places: resolvedPlaces')

    const travelBlock = functionBlock(
      'async function calculateResolvedRoute({',
      'async function handleRouteBridgeSubmit(',
    )
    expect(travelBlock).toContain('const endpoints = resolveAssessmentClientEndpoints(places)')
    expect(travelBlock).toContain('const origin = endpoints.assessment.origin')
    expect(travelBlock).toContain('const destination = endpoints.assessment.destination')
    expect(travelBlock).toContain('JSON.stringify(buildAssessmentTravelRequest(places, {')
  })

  it('keeps comparison open while Apply is pending and focuses current weather results only after success', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
      'utf8',
    )
    const applyStart = source.indexOf('async function handleApplyRouteComparison()')
    const applyEnd = source.indexOf('\n  function restoreAppliedSurfaceRoutePreview()', applyStart)
    const applyBlock = source.slice(applyStart, applyEnd)
    const pendingStart = applyBlock.indexOf('setRouteComparisonApplyPending(true)')
    const applyAwait = applyBlock.indexOf('await handleSelectSurfaceRouteChoice(choice)')

    expect(applyStart).toBeGreaterThan(-1)
    expect(applyEnd).toBeGreaterThan(applyStart)
    expect(applyBlock).toContain('if (routeComparisonApplyPendingRef.current) return')
    expect(applyBlock).toContain('const runId = routeBridgeRunIdRef.current')
    expect(pendingStart).toBeGreaterThan(-1)
    expect(applyAwait).toBeGreaterThan(pendingStart)
    expect(applyBlock).toContain('if (applied && routeBridgeRunIdRef.current === runId)')
    expect(applyBlock).toContain('requestWeatherResultsFocus(runId)')
    expect(applyBlock).toContain(
      'if (routeBridgeRunIdRef.current === runId) {\n        routeComparisonApplyPendingRef.current = false\n        setRouteComparisonApplyPending(false)',
    )
    expect(applyBlock).not.toContain('setRouteComparisonFullscreen(false)')

    const focusStart = source.indexOf('function requestWeatherResultsFocus(runId: number)')
    const focusEnd = source.indexOf('\n\n  async function handleApplyRouteComparison()', focusStart)
    const focusBlock = source.slice(focusStart, focusEnd)

    expect(focusStart).toBeGreaterThan(-1)
    expect(focusEnd).toBeGreaterThan(focusStart)
    expect(focusBlock).toContain('if (routeBridgeRunIdRef.current !== runId) return')
    expect(focusBlock).toContain('pendingWeatherResultsFocusRunIdRef.current = runId')
    expect(focusBlock).toContain('setRouteComparisonFullscreen(false)')

    const fullscreenStart = source.indexOf('<RouteComparisonFullscreenMap')
    const fullscreenEnd = source.indexOf('\n        />', fullscreenStart)
    const fullscreenBlock = source.slice(fullscreenStart, fullscreenEnd)

    expect(fullscreenStart).toBeGreaterThan(-1)
    expect(fullscreenEnd).toBeGreaterThan(fullscreenStart)
    expect(fullscreenBlock).toContain('applyPending={routeComparisonApplyPending}')
    expect(fullscreenBlock).toContain("? t('roadMapPrototypeRouteConditionsLoading')")
    expect(fullscreenBlock).toContain(
      'onClose={() => {\n            if (routeComparisonApplyPendingRef.current) return',
    )
    expect(source).toContain('routeBridgeRunIdRef.current !== pendingRunId')
    expect(source).toContain('|| routeComparisonFullscreen')
    expect(source).toContain('const target = weatherResultsRef.current')
    expect(source).toContain('target.focus({ preventScroll: true })')
  })

  it('clears stale weather visuals and keeps malformed assessment scope in exact handoff-only mode', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
      'utf8',
    )
    const handoffStart = source.indexOf('function showRouteHandoffOnly(')
    const handoffEnd = source.indexOf('\n\n  async function calculateResolvedRoute(', handoffStart)
    const handoffBlock = source.slice(handoffStart, handoffEnd)

    expect(handoffBlock).toContain('stopRouteLiveLocation()')
    expect(handoffBlock).toContain('clearRouteVedurstofanLabelMarkers()')
    expect(handoffBlock).toContain('clearRouteVegagerdinLabelMarkers()')
    expect(handoffBlock).toContain('VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID')
    expect(handoffBlock).toContain('VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID')
    expect(handoffBlock).toContain("'travel-bridge-route'")
    expect(handoffBlock).toContain('routeAuditPolylinePointsRef.current = []')
    expect(handoffBlock).toContain('resolvedRoutePlacesRef.current = null')

    expect(source).toContain("code === 'assessment_scope_invalid'")
    expect(source).toContain("reason: 'assessment_unavailable'")
    expect(source.indexOf("code === 'assessment_scope_invalid'")).toBeLessThan(
      source.indexOf('findNearestKnownRoadMapPlace(candidate.place!, 30_000)'),
    )
  })

  it('keeps display-only station layers out of route-wide departure truth', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
      'utf8',
    )

    expect(source).not.toContain('buildDepartureForecastSlotStatusOverrides')
    expect(source).not.toContain('setRouteSlotStatusOverrides')
    expect(source).not.toContain('slotStatusOverrides={')
    expect(source).toContain("reason: 'provider-layers-display-only'")
    expect(source).toContain('const providerStatus = travelResult.stada')
    expect(source).toContain('const providerAnswer = travelResult.svar')
  })

  it('keeps the selected route and offers retry after a structured forecast failure', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
      'utf8',
    )

    expect(source).toContain("res.status === 503 && data?.error === 'forecast_unavailable'")
    expect(source).toContain("reason: 'weather_unavailable'")
    expect(source).toContain('routeForecastRetryContextRef.current = {')
    expect(source).toContain('async function handleRetryRouteForecast()')
    expect(source).toContain("t('roadMapPrototypeAssessmentWeatherRetry')")
    expect(source).toContain('{renderRouteSurfaceChoices()}')
    const forecastFailureStart = source.indexOf("if (res.status === 503 && data?.error === 'forecast_unavailable')")
    const forecastFailureEnd = source.indexOf('\n    if (!res.ok || !data)', forecastFailureStart)
    expect(source.slice(forecastFailureStart, forecastFailureEnd)).not.toContain('showRouteHandoffOnly(')
    expect(source).toContain('const expiresAtMs = Date.parse(envelope.expiresAt)')
    expect(source).toContain('routeSectionsCacheRef.current.delete(routeIdentity)')
    expect(source).toContain('await routeSectionsPresentationHashMatches(parsed)')
    expect(source).toContain('async function handleRetryRouteSections(choice: RouteSurfaceChoice)')
    expect(source).toMatch(
      /refreshRouteChoiceEnvelope\(\s*choice,\s*places,\s*controller\.signal,\s*\)/,
    )

    const accessStart = source.indexOf('async function resolveTeskeidAccessEnvelope(')
    const accessEnd = source.indexOf('async function refreshRouteChoiceEnvelope(', accessStart)
    const accessBlock = source.slice(accessStart, accessEnd)
    expect(accessBlock).toContain('fetchRouteSurfaceChoices(')
    expect(accessBlock).not.toContain('teskeidAccessEnvelope(')
  })

  it('keeps stable server route ids scope-local in React and async hydration', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
      'utf8',
    )
    const choiceStart = source.indexOf('function routeOptionToSurfaceChoice(')
    const choiceEnd = source.indexOf('\n  function mergeProviderRouteChoices(', choiceStart)
    const choiceBlock = source.slice(choiceStart, choiceEnd)
    const hydrationStart = source.indexOf('async function hydrateRouteSurfaceChoiceSummaries(')
    const hydrationEnd = source.indexOf('\n  function scheduleRouteSurfaceChoiceSummaries(', hydrationStart)
    const hydrationBlock = source.slice(hydrationStart, hydrationEnd)

    expect(choiceBlock).toContain('identity: routeEnvelope?.signature')
    expect(choiceBlock).toContain('`${route.id}:${route.routeIndex}:${route.distanceM}:${route.durationS}`')
    expect(hydrationBlock).toContain('route.identity === choice.identity')
    expect(source).toContain('key={choice.identity}')
    expect(source).toContain('routeBridgeRunIdRef.current !== runId')
    expect(source).toContain('assessmentScopeId,\n    origin.lat.toFixed(6)')
  })
})
