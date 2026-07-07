import type { HourPoint, DeterministicResult, GolfWindow, WeatherStatus } from './types'
import type { TrailerKind } from './question'
import { WEATHER_THRESHOLDS } from './thresholds'
import { filterHours } from './forecast'

function makeId(): string {
  return `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Golf window ──────────────────────────────────────────────────────────────

// Number of consecutive hourly data points that cover 18 holes (4.5 h)
const GOLF_WINDOW_SIZE = Math.ceil(WEATHER_THRESHOLDS.golf.eighteenHolesHours) // 5

function windowStada(maxWindMs: number, maxPrecipMmPerHour: number): WeatherStatus {
  if (maxWindMs >= WEATHER_THRESHOLDS.golf.hardWindMs) return 'rautt'
  if (
    maxWindMs >= WEATHER_THRESHOLDS.golf.discomfortWindMs ||
    maxPrecipMmPerHour > WEATHER_THRESHOLDS.dry.maxPrecipMmPerHour
  ) return 'gult'
  return 'graent'
}

// Iceland is UTC+0 year-round — UTC hours equal local hours
function formatHHMM(isoString: string, offsetMinutes: number): string {
  const d = new Date(isoString)
  const totalMins = d.getUTCHours() * 60 + d.getUTCMinutes() + offsetMinutes
  const h = Math.floor(totalMins / 60) % 24
  const m = totalMins % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function formatGolfRange(fromIso: string): string {
  const endOffsetMins = Math.round(WEATHER_THRESHOLDS.golf.eighteenHolesHours * 60)
  return `${formatHHMM(fromIso, 0)}–${formatHHMM(fromIso, endOffsetMins)}`
}

export type GolfInput = {
  placeName: string
  hours: HourPoint[]
  fromIso: string
  toIso: string
}

export function checkGolfWindow(input: GolfInput): DeterministicResult {
  const { placeName, hours, fromIso, toIso } = input
  const available = filterHours(hours, fromIso, toIso)

  if (available.length < GOLF_WINDOW_SIZE) {
    return {
      id: makeId(),
      source: 'deterministic',
      toolName: 'checkGolfWindow',
      createdAt: new Date().toISOString(),
      svar: `Engar veðurspár fundust fyrir ${placeName} á þessum tíma.`,
      stada: 'gult',
      reasonCode: 'no_data',
      timeWindow: { from: fromIso, to: toIso },
    }
  }

  type Slot = {
    idx: number
    fromIso: string
    maxWindMs: number
    maxGustMs: number
    maxPrecipMmPerHour: number
    avgTempC: number
    stada: WeatherStatus
    rank: number
  }

  const slots: Slot[] = []
  for (let i = 0; i + GOLF_WINDOW_SIZE <= available.length; i++) {
    const slice = available.slice(i, i + GOLF_WINDOW_SIZE)
    const maxWindMs = Math.max(...slice.map((h) => h.windSpeedMs))
    const maxGustMs = Math.max(...slice.map((h) => h.windGustMs))
    const maxPrecipMmPerHour = Math.max(...slice.map((h) => h.precipitationMmPerHour))
    const avgTempC = slice.reduce((s, h) => s + h.airTemperatureC, 0) / slice.length
    const stada = windowStada(maxWindMs, maxPrecipMmPerHour)
    const tier = stada === 'graent' ? 0 : stada === 'gult' ? 1 : 2
    // Lower rank = better. Wind as tiebreaker within tier.
    const rank = tier * 100 + maxWindMs
    slots.push({ idx: i, fromIso: slice[0].time, maxWindMs, maxGustMs, maxPrecipMmPerHour, avgTempC, stada, rank })
  }

  slots.sort((a, b) => a.rank - b.rank)

  // Pick best + up to 2 non-overlapping alternatives
  const chosen: Slot[] = [slots[0]]
  for (const slot of slots.slice(1)) {
    if (chosen.length >= 3) break
    const overlaps = chosen.some(
      (c) => slot.idx < c.idx + GOLF_WINDOW_SIZE && slot.idx + GOLF_WINDOW_SIZE > c.idx
    )
    if (!overlaps) chosen.push(slot)
  }

  const best = chosen[0]

  const golfWindows: GolfWindow[] = chosen.map((s) => ({
    fromIso: s.fromIso,
    toIso: new Date(
      new Date(s.fromIso).getTime() +
      Math.round(WEATHER_THRESHOLDS.golf.eighteenHolesHours * 60 * 60 * 1000)
    ).toISOString(),
    maxWindMs: s.maxWindMs,
    maxGustMs: s.maxGustMs,
    maxPrecipMmPerHour: s.maxPrecipMmPerHour,
    avgTempC: s.avgTempC,
    stada: s.stada,
  }))

  const windNote =
    best.maxWindMs >= WEATHER_THRESHOLDS.golf.hardWindMs
      ? `of mikill vindur (${best.maxWindMs.toFixed(0)} m/s)`
      : best.maxWindMs >= WEATHER_THRESHOLDS.golf.discomfortWindMs
      ? `áhyggjusamur vindur (${best.maxWindMs.toFixed(0)} m/s)`
      : `vindur ${best.maxWindMs.toFixed(0)} m/s`

  const svar =
    best.stada === 'rautt'
      ? `Enginn góður golfgluggi í ${placeName} á þessum tíma — ${windNote}.`
      : `Besti golfglugginn í ${placeName} er ${formatGolfRange(best.fromIso)} (${windNote}).`

  const facts: string[] = golfWindows.map((w, i) => {
    const label = i === 0 ? 'Besti gluggi' : i === 1 ? 'Annar gluggi' : 'Þriðji gluggi'
    const windStr = `${w.maxWindMs.toFixed(1)} m/s`
    const precipStr = w.maxPrecipMmPerHour > WEATHER_THRESHOLDS.dry.maxPrecipMmPerHour ? ', rigning' : ''
    return `${label}: ${formatGolfRange(w.fromIso)}, vindur ${windStr}${precipStr}, ${w.avgTempC.toFixed(0)}°C`
  })

  const reasonCode =
    best.stada === 'rautt'
      ? 'too_windy_golf'
      : best.stada === 'gult'
      ? best.maxWindMs >= WEATHER_THRESHOLDS.golf.discomfortWindMs
        ? 'discomfort_wind_golf'
        : 'precipitation'
      : undefined

  return {
    id: makeId(),
    source: 'deterministic',
    toolName: 'checkGolfWindow',
    createdAt: new Date().toISOString(),
    svar,
    stada: best.stada,
    reasonCode,
    facts,
    windows: golfWindows,
    timeWindow: { from: fromIso, to: toIso },
  }
}

// ── Route weather ─────────────────────────────────────────────────────────────

export type RouteWeatherInput = {
  trailerKind: TrailerKind
  originName: string
  destinationName: string
  distanceM: number
  durationS: number
  pointForecasts: Array<{ hours: HourPoint[] }>
  fromIso: string
  toIso: string
}

export function checkRouteWeather(input: RouteWeatherInput): DeterministicResult {
  const { trailerKind, originName, destinationName, distanceM, durationS, pointForecasts, fromIso, toIso } = input

  const distanceKm = Math.round(distanceM / 1000)
  const durationH = Math.round(durationS / 3600)
  const routeDesc = `${originName} → ${destinationName} (${distanceKm} km, um ${durationH} klst.)`

  let worstWindMs = 0
  let worstGustMs = 0
  let worstPrecipMmPerHour = 0
  let hasData = false

  for (const { hours } of pointForecasts) {
    const filtered = filterHours(hours, fromIso, toIso)
    if (filtered.length === 0) continue
    hasData = true
    worstWindMs = Math.max(worstWindMs, ...filtered.map((h) => h.windSpeedMs))
    worstGustMs = Math.max(worstGustMs, ...filtered.map((h) => h.windGustMs))
    worstPrecipMmPerHour = Math.max(worstPrecipMmPerHour, ...filtered.map((h) => h.precipitationMmPerHour))
  }

  if (!hasData) {
    return {
      id: makeId(),
      source: 'deterministic',
      toolName: 'checkRouteWeather',
      createdAt: new Date().toISOString(),
      svar: `Engar veðurspár fundust fyrir leiðina ${originName} → ${destinationName}.`,
      stada: 'gult',
      reasonCode: 'no_data',
      timeWindow: { from: fromIso, to: toIso },
    }
  }

  const { cautionWindMs, redWindMs, redGustMs } = WEATHER_THRESHOLDS.caravan

  let stada: WeatherStatus = 'graent'
  let reasonCode: string | undefined
  let suggestedAction: string | undefined

  if (worstWindMs >= redWindMs || worstGustMs >= redGustMs) {
    stada = 'rautt'
    reasonCode = 'too_windy_trailer'
    suggestedAction = 'Hættulegt að aka með eftirvagn í þessum vindum.'
  } else if (worstWindMs >= cautionWindMs || worstPrecipMmPerHour > WEATHER_THRESHOLDS.dry.maxPrecipMmPerHour) {
    stada = 'gult'
    reasonCode = worstWindMs >= cautionWindMs ? 'caution_wind_trailer' : 'precipitation'
    suggestedAction = 'Gaumgæfni ráðlögð. Vindur getur valdið óstöðugleika á eftirvagni.'
  }

  const pointCount = pointForecasts.length

  const svar =
    stada === 'rautt'
      ? `Hættulegt að aka með eftirvagn á leiðinni ${routeDesc}. Vindur nær ${worstWindMs.toFixed(0)} m/s á einhverjum stöðum.`
      : stada === 'gult'
      ? `Óþægilegar aðstæður á leiðinni ${routeDesc}. Skoðaði ${pointCount} veðurpunkta.`
      : `Veðrið lítur vel út á leiðinni ${routeDesc}. Skoðaði ${pointCount} veðurpunkta.`

  const facts: string[] = [
    `Leið: ${routeDesc}`,
    `Skoðaði ${pointCount} veðurpunkta á leiðinni`,
    `Versti vindur: ${worstWindMs.toFixed(1)} m/s (hviður: ${worstGustMs.toFixed(1)} m/s)`,
    `Mesta úrkoma: ${worstPrecipMmPerHour.toFixed(1)} mm/klst`,
  ]

  if (trailerKind === 'horse_trailer') {
    facts.push('Hestakerra: gæti krafist sérstaks ökuréttindaflokks (BE) og er viðkvæmari fyrir hliðarvindum.')
  }

  facts.push('Þetta er veðurmat, ekki umferðar- eða farartrygging.')

  return {
    id: makeId(),
    source: 'deterministic',
    toolName: 'checkRouteWeather',
    createdAt: new Date().toISOString(),
    svar,
    stada,
    reasonCode,
    facts,
    suggestedAction,
    timeWindow: { from: fromIso, to: toIso },
  }
}

// ── Grill ────────────────────────────────────────────────────────────────────

export type GrillInput = {
  placeName: string
  hours: HourPoint[]
  fromIso: string
  toIso: string
}

export function checkGrillWeather(input: GrillInput): DeterministicResult {
  const { placeName, hours, fromIso, toIso } = input
  const window = filterHours(hours, fromIso, toIso)

  if (window.length === 0) {
    return {
      id: makeId(),
      source: 'deterministic',
      toolName: 'checkGrillWeather',
      createdAt: new Date().toISOString(),
      svar: `Engar veðurspár fundust fyrir ${placeName} á þessum tíma.`,
      stada: 'gult',
      reasonCode: 'no_data',
      timeWindow: { from: fromIso, to: toIso },
    }
  }

  const maxWind = Math.max(...window.map((h) => h.windSpeedMs))
  const maxGust = Math.max(...window.map((h) => h.windGustMs))
  const maxPrecip = Math.max(...window.map((h) => h.precipitationMmPerHour))
  const avgTemp = window.reduce((s, h) => s + h.airTemperatureC, 0) / window.length

  const facts: string[] = [
    `Vindur: ${maxWind.toFixed(1)} m/s (vindhviður: ${maxGust.toFixed(1)} m/s)`,
    `Úrkoma: ${maxPrecip.toFixed(1)} mm/klst`,
    `Hitastig: ${avgTemp.toFixed(0)}°C`,
  ]

  let stada: WeatherStatus = 'graent'
  let reasonCode: string | undefined
  let suggestedAction: string | undefined

  if (maxWind > WEATHER_THRESHOLDS.grill.tooWindyMs) {
    stada = 'rautt'
    reasonCode = 'too_windy'
    suggestedAction = 'Hættulegt að grilla. Vindurinn er of sterkur.'
  } else if (maxPrecip > WEATHER_THRESHOLDS.dry.maxPrecipMmPerHour) {
    stada = 'gult'
    reasonCode = 'precipitation'
    suggestedAction = 'Það er von á úrkomu. Mögulegt í skjóli.'
  } else if (avgTemp < 5) {
    stada = 'gult'
    reasonCode = 'cold'
    suggestedAction = 'Grillveður að öðru leyti, en kalt. Klæddu þig vel.'
  }

  const svar =
    stada === 'graent'
      ? `Já, þetta lítur vel út til að grilla í ${placeName}!`
      : stada === 'gult'
      ? `Mögulega grillveður í ${placeName}, en með fyrirvara.`
      : `Hættulegt að grilla í ${placeName} á þessum tíma.`

  return {
    id: makeId(),
    source: 'deterministic',
    toolName: 'checkGrillWeather',
    createdAt: new Date().toISOString(),
    svar,
    stada,
    reasonCode,
    facts,
    suggestedAction,
    timeWindow: { from: fromIso, to: toIso },
  }
}
