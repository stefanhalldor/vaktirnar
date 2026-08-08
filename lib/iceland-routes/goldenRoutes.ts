import {
  findIcelandRoadGraphRoute,
  haversineDistanceM,
  ICELAND_ROUTING_PROFILES,
} from './roadGraph'
import type { IcelandRoadGraph, IcelandRoadGraphRouteResult } from './roadGraphTypes'
import type { LatLon } from './types'

export interface IcelandGoldenPlace { id: string; name: string; point: LatLon }
export interface IcelandGoldenRoute {
  id: string
  from: string
  to: string
  minKm: number
  maxKm: number
  maxRoadToAirRatio?: number
  maxSnapDistanceM?: number
  maxDirectionalDistanceDeltaM?: number
}

export const ICELAND_GOLDEN_ROUTE_DEFAULTS = {
  maxRoadToAirRatio: 4,
  maxSnapDistanceM: 2_500,
  maxDirectionalDistanceDeltaM: 1,
} as const

export const ICELAND_GOLDEN_PLACES: readonly IcelandGoldenPlace[] = [
  { id: 'reykjavik', name: 'Reykjavík', point: { lat: 64.1466, lon: -21.9426 } },
  { id: 'keflavik', name: 'Keflavík', point: { lat: 64.0049, lon: -22.5624 } },
  { id: 'borgarnes', name: 'Borgarnes', point: { lat: 64.5383, lon: -21.9206 } },
  { id: 'stykkisholmur', name: 'Stykkishólmur', point: { lat: 65.0754, lon: -22.7290 } },
  { id: 'isafjordur', name: 'Ísafjörður', point: { lat: 66.0748, lon: -23.1340 } },
  { id: 'holmavik', name: 'Hólmavík', point: { lat: 65.7043, lon: -21.6707 } },
  { id: 'blonduos', name: 'Blönduós', point: { lat: 65.6609, lon: -20.2808 } },
  { id: 'saudarkrokur', name: 'Sauðárkrókur', point: { lat: 65.7461, lon: -19.6394 } },
  { id: 'akureyri', name: 'Akureyri', point: { lat: 65.6885, lon: -18.1262 } },
  { id: 'husavik', name: 'Húsavík', point: { lat: 66.0449, lon: -17.3389 } },
  { id: 'myvatn', name: 'Mývatn', point: { lat: 65.6429, lon: -16.9120 } },
  { id: 'egilsstadir', name: 'Egilsstaðir', point: { lat: 65.2669, lon: -14.3948 } },
  { id: 'seydisfjordur', name: 'Seyðisfjörður', point: { lat: 65.2601, lon: -14.0090 } },
  { id: 'hofn', name: 'Höfn', point: { lat: 64.2539, lon: -15.2082 } },
  { id: 'kirkjubaejarklaustur', name: 'Kirkjubæjarklaustur', point: { lat: 63.7900, lon: -18.0578 } },
  { id: 'vik', name: 'Vík', point: { lat: 63.4186, lon: -19.0060 } },
  { id: 'selfoss', name: 'Selfoss', point: { lat: 63.9335, lon: -20.9971 } },
  { id: 'eyrarbakki', name: 'Eyrarbakki', point: { lat: 63.862977, lon: -21.147919 } },
  { id: 'vestmannaeyjar', name: 'Vestmannaeyjar', point: { lat: 63.4427, lon: -20.2734 } },
] as const

