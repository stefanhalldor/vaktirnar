'use client'

import { useTranslations, useLocale } from 'next-intl'
import type { ForecastDrawerRow } from '@/lib/weather/types'
import { formatKlTime, formatNum, normalizeLocale } from './travelAuditMap.helpers'

type Props = {
  rows: ForecastDrawerRow[]
  title: string
  /** ISO time of the forecast hour to highlight (e.g. ETA or arrival weather time). */
  highlightedTimeIso?: string
  /** Override label shown under the highlighted row. Defaults to forecastUsedByTeskeid. */
  highlightedLabel?: string
  onClose: () => void
}

/** Short weekday+date label in Reykjavik timezone. E.g. "Fös. 10. júl" or "Fri, 10 Jul". */
function formatDrawerDate(isoString: string, isIcelandic: boolean): string {
  return new Intl.DateTimeFormat(isIcelandic ? 'is-IS' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    timeZone: 'Atlantic/Reykjavik',
  }).format(new Date(isoString))
}

export function ForecastDrawer({ rows, title, highlightedTimeIso, highlightedLabel, onClose }: Props) {
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
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
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

        {/* Table */}
        <div className="px-4 pb-6">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b text-muted-foreground text-left">
                <th className="py-2 pr-2 font-medium">{tf('forecastColDateTime')}</th>
                <th className="py-2 pr-2 font-medium text-right">{tf('forecastColTemp')}</th>
                <th className="py-2 pr-2 font-medium text-right">{tf('forecastColWind')}</th>
                <th className="py-2 font-medium text-right">{tf('forecastColPrecip')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isHighlighted = highlightedTimeIso === row.timeIso
                const dateLabel = formatDrawerDate(row.timeIso, isIcelandic)
                const timeLabel = formatKlTime(row.timeIso)

                const gustSeverity = row.gust.severity
                const showGust = row.gust.value > row.wind.value || gustSeverity !== 'none'
                const gustSeverityClass =
                  gustSeverity === 'danger' ? 'text-red-600 dark:text-red-400' :
                  gustSeverity === 'caution' ? 'text-amber-600 dark:text-amber-400' :
                  gustSeverity === 'notice' ? 'text-yellow-600 dark:text-yellow-500' :
                  'text-muted-foreground'

                const windToneClass =
                  row.wind.tone === 'positive' ? 'text-green-600 dark:text-green-400' :
                  row.wind.tone === 'negative' ? 'text-amber-600 dark:text-amber-400' :
                  ''

                const precipToneClass =
                  row.precipitation.tone === 'positive' ? 'text-green-600 dark:text-green-400' :
                  row.precipitation.tone === 'negative' ? 'text-amber-600 dark:text-amber-400' :
                  ''

                return (
                  <tr
                    key={row.timeIso}
                    className={`border-b border-muted/40 ${isHighlighted ? 'bg-primary/5 font-medium' : ''}`}
                  >
                    <td className="py-1.5 pr-2 text-foreground">
                      {dateLabel} {timeLabel}
                      {isHighlighted && (
                        <span className="block text-[10px] text-primary font-normal">
                          {highlightedLabel ?? tf('forecastUsedByTeskeid')}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {formatNum(row.temperature.value, locale)}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      <span className={windToneClass}>
                        {formatNum(row.wind.value, locale)}
                      </span>
                      {showGust && (
                        <span className={`block text-[10px] ${gustSeverityClass}`}>
                          {tf('forecastGustAbbr')} {formatNum(row.gust.value, locale)}
                          {gustSeverity === 'danger' || gustSeverity === 'caution' ? ' ⚠' : ''}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      <span className={precipToneClass}>
                        {formatNum(row.precipitation.value, locale)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
