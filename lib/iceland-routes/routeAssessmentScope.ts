import { validateIcelandicCoords } from '@/lib/weather/coords'

export type RouteAssessmentEndpoint = Readonly<{
  name: string
  formattedAddress: string
  lat: number
  lon: number
  source: 'official'
  sourceId: string
  placeType: 'settlement'
  postalCode?: string
  postalLocality?: string
}>

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
      'placeType',
      'postalCode',
      'postalLocality',
    ])
    ||
    typeof value.name !== 'string' || !value.name.trim()
    || typeof value.formattedAddress !== 'string' || !value.formattedAddress.trim()
    || typeof value.lat !== 'number' || typeof value.lon !== 'number'
    || !validateIcelandicCoords(value.lat, value.lon)
    || value.source !== 'official'
    || typeof value.sourceId !== 'string' || !value.sourceId.trim()
    || value.placeType !== 'settlement'
    || (value.postalCode !== undefined && (typeof value.postalCode !== 'string' || !/^\d{3}$/.test(value.postalCode)))
    || (value.postalLocality !== undefined && typeof value.postalLocality !== 'string')
  ) {
    return null
  }
  return {
    name: value.name.trim(),
    formattedAddress: value.formattedAddress.trim(),
    lat: value.lat,
    lon: value.lon,
    source: 'official',
    sourceId: value.sourceId.trim(),
    placeType: 'settlement',
    ...(typeof value.postalCode === 'string' ? { postalCode: value.postalCode } : {}),
    ...(typeof value.postalLocality === 'string' && value.postalLocality.trim()
      ? { postalLocality: value.postalLocality.trim() }
      : {}),
  }
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
