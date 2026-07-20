import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/supabase/admin'

const MIN_WIND = 1
const MAX_WIND = 40

function validateWindValues(caution: unknown, red: unknown): { cautionWindMs: number; redWindMs: number } | null {
  const c = typeof caution === 'number' ? caution : parseFloat(String(caution))
  const r = typeof red === 'number' ? red : parseFloat(String(red))
  if (!Number.isFinite(c) || !Number.isFinite(r)) return null
  if (c < MIN_WIND || c > MAX_WIND || r < MIN_WIND || r > MAX_WIND) return null
  if (c >= r) return null
  return { cautionWindMs: c, redWindMs: r }
}

/**
 * GET /api/teskeid/weather/preferences/thresholds
 *
 * Returns the authenticated user's saved default wind thresholds.
 * Requires: valid session (middleware enforces 401 for unauthenticated requests).
 * Depends on: sql/82_weather_user_preferences.sql applied.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdmin()
  const { data, error } = await admin
    .from('weather_user_preferences')
    .select('caution_wind_ms, red_wind_ms')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[preferences/thresholds] GET failed')
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ hasPreferences: false })
  }

  return NextResponse.json({
    hasPreferences: true,
    cautionWindMs: Number(data.caution_wind_ms),
    redWindMs: Number(data.red_wind_ms),
  })
}

/**
 * PUT /api/teskeid/weather/preferences/thresholds
 *
 * Upserts the authenticated user's default wind thresholds.
 * Body: { cautionWindMs: number, redWindMs: number }
 * Requires: valid session (middleware enforces 401 for unauthenticated requests).
 * Depends on: sql/82_weather_user_preferences.sql applied.
 */
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const validated = validateWindValues(b.cautionWindMs, b.redWindMs)
  if (!validated) {
    return NextResponse.json({ error: 'invalid_thresholds' }, { status: 422 })
  }

  const admin = getAdmin()

  // Ensure a profiles row exists before upserting weather_user_preferences.
  // weather_user_preferences.user_id has a FK to public.profiles(id).
  // Auth-MVP users authenticated via createUserSession() may not have a profiles row
  // if the auth.users trigger did not fire or if the profile was never explicitly created.
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: user.id, display_name: '' }, { onConflict: 'id', ignoreDuplicates: true })
  if (profileErr) {
    console.error('[preferences/thresholds] profile upsert failed')
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  const { error } = await admin
    .from('weather_user_preferences')
    .upsert(
      {
        user_id: user.id,
        caution_wind_ms: validated.cautionWindMs,
        red_wind_ms: validated.redWindMs,
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    console.error('[preferences/thresholds] PUT failed')
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
