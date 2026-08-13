export type VegagerdinStationCamera = {
  id: string
  description: string
  imageUrl: string
}

export type VegagerdinStationDetail = {
  stationId: string
  stationName: string
  measuredAtIso: string
  meanWindMs: number | null
  gustLast10MinMs: number | null
  windDirectionDeg: number | null
  windDirectionText: string | null
  airTemperatureC: number | null
  roadTemperatureC: number | null
  trafficLast10Min: number | null
  trafficFromMidnight: number | null
  humidityPercent: number | null
  dewPointC: number | null
  ownerName: string | null
  cameras: VegagerdinStationCamera[]
}