export const ICELAND_GOLDEN_ROUTES: readonly IcelandGoldenRoute[] = [
  { id: 'rvk-kef', from: 'reykjavik', to: 'keflavik', minKm: 40, maxKm: 65 },
  { id: 'rvk-selfoss', from: 'reykjavik', to: 'selfoss', minKm: 45, maxKm: 75 },
  { id: 'rvk-borg', from: 'reykjavik', to: 'borgarnes', minKm: 60, maxKm: 95 },
  {
    id: 'rvk-stykk', from: 'reykjavik', to: 'stykkisholmur', minKm: 165, maxKm: 185,
    maxRoadToAirRatio: 1.8,
  },
  { id: 'rvk-ak', from: 'reykjavik', to: 'akureyri', minKm: 360, maxKm: 430 },
  { id: 'rvk-isaf', from: 'reykjavik', to: 'isafjordur', minKm: 420, maxKm: 500 },
  { id: 'rvk-egils', from: 'reykjavik', to: 'egilsstadir', minKm: 600, maxKm: 680 },
  { id: 'rvk-hofn', from: 'reykjavik', to: 'hofn', minKm: 430, maxKm: 500 },
  {
    id: 'borg-stykk', from: 'borgarnes', to: 'stykkisholmur', minKm: 90, maxKm: 110,
    maxRoadToAirRatio: 1.8,
  },
  { id: 'borg-holm', from: 'borgarnes', to: 'holmavik', minKm: 145, maxKm: 180 },
  { id: 'holm-isaf', from: 'holmavik', to: 'isafjordur', minKm: 200, maxKm: 260 },
  { id: 'borg-blon', from: 'borgarnes', to: 'blonduos', minKm: 165, maxKm: 215 },
  { id: 'blon-saud', from: 'blonduos', to: 'saudarkrokur', minKm: 45, maxKm: 75 },
  { id: 'blon-ak', from: 'blonduos', to: 'akureyri', minKm: 135, maxKm: 180 },
  { id: 'ak-hus', from: 'akureyri', to: 'husavik', minKm: 70, maxKm: 105 },
  { id: 'ak-myvatn', from: 'akureyri', to: 'myvatn', minKm: 75, maxKm: 115 },
  { id: 'myvatn-egils', from: 'myvatn', to: 'egilsstadir', minKm: 150, maxKm: 210 },
  { id: 'egils-seydis', from: 'egilsstadir', to: 'seydisfjordur', minKm: 20, maxKm: 35 },
  { id: 'egils-hofn', from: 'egilsstadir', to: 'hofn', minKm: 175, maxKm: 230 },
  { id: 'hofn-klaustur', from: 'hofn', to: 'kirkjubaejarklaustur', minKm: 175, maxKm: 215 },
  { id: 'klaustur-vik', from: 'kirkjubaejarklaustur', to: 'vik', minKm: 65, maxKm: 90 },
  { id: 'vik-selfoss', from: 'vik', to: 'selfoss', minKm: 120, maxKm: 155 },
  {
    id: 'eyrarbakki-selfoss', from: 'eyrarbakki', to: 'selfoss', minKm: 9, maxKm: 16,
    maxRoadToAirRatio: 1.5,
  },
] as const

const places = new Map(ICELAND_GOLDEN_PLACES.map(place => [place.id, place]))

export type IcelandGoldenRouteAuditStatus =
  | IcelandRoadGraphRouteResult['status']
  | IcelandGoldenReverseRouteAuditStatus
  | 'snap_out_of_range'
  | 'distance_out_of_range'
  | 'stretch_out_of_range'
  | 'directional_distance_mismatch'

type IcelandRoadGraphRouteStatus = IcelandRoadGraphRouteResult['status']
export type IcelandRoadGraphRouteFailureStatus = Exclude<IcelandRoadGraphRouteStatus, 'ok'>
export type IcelandGoldenReverseRouteAuditStatus =
  `reverse_${IcelandRoadGraphRouteFailureStatus}`

export function reverseIcelandGoldenRouteAuditStatus(
  status: IcelandRoadGraphRouteFailureStatus,
): IcelandGoldenReverseRouteAuditStatus {
  switch (status) {
    case 'no_nearby_node': return 'reverse_no_nearby_node'
    case 'no_route': return 'reverse_no_route'
    default: {
      const exhaustive: never = status
      throw new Error(`unsupported_reverse_route_status:${String(exhaustive)}`)
    }
  }
}

export interface IcelandGoldenRouteAudit extends IcelandGoldenRoute {
  fromName: string
  toName: string
  status: IcelandGoldenRouteAuditStatus
  distanceKm: number | null
  reverseDistanceKm: number | null
  airDistanceKm: number
  roadToAirRatio: number | null
  directionalDistanceDeltaM: number | null
  durationMinutes: number | null
  segmentCount: number
  pavedKm: number
  gravelKm: number
  mixedKm: number
  unknownKm: number
  originSnapM: number | null
  destinationSnapM: number | null
  reverseOriginSnapM: number | null
  reverseDestinationSnapM: number | null
}

