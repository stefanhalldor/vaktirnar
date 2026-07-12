'use client'

import type { ReactNode } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { TravelIssue, ResolvedTravelThresholds } from '@/lib/weather/types'
import {
  formatKlTime,
  formatNum,
  getOriginDisplay,
  buildThresholdContext,
  type PointSummary,
} from './travelAuditMap.helpers'

/**
 * Shared content rows for a route weather point detail.
 * Returns a Fragment — parent supplies the outer card container and title/variant wrapper.
 *
 * Renders (in order):
 *   Punktur x/y (+ optional headerExtra for status badges)
 *   Brottfarartími
 *   Áætlaður tími + distance from leg start
 *   Spápunktur distance from road
 *   Veðurspá á þessum stað kl. HH:MM
 *   Full weather line: Vindur · Úrkoma · Hiti
 *   Threshold context line (when displayed value exceeds a threshold)
 *   Place label + coord (when placeLabel provided)
 *   Links: Spá 🥄 · Yr · Google Maps · Hrá met.no gögn
 */
export function RouteWeatherPointDetailCard({
  summary,
  thresholdsUsed,
  highlightedIssue,
  originName,
  placeLabel,
  headerExtra,
  onOpenForecast,
}: {
  summary: PointSummary
  thresholdsUsed?: ResolvedTravelThresholds
  highlightedIssue?: TravelIssue
  originName: string
  placeLabel?: string | null
  /** Optional content rendered on the same line as Punktur x/y (e.g. status badge). */
  headerExtra?: ReactNode
  onOpenForecast?: () => void
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()

  const distanceKm =
    summary.isHighlighted && highlightedIssue?.distanceFromLegStartM !== undefined
      ? Math.round(highlightedIssue.distanceFromLegStartM / 1000)
      : summary.distanceFromOriginKm
  const legStartName =
    summary.isHighlighted && highlightedIssue?.legStartName
      ? highlightedIssue.legStartName
      : originName
  const originDisplay = getOriginDisplay(legStartName, locale, tf('slotDetailOriginFallback'))

  const thresholdContext = buildThresholdContext(summary, thresholdsUsed, highlightedIssue)
  const forecastTimeFormatted = summary.forecastTimeIso
    ? formatKlTime(summary.forecastTimeIso)
    : summary.decisiveTimeFormatted
  const hasWeatherValues =
    summary.windMs > 0 || summary.precipMmPerHour > 0 || summary.decisiveTempC !== undefined

  return (
    <>
      {/* Punktur x/y + optional badge slot */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-foreground">
          {tf('pointLabel')} {summary.routeIndex + 1}/{summary.totalPoints}
        </span>
        {headerExtra}
      </div>

      {/* Brottfarartími */}
      {summary.departureIso && (
        <span>{tf('pointDepartureLabel')}: {tf('pointTimeLine', { time: formatKlTime(summary.departureIso) })}</span>
      )}

      {/* ETA + distance from leg start */}
      {summary.etaIso && (
        <span>
          {tf('pointEtaLabel')}
          {distanceKm > 0 && ` ${distanceKm} ${tf('kmFrom')} ${originDisplay}`}
          {': '}
          {tf('pointTimeLine', { time: formatKlTime(summary.etaIso) })}
        </span>
      )}

      {/* Forecast point distance from road */}
      <span>
        {summary.forecastDistanceFromRouteM < 1000
          ? tf('forecastPointDistanceMeters', { meters: summary.forecastDistanceFromRouteM })
          : tf('forecastPointDistanceKilometers', { kilometers: formatNum(summary.forecastDistanceFromRouteM / 1000, locale) })}
      </span>

      {/* Forecast time at this point */}
      {forecastTimeFormatted && (
        <span>{tf('pointForecastHereAt', { time: forecastTimeFormatted })}</span>
      )}

      {/* Full weather line — primary; issue-metric fallback for no-data worst point */}
      {hasWeatherValues ? (
        <p>
          {tf('metricWind')}: {formatNum(summary.windMs, locale)} m/s
          {' · '}{tf('metricPrecip')}: {formatNum(summary.precipMmPerHour, locale)} mm/klst
          {summary.decisiveTempC !== undefined && (
            <>{' · '}{tf('metricTemp')}: {formatNum(summary.decisiveTempC, locale)}°C</>
          )}
        </p>
      ) : (
        summary.isHighlighted &&
        highlightedIssue?.value !== undefined &&
        highlightedIssue.metric !== 'data' && (
          <p>
            {highlightedIssue.metric === 'precipitation' ? tf('metricPrecip') : tf('metricWind')}
            {': '}{formatNum(highlightedIssue.value, locale)} {highlightedIssue.unit ?? ''}
          </p>
        )
      )}

      {/* Threshold context */}
      {thresholdContext && (
        <p className="text-muted-foreground/70 text-[11px]">
          {tf(thresholdContext.metricLabelKey as 'metricWind')}
          {' '}
          {tf('aboveThresholdWithExcess', {
            excess: formatNum(thresholdContext.excess, locale),
            threshold: formatNum(thresholdContext.thresholdValue, locale),
            unit: thresholdContext.thresholdUnit,
          })}
        </p>
      )}

      {/* Place label + coord (map panel only, when placeLabel is provided) */}
      {placeLabel != null && (
        <div className="flex flex-col gap-0.5">
          {!summary.isOrigin && !summary.isDestination && (
            <span>{tf('forecastPointNear', { place: placeLabel })}</span>
          )}
          {summary.hasSeparateForecastPoint && (
            <span className="text-muted-foreground/60">
              {tf('forecastPointCoord', { lat: summary.forecastLat.toFixed(4), lon: summary.forecastLon.toFixed(4) })}
            </span>
          )}
          {!summary.isOrigin && !summary.isDestination && (
            <span className="text-muted-foreground/40 text-[10px]">© OpenStreetMap contributors</span>
          )}
        </div>
      )}

      {/* Links */}
      <div className="flex flex-wrap gap-3">
        {onOpenForecast && (
          <button
            type="button"
            onClick={onOpenForecast}
            className="underline hover:text-foreground transition-colors text-left"
          >
            {tf('spaSpoon')}
          </button>
        )}
        <a
          href={summary.yrnoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground transition-colors"
        >
          {tf('viewForecast')}
        </a>
        <a
          href={summary.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground transition-colors"
        >
          {tf('openOnMap')}
        </a>
        <a
          href={summary.metnoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground transition-colors text-muted-foreground/60"
        >
          {tf('viewMetnoRaw')}
        </a>
      </div>

    </>
  )
}
