import { describe, expect, it } from 'vitest'
import { TeskeidRoutingProvider } from '@/lib/iceland-routes/teskeidRoutingProvider.server'

// Reykjavík — within 120 km of capital anchor
const RVK = { lat: 64.1466, lon: -21.9426 }

// Destinations near each route family's terminal waypoint (within 80 km)
const NEAR_KLAUSTUR = { lat: 63.791, lon: -18.056 }   // capital-south-coast terminal
const NEAR_AKUREYRI = { lat: 65.686, lon: -18.085 }   // capital-north-iceland (Akureyri, ~42 km from Húsavík terminal)
const NEAR_EGILSSTADIR = { lat: 65.267, lon: -14.401 } // capital-east-iceland terminal
const NEAR_ISAFJORDUR = { lat: 66.075, lon: -23.131 }  // capital-westfjords terminal

// Destination in the middle of Iceland — far from every terminal
const UNROUTABLE_DEST = { lat: 64.8, lon: -19.0 }

// Origin far from capital anchor (> 120 km)
const AKUREYRI_ORIGIN = { lat: 65.686, lon: -18.085 }

const provider = new TeskeidRoutingProvider()

describe('TeskeidRoutingProvider.id', () => {
  it('has the canonical provider id', () => {
    expect(provider.id).toBe('teskeid_routes')
  })
})

describe('TeskeidRoutingProvider.calculateRoutes — matched routes', () => {
  it('matches Reykjavík → south coast corridor', async () => {
    const result = await provider.calculateRoutes({
      origin: { point: RVK },
      destination: { point: NEAR_KLAUSTUR },
      vehicleProfile: 'car',
    })

    expect(result.provider).toBe('teskeid_routes')
    expect(result.paths).toHaveLength(1)

    const path = result.paths[0]
    expect(path.id).toBe('teskeid-capital-south-coast-fixture')
    expect(path.routeFamilyId).toBe('capital-south-coast')
    expect(path.resultKind).toBe('corridor_fixture')
    expect(path.confidence).toBe('experimental')
    expect(path.segmentIds).toEqual([])
    expect(path.distanceM).toBeGreaterThan(0)
    expect(path.durationS).toBeGreaterThan(0)
    expect(path.geometry.length).toBeGreaterThan(1)
    expect(path.warnings).toContain(
      'corridor-waypoints-only: not turn-by-turn; distance and duration are estimates',
    )
  })

  it('matches Reykjavík → north Iceland corridor', async () => {
    const result = await provider.calculateRoutes({
      origin: { point: RVK },
      destination: { point: NEAR_AKUREYRI },
      vehicleProfile: 'car',
    })

    const path = result.paths[0]
    expect(path.routeFamilyId).toBe('capital-north-iceland')
    expect(path.id).toBe('teskeid-capital-north-iceland-fixture')
  })

  it('matches Reykjavík → east Iceland corridor', async () => {
    const result = await provider.calculateRoutes({
      origin: { point: RVK },
      destination: { point: NEAR_EGILSSTADIR },
      vehicleProfile: 'car',
    })

    const path = result.paths[0]
    expect(path.routeFamilyId).toBe('capital-east-iceland')
  })

  it('matches Reykjavík → Westfjords corridor', async () => {
    const result = await provider.calculateRoutes({
      origin: { point: RVK },
      destination: { point: NEAR_ISAFJORDUR },
      vehicleProfile: 'car',
    })

    const path = result.paths[0]
    expect(path.routeFamilyId).toBe('capital-westfjords')
  })

  it('returns distanceM as integer and durationS > 0', async () => {
    const result = await provider.calculateRoutes({
      origin: { point: RVK },
      destination: { point: NEAR_KLAUSTUR },
      vehicleProfile: 'car',
    })

    const path = result.paths[0]
    expect(Number.isInteger(path.distanceM)).toBe(true)
    expect(Number.isInteger(path.durationS)).toBe(true)
    expect(path.durationS).toBeGreaterThan(0)
  })

  it('calculatedAt is an ISO string close to now', async () => {
    const before = Date.now()
    const result = await provider.calculateRoutes({
      origin: { point: RVK },
      destination: { point: NEAR_KLAUSTUR },
      vehicleProfile: 'car',
    })
    const after = Date.now()

    const ts = new Date(result.calculatedAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})

describe('TeskeidRoutingProvider.calculateRoutes — no match', () => {
  it('throws stable privacy-safe code when destination is far from all terminals', async () => {
    await expect(
      provider.calculateRoutes({
        origin: { point: RVK },
        destination: { point: UNROUTABLE_DEST },
        vehicleProfile: 'car',
      }),
    ).rejects.toThrow('teskeid_routes: no_corridor_fixture')
  })

  it('throws stable privacy-safe code when origin is outside the capital region', async () => {
    await expect(
      provider.calculateRoutes({
        origin: { point: AKUREYRI_ORIGIN },
        destination: { point: NEAR_KLAUSTUR },
        vehicleProfile: 'car',
      }),
    ).rejects.toThrow('teskeid_routes: no_corridor_fixture')
  })
})
