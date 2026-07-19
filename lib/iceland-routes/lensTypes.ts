// Types for the curated corridor route lens on /vedrid.
// No Google Routes API involvement — local registry only.

export interface OverviewRouteLensQuery {
  /** Raw user input for the origin, e.g. "Reykjavík" */
  from: string
  /** Raw user input for the destination, e.g. "Akureyri" */
  to: string
}

export interface OverviewRouteLensRouteFamily {
  id: string
  /** Icelandic label, e.g. "Reykjavík — Akureyri" */
  label: string
  /** English label */
  labelEn: string
  /**
   * Ordered corridor waypoints used for haversine-based station filtering.
   * Stations within corridorRadiusKm of any waypoint are considered on-route.
   */
  corridorWaypoints: readonly { lat: number; lon: number }[]
  /** Radius (km) around each waypoint within which stations are considered relevant. */
  corridorRadiusKm: number
}

export type OverviewRouteLensResult =
  | { status: 'idle' }
  | { status: 'cache_miss'; query: OverviewRouteLensQuery }
  | { status: 'resolved'; query: OverviewRouteLensQuery; routeFamily: OverviewRouteLensRouteFamily }
