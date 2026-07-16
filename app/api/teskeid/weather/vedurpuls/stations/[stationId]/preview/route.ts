import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { getPreviewMessages } from '@/lib/chat/repository.server'

/**
 * GET /api/teskeid/weather/vedurpuls/stations/[stationId]/preview
 *
 * Public read-only preview of the latest pulse messages for a Veðurstofan station.
 * Does not require authentication. Does not create a thread.
 * Returns [] if no thread exists yet for the station.
 * Author names are first-name-only (enforced at DTO boundary in repository).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stationId: string }> }
) {
  const { stationId } = await params
  const entry = VEDURSTOFAN_STATIONS_REGISTRY.find(s => s.stationId === stationId)
  if (!entry) return NextResponse.json({ error: 'station not found' }, { status: 400 })

  try {
    const messages = await getPreviewMessages(
      { domain: 'weather', targetType: 'vedurstofan_station', targetId: stationId },
      3
    )
    return NextResponse.json(messages)
  } catch {
    return NextResponse.json([])
  }
}
