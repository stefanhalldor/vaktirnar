import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { driveRouteMapSpy } = vi.hoisted(() => ({ driveRouteMapSpy: vi.fn() }))

vi.mock('@/components/weather/DriveRouteMap', () => ({
  DriveRouteMap: (props: { onSelectRoute?: (routeId: string) => void }) => {
    driveRouteMapSpy(props)
    return (
      <div data-testid="drive-route-map">
        {props.onSelectRoute && (
          <button type="button" onClick={() => props.onSelectRoute?.('teskeid')}>select map route</button>
        )}
      </div>
    )
  },
}))

import {
  RouteComparisonMiniMap,
  RouteComparisonFullscreenMap,
  routeComparisonColor,
  selectBestWeatherRouteIds,
  sortRouteComparisonItems,
} from '@/components/weather/RouteComparisonMiniMap'

const POINTS = [
  { lat: 64.1, lon: -21.9 },
  { lat: 65.6, lon: -18.1 },
]

beforeEach(() => {
  driveRouteMapSpy.mockClear()
  window.requestAnimationFrame = callback => {
    callback(0)
    return 1
  }
})

describe('RouteComparisonMiniMap', () => {
  it('stays hidden until at least two drawable routes exist', () => {
    const { container } = render(
      <RouteComparisonMiniMap
        ariaLabel="Leiðasamanburður"
        routes={[{ id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: true }]}
      />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(driveRouteMapSpy).not.toHaveBeenCalled()
  })

  it('renders both providers through the shared map core with distinct side-by-side lines', () => {
    render(
      <RouteComparisonMiniMap
        ariaLabel="Leiðasamanburður"
        routes={[
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: true },
          { id: 'teskeid', label: 'Teskeiðarleið', provider: 'teskeid', points: POINTS, selected: false },
        ]}
      />,
    )

    expect(screen.getByTestId('drive-route-map')).toBeInTheDocument()
    expect(screen.getByText('Google-leið')).toBeInTheDocument()
    expect(screen.getByText('Teskeiðarleið')).toBeInTheDocument()
    expect(driveRouteMapSpy).toHaveBeenCalledWith(expect.objectContaining({
      ariaLabel: 'Leiðasamanburður',
      interactive: false,
      routes: [
        expect.objectContaining({ id: 'google', color: '#2563eb', offset: -1.5, width: 5 }),
        expect.objectContaining({ id: 'teskeid', color: '#ea580c', offset: 1.5, width: 4 }),
      ],
    }))
  })

  it('uses a high-contrast color sequence for adjacent alternatives', () => {
    expect(Array.from({ length: 6 }, (_, index) => routeComparisonColor(index))).toEqual([
      '#2563eb',
      '#ea580c',
      '#0f766e',
      '#c026d3',
      '#4d7c0f',
      '#be123c',
    ])
  })

  it('offers a visible compact-map expand action', () => {
    const onEnlarge = vi.fn()
    render(
      <RouteComparisonMiniMap
        ariaLabel="Leiðasamanburður"
        enlargeLabel="Stækka kort"
        onEnlarge={onEnlarge}
        routes={[
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: true },
          { id: 'teskeid', label: 'Teskeiðarleið', provider: 'teskeid', points: POINTS, selected: false },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stækka kort' }))
    expect(onEnlarge).toHaveBeenCalledOnce()
  })
})

describe('RouteComparisonFullscreenMap', () => {
  it('selects from both the map and cards and exposes one explicit apply action', () => {
    const onSelectRouteId = vi.fn()
    const onApply = vi.fn()
    const { container } = render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði fyrir þessa leið"
        cautionCloseLabel="Loka skýringu"
        routeCountLabel="2 leiðir"
        sortLabel="Raða eftir"
        sortDefaultLabel="Sjálfgefið"
        sortDurationLabel="Aksturstíma"
        sortDistanceLabel="Vegalengd"
        sortWeatherLabel="Veðri núna"
        selectedRouteId="google"
        onSelectRouteId={onSelectRouteId}
        onClose={vi.fn()}
        onApply={onApply}
        selectedRouteDetails={<p>Staðfest mörk veðurmats</p>}
        routes={[
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: true },
          { id: 'teskeid', label: 'Teskeiðarleið', provider: 'teskeid', points: POINTS, selected: false },
        ]}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Veldu leið á korti' })
    const scrollRegion = container.querySelector<HTMLElement>(
      '[data-route-comparison-scroll-region="true"]',
    )
    const actionFooter = container.querySelector<HTMLElement>(
      '[data-route-comparison-action-footer="true"]',
    )
    const routeCards = container.querySelector<HTMLElement>(
      '[data-route-comparison-cards="true"]',
    )
    const selectedRouteDetails = container.querySelector<HTMLElement>(
      '[data-route-comparison-selected-details="true"]',
    )
    const applyAction = screen.getByRole('button', {
      name: 'Skoða veðurskilyrði fyrir þessa leið',
    })

    expect(dialog).toHaveAccessibleName('Veldu leið á korti')
    expect(screen.getByText('Staðfest mörk veðurmats')).toBeInTheDocument()
    expect(scrollRegion).toHaveClass('overflow-y-auto')
    expect(scrollRegion).toContainElement(routeCards)
    expect(scrollRegion).toContainElement(selectedRouteDetails)
    expect(routeCards?.compareDocumentPosition(selectedRouteDetails!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(scrollRegion).not.toContainElement(applyAction)
    expect(actionFooter).toContainElement(applyAction)
    expect(actionFooter).toHaveClass('shrink-0')
    expect(actionFooter).toHaveClass('pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]')
    expect(applyAction).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'select map route' }))
    fireEvent.click(screen.getByRole('button', { name: /Teskeiðarleið/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Skoða veðurskilyrði fyrir þessa leið' }))

    expect(onSelectRouteId).toHaveBeenCalledWith('teskeid')
    expect(onApply).toHaveBeenCalledOnce()
    expect(driveRouteMapSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      onSelectRoute: expect.any(Function),
    }))
  })

  it('smoothly brings a route card into view when its line is selected on the map', () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði fyrir þessa leið"
        cautionCloseLabel="Loka skýringu"
        routeCountLabel="2 leiðir"
        sortLabel="Raða eftir"
        sortDefaultLabel="Sjálfgefið"
        sortDurationLabel="Aksturstíma"
        sortDistanceLabel="Vegalengd"
        sortWeatherLabel="Veðri núna"
        selectedRouteId="google"
        onSelectRouteId={vi.fn()}
        onClose={vi.fn()}
        onApply={vi.fn()}
        routes={[
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: true },
          { id: 'teskeid', label: 'Teskeiðarleið', provider: 'teskeid', points: POINTS, selected: false },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'select map route' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  })

  it('shows route cautions, surface facts, and a manual Teskeið alternatives action', () => {
    const onFindMore = vi.fn()
    render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði fyrir þessa leið"
        cautionCloseLabel="Loka skýringu"
        routeCountLabel="2 leiðir"
        sortLabel="Raða eftir"
        sortDefaultLabel="Sjálfgefið"
        sortDurationLabel="Aksturstíma"
        sortDistanceLabel="Vegalengd"
        sortWeatherLabel="Veðri núna"
        findMoreLabel="Finna fleiri Teskeiðarleiðir"
        findingMoreLabel="Leita að fleiri Teskeiðarleiðum…"
        alternativesStatus="idle"
        selectedRouteId="teskeid"
        onSelectRouteId={vi.fn()}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onFindMore={onFindMore}
        routes={[
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: false },
          {
            id: 'teskeid',
            label: 'Teskeiðarleið',
            provider: 'teskeid',
            points: POINTS,
            selected: true,
            badges: [{ label: 'Varasöm leið', tone: 'warning' }],
            cautionDrawerLabel: 'Af hverju er leiðin merkt varasöm?',
            cautionVehicleNote: 'Þessi viðvörun á við bíla með eftirvagna.',
            cautionDetails: [{ id: 'oxi', text: 'Öxi er brattur og hlykkjóttur fjallvegur.' }],
            facts: ['146 km bundið · 8,7 km möl · 27,1 km óvíst'],
          },
        ]}
      />,
    )

    expect(screen.getByText('Varasöm leið')).toBeInTheDocument()
    expect(screen.getByText('146 km bundið · 8,7 km möl · 27,1 km óvíst')).toBeInTheDocument()
    const cautionTrigger = screen.getByRole('button', { name: 'Af hverju er leiðin merkt varasöm?' })
    expect(screen.queryByRole('dialog', { name: 'Af hverju er leiðin merkt varasöm?' })).not.toBeInTheDocument()
    fireEvent.click(cautionTrigger)
    const cautionDrawer = screen.getByRole('dialog', { name: 'Af hverju er leiðin merkt varasöm?' })
    expect(cautionDrawer).toHaveTextContent('Þessi viðvörun á við bíla með eftirvagna.')
    expect(cautionDrawer).toHaveTextContent('Öxi er brattur og hlykkjóttur fjallvegur.')
    expect(screen.getByRole('button', { name: 'Loka skýringu' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Loka skýringu' }))
    expect(screen.queryByRole('dialog', { name: 'Af hverju er leiðin merkt varasöm?' })).not.toBeInTheDocument()
    expect(cautionTrigger).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Finna fleiri Teskeiðarleiðir' }))
    expect(onFindMore).toHaveBeenCalledOnce()
  })

  it('turns the alternatives action into compact completed feedback after routes are found', () => {
    const onFindMore = vi.fn()
    render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði fyrir þessa leið"
        cautionCloseLabel="Loka skýringu"
        routeCountLabel="3 leiðir"
        sortLabel="Raða eftir"
        sortDefaultLabel="Sjálfgefið"
        sortDurationLabel="Aksturstíma"
        sortDistanceLabel="Vegalengd"
        sortWeatherLabel="Veðri núna"
        findMoreLabel="Finna fleiri Teskeiðarleiðir"
        findingMoreLabel="Leita að fleiri Teskeiðarleiðum…"
        findMoreCompleteLabel="Leit að fleiri leiðum lokið"
        alternativesStatus="ready"
        selectedRouteId="teskeid"
        onSelectRouteId={vi.fn()}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onFindMore={onFindMore}
        routes={[
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: false },
          { id: 'teskeid', label: 'Teskeiðarleið', provider: 'teskeid', points: POINTS, selected: true },
        ]}
      />,
    )

    const completed = screen.getByRole('button', { name: 'Leit að fleiri leiðum lokið' })
    expect(completed).toBeDisabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(completed)
    expect(onFindMore).not.toHaveBeenCalled()
  })

  it('sorts compact cards by duration and current-weather score without changing their route identity', () => {
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
    render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði fyrir þessa leið"
        cautionCloseLabel="Loka skýringu"
        routeCountLabel="3 leiðir"
        sortLabel="Raða eftir"
        sortDefaultLabel="Sjálfgefið"
        sortDurationLabel="Aksturstíma"
        sortDistanceLabel="Vegalengd"
        sortWeatherLabel="Veðri núna"
        selectedRouteId="route-b"
        onSelectRouteId={vi.fn()}
        onClose={vi.fn()}
        onApply={vi.fn()}
        routes={[
          { id: 'route-a', label: 'Leið A', provider: 'google', points: POINTS, selected: false, originalIndex: 0, durationMinutes: 120, distanceKm: 80, weatherScore: 3 },
          { id: 'route-b', label: 'Leið B', provider: 'teskeid', points: POINTS, selected: true, originalIndex: 1, durationMinutes: 90, distanceKm: 110, weatherScore: 5 },
          { id: 'route-c', label: 'Leið C', provider: 'teskeid', points: POINTS, selected: false, originalIndex: 2, durationMinutes: 110, distanceKm: 95, weatherScore: 1 },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Aksturstíma' }))
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
    let cards = screen.getAllByRole('button', { name: /Leið [ABC]/ })
    expect(cards.map(card => card.textContent)).toEqual(['Leið B', 'Leið C', 'Leið A'])

    fireEvent.click(screen.getByRole('button', { name: 'Veðri núna' }))
    cards = screen.getAllByRole('button', { name: /Leið [ABC]/ })
    expect(cards.map(card => card.textContent)).toEqual(['Leið C', 'Leið A', 'Leið B'])
    expect(screen.getByRole('button', { name: 'Leið B' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Vegalengd' }))
    cards = screen.getAllByRole('button', { name: /Leið [ABC]/ })
    expect(cards.map(card => card.textContent)).toEqual(['Leið A', 'Leið C', 'Leið B'])
  })
})

describe('sortRouteComparisonItems', () => {
  const routes = [
    { id: 'a', label: 'A', provider: 'google' as const, points: POINTS, selected: false, originalIndex: 0, durationMinutes: 120, distanceKm: 80, weatherScore: 3 },
    { id: 'b', label: 'B', provider: 'teskeid' as const, points: POINTS, selected: true, originalIndex: 1, durationMinutes: 90, distanceKm: 110, weatherScore: 5 },
    { id: 'c', label: 'C', provider: 'teskeid' as const, points: POINTS, selected: false, originalIndex: 2, durationMinutes: 110, distanceKm: 95, weatherScore: 1 },
  ]

  it('uses stable deterministic ordering for every mode', () => {
    expect(sortRouteComparisonItems(routes, 'default').map(route => route.id)).toEqual(['b', 'c', 'a'])
    expect(sortRouteComparisonItems(routes, 'duration').map(route => route.id)).toEqual(['b', 'c', 'a'])
    expect(sortRouteComparisonItems(routes, 'distance').map(route => route.id)).toEqual(['a', 'c', 'b'])
    expect(sortRouteComparisonItems(routes, 'weather').map(route => route.id)).toEqual(['c', 'a', 'b'])
  })

  it('puts routes with limited or missing station coverage last in weather ordering', () => {
    const weatherRoutes = [
      { ...routes[0], id: 'measured-windy', weatherScore: 4 },
      { ...routes[0], id: 'limited-calm', weatherScore: 0, weatherCoverageConcern: true },
      { ...routes[0], id: 'no-stations', weatherScore: null, weatherCoverageConcern: true },
      { ...routes[0], id: 'measured-calm', weatherScore: 1 },
    ]

    expect(sortRouteComparisonItems(weatherRoutes, 'weather').map(route => route.id))
      .toEqual(['measured-calm', 'measured-windy', 'limited-calm', 'no-stations'])
  })

  it('puts Google last, then prioritizes surface confidence, weather evidence, cautions, and F-roads within Teskeið routes', () => {
    const priorityRoutes = [
      { ...routes[1], id: 'unknown-long', originalIndex: 0, mountainRoad: false, caution: false, gravelKm: 7.5, unknownSurfaceKm: 69 },
      { ...routes[1], id: 'unknown-short', originalIndex: 0, mountainRoad: false, caution: false, gravelKm: 21.3, unknownSurfaceKm: 14.7 },
      { ...routes[1], id: 'mountain', originalIndex: 0, mountainRoad: true, caution: false, gravelKm: 0 },
      { ...routes[1], id: 'caution', originalIndex: 1, mountainRoad: false, caution: true, gravelKm: 0 },
      { ...routes[1], id: 'weather-uncertain', originalIndex: 1, mountainRoad: false, caution: false, weatherCoverageConcern: true, gravelKm: 0 },
      { ...routes[1], id: 'gravel', originalIndex: 2, mountainRoad: false, caution: false, gravelKm: 12 },
      { ...routes[1], id: 'paved', originalIndex: 3, mountainRoad: false, caution: false, gravelKm: 0 },
      { ...routes[0], id: 'google-unlabelled', originalIndex: 0 },
    ]

    expect(sortRouteComparisonItems(priorityRoutes, 'default').map(route => route.id))
      .toEqual(['paved', 'gravel', 'weather-uncertain', 'caution', 'mountain', 'unknown-short', 'unknown-long', 'google-unlabelled'])
  })

  it('shows the Teskeið work-in-progress notice inside its route card', () => {
    render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði fyrir þessa leið"
        cautionCloseLabel="Loka skýringu"
        routeCountLabel="1 leið"
        sortLabel="Raða eftir"
        sortDefaultLabel="Sjálfgefið"
        sortDurationLabel="Aksturstíma"
        sortDistanceLabel="Vegalengd"
        sortWeatherLabel="Veðri núna"
        selectedRouteId="teskeid"
        onSelectRouteId={vi.fn()}
        onClose={vi.fn()}
        onApply={vi.fn()}
        routes={[{
          id: 'teskeid',
          label: 'Malarleið',
          provider: 'teskeid',
          points: POINTS,
          selected: true,
          notice: 'Teskeiðarleiðarkerfið er í vinnslu',
          badges: [{ label: '69 km óstaðfest slitlag', tone: 'warning' }],
        }]}
      />,
    )

    const card = screen.getByRole('button', { name: /Malarleið/ })
    expect(card).toHaveTextContent('Teskeiðarleiðarkerfið er í vinnslu')
    expect(card).toHaveTextContent('69 km óstaðfest slitlag')
  })
})

describe('selectBestWeatherRouteIds', () => {
  it('selects only the first minimum-score route when tied routes use different stations', () => {
    expect([...selectBestWeatherRouteIds([
      { routeId: 'route-1', score: 0, stationIds: ['A', 'B'] },
      { routeId: 'route-2', score: 0, stationIds: ['A', 'C'] },
    ])]).toEqual(['route-1'])
  })

  it('shares the badge when tied routes use the exact same station set', () => {
    expect([...selectBestWeatherRouteIds([
      { routeId: 'route-1', score: 0, stationIds: ['A', 'B'] },
      { routeId: 'route-2', score: 0, stationIds: ['B', 'A', 'A'] },
    ])]).toEqual(['route-1', 'route-2'])
  })

  it('does not share the badge with an identical station set when the score is worse', () => {
    expect([...selectBestWeatherRouteIds([
      { routeId: 'route-1', score: 0, stationIds: ['A', 'B'] },
      { routeId: 'route-2', score: 1, stationIds: ['A', 'B'] },
    ])]).toEqual(['route-1'])
  })
})
