import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { driveRouteMapSpy } = vi.hoisted(() => ({ driveRouteMapSpy: vi.fn() }))

vi.mock('@/components/weather/DriveRouteMap', () => ({
  DriveRouteMap: (props: {
    onSelectRoute?: (routeId: string) => void
    annotations?: Array<{
      id: string
      kind: 'gravel' | 'weather_coverage_gap'
      point: { lat: number; lon: number }
      focusPoints: Array<{ lat: number; lon: number }>
      distanceKm: number
    }>
  }) => {
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
  ROUTE_MAP_LABEL_SCALE_STORAGE_KEY,
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
  window.localStorage.clear()
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

  it('draws verified road sections with non-colour line patterns and a text legend', () => {
    render(
      <RouteComparisonMiniMap
        ariaLabel="Leiðasamanburður"
        routes={[
          {
            id: 'teskeid',
            label: 'Teskeiðarleið',
            provider: 'teskeid',
            points: POINTS,
            selected: true,
            sectionOverlays: [{
              id: 'gravel-0',
              kind: 'gravel',
              label: 'Malarvegur',
              points: POINTS,
            }],
          },
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: false },
        ]}
      />,
    )

    expect(screen.getByText('Malarvegur')).toBeInTheDocument()
    expect(driveRouteMapSpy).toHaveBeenCalledWith(expect.objectContaining({
      annotations: [expect.objectContaining({
        id: 'teskeid:annotation:gravel-0',
      })],
      routes: expect.arrayContaining([
        expect.objectContaining({
          id: 'teskeid:section:gravel-0',
          selectRouteId: 'teskeid',
          dashArray: [1.2, 1.5],
        }),
      ]),
    }))
  })

  it('places persistent gravel markers at every geometry midpoint', () => {
    const longGravel = [
      { lat: 64, lon: -21.8 },
      { lat: 64, lon: -21.72 },
      { lat: 64, lon: -21.64 },
    ]
    const shortGravel = [
      { lat: 65.2, lon: -20.2 },
      { lat: 65.2, lon: -20.16 },
    ]
    render(
      <RouteComparisonMiniMap
        ariaLabel="Leiðasamanburður"
        routes={[
          {
            id: 'teskeid',
            label: 'Teskeiðarleið',
            provider: 'teskeid',
            points: POINTS,
            selected: true,
            sectionOverlays: [
              { id: 'long', kind: 'gravel', label: 'Malarvegur', points: longGravel },
              { id: 'short', kind: 'gravel', label: 'Malarvegur', points: shortGravel },
            ],
          },
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: false },
        ]}
      />,
    )

    const props = driveRouteMapSpy.mock.calls[driveRouteMapSpy.mock.calls.length - 1]?.[0] as {
      annotations?: Array<{
        id: string
        point: { lat: number; lon: number }
        focusPoints: Array<{ lat: number; lon: number }>
        distanceKm: number
      }>
    }
    expect(props.annotations).toHaveLength(2)
    const longMarker = props.annotations?.find(annotation => annotation.id.endsWith(':long'))
    const shortMarker = props.annotations?.find(annotation => annotation.id.endsWith(':short'))
    expect(longMarker?.distanceKm).toBeGreaterThan(7)
    expect(longMarker?.distanceKm).toBeLessThan(9)
    expect(longMarker?.point.lon).toBeCloseTo(-21.72, 2)
    expect(longMarker?.point).not.toEqual(longGravel[0])
    expect(longMarker?.point).not.toEqual(longGravel[longGravel.length - 1])
    expect(longMarker?.focusPoints).toEqual(longGravel)
    expect(shortMarker?.distanceKm).toBeGreaterThan(1)
  })

  it('draws limited-wind-data gaps with their exact distance and a distinct neutral pattern', () => {
    render(
      <RouteComparisonMiniMap
        ariaLabel="Leiðasamanburður"
        routes={[
          {
            id: 'teskeid',
            label: 'Teskeiðarleið',
            provider: 'teskeid',
            points: POINTS,
            selected: true,
            sectionOverlays: [{
              id: 'weather-coverage-gap-0',
              kind: 'weather_coverage_gap',
              label: 'Takmörkuð vindgögn',
              points: POINTS,
              distanceKm: 63.4,
            }],
          },
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: false },
        ]}
      />,
    )

    expect(screen.getByText('Takmörkuð vindgögn')).toBeInTheDocument()
    expect(driveRouteMapSpy).toHaveBeenCalledWith(expect.objectContaining({
      annotations: [expect.objectContaining({
        id: 'teskeid:annotation:weather-coverage-gap-0',
        kind: 'weather_coverage_gap',
        distanceKm: 63.4,
      })],
      routes: expect.arrayContaining([
        expect.objectContaining({
          id: 'teskeid:section:weather-coverage-gap-0',
          color: '#475569',
          dashArray: [0.5, 1.4],
        }),
      ]),
    }))
  })
})

