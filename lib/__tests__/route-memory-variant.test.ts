import { describe, expect, it } from 'vitest'
import {
  routeMemoryVariantIdentity,
  sanitizePublicRouteMemoryLookup,
} from '@/lib/iceland-routes/routeMemoryVariant'
import type { RouteMemoryLookupResult, RouteMemoryVariant } from '@/lib/iceland-routes/routeMemory.server'

function makeVariant(
  routeVariantKey: string,
  routeVariantLabel: string | null = null,
): RouteMemoryVariant {
  return {
    routeVariantKey,
    routeVariantLabel,
    lastSeenAt: '2026-07-26T00:00:00.000Z',
    usageCount: 1,
    vedurstofanStationIds: ['v1'],
    vegagerdinStationIds: ['g1'],
    routeCautionIds: [],
  }
}

function resolvedLookup(
  variants: RouteMemoryVariant[],
  routeKey = 'legacy-key-that-must-not-cross-the-api',
): RouteMemoryLookupResult {
  return {
    status: 'resolved',
    routeKey,
    routeLabel: 'Reykjavík → Ísafjörður',
    variants,
  }
}

describe('route memory variant identity', () => {
  it('never persists a coordinate-bearing Google route id', () => {
    const rawRouteId = 'google-56000-64.0900,-21.9300-63.8490,-21.3650'
    const identity = routeMemoryVariantIdentity({
      provider: 'google',
      routeIndex: 2,
      labels: ['DEFAULT_ROUTE_ALTERNATE'],
    })

    expect(identity).toEqual({ key: 'google:2', label: null })
    expect(JSON.stringify(identity)).not.toContain(rawRouteId)
    expect(JSON.stringify(identity)).not.toMatch(/64\.0900|-21\.9300/)
  })

  it('preserves a public curated label as both stable key and label', () => {
    expect(routeMemoryVariantIdentity({
      provider: 'google',
      routeIndex: -1,
      labels: ['CURATED_VIA_THRENGSLAVEGUR'],
    })).toEqual({
      key: 'CURATED_VIA_THRENGSLAVEGUR',
      label: 'CURATED_VIA_THRENGSLAVEGUR',
    })
  })

  it('uses provider and route index for Teskeið alternatives', () => {
    expect(routeMemoryVariantIdentity({
      provider: 'teskeid',
      routeIndex: -2,
      labels: ['TESKEID_EXPERIMENTAL'],
    })).toEqual({ key: 'teskeid:-2', label: null })
  })

  it('fails closed for a legacy coordinate-bearing public lookup', () => {
    const coordinateKey = 'google-56000-64.0900,-21.9300-63.8490,-21.3650'
    const result = sanitizePublicRouteMemoryLookup(
      resolvedLookup([makeVariant(coordinateKey)], `reykjavik--isafjordur--${coordinateKey}`),
      'reykjavik',
      'isafjordur',
    )

    expect(result).toEqual({
      status: 'miss',
      fromPlaceKey: 'reykjavik',
      toPlaceKey: 'isafjordur',
    })
    expect(JSON.stringify(result)).not.toMatch(/64\.0900|-21\.9300/)
  })

  it('replaces a legacy raw key with its safe curated identity', () => {
    const result = sanitizePublicRouteMemoryLookup(
      resolvedLookup([
        makeVariant(
          'google-56000-64.0900,-21.9300-63.8490,-21.3650',
          'CURATED_AVOID_OXI',
        ),
      ]),
      'reykjavik',
      'hofn',
    )

    expect(result).toMatchObject({
      status: 'resolved',
      routeKey: 'reykjavik--hofn--CURATED_AVOID_OXI',
      variants: [{
        routeVariantKey: 'CURATED_AVOID_OXI',
        routeVariantLabel: 'CURATED_AVOID_OXI',
      }],
    })
    expect(JSON.stringify(result)).not.toMatch(/64\.0900|-21\.9300/)
  })

  it('returns only canonical bounded provider-slot identities and rebuilds the route key', () => {
    const result = sanitizePublicRouteMemoryLookup(
      resolvedLookup([
        makeVariant('google:0', 'untrusted-label'),
        makeVariant('teskeid:-2'),
        makeVariant('google:02'),
        makeVariant('google:99999'),
        makeVariant('unknown:1'),
      ]),
      'reykjavik',
      'isafjordur',
    )

    expect(result).toMatchObject({
      status: 'resolved',
      routeKey: 'reykjavik--isafjordur--google:0',
      variants: [
        { routeVariantKey: 'google:0', routeVariantLabel: null },
        { routeVariantKey: 'teskeid:-2', routeVariantLabel: null },
      ],
    })
  })
})
