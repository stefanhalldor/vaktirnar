'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { TriangleAlert } from 'lucide-react'
import type {
  ForecastDrawerRow,
  ResolvedTravelThresholds,
  RouteAssessmentCompleteness,
  RouteWeatherSamplingDiagnostics,
  RouteWeatherPoint,
  TravelCandidate,
} from '@/lib/weather/types'
import type { RouteWeatherCoverage } from '@/lib/iceland-routes/trustedRouteCoverage'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import {
  classifyNearestForecastWindDisplayStatusAt,
  selectNearestForecastRowAt,
  WIND_STATUS_MARKER_COLOR,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { resolveRouteForecastEtaMs } from '@/lib/weather/routeForecastTiming'
import { DepartureHeatmap } from './DepartureHeatmap'
import { VedurstofanPointCard } from './VedurstofanPointCard'
import { WeatherWatchersComparison } from './WeatherWatchersComparison'
import { formatCompactDateTime, formatNum } from './travelAuditMap.helpers'
import {
  DriveRouteMap,
  type DriveRouteMapStation,
} from './DriveRouteMap'
import { WindStatusFilterPills } from './WindStatusFilterPills'

type Station = VedurstofanTravelLayer['points'][number]
type ForecastRow = Station['forecastRows'][number]

export type AssessmentEndpointForecastRows = Readonly<{
  originRows: ForecastDrawerRow[]
  destinationRows: ForecastDrawerRow[]
}>

const ASSESSMENT_ENDPOINT_FRACTION_EPSILON = 0.0001

type StationAssessment = {
  station: Station
  etaIso: string | null
  row: ForecastRow | null
  status: WindDisplayStatus
}

type ManualStationSelection = {
  contextKey: string
  stationId: string
}

export function buildDriveStationAssessment(
  station: Station,
  candidate: TravelCandidate | null,
  durationMinutes: number,
  thresholds: ResolvedTravelThresholds,
): StationAssessment {
  const departureMs = candidate ? Date.parse(candidate.departureIso) : Date.now()
  const etaMs = resolveRouteForecastEtaMs(
    departureMs,
    durationMinutes * 60_000,
    station.routeFraction,
  )
  const rowIndex = etaMs === null
    ? null
    : selectNearestForecastRowAt(station.forecastRows, etaMs)
  return {
    station,
    etaIso: etaMs === null ? null : new Date(etaMs).toISOString(),
    row: rowIndex === null ? null : station.forecastRows[rowIndex],
    status: etaMs === null
      ? 'no_data'
      : classifyNearestForecastWindDisplayStatusAt(
          station.forecastRows,
          thresholds,
          etaMs,
        ),
  }
}

function stationAssessmentSafetyRank(status: WindDisplayStatus): number {
  switch (status) {
    case 'haettulegt': return 7
    case 'nalgast-haettumork': return 6
    case 'othaegilegt': return 5
    case 'nalgast-othaegindi': return 4
    case 'no_data': return 3
    case 'no_wind_data': return 2
    default: return 1
  }
}

export function selectAssessmentEndpointForecastRows(
  routeWeatherPoints: readonly RouteWeatherPoint[] | undefined,
  coverage: RouteWeatherCoverage | null | undefined,
): AssessmentEndpointForecastRows | null {
  if (
    !routeWeatherPoints
    || routeWeatherPoints.length < 2
    || (coverage?.status !== 'full' && coverage?.status !== 'partial')
  ) return null

  const usablePoints = routeWeatherPoints.filter(point => (point.forecastRows?.length ?? 0) > 0)
  const exactBoundaryPoint = (
    distanceFromTripOriginM: number,
    routeFraction: number,
  ): RouteWeatherPoint | null => {
    const matches = usablePoints.filter(point => (
      point.distanceFromOriginM === distanceFromTripOriginM
      && Math.abs(point.routeFraction - routeFraction) <= ASSESSMENT_ENDPOINT_FRACTION_EPSILON
    ))
    return matches.length === 1 ? matches[0] : null
  }
  const originPoint = exactBoundaryPoint(
    coverage.start.distanceFromTripOriginM,
    coverage.start.routeFraction,
  )
  const destinationPoint = exactBoundaryPoint(
    coverage.end.distanceFromTripOriginM,
    coverage.end.routeFraction,
  )
  if (!originPoint || !destinationPoint || originPoint.id === destinationPoint.id) return null

  return {
    originRows: originPoint.forecastRows ?? [],
    destinationRows: destinationPoint.forecastRows ?? [],
  }
}

export function DriveJourneyPanel({
  layer,
  candidates,
  currentCandidate,
  selectedCandidateIdx,
  onSelectCandidateIdx,
  slotStatusOverrides,
  routeAssessmentStatus,
  thresholds,
  durationMinutes,
  distanceKm,
  originName,
  destinationName,
  endpointForecastRows,
  onClearRoute,
  routePoints,
  hasMoreCandidates,
  onLoadMore,
  onEnlargeMap,
  stationReturnTo,
  routeSelectionContextKey,
}: {
  layer: VedurstofanTravelLayer | null
  candidates: TravelCandidate[]
  currentCandidate: TravelCandidate | null
  selectedCandidateIdx: number | null
  onSelectCandidateIdx: (index: number | null) => void
  slotStatusOverrides?: WindDisplayStatus[]
  /** Canonical route-wide status for the selected departure, including coverage gaps. */
  routeAssessmentStatus: WindDisplayStatus
  thresholds: ResolvedTravelThresholds
  durationMinutes: number
  distanceKm: number
  originName: string
  destinationName: string
  endpointForecastRows: AssessmentEndpointForecastRows | null
  onClearRoute: () => void
  routePoints: Array<{ lat: number; lon: number }>
  hasMoreCandidates?: boolean
  onLoadMore?: () => void
  onEnlargeMap?: () => void
  stationReturnTo: string
  routeSelectionContextKey: string
  /** Legacy metadata is accepted but intentionally does not narrow the visible route or stations. */
  assessmentCompleteness?: RouteAssessmentCompleteness
  /** Legacy coverage metadata is only used by the exported endpoint-row helper, not journey filtering. */
  weatherCoverage?: RouteWeatherCoverage
  /** Engineering sampling diagnostics are intentionally not rendered in the journey UI. */
  samplingDiagnostics?: RouteWeatherSamplingDiagnostics
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const t = useTranslations('teskeid.vedrid.overview')
  const locale = useLocale()
  const [visibleStatuses, setVisibleStatuses] = useState<Set<WindDisplayStatus>>(
    () => new Set(),
  )
  const [manualSelection, setManualSelection] = useState<ManualStationSelection | null>(null)
  const candidate =
    selectedCandidateIdx !== null
      ? candidates[selectedCandidateIdx] ?? candidates[0] ?? null
      : currentCandidate
  const selectionContextKey = `${routeSelectionContextKey}\u0000${candidate?.departureIso ?? ''}`
  const selectedStationId = manualSelection?.contextKey === selectionContextKey
    ? manualSelection.stationId
    : null
  const routeForecastCoverageIsIncomplete =
    layer?.status !== 'available'
    || routeAssessmentStatus === 'no_data'
    || routeAssessmentStatus === 'no_wind_data'

  useEffect(() => {
    setManualSelection(null)
  }, [selectionContextKey])

  const stations = useMemo(
    () => [...(layer?.points ?? [])]
      .sort((a, b) => (a.routeFraction ?? 0) - (b.routeFraction ?? 0)),
    [layer],
  )
  const assessments = useMemo(
    () => stations.map(station =>
      buildDriveStationAssessment(station, candidate, durationMinutes, thresholds),
    ),
    [candidate, durationMinutes, stations, thresholds],
  )
  const worst = assessments.reduce<StationAssessment | null>((current, assessment) => {
    if (!current) return assessment
    const currentRank = stationAssessmentSafetyRank(current.status)
    const assessmentRank = stationAssessmentSafetyRank(assessment.status)
    if (assessmentRank > currentRank) return assessment
    if (assessment.status === current.status && (assessment.row?.windSpeedMs ?? -1) > (current.row?.windSpeedMs ?? -1)) {
      return assessment
    }
    return current
  }, null)
  const destinationStation = stations[stations.length - 1] ?? null
  const selectedAssessment =
    selectedStationId === null
      ? null
      : assessments.find(assessment => assessment.station.stationId === selectedStationId) ?? null
  const displayedAssessment = selectedAssessment ?? worst
  const visibleDisplayedAssessment =
    displayedAssessment && (
      visibleStatuses.size === 0 || visibleStatuses.has(displayedAssessment.status)
    )
      ? displayedAssessment
      : null
  const displayedAssessmentIsWorst =
    visibleDisplayedAssessment?.station.routePointId === worst?.station.routePointId
  const driveMapStations = useMemo<DriveRouteMapStation[]>(
    () => assessments
      .filter(assessment => assessment.station.lat !== null && assessment.station.lon !== null)
      .map(assessment => ({
        id: assessment.station.stationId,
        name: assessment.station.stationName,
        lat: assessment.station.lat!,
        lon: assessment.station.lon!,
        driveTimeLabel: assessment.etaIso
          ? new Intl.DateTimeFormat(locale, {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(new Date(assessment.etaIso))
          : null,
        color: WIND_STATUS_MARKER_COLOR[assessment.status],
      })),
    [assessments, locale],
  )
  const driveMapStatusCounts = useMemo(
    () => assessments.reduce<Partial<Record<WindDisplayStatus, number>>>((counts, assessment) => {
      counts[assessment.status] = (counts[assessment.status] ?? 0) + 1
      return counts
    }, {}),
    [assessments],
  )
  const visibleDriveMapStations = useMemo(
    () => driveMapStations.filter(station => {
      const assessment = assessments.find(item => item.station.stationId === station.id)
      return assessment
        ? visibleStatuses.size === 0 || visibleStatuses.has(assessment.status)
        : true
    }),
    [assessments, driveMapStations, visibleStatuses],
  )
  const endpointComparison = endpointForecastRows ? (
    <WeatherWatchersComparison
      originLabel={originName}
      destinationLabel={destinationName}
      originRows={endpointForecastRows.originRows}
      destinationRows={endpointForecastRows.destinationRows}
      thresholds={thresholds}
    />
  ) : null
  const tuningNotice = (
    <div
      role="status"
      className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>{t('roadMapPrototypeDepartureForecastTuningNotice')}</p>
    </div>
  )
  const routeMapContent = (
    <div className="relative">
      <DriveRouteMap
        routePoints={routePoints}
        stations={visibleDriveMapStations}
        selectedStationId={visibleDisplayedAssessment?.station.stationId ?? null}
        onSelectStation={(stationId) => setManualSelection({
          contextKey: selectionContextKey,
          stationId,
        })}
        ariaLabel={tf('auditMapAlt', {
          origin: originName,
          destination: destinationName,
        })}
        className="h-[190px] w-full overflow-hidden rounded-xl border border-border"
      />
      {onEnlargeMap && (
        <button
          type="button"
          onClick={onEnlargeMap}
          className="absolute right-2 top-2 z-10 flex min-h-10 items-center rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tf('enlargeMap')}
        </button>
      )}
    </div>
  )

  if (!layer || stations.length === 0) {
    return (
      <div className="p-4">
        {tuningNotice}
        <p className="text-sm text-muted-foreground">
          {t('roadMapPrototypeDepartureOptInUnavailable')}
        </p>
        {endpointComparison}
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="rounded-xl border border-border bg-card p-4">
        {tuningNotice}
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/30">
          <p className="text-[10px] font-semibold text-blue-900 dark:text-blue-200">
            {tf('thresholdBoxTitle')}
          </p>
          <p className="mt-0.5 text-xs text-blue-800 dark:text-blue-300">
            {tf('thresholdSummaryLine', {
              caution: thresholds.cautionWindMs,
              red: thresholds.redWindMs,
            })}
          </p>
        </div>

        {candidates.length > 0 && (
          <div className="mt-3">
            <DepartureHeatmap
              candidates={candidates}
              bestWindow={undefined}
              originName={originName}
              selectedIdx={selectedCandidateIdx}
              onSelectIdx={onSelectCandidateIdx}
              visibleStatuses={visibleStatuses}
              onVisibleStatusesChange={setVisibleStatuses}
              thresholdsUsed={thresholds}
              showSelectedDetail={false}
              slotStatusOverrides={slotStatusOverrides}
              showBestWindowHint={false}
              hasMoreCandidates={hasMoreCandidates}
              onLoadMore={onLoadMore}
            />
          </div>
        )}

        {candidate && (
          <p className="mt-3 text-sm leading-snug text-foreground">
            {tf.rich('departureCalculationContext', {
              departure: formatCompactDateTime(candidate.departureIso, locale),
              b: chunks => <strong className="font-semibold">{chunks}</strong>,
              br: () => <br />,
            })}
          </p>
        )}

        <div className="mt-3 border-y border-border/70 divide-y divide-border/60">
          {worst && (
            <VedurstofanPointCard
              variant="compact"
              station={worst.station}
              status={routeAssessmentStatus}
              etaIso={worst.etaIso}
              departureIso={candidate?.departureIso ?? null}
              ftimeIso={worst.row?.ftimeIso ?? null}
              windMs={worst.row?.windSpeedMs ?? null}
              originName={originName}
              returnTo={stationReturnTo}
            />
          )}

          {destinationStation && (() => {
            const destinationAssessment = assessments[assessments.length - 1]
            const row = destinationAssessment?.row
            return (
              <section className="grid grid-cols-[5.25rem_1fr] gap-3 py-3">
                <p className="pt-0.5 text-[11px] font-semibold text-muted-foreground">
                  {destinationStation.stationName}
                </p>
                <div className="space-y-1">
                  {destinationAssessment?.etaIso && (
                    <p className="text-sm font-medium text-foreground">
                      {formatCompactDateTime(destinationAssessment.etaIso, locale)}
                    </p>
                  )}
                  {row && (
                    <p className="text-xs text-muted-foreground">
                      {tf('arrivalForecastAtLabel', {
                        forecastTime: formatCompactDateTime(row.ftimeIso, locale),
                      })}{' '}
                      {tf('metricWind').toLowerCase()} {formatNum(row.windSpeedMs ?? 0, locale)} m/s
                      {' · '}{tf('metricPrecip').toLowerCase()} {formatNum(row.precipitationMmPerHour ?? 0, locale)} mm/klst
                      {' · '}{tf('metricTemp').toLowerCase()} {formatNum(row.temperatureC ?? 0, locale)}°C
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">
                    {tf('providerVedurstofanLabel')}
                  </p>
                </div>
              </section>
            )
          })()}
        </div>

        {endpointComparison}

        <section className="mt-4 space-y-3 border-t border-border/70 pt-3">
          <WindStatusFilterPills
            counts={driveMapStatusCounts}
            visibleStatuses={visibleStatuses}
            onVisibleStatusesChange={setVisibleStatuses}
            showAllLabel=""
            alwaysShowWithinLimits
            mode="detailed"
          />
          {routeMapContent}

          {visibleDisplayedAssessment && (
            <VedurstofanPointCard
              station={visibleDisplayedAssessment.station}
              status={visibleDisplayedAssessment.status}
              etaIso={visibleDisplayedAssessment.etaIso}
              departureIso={candidate?.departureIso ?? null}
              originName={originName}
              panelTitle={displayedAssessmentIsWorst
                ? tf('decisivePointLabel')
                : tf('manualSelectedPointTitle')}
              isManualSelection={!displayedAssessmentIsWorst}
              returnTo={stationReturnTo}
            />
          )}

          {visibleDisplayedAssessment && selectedAssessment && !displayedAssessmentIsWorst && (
            <button
              type="button"
              onClick={() => setManualSelection(null)}
              className="min-h-10 text-xs font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tf('showWorstPoint')}
            </button>
          )}

          <details className="group rounded-xl border border-border bg-card">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span>
                {routeForecastCoverageIsIncomplete
                  ? tf('availableRouteForecastPointsDrawer')
                  : tf('allRouteForecastPointsDrawer')}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground">
                {t('roadMapPrototypeVedurstofanStationCount', { count: stations.length })}
              </span>
            </summary>
            <div className="space-y-2 border-t border-border/70 p-3">
              {assessments.map(assessment => (
                <VedurstofanPointCard
                  key={assessment.station.routePointId}
                  station={assessment.station}
                  status={assessment.status}
                  etaIso={assessment.etaIso}
                  departureIso={candidate?.departureIso ?? null}
                  originName={originName}
                  panelTitle={
                    assessment.station.routePointId === worst?.station.routePointId
                      ? tf('decisivePointLabel')
                      : undefined
                  }
                  returnTo={stationReturnTo}
                />
              ))}
            </div>
          </details>
        </section>

        <button
          type="button"
          onClick={onClearRoute}
          className="mt-4 min-h-10 w-full rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('roadMapPrototypeRouteClear')}
        </button>
      </div>
    </div>
  )
}

type MiniMapPoint = { x: number; y: number }

export function projectDriveMiniMapPoints(
  points: Array<{ lat: number; lon: number }>,
  width = 320,
  height = 150,
  padding = 14,
): MiniMapPoint[] {
  const valid = points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))
  if (valid.length === 0) return []
  const minLat = Math.min(...valid.map(point => point.lat))
  const maxLat = Math.max(...valid.map(point => point.lat))
  const minLon = Math.min(...valid.map(point => point.lon))
  const maxLon = Math.max(...valid.map(point => point.lon))
  const latSpan = Math.max(maxLat - minLat, 0.001)
  const lonSpan = Math.max(maxLon - minLon, 0.001)
  return valid.map(point => ({
    x: padding + ((point.lon - minLon) / lonSpan) * (width - padding * 2),
    y: height - padding - ((point.lat - minLat) / latSpan) * (height - padding * 2),
  }))
}
