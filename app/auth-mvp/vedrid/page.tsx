import { notFound } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { resolveAuthenticatedWeatherShellAccess } from '@/lib/weather/weatherBaseAccess.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { WeatherOverviewClient } from '@/components/weather/WeatherOverviewClient'

export default async function VedridPage() {
  const { user } = await guardTeskeidSession()
  const weatherShellAccess = await resolveAuthenticatedWeatherShellAccess(user)
  if (weatherShellAccess.mode === 'blocked') notFound()
  const hasRoadIntelligence = await checkFeatureAccess('', user.email ?? '', 'road-intelligence-v1')
  return (
    <WeatherOverviewClient
      isOverview
      tripHref="/auth-mvp/vedrid/ferdalagid"
      stationPulseReturnBase="/auth-mvp/vedrid"
      menuVariant="authenticated"
      hasRoadIntelligence={hasRoadIntelligence}
    />
  )
}
