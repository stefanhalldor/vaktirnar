export const ICELAND_ROUTES_FOUNDATION_VERSION = '0.3.0'

export type {
  IcelandRouteFamily,
  IcelandRouteFamilyId,
  IcelandRouteNode,
  IcelandRouteNodeId,
  IcelandRouteProvider,
  IcelandRouteSafetyFlag,
  IcelandRouteSafetyFlagId,
  IcelandRouteSafetySeverity,
  IcelandRouteSegment,
  IcelandRouteSegmentId,
  IcelandRouteSegmentSuitability,
  LatLon,
  RouteIntelligenceCheck,
} from './types'

export { ICELAND_ROUTE_SEGMENTS, getIcelandSegment } from './segments'

// Route lens — curated corridor route filter for /vedrid
export type {
  OverviewRouteLensQuery,
  OverviewRouteLensRouteFamily,
  OverviewRouteLensResult,
} from './lensTypes'
export { resolveOverviewRouteLensCacheOnly, normalizePlaceName } from './lensResolver'
export { filterStationIdsForRouteLens } from './lensFilter'
export { ROUTE_FAMILIES, getRouteFamily } from './routeFamilies'

// Route draft — overview-to-ferdalagid place handoff via sessionStorage
export type { RouteDraftPlace, OverviewRouteDraft } from './routeDraft'
export { writeOverviewRouteDraft, readOverviewRouteDraft, clearOverviewRouteDraft } from './routeDraft'

// Route observation — provider-neutral derived route knowledge (v531 R0/R1/R2)
export type { RouteObservation, RouteObservationSource } from './routeObservation'
export {
  normalizeToArea,
  buildRouteFamilyKey,
  buildRouteObservation,
  recordRouteObservation,
  getStoredRouteObservations,
} from './routeObservation'

// Route-memory place normalization — fine-grained place keys for Supabase route-memory
export { normalizePlaceForMemory, buildRouteMemoryKey } from './routePlaceNormalization'
