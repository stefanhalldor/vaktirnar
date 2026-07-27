import type { LatLon } from './types'

export type IcelandRoadSurface = 'paved' | 'gravel' | 'mixed' | 'unknown'

export type IcelandRoadClass =
  | 'trunk'
  | 'highland_trunk'
  | 'connector'
  | 'district'
  | 'local'
  | 'ferry'
  | 'other'

export type IcelandRoadDirection = 'both' | 'forward' | 'reverse'

export type IcelandRoadSpeedSource = 'official' | 'derived'

export interface IcelandRoadGraphSegmentInput {
  id: string
  source: 'vegagerdin' | 'teskeid_fixture'
  sourceId: string
  geometry: readonly LatLon[]
  lengthM?: number
  roadNumber?: string
  roadName?: string
  roadClass: IcelandRoadClass
  surface: IcelandRoadSurface
  direction: IcelandRoadDirection
  speedKmh?: number
  speedSource?: IcelandRoadSpeedSource
  isFRoad?: boolean
  isMountainRoad?: boolean
  isSeasonal?: boolean
}

export interface IcelandRoadGraphNode {
  id: string
  point: LatLon
}

export interface IcelandRoadGraphEdge {
  id: string
  segmentId: string
  fromNodeId: string
  toNodeId: string
  geometry: readonly LatLon[]
  lengthM: number
  travelTimeS: number
  speedKmh: number
  speedSource: IcelandRoadSpeedSource
  roadNumber?: string
  roadName?: string
  roadClass: IcelandRoadClass
  surface: IcelandRoadSurface
  isFRoad: boolean
  isMountainRoad: boolean
  isSeasonal: boolean
}

export interface IcelandRoadGraph {
  nodes: ReadonlyMap<string, IcelandRoadGraphNode>
  edges: readonly IcelandRoadGraphEdge[]
  outgoing: ReadonlyMap<string, readonly IcelandRoadGraphEdge[]>
}

export interface IcelandRoadGraphDiagnostics {
  nodeCount: number
  edgeCount: number
  segmentCount: number
  weakComponentCount: number
  largestWeakComponentNodeCount: number
  isolatedNodeCount: number
  surfaceEdgeCounts: Record<IcelandRoadSurface, number>
  derivedSpeedEdgeCount: number
}

export type IcelandRoadRoutingObjective = 'fastest' | 'shortest'

export interface IcelandRoadRoutingProfile {
  objective: IcelandRoadRoutingObjective
  requirePaved?: boolean
  avoidFRoads?: boolean
  avoidMountainRoads?: boolean
  gravelPenaltyFactor?: number
  mountainPenaltyFactor?: number
}

export interface IcelandRoadSurfaceBreakdown {
  pavedM: number
  gravelM: number
  mixedM: number
  unknownM: number
}

export interface IcelandRoadGraphRoute {
  nodeIds: readonly string[]
  edgeIds: readonly string[]
  segmentIds: readonly string[]
  geometry: readonly LatLon[]
  distanceM: number
  durationS: number
  surface: IcelandRoadSurfaceBreakdown
  derivedSpeedDistanceM: number
  fRoadDistanceM: number
  fRoadNumbers: readonly string[]
}

export type IcelandRoadGraphRouteResult =
  | {
      status: 'ok'
      route: IcelandRoadGraphRoute
      snappedOriginNodeId: string
      snappedDestinationNodeId: string
      originSnapDistanceM: number
      destinationSnapDistanceM: number
    }
  | {
      status: 'no_nearby_node' | 'no_route'
    }
