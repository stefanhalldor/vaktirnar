'use client'

import { useTranslations, useLocale } from 'next-intl'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import type { WindDisplayStatus } from '@/lib/weather/windDisplayStatus'
import { WindStatusBadge } from '@/components/weather/WindStatusBadge'
import { formatKlTime, formatNum, getOriginDisplay } from './travelAuditMap.helpers'
import { VedurstofanPulseInline } from './VedurstofanPulseInline'

type ForecastRow = VedurstofanTravelLayer['points'][number]['forecastRows'][number]
type StationPoint = VedurstofanTravelLayer['points'][number]

/** Selects the previous, used, and next forecast rows relative to `etaIso`. */
function selectPrevUsedNext(
  rows: ForecastRow[],
  etaIso: string | null,
): { prev: ForecastRow | null; used: ForecastRow | null; next: ForecastRow | null } {
  if (rows.length === 0) return { prev: null, used: null, next: null }
  const sorted = [...rows].sort((a, b) => Date.parse(a.ftimeIso) - Date.parse(b.ftimeIso))
  if (!etaIso) {
    // No ETA: pick row with highest wind as "used"
    let usedIdx = 0
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i].windSpeedMs ?? 0) > (sorted[usedIdx].windSpeedMs ?? 0)) usedIdx = i
    }
    return {
      prev: usedIdx > 0 ? sorted[usedIdx - 1] : null,
      used: sorted[usedIdx],
      next: usedIdx < sorted.length - 1 ? sorted[usedIdx + 1] : null,
    }
  }
  const etaMs = Date.parse(etaIso)
  let usedIdx = 0
  let minDiff = Infinity
  for (let i = 0; i < sorted.length; i++) {
    const diff = Math.abs(Date.parse(sorted[i].ftimeIso) - etaMs)
    if (diff < minDiff) { minDiff = diff; usedIdx = i }
  }
  return {
    prev: usedIdx > 0 ? sorted[usedIdx - 1] : null,
    used: sorted[usedIdx],
    next: usedIdx < sorted.length - 1 ? sorted[usedIdx + 1] : null,
  }
}

/**
 * Pure display model derived from a Veðurstofan station point.
 * Used by VedurstofanPointCard for both full and compact variants.
 */
export type VedurstofanPointDisplayModel = {
  distFromOriginKm: number | null
  distFromRoadM: number
  etaTimeLabel: string | null
  ftimeLabel: string | null
  prev: ForecastRow | null
  used: ForecastRow | null
  next: ForecastRow | null
}

export function buildVedurstofanPointDisplayModel(
  station: StationPoint,
  etaIso: string | null,
  ftimeIso: string | null,
): VedurstofanPointDisplayModel {
  return {
    distFromOriginKm: station.distanceFromOriginM !== null
      ? Math.round(station.distanceFromOriginM / 1000)
      : null,
    distFromRoadM: Math.round(station.distanceM),
    etaTimeLabel: etaIso ? formatKlTime(etaIso) : null,
    ftimeLabel: ftimeIso ? formatKlTime(ftimeIso) : null,
    ...selectPrevUsedNext(station.forecastRows, etaIso),
  }
}

