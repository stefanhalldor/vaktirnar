import { redirect } from 'next/navigation'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { RoadMapPrototypeMap } from '@/components/weather/RoadMapPrototypeMap'

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
    <main className="h-screen bg-background overflow-hidden">
      <RoadMapPrototypeMap
        isAuthenticated={false}
        hasRoadIntelligence
        navigation={{ canonicalPath: '/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}
      />
    </main>
  )
}
