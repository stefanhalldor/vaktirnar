import type {
  HourPoint,
  RouteAssessmentCompleteness,
  TravelPointForecast,
} from './types'

type PlannedRouteForecastPoint = Omit<TravelPointForecast, 'hours'>

const ROUTE_BOUNDARY_TOLERANCE_M = 1

export type RouteForecastSettledResult =
  | { status: 'fulfilled'; value: HourPoint[] }
  | { status: 'rejected'; reason: unknown }

export type ResolveRouteForecastCompletenessInput = {
  plannedPoints: readonly PlannedRouteForecastPoint[]
  settledResults: readonly RouteForecastSettledResult[]
  routeDistanceM: number
  routeScope: {
    status: 'full' | 'partial'
    startRouteFraction: number
    endRouteFraction: number
    startDistanceM: number
    endDistanceM: number
  }
}

export type ResolvedRouteForecastCompleteness = {
  pointForecasts: TravelPointForecast[]
  assessmentCompleteness: RouteAssessmentCompleteness
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hasForecastHours(
  result: RouteForecastSettledResult | undefined,
): result is Extract<RouteForecastSettledResult, { status: 'fulfilled' }> {
  return result?.status === 'fulfilled'
    && Array.isArray(result.value)
    && result.value.length > 0
}

function plannedDistanceM(point: PlannedRouteForecastPoint | undefined): number | null {
  if (!point || !Number.isFinite(point.distanceFromOriginM)) return null
  return Math.round(point.distanceFromOriginM)
}

/**
 * Resolves the uninterrupted forecast evidence that starts at the trusted
 * assessment boundary. A success after the first missing point is evidence
 * after a gap and is intentionally excluded from the weather assessment.
 */
export function resolveRouteForecastCompleteness(
  input: ResolveRouteForecastCompletenessInput,
): ResolvedRouteForecastCompleteness {
  const routeDistanceM = Math.max(0, input.routeDistanceM)
  const startDistanceM = clamp(
    Math.round(input.routeScope.startDistanceM),
    0,
    routeDistanceM,
  )
  const scopeEndDistanceM = clamp(
    Math.round(input.routeScope.endDistanceM),
    startDistanceM,
    routeDistanceM,
  )
  const startRouteFraction = clamp(input.routeScope.startRouteFraction, 0, 1)
  const scopeEndRouteFraction = clamp(
    input.routeScope.endRouteFraction,
    startRouteFraction,
    1,
  )

  const requestedPointCount = input.plannedPoints.length
  const plannedDistancesM = input.plannedPoints.map(plannedDistanceM)
  const planIsOrderedWithinScope = plannedDistancesM.every((distanceM, index) => {
    if (distanceM === null) return false
    if (
      distanceM < startDistanceM - ROUTE_BOUNDARY_TOLERANCE_M
      || distanceM > scopeEndDistanceM + ROUTE_BOUNDARY_TOLERANCE_M
    ) return false
    const previousDistanceM = index > 0 ? plannedDistancesM[index - 1] : null
    return previousDistanceM === null || distanceM >= previousDistanceM
  })
  const firstPlannedDistanceM = plannedDistancesM[0] ?? null
  const lastPlannedDistanceM = plannedDistancesM[plannedDistancesM.length - 1] ?? null
  const planStartsAtScopeBoundary = planIsOrderedWithinScope
    && firstPlannedDistanceM !== null
    && Math.abs(firstPlannedDistanceM - startDistanceM) <= ROUTE_BOUNDARY_TOLERANCE_M
  const planEndsAtScopeBoundary = planIsOrderedWithinScope
    && lastPlannedDistanceM !== null
    && Math.abs(lastPlannedDistanceM - scopeEndDistanceM) <= ROUTE_BOUNDARY_TOLERANCE_M
  const planHasPositiveSpan = scopeEndDistanceM > startDistanceM
  const planCoversScope = requestedPointCount >= 2
    && planHasPositiveSpan
    && planStartsAtScopeBoundary
    && planEndsAtScopeBoundary
  const successful = input.plannedPoints.map((_, index) => (
    hasForecastHours(input.settledResults[index])
  ))
  const succeededPointCount = successful.filter(Boolean).length
  const failedPointCount = requestedPointCount - succeededPointCount

  let contiguousSucceededPointCount = 0
  while (
    contiguousSucceededPointCount < requestedPointCount
    && successful[contiguousSucceededPointCount]
  ) {
    contiguousSucceededPointCount += 1
  }
  const hasSuccessAfterFirstGap = successful
    .slice(contiguousSucceededPointCount)
    .some(Boolean)

  const forecastComplete = planCoversScope
    && contiguousSucceededPointCount === requestedPointCount
  const prefixEndDistanceM = contiguousSucceededPointCount > 0
    ? clamp(
        plannedDistanceM(input.plannedPoints[contiguousSucceededPointCount - 1]) ?? startDistanceM,
        startDistanceM,
        scopeEndDistanceM,
      )
    : startDistanceM

  // Only an ordered prefix that begins at the trusted assessment boundary and
  // spans a positive distance can be presented. A lone point, a truncated plan
  // that does not start at the boundary, or malformed ordering is unavailable.
  const hasAssessablePrefix = planStartsAtScopeBoundary
    && contiguousSucceededPointCount >= 2
    && prefixEndDistanceM > startDistanceM
  const assessedPointCount = hasAssessablePrefix ? contiguousSucceededPointCount : 0
  const excludedSucceededPointCount = succeededPointCount - assessedPointCount

  const forecastStatus = forecastComplete
    ? 'complete'
    : hasAssessablePrefix
      ? 'partial'
      : 'unavailable'
  const assessedEndDistanceM = forecastComplete
    ? scopeEndDistanceM
    : hasAssessablePrefix
      ? prefixEndDistanceM
      : startDistanceM
  const assessedEndRouteFraction = routeDistanceM > 0
    ? clamp(assessedEndDistanceM / routeDistanceM, startRouteFraction, scopeEndRouteFraction)
    : startRouteFraction
  const routeScopeComplete = input.routeScope.status === 'full'
    && startDistanceM === 0
    && scopeEndDistanceM === routeDistanceM
  const status: RouteAssessmentCompleteness['status'] = forecastStatus === 'unavailable'
    ? 'unavailable'
    : forecastComplete && routeScopeComplete
      ? 'complete'
      : 'partial'
  const reason: RouteAssessmentCompleteness['reason'] = forecastStatus === 'unavailable'
    ? 'forecast_unavailable'
    : !forecastComplete
      ? hasSuccessAfterFirstGap
        ? 'forecast_gap'
        : 'forecast_incomplete'
      : routeScopeComplete
        ? undefined
        : 'route_scope_partial'

  const pointForecasts = input.plannedPoints
    .slice(0, assessedPointCount)
    .map((point, index): TravelPointForecast => ({
      ...point,
      hours: (input.settledResults[index] as Extract<
        RouteForecastSettledResult,
        { status: 'fulfilled' }
      >).value,
    }))

  return {
    pointForecasts,
    assessmentCompleteness: {
      status,
      ...(reason ? { reason } : {}),
      assessedStartRouteFraction: startRouteFraction,
      assessedEndRouteFraction,
      assessedStartDistanceM: startDistanceM,
      assessedEndDistanceM,
      assessedDistanceM: Math.max(0, assessedEndDistanceM - startDistanceM),
      unassessedBeforeM: startDistanceM,
      unassessedAfterM: Math.max(0, routeDistanceM - assessedEndDistanceM),
      distanceConfidence: 'reference_route',
      forecast: {
        provider: 'metno',
        status: forecastStatus,
        requestedPointCount,
        succeededPointCount,
        failedPointCount,
        assessedPointCount: hasAssessablePrefix ? assessedPointCount : 0,
        excludedSucceededPointCount,
      },
    },
  }
}
