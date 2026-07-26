import { notFound } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { resolveAuthenticatedWeatherShellAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { RoadMapPrototypeMap } from '@/components/weather/RoadMapPrototypeMap'

export default async function VedridPage() {
  const { user } = await guardTeskeidSession()
  const weatherShellAccess = await resolveAuthenticatedWeatherShellAccess(user)
  if (weatherShellAccess.mode === 'blocked') notFound()

  const hasRoadIntelligence =
    getWeatherEnabledMode() === 'all' ||
    (await checkFeatureAccess(user.id, user.email ?? '', 'road-intelligence-v1').catch(() => false))
  const hasTeskeidRouting = await checkFeatureAccess(
    user.id,
    user.email ?? '',
    'teskeid-routing-v1',
  ).catch(() => false)

  return (
    <main className="h-screen bg-background overflow-hidden">
      <RoadMapPrototypeMap
        isAuthenticated
        hasRoadIntelligence={hasRoadIntelligence}
        teskeidRouteCandidateEnabled={hasTeskeidRouting}
        navigation={{ canonicalPath: '/auth-mvp/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}
      />
    </main>
  )
}
