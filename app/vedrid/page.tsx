import { redirect } from 'next/navigation'
import { FerdalagidClient } from '@/app/auth-mvp/vedrid/FerdalagidClient'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'

export default function VedridPublicPage() {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    redirect('/')
  }

  const mode = getWeatherEnabledMode()
  if (mode === 'off') {
    redirect('/')
  }
  if (mode === 'authenticated') {
    // Weather requires login — redirect to sign-in rather than back to home.
    redirect('/innskraning')
  }

  return <FerdalagidClient isGuest />
}
