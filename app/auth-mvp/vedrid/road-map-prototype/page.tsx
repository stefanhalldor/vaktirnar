import { notFound } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { RoadMapPrototypeMap } from '@/components/weather/RoadMapPrototypeMap'

export default async function RoadMapPrototypePage() {
  const { user } = await guardTeskeidSession()
  const hasRoadIntelligence = await checkFeatureAccess(
    '',
    user.email ?? '',
    'road-intelligence-v1',
  )
  if (!hasRoadIntelligence) notFound()

  return (
    <main className="h-screen bg-background overflow-hidden">
      <RoadMapPrototypeMap isAuthenticated />
    </main>
  )
}
