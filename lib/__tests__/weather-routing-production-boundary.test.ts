import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getWeatherMapProvider } from '@/lib/weather/provider.server'

const WORKSPACE = process.cwd()
const LEGACY_ADAPTER = 'lib/weather/google.server.ts'
const PROVIDER_TYPES = 'lib/weather/provider.types.ts'

function productionSources(root: 'app' | 'components' | 'lib'): Array<{ path: string; source: string }> {
  const found: Array<{ path: string; source: string }> = []

  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      const workspacePath = relative(WORKSPACE, absolute).replaceAll('\\', '/')
      if (entry.isDirectory()) {
        if (workspacePath === 'lib/__tests__') continue
        visit(absolute)
        continue
      }
      if (!/\.[cm]?[jt]sx?$/.test(entry.name)) continue
      if (workspacePath === LEGACY_ADAPTER || workspacePath === PROVIDER_TYPES) continue
      found.push({ path: workspacePath, source: readFileSync(absolute, 'utf8') })
    }
  }

  visit(join(WORKSPACE, root))
  return found
}

afterEach(() => {
  delete process.env.WEATHER_MAP_PROVIDER
})

describe('v238 production routing-provider boundary', () => {
  it('exposes Google only as the places/static-map provider at runtime', () => {
    process.env.WEATHER_MAP_PROVIDER = 'google'

    const provider = getWeatherMapProvider()

    expect(provider).not.toBeNull()
    expect(Object.keys(provider!).sort()).toEqual(['geocodePlace', 'staticMapUrl'])
    expect(provider).not.toHaveProperty('getRouteOptions')
    expect(provider).not.toHaveProperty('getRouteGeometry')
  })

  it('keeps the historical Google routing adapter unreachable from production sources', () => {
    const violations: string[] = []
    const forbidden = [
      { label: 'legacy adapter import', pattern: /(?:from|import\s*\()\s*['"][^'"]*google\.server['"]/ },
      { label: 'Google computeRoutes host', pattern: /routes\.googleapis\.com\/directions\/v2:computeRoutes/ },
      { label: 'legacy getRouteOptions call', pattern: /\.getRouteOptions\s*\(/ },
      { label: 'legacy getRouteGeometry call', pattern: /\.getRouteGeometry\s*\(/ },
      { label: 'legacy routing-provider type', pattern: /LegacyWeatherRoutingProvider/ },
    ]

    for (const file of [
      ...productionSources('app'),
      ...productionSources('components'),
      ...productionSources('lib'),
    ]) {
      for (const rule of forbidden) {
        if (rule.pattern.test(file.source)) violations.push(`${file.path}: ${rule.label}`)
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps route discovery clients away from the weather-only provider-stations endpoint', () => {
    const routeClients = [
      'components/weather/RoadMapPrototypeMap.tsx',
      'app/auth-mvp/vedrid/FerdalagidClient.tsx',
      'components/weather/RouteSelectionStep.tsx',
    ]

    for (const path of routeClients) {
      const source = readFileSync(join(WORKSPACE, path), 'utf8')
      expect(source, path).not.toContain('/provider-stations')
      expect(source, path).not.toContain('google.server')
      expect(source, path).not.toContain('routes.googleapis.com/directions/v2:computeRoutes')
    }
  })
})
