import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const roadMapSource = readFileSync(
  join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
  'utf8',
)

describe('mobile forecast-map source contract', () => {
  it('uses the exact forecast map state and opens the existing information view', () => {
    expect(roadMapSource).toMatch(/lastMapContext === 'weather' &&\r?\n\s+weatherContextView === 'map'/)
    expect(roadMapSource).toContain("onViewData={() => openWeatherContext('information')}")
  })

  it('removes the shared map and weather scrubber from mobile focus flow without hiding route mode', () => {
    expect(roadMapSource).toContain("forecastMapViewActive ? 'hidden lg:block' : ''")
    expect(roadMapSource).toContain("lastMapContext === 'route' && !isPanelOpen")
    expect(roadMapSource).toContain('{forecastMapViewActive && (')
  })
})
