import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
} as const

/**
 * GET /api/teskeid/weather/route-memory/destinations?from={placeKey}
 *
 * Returns distinct counterpart places for a given place key, bidirectionally:
 * - rows where from_place_key = key → return to_place_*
 * - rows where to_place_key = key  → return from_place_*
 *
 * This means that if route-memory contains "Reykjavík → Akureyri", selecting
 * either Reykjavík or Akureyri as the first place will surface the other as a
 * destination option.
 *
 * Output: { destinations: Array<{ key: string; label: string }> } sorted alphabetically.
 *
 * Access: public (place labels are not sensitive).
 * Added to EXACT_PUBLIC_PATHS in middleware.ts.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')?.trim()

  if (!from) {
    return NextResponse.json({ destinations: [] }, { headers: NO_STORE_HEADERS })
  }

  try {
    const supabase = getAdmin()
    const [asFromResult, asToResult] = await Promise.all([
      // place is the 'from' — return to_place_*
      supabase
        .from('weather_route_memory_routes')
        .select('to_place_key, to_place_label')
        .eq('from_place_key', from),
      // place is the 'to' — return from_place_*
      supabase
        .from('weather_route_memory_routes')
        .select('from_place_key, from_place_label')
        .eq('to_place_key', from),
    ])

    const seen = new Set<string>()
    const destinations: { key: string; label: string }[] = []

    for (const row of asFromResult.data ?? []) {
      const key = row.to_place_key as string
      if (!seen.has(key) && key !== from) {
        seen.add(key)
        destinations.push({ key, label: row.to_place_label as string })
      }
    }

    for (const row of asToResult.data ?? []) {
      const key = row.from_place_key as string
      if (!seen.has(key) && key !== from) {
        seen.add(key)
        destinations.push({ key, label: row.from_place_label as string })
      }
    }

    destinations.sort((a, b) => a.label.localeCompare(b.label, 'is'))

    return NextResponse.json({ destinations }, { headers: NO_STORE_HEADERS })
  } catch {
    return NextResponse.json({ destinations: [] }, { headers: NO_STORE_HEADERS })
  }
}
