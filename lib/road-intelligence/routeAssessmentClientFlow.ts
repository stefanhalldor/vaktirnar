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
 * separate named contracts. Callers use `assessment` for weather work and
 * `navigation` only for the external directions handoff.
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
 * Builds the final weather request with non-overridable assessment authority.
 * The payload cannot replace endpoints or the server-issued scope claim.
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
