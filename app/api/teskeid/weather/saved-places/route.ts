import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import { makeWeatherPlaceKey, normalizeSavedPlaceInput } from '@/lib/weather/savedPlaces'

const DISPLAY_LIMIT = 12
const STORED_CAP = 50

function toClientPlace(r: {
  id: string
  name: string
  formatted_address: string
  lat: number
  lon: number
  usage_count: number
  last_used_at: string
}) {
  return {
    id: r.id,
    name: r.name,
    formattedAddress: r.formatted_address,
    lat: r.lat,
    lon: r.lon,
    usageCount: r.usage_count,
    lastUsedAt: r.last_used_at,
  }
}

async function authGuard() {
  if (process.env.AUTH_MVP_ENABLED !== 'true') return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const allowed = await checkFeatureAccess(user.id, user.email, 'vedrid')
  if (!allowed) return null
  return { supabase, user }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const ctx = await authGuard()
  if (!ctx) {
    // Guests in public weather mode get an empty list rather than a 401.
    // Reads no private data; RLS would block any accidental DB query.
    if (process.env.WEATHER_PUBLIC_ENABLED === 'true') {
      return NextResponse.json({ places: [] })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { supabase } = ctx

  const { data, error } = await supabase
    .from('weather_saved_places')
    .select('id, name, formatted_address, lat, lon, usage_count, last_used_at')
    .order('last_used_at', { ascending: false })
    .limit(DISPLAY_LIMIT)

  if (error) {
    console.error('[saved-places GET] db error')
    return NextResponse.json({ places: [] })
  }

  return NextResponse.json({ places: (data ?? []).map(toClientPlace) })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ctx = await authGuard()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { supabase, user } = ctx

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const { lat, lon } = body
  if (typeof lat !== 'number' || typeof lon !== 'number' || !validateIcelandicCoords(lat, lon)) {
    return NextResponse.json({ error: 'invalid_coords' }, { status: 400 })
  }

  const { name: rawName, formattedAddress: rawAddress } = body
  if (typeof rawName !== 'string' || !rawName.trim()) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 })
  }

  const { name, formattedAddress } = normalizeSavedPlaceInput({
    name: rawName,
    formattedAddress: typeof rawAddress === 'string' ? rawAddress : '',
    lat,
    lon,
  })
  const placeKey = makeWeatherPlaceKey(lat, lon)

  // Upsert: update if exists (increment count), insert if new
  let savedRow = null
  const { data: existing } = await supabase
    .from('weather_saved_places')
    .select('id, usage_count')
    .eq('user_id', user.id)
    .eq('place_key', placeKey)
    .maybeSingle()

  if (existing) {
    const { data, error: updateError } = await supabase
      .from('weather_saved_places')
      .update({
        name,
        formatted_address: formattedAddress,
        lat,
        lon,
        last_used_at: new Date().toISOString(),
        usage_count: existing.usage_count + 1,
      })
      .eq('id', existing.id)
      .select('id, name, formatted_address, lat, lon, usage_count, last_used_at')
      .single()
    if (updateError) {
      console.error('[saved-places POST] update error')
      return NextResponse.json({ error: 'save_failed' }, { status: 500 })
    }
    savedRow = data
  } else {
    const { data, error: insertError } = await supabase
      .from('weather_saved_places')
      .insert({
        user_id: user.id,
        place_key: placeKey,
        name,
        formatted_address: formattedAddress,
        lat,
        lon,
      })
      .select('id, name, formatted_address, lat, lon, usage_count, last_used_at')
      .single()
    if (insertError) {
      console.error('[saved-places POST] insert error')
      return NextResponse.json({ error: 'save_failed' }, { status: 500 })
    }
    savedRow = data
  }

  // Enforce per-user cap: delete oldest rows beyond STORED_CAP
  const { count } = await supabase
    .from('weather_saved_places')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((count ?? 0) > STORED_CAP) {
    const toDelete = (count ?? 0) - STORED_CAP
    const { data: oldest } = await supabase
      .from('weather_saved_places')
      .select('id')
      .eq('user_id', user.id)
      .order('last_used_at', { ascending: true })
      .limit(toDelete)
    if (oldest?.length) {
      await supabase
        .from('weather_saved_places')
        .delete()
        .eq('user_id', user.id)
        .in('id', oldest.map((r: { id: string }) => r.id))
    }
  }

  return NextResponse.json({ place: savedRow ? toClientPlace(savedRow) : null })
}
