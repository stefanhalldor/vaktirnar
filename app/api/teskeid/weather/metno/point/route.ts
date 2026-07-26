import { NextResponse } from 'next/server'
import { ROAD_MAP_PLACES } from '@/lib/road-intelligence/roadMapPlaces'
import { fetchRoadMapPlaceMetnoForecast } from '@/lib/weather/weatherChaseHistory.server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const url = new URL(request.url)
  const placeId = url.searchParams.get('placeId')?.trim() ?? ''
  const place = ROAD_MAP_PLACES.find(candidate => candidate.id === placeId)

  if (!place) {
    return NextResponse.json({ status: 'error', error: 'invalid_place_id' }, { status: 400 })
  }

  try {
    const forecasts = await fetchRoadMapPlaceMetnoForecast(place)
    if (forecasts.length === 0) {
      return NextResponse.json({ status: 'error', error: 'forecast_unavailable' }, { status: 503 })
    }
    return NextResponse.json({
      status: 'ok',
      forecasts,
    })
  } catch {
    console.error('[weather/metno/point] fetch failed')
    return NextResponse.json({ status: 'error', error: 'forecast_unavailable' }, { status: 502 })
  }
}
