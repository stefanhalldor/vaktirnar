import { NextResponse } from 'next/server'
import { getVegagerdinAccessDenialStatus } from '@/lib/weather/vegagerdinAccess.server'
import { fetchVegagerdinStationDetail } from '@/lib/weather/providers/vegagerdinStationDetail.server'

export async function GET(
  _request: Request,
  context: { params: Promise<{ stationId: string }> },
) {
  const denialStatus = await getVegagerdinAccessDenialStatus()
  if (denialStatus) {
    return NextResponse.json({ error: denialStatus === 401 ? 'Unauthorized' : 'Not found' }, { status: denialStatus })
  }

  const { stationId: rawStationId } = await context.params
  if (!/^\d{1,8}$/.test(rawStationId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const detail = await fetchVegagerdinStationDetail(Number(rawStationId))
  if (!detail) {
    return NextResponse.json({ error: 'Not found' }, {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  return NextResponse.json(detail, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
  })
}