export function auditIcelandGoldenRoutes(graph: IcelandRoadGraph): IcelandGoldenRouteAudit[] {
  return ICELAND_GOLDEN_ROUTES.map(definition => {
    const from = places.get(definition.from)!
    const to = places.get(definition.to)!
    const maximumSnapDistanceM = definition.maxSnapDistanceM
      ?? ICELAND_GOLDEN_ROUTE_DEFAULTS.maxSnapDistanceM
    const maximumRoadToAirRatio = definition.maxRoadToAirRatio
      ?? ICELAND_GOLDEN_ROUTE_DEFAULTS.maxRoadToAirRatio
    const maximumDirectionalDistanceDeltaM = definition.maxDirectionalDistanceDeltaM
      ?? ICELAND_GOLDEN_ROUTE_DEFAULTS.maxDirectionalDistanceDeltaM
    const airDistanceKm = haversineDistanceM(from.point, to.point) / 1_000
    const result = findIcelandRoadGraphRoute(graph, from.point, to.point, {
      profile: ICELAND_ROUTING_PROFILES.fastestCar,
      maxSnapDistanceM: maximumSnapDistanceM,
    })
    if (result.status !== 'ok') return {
      ...definition, fromName: from.name, toName: to.name, status: result.status,
      distanceKm: null, reverseDistanceKm: null, airDistanceKm, roadToAirRatio: null,
      directionalDistanceDeltaM: null, durationMinutes: null, segmentCount: 0, pavedKm: 0,
      gravelKm: 0, mixedKm: 0, unknownKm: 0, originSnapM: null, destinationSnapM: null,
      reverseOriginSnapM: null, reverseDestinationSnapM: null,
    }
    const reverse = findIcelandRoadGraphRoute(graph, to.point, from.point, {
      profile: ICELAND_ROUTING_PROFILES.fastestCar,
      maxSnapDistanceM: maximumSnapDistanceM,
    })
    const distanceKm = result.route.distanceM / 1000
    const reverseDistanceKm = reverse.status === 'ok' ? reverse.route.distanceM / 1_000 : null
    const roadToAirRatio = airDistanceKm > 0 ? distanceKm / airDistanceKm : null
    const directionalDistanceDeltaM = reverse.status === 'ok'
      ? Math.abs(result.route.distanceM - reverse.route.distanceM)
      : null
    let status: IcelandGoldenRouteAuditStatus = 'ok'
    if (reverse.status !== 'ok') {
      status = reverseIcelandGoldenRouteAuditStatus(reverse.status)
    }
    else if (
      result.originSnapDistanceM > maximumSnapDistanceM
      || result.destinationSnapDistanceM > maximumSnapDistanceM
      || reverse.originSnapDistanceM > maximumSnapDistanceM
      || reverse.destinationSnapDistanceM > maximumSnapDistanceM
    ) status = 'snap_out_of_range'
    else if (distanceKm < definition.minKm || distanceKm > definition.maxKm) {
      status = 'distance_out_of_range'
    } else if (roadToAirRatio === null || roadToAirRatio > maximumRoadToAirRatio) {
      status = 'stretch_out_of_range'
    } else if (
      directionalDistanceDeltaM === null
      || directionalDistanceDeltaM > maximumDirectionalDistanceDeltaM
    ) {
      status = 'directional_distance_mismatch'
    }
    return {
      ...definition, fromName: from.name, toName: to.name,
      status,
      distanceKm, durationMinutes: result.route.durationS / 60,
      reverseDistanceKm, airDistanceKm, roadToAirRatio, directionalDistanceDeltaM,
      segmentCount: result.route.segmentIds.length,
      pavedKm: result.route.surface.pavedM / 1000,
      gravelKm: result.route.surface.gravelM / 1000,
      mixedKm: result.route.surface.mixedM / 1000,
      unknownKm: result.route.surface.unknownM / 1000,
      originSnapM: result.originSnapDistanceM,
      destinationSnapM: result.destinationSnapDistanceM,
      reverseOriginSnapM: reverse.status === 'ok' ? reverse.originSnapDistanceM : null,
      reverseDestinationSnapM: reverse.status === 'ok' ? reverse.destinationSnapDistanceM : null,
    }
  })
}
