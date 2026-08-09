import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertSameOriginJsonMutation } from '@/lib/security/sameOrigin.server'
import { getWeatherEnabledMode, resolveAuthenticatedWeatherShellAccess } from '@/lib/weather/weatherBaseAccess.server'
import {
  parseCreateMapNoteInput,
  parseMapNoteHours,
  sanitizeMapNoteSearch,
} from '@/lib/map-notes/contracts'
import {
  createMapNote,
  listCommunityMapNotes,
  listOwnTeskeidFeedback,
} from '@/lib/map-notes/repository.server'

function featureAvailable(): boolean {
  return process.env.AUTH_MVP_ENABLED === 'true'
    && process.env.TESKEID_CHAT_ENABLED === 'true'
    && getWeatherEnabledMode() !== 'off'
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!featureAvailable()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const kind = request.nextUrl.searchParams.get('kind') ?? 'community'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (kind === 'community') {
    if (getWeatherEnabledMode() === 'authenticated' && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      const items = await listCommunityMapNotes({
        search: sanitizeMapNoteSearch(request.nextUrl.searchParams.get('q')),
        sinceHours: parseMapNoteHours(request.nextUrl.searchParams.get('hours')),
      })
      return NextResponse.json({ items }, {
        headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=45' },
      })
    } catch {
      return NextResponse.json({ error: 'Notes unavailable' }, { status: 503 })
    }
  }

  if (kind !== 'teskeid_feedback' || !user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const access = await resolveAuthenticatedWeatherShellAccess(user)
  if (access.mode === 'blocked') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    return NextResponse.json({ items: await listOwnTeskeidFeedback(user.id) })
  } catch {
    return NextResponse.json({ error: 'Feedback unavailable' }, { status: 503 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!featureAvailable()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!assertSameOriginJsonMutation(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 })
  }
  const input = parseCreateMapNoteInput(await request.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'Invalid note' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveAuthenticatedWeatherShellAccess(user)
  if (access.mode === 'blocked') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const item = await createMapNote(user.id, input)
    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'chat: idempotency conflict') {
      return NextResponse.json({ error: 'Note conflict' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Note unavailable' }, { status: 503 })
  }
}
