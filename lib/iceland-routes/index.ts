export const ICELAND_ROUTES_FOUNDATION_VERSION = '0.6.0'

export type {
  IcelandRoadIntelligenceConfidence,
  IcelandRoadIntelligenceResult,
  IcelandRoadIntelligenceStatus,
  IcelandRouteAlternative,
  IcelandRouteAlternativeId,
  IcelandRouteAlternativeLabel,
  IcelandRouteCaution,
  IcelandRouteCautionId,
  IcelandRouteCautionTag,
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
export {
  ICELAND_ROAD_INTELLIGENCE_ALTERNATIVES,
  getRoadIntelligenceAlternativesForFamily,
} from './alternatives'
export { ICELAND_ROAD_CAUTIONS, getRoadCautionsForSegments } from './cautions'
export { resolveRoadIntelligence } from './roadIntelligenceResolver'
export type {
  RoadIntelligenceCorsStatus,
  RoadIntelligenceDataRole,
  RoadIntelligenceOpenDataProvider,
  RoadIntelligenceOpenDataSource,
  RoadIntelligenceOpenDataSourceId,
  RoadIntelligenceProductionReadiness,
} from './openDataSources'
export {
  formatLmiAttribution,
  getRoadIntelligenceAttributions,
  getRoadIntelligenceOpenDataSource,
  needsRoadIntelligenceMapProxy,
  OPENSTREETMAP_ATTRIBUTION,
  ROAD_INTELLIGENCE_OPEN_DATA_SOURCES,
  VEGAGERDIN_ATTRIBUTION,
} from './openDataSources'

// Route lens — curated corridor route filter for /vedrid
export type {
  OverviewRouteLensQuery,
  OverviewRouteLensRouteFamily,
  OverviewRouteLensResult,
} from './lensTypes'
export { resolveOverviewRouteLensCacheOnly, normalizePlaceName } from './lensResolver'
export { filterStationIdsForRouteLens } from './lensFilter'
export { ROUTE_FAMILIES, getRouteFamily } from './routeFamilies'

// Provider-neutral routing boundary. Server-only shadow execution is exported
// directly from routingShadow.server.ts to prevent accidental client imports.
export type {
  IcelandRoutingAvoidance,
  IcelandRoutingConfidence,
  IcelandRoutingPath,
  IcelandRoutingPlace,
  IcelandRoutingProvider,
  IcelandRoutingProviderId,
  IcelandRoutingRequest,
  IcelandRoutingResult,
  IcelandRoutingSurfaceBreakdown,
  IcelandRoutingVehicleProfile,
} from './routingProvider'

// Automated Iceland road graph. Server-only fetching/provider implementations
// stay behind explicit *.server imports to prevent accidental client bundling.
export type {
  IcelandRoadClass,
  IcelandRoadDirection,
  IcelandRoadGraph,
  IcelandRoadGraphDiagnostics,
  IcelandRoadGraphEdge,
  IcelandRoadGraphNode,
  IcelandRoadGraphRoute,
  IcelandRoadGraphRouteResult,
  IcelandRoadGraphSegmentInput,
  IcelandRoadRoutingObjective,
  IcelandRoadRoutingProfile,
  IcelandRoadSpeedSource,
  IcelandRoadSurface,
  IcelandRoadSurfaceBreakdown,
} from './roadGraphTypes'
export {
  analyzeIcelandRoadGraph,
  buildIcelandRoadGraph,
  derivedRoadSpeedKmh,
  findIcelandRoadGraphRoute,
  findIcelandRoadGraphAlternatives,
  geometryLengthM,
  haversineDistanceM,
  ICELAND_ROUTING_PROFILES,
} from './roadGraph'
export type {
  ArcGisGeoJsonFeature,
  ArcGisGeoJsonFeatureCollection,
  NormalizeVegagerdinRoadGraphInput,
} from './vegagerdinRoadGraphSource'
export {
  normalizeVegagerdinRoadGraphSegments,
  vegagerdinDirection,
  vegagerdinRoadClass,
  vegagerdinSurface,
} from './vegagerdinRoadGraphSource'

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
