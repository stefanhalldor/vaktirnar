import { redirect } from 'next/navigation'
import { FerdalagidClient } from '@/app/auth-mvp/vedrid/FerdalagidClient'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'

export default function VedridFerdalagidPublicPage() {
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

  return <FerdalagidClient isGuest />
}
