'use client'

import { useTranslations } from 'next-intl'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export function AdvertiserLoading() {
  const t = useTranslations('advertiser')
  return (
    <TeskeidLoader
      ideaTitles={[t('title')]}
      fallbackIdeaTitle={t('title')}
      loadingLabel={t('loading')}
      className="min-h-[60vh]"
    />
  )
}
