import { redirect } from 'next/navigation'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { isTeskeidRouteCandidateEnabled } from '@/lib/iceland-routes/roadGraphCandidate.server'
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
    <main className="h-[100dvh] overflow-hidden bg-background">
      <RoadMapPrototypeMap
        isAuthenticated={false}
        hasRoadIntelligence
        teskeidRouteCandidateEnabled={isTeskeidRouteCandidateEnabled()}
        navigation={{ canonicalPath: '/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}
      />
    </main>
  )
}