describe('RouteComparisonFullscreenMap', () => {
  it('resizes map annotation text and restores the saved preference', async () => {
    const labels = {
      mapLabelScaleGroupLabel: 'Textastærð merkja á korti',
      mapLabelScaleDecreaseLabel: 'Minnka texta merkja á korti',
      mapLabelScaleResetLabel: 'Venjuleg textastærð merkja á korti',
      mapLabelScaleIncreaseLabel: 'Stækka texta merkja á korti',
    }
    const renderMap = () => render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði"
        cautionCloseLabel="Loka skýringu"
        closeLabel="Loka leiðakorti"
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
          label: 'Teskeiðarleið',
          provider: 'teskeid',
          points: POINTS,
          selected: true,
        }]}
        {...labels}
      />,
    )

    const first = renderMap()
    expect(screen.getByRole('group', { name: labels.mapLabelScaleGroupLabel })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: labels.mapLabelScaleIncreaseLabel }))

    expect(window.localStorage.getItem(ROUTE_MAP_LABEL_SCALE_STORAGE_KEY)).toBe('1.25')
    expect(driveRouteMapSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      annotationScale: 1.25,
    }))

    first.unmount()
    driveRouteMapSpy.mockClear()
    renderMap()
    await waitFor(() => {
      expect(driveRouteMapSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        annotationScale: 1.25,
      }))
    })
  })

  it('selects from both the map and cards and exposes one explicit apply action', () => {
    const onSelectRouteId = vi.fn()
    const onApply = vi.fn()
    const onClose = vi.fn()
    const { container } = render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði fyrir þessa leið"
        cautionCloseLabel="Loka skýringu"
        closeLabel="Loka leiðakorti"
        routeCountLabel="2 leiðir"
        sortLabel="Raða eftir"
        sortDefaultLabel="Sjálfgefið"
        sortDurationLabel="Aksturstíma"
        sortDistanceLabel="Vegalengd"
        sortWeatherLabel="Veðri núna"
        selectedRouteId="google"
        onSelectRouteId={onSelectRouteId}
        onClose={onClose}
        onApply={onApply}
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
    const applyAction = screen.getByRole('button', {
      name: 'Skoða veðurskilyrði fyrir þessa leið',
    })

    expect(dialog).toHaveAccessibleName('Veldu leið á korti')
    expect(scrollRegion).toHaveClass('overflow-y-auto')
    expect(scrollRegion).toContainElement(routeCards)
    expect(container.querySelector('[data-route-comparison-selected-details="true"]')).toBeNull()
    expect(scrollRegion).not.toContainElement(applyAction)
    expect(actionFooter).toContainElement(applyAction)
    expect(actionFooter).toHaveClass('shrink-0')
    expect(actionFooter).toHaveClass('pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]')
    expect(applyAction).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'select map route' }))
    fireEvent.click(screen.getByRole('button', { name: /Teskeiðarleið/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Skoða veðurskilyrði fyrir þessa leið' }))
    fireEvent.click(screen.getByRole('button', { name: 'Loka leiðakorti' }))

    expect(onSelectRouteId).toHaveBeenCalledWith('teskeid')
    expect(onApply).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    expect(driveRouteMapSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      onSelectRoute: expect.any(Function),
    }))
  })

  it('moves focus into the dialog, traps Tab, and restores the opener on unmount', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Opna leiðakort'
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði"
        cautionCloseLabel="Loka skýringu"
        closeLabel="Loka leiðakorti"
        routeCountLabel="1 leið"
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
        ]}
      />,
    )

    const close = screen.getByRole('button', { name: 'Loka leiðakorti' })
    const apply = screen.getByRole('button', { name: 'Skoða veðurskilyrði' })
    expect(close).toHaveFocus()

    apply.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(apply).toHaveFocus()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('disables the apply action while pending and keeps the supplied pending label', () => {
    const onApply = vi.fn()
    const onFindMore = vi.fn()
    const onSelectRouteId = vi.fn()
    const { container } = render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Reikna veðurskilyrði…"
        applyPending
        cautionCloseLabel="Loka skýringu"
        closeLabel="Loka leiðakorti"
        routeCountLabel="1 leið"
        findMoreLabel="Finna fleiri leiðir"
        sortLabel="Raða eftir"
        sortDefaultLabel="Sjálfgefið"
        sortDurationLabel="Aksturstíma"
        sortDistanceLabel="Vegalengd"
        sortWeatherLabel="Veðri núna"
        selectedRouteId="google"
        onSelectRouteId={onSelectRouteId}
        onClose={vi.fn()}
        onApply={onApply}
        onFindMore={onFindMore}
        routes={[
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: true },
        ]}
      />,
    )

    const applyAction = screen.getByRole('button', { name: 'Reikna veðurskilyrði…' })
    const findMoreAction = screen.getByRole('button', { name: 'Finna fleiri leiðir' })
    const sortAction = screen.getByRole('button', { name: 'Sjálfgefið' })
    const routeAction = screen.getByRole('button', { name: /Google-leið/ })
    const actionFooter = container.querySelector<HTMLElement>(
      '[data-route-comparison-action-footer="true"]',
    )

    expect(applyAction).toBeDisabled()
    expect(applyAction).toHaveAttribute('aria-busy', 'true')
    expect(findMoreAction).toBeDisabled()
    expect(sortAction).toBeDisabled()
    expect(routeAction).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'select map route' })).not.toBeInTheDocument()
    expect(actionFooter).toContainElement(applyAction)
    expect(actionFooter).toHaveClass('pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]')

    fireEvent.click(applyAction)
    fireEvent.click(findMoreAction)
    fireEvent.click(routeAction)
    expect(onApply).not.toHaveBeenCalled()
    expect(onFindMore).not.toHaveBeenCalled()
    expect(onSelectRouteId).not.toHaveBeenCalled()
  })

  it('smoothly brings a route card into view when its line is selected on the map', () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(
      <RouteComparisonFullscreenMap
        title="Veldu leið á korti"
        applyLabel="Skoða veðurskilyrði fyrir þessa leið"
        cautionCloseLabel="Loka skýringu"
        closeLabel="Loka leiðakorti"
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
        closeLabel="Loka leiðakorti"
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
        closeLabel="Loka leiðakorti"
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
        closeLabel="Loka leiðakorti"
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
        closeLabel="Loka leiðakorti"
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
