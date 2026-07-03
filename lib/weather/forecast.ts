import type { HourPoint } from './types'

type MetnoInstantDetails = {
  air_temperature?: number
  wind_speed?: number
  wind_speed_of_gust?: number
  wind_from_direction?: number
}

type MetnoNextPeriod = {
  summary?: { symbol_code?: string }
  details?: { precipitation_amount?: number }
}

type MetnoTimeseries = {
  time: string
  data: {
    instant: { details?: MetnoInstantDetails }
    next_1_hours?: MetnoNextPeriod
    next_6_hours?: MetnoNextPeriod
  }
}

type MetnoResponse = {
  properties: { timeseries: MetnoTimeseries[] }
}

export function parseMetnoForecast(raw: unknown): HourPoint[] {
  const response = raw as MetnoResponse
  const timeseries = response?.properties?.timeseries ?? []

  return timeseries
    .filter((ts) => {
      const d = ts.data?.instant?.details
      if (d?.wind_speed === undefined) return false
      // Skip entries with no precipitation period data — can't distinguish "no rain" from "no data"
      return ts.data?.next_1_hours !== undefined || ts.data?.next_6_hours !== undefined
    })
    .map((ts) => {
    const d = ts.data?.instant?.details ?? {}
    const next1 = ts.data?.next_1_hours
    const next6 = ts.data?.next_6_hours
    const symbolCode = next1?.summary?.symbol_code ?? next6?.summary?.symbol_code ?? 'clearsky_day'
    const precipitation = next1?.details?.precipitation_amount ?? next6?.details?.precipitation_amount ?? 0

    return {
      time: ts.time,
      airTemperatureC: d.air_temperature ?? 0,
      windSpeedMs: d.wind_speed ?? 0,
      windGustMs: d.wind_speed_of_gust ?? d.wind_speed ?? 0,
      windFromDegrees: d.wind_from_direction ?? 0,
      precipitationMmPerHour: precipitation,
      symbolCode,
    }
  })
}

export function filterHours(points: HourPoint[], fromIso: string, toIso: string): HourPoint[] {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  return points.filter((p) => {
    const t = new Date(p.time).getTime()
    return t >= from && t <= to
  })
}
