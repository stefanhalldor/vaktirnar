import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { readVegagerdinCurrentWithHistoryFallback } from '@/lib/weather/providers/vegagerdinCurrent.server'
import { getPreviewMessages } from '@/lib/chat/repository.server'

/**
 * GET /api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview
 *
 * Public read-only preview of the latest pulse messages for a Vegagerðin station.
 * Does not require authentication. Does not create a thread.
 * Returns [] if no thread exists yet for the station.
 * Author names are first-name-only (enforced at DTO boundary in repository).
 *
 * Station identity is validated against the Vegagerðin cache/history current-measurement snapshot.
 * Returns [] if cache+history is unavailable (fail-open for public preview — station pages degrade gracefully).
 * Returns 400 if stationId does not map to a known Vegagerðin station in the current snapshot.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stationId: string }> }
) {
  const { stationId } = await params

  const result = await readVegagerdinCurrentWithHistoryFallback()
  if (result.status === 'unavailable') {
    // Cache/history not populated yet — return empty preview rather than 400
    return NextResponse.json([])
  }

  const station = result.payload.measurements.find(m => m.stationId === stationId)
  if (!station) return NextResponse.json({ error: 'station not found' }, { status: 400 })

  try {
    const messages = await getPreviewMessages(
      { domain: 'weather', targetType: 'vegagerdin_station', targetId: stationId },
      3
    )
    return NextResponse.json(messages)
  } catch {
    return NextResponse.json([])
  }
}
