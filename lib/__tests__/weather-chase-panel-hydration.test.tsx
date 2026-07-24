import { render, waitFor } from '@testing-library/react'
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
})
