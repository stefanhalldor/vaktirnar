import { NextResponse } from 'next/server'
import { fetchForecast } from '@/lib/weather/metno.server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function parseFiniteQueryNumber(value: string | null): number | null {
  if (value === null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lat = parseFiniteQueryNumber(url.searchParams.get('lat'))
  const lon = parseFiniteQueryNumber(url.searchParams.get('lon'))

  if (lat === null || lon === null) {
    return NextResponse.json({ status: 'error', error: 'lat_lon_required' }, { status: 400 })
  }

  if (lat < 62 || lat > 68 || lon < -26 || lon > -12) {
    return NextResponse.json({ status: 'error', error: 'outside_iceland_bounds' }, { status: 400 })
  }

  try {
    const forecasts = await fetchForecast(lat, lon)
    return NextResponse.json({ status: 'ok', forecasts })
  } catch {
    console.error('[weather/metno/point] fetch failed')
    return NextResponse.json({ status: 'error', error: 'forecast_unavailable' }, { status: 502 })
  }
}
