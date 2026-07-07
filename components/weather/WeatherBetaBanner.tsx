'use client'

import { FlaskConical } from 'lucide-react'
import { useTranslations } from 'next-intl'

const FEEDBACK_URL = 'https://www.facebook.com/profile.php?id=61590612753245'

export function WeatherBetaBanner() {
  const t = useTranslations('teskeid.vedrid')
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 flex flex-col gap-1.5 text-xs">
      <div className="flex items-center gap-1.5 text-foreground">
        <FlaskConical size={13} aria-hidden className="shrink-0 text-primary" />
        <span className="font-medium">{t('betaBannerTitle')}</span>
      </div>
      <p className="text-muted-foreground leading-relaxed">{t('betaBannerBody')}</p>
      <a
        href={FEEDBACK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity self-start focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
      >
        {t('betaBannerFeedback')}
      </a>
    </div>
  )
}
