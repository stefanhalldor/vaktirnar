import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { resolvePlace } from '@/lib/weather/places'
import { fetchForecast } from '@/lib/weather/metno.server'
import { checkGrillWeather, checkGolfWindow, checkRouteWeather } from '@/lib/weather/tools'
import { getAiAnswer } from '@/lib/weather/ai.server'
import { detectIntent, extractPlace, extractTrailerKind, extractRouteOrigin, extractRouteDestination, parseTimeWindow } from '@/lib/weather/question'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import { getWeatherMapProvider } from '@/lib/weather/provider.server'
import type { WeatherAnswerEnvelope, HourPoint } from '@/lib/weather/types'
import type { PlaceCandidate, RouteGeometry } from '@/lib/weather/provider.types'

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

  // ── Route weather ─────────────────────────────────────────────────────────

  if (intent === 'route_towable_trailer') {
    const provider = getWeatherMapProvider()
    if (!provider) {
      return NextResponse.json({ error: 'provider_not_configured' }, { status: 422 })
    }

    const trailerKind = extractTrailerKind(question)
    const originStr = extractRouteOrigin(question)
    const destStr = extractRouteDestination(question)

    if (!originStr || !destStr) {
      return NextResponse.json({ error: 'unknown_route' }, { status: 422 })
    }

    // Resolve origin — curated list first, then geocode
    let originCandidate: PlaceCandidate
    const originResolved = resolvePlace(originStr)
    if (originResolved) {
      originCandidate = { placeId: 'curated', displayName: originResolved.name, formattedAddress: originResolved.name, lat: originResolved.lat, lon: originResolved.lon }
    } else {
      let candidates: PlaceCandidate[]
      try {
        candidates = await provider.geocodePlace(`${originStr} Ísland`)
      } catch {
        return NextResponse.json({ error: 'route_unavailable' }, { status: 503 })
      }
      if (!candidates.length) {
        return NextResponse.json({ error: 'unknown_place' }, { status: 422 })
      }
      originCandidate = candidates[0]
    }

    // Resolve destination — curated list first, then geocode
    let destCandidate: PlaceCandidate
    const destResolved = resolvePlace(destStr)
    if (destResolved) {
      destCandidate = { placeId: 'curated', displayName: destResolved.name, formattedAddress: destResolved.name, lat: destResolved.lat, lon: destResolved.lon }
    } else {
      let candidates: PlaceCandidate[]
      try {
        candidates = await provider.geocodePlace(`${destStr} Ísland`)
      } catch {
        return NextResponse.json({ error: 'route_unavailable' }, { status: 503 })
      }
      if (!candidates.length) {
        return NextResponse.json({ error: 'unknown_place' }, { status: 422 })
      }
      destCandidate = candidates[0]
    }

    // Get route geometry
    let routeGeometry: RouteGeometry | null
    try {
      routeGeometry = await provider.getRouteGeometry(originCandidate, destCandidate)
    } catch {
      return NextResponse.json({ error: 'route_unavailable' }, { status: 503 })
    }
    if (!routeGeometry) {
      return NextResponse.json({ error: 'route_unavailable' }, { status: 422 })
    }

    // Subsample route points for weather checks (max 15 to limit met.no API calls)
    const MAX_WEATHER_POINTS = 15
    const allPts = routeGeometry.points
    const step = Math.max(1, Math.ceil(allPts.length / MAX_WEATHER_POINTS))
    const weatherPoints: Array<{ lat: number; lon: number }> = []
    for (let i = 0; i < allPts.length; i += step) weatherPoints.push(allPts[i])
    if (weatherPoints[weatherPoints.length - 1] !== allPts[allPts.length - 1]) {
      weatherPoints.push(allPts[allPts.length - 1])
    }
    // Enforce strict cap after last-point append
    weatherPoints.splice(MAX_WEATHER_POINTS)

    // Fetch forecasts in parallel — ignore individual failures
    const timeWindow = parseTimeWindow(question, nowIso)
    const forecastResults = await Promise.allSettled(
      weatherPoints.map((pt) => fetchForecast(pt.lat, pt.lon))
    )
    const pointForecasts = forecastResults
      .filter((r): r is PromiseFulfilledResult<HourPoint[]> => r.status === 'fulfilled')
      .map((r) => ({ hours: r.value }))

    if (pointForecasts.length === 0) {
      return NextResponse.json({ error: 'forecast_unavailable' }, { status: 503 })
    }

    const deterministic = checkRouteWeather({
      trailerKind,
      originName: originCandidate.displayName,
      destinationName: destCandidate.displayName,
      distanceM: routeGeometry.distanceM,
      durationS: routeGeometry.durationS,
      pointForecasts,
      ...timeWindow,
    })

    const ai = await getAiAnswer(question, deterministic, nowIso)

    const routeEnvelope: WeatherAnswerEnvelope = {
      deterministic,
      ai: ai ?? undefined,
      displayed: {
        source: ai ? 'ai' : 'deterministic',
        svar: ai?.svar ?? deterministic.svar,
        adgerd: ai?.adgerd ?? deterministic.suggestedAction,
      },
    }

    return NextResponse.json(routeEnvelope)
  }

  if (intent === 'unknown') {
    return NextResponse.json({ error: 'unsupported_intent' }, { status: 422 })
  }

  // ── Place resolution ───────────────────────────────────────────────────────

  // Optional: client sends confirmed place from map confirmation / PlaceSearch
  const raw = body.confirmedPlace
  let place: { name: string; lat: number; lon: number }

  if (raw && typeof raw === 'object') {
    // Validate server-side — never trust client coordinates blindly
    if (
      typeof raw.lat !== 'number' ||
      typeof raw.lon !== 'number' ||
      typeof raw.name !== 'string' ||
      !raw.name.trim() ||
      !validateIcelandicCoords(raw.lat, raw.lon)
    ) {
      return NextResponse.json({ error: 'invalid_coords' }, { status: 422 })
    }
    place = { name: String(raw.name).trim(), lat: raw.lat, lon: raw.lon }
  } else {
    const placeName = extractPlace(question)
    if (!placeName) {
      return NextResponse.json({ error: 'unknown_place' }, { status: 422 })
    }
    const resolved = resolvePlace(placeName)
    if (!resolved) {
      return NextResponse.json({ error: 'unknown_place' }, { status: 422 })
    }
    place = resolved
  }

  // ── Forecast + deterministic tool ─────────────────────────────────────────

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

  // ── Map confirmation info ──────────────────────────────────────────────────

  let placeInfo: WeatherAnswerEnvelope['place'] = { name: place.name, lat: place.lat, lon: place.lon }

  const provider = getWeatherMapProvider()
  if (provider) {
    try {
      placeInfo = { ...placeInfo, staticMapUrl: provider.staticMapUrl({ lat: place.lat, lon: place.lon }) }
    } catch {
      // Keys not set yet — omit staticMapUrl, continue without map
    }
  }

  const envelope: WeatherAnswerEnvelope = {
    deterministic,
    ai: ai ?? undefined,
    displayed: {
      source: ai ? 'ai' : 'deterministic',
      svar: ai?.svar ?? deterministic.svar,
      adgerd: ai?.adgerd ?? deterministic.suggestedAction,
    },
    place: placeInfo,
  }

  return NextResponse.json(envelope)
}
