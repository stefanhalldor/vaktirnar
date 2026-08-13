import type {
  VegagerdinStationCamera,
  VegagerdinStationDetail,
} from './vegagerdinStationDetailTypes'

const UMFERDIN_GRAPHQL_URL = 'https://umferdin.is/graphql'
const CAMERA_URL_PREFIX = 'https://www.vegagerdin.is/vgdata/vefmyndavelar/'
const UPSTREAM_TIMEOUT_MS = 8_000

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap(item => typeof item === 'string' ? [item] : [])
    : []
}

function parseCamera(value: unknown): VegagerdinStationCamera | null {
  const camera = record(value)
  if (!camera) return null
  const url = text(camera.url)
  const description = text(camera.description)
  const id = typeof camera.id === 'number' || typeof camera.id === 'string'
    ? String(camera.id)
    : null
  if (!id || !url || !description || !url.startsWith(CAMERA_URL_PREFIX)) return null
  return { id, description, imageUrl: url }
}

export async function fetchVegagerdinStationDetail(
  stationId: number,
): Promise<VegagerdinStationDetail | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(UMFERDIN_GRAPHQL_URL, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query TeskeidStationDetail($id: Int!) {
          WeatherStation(id: $id) {
            id name owner lastUpdate RoadConditionIds
            wind { speed gust }
            windDirection { description degrees }
            temperature roadTemperature humidity traffic trafficFromMidnight dewPoint
          }
          Cameras {
            results {
              id name RoadConditionIds
              images { id order url description }
            }
          }
        }`,
        variables: { id: stationId },
      }),
    })
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
  if (!response.ok) return null

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return null
  }
  const data = record(record(payload)?.data)
  const station = record(data?.WeatherStation)
  if (!station || finiteNumber(station.id) !== stationId) return null
  const stationName = text(station.name)
  const measuredAtIso = text(station.lastUpdate)
  if (!stationName || !measuredAtIso || !Number.isFinite(Date.parse(measuredAtIso))) return null

  const roadConditionIds = new Set(stringIds(station.RoadConditionIds))
  const wind = record(station.wind)
  const direction = record(station.windDirection)
  const camerasResult = record(data?.Cameras)?.results
  const cameras = Array.isArray(camerasResult)
    ? camerasResult
        .filter(value => {
          const camera = record(value)
          if (!camera) return false
          const sharesRoadCondition = stringIds(camera.RoadConditionIds)
            .some(id => roadConditionIds.has(id))
          return sharesRoadCondition || text(camera.name) === stationName
        })
        .flatMap(value => {
          const images = record(value)?.images
          return Array.isArray(images) ? images : []
        })
        .map(parseCamera)
        .filter((camera): camera is VegagerdinStationCamera => camera !== null)
        .slice(0, 6)
    : []

  return {
    stationId: String(stationId),
    stationName,
    measuredAtIso,
    meanWindMs: finiteNumber(wind?.speed),
    gustLast10MinMs: finiteNumber(wind?.gust),
    windDirectionDeg: finiteNumber(direction?.degrees),
    windDirectionText: text(direction?.description),
    airTemperatureC: finiteNumber(station.temperature),
    roadTemperatureC: finiteNumber(station.roadTemperature),
    trafficLast10Min: finiteNumber(station.traffic),
    trafficFromMidnight: finiteNumber(station.trafficFromMidnight),
    humidityPercent: finiteNumber(station.humidity),
    dewPointC: finiteNumber(station.dewPoint),
    ownerName: text(station.owner),
    cameras,
  }
}
