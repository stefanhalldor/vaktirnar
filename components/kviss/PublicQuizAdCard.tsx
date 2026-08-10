'use client'

import { useTranslations } from 'next-intl'
import type { PublicQuizAd } from '@/lib/advertiser/contracts'

export function PublicQuizAdCard({ ad }: { ad: PublicQuizAd | null }) {
  const t = useTranslations('kviss')
  if (!ad) return null
  return (
    <aside className="rounded-xl border border-border bg-card p-4" aria-label={t('adDisclosure')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('adDisclosure')}
        </span>
        <span className="text-xs text-muted-foreground">{ad.advertiserName} · {ad.advertiserDomain}</span>
      </div>
      <h2 className="mt-3 text-base font-semibold text-foreground">{ad.headline}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ad.body}</p>
      <a
        href={ad.destinationUrl}
        target="_blank"
        rel="sponsored noopener noreferrer"
        referrerPolicy="no-referrer"
        className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-primary px-3 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ad.ctaLabel}
      </a>
    </aside>
  )
}
