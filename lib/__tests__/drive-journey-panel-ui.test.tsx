import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import type { ForecastDrawerRow, TravelCandidate } from '@/lib/weather/types'
import { resolveThresholds } from '@/lib/weather/thresholds'

type MockMapProps = {
  stations?: Array<{ id: string; name: string }>
  selectedStationId?: string | null
  onSelectStation?: (stationId: string) => void
}

type MockPointCardProps = {
  station: { stationId: string; stationName: string }
  panelTitle?: string
  isManualSelection?: boolean
}

type MockWeatherWatchersComparisonProps = {
  originLabel: string
  destinationLabel: string
  originRows: ForecastDrawerRow[]
  destinationRows: ForecastDrawerRow[]
}

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => Object.assign(
    (key: string) => key,
    { rich: (key: string) => key },
  ),
}))

vi.mock('@/components/weather/DepartureHeatmap', () => ({
  DepartureHeatmap: () => <div data-testid="departure-heatmap" />,
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
  WindStatusFilterPills: () => <div data-testid="wind-status-filter-pills" />,
}))

vi.mock('@/components/weather/VedurstofanPointCard', () => ({
  VedurstofanPointCard: ({ station, panelTitle, isManualSelection }: MockPointCardProps) => (
    <div
      data-testid="point-card"
      data-station-id={station.stationId}
      data-panel-title={panelTitle ?? ''}
      data-manual-selection={String(Boolean(isManualSelection))}
    >
      {station.stationName}
    </div>
  ),
}))

vi.mock('@/components/weather/DriveRouteMap', () => ({
  DriveRouteMap: ({ stations = [], selectedStationId, onSelectStation }: MockMapProps) => (
    <div data-testid="drive-route-map" data-selected-station-id={selectedStationId ?? ''}>
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
  selectedCandidateIdx: 0,
  onSelectCandidateIdx: vi.fn(),
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
})
