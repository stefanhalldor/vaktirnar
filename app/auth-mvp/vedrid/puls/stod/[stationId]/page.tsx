import { notFound, redirect } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkChatAccess } from '@/lib/chat/access.server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { readVedurstofanCacheForStations } from '@/lib/weather/providers/vedurstofan.server'
import { VedurstofanPulsClient } from './VedurstofanPulsClient'
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

  return (
    <VedurstofanPulsClient
      stationId={stationId}
      stationName={entry.name}
      returnTo={returnTo ?? null}
      forecastRows={forecastRows}
      atimeIso={atimeIso}
    />
  )
}
