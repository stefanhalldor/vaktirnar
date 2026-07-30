type AssessmentClientPoint = Readonly<{
  name: string
  lat: number
  lon: number
}>

export type ReadyRouteAssessmentClientPlaces<
  TPlace extends AssessmentClientPoint,
  TScope extends Readonly<{ scopeId: string }> = Readonly<{ scopeId: string }>,
> = Readonly<{
  navigationOrigin: TPlace
  navigationDestination: TPlace
  navigationOriginName: string
  navigationDestinationName: string
  assessmentOrigin: TPlace
  assessmentDestination: TPlace
  assessmentScope: TScope
}>

/**
 * Keeps exact navigation endpoints and server-attested assessment endpoints in
 * separate named contracts. Navigation/access and full-route weather may use
 * exact endpoints; official-road, surface and safety claims use `assessment`.
 * Keeping both named prevents one coordinate-shaped value from silently
 * acquiring the other purpose's provenance.
 */
export function resolveAssessmentClientEndpoints<
  TPlace extends AssessmentClientPoint,
  TScope extends Readonly<{ scopeId: string }>,
>(places: ReadyRouteAssessmentClientPlaces<TPlace, TScope>) {
  return {
    assessment: {
      origin: places.assessmentOrigin,
      destination: places.assessmentDestination,
      scopeId: places.assessmentScope.scopeId,
    },
    navigation: {
      origin: places.navigationOrigin,
      destination: places.navigationDestination,
      originName: places.navigationOriginName,
      destinationName: places.navigationDestinationName,
    },
  } as const
}

/**
 * Builds the current assessment request with non-overridable official-road
 * authority. The payload cannot replace assessment endpoints or the
 * server-issued scope claim. Exact navigation endpoints remain available on
 * `places` for a separately typed access/full-route-weather contract.
 */
export function buildAssessmentTravelRequest<
  TPlace extends AssessmentClientPoint,
  TScope extends Readonly<{ scopeId: string }>,
  TPayload extends Readonly<Record<string, unknown>>,
>(
  places: ReadyRouteAssessmentClientPlaces<TPlace, TScope>,
  payload: TPayload,
) {
  const { assessment } = resolveAssessmentClientEndpoints(places)
  return {
    ...payload,
    origin: assessment.origin,
    destination: assessment.destination,
    assessmentScopeId: assessment.scopeId,
  } as const
}
