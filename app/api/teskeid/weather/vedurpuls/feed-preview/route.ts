import { NextResponse } from 'next/server'
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { getLatestConditionFeedPreviews } from '@/lib/chat/repository.server'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25

export async function GET(request: Request): Promise<NextResponse> {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const mode = getWeatherEnabledMode()

  // Access contract: conditions feed follows WEATHER_ENABLED mode semantics.
  // - off: the entire weather section is closed; feed is unavailable.
  // - authenticated: feed is user-generated content, but weather itself requires sign-in.
  //   Anonymous callers must not receive community data when the product is sign-in-only.
  // - all: public access; no session required.
  if (mode === 'off') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (mode === 'authenticated') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawLimit = parseInt(searchParams.get('limitItems') ?? '', 10)
  const limitItems =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT

  try {
    // Server decides which target types appear in the public conditions feed.
    // Clients cannot pass arbitrary target types.
    // Vegagerðin is the primary surface for user road-condition reports.
    const items = await getLatestConditionFeedPreviews(limitItems, ['vegagerdin_station'])
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
