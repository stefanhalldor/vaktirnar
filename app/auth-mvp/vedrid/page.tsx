import { notFound } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { resolveAuthenticatedWeatherShellAccess } from '@/lib/weather/weatherBaseAccess.server'
import { WeatherOverviewClient } from '@/components/weather/WeatherOverviewClient'

export default async function VedridPage() {
  const { user } = await guardTeskeidSession()
  const weatherShellAccess = await resolveAuthenticatedWeatherShellAccess(user)
  if (weatherShellAccess.mode === 'blocked') notFound()
  return (
    <WeatherOverviewClient
      isOverview
      tripHref="/auth-mvp/vedrid/ferdalagid"
      stationPulseReturnBase="/auth-mvp/vedrid"
      menuVariant="authenticated"
    />
  )
}
