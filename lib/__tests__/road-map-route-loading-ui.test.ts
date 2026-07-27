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
      'onClose={() => {\n            restoreAppliedSurfaceRoutePreview()',
    )
    expect(source).toContain('if (!isAuthenticated || !teskeidRouteCandidateEnabled) return')
    expect(source).toContain('const googleChoicesPromise = fetchRouteSurfaceChoices(')
    expect(source).toContain('...(accessRouteEnvelope ? { accessRouteEnvelope } : {})')
    expect(source).toContain('if (!isAuthenticated && !accessRouteEnvelope)')
  })
})
