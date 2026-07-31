import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import type { ForecastDrawerRow, TravelCandidate } from '@/lib/weather/types'
import { resolveThresholds } from '@/lib/weather/thresholds'

type MockMapProps = {
  routePoints?: Array<{ lat: number; lon: number }>
  routes?: Array<{
    id: string
    points: Array<{ lat: number; lon: number }>
    dashArray?: number[]
  }>
  stations?: Array<{ id: string; name: string; color: string }>
  selectedStationId?: string | null
  onSelectStation?: (stationId: string) => void
}

type MockPointCardProps = {
  station: { stationId: string; stationName: string }
  status: string
  variant?: string
  panelTitle?: string
  isManualSelection?: boolean
}

type MockWeatherWatchersComparisonProps = {
  originLabel: string
  destinationLabel: string
  originRows: ForecastDrawerRow[]
  destinationRows: ForecastDrawerRow[]
}

type MockWindStatusFilterPillsProps = {
  visibleStatuses: Set<string>
  onVisibleStatusesChange: (next: Set<string>) => void
}

type MockDepartureHeatmapProps = {
  firstSlotLabel?: string
  visibleStatuses: Set<string>
  onVisibleStatusesChange: (next: Set<string>) => void
}

function serializedStatuses(statuses: ReadonlySet<string>): string {
  return [...statuses].sort().join('|')
}

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => Object.assign(
    (key: string) => key,
    { rich: (key: string) => key },
  ),
}))

vi.mock('@/components/weather/DepartureHeatmap', () => ({
  DepartureHeatmap: ({
    firstSlotLabel,
    visibleStatuses,
    onVisibleStatusesChange,
  }: MockDepartureHeatmapProps) => (
    <div
      data-testid="departure-heatmap"
      data-first-slot-label={firstSlotLabel ?? ''}
      data-visible-statuses={serializedStatuses(visibleStatuses)}
    >
      <button
        type="button"
        data-testid="departure-filter-only-within-limits"
        onClick={() => onVisibleStatusesChange(new Set(['innan-marka']))}
      >
        departure within limits only
      </button>
      <button
        type="button"
        data-testid="departure-filter-show-all"
        onClick={() => onVisibleStatusesChange(new Set())}
      >
        departure show all
      </button>
    </div>
  ),
}))

vi.mock('@/components/weather/WeatherWatchersComparison', () => ({
  WeatherWatchersComparison: ({
    originLabel,
    destinationLabel,
    originRows,
    destinationRows,
  }: MockWeatherWatchersComparisonProps) => (
    <div
      data-testid="weather-watchers-comparison"
      data-origin-label={originLabel}
      data-destination-label={destinationLabel}
      data-origin-wind={originRows[0]?.wind.value ?? ''}
      data-destination-wind={destinationRows[0]?.wind.value ?? ''}
    />
  ),
}))

vi.mock('@/components/weather/WindStatusFilterPills', () => ({
  WindStatusFilterPills: ({
    visibleStatuses,
    onVisibleStatusesChange,
  }: MockWindStatusFilterPillsProps) => (
    <div
      data-testid="wind-status-filter-pills"
      data-visible-statuses={serializedStatuses(visibleStatuses)}
    >
      <button
        type="button"
        data-testid="route-filter-only-uncomfortable"
        onClick={() => onVisibleStatusesChange(new Set(['othaegilegt']))}
      >
        route uncomfortable only
      </button>
      <button
        type="button"
        data-testid="route-filter-show-all"
        onClick={() => onVisibleStatusesChange(new Set())}
      >
        route show all
      </button>
    </div>
  ),
}))

vi.mock('@/components/weather/VedurstofanPointCard', () => ({
  VedurstofanPointCard: ({
    station,
    status,
    variant,
    panelTitle,
    isManualSelection,
  }: MockPointCardProps) => (
    <div
      data-testid="point-card"
      data-station-id={station.stationId}
      data-status={status}
      data-variant={variant ?? 'full'}
      data-panel-title={panelTitle ?? ''}
      data-manual-selection={String(Boolean(isManualSelection))}
    >
      {station.stationName}
    </div>
  ),
}))

