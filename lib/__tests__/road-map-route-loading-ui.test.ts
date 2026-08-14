import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isCurrentRouteWeatherRequest,
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
import { isAtomicTeskeidCandidateArtifact } from '@/lib/road-intelligence/teskeidCandidateArtifact'

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')
}

function sourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

type DisplayStateCase = {
  label: string
  bridgeStatus: RouteBridgeDisplayStatus
  hasSummary: boolean
  hasTravelResult: boolean
  hasRouteChoices: boolean
  switchingChoiceId: string | null
  comparisonOpening: boolean
  hasHandoffOnly?: boolean
  expected: RouteResultsDisplayState
}

describe('v238 RoadMap route discovery and weather boundary', () => {
  it('uses route-only loader steps and names the default comparison sort after road surface', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')
    const messagesIs = readSource('messages/is.json')
    const messagesEn = readSource('messages/en.json')

    expect(source).toContain("t('roadMapPrototypeTeskeidRouteLoaderBuild')")
    expect(source).toContain("t('roadMapPrototypeTeskeidRouteLoaderSurface')")
    expect(source).toContain("t('roadMapPrototypeTeskeidRouteLoaderSort')")
    expect(messagesIs).toContain('"roadMapPrototypeTeskeidRouteLoaderBuild": "Sæki gögn frá Vegagerðinni og bý til nokkrar leiðir…"')
    expect(messagesIs).toContain('"roadMapPrototypeTeskeidRouteLoaderSurface": "Tek sérstaklega tillit til slitlags á leiðunum…"')
    expect(messagesIs).toContain('"roadMapPrototypeTeskeidRouteLoaderSort": "Raða leiðum eftir slitlagi, aksturstíma og vegalengd…"')
    expect(messagesIs).toContain('"roadMapPrototypeRouteSortDefault": "Slitlag"')
    expect(messagesEn).toContain('"roadMapPrototypeRouteSortDefault": "Road surface"')
  })

  it('hides the legacy route-sections disclosure without removing its map evidence pipeline', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')

    expect(source).not.toContain('renderRouteSectionsDisclosure')
    expect(source).not.toContain("t('roadMapPrototypeRouteSectionsTitle')")
    expect(source).toContain("fetch('/api/teskeid/weather/travel/route-sections'")
    expect(source).toContain('ROUTE_GRAVEL_SECTIONS_LAYER_ID')
    expect(source).toContain('ROUTE_DIRECTION_SECTIONS_LAYER_ID')
  })

  it('lets only the exact active weather request mutate route state', () => {
    const requestA = new AbortController()
    const requestB = new AbortController()

    expect(isCurrentRouteWeatherRequest(requestA.signal, requestA.signal)).toBe(true)
    expect(isCurrentRouteWeatherRequest(requestA.signal, requestB.signal)).toBe(false)

    requestA.abort()
    expect(isCurrentRouteWeatherRequest(requestA.signal, requestA.signal)).toBe(false)
    expect(isCurrentRouteWeatherRequest(requestB.signal, requestB.signal)).toBe(true)

    let selectedRetryContext = 'route-b'
    const staleResponseA = { status: 503, error: 'forecast_unavailable' }
    if (
      staleResponseA.status === 503
      && staleResponseA.error === 'forecast_unavailable'
      && isCurrentRouteWeatherRequest(requestA.signal, requestB.signal)
    ) {
      selectedRetryContext = 'route-a'
    }
    expect(selectedRetryContext).toBe('route-b')
  })

  it.each<DisplayStateCase>([
    {
      label: 'route discovery is still loading',
      bridgeStatus: 'loading',
      hasSummary: false,
      hasTravelResult: false,
      hasRouteChoices: false,
      switchingChoiceId: null,
      comparisonOpening: true,
      expected: 'route-loading',
    },
    {
      label: 'all Teskeið routes are ready before weather',
      bridgeStatus: 'success',
      hasSummary: false,
      hasTravelResult: false,
      hasRouteChoices: true,
      switchingChoiceId: null,
      comparisonOpening: false,
      expected: 'route-ready',
    },
    {
      label: 'weather is being fetched for an explicit choice',
      bridgeStatus: 'success',
      hasSummary: false,
      hasTravelResult: false,
      hasRouteChoices: true,
      switchingChoiceId: 'teskeid-b',
      comparisonOpening: false,
      expected: 'route-switching',
    },
    {
      label: 'route and weather result are both ready',
      bridgeStatus: 'success',
      hasSummary: true,
      hasTravelResult: true,
      hasRouteChoices: true,
      switchingChoiceId: null,
      comparisonOpening: false,
      expected: 'summary',
    },
    {
      label: 'weather is unavailable but navigation handoff remains truthful',
      bridgeStatus: 'success',
      hasSummary: false,
      hasTravelResult: false,
      hasRouteChoices: true,
      switchingChoiceId: null,
      comparisonOpening: false,
      hasHandoffOnly: true,
      expected: 'handoff-only',
    },
    {
      label: 'failed discovery returns to the form',
      bridgeStatus: 'error',
      hasSummary: false,
      hasTravelResult: false,
      hasRouteChoices: false,
      switchingChoiceId: null,
      comparisonOpening: false,
      expected: 'form',
    },
  ])('$label', ({ expected, label: _label, ...input }) => {
    expect(resolveRouteResultsDisplayState(input)).toBe(expected)
  })

  it('shows route cards without exposing weather before the CTA', () => {
    expect(resolveRouteResultsVisibility({
      displayState: 'route-ready',
      hasSummary: false,
      hasTravelResult: false,
      hasAssessedWeatherCoverage: false,
      routeChoiceCount: 3,
    })).toEqual({
      showSummary: false,
      showRouteCards: true,
      showWeather: false,
      showHandoffOnly: false,
    })

    expect(resolveRouteResultsVisibility({
      displayState: 'summary',
      hasSummary: true,
      hasTravelResult: true,
      hasAssessedWeatherCoverage: true,
      routeChoiceCount: 3,
    })).toEqual({
      showSummary: true,
      showRouteCards: true,
      showWeather: true,
      showHandoffOnly: false,
    })

    expect(resolveRouteResultsVisibility({
      displayState: 'route-switching',
      hasSummary: false,
      hasTravelResult: false,
      hasAssessedWeatherCoverage: false,
      routeChoiceCount: 3,
    })).toEqual({
      showSummary: false,
      showRouteCards: true,
      showWeather: false,
      showHandoffOnly: false,
    })
  })

  it('keeps exact navigation endpoints separate from the attested assessment scope', () => {
    const navigationOrigin = { name: 'Núverandi staðsetning', lat: 64.083771, lon: -21.929006 }
    const navigationDestination = { name: 'Víðibakki', lat: 63.901234, lon: -20.201234 }
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

    expect(buildAssessmentTravelRequest(places, {
      trailerKind: 'none',
      origin: navigationOrigin,
      destination: navigationDestination,
      assessmentScopeId: 'client-forged-scope',
    })).toMatchObject({
      origin: assessmentOrigin,
      destination: assessmentDestination,
      assessmentScopeId: places.assessmentScope.scopeId,
    })
    expect(resolveAssessmentClientEndpoints(places).navigation).toMatchObject({
      origin: navigationOrigin,
      destination: navigationDestination,
    })
  })

  it('discovers every Teskeið alternative once and sends zero weather requests before CTA', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')
    const submit = sourceBlock(
      source,
      'async function handleRouteBridgeSubmit(',
      'function previewSurfaceRouteChoice(',
    )

    expect(submit.match(/fetchTeskeidCandidate\(/g)).toHaveLength(2) // initial + bounded retry loop
    expect(submit).toMatch(
      /fetchTeskeidCandidate\(\s*origin,\s*destination,\s*null,\s*discoveryController\.signal,\s*true,\s*'extended',\s*0,/,
    )
    expect(submit).toContain('retryIndex < ROUTE_SCOPE_RETRY_DELAYS_MS.length')
    expect(submit).toContain('ROUTE_SCOPE_RETRY_DELAYS_MS[retryIndex]')
    expect(submit).toContain('retryIndex + 1')
    expect(submit).not.toContain("fetch('/api/teskeid/weather/travel'")
    expect(submit).not.toContain('calculateResolvedRoute(')
    expect(submit).not.toContain('getRouteOptions')
    expect(submit).not.toContain('launchFirstReadyDiscovery')
    expect(submit).not.toContain('googleResultPromise')
  })

  it('uses one ordered recommendation for the card selection and map preview', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')
    const submit = sourceBlock(
      source,
      'async function handleRouteBridgeSubmit(',
      'function previewSurfaceRouteChoice(',
    )

    expect(submit).toContain('setRouteSurfaceChoices(result.choices)')
    expect(submit).toContain('choice => choice.routeId === result.recommendedRouteId')
    expect(submit).toContain('?? result.choices[0]')
    expect(submit).toContain('setPreviewRouteChoiceId(recommendedChoice.routeId)')
    expect(submit).toContain('previewSurfaceRouteChoice(recommendedChoice, true)')
    expect(submit).toContain('setRouteComparisonFullscreen(true)')
    expect(source).toContain('selectedRouteId={selectedRouteChoiceId}')
    expect(source).toContain('const appliedRouteChoiceId = routeBridgeSummary?.selectedRouteId ?? null')
  })

  it('selection is preview-only and the explicit CTA is the first weather trigger', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')
    const preview = sourceBlock(
      source,
      'function previewSurfaceRouteChoice(',
      'async function handleSelectSurfaceRouteChoice(',
    )
    const apply = sourceBlock(
      source,
      'async function handleApplyRouteComparison()',
      'function restoreAppliedSurfaceRoutePreview()',
    )

    expect(preview).not.toContain('fetch(')
    expect(preview).not.toContain('calculateResolvedRoute(')
    expect(apply).toContain('await handleSelectSurfaceRouteChoice(choice)')
    expect(shouldRecalculateRouteChoice('teskeid-a', null)).toBe(true)
    expect(shouldRecalculateRouteChoice('teskeid-a', 'teskeid-a')).toBe(false)
  })

  it('uses a fresh signed envelope directly and refreshes only after expiry or one rejection', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')
    const select = sourceBlock(
      source,
      'async function handleSelectSurfaceRouteChoice(',
      'function requestWeatherResultsFocus(',
    )

    expect(select).toContain('findFreshRouteEnvelope([choice.routeEnvelope], choice.routeId)')
    expect(select).toContain('freshEnvelope.assessmentScopeId === resolvedPlaces.assessmentScope.scopeId')
    expect(select).toContain('? choice')
    expect(select.match(/refreshRouteChoiceEnvelope\(/g)).toHaveLength(2)
    expect(select).toContain("error.message !== 'route_envelope_invalid'")
    expect(source).toContain('Do not hand the caller the same cached signature it is trying to replace.')
  })

  it('caches the complete scope-bound ordered artifact for an identical second search', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')
    const candidate = sourceBlock(
      source,
      'async function fetchTeskeidCandidate(',
      'async function refreshRouteChoiceEnvelope(',
    )

    expect(source).toContain('assessmentScope: ReadyRouteAssessmentScope')
    expect(source).toContain('recommendedRouteId: string')
    expect(candidate.match(/isAtomicTeskeidCandidateArtifact\(\{/g)).toHaveLength(2)
    expect(candidate).toContain('assessmentScope: cached.assessmentScope')
    expect(candidate).toContain('recommendedRouteId: cached.recommendedRouteId')
    expect(candidate).toContain("typeof payload?.recommendedRouteId === 'string'")
    expect(candidate).toContain('envelopesByRouteId.get(recommendedRouteId)')
    expect(candidate).not.toContain('assessmentScope: null,\n        choices: cached.envelopes')

    const scopeId = 'assessment:v3:scope'
    const networkArtifact = {
      scopeId,
      recommendedRouteId: 'teskeid-primary',
      envelopes: [
        { assessmentScopeId: scopeId, route: { id: 'teskeid-primary' } },
        { assessmentScopeId: scopeId, route: { id: 'teskeid-alt' } },
      ],
    }
    const cacheHitArtifact = structuredClone(networkArtifact)
    expect(isAtomicTeskeidCandidateArtifact(networkArtifact)).toBe(true)
    expect(isAtomicTeskeidCandidateArtifact(cacheHitArtifact)).toBe(true)
    expect(cacheHitArtifact).toEqual(networkArtifact)
    expect(isAtomicTeskeidCandidateArtifact({
      ...cacheHitArtifact,
      recommendedRouteId: 'teskeid-alt',
    })).toBe(false)
    expect(isAtomicTeskeidCandidateArtifact({
      ...cacheHitArtifact,
      envelopes: [
        cacheHitArtifact.envelopes[0],
        { assessmentScopeId: 'assessment:v3:other', route: { id: 'teskeid-alt' } },
      ],
    })).toBe(false)
  })

  it('drops an aborted weather response before a stale 503 mutates retry state', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')
    const travel = sourceBlock(
      source,
      'async function calculateResolvedRoute({',
      'async function handleRetryRouteForecast()',
    )
    const jsonIndex = travel.indexOf('const data = await res.json()')
    const abortIndex = travel.indexOf('if (requestIsStale()) return false', jsonIndex)
    const unavailableIndex = travel.indexOf("data?.error === 'forecast_unavailable'")

    expect(jsonIndex).toBeGreaterThanOrEqual(0)
    expect(abortIndex).toBeGreaterThan(jsonIndex)
    expect(unavailableIndex).toBeGreaterThan(abortIndex)
  })

  it('retains discovered route cards when weather is unavailable', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')
    const travel = sourceBlock(
      source,
      'async function calculateResolvedRoute({',
      'async function handleRetryRouteForecast()',
    )
    const failureStart = travel.indexOf("res.status === 503 && data?.error === 'forecast_unavailable'")
    const failureEnd = travel.indexOf('if (!res.ok || !data)', failureStart)
    const failure = travel.slice(failureStart, failureEnd)

    expect(failureStart).toBeGreaterThan(-1)
    expect(failure).not.toContain('setRouteSurfaceChoices([])')
    expect(failure).toContain('setRouteHandoffOnlySummary(null)')
    expect(failure).toContain("setRouteBridgeError(t('roadMapPrototypeAssessmentWeatherUnavailable'))")
    expect(source).toContain('routeForecastRetryContextRef.current && (')
    expect(source).toContain('{routeResultsVisibility.showRouteCards && renderRouteSurfaceChoices()}')

    const incompleteStart = travel.indexOf('if (!hasAssessedWeatherCoverage || !assessmentCompleteness)')
    const incompleteEnd = travel.indexOf("console.log('[RoadMap] route API:'", incompleteStart)
    const incomplete = travel.slice(incompleteStart, incompleteEnd)
    expect(incompleteStart).toBeGreaterThan(-1)
    expect(incomplete).toContain('routeForecastRetryContextRef.current = {')
    expect(incomplete).toContain('setRouteHandoffOnlySummary(null)')
    expect(incomplete).not.toContain('showRouteHandoffOnly(')
    expect(incomplete).not.toContain('setRouteSurfaceChoices([])')

    const select = sourceBlock(
      source,
      'async function handleSelectSurfaceRouteChoice(',
      'function requestWeatherResultsFocus(',
    )
    expect(select).not.toContain('restoreAppliedSurfaceRoutePreview()')
    expect(source).toContain("routeResultsDisplayState === 'route-switching') ? (")
  })

  it('gates overview provider effects on a direct route entry', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')

    expect(source).toContain("new URLSearchParams(window.location.search).get('context') === 'route'")
    expect(source).toContain('skipInitialVegagerdinOverviewFetchRef,')
    expect(source).toContain('skipInitialVedurstofanOverviewFetchRef,')
    expect(source).toContain("if (lastMapContext !== 'weather') return")
    expect(source).toContain('}, [lastMapContext])')

    const vegagerdinFetch = source.indexOf(
      "fetch('/api/teskeid/weather/vegagerdin/current')",
    )
    const vegagerdinEffect = source.lastIndexOf('useEffect(() => {', vegagerdinFetch)
    const vegagerdinGuard = source.slice(vegagerdinEffect, vegagerdinFetch)
    expect(vegagerdinFetch).toBeGreaterThan(vegagerdinEffect)
    expect(vegagerdinGuard).toContain('consumeWeatherOverviewProviderFetchGate(')
    expect(vegagerdinGuard).toContain('skipInitialVegagerdinOverviewFetchRef,')

    const preferencesEffectStart = source.indexOf('let restoredPublicSessionDraft = false')
    const preferencesEffectEnd = source.indexOf('}, [', preferencesEffectStart)
    expect(source.slice(preferencesEffectStart, preferencesEffectEnd))
      .not.toContain('skipInitialVegagerdinOverviewFetchRef')
  })

  it('renders route-only cards before summary/weather and keeps the full-screen chooser independent', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')

    expect(source).toContain("routeResultsDisplayState === 'route-ready'")
    expect(source).toContain('if (!routeComparisonApplyPendingRef.current) {\n              restoreAppliedSurfaceRoutePreview()')
    expect(source).toContain('{routeComparisonFullscreen && routeComparisonItems.length >= 1 && (')
    expect(source).not.toContain('routeComparisonFullscreen && routeBridgeSummary &&')
    expect(source).not.toContain('routeSafetySearchPending')
    expect(source).not.toContain('hasSaferRouteSearchFinished')
    expect(source).not.toContain('className="fixed inset-0 z-[310]')
  })

  it('hides route-A weather and weather layers while route B is only previewed', () => {
    const source = readSource('components/weather/RoadMapPrototypeMap.tsx')
    const preview = sourceBlock(
      source,
      'function previewSurfaceRouteChoice(',
      'async function handleSelectSurfaceRouteChoice(',
    )

    expect(source).toContain('const selectedRouteHasAppliedWeather = selectedRouteChoiceId !== null')
    expect(source).toContain('&& selectedRouteChoiceId === appliedRouteChoiceId')
    expect(source).toContain('hasSummary: selectedRouteHasAppliedWeather && routeBridgeSummary !== null')
    expect(source).toContain('hasTravelResult: selectedRouteHasAppliedWeather && routeTravelResult !== null')
    expect(preview).toContain('choice.routeId === routeBridgeSummary?.selectedRouteId')
    expect(preview).toContain('setRouteLayerLayoutVisibility(weatherMap, layerId, false)')
    expect(preview).toContain("element.style.display = 'none'")
    expect(preview).toContain('updateRouteWeatherLayerVisibility()')
  })
})
