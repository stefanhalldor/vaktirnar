import { notFound, redirect } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkChatAccess } from '@/lib/chat/access.server'
import { findVegagerdinCurrentMeasurementByStationId } from '@/lib/weather/providers/vegagerdinCurrent.server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { readVedurstofanCacheForStations } from '@/lib/weather/providers/vedurstofan.server'
import { findNearestStations } from '@/lib/weather/nearestStations'
import { VegagerdinPulsClient } from './VegagerdinPulsClient'
import type { ForecastRowData } from '@/components/weather/VedurstofanForecastRows'
import { sortStationsForContext } from '@/lib/weather/spatialOrder'

export type NearbyVedurstofanStation = {
  stationId: string
  stationName: string
  lat: number
  lon: number
  distanceM: number
  forecastRows: ForecastRowData[]
  atimeIso: string | null
}

export default async function VegagerdinPulsPage({
  params,
  searchParams,
}: {
  params: Promise<{ stationId: string }>
  searchParams: Promise<{ returnTo?: string }>
}) {
  const { stationId } = await params
  const { returnTo } = await searchParams
  const { user } = await guardTeskeidSession()

  const access = await checkChatAccess(user, { provider: 'vegagerdin' })
  if (access !== 'allowed') redirect('/auth-mvp/vedrid')

  // Look up Vegagerðin station with history fallback (survives cache expiry)
  const measurement = await findVegagerdinCurrentMeasurementByStationId(stationId)
  if (!measurement) notFound()

  // Find 3 nearest Vedurstofan stations by straight-line distance
  const nearest = findNearestStations(
    { lat: measurement.lat, lon: measurement.lon },
    VEDURSTOFAN_STATIONS_REGISTRY,
    3
  )

  // Load Vedurstofan forecast for the nearest stations (fail open)
  let nearbyStations: NearbyVedurstofanStation[] = []
  try {
    const nearestIds = nearest.map(s => s.stationId)
    const forecastCache = await readVedurstofanCacheForStations(nearestIds)
    const unsorted = nearest.map(s => {
      const result = forecastCache.get(s.stationId)
      const hasPayload = result && result.status !== 'unavailable'
      return {
        stationId: s.stationId,
        stationName: s.name,
        lat: s.lat,
        lon: s.lon,
        distanceM: s.distanceM,
        forecastRows: hasPayload ? result.payload.forecasts : [],
        atimeIso: hasPayload ? (result.payload.atimeIso ?? null) : null,
      }
    })
    // Sort by dominant geographic axis (north-to-south or west-to-east)
    // so forecast cards read in a logical driving order, not random nearest-first.
    nearbyStations = sortStationsForContext(unsorted)
  } catch { /* fail open — page renders without forecast context */ }

  return (
    <VegagerdinPulsClient
      stationId={stationId}
      measurement={measurement}
      returnTo={returnTo ?? null}
      nearbyStations={nearbyStations}
    />
  )
}
