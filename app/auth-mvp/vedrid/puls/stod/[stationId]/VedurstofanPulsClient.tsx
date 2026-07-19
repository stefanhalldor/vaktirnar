'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft } from 'lucide-react'
import { ChatPreviewList } from '@/components/chat/ChatPreviewList'
import { useChatPreview } from '@/components/chat/useChatPreview'
import { resolvePulseBackDestination } from '@/lib/weather/pulseBack'
import { ForecastRowLine, selectUpcomingRows, type ForecastRowData } from '@/components/weather/VedurstofanForecastRows'
import { formatKlTime } from '@/components/weather/travelAuditMap.helpers'
import { formatChatDayLabel, calendarDateKey } from '@/lib/chat/format'

interface VedurstofanPulsClientProps {
  stationId: string
  stationName: string
  returnTo: string | null
  forecastRows: ForecastRowData[]
  atimeIso: string | null
}

/**
 * Read-only Veðurstofan station pulse page.
 * Road-condition reports have moved to Vegagerðin station pages.
 * This page shows the Vedurstofan forecast context and any legacy pulse messages
 * that existed before the migration.
 */
export function VedurstofanPulsClient({ stationId, stationName, returnTo, forecastRows, atimeIso }: VedurstofanPulsClientProps) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const locale = useLocale()
  const backDest = resolvePulseBackDestination(returnTo)
  const [showAllForecast, setShowAllForecast] = useState(false)
  const { messages, loaded: previewLoaded } = useChatPreview({
    url: `/api/teskeid/weather/vedurpuls/stations/${stationId}/preview`,
  })

  const kindLabels = {
    field_report: t('pulseKindField'),
    measurement_report: t('pulseKindMeasurement'),
  }

  const displayRows = showAllForecast
    ? [...forecastRows].sort((a, b) => Date.parse(a.ftimeIso) - Date.parse(b.ftimeIso))
    : selectUpcomingRows(forecastRows, 3)

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-2xl mx-auto pb-12">
      <div className="flex flex-col gap-1">
        {backDest && (
          <Link
            href={backDest.href}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <ChevronLeft className="w-3 h-3" />
            {backDest.kind === 'trip'
              ? t('backToTrip')
              : backDest.kind === 'overview'
                ? t('backToOverview')
                : t('backToStationExplorer')}
          </Link>
        )}
        <h1 className="text-lg font-semibold">{stationName}</h1>
        <p className="text-xs text-muted-foreground">{t('pulseLegacyNote')}</p>
      </div>

      {/* Forecast context */}
      {(forecastRows.length > 0 || atimeIso) && (
        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card px-3 py-2.5">
          {atimeIso && (
            <p className="text-[11px] text-muted-foreground/70">
              {t('pulseForecastFrom', { time: formatKlTime(atimeIso) })}
            </p>
          )}
          {displayRows.length > 0 ? (
            <div className="flex flex-col divide-y divide-border/40">
              {(() => {
                let lastDay = ''
                return displayRows.map(row => {
                  const day = calendarDateKey(row.ftimeIso)
                  const showDayLabel = day !== lastDay
                  lastDay = day
                  return (
                    <div key={row.ftimeIso}>
                      {showDayLabel && (
                        <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wide pt-1.5 pb-0.5 first:pt-0">
                          {formatChatDayLabel(row.ftimeIso, locale)}
                        </p>
                      )}
                      <ForecastRowLine row={row} isUsed={false} locale={locale} usedMarker="" />
                    </div>
                  )
                })
              })()}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('pulseNoForecast')}</p>
          )}
          {forecastRows.length > 3 && !showAllForecast && (
            <button
              type="button"
              onClick={() => setShowAllForecast(true)}
              className="text-xs text-muted-foreground underline underline-offset-2 self-start hover:text-foreground transition-colors mt-0.5"
            >
              {t('pulseForecastShowAll')}
            </button>
          )}
        </div>
      )}

      {/* Legacy read-only message preview */}
      <ChatPreviewList
        messages={messages}
        emptyLabel={t('pulseEmptyPublic')}
        deletedLabel={t('pulseDeleted')}
        kindLabels={kindLabels}
        loaded={previewLoaded}
        locale={locale}
      />
    </div>
  )
}
