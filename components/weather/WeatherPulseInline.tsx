'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ChatPreviewList } from '@/components/chat/ChatPreviewList'
import { useChatPreview } from '@/components/chat/useChatPreview'
import type { WeatherPulseProvider } from '@/lib/weather/pulseTarget'
import { vedurstofanPulseHref, vegagerdinPulseHref } from '@/lib/weather/pulseTarget'

interface WeatherPulseInlineProps {
  provider: WeatherPulseProvider
  stationId: string
  /**
   * Return URL for the full pulse route "Til baka" link.
   * When provided, a "Sjá fleiri skilaboð" link is shown.
   * When omitted, the full link is hidden.
   */
  returnTo?: string
}

function previewUrl(provider: WeatherPulseProvider, stationId: string): string {
  if (provider === 'vegagerdin') {
    return `/api/teskeid/weather/vedurpuls/vegagerdin/stations/${stationId}/preview`
  }
  return `/api/teskeid/weather/vedurpuls/stations/${stationId}/preview`
}

function pulseHref(
  provider: WeatherPulseProvider,
  stationId: string,
  returnTo?: string
): string | null {
  if (!returnTo) return null
  if (provider === 'vegagerdin') return vegagerdinPulseHref(stationId, returnTo)
  return vedurstofanPulseHref(stationId, returnTo)
}

/**
 * Read-only Veðurpúls preview panel — works for any provider.
 * Does not create threads or render a compose box.
 */
export function WeatherPulseInline({ provider, stationId, returnTo }: WeatherPulseInlineProps) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const locale = useLocale()

  const { messages, loaded: previewLoaded } = useChatPreview({
    url: previewUrl(provider, stationId),
  })

  const kindLabels = {
    field_report: t('pulseKindField'),
    measurement_report: t('pulseKindMeasurement'),
  }

  const fullHref = pulseHref(provider, stationId, returnTo)

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
      <p className="text-xs font-medium text-foreground">{t('pulseInlineHeader')}</p>
      <ChatPreviewList
        messages={messages}
        emptyLabel={t('pulseEmptyPublic')}
        deletedLabel={t('pulseDeleted')}
        kindLabels={kindLabels}
        loaded={previewLoaded}
        locale={locale}
      />
      {fullHref && (
        <Link
          href={fullHref}
          className="text-xs text-muted-foreground underline underline-offset-2 self-start hover:text-foreground transition-colors"
        >
          {t('pulseViewMore')}
        </Link>
      )}
    </div>
  )
}
