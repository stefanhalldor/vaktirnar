import { notFound } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { resolveAuthenticatedWeatherShellAccess } from '@/lib/weather/weatherBaseAccess.server'
import { FerdalagidClient } from '@/app/auth-mvp/vedrid/FerdalagidClient'

export default async function VedridFerdalagidPage() {
  const { user } = await guardTeskeidSession()
  const weatherShellAccess = await resolveAuthenticatedWeatherShellAccess(user)
  if (weatherShellAccess.mode === 'blocked') notFound()
  const tripEnabled = await checkFeatureAccess('', user.email!, 'ferdalagid')
  return <FerdalagidClient tripEnabled={tripEnabled} />
}
