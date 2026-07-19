import { describe, it, expect } from 'vitest'
import { sortStationsForContext } from '@/lib/weather/spatialOrder'

type Station = { stationId: string; lat: number; lon: number }

describe('sortStationsForContext', () => {
  it('returns empty array unchanged', () => {
    expect(sortStationsForContext([])).toEqual([])
  })

  it('returns single station unchanged', () => {
    const s = [{ stationId: 'A', lat: 64.0, lon: -22.0 }]
    expect(sortStationsForContext(s)).toEqual(s)
  })

  it('does not mutate the input array', () => {
    const input: Station[] = [
      { stationId: 'A', lat: 64.0, lon: -22.0 },
      { stationId: 'B', lat: 65.5, lon: -22.1 },
    ]
    const copy = [...input]
    sortStationsForContext(input)
    expect(input).toEqual(copy)
  })

  it('sorts north-to-south when latitude spread dominates', () => {
    // Lat spread ~3°, lon spread ~0.5° (adjusted ~0.22° at lat 65°)
    const stations: Station[] = [
      { stationId: 'S', lat: 63.0, lon: -22.0 },
      { stationId: 'M', lat: 65.0, lon: -22.3 },
      { stationId: 'N', lat: 66.0, lon: -22.5 },
    ]
    const result = sortStationsForContext(stations)
    expect(result.map(s => s.stationId)).toEqual(['N', 'M', 'S'])
  })

  it('sorts west-to-east when longitude spread dominates', () => {
    // Lat spread ~0.2°, lon spread ~5° (adjusted ~2.2° at lat 64°) — lon wins
    const stations: Station[] = [
      { stationId: 'E', lat: 64.0, lon: -15.0 },
      { stationId: 'W', lat: 64.1, lon: -20.0 },
      { stationId: 'C', lat: 64.2, lon: -17.5 },
    ]
    const result = sortStationsForContext(stations)
    // Ascending lon: -20 (west) → -17.5 → -15 (east)
    expect(result.map(s => s.stationId)).toEqual(['W', 'C', 'E'])
  })

  it('preserves all station fields in output', () => {
    const stations = [
      { stationId: 'A', lat: 63.0, lon: -22.0, distanceM: 5000 },
      { stationId: 'B', lat: 66.0, lon: -22.1, distanceM: 3000 },
    ]
    const result = sortStationsForContext(stations)
    expect(result[0].distanceM).toBeDefined()
    expect(result[1].distanceM).toBeDefined()
  })
})
