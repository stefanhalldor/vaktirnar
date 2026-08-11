'use client'

import { useTranslations } from 'next-intl'

interface MobileForecastMapNoticeProps {
  onViewData: () => void
}

/**
 * Shown on mobile (<lg) when the user selects the Spákort tab.
 * The forecast map is desktop-only for now. This notice explains that and
 * offers a direct action to switch to the data/information view.
 *
 * Rendered inside a covering overlay in RoadMapPrototypeMap; the overlay
 * intercepts pointer events so the MapLibre canvas below is not interactive.
 */
export function MobileForecastMapNotice({ onViewData }: MobileForecastMapNoticeProps) {
  const t = useTranslations('teskeid.vedrid.overview')
  return (
    <section
      className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-border bg-card p-6 text-center shadow-lg"
      aria-label={t('mobileForecastMapNoticeTitle')}
      role="status"
    >
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">
          {t('mobileForecastMapNoticeTitle')}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('mobileForecastMapNoticeBody')}
        </p>
      </div>
      <button
        type="button"
        onClick={onViewData}
        className="flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('mobileForecastMapNoticeAction')}
      </button>
    </section>
  )
}
