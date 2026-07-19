import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
} as const

/**
 * GET /api/teskeid/weather/route-memory/places
 *
 * Returns distinct places that appear in route-memory as either a from- or to-place.
 * Bidirectional: union of from_place_* and to_place_* so both endpoints of a stored
 * route are always visible in the picker's first step.
 *
 * Output: { places: Array<{ key: string; label: string }> } sorted alphabetically.
 *
 * Access: public (place labels are not sensitive).
 * Added to EXACT_PUBLIC_PATHS in middleware.ts.
 */
export async function GET() {
  try {
    const supabase = getAdmin()
    const [fromResult, toResult] = await Promise.all([
      supabase
        .from('weather_route_memory_routes')
        .select('from_place_key, from_place_label'),
      supabase
        .from('weather_route_memory_routes')
        .select('to_place_key, to_place_label'),
    ])

    if (fromResult.error && toResult.error) {
      return NextResponse.json({ places: [] })
    }

    const seen = new Set<string>()
    const places: { key: string; label: string }[] = []

    for (const row of fromResult.data ?? []) {
      const key = row.from_place_key as string
      if (!seen.has(key)) {
        seen.add(key)
        places.push({ key, label: row.from_place_label as string })
      }
    }

    for (const row of toResult.data ?? []) {
      const key = row.to_place_key as string
      if (!seen.has(key)) {
        seen.add(key)
        places.push({ key, label: row.to_place_label as string })
      }
    }

    places.sort((a, b) => a.label.localeCompare(b.label, 'is'))

    return NextResponse.json({ places }, { headers: NO_STORE_HEADERS })
  } catch {
    return NextResponse.json({ places: [] }, { headers: NO_STORE_HEADERS })
  }
}
