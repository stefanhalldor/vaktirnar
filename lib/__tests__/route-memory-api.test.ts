import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const { mockGetAdmin } = vi.hoisted(() => ({ mockGetAdmin: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: mockGetAdmin,
}))

vi.mock('server-only', () => ({}))

import {
  GET as getPlaces,
  dynamic as placesDynamic,
  revalidate as placesRevalidate,
} from '@/app/api/teskeid/weather/route-memory/places/route'
import {
  GET as getDestinations,
  dynamic as destinationsDynamic,
  revalidate as destinationsRevalidate,
} from '@/app/api/teskeid/weather/route-memory/destinations/route'
import {
  POST as lookupRouteMemory,
  dynamic as lookupDynamic,
  revalidate as lookupRevalidate,
} from '@/app/api/teskeid/weather/route-memory/lookup/route'
import {
  GET as getPlaceFocus,
  dynamic as placeFocusDynamic,
  revalidate as placeFocusRevalidate,
} from '@/app/api/teskeid/weather/route-memory/place-focus/route'

const NO_STORE = 'no-store, no-cache, max-age=0, must-revalidate'

function queryResult<T>(result: T) {
  const promise = Promise.resolve(result)
  return Object.assign(promise, {
    eq: vi.fn(() => promise),
  })
}

describe('route-memory API freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks route-memory read endpoints as dynamic and uncached', () => {
    expect(placesDynamic).toBe('force-dynamic')
    expect(destinationsDynamic).toBe('force-dynamic')
    expect(lookupDynamic).toBe('force-dynamic')
    expect(placeFocusDynamic).toBe('force-dynamic')
    expect(placesRevalidate).toBe(0)
    expect(destinationsRevalidate).toBe(0)
    expect(lookupRevalidate).toBe(0)
    expect(placeFocusRevalidate).toBe(0)
  })

  it('returns newly stored places with no-store cache headers', async () => {
    const from = vi.fn((_table: string) => ({
      select: vi.fn((columns: string) => {
        if (columns === 'from_place_key, from_place_label') {
          return queryResult({
            data: [{ from_place_key: 'akranes', from_place_label: 'Akranes' }],
            error: null,
          })
        }
        if (columns === 'to_place_key, to_place_label') {
          return queryResult({
            data: [{ to_place_key: 'borgarnes', to_place_label: 'Borgarnes' }],
            error: null,
          })
        }
        return queryResult({ data: [], error: null })
      }),
    }))
    mockGetAdmin.mockReturnValue({ from })

    const res = await getPlaces()
    const body = await res.json()

    expect(res.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(body.places).toEqual([
      { key: 'akranes', label: 'Akranes' },
      { key: 'borgarnes', label: 'Borgarnes' },
    ])
  })

  it('returns counterpart destinations with no-store cache headers', async () => {
    const from = vi.fn((_table: string) => ({
      select: vi.fn((columns: string) => {
        if (columns === 'to_place_key, to_place_label') {
          return queryResult({
            data: [{ to_place_key: 'borgarnes', to_place_label: 'Borgarnes' }],
            error: null,
          })
        }
        if (columns === 'from_place_key, from_place_label') {
          return queryResult({ data: [], error: null })
        }
        return queryResult({ data: [], error: null })
      }),
    }))
    mockGetAdmin.mockReturnValue({ from })

    const res = await getDestinations(
      new Request('http://localhost/api/teskeid/weather/route-memory/destinations?from=akranes'),
    )
    const body = await res.json()

    expect(res.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(body.destinations).toEqual([{ key: 'borgarnes', label: 'Borgarnes' }])
  })

  it('sets no-store headers on miss and empty fast paths', async () => {
    const lookupRes = await lookupRouteMemory(new Request('http://localhost/api/teskeid/weather/route-memory/lookup', {
      method: 'POST',
      body: '{bad json',
    }))
    const focusRes = await getPlaceFocus(
      new Request('http://localhost/api/teskeid/weather/route-memory/place-focus'),
    )

    expect(lookupRes.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(focusRes.headers.get('Cache-Control')).toBe(NO_STORE)
  })

  it('client picker bypasses browser cache for places and destinations', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/weather/RouteMemoryPicker.tsx'),
      'utf8',
    )

    expect(source).toContain("fetch('/api/teskeid/weather/route-memory/places', { cache: 'no-store' })")
    expect(source).toContain("{ cache: 'no-store' })")
    expect(source).toContain('/api/teskeid/weather/route-memory/destinations?from=')
  })
})
