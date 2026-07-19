export type IcelandRouteNodeId = string
export type IcelandRouteSegmentId = string
export type IcelandRouteFamilyId = string
export type IcelandRouteSafetyFlagId = string

export type IcelandRouteProvider =
  | 'google_routes'
  | 'teskeid_registry'
  | 'manual'

export interface LatLon {
  lat: number
  lon: number
}

export type IcelandRouteSegmentSuitability =
  | 'normal'
  | 'watch'
  | 'avoid_with_trailer'
  | 'seasonal_or_unknown'

export type IcelandRouteSafetySeverity =
  | 'info'
  | 'caution'
  | 'danger'

export interface IcelandRouteNode {
  id: IcelandRouteNodeId
  name: string
  point: LatLon
  aliases?: readonly string[]
}

export interface IcelandRouteSafetyFlag {
  id: IcelandRouteSafetyFlagId
  label: string
  severity: IcelandRouteSafetySeverity
  explanation: string
  appliesTo?: readonly string[]
  source?: string
}

export interface IcelandRouteSegment {
  id: IcelandRouteSegmentId
  name: string
  routeNumbers?: readonly string[]
  aliases?: readonly string[]
  fromNodeId?: IcelandRouteNodeId
  toNodeId?: IcelandRouteNodeId
  geometry: readonly LatLon[]
  suitability?: IcelandRouteSegmentSuitability
  safetyFlags?: readonly IcelandRouteSafetyFlag[]
  notes?: string
}

export interface IcelandRouteFamily {
  id: IcelandRouteFamilyId
  label: string
  description?: string
  segmentIds: readonly IcelandRouteSegmentId[]
  aliases?: readonly string[]
}

export interface RouteIntelligenceCheck {
  touchesRouteWork: boolean
  routeOrSegment?: string
  shouldUpdateRegistry: boolean
  registryDecision: string
  privacyNotes?: string
  costNotes?: string
}

