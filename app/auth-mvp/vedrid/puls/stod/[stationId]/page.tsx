import { notFound, redirect } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkChatAccess } from '@/lib/chat/access.server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { readVedurstofanCacheForStations } from '@/lib/weather/providers/vedurstofan.server'
import { readVegagerdinCurrentWithHistoryFallback } from '@/lib/weather/providers/vegagerdinCurrent.server'
import { findNearestStations } from '@/lib/weather/nearestStations'
import { getPreviewMessages } from '@/lib/chat/repository.server'
import { vegagerdinPulseHref } from '@/lib/weather/pulseTarget'
import { VedurstofanPulsClient, type NearbyVegagerdinStation } from './VedurstofanPulsClient'
import type { ForecastRowData } from '@/components/weather/VedurstofanForecastRows'

export default async function VedurstofanPulsPage({
  params,
  searchParams,
}: {
  params: Promise<{ stationId: string }>
  searchParams: Promise<{ returnTo?: string }>
}) {
  const { stationId } = await params
  const { returnTo } = await searchParams
  const { user } = await guardTeskeidSession()

  const access = await checkChatAccess(user)
  if (access !== 'allowed') redirect('/auth-mvp/vedrid')

  const entry = VEDURSTOFAN_STATIONS_REGISTRY.find(s => s.stationId === stationId)
  if (!entry) notFound()

  // Fetch forecast cache server-side — fail open if unavailable
  let forecastRows: ForecastRowData[] = []
  let atimeIso: string | null = null
  try {
    const cacheResult = await readVedurstofanCacheForStations([stationId])
    const stationResult = cacheResult.get(stationId)
    if (stationResult && stationResult.status !== 'unavailable') {
      forecastRows = stationResult.payload.forecasts
      atimeIso = stationResult.payload.atimeIso
    }
  } catch { /* fail open */ }

  // Nearby Vegagerðin stations — provider-gated, fail open
  let nearbyVegagerdinStations: NearbyVegagerdinStation[] = []
  const vegagerdinAccess = await checkChatAccess(user, { provider: 'vegagerdin' })
  if (vegagerdinAccess === 'allowed' && entry.lat != null && entry.lon != null) {
    try {
      const vegResult = await readVegagerdinCurrentWithHistoryFallback()
      if (vegResult.status !== 'unavailable') {
        const stations = vegResult.payload.measurements
        const nearest = findNearestStations(
          { lat: entry.lat, lon: entry.lon },
          stations.map(s => ({ stationId: s.stationId, name: s.stationName, lat: s.lat, lon: s.lon })),
          3,
        )
        const returnHref = `/auth-mvp/vedrid/puls/stod/${stationId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`
        nearbyVegagerdinStations = await Promise.all(
          nearest.map(async near => {
            const full = stations.find(s => s.stationId === near.stationId)
            let latestNote: NearbyVegagerdinStation['latestNote'] = null
            try {
              const msgs = await getPreviewMessages(
                { domain: 'weather', targetType: 'vegagerdin_station', targetId: near.stationId },
                1,
              )
              if (msgs[0] && !msgs[0].isDeleted && !msgs[0].isHidden) {
                latestNote = { body: msgs[0].body, createdAt: msgs[0].createdAt, authorName: msgs[0].authorName ?? null }
              }
            } catch { /* fail open */ }
            return {
              stationId: near.stationId,
              stationName: near.name,
              distanceM: near.distanceM,
              measuredAtIso: full?.measuredAtIso ?? null,
              meanWindMs: full?.meanWindMs ?? null,
              gustLast10MinMs: full?.gustLast10MinMs ?? null,
              airTemperatureC: full?.airTemperatureC ?? null,
              roadTemperatureC: full?.roadTemperatureC ?? null,
              latestNote,
              pulseHref: vegagerdinPulseHref(near.stationId, returnHref),
            }
          })
        )
      }
    } catch { /* fail open */ }
  }

  return (
    <VedurstofanPulsClient
      stationId={stationId}
      stationName={entry.name}
      returnTo={returnTo ?? null}
      forecastRows={forecastRows}
      atimeIso={atimeIso}
      nearbyVegagerdinStations={nearbyVegagerdinStations}
    />
  )
}
