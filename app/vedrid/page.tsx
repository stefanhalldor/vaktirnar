import { redirect } from 'next/navigation'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { WeatherOverviewClient } from '@/components/weather/WeatherOverviewClient'

export default function VedridPublicPage() {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    redirect('/')
  }

  const mode = getWeatherEnabledMode()
  if (mode === 'off') {
    redirect('/')
  }
  if (mode === 'authenticated') {
    redirect('/innskraning')
  }

  return (
    <WeatherOverviewClient
      isOverview
      tripHref="/vedrid/ferdalagid"
      stationPulseReturnBase="/vedrid"
      menuVariant="public"
    />
  )
}
