import { NextResponse } from 'next/server'
import {
  fetchVegagerdinCurrent,
  readVegagerdinCurrentFromCache,
  getMeasurementFreshness,
} from '@/lib/weather/providers/vegagerdinCurrent.server'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'

// Manual or scheduled cache warmer for Vegagerðin current measurements.
// Requires CRON_SECRET bearer auth — never callable by public users.
//
// IMPORTANT: This route makes a live external HTTP request to gagnaveita.vegagerdin.is.
// Do not trigger this route without explicit approval from Stebbi for the first live run.
//
// Returns only safe metadata — never the raw upstream payload or secrets.
// shapeInfo on parse failure contains keys only, never raw values or coordinates.
export const maxDuration = 30

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (getWeatherEnabledMode() === 'off') {
    return NextResponse.json({ skipped: 'weather disabled' })
  }

  // Anti-stampede: skip if cache is already fresh.
  const existing = await readVegagerdinCurrentFromCache()
  if (existing.status === 'fresh') {
    return NextResponse.json({
      skipped: 'alreadyFresh',
      stationCount: existing.payload.measurements.length,
      fetchedAtIso: existing.payload.fetchedAtIso,
    })
  }

  try {
    const result = await fetchVegagerdinCurrent()

    if (!result.ok) {
      return NextResponse.json(
        {
          status: 'error',
          reason: result.reason,
          stationCount: 0,
          // shapeInfo only present on parse_zero — safe keys-only descriptor, no raw values
          ...(result.shapeInfo ? { shapeInfo: result.shapeInfo } : {}),
        },
        { status: 500 },
      )
    }

    // Verify the read path sees the just-written data before claiming success.
    // Checks both that the cache is readable AND that fetchedAtIso matches the
    // payload we just wrote — guards against stale fallback cache masking a write failure.
    const verify = await readVegagerdinCurrentFromCache()
    if (
      verify.status === 'unavailable' ||
      verify.payload.fetchedAtIso !== result.payload.fetchedAtIso
    ) {
      return NextResponse.json(
        {
          status: 'error',
          reason: verify.status === 'unavailable' ? 'cache_verify_failed' : 'cache_verify_mismatch',
          stationCount: 0,
        },
        { status: 500 },
      )
    }

    const measurementFreshness = getMeasurementFreshness(result.payload.oldestMeasuredAtIso)

    return NextResponse.json({
      status: 'ok',
      stationCount: result.payload.measurements.length,
      fetchedAtIso: result.payload.fetchedAtIso,
      oldestMeasuredAtIso: result.payload.oldestMeasuredAtIso,
      measurementFreshness,
      historyStatus: result.historyStatus,
    })
  } catch {
    console.error('[cron/warm-vegagerdin] unexpected error')
    return NextResponse.json({ error: 'Warm failed' }, { status: 500 })
  }
}
