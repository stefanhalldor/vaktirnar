import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { getPreviewMessagesForStations } from '@/lib/chat/repository.server'

const KNOWN_STATION_IDS = new Set(
  VEDURSTOFAN_STATIONS_REGISTRY.filter(s => s.stationId !== null).map(s => s.stationId!)
)

const MAX_STATION_IDS = 40
const MAX_LIMIT_PER_STATION = 3

/**
 * POST /api/teskeid/weather/vedurpuls/route-preview
 *
 * Returns the latest pulse messages for a batch of Veðurstofan stations,
 * grouped by stationId. Intended for route-scoped Safnpúls on /vedrid.
 *
 * Public endpoint — no auth required (same access level as single-station preview).
 * Does not create threads. Does not expose private user data.
 *
 * Security:
 * - All stationIds are validated against the known registry (rejects unknown IDs).
 * - Max 40 stations per request.
 * - Max 3 messages per station (fixed; client-supplied limit is clamped).
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { stationIds, limitPerStation } = body as Record<string, unknown>

  if (!Array.isArray(stationIds) || stationIds.length === 0) {
    return NextResponse.json({ error: 'stationIds must be a non-empty array' }, { status: 400 })
  }

  if (stationIds.length > MAX_STATION_IDS) {
    return NextResponse.json({ error: `stationIds exceeds maximum of ${MAX_STATION_IDS}` }, { status: 400 })
  }

  if (!stationIds.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'stationIds must be strings' }, { status: 400 })
  }

  const unknownIds = stationIds.filter(id => !KNOWN_STATION_IDS.has(id))
  if (unknownIds.length > 0) {
    return NextResponse.json({ error: 'unknown stationIds', unknownIds }, { status: 400 })
  }

  const limit = typeof limitPerStation === 'number'
    ? Math.min(Math.max(1, limitPerStation), MAX_LIMIT_PER_STATION)
    : MAX_LIMIT_PER_STATION

  try {
    const messagesMap = await getPreviewMessagesForStations(stationIds, limit)
    const stations = stationIds.map(stationId => ({
      stationId,
      messages: messagesMap.get(stationId) ?? [],
    }))
    return NextResponse.json({ stations })
  } catch {
    return NextResponse.json({ error: 'preview unavailable' }, { status: 500 })
  }
}
