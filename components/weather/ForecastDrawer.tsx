'use client'

import { useTranslations, useLocale } from 'next-intl'
import type { ForecastDrawerRow } from '@/lib/weather/types'
import { formatKlTime, formatNum, normalizeLocale } from './travelAuditMap.helpers'

type Props = {
  rows: ForecastDrawerRow[]
  title: string
  /** ISO time of the forecast hour to highlight (e.g. ETA or arrival weather time). */
  highlightedTimeIso?: string
  /** Yr forecast page URL for the location shown in this drawer. */
  yrnoUrl?: string
  /** Google Maps URL for the location shown in this drawer. */
  googleMapsUrl?: string
  /** Departure context shown in sticky header: origin (dative) + departure ISO. */
  departureContext?: { originDisplay: string; departureIso: string }
  onClose: () => void
}

/** Short weekday+date label in Reykjavik timezone. E.g. "Fös. 10. júl" or "Fri, 10 Jul". */
function formatDrawerDate(isoString: string, isIcelandic: boolean): string {
  return new Intl.DateTimeFormat(isIcelandic ? 'is-IS' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    timeZone: 'Atlantic/Reykjavik',
  }).format(new Date(isoString))
}

/** Shared grid template for header and body rows. */
const ROW_GRID = 'grid grid-cols-[1fr_2.5rem_5rem_3rem]'

export function ForecastDrawer({ rows, title, highlightedTimeIso, yrnoUrl, googleMapsUrl, departureContext, onClose }: Props) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()
  const isIcelandic = normalizeLocale(locale).startsWith('is')

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-background border-t w-full max-w-md mx-auto max-h-[75vh] overflow-y-auto rounded-t-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-background z-10 border-b border-muted/40">

          {/* Title + close */}
          <div className="flex items-center justify-between px-4 pt-4 pb-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
              aria-label={tf('drawerClose')}
            >
              ×
            </button>
          </div>

          {/* External links */}
          {(yrnoUrl || googleMapsUrl) && (
            <div className="flex gap-3 px-4 pb-1.5">
              {yrnoUrl && (
                <a
                  href={yrnoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary underline hover:text-primary/80 transition-colors"
                >
                  Yr
                </a>
              )}
              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary underline hover:text-primary/80 transition-colors"
                >
                  Google Maps
                </a>
              )}
            </div>
          )}

          {/* Departure context */}
          {departureContext && (
            <p className="px-4 pb-2 text-[11px] text-muted-foreground">
              {tf('forecastDepartureFrom', {
                origin: departureContext.originDisplay,
                time: formatKlTime(departureContext.departureIso),
              })}
            </p>
          )}

          {/* Column headers */}
          <div className={`${ROW_GRID} px-4 pb-2 text-[10px] font-medium text-muted-foreground`}>
            <span>{tf('forecastColDateTime')}</span>
            <span className="text-right">{tf('forecastColTemp')}</span>
            <span className="text-right">{tf('forecastColWind')}</span>
            <span className="text-right">{tf('forecastColPrecip')}</span>
          </div>

        </div>

        {/* Forecast rows */}
        <div className="px-4 pb-6 pt-0.5">
          {rows.map(row => {
            const isHighlighted = highlightedTimeIso === row.timeIso
            const dateLabel = formatDrawerDate(row.timeIso, isIcelandic)
            const timeLabel = formatKlTime(row.timeIso)

            const gustSeverity = row.gust.severity
            const showGust = row.gust.value > row.wind.value || gustSeverity !== 'none'
            const gustSeverityClass =
              gustSeverity === 'danger'  ? 'text-red-600 dark:text-red-400' :
              gustSeverity === 'caution' ? 'text-amber-600 dark:text-amber-400' :
              gustSeverity === 'notice'  ? 'text-yellow-600 dark:text-yellow-500' :
              'text-muted-foreground'

            const windToneClass =
              row.wind.tone === 'positive' ? 'text-green-600 dark:text-green-400' :
              row.wind.tone === 'negative' ? 'text-amber-600 dark:text-amber-400' :
              ''

            const precipToneClass =
              row.precipitation.tone === 'positive' ? 'text-green-600 dark:text-green-400' :
              row.precipitation.tone === 'negative' ? 'text-amber-600 dark:text-amber-400' :
              ''

            const tempToneClass =
              row.temperature.tone === 'positive' ? 'text-green-600 dark:text-green-400' :
              row.temperature.tone === 'negative' ? 'text-amber-600 dark:text-amber-400' :
              ''

            return (
              <div
                key={row.timeIso}
                className={`${ROW_GRID} items-start py-1.5 border-b border-muted/40 text-xs${isHighlighted ? ' bg-primary/5 font-medium -mx-4 px-4' : ''}`}
              >
                {/* DateTime */}
                <div className="text-foreground pr-2">
                  <span>{dateLabel} {timeLabel}</span>
                  {isHighlighted && (
                    <span className="block text-[10px] text-primary font-normal">
                      {tf('forecastHighlightedRowLabel')}
                    </span>
                  )}
                </div>

                {/* Temperature */}
                <div className="text-right tabular-nums">
                  <span className={tempToneClass}>{formatNum(row.temperature.value, locale)}</span>
                </div>

                {/* Wind + gust */}
                <div className="text-right tabular-nums">
                  <span className={windToneClass}>
                    {formatNum(row.wind.value, locale)}
                  </span>
                  {showGust && (
                    <span className={`block text-[10px] ${gustSeverityClass}`}>
                      {tf('forecastGustAbbr')} {formatNum(row.gust.value, locale)}
                      {gustSeverity === 'danger' || gustSeverity === 'caution' ? ' ⚠' : ''}
                    </span>
                  )}
                </div>

                {/* Precipitation */}
                <div className="text-right tabular-nums">
                  <span className={precipToneClass}>
                    {formatNum(row.precipitation.value, locale)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
