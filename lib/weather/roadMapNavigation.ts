export type RoadMapCanonicalPath =
  | '/vedrid'
  | '/auth-mvp/vedrid'
  | '/auth-mvp/vedrid/road-map-prototype'

export type RoadMapAuthenticatedPath =
  | '/auth-mvp/vedrid'
  | '/auth-mvp/vedrid/road-map-prototype'

export type RoadMapNavigation = {
  canonicalPath: RoadMapCanonicalPath
  authenticatedPath: RoadMapAuthenticatedPath
}

export const ROAD_MAP_PROTOTYPE_NAVIGATION: RoadMapNavigation = {
  canonicalPath: '/auth-mvp/vedrid/road-map-prototype',
  authenticatedPath: '/auth-mvp/vedrid/road-map-prototype',
}

export function buildRoadMapRouteReturnHref(
  navigation: RoadMapNavigation,
  view: 'information' | 'map',
): string {
  const params = new URLSearchParams({
    context: 'route',
    view,
    restoreRoute: '1',
  })
  return `${navigation.canonicalPath}?${params.toString()}`
}

export function buildRoadMapStationReturnHref(
  navigation: RoadMapNavigation,
  stationId?: string,
): string {
  if (!stationId) return navigation.canonicalPath
  return `${navigation.canonicalPath}?${new URLSearchParams({ stationId }).toString()}`
}

export function buildRoadMapSignInReturnHref(
  navigation: RoadMapNavigation,
  context: 'weather' | 'route' = 'route',
): string {
  const params = new URLSearchParams({
    context,
    view: 'information',
  })
  return `${navigation.authenticatedPath}?${params.toString()}`
}

export function buildRoadMapLiveLocationSignInReturnHref(
  navigation: RoadMapNavigation,
): string {
  const params = new URLSearchParams({
    context: 'route',
    view: 'map',
    restoreRoute: '1',
  })
  return `${navigation.authenticatedPath}?${params.toString()}`
}
