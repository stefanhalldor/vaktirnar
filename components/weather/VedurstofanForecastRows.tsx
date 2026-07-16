'use client'

import { formatKlTime, formatCompactDateTime, formatNum } from './travelAuditMap.helpers'

export type ForecastRowData = {
  ftimeIso: string
  windSpeedMs: number | null
  windDirectionText: string | null
  temperatureC: number | null
  precipitationMmPerHour: number | null
  weatherText: string | null
}

export function ForecastRowLine({
  row,
  isUsed,
  locale,
  usedMarker,
  showDate = false,
}: {
  row: ForecastRowData
  isUsed: boolean
  locale: string
  usedMarker: string
  /** When true, shows compact date+time ("fim. 9. júl kl. 05:00") instead of time only. */
  showDate?: boolean
}) {
  const timeLabel = showDate ? formatCompactDateTime(row.ftimeIso, locale) : formatKlTime(row.ftimeIso)
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 ${isUsed ? 'text-foreground' : 'text-muted-foreground'}`}>
      <span className={`text-[11px] font-medium shrink-0 ${showDate ? '' : 'w-11'}`}>{timeLabel}</span>
      <span className="text-[11px] flex flex-wrap gap-x-1.5">
        {row.windSpeedMs !== null && (
          <span>{formatNum(row.windSpeedMs, locale)} m/s{row.windDirectionText ? ` ${row.windDirectionText}` : ''}</span>
        )}
        {row.precipitationMmPerHour !== null && (
          <span>{formatNum(row.precipitationMmPerHour, locale)} mm/klst</span>
        )}
        {row.temperatureC !== null && (
          <span>{formatNum(row.temperatureC, locale)}°C</span>
        )}
        {row.weatherText && (
          <span>{row.weatherText}</span>
        )}
      </span>
      {isUsed && (
        <span className="text-[10px] text-primary/70 font-medium shrink-0">{usedMarker}</span>
      )}
    </div>
  )
}

/**
 * Selects up to `limit` upcoming forecast rows (ftimeIso >= now).
 * Falls back to the first `limit` rows if none are in the future.
 */
export function selectUpcomingRows(rows: ForecastRowData[], limit = 3): ForecastRowData[] {
  const sorted = [...rows].sort((a, b) => Date.parse(a.ftimeIso) - Date.parse(b.ftimeIso))
  const now = Date.now()
  const upcoming = sorted.filter(r => Date.parse(r.ftimeIso) >= now)
  return (upcoming.length > 0 ? upcoming : sorted).slice(0, limit)
}