vi.mock('@/components/weather/DriveRouteMap', () => ({
  DRIVE_MAP_ROUTE_COLOR: '#14532d',
  DriveRouteMap: ({
    routePoints = [],
    routes = [],
    stations = [],
    selectedStationId,
    onSelectStation,
  }: MockMapProps) => (
    <div
      data-testid="drive-route-map"
      data-selected-station-id={selectedStationId ?? ''}
      data-primary-route-point-count={routePoints.length}
      data-route-styles={routes
        .map(route => `${route.id}:${route.dashArray ? 'dashed' : 'solid'}`)
        .join('|')}
      data-station-colors={stations.map(station => `${station.id}:${station.color}`).join('|')}
    >
      {stations.map(station => (
        <button
          key={station.id}
          type="button"
          onClick={() => onSelectStation?.(station.id)}
        >
          select {station.name}
        </button>
      ))}
    </div>
  ),
}))

import { DriveJourneyPanel } from '@/components/weather/DriveJourneyPanel'

const CANDIDATES: TravelCandidate[] = [
  {
    departureIso: '2026-07-26T12:00:00.000Z',
    arrivalIso: '2026-07-26T14:00:00.000Z',
    status: 'gult',
  },
  {
    departureIso: '2026-07-26T15:00:00.000Z',
    arrivalIso: '2026-07-26T17:00:00.000Z',
    status: 'gult',
  },
]

function forecastRows(earlyWindSpeedMs: number, lateWindSpeedMs = earlyWindSpeedMs) {
  return [12, 13, 14, 15, 16, 17].map(hour => ({
    ftimeIso: `2026-07-26T${String(hour).padStart(2, '0')}:00:00.000Z`,
    windSpeedMs: hour < 15 ? earlyWindSpeedMs : lateWindSpeedMs,
    precipitationMmPerHour: 0,
    temperatureC: 10,
    windDirectionText: 'N',
    weatherText: null,
  }))
}

function endpointForecastRow(windMs: number): ForecastDrawerRow {
  return {
    timeIso: '2026-07-26T12:00:00.000Z',
    status: 'graent',
    temperature: { value: 10, direction: 'none', tone: 'neutral' },
    wind: { value: windMs, direction: 'none', tone: 'neutral' },
    gust: { value: windMs, direction: 'none', tone: 'neutral', severity: 'none' },
    precipitation: { value: 0, direction: 'none', tone: 'neutral' },
    windDirectionText: 'N',
    weatherEmoji: null,
  }
}

function createLayer({
  calmWind = [6, 16],
  worstWind = [14, 5],
}: {
  calmWind?: [number, number]
  worstWind?: [number, number]
} = {}): VedurstofanTravelLayer {
  return {
    experimental: true,
    status: 'available',
    mappedPointCount: 2,
    availablePointCount: 2,
    stalePointCount: 0,
    unavailablePointCount: 0,
    layerAtimeIso: '2026-07-26T11:00:00.000Z',
    lastWarmAttemptIso: '2026-07-26T11:05:00.000Z',
    points: [
      {
        routePointId: 'vedurstofan_calm',
        stationId: 'calm',
        stationName: 'Lygn stöð',
        distanceM: 100,
        distanceFromOriginM: 25_000,
        routeFraction: 0.25,
        status: 'ok',
        atimeIso: '2026-07-26T11:00:00.000Z',
        fetchedAtIso: '2026-07-26T11:05:00.000Z',
        expiresAtIso: '2026-07-26T18:00:00.000Z',
        lat: 64.2,
        lon: -21.7,
        sourceUrl: null,
        forecastRows: forecastRows(...calmWind),
      },
      {
        routePointId: 'vedurstofan_worst',
        stationId: 'worst',
        stationName: 'Vindasöm stöð',
        distanceM: 120,
        distanceFromOriginM: 75_000,
        routeFraction: 0.75,
        status: 'ok',
        atimeIso: '2026-07-26T11:00:00.000Z',
        fetchedAtIso: '2026-07-26T11:05:00.000Z',
        expiresAtIso: '2026-07-26T18:00:00.000Z',
        lat: 65.1,
        lon: -20.2,
        sourceUrl: null,
        forecastRows: forecastRows(...worstWind),
      },
    ],
  }
}

const BASE_PROPS = {
  candidates: CANDIDATES,
  currentCandidate: CANDIDATES[0],
  selectedCandidateIdx: 0,
  onSelectCandidateIdx: vi.fn(),
  routeAssessmentStatus: 'othaegilegt' as const,
  thresholds: resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 }),
  durationMinutes: 120,
  distanceKm: 100,
  originName: 'Reykjavík',
  destinationName: 'Borgarnes',
  endpointForecastRows: {
    originRows: [endpointForecastRow(4)],
    destinationRows: [endpointForecastRow(7)],
  },
  onClearRoute: vi.fn(),
  routePoints: [
    { lat: 64.1, lon: -21.9 },
    { lat: 64.5, lon: -21.2 },
    { lat: 65.0, lon: -20.3 },
  ],
  stationReturnTo: '/vedrid',
  routeSelectionContextKey: 'route-a',
}

