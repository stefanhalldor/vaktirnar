import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'

export default async function UmonnunPage() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'umonnun')
  const t = await getTranslations('teskeid.home')

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-8 pb-10 flex flex-col gap-6">

        <div className="flex items-center gap-2">
          <Link
            href="/auth-mvp/heim"
            aria-label={t('umonnunBackLink')}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft size={20} aria-hidden />
          </Link>
          <h1 className="text-lg font-semibold text-primary">{t('umonnunInfoHeading')}</h1>
        </div>

        <div className="flex flex-col gap-3 text-sm text-foreground leading-relaxed">
          <p>{t('umonnunInfoPara1')}</p>
          <p>{t('umonnunInfoPara2')}</p>
          <p>{t('umonnunInfoPara3')}</p>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="https://umonnun.is"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-10 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('umonnunOpenLink')}
          </a>
          <a
            href="https://apps.apple.com/app/id6762567373"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-10 px-6 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('umonnunAppStore')}
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=is.umonnun.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-10 px-6 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('umonnunPlayStore')}
          </a>
        </div>

      </main>
    </div>
  )
}
