import { validateIcelandicCoords } from '@/lib/weather/coords'

type RouteAssessmentEndpointBase = Readonly<{
  name: string
  formattedAddress: string
  lat: number
  lon: number
  source: 'official'
  sourceId: string
  /** Straight-line distance from the exact selected place to this road anchor. */
  accessDistanceM?: number
}>

export type UrbanSettlementAssessmentEndpoint = RouteAssessmentEndpointBase & Readonly<{
  identityKind: 'urban_settlement'
  placeType: 'settlement'
  postalCode?: string
  postalLocality?: string
}>

export type RuralPostalAreaAssessmentEndpoint = RouteAssessmentEndpointBase & Readonly<{
  identityKind: 'rural_postal_area'
  placeType: 'point'
  postalCode: string
  postalLocality: string
  postalLocalitySourceId: string
}>

/** Reserved for the source-attested road-anchor fallback introduced in Phase 2. */
export type OfficialRoadAnchorAssessmentEndpoint = RouteAssessmentEndpointBase & Readonly<{
  identityKind: 'official_road_anchor'
  placeType: 'point'
}>

export type RouteAssessmentEndpoint =
  | UrbanSettlementAssessmentEndpoint
  | RuralPostalAreaAssessmentEndpoint
  | OfficialRoadAnchorAssessmentEndpoint

export type RouteAssessmentScopeUnavailableReason =
  | 'assessment_area_unavailable'
  | 'assessment_mapping_invalid'
  | 'road_graph_unavailable'
  | 'no_connected_official_road'

export type RouteAssessmentScope =
  | Readonly<{
      status: 'ready'
      scopeId: string
      origin: RouteAssessmentEndpoint
      destination: RouteAssessmentEndpoint
    }>
  | Readonly<{
      status: 'same_area'
      settlementId: string
      settlementName: string
    }>
  | Readonly<{
      status: 'unavailable'
      reason: RouteAssessmentScopeUnavailableReason
    }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every(key => allowed.has(key))
}

function optionalPostalCode(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && /^\d{3}$/.test(value))
}

function optionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.trim().length > 0)
}

function parseEndpoint(value: unknown): RouteAssessmentEndpoint | null {
  if (!isRecord(value)) return null
  if (
    !hasOnlyKeys(value, [
      'name',
      'formattedAddress',
      'lat',
      'lon',
      'source',
      'sourceId',
      'identityKind',
      'placeType',
      'postalCode',
      'postalLocality',
      'postalLocalitySourceId',
      'accessDistanceM',
    ])
    || typeof value.name !== 'string' || !value.name.trim()
    || typeof value.formattedAddress !== 'string' || !value.formattedAddress.trim()
    || typeof value.lat !== 'number' || typeof value.lon !== 'number'
    || !validateIcelandicCoords(value.lat, value.lon)
    || value.source !== 'official'
    || typeof value.sourceId !== 'string' || !value.sourceId.trim()
    || (
      value.accessDistanceM !== undefined
      && (
        typeof value.accessDistanceM !== 'number'
        || !Number.isSafeInteger(value.accessDistanceM)
        || value.accessDistanceM < 0
        || value.accessDistanceM > 25_000
      )
    )
    || !optionalPostalCode(value.postalCode)
    || !optionalNonEmptyString(value.postalLocality)
  ) {
    return null
  }

  const common = {
    name: value.name.trim(),
    formattedAddress: value.formattedAddress.trim(),
    lat: value.lat,
    lon: value.lon,
    source: 'official' as const,
    sourceId: value.sourceId.trim(),
    ...(typeof value.accessDistanceM === 'number'
      ? { accessDistanceM: value.accessDistanceM }
      : {}),
  }
  if (value.identityKind === 'urban_settlement') {
    if (value.placeType !== 'settlement' || value.postalLocalitySourceId !== undefined) return null
    return {
      ...common,
      identityKind: 'urban_settlement',
      placeType: 'settlement',
      ...(typeof value.postalCode === 'string' ? { postalCode: value.postalCode } : {}),
      ...(typeof value.postalLocality === 'string'
        ? { postalLocality: value.postalLocality.trim() }
        : {}),
    }
  }
  if (value.identityKind === 'rural_postal_area') {
    if (
      value.placeType !== 'point'
      || typeof value.postalCode !== 'string'
      || typeof value.postalLocality !== 'string' || !value.postalLocality.trim()
      || typeof value.postalLocalitySourceId !== 'string' || !value.postalLocalitySourceId.trim()
      || value.sourceId.trim() !== `postal:${value.postalCode}:${value.postalLocalitySourceId.trim()}`
    ) return null
    return {
      ...common,
      identityKind: 'rural_postal_area',
      placeType: 'point',
      postalCode: value.postalCode,
      postalLocality: value.postalLocality.trim(),
      postalLocalitySourceId: value.postalLocalitySourceId.trim(),
    }
  }
  if (value.identityKind === 'official_road_anchor') {
    if (
      value.placeType !== 'point'
      || value.postalCode !== undefined
      || value.postalLocality !== undefined
      || value.postalLocalitySourceId !== undefined
    ) return null
    return {
      ...common,
      identityKind: 'official_road_anchor',
      placeType: 'point',
    }
  }
  return null
}

export function parseRouteAssessmentScope(value: unknown): RouteAssessmentScope | null {
  if (!isRecord(value) || typeof value.status !== 'string') return null
  if (value.status === 'ready') {
    if (!hasOnlyKeys(value, ['status', 'scopeId', 'origin', 'destination'])) return null
    const origin = parseEndpoint(value.origin)
    const destination = parseEndpoint(value.destination)
    return typeof value.scopeId === 'string' && value.scopeId.trim().length > 0 && value.scopeId.length <= 500
      && origin && destination
      ? { status: 'ready', scopeId: value.scopeId.trim(), origin, destination }
      : null
  }
  if (value.status === 'same_area') {
    if (!hasOnlyKeys(value, ['status', 'settlementId', 'settlementName'])) return null
    return typeof value.settlementId === 'string' && value.settlementId.trim().length > 0
      && typeof value.settlementName === 'string' && value.settlementName.trim().length > 0
      ? {
          status: 'same_area',
          settlementId: value.settlementId.trim(),
          settlementName: value.settlementName.trim(),
        }
      : null
  }
  if (value.status === 'unavailable') {
    if (!hasOnlyKeys(value, ['status', 'reason'])) return null
    const validReasons: readonly RouteAssessmentScopeUnavailableReason[] = [
      'assessment_area_unavailable',
      'assessment_mapping_invalid',
      'road_graph_unavailable',
      'no_connected_official_road',
    ]
    return validReasons.includes(value.reason as RouteAssessmentScopeUnavailableReason)
      ? { status: 'unavailable', reason: value.reason as RouteAssessmentScopeUnavailableReason }
      : null
  }
  return null
}
