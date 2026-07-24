import { describe, expect, it } from 'vitest'
import { normalizeWeatherChaseVisibleHours } from '@/lib/weather/chasePreferences'

describe('normalizeWeatherChaseVisibleHours', () => {
  it('keeps valid hours, removes duplicates, and sorts', () => {
    expect(normalizeWeatherChaseVisibleHours([18, 6, 18, 0])).toEqual([0, 6, 18])
  })

  it('drops invalid values', () => {
    expect(normalizeWeatherChaseVisibleHours([3, 4, '6', null, 21])).toEqual([3, 21])
  })

  it('falls back to noon for missing or empty selections', () => {
    expect(normalizeWeatherChaseVisibleHours(undefined)).toEqual([12])
    expect(normalizeWeatherChaseVisibleHours([])).toEqual([12])
    expect(normalizeWeatherChaseVisibleHours([5])).toEqual([12])
  })
})
