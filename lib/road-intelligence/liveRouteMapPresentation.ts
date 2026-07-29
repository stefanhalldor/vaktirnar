export type MapLayerVisibility = 'visible' | 'none'

export type LiveRouteRoadSegmentsFilter = readonly [
  '!=',
  readonly ['get', 'teskeidRoadStatus'],
  'clear',
]

export type LiveRouteMapPresentation = {
  vegagerdinRasterVisibility: MapLayerVisibility
  roadSegmentsVisibility: MapLayerVisibility
  roadSegmentsFilter: LiveRouteRoadSegmentsFilter | null
}

export type LiveRouteMapPresentationInput = {
  liveTrackingActive: boolean
  configuredVegagerdinRasterVisibility: MapLayerVisibility
  configuredRoadSegmentsVisibility: MapLayerVisibility
}

export type RouteEndpointMarkerKind =
  | 'origin'
  | 'destination'
  | 'coverage-start'
  | 'coverage-end'

export function shouldShowRouteEndpointMarker(input: {
  routeContextVisible: boolean
  endpointMarkersCurrent: boolean
  livePuckVisible: boolean
  kind: RouteEndpointMarkerKind
}): boolean {
  if (!input.routeContextVisible || !input.endpointMarkersCurrent) return false
  if (input.kind === 'coverage-start' || input.kind === 'coverage-end') return false
  return !(input.livePuckVisible && input.kind === 'origin')
}

/**
 * Resolves transient route-map presentation without changing the user's
 * persisted layer preferences.
 *
 * Live tracking replaces the all-green Vegagerðin raster with the vector
 * road layer and hides only segments explicitly classified as clear. Leaving
 * live tracking restores both configured visibility values and removes the
 * transient vector filter.
 */
export function resolveLiveRouteMapPresentation({
  liveTrackingActive,
  configuredVegagerdinRasterVisibility,
  configuredRoadSegmentsVisibility,
}: LiveRouteMapPresentationInput): LiveRouteMapPresentation {
  if (!liveTrackingActive) {
    return {
      vegagerdinRasterVisibility: configuredVegagerdinRasterVisibility,
      roadSegmentsVisibility: configuredRoadSegmentsVisibility,
      roadSegmentsFilter: null,
    }
  }

  return {
    vegagerdinRasterVisibility: 'none',
    roadSegmentsVisibility: 'visible',
    roadSegmentsFilter: ['!=', ['get', 'teskeidRoadStatus'], 'clear'],
  }
}
