import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
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

  const t = await getTranslations('teskeid.vedrid.overview')

  return (
    <main className="flex flex-col h-screen bg-background overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 shrink-0">
        <Link
          href="/auth-mvp/vedrid"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t('roadMapPrototypeBack')}
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{t('roadMapPrototypeTitle')}</p>
          <p className="text-[10px] text-muted-foreground">
            {t('roadMapPrototypeSubtitle')}
          </p>
        </div>
      </div>
      <div className="flex-1 relative min-h-0">
        <RoadMapPrototypeMap />
      </div>
    </main>
  )
}