function ForecastRowLine({
  row,
  isUsed,
  locale,
  usedMarker,
}: {
  row: ForecastRow
  isUsed: boolean
  locale: string
  usedMarker: string
}) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 ${isUsed ? 'text-foreground' : 'text-muted-foreground'}`}>
      <span className="text-[11px] font-medium shrink-0 w-11">{formatKlTime(row.ftimeIso)}</span>
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


export function VedurstofanPointCard({
  station,
  status,
  etaIso,
  departureIso,
  originName,
  isManualSelection,
  panelTitle,
  returnTo,
  ftimeIso,
  windMs,
  variant = 'full',
}: {
  station: VedurstofanTravelLayer['points'][number]
  status: WindDisplayStatus
  /** ETA at this station (used to select prev/used/next forecast rows). */
  etaIso: string | null
  /** Reference departure ISO for "Brottfarartími" display. */
  departureIso: string | null
  originName: string
  isManualSelection?: boolean
  /** Panel header label (e.g. "Mest krefjandi" or "Valin veðurspá"). */
  panelTitle?: string
  /** Return URL for the full pulse route. Passed to VedurstofanPulseInline. */
  returnTo?: string
  /** Forecast row time (used in compact variant for ftimeLabel). */
  ftimeIso?: string | null
  /** Wind speed in m/s (used in compact variant summary line). */
  windMs?: number | null
  /** 'compact' renders the inline "Á leiðinni" summary row; 'full' (default) renders the full station card. */
  variant?: 'compact' | 'full'
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()
  const model = buildVedurstofanPointDisplayModel(station, etaIso, variant === 'compact' ? (ftimeIso ?? null) : null)
  const { distFromOriginKm, distFromRoadM, etaTimeLabel, ftimeLabel, prev, used, next } = model

  const originDisplay = getOriginDisplay(originName, locale, tf('slotDetailOriginFallback'))

  if (variant === 'compact') {
    return (
      <section className="grid grid-cols-[5.25rem_1fr] gap-3 py-3">
        <p className="text-[11px] font-semibold text-muted-foreground pt-0.5">{tf('sectionOnWay')}</p>
        <div className="space-y-1">
          <WindStatusBadge status={status} variant="line" />
          {distFromOriginKm !== null && etaTimeLabel && (
            <p className="text-xs text-muted-foreground">
              {distFromOriginKm === 0
                ? tf('slotDetailWorstAtStart', { time: etaTimeLabel })
                : tf('slotDetailWorstDistanceAt', { distance: distFromOriginKm, origin: originDisplay, time: etaTimeLabel })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {station.stationName}
            {windMs != null && (
              <>{' · '}{tf('metricWind').toLowerCase()} {formatNum(windMs, locale)} m/s</>
            )}
            {ftimeLabel && (
              <>{' · '}{tf('vedurstofanForecastUsedAt', { time: ftimeLabel })}</>
            )}
          </p>
          {station.atimeIso && (
            <p className="text-[11px] text-muted-foreground/70">
              {tf('vedurstofanForecastFrom', { time: formatKlTime(station.atimeIso) })}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/60">{tf('providerVedurstofanLabel')}</p>
          <div className="mt-1 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            {tf.rich('weatherDisclaimer', {
              link: (chunks) => (
                <a href="https://umferdin.is/" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                  {chunks}
                </a>
              ),
            })}
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col gap-2 text-xs text-muted-foreground">
      {/* Panel header */}
      {panelTitle && (
        <div className="flex items-center gap-2 flex-wrap">
          {!isManualSelection ? (
            <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium">
              {panelTitle}
            </span>
          ) : (
            <span className="font-medium text-foreground">{panelTitle}</span>
          )}
        </div>
      )}

      {/* Station name + status */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground text-sm">{station.stationName}</span>
          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium">
            {tf('providerVedurstofanLabel')}
          </span>
        </div>
        <WindStatusBadge status={status} variant="chip" className="self-start" />
      </div>

      {/* Route timing */}
      <div className="flex flex-col gap-0.5">
        {departureIso && (
          <span>{tf('pointDepartureLabel')}: {tf('pointTimeLine', { time: formatKlTime(departureIso) })}</span>
        )}
        {etaIso && (
          <span>
            {tf('pointEtaLabel')}
            {distFromOriginKm !== null && distFromOriginKm > 0 && ` ${distFromOriginKm} ${tf('kmFrom')} ${originDisplay}`}
            {': '}
            {tf('pointTimeLine', { time: formatKlTime(etaIso) })}
          </span>
        )}
        {distFromRoadM >= 0 && (
          <span>
            {distFromRoadM < 1000
              ? tf('vedurstofanStationFromRoad', { distance: `${distFromRoadM} m` })
              : tf('vedurstofanStationFromRoad', { distance: `${formatNum(distFromRoadM / 1000, locale)} km` })}
          </span>
        )}
      </div>

      {/* Forecast issue time */}
      {station.atimeIso && (
        <span className="text-muted-foreground/70">
          {tf('vedurstofanForecastFrom', { time: formatKlTime(station.atimeIso) })}
        </span>
      )}

      {/* Previous / used / next forecast rows */}
      {(prev || used || next) && (
        <div className="flex flex-col divide-y divide-border/40 border-t border-border/40 pt-1">
          {prev && (
            <ForecastRowLine row={prev} isUsed={false} locale={locale} usedMarker={tf('vedurstofanForecastUsedMarker')} />
          )}
          {used && (
            <ForecastRowLine row={used} isUsed={true} locale={locale} usedMarker={tf('vedurstofanForecastUsedMarker')} />
          )}
          {next && (
            <ForecastRowLine row={next} isUsed={false} locale={locale} usedMarker={tf('vedurstofanForecastUsedMarker')} />
          )}
        </div>
      )}

      {/* Source link */}
      {station.sourceUrl && (
        <a
          href={station.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 text-[11px] self-start"
        >
          {tf('vedurstofanSourceLink')}
        </a>
      )}

      <VedurstofanPulseInline stationId={station.stationId} returnTo={returnTo} />
    </div>
  )
}
