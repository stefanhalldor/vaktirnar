import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { resolvePlace } from '@/lib/weather/places'
import { fetchForecast } from '@/lib/weather/metno.server'
import { checkGrillWeather, checkGolfWindow } from '@/lib/weather/tools'
import { getAiAnswer } from '@/lib/weather/ai.server'
import { detectIntent, extractPlace, parseTimeWindow } from '@/lib/weather/question'
import type { WeatherAnswerEnvelope } from '@/lib/weather/types'

export async function POST(request: Request) {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await checkFeatureAccess(user.id, user.email, 'vedrid')
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.question !== 'string' || !body.question.trim()) {
    return NextResponse.json({ error: 'question required' }, { status: 400 })
  }

  const question = body.question.trim().slice(0, 500)
  const nowIso = new Date().toISOString()

  const intent = detectIntent(question)

  // Route weather requires a map provider — not configured in Phase 2A1
  if (intent === 'route_towable_trailer') {
    return NextResponse.json({ error: 'provider_not_configured' }, { status: 422 })
  }

  if (intent === 'unknown') {
    return NextResponse.json({ error: 'unsupported_intent' }, { status: 422 })
  }

  const placeName = extractPlace(question)
  if (!placeName) {
    return NextResponse.json({ error: 'unknown_place' }, { status: 422 })
  }

  const place = resolvePlace(placeName)
  if (!place) {
    return NextResponse.json({ error: 'unknown_place' }, { status: 422 })
  }

  let hours
  try {
    hours = await fetchForecast(place.lat, place.lon)
  } catch {
    return NextResponse.json({ error: 'forecast_unavailable' }, { status: 503 })
  }

  const timeWindow = parseTimeWindow(question, nowIso)
  const toolInput = { placeName: place.name, hours, ...timeWindow }

  const deterministic =
    intent === 'activity_window_golf'
      ? checkGolfWindow(toolInput)
      : checkGrillWeather(toolInput)

  const ai = await getAiAnswer(question, deterministic, nowIso)

  const envelope: WeatherAnswerEnvelope = {
    deterministic,
    ai: ai ?? undefined,
    displayed: {
      source: ai ? 'ai' : 'deterministic',
      svar: ai?.svar ?? deterministic.svar,
      adgerd: ai?.adgerd ?? deterministic.suggestedAction,
    },
  }

  return NextResponse.json(envelope)
}