function cardBelowMap(): HTMLElement {
  const mapWrapper = screen.getByTestId('drive-route-map').parentElement
  const card = mapWrapper?.nextElementSibling
  if (!(card instanceof HTMLElement)) throw new Error('Expected a point card below the map')
  return card
}

describe('DriveJourneyPanel point selection', () => {
  it('shows the temporary departure-forecast tuning notice', () => {
    render(<DriveJourneyPanel {...BASE_PROPS} layer={createLayer()} />)

    expect(screen.getByText('roadMapPrototypeDepartureForecastTuningNotice'))
      .toBeInTheDocument()
  })

  it('shows the first future slot without a special Now label', () => {
    render(<DriveJourneyPanel {...BASE_PROPS} layer={createLayer()} />)

    expect(screen.getByTestId('departure-heatmap')).toHaveAttribute('data-first-slot-label', '')
  })

  it('keeps departure and route-point filters independent in both directions', () => {
    const onSelectCandidateIdx = vi.fn()
    render(
      <DriveJourneyPanel
        {...BASE_PROPS}
        layer={createLayer({ calmWind: [6, 6], worstWind: [13, 13] })}
        onSelectCandidateIdx={onSelectCandidateIdx}
      />,
    )

    const departureFilters = screen.getByTestId('departure-heatmap')
    const routeFilters = screen.getByTestId('wind-status-filter-pills')
    const routeMap = screen.getByTestId('drive-route-map')

    expect(departureFilters).toHaveAttribute('data-visible-statuses', '')
    expect(routeFilters).toHaveAttribute('data-visible-statuses', '')
    expect(routeMap).toHaveAttribute(
      'data-station-colors',
      'calm:#2d5a27|worst:#f97316',
    )

    fireEvent.click(screen.getByTestId('route-filter-only-uncomfortable'))

    expect(routeFilters).toHaveAttribute('data-visible-statuses', 'othaegilegt')
    expect(departureFilters).toHaveAttribute('data-visible-statuses', '')
    expect(routeMap).toHaveAttribute('data-station-colors', 'worst:#f97316')
    expect(onSelectCandidateIdx).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('departure-filter-only-within-limits'))

    expect(departureFilters).toHaveAttribute('data-visible-statuses', 'innan-marka')
    expect(routeFilters).toHaveAttribute('data-visible-statuses', 'othaegilegt')
    expect(routeMap).toHaveAttribute('data-station-colors', 'worst:#f97316')

    fireEvent.click(screen.getByTestId('departure-filter-show-all'))

    expect(departureFilters).toHaveAttribute('data-visible-statuses', '')
    expect(routeFilters).toHaveAttribute('data-visible-statuses', 'othaegilegt')
    expect(routeMap).toHaveAttribute('data-station-colors', 'worst:#f97316')

    fireEvent.click(screen.getByTestId('route-filter-show-all'))

    expect(routeFilters).toHaveAttribute('data-visible-statuses', '')
    expect(departureFilters).toHaveAttribute('data-visible-statuses', '')
    expect(routeMap).toHaveAttribute(
      'data-station-colors',
      'calm:#2d5a27|worst:#f97316',
    )
  })

  it('keeps the route summary fail-closed when spatial coverage is incomplete', () => {
    render(
      <DriveJourneyPanel
        {...BASE_PROPS}
        layer={createLayer({ calmWind: [6, 6], worstWind: [6, 6] })}
        routeAssessmentStatus="no_data"
      />,
    )

    const compactSummary = screen.getAllByTestId('point-card')
      .find(card => card.getAttribute('data-variant') === 'compact')

    expect(compactSummary).toHaveAttribute('data-status', 'no_data')
    expect(screen.getByText('availableRouteForecastPointsDrawer')).toBeInTheDocument()
    expect(screen.queryByText('allRouteForecastPointsDrawer')).not.toBeInTheDocument()
  })

  it('keeps all matched route stations and the full route visible when legacy partial metadata arrives', () => {
    const layer = createLayer()
    layer.points.push({
      ...layer.points[0],
      routePointId: 'vedurstofan_unknown_fraction',
      stationId: 'unknown-fraction',
      stationName: 'Óstaðfest stöð',
      routeFraction: null,
      lat: 64.3,
      lon: -21.6,
    })

    render(
      <DriveJourneyPanel
        {...BASE_PROPS}
        layer={layer}
        assessmentCompleteness={{
          status: 'partial',
          reason: 'forecast_gap',
          assessedStartRouteFraction: 0,
          assessedEndRouteFraction: 0.6,
          assessedStartDistanceM: 0,
          assessedEndDistanceM: 60_000,
          assessedDistanceM: 60_000,
          unassessedBeforeM: 0,
          unassessedAfterM: 40_000,
          distanceConfidence: 'reference_route',
          forecast: {
            provider: 'metno',
            status: 'partial',
            requestedPointCount: 5,
            succeededPointCount: 4,
            failedPointCount: 1,
            assessedPointCount: 3,
            excludedSucceededPointCount: 1,
          },
        }}
        weatherCoverage={{
          status: 'partial',
          start: {
            kind: 'official_road_anchor',
            label: 'Garðabær',
            point: { lat: 64.08, lon: -21.9 },
            routeFraction: 0,
            distanceFromTripOriginM: 0,
            elapsedFromTripOriginS: 0,
          },
          end: {
            kind: 'official_road_anchor',
            label: 'Metinn endi',
            point: { lat: 64.4, lon: -21.5 },
            routeFraction: 0.6,
            distanceFromTripOriginM: 60_000,
            elapsedFromTripOriginS: 3_600,
          },
          coverageDistanceM: 60_000,
          coverageDurationS: 3_600,
          unassessedAfterM: 40_000,
          distanceConfidence: 'reference_route',
        }}
      />,
    )

    expect(screen.queryByText('partialAssessmentTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('partialAssessmentBody')).not.toBeInTheDocument()
    expect(screen.getByText('allRouteForecastPointsDrawer')).toBeInTheDocument()
    expect(screen.queryByText('availableRouteForecastPointsDrawer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'select Lygn stöð' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'select Vindasöm stöð' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'select Óstaðfest stöð' })).toBeInTheDocument()

    const map = screen.getByTestId('drive-route-map')
    expect(map).toHaveAttribute('data-primary-route-point-count', '3')
    expect(map).toHaveAttribute('data-route-styles', '')
    expect(screen.queryByText('partialAssessmentMapAssessedLegend')).not.toBeInTheDocument()
    expect(screen.queryByText('partialAssessmentMapUnassessedLegend')).not.toBeInTheDocument()
    expect(screen.queryByText('partialAssessmentMapEnd')).not.toBeInTheDocument()
  })

  it('does not expose engineering sampling diagnostics in the journey UI', () => {
    render(
      <DriveJourneyPanel
        {...BASE_PROPS}
        layer={createLayer()}
        samplingDiagnostics={{
          mode: 'distance_capped',
          rawRoutePointCount: 1_000,
          uniqueForecastPointCount: 300,
          selectedWeatherPointCount: 80,
          targetSpacingM: 10_000,
          cap: 120,
        }}
      />,
    )

    expect(screen.queryByText('sampledAssessmentTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('sampledAssessmentBody')).not.toBeInTheDocument()
  })

  it('uses canonical endpoint rows and labels instead of relabelling route stations', () => {
    render(
      <DriveJourneyPanel
        {...BASE_PROPS}
        layer={createLayer()}
        originName="Garðabær"
        destinationName="Akranes"
        endpointForecastRows={{
          originRows: [endpointForecastRow(3)],
          destinationRows: [endpointForecastRow(8)],
        }}
      />,
    )

    expect(screen.getByTestId('weather-watchers-comparison')).toHaveAttribute('data-origin-label', 'Garðabær')
    expect(screen.getByTestId('weather-watchers-comparison')).toHaveAttribute('data-destination-label', 'Akranes')
    expect(screen.getByTestId('weather-watchers-comparison')).toHaveAttribute('data-origin-wind', '3')
    expect(screen.getByTestId('weather-watchers-comparison')).toHaveAttribute('data-destination-wind', '8')
  })

  it('hides the endpoint comparison when deterministic endpoint rows are unavailable', () => {
    render(<DriveJourneyPanel {...BASE_PROPS} layer={createLayer()} endpointForecastRows={null} />)

    expect(screen.queryByTestId('weather-watchers-comparison')).not.toBeInTheDocument()
  })

  it('keeps deterministic endpoint comparison available without a station layer', () => {
    render(<DriveJourneyPanel {...BASE_PROPS} layer={null} />)

    expect(screen.getByTestId('weather-watchers-comparison')).toHaveAttribute('data-origin-label', 'Reykjavík')
    expect(screen.getByTestId('weather-watchers-comparison')).toHaveAttribute('data-destination-label', 'Borgarnes')
  })

  it('selects and shows the worst point below the map by default', () => {
    render(<DriveJourneyPanel {...BASE_PROPS} layer={createLayer()} />)

    expect(screen.getByTestId('drive-route-map')).toHaveAttribute('data-selected-station-id', 'worst')
    expect(cardBelowMap()).toHaveAttribute('data-station-id', 'worst')
    expect(cardBelowMap()).toHaveAttribute('data-panel-title', 'decisivePointLabel')
    expect(cardBelowMap()).toHaveAttribute('data-manual-selection', 'false')
  })

  it('replaces the worst-point card with a clicked point and can return to worst', () => {
    render(<DriveJourneyPanel {...BASE_PROPS} layer={createLayer()} />)

    fireEvent.click(screen.getByRole('button', { name: 'select Lygn stöð' }))

    expect(screen.getByTestId('drive-route-map')).toHaveAttribute('data-selected-station-id', 'calm')
    expect(cardBelowMap()).toHaveAttribute('data-station-id', 'calm')
    expect(cardBelowMap()).toHaveAttribute('data-panel-title', 'manualSelectedPointTitle')
    expect(cardBelowMap()).toHaveAttribute('data-manual-selection', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'showWorstPoint' }))

    expect(screen.getByTestId('drive-route-map')).toHaveAttribute('data-selected-station-id', 'worst')
    expect(cardBelowMap()).toHaveAttribute('data-station-id', 'worst')
    expect(cardBelowMap()).toHaveAttribute('data-panel-title', 'decisivePointLabel')
  })

  it('recalculates worst and does not revive manual selection after time or route round trips', () => {
    const layer = createLayer()
    const { rerender } = render(<DriveJourneyPanel {...BASE_PROPS} layer={layer} />)

    fireEvent.click(screen.getByRole('button', { name: 'select Lygn stöð' }))
    expect(cardBelowMap()).toHaveAttribute('data-station-id', 'calm')

    rerender(
      <DriveJourneyPanel
        {...BASE_PROPS}
        layer={layer}
        selectedCandidateIdx={1}
      />,
    )
    expect(cardBelowMap()).toHaveAttribute('data-station-id', 'calm')
    expect(cardBelowMap()).toHaveAttribute('data-panel-title', 'decisivePointLabel')
    expect(screen.getByTestId('drive-route-map')).toHaveAttribute('data-selected-station-id', 'calm')

    rerender(<DriveJourneyPanel {...BASE_PROPS} layer={layer} selectedCandidateIdx={0} />)
    expect(cardBelowMap()).toHaveAttribute('data-station-id', 'worst')
    expect(cardBelowMap()).toHaveAttribute('data-panel-title', 'decisivePointLabel')

    fireEvent.click(screen.getByRole('button', { name: 'select Lygn stöð' }))
    rerender(
      <DriveJourneyPanel
        {...BASE_PROPS}
        layer={createLayer({ calmWind: [16, 16], worstWind: [5, 5] })}
        selectedCandidateIdx={0}
        routeSelectionContextKey="route-b"
      />,
    )
    expect(cardBelowMap()).toHaveAttribute('data-station-id', 'calm')
    expect(cardBelowMap()).toHaveAttribute('data-panel-title', 'decisivePointLabel')

    rerender(<DriveJourneyPanel {...BASE_PROPS} layer={layer} selectedCandidateIdx={0} />)
    expect(cardBelowMap()).toHaveAttribute('data-station-id', 'worst')
    expect(cardBelowMap()).toHaveAttribute('data-panel-title', 'decisivePointLabel')
  })

  it('treats an empty status set as show-all after filters are restored', () => {
    render(<DriveJourneyPanel {...BASE_PROPS} layer={createLayer()} />)

    fireEvent.click(screen.getByTestId('route-filter-show-all'))

    expect(screen.getByRole('button', { name: 'select Lygn stöð' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'select Vindasöm stöð' })).toBeInTheDocument()
    expect(cardBelowMap()).toHaveAttribute('data-station-id', 'worst')
  })

  it('uses canonical amber and orange marker colors for near and uncomfortable wind', () => {
    render(
      <DriveJourneyPanel
        {...BASE_PROPS}
        layer={createLayer({ calmWind: [9, 9], worstWind: [13, 13] })}
      />,
    )

    expect(screen.getByTestId('drive-route-map')).toHaveAttribute(
      'data-station-colors',
      'calm:#f59e0b|worst:#f97316',
    )
  })
})
