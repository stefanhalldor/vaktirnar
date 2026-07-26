export type WeatherChaseHistoryItemRequest = {
  id: string
  providerId: 'vedurstofan' | 'metno'
}

export type WeatherChaseHistoryRow = {
  timeIso: string
  temperatureC: number
  windSpeedMs: number
  windGustMs: number
  precipitationMmPerHour: number
  windDirectionText: string | null
  weatherText: string | null
  symbolCode: string | null
}

export type WeatherChaseHistoryResponse = {
  status: 'ok'
  requestedDay: string
  availableFromDay: string
  availableToDay: string
  rowsByItemId: Record<string, WeatherChaseHistoryRow[]>
}

export type WeatherChaseHistoryErrorResponse = {
  status: 'error'
  error: 'invalid_request' | 'history_unavailable'
}
