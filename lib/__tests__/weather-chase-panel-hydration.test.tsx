import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/weather/PlaceSearch', () => ({
  PlaceSearch: ({ onPlaceSelected }: {
    onPlaceSelected: (place: { name: string; lat: number; lon: number }) => void
  }) => (
    <button
      type="button"
      onClick={() => onPlaceSelected({ name: 'Víðibakki', lat: 63.90234, lon: -20.41234 })}
    >
      Velja stað úr leit
    </button>
  ),
}))

vi.mock('@/components/weather/ProviderStationContextMap', () => ({
  ProviderStationContextMap: ({ related, selected, onSelect }: {
    related: Array<{ id: string; providerId: string; markerLabel?: string }>
    selected?: { markerId: string } | null
    onSelect?: (selected: { layerId: string; markerId: string }) => void
  }) => (
    <div data-testid="provider-context-map" data-selected-marker={selected?.markerId ?? ''}>
      {related.map(marker => (
        <button
          key={marker.id}
          type="button"
          onClick={() => onSelect?.({
            layerId: `${marker.providerId}-nearby`,
            markerId: marker.id,
          })}
        >
          Kortapunktur {marker.markerLabel}
        </button>
      ))}
    </div>
  ),
}))

import {
  addCustomMetnoPreferenceItem,
  customMetnoPreferenceItemFromPlace,
  WeatherChasePanel,
  type WeatherChaseItem,
  type WeatherChasePreferenceItem,
} from '@/components/weather/WeatherChasePanel'
import { nearestWeatherChaseContextItems } from '@/components/weather/WeatherChasePlaceFlow'

const labels = new Proxy({}, {
  get: (_target, property) => String(property),
}) as ComponentProps<typeof WeatherChasePanel>['labels']

const labelsWith = (overrides: Record<string, unknown>) => new Proxy(overrides, {
  get: (target, property) => (
    Reflect.has(target, property)
      ? Reflect.get(target, property)
      : String(property)
  ),
}) as ComponentProps<typeof WeatherChasePanel>['labels']

const items: WeatherChaseItem[] = [
  {
    id: 'vedurstofan:1',
    label: 'Valin stöð',
    providerId: 'vedurstofan',
    providerLabel: 'Veðurstofa Íslands',
    sourceLabel: 'Veðurstofa Íslands',
    rows: [],
    lat: 64.1,
    lon: -21.9,
  },
  {
    id: 'vedurstofan:2',
    label: 'Önnur stöð',
    providerId: 'vedurstofan',
    providerLabel: 'Veðurstofa Íslands',
    sourceLabel: 'Veðurstofa Íslands',
    rows: [],
    lat: 65.1,
    lon: -18.1,
  },
]

