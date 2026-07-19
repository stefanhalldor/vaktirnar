import { getTranslations } from 'next-intl/server'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { WeatherOverviewClient } from '@/components/weather/WeatherOverviewClient'

export default async function EltaVedridPage() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'vedrid')
  await guardFeatureAccess(user.email!, 'elta-vedrid')
  const t = await getTranslations('teskeid.vedrid.eltaVedrid')
  return (
    <WeatherOverviewClient
      backHref="/auth-mvp/vedrid"
      backLabel={t('backToOverview')}
      menuVariant="authenticated"
    />
  )
}
