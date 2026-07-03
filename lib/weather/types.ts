export type WeatherStatus = 'graent' | 'gult' | 'rautt'

export type HourPoint = {
  time: string
  airTemperatureC: number
  windSpeedMs: number
  windGustMs: number
  windFromDegrees: number
  precipitationMmPerHour: number
  symbolCode: string
}

export type GolfWindow = {
  fromIso: string
  toIso: string
  maxWindMs: number
  maxGustMs: number
  maxPrecipMmPerHour: number
  avgTempC: number
  stada: WeatherStatus
}

export type DeterministicResult = {
  id: string
  source: 'deterministic'
  toolName: string
  createdAt: string
  svar: string
  stada: WeatherStatus
  reasonCode?: string
  facts?: string[]
  suggestedAction?: string
  timeWindow?: { from?: string; to?: string }
  windows?: GolfWindow[]
}

export type AiResult = {
  svar: string
  adgerd?: string
  toolResultId: string
}

export type WeatherAnswerEnvelope = {
  deterministic: DeterministicResult
  ai?: AiResult
  displayed: {
    source: 'ai' | 'deterministic'
    svar: string
    adgerd?: string
  }
}

export type ResolvedPlace = {
  name: string
  lat: number
  lon: number
}
