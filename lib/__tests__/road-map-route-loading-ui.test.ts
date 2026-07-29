import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  hasSaferRouteSearchFinished,
  resolveRouteResultsDisplayState,
  shouldRecalculateRouteChoice,
  type RouteBridgeDisplayStatus,
  type RouteResultsDisplayState,
} from '@/lib/road-intelligence/routeResultsDisplayState'

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
    expect(source).toContain('if (!isAuthenticated && !accessRouteEnvelope)')
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
})
