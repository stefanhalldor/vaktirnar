import { NextResponse } from 'next/server'
import {
  fetchVegagerdinCurrent,
  readVegagerdinCurrentWithHistoryFallback,
  readVegagerdinFetchTelemetry,
  recordVegagerdinFetchAttempt,
} from '@/lib/weather/providers/vegagerdinCurrent.server'
import type { VegagerdinCurrentStationDto } from '@/lib/weather/providers/vegagerdinCurrentTypes'
import { freeDriveStationFreshness } from '@/lib/weather/freeDrive'
import { getVegagerdinAccessDenialStatus } from '@/lib/weather/vegagerdinAccess.server'
import { shouldWarnVegagerdinStationAge } from '@/lib/weather/vegagerdinStationPresentation'

let repairInFlight: Promise<void> | null = null
const REPAIR_ATTEMPT_COOLDOWN_MS = 2 * 60 * 1_000

async function repairStaleVegagerdinCache(): Promise<void> {
  if (repairInFlight) return repairInFlight
  repairInFlight = (async () => {
    const attemptedAtIso = new Date().toISOString()
    await Promise.all([
      fetchVegagerdinCurrent(),
      recordVegagerdinFetchAttempt(attemptedAtIso),
    ])
  })().finally(() => {
    repairInFlight = null
  })
  return repairInFlight
}

export async function GET() {
  // When WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true, require the user to be
  // signed in and have the provider-specific feature_access row.
  //
  // Access contract:
  //   - Does NOT require a 'vedrid' row — provider access is independent of base weather access.
  //   - Only checks 'weather-provider-vegagerdin'. If you have the provider row, you get in.
  //   - In WEATHER_ENABLED=All mode: signed-out users get base weather via public tier, so a
  //     user with only a provider row (no vedrid) must still be signed in for restricted mode.
  //   - Graduation: delete WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED → open to all weather users.
  const denialStatus = await getVegagerdinAccessDenialStatus()
  if (denialStatus) {
    return NextResponse.json(
      { error: denialStatus === 401 ? 'Unauthorized' : denialStatus === 403 ? 'Forbidden' : 'Not found' },
      { status: denialStatus },
    )
  }

  // Cache-first read with history fallback. If the newest measurement is old,
  // make one cooldown-protected repair attempt before returning stale data.
  let result = await readVegagerdinCurrentWithHistoryFallback()

  const oldestBeforeRepair = result.status === 'unavailable'
    ? null
    : result.payload.measurements.reduce<string | null>(
        (oldest, measurement) => !oldest || measurement.measuredAtIso < oldest
          ? measurement.measuredAtIso
          : oldest,
        null,
      )
  if (result.status === 'unavailable' || shouldWarnVegagerdinStationAge(oldestBeforeRepair)) {
    const telemetry = await readVegagerdinFetchTelemetry()
    const lastAttemptMs = telemetry.lastAttemptedAtIso
      ? Date.parse(telemetry.lastAttemptedAtIso)
      : Number.NaN
    if (!Number.isFinite(lastAttemptMs) || Date.now() - lastAttemptMs >= REPAIR_ATTEMPT_COOLDOWN_MS) {
      await repairStaleVegagerdinCache()
      result = await readVegagerdinCurrentWithHistoryFallback()
    }
  }

  if (result.status === 'unavailable') {
    return NextResponse.json({ status: 'unavailable', reason: result.reason, stations: [] }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    })
  }

  const { payload, cacheStatus, measurementFreshness } = result
  const newestMeasuredAtIso = payload.measurements.reduce<string | null>(
    (latest, measurement) => !latest || measurement.measuredAtIso > latest
      ? measurement.measuredAtIso
      : latest,
    null,
  )
  const fetchTelemetry = freeDriveStationFreshness(newestMeasuredAtIso) === 'stale'
    ? await readVegagerdinFetchTelemetry()
    : { lastAttemptedAtIso: null }

  // Explicit DTO mapping — do not pass internal measurement shape directly.
  // This decouples the public API contract from server-internal provider types.
  const stations: VegagerdinCurrentStationDto[] = payload.measurements.map(m => ({
    stationId: m.stationId,
    stationName: m.stationName,
    lat: m.lat,
    lon: m.lon,
    measuredAtIso: m.measuredAtIso,
    fetchedAtIso: m.fetchedAtIso,
    meanWindMs: m.meanWindMs,
    gustLast10MinMs: m.gustLast10MinMs,
    windDirectionDeg: m.windDirectionDeg,
    windDirectionText: m.windDirectionText,
    airTemperatureC: m.airTemperatureC,
    roadTemperatureC: m.roadTemperatureC,
    trafficLast10Min: m.trafficLast10Min ?? null,
    trafficFromMidnight: m.trafficFromMidnight ?? null,
    humidityPercent: m.humidityPercent ?? null,
    dewPointC: m.dewPointC ?? null,
    dataQuality: m.dataQuality,
  }))

  return NextResponse.json(
    {
      status: 'ok',
      cacheStatus,
      measurementFreshness,
      fetchedAtIso: payload.fetchedAtIso,
      lastAttemptedAtIso: fetchTelemetry.lastAttemptedAtIso ?? payload.fetchedAtIso,
      oldestMeasuredAtIso: payload.oldestMeasuredAtIso,
      stations,
    },
    {
      headers: {
        // Short browser cache: data is current measurements, not user-specific.
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
      },
    },
  )
}