describe('WeatherChasePanel preference hydration', () => {
  it('sorts and caps nearby provider context independently at three items', () => {
    const providerItems: WeatherChaseItem[] = [
      ...Array.from({ length: 4 }, (_, index): WeatherChaseItem => ({
        id: `vedurstofan:${index}`,
        label: `Veðurstofa ${index}`,
        providerId: 'vedurstofan',
        providerLabel: 'Veðurstofa Íslands',
        rows: index === 3 ? [] : [{} as never],
        lat: 64 + index * 0.1,
        lon: -21,
      })),
      ...Array.from({ length: 4 }, (_, index): WeatherChaseItem => ({
        id: `metno:canonical-${index}`,
        label: `Yr ${index}`,
        providerId: 'metno',
        providerLabel: 'Yr / met.no',
        rows: [],
        lat: 64 + index * 0.1,
        lon: -20,
      })),
      {
        id: 'metno:custom:64.000:-20.000',
        label: 'Eigin punktur',
        providerId: 'metno',
        providerLabel: 'Yr / met.no',
        rows: [],
        lat: 64,
        lon: -20,
      },
    ]

    const reference = { lat: 64, lon: -21, name: 'Valinn staður' } as never
    const vedurstofan = nearestWeatherChaseContextItems(reference, providerItems, 'vedurstofan')
    const metno = nearestWeatherChaseContextItems(reference, providerItems, 'metno')

    expect(vedurstofan.map(item => item.id)).toEqual([
      'vedurstofan:0',
      'vedurstofan:1',
      'vedurstofan:2',
    ])
    expect(metno).toHaveLength(3)
    expect(metno.map(item => item.id)).not.toContain('metno:custom:64.000:-20.000')
  })

  it('creates and selects a stable custom Yr point from canonical place search', () => {
    const onAddCustomMetnoPlace = vi.fn()
    render(
      <WeatherChasePanel
        items={items}
        initialSelectedIds={[items[0].id]}
        labels={labelsWith({
          addCustomMetnoLabel: 'Bæta við spástöð',
          placeFlow: {
            chooseTitle: 'Veldu stað',
            chooseHint: 'Leitaðu að stað.',
            searchPlaceholder: 'Leita',
            confirmTitle: 'Spástöðvar nálægt staðnum',
            selectedPointLabel: 'Valinn Yr spápunktur',
            nearbyTitle: 'Nálægt',
            distanceLabel: 'Fjarlægð',
            noVedurstofanLabel: 'Engar stöðvar',
            backLabel: 'Velja annan stað',
            cancelLabel: 'Hætta við',
            saveLabel: 'Vista sem eigin Yr spápunkt',
            mapLoadingLabel: 'Hleð korti',
            mapErrorLabel: 'Kortvilla',
            metnoProviderLabel: 'Yr / met.no',
            addNearbyPrompt: (place: string) => `Viltu bæta ${place} við þínar veðurstöðvar?`,
            addNearbyCancelLabel: 'Hætta við',
            addNearbyConfirmLabel: 'Bæta við',
          },
        })}
        locale="is"
        defaultSettingsOpen
        onAddCustomMetnoPlace={onAddCustomMetnoPlace}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við spástöð' }))
    expect(screen.getByText('Veldu stað')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Velja stað úr leit' }))
    expect(onAddCustomMetnoPlace).not.toHaveBeenCalled()
    expect(screen.getByTestId('provider-context-map')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vista sem eigin Yr spápunkt' }))

    expect(onAddCustomMetnoPlace).toHaveBeenCalledWith({
      id: 'metno:custom:63.902:-20.412',
      providerId: 'metno',
      label: 'Víðibakki',
      lat: 63.902,
      lon: -20.412,
    })
    expect(customMetnoPreferenceItemFromPlace({
      name: '  Bærinn  ',
      lat: 64.10049,
      lon: -21.90049,
    })).toMatchObject({
      id: 'metno:custom:64.100:-21.900',
      label: 'Bærinn',
    })
  })

  it('shows ten numbered nearby points and lets the list select the matching map marker', () => {
    const nearbyItems = Array.from({ length: 12 }, (_, index): WeatherChaseItem => ({
      id: `metno:nearby-${index}`,
      label: `Yr punktur ${index + 1}`,
      providerId: 'metno',
      providerLabel: 'Yr / met.no',
      rows: [],
      lat: 63.90234 + index * 0.01,
      lon: -20.41234,
    }))

    render(
      <WeatherChasePanel
        items={nearbyItems}
        initialSelectedIds={[]}
        labels={labelsWith({
          addCustomMetnoLabel: 'Bæta við spástöð',
          placeFlow: {
            chooseTitle: 'Veldu stað',
            chooseHint: 'Leitaðu að stað.',
            searchPlaceholder: 'Leita',
            confirmTitle: 'Spástöðvar nálægt staðnum',
            selectedPointLabel: 'Valinn Yr spápunktur',
            nearbyTitle: 'Nálægt',
            distanceLabel: 'Fjarlægð',
            noVedurstofanLabel: 'Engar stöðvar',
            backLabel: 'Velja annan stað',
            cancelLabel: 'Hætta við',
            saveLabel: 'Vista sem eigin Yr spápunkt',
            mapLoadingLabel: 'Hleð korti',
            mapErrorLabel: 'Kortvilla',
            metnoProviderLabel: 'Yr / met.no',
            addNearbyPrompt: (place: string) => `Viltu bæta ${place} við þínar veðurstöðvar?`,
            addNearbyCancelLabel: 'Hætta við',
            addNearbyConfirmLabel: 'Bæta við',
          },
        })}
        locale="is"
        defaultSettingsOpen
        onAddCustomMetnoPlace={vi.fn()}
        onSelectedItemsChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við spástöð' }))
    fireEvent.click(screen.getByRole('button', { name: 'Velja stað úr leit' }))

    const nearbyList = screen.getByTestId('nearby-weather-points')
    const listButtons = within(nearbyList).getAllByRole('button', { name: /Yr punktur \d+/ })
    expect(listButtons).toHaveLength(10)
    expect(within(listButtons[0]).getByText('1')).toBeInTheDocument()
    expect(within(listButtons[9]).getByText('10')).toBeInTheDocument()

    fireEvent.click(listButtons[4])
    expect(listButtons[4]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Viltu bæta Yr punktur 5 við þínar veðurstöðvar?',
    )
    expect(screen.getByTestId('provider-context-map')).toHaveAttribute(
      'data-selected-marker',
      'metno:nearby-4',
    )

    const map = screen.getByTestId('provider-context-map')
    const save = screen.getByRole('button', { name: 'Vista sem eigin Yr spápunkt' })
    expect(map.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('adds the confirmed nearby station to the selected weather stations', async () => {
    const onSelectedItemsChange = vi.fn()
    const nearby = {
      id: 'metno:husavik',
      label: 'Húsavík',
      providerId: 'metno' as const,
      providerLabel: 'Yr / met.no',
      rows: [],
      lat: 66.0449,
      lon: -17.3389,
    }
    render(
      <WeatherChasePanel
        items={[nearby]}
        initialSelectedIds={[]}
        labels={labelsWith({
          addCustomMetnoLabel: 'Bæta við spástöð',
          placeFlow: {
            chooseTitle: 'Veldu stað', chooseHint: 'Leitaðu.', searchPlaceholder: 'Leita',
            confirmTitle: 'Nálægt', selectedPointLabel: 'Valinn punktur', nearbyTitle: 'Nálægt',
            distanceLabel: 'Fjarlægð', noVedurstofanLabel: 'Engar stöðvar',
            backLabel: 'Til baka', cancelLabel: 'Hætta við',
            saveLabel: 'Vista sem eigin Yr spápunkt', mapLoadingLabel: 'Hleð',
            mapErrorLabel: 'Villa', metnoProviderLabel: 'Yr / met.no',
            addNearbyPrompt: (place: string) => `Viltu bæta ${place} við þínar veðurstöðvar?`,
            addNearbyCancelLabel: 'Hætta við', addNearbyConfirmLabel: 'Bæta við',
          },
        })}
        locale="is"
        defaultSettingsOpen
        onAddCustomMetnoPlace={vi.fn()}
        onSelectedItemsChange={onSelectedItemsChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við spástöð' }))
    fireEvent.click(screen.getByRole('button', { name: 'Velja stað úr leit' }))
    fireEvent.click(within(screen.getByTestId('nearby-weather-points')).getByRole('button', { name: /Húsavík/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við' }))

    await waitFor(() => expect(onSelectedItemsChange).toHaveBeenLastCalledWith([nearby]))
    expect(screen.queryByText('Viltu bæta Húsavík við þínar veðurstöðvar?')).not.toBeInTheDocument()
  })

  it('keeps a newly created Yr point inside the seven visible autosave slots', () => {
    const existing = Array.from({ length: 7 }, (_, index): WeatherChasePreferenceItem => ({
      id: `metno:existing:${index}`,
      providerId: 'metno',
      label: `Existing ${index}`,
    }))
    const custom = customMetnoPreferenceItemFromPlace(
      { name: 'Bærinn', lat: 64.1234, lon: -21.9876 },
      'Heimaspá',
    )

    const next = addCustomMetnoPreferenceItem(existing, custom)

    expect(next).toHaveLength(7)
    expect(next[0]).toEqual(custom)
    expect(next.map(item => item.id)).not.toContain('metno:existing:6')
  })

  it('shows authenticated autosave failures with a retry instead of a save-places button', () => {
    const onRetrySave = vi.fn()
    render(
      <WeatherChasePanel
        items={items}
        initialSelectedIds={[items[0].id]}
        labels={labelsWith({
          autoSaveFailedLabel: 'Tókst ekki að vista breytingarnar sjálfkrafa.',
          autoSaveRetryLabel: 'Reyna aftur',
        })}
        locale="is"
        defaultSettingsOpen
        saveStatus="error"
        onRetrySave={onRetrySave}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tókst ekki að vista breytingarnar sjálfkrafa.',
    )
    expect(screen.queryByRole('button', { name: 'savePlacesLabel' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reyna aftur' }))
    expect(onRetrySave).toHaveBeenCalledTimes(1)
  })

  it('labels missing past and future values explicitly', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterdayDate = new Date(`${today}T00:00:00.000Z`)
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
    const yesterday = yesterdayDate.toISOString().slice(0, 10)
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    const anchorItem: WeatherChaseItem = {
      ...items[0],
      rows: [{
        timeIso: `${tomorrow}T00:00:00.000Z`,
        status: 'graent',
        temperature: { value: 15, direction: 'none', tone: 'neutral' },
        wind: { value: 4, direction: 'none', tone: 'neutral' },
        gust: { value: 4, direction: 'none', tone: 'neutral', severity: 'none' },
        precipitation: { value: 0, direction: 'none', tone: 'neutral' },
      }],
    }
    const missingItem = { ...items[1], rows: [] }
    const onLoadHistoryDay = vi.fn(async (day: string) => ({
      requestedDay: day,
      availableFromDay: yesterday,
      availableToDay: tomorrow,
      rowsByItemId: { [anchorItem.id]: [], [missingItem.id]: [] },
    }))

    render(
      <WeatherChasePanel
        items={[anchorItem, missingItem]}
        initialSelectedIds={[anchorItem.id, missingItem.id]}
        labels={labelsWith({
          missingHistoryValue: 'Sögugildi vantar',
          missingForecastValue: 'Spá vantar',
        })}
        locale="is"
        onLoadHistoryDay={onLoadHistoryDay}
        visibleHours={[0]}
      />,
    )

    expect(await screen.findAllByText('Sögugildi vantar')).not.toHaveLength(0)
    expect(screen.getAllByText('Spá vantar')).not.toHaveLength(0)
  })

  it('uses the custom-point history explanation only for custom points', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    const row = {
      timeIso: `${tomorrow}T00:00:00.000Z`,
      status: 'graent' as const,
      temperature: { value: 10, direction: 'none' as const, tone: 'neutral' as const },
      wind: { value: 3, direction: 'none' as const, tone: 'neutral' as const },
      gust: { value: 3, direction: 'none' as const, tone: 'neutral' as const, severity: 'none' as const },
      precipitation: { value: 0, direction: 'none' as const, tone: 'neutral' as const },
    }
    const custom: WeatherChaseItem = {
      id: 'metno:custom:64.100:-21.900',
      label: 'Eigin punktur',
      providerId: 'metno',
      providerLabel: 'Yr / met.no',
      rows: [row],
      lat: 64.1,
      lon: -21.9,
      supportsHistory: false,
    }
    render(
      <WeatherChasePanel
        items={[custom]}
        initialSelectedIds={[custom.id]}
        labels={labelsWith({
          missingHistoryValue: 'Sögugildi vantar',
          customHistoryUnavailable: 'Sögugildi ekki í boði fyrir eigin spápunkta',
          missingForecastValue: 'Spá vantar',
        })}
        locale="is"
        visibleHours={[0]}
      />,
    )

    expect(screen.getAllByText('Sögugildi ekki í boði fyrir eigin spápunkta')).not.toHaveLength(0)
    expect(screen.queryByText('Sögugildi vantar')).not.toBeInTheDocument()
  })

  it('adds a passed selected hour for today instead of starting tomorrow', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    const item: WeatherChaseItem = {
      ...items[0],
      rows: [{
        timeIso: `${tomorrow}T12:00:00.000Z`,
        status: 'graent',
        temperature: { value: 15, direction: 'none', tone: 'neutral' },
        wind: { value: 4, direction: 'none', tone: 'neutral' },
        gust: { value: 4, direction: 'none', tone: 'neutral', severity: 'none' },
        precipitation: { value: 0, direction: 'none', tone: 'neutral' },
      }],
    }
    const onLoadHistoryDay = vi.fn().mockResolvedValue({
      requestedDay: today,
      availableFromDay: today,
      availableToDay: tomorrow,
      rowsByItemId: {
        [item.id]: [{
          ...item.rows[0],
          timeIso: `${today}T12:00:00.000Z`,
          temperature: { value: 12, direction: 'none', tone: 'neutral' },
        }],
      },
    })

    render(
      <WeatherChasePanel
        items={[item]}
        initialSelectedIds={[item.id]}
        labels={labels}
        locale="is"
        onLoadHistoryDay={onLoadHistoryDay}
        visibleHours={[12]}
      />,
    )

    await waitFor(() => expect(onLoadHistoryDay).toHaveBeenCalledWith(today, expect.any(Array)))
    expect(await screen.findByText('12temperatureUnit')).toBeInTheDocument()
    expect(screen.getByText('15temperatureUnit')).toBeInTheDocument()
  })

  it('shows today through the last day that has forecast data', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    const item: WeatherChaseItem = {
      ...items[0],
      rows: [{
        timeIso: `${tomorrow}T12:00:00.000Z`,
        status: 'graent',
        temperature: { value: 15, direction: 'none', tone: 'neutral' },
        wind: { value: 4, direction: 'none', tone: 'neutral' },
        gust: { value: 4, direction: 'none', tone: 'neutral', severity: 'none' },
        precipitation: { value: 0, direction: 'none', tone: 'neutral' },
      }],
    }
    const onLoadHistoryDay = vi.fn().mockResolvedValue({
      requestedDay: today,
      availableFromDay: today,
      availableToDay: tomorrow,
      rowsByItemId: { [item.id]: [] },
    })

    render(
      <WeatherChasePanel
        items={[item]}
        initialSelectedIds={[item.id]}
        labels={labels}
        locale="is"
        onLoadHistoryDay={onLoadHistoryDay}
        visibleHours={[12]}
      />,
    )

    await waitFor(() => expect(onLoadHistoryDay).toHaveBeenCalled())
    expect(screen.getAllByText(/kl\. 12:00/)).toHaveLength(2)
    expect(screen.getByText('15temperatureUnit')).toBeInTheDocument()
  })

  it('refreshes and replaces cached history when its data version changes', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const historyResult = (temperature: number) => ({
      requestedDay: today,
      availableFromDay: today,
      availableToDay: today,
      rowsByItemId: {
        [items[0].id]: [{
          timeIso: `${today}T12:00:00.000Z`,
          status: 'graent' as const,
          temperature: { value: temperature, direction: 'none' as const, tone: 'neutral' as const },
          wind: { value: 4, direction: 'none' as const, tone: 'neutral' as const },
          gust: { value: 4, direction: 'none' as const, tone: 'neutral' as const, severity: 'none' as const },
          precipitation: { value: 0, direction: 'none' as const, tone: 'neutral' as const },
        }],
      },
    })
    const onLoadHistoryDay = vi.fn()
      .mockResolvedValueOnce(historyResult(8))
      .mockResolvedValueOnce(historyResult(10))

    const { rerender } = render(
      <WeatherChasePanel
        items={[items[0]]}
        initialSelectedIds={[items[0].id]}
        labels={labels}
        locale="is"
        onLoadHistoryDay={onLoadHistoryDay}
        historyDataVersion="8:15"
        visibleHours={[12]}
      />,
    )
    expect(await screen.findByText('8temperatureUnit')).toBeInTheDocument()

    rerender(
      <WeatherChasePanel
        items={[items[0]]}
        initialSelectedIds={[items[0].id]}
        labels={labels}
        locale="is"
        onLoadHistoryDay={onLoadHistoryDay}
        historyDataVersion="10:15"
        visibleHours={[12]}
      />,
    )

    expect(await screen.findByText('10temperatureUnit')).toBeInTheDocument()
    expect(screen.queryByText('8temperatureUnit')).not.toBeInTheDocument()
    expect(onLoadHistoryDay).toHaveBeenCalledTimes(2)
  })

  it('loads one continuous range from the oldest retained day through the future horizon', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const oldestDate = new Date(`${today}T00:00:00.000Z`)
    oldestDate.setUTCDate(oldestDate.getUTCDate() - 2)
    const oldest = oldestDate.toISOString().slice(0, 10)
    const middleDate = new Date(`${today}T00:00:00.000Z`)
    middleDate.setUTCDate(middleDate.getUTCDate() - 1)
    const middle = middleDate.toISOString().slice(0, 10)
    const futureDate = new Date(`${today}T00:00:00.000Z`)
    futureDate.setUTCDate(futureDate.getUTCDate() + 2)
    const future = futureDate.toISOString().slice(0, 10)
    const makeRow = (day: string, temperature: number) => ({
      timeIso: `${day}T00:00:00.000Z`,
      status: 'graent' as const,
      temperature: { value: temperature, direction: 'none' as const, tone: 'neutral' as const },
      wind: { value: 2, direction: 'none' as const, tone: 'neutral' as const },
      gust: { value: 2, direction: 'none' as const, tone: 'neutral' as const, severity: 'none' as const },
      precipitation: { value: 0, direction: 'none' as const, tone: 'neutral' as const },
    })
    const todayRow = makeRow(today, 7)
    const item = { ...items[0], rows: [makeRow(future, 11)] }
    const onLoadHistoryDay = vi.fn(async (day: string) => ({
      requestedDay: day,
      availableFromDay: oldest,
      availableToDay: future,
      rowsByItemId: {
        [item.id]: day === today
          ? [todayRow]
          : [makeRow(oldest, 5), makeRow(middle, 6), todayRow, makeRow(future, 11)],
      },
    }))

    render(
      <WeatherChasePanel
        items={[item]}
        initialSelectedIds={[item.id]}
        labels={labels}
        locale="is"
        onLoadHistoryDay={onLoadHistoryDay}
        visibleHours={[0]}
      />,
    )

    expect(await screen.findByText('7temperatureUnit')).toBeInTheDocument()
    expect(screen.getAllByText(/kl\. 00:00/)).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'historyPreviousLabel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'historyNextLabel' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'historyShowOlderLabel' }))

    await waitFor(() => expect(onLoadHistoryDay).toHaveBeenCalledWith(oldest, expect.any(Array)))
    expect(await screen.findByText('5temperatureUnit')).toBeInTheDocument()
    expect(screen.getByText('6temperatureUnit')).toBeInTheDocument()
    expect(screen.getByText('11temperatureUnit')).toBeInTheDocument()
    expect(screen.getAllByText(/kl\. 00:00/)).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'historyShowOlderLabel' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('region', { name: 'historyLabel' }))
    })
  })

  it('places the older-forecast action in the table corner', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterdayDate = new Date(`${today}T00:00:00.000Z`)
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
    const yesterday = yesterdayDate.toISOString().slice(0, 10)
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    const comparisonItems = Array.from({ length: 4 }, (_, index): WeatherChaseItem => ({
      ...items[index % items.length],
      id: `vedurstofan:corner-${index}`,
      label: `Samanburðarstöð ${index + 1}`,
      rows: [{
        timeIso: `${tomorrow}T12:00:00.000Z`,
        status: 'graent',
        temperature: { value: 12 + index, direction: 'none', tone: 'neutral' },
        wind: { value: 4, direction: 'none', tone: 'neutral' },
        gust: { value: 4, direction: 'none', tone: 'neutral', severity: 'none' },
        precipitation: { value: 0, direction: 'none', tone: 'neutral' },
      }],
    }))
    const onLoadHistoryDay = vi.fn(async (day: string) => ({
      requestedDay: day,
      availableFromDay: yesterday,
      availableToDay: tomorrow,
      rowsByItemId: Object.fromEntries(comparisonItems.map(item => [item.id, []])),
    }))

    render(
      <WeatherChasePanel
        items={comparisonItems}
        initialSelectedIds={comparisonItems.map(item => item.id)}
        labels={labels}
        locale="is"
        onLoadHistoryDay={onLoadHistoryDay}
        visibleHours={[12]}
      />,
    )

    const historyCorner = await screen.findByRole('group', { name: 'historyLabel' })
    expect(within(historyCorner).getByRole('button', { name: 'historyShowOlderLabel' })).toBeInTheDocument()
    const dateHeader = document.querySelector<HTMLElement>('[data-weather-chase-date-header="true"]')
    const tableGrid = document.querySelector<HTMLElement>('[data-weather-chase-table-grid="true"]')
    const tableScroll = document.querySelector<HTMLElement>('[data-weather-chase-table-scroll="true"]')
    const headerTrack = dateHeader?.querySelector<HTMLElement>('.will-change-transform')
    expect(dateHeader).toHaveClass('sticky', 'top-0')
    expect(dateHeader).toHaveClass('overflow-hidden', 'bg-background')
    expect(dateHeader?.style.gridTemplateColumns).toContain('9.5rem')
    expect(tableGrid?.style.gridTemplateColumns).toContain('9.5rem')
    expect(tableGrid?.style.gridTemplateColumns).toContain('4.85rem')
    expect(tableScroll).not.toBeNull()
    expect(headerTrack).not.toBeNull()

    Object.defineProperty(tableScroll as HTMLElement, 'scrollLeft', {
      configurable: true,
      value: 73,
    })
    fireEvent.scroll(tableScroll as HTMLElement)
    expect(headerTrack).toHaveStyle({ transform: 'translate3d(-73px, 0, 0)' })
  })

  it('keeps the current met.no loader stable while history is still in flight', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    const item: WeatherChaseItem = {
      id: 'metno:reykjavik',
      label: 'Reykjavík',
      providerId: 'metno',
      providerLabel: 'Yr / met.no',
      sourceLabel: 'Yr / met.no',
      rows: [],
      needsRowLoad: true,
    }
    const currentRow = {
      timeIso: `${today}T00:00:00.000Z`,
      status: 'graent' as const,
      temperature: { value: 7, direction: 'none' as const, tone: 'neutral' as const },
      wind: { value: 2, direction: 'none' as const, tone: 'neutral' as const },
      gust: { value: 2, direction: 'none' as const, tone: 'neutral' as const, severity: 'none' as const },
      precipitation: { value: 0, direction: 'none' as const, tone: 'neutral' as const },
    }
    type DeferredHistoryResult = {
      requestedDay: string
      availableFromDay: string
      availableToDay: string
      rowsByItemId: Record<string, Array<typeof currentRow>>
    }
    let resolveHistory!: (result: DeferredHistoryResult) => void
    const historyPromise = new Promise<DeferredHistoryResult>(resolve => { resolveHistory = resolve })
    const onLoadHistoryDay = vi.fn(() => historyPromise)
    const onLoadItemRows = vi.fn().mockResolvedValue([{
      ...currentRow,
      timeIso: `${tomorrow}T00:00:00.000Z`,
      temperature: { ...currentRow.temperature, value: 11 },
    }])

    render(
      <WeatherChasePanel
        items={[item]}
        initialSelectedIds={[item.id]}
        labels={labelsWith({
          stillLoading: 'Sæki spá...',
          missingHistoryValue: 'Sögugildi vantar',
          missingForecastValue: 'Spá vantar',
        })}
        locale="is"
        onLoadItemRows={onLoadItemRows}
        onLoadHistoryDay={onLoadHistoryDay}
        visibleHours={[0]}
      />,
    )

    expect(await screen.findByText('11temperatureUnit')).toBeInTheDocument()
    expect(onLoadHistoryDay).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('Sæki spá...')).toHaveLength(2)
    expect(screen.queryByText('Sögugildi vantar')).not.toBeInTheDocument()
    resolveHistory({
      requestedDay: today,
      availableFromDay: today,
      availableToDay: tomorrow,
      rowsByItemId: { [item.id]: [currentRow] },
    })
    expect(await screen.findByText('7temperatureUnit')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Sæki spá...')).not.toBeInTheDocument())
    expect(onLoadHistoryDay).toHaveBeenCalledTimes(1)
  })

  it('offers a retry when the older forecast range fails to load', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const oldestDate = new Date(`${today}T00:00:00.000Z`)
    oldestDate.setUTCDate(oldestDate.getUTCDate() - 1)
    const oldest = oldestDate.toISOString().slice(0, 10)
    const makeRow = (day: string, temperature: number) => ({
      timeIso: `${day}T12:00:00.000Z`,
      status: 'graent' as const,
      temperature: { value: temperature, direction: 'none' as const, tone: 'neutral' as const },
      wind: { value: 2, direction: 'none' as const, tone: 'neutral' as const },
      gust: { value: 2, direction: 'none' as const, tone: 'neutral' as const, severity: 'none' as const },
      precipitation: { value: 0, direction: 'none' as const, tone: 'neutral' as const },
    })
    const item = { ...items[0], rows: [makeRow(today, 7)] }
    const historyResult = (day: string, rows: ReturnType<typeof makeRow>[]) => ({
      requestedDay: day,
      availableFromDay: oldest,
      availableToDay: today,
      rowsByItemId: { [item.id]: rows },
    })
    const onLoadHistoryDay = vi.fn()
      .mockResolvedValueOnce(historyResult(today, [makeRow(today, 7)]))
      .mockRejectedValueOnce(new Error('history unavailable'))
      .mockResolvedValueOnce(historyResult(oldest, [makeRow(oldest, 5), makeRow(today, 7)]))

    render(
      <WeatherChasePanel
        items={[item]}
        initialSelectedIds={[item.id]}
        labels={labels}
        locale="is"
        onLoadHistoryDay={onLoadHistoryDay}
        visibleHours={[12]}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'historyShowOlderLabel' }))
    expect(await screen.findByText('historyLoadFailedLabel', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'historyRetryLabel' }))

    expect(await screen.findByText('5temperatureUnit')).toBeInTheDocument()
    expect(onLoadHistoryDay).toHaveBeenCalledTimes(3)
  })

  it('shows a retry when discovering the available history initially fails', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const oldestDate = new Date(`${today}T00:00:00.000Z`)
    oldestDate.setUTCDate(oldestDate.getUTCDate() - 1)
    const oldest = oldestDate.toISOString().slice(0, 10)
    const item = { ...items[0], rows: [] }
    const onLoadHistoryDay = vi.fn()
      .mockRejectedValueOnce(new Error('history unavailable'))
      .mockResolvedValueOnce({
        requestedDay: today,
        availableFromDay: oldest,
        availableToDay: today,
        rowsByItemId: { [item.id]: [] },
      })

    render(
      <WeatherChasePanel
        items={[item]}
        initialSelectedIds={[item.id]}
        labels={labels}
        locale="is"
        onLoadHistoryDay={onLoadHistoryDay}
        visibleHours={[12]}
      />,
    )

    expect(await screen.findByText('historyLoadFailedLabel', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'historyRetryLabel' }))

    expect(await screen.findByRole('button', { name: 'historyShowOlderLabel' })).toBeInTheDocument()
    expect(onLoadHistoryDay).toHaveBeenCalledTimes(2)
  })

  it('loads current met.no rows alongside the history request', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    const item: WeatherChaseItem = {
      id: 'metno:reykjavik',
      label: 'Reykjavík',
      providerId: 'metno',
      providerLabel: 'Yr / met.no',
      sourceLabel: 'Yr / met.no',
      rows: [],
      needsRowLoad: true,
    }
    const onLoadItemRows = vi.fn().mockResolvedValue([{
      timeIso: `${tomorrow}T12:00:00.000Z`,
      status: 'graent' as const,
      temperature: { value: 11, direction: 'none' as const, tone: 'neutral' as const },
      wind: { value: 3, direction: 'none' as const, tone: 'neutral' as const },
      gust: { value: 4, direction: 'none' as const, tone: 'neutral' as const, severity: 'none' as const },
      precipitation: { value: 0, direction: 'none' as const, tone: 'neutral' as const },
    }])
    const onLoadHistoryDay = vi.fn().mockResolvedValue({
      requestedDay: today,
      availableFromDay: today,
      availableToDay: today,
      rowsByItemId: { [item.id]: [] },
    })

    render(
      <WeatherChasePanel
        items={[item]}
        initialSelectedIds={[item.id]}
        labels={labels}
        locale="is"
        onLoadItemRows={onLoadItemRows}
        onLoadHistoryDay={onLoadHistoryDay}
        visibleHours={[12]}
      />,
    )

    await waitFor(() => expect(onLoadItemRows).toHaveBeenCalledOnce())
    await waitFor(() => expect(onLoadHistoryDay).toHaveBeenCalledOnce())
    expect(await screen.findByText('11temperatureUnit')).toBeInTheDocument()
  })

  it('shows available forecast rows while another provider is still loading', () => {
    const progressiveItems: WeatherChaseItem[] = [
      {
        id: 'metno:reykjavik',
        label: 'Reykjavík',
        providerId: 'metno',
        providerLabel: 'Yr / met.no',
        sourceLabel: 'Yr / met.no',
        rows: [{
          timeIso: '2026-07-26T12:00:00.000Z',
          status: 'graent',
          temperature: { value: 12, direction: 'none', tone: 'neutral' },
          wind: { value: 4, direction: 'none', tone: 'neutral' },
          gust: { value: 6, direction: 'none', tone: 'neutral', severity: 'none' },
          precipitation: { value: 0, direction: 'none', tone: 'neutral' },
        }],
      },
      {
        id: 'vedurstofan:1',
        label: 'Veðurstofustöð',
        providerId: 'vedurstofan',
        providerLabel: 'Veðurstofa Íslands',
        sourceLabel: 'Veðurstofa Íslands',
        rows: [],
      },
    ]

    render(
      <WeatherChasePanel
        items={progressiveItems}
        initialSelectedIds={progressiveItems.map(item => item.id)}
        labels={labelsWith({ stillLoading: 'Sæki spá...' })}
        locale="is"
        loading
        visibleHours={[12]}
      />,
    )

    expect(screen.queryByRole('status', { name: 'loading' })).not.toBeInTheDocument()
    expect(screen.getByText('Reykjavík')).toBeInTheDocument()
    expect(screen.getByText('Veðurstofustöð')).toBeInTheDocument()
    expect(screen.getAllByText('Sæki spá...')).toHaveLength(2)
    expect(screen.queryByText('… Sæki spá...')).not.toBeInTheDocument()
  })

  it('applies defaults when hydration resolves from loading to no saved preferences', async () => {
    const onSelectedItemsChange = vi.fn()
    const { rerender } = render(
      <WeatherChasePanel
        items={items}
        initialSelectedIds={null}
        labels={labels}
        locale="is"
        onSelectedItemsChange={onSelectedItemsChange}
        visibleHours={[12]}
      />,
    )

    expect(onSelectedItemsChange).not.toHaveBeenCalled()

    rerender(
      <WeatherChasePanel
        items={items}
        initialSelectedIds={['vedurstofan:1', 'vedurstofan:2']}
        labels={labels}
        locale="is"
        onSelectedItemsChange={onSelectedItemsChange}
        visibleHours={[12]}
      />,
    )

    await waitFor(() => expect(onSelectedItemsChange).toHaveBeenCalled())
    expect(onSelectedItemsChange.mock.calls.map(([selected]) => (
      (selected as WeatherChaseItem[]).map(item => item.id)
    ))).toEqual([['vedurstofan:1', 'vedurstofan:2']])
  })

  it('does not publish the stale empty selection before saved station ids are applied', async () => {
    const onSelectedItemsChange = vi.fn()

    render(
      <WeatherChasePanel
        items={items}
        initialSelectedIds={['vedurstofan:1']}
        labels={labels}
        locale="is"
        onSelectedItemsChange={onSelectedItemsChange}
        visibleHours={[12]}
      />,
    )

    await waitFor(() => expect(onSelectedItemsChange).toHaveBeenCalled())

    expect(onSelectedItemsChange.mock.calls.map(([selected]) => (
      (selected as WeatherChaseItem[]).map(item => item.id)
    ))).toEqual([['vedurstofan:1']])
  })

  it('shows a recoverable error instead of a silently empty met.no row', async () => {
    const metnoItem: WeatherChaseItem = {
      id: 'metno:egilsstadir',
      label: 'Egilsstaðir',
      providerId: 'metno',
      providerLabel: 'Yr / met.no',
      sourceLabel: 'Yr / met.no',
      rows: [],
      lat: 65.2674,
      lon: -14.3948,
      needsRowLoad: true,
    }
    const onLoadItemRows = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([{
        validTime: '2026-07-25T12:00:00.000Z',
        temperatureC: 12,
        windMs: 4,
        precipitationMm: 0,
        status: 'within_limits',
      }])

    render(
      <WeatherChasePanel
        items={[metnoItem]}
        initialSelectedIds={[metnoItem.id]}
        labels={labels}
        locale="is"
        onLoadItemRows={onLoadItemRows}
        visibleHours={[12]}
      />,
    )

    expect(await screen.findByText('rowLoadFailedLabel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'retryRowLoadLabel' }))

    await waitFor(() => expect(onLoadItemRows).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('rowLoadFailedLabel')).not.toBeInTheDocument())
  })

  it('treats an empty met.no response as a load failure', async () => {
    const metnoItem: WeatherChaseItem = {
      id: 'metno:isafjordur',
      label: 'Ísafjörður',
      providerId: 'metno',
      providerLabel: 'Yr / met.no',
      sourceLabel: 'Yr / met.no',
      rows: [],
      needsRowLoad: true,
    }

    render(
      <WeatherChasePanel
        items={[metnoItem]}
        initialSelectedIds={[metnoItem.id]}
        labels={labels}
        locale="is"
        onLoadItemRows={vi.fn().mockResolvedValue([])}
        visibleHours={[12]}
      />,
    )

    expect(await screen.findByText('rowLoadFailedLabel')).toBeInTheDocument()
  })
})
