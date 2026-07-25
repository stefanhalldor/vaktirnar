import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  WeatherChasePanel,
  type WeatherChaseItem,
} from '@/components/weather/WeatherChasePanel'

const labels = new Proxy({}, {
  get: (_target, property) => String(property),
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
