import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/supabase/admin'

type WeatherChaseProviderId = 'vedurstofan' | 'metno' | 'vegagerdin'

type WeatherChasePreferenceItem = {
  id: string
  providerId: WeatherChaseProviderId
  label?: string
  lat?: number | null
  lon?: number | null
}

type WeatherChasePreferenceCriteria = {
  minTemperatureC: number | null
  maxWindMs: number | null
  maxPrecipitationMmPerHour: number | null
}

const MAX_SELECTED_ITEMS = 24
const MAX_LABEL_LENGTH = 120
const PROVIDER_IDS = new Set<WeatherChaseProviderId>(['vedurstofan', 'metno', 'vegagerdin'])

const DEFAULT_CRITERIA: WeatherChasePreferenceCriteria = {
  minTemperatureC: null,
  maxWindMs: null,
  maxPrecipitationMmPerHour: null,
}

function finiteNumberOrNull(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

function normalizeCriteria(value: unknown): WeatherChasePreferenceCriteria {
  const input = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  return {
    minTemperatureC: finiteNumberOrNull(input.minTemperatureC, -60, 60),
    maxWindMs: finiteNumberOrNull(input.maxWindMs, 0, 80),
    maxPrecipitationMmPerHour: finiteNumberOrNull(input.maxPrecipitationMmPerHour, 0, 200),
  }
}

function normalizeSelectedItems(value: unknown): WeatherChasePreferenceItem[] {
  if (!Array.isArray(value)) return []
  const result: WeatherChasePreferenceItem[] = []
  const seen = new Set<string>()

  for (const raw of value.slice(0, MAX_SELECTED_ITEMS)) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const providerId = typeof item.providerId === 'string' && PROVIDER_IDS.has(item.providerId as WeatherChaseProviderId)
      ? item.providerId as WeatherChaseProviderId
      : null
    if (!id || !providerId || seen.has(id)) continue
    seen.add(id)

    const label = typeof item.label === 'string'
      ? item.label.trim().slice(0, MAX_LABEL_LENGTH)
      : undefined
    const lat = finiteNumberOrNull(item.lat, -90, 90)
    const lon = finiteNumberOrNull(item.lon, -180, 180)

    result.push({
      id,
      providerId,
      ...(label ? { label } : {}),
      ...(lat !== null ? { lat } : {}),
      ...(lon !== null ? { lon } : {}),
    })
  }

  return result
}

function isMissingTableError(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === '42703'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdmin()
  const { data, error } = await admin
    .from('weather_chase_preferences')
    .select('selected_items, criteria')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error && isMissingTableError(error)) {
    return NextResponse.json({ hasPreferences: false, schemaMissing: true })
  }

  if (error) {
    console.error('[preferences/chase] GET failed')
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ hasPreferences: false })
  }

  return NextResponse.json({
    hasPreferences: true,
    selectedItems: normalizeSelectedItems(data.selected_items),
    criteria: normalizeCriteria(data.criteria),
  })
}

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

  const input = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}
  const selectedItems = normalizeSelectedItems(input.selectedItems)
  const criteria = normalizeCriteria(input.criteria)

  const admin = getAdmin()

  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: user.id, display_name: '' }, { onConflict: 'id', ignoreDuplicates: true })
  if (profileErr) {
    console.error('[preferences/chase] profile upsert failed')
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  const { error } = await admin
    .from('weather_chase_preferences')
    .upsert({
      user_id: user.id,
      selected_items: selectedItems,
      criteria,
    }, { onConflict: 'user_id' })

  if (error && isMissingTableError(error)) {
    return NextResponse.json({ error: 'schema_missing' }, { status: 503 })
  }

  if (error) {
    console.error('[preferences/chase] PUT failed')
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    selectedItems,
    criteria: { ...DEFAULT_CRITERIA, ...criteria },
  })
}
