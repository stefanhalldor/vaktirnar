import { redirect } from 'next/navigation'
import { FerdalagidClient } from '@/app/auth-mvp/vedrid/FerdalagidClient'

export default function VedridPublicPage() {
  if (
    process.env.AUTH_MVP_ENABLED !== 'true' ||
    process.env.WEATHER_ENABLED !== 'true' ||
    process.env.WEATHER_PUBLIC_ENABLED !== 'true'
  ) {
    redirect('/')
  }

  return <FerdalagidClient isGuest />
}
