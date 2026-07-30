import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildRouteSectionsData,
  parseRouteSectionsResponse,
  routeSectionsPresentationHashMatches,
  routeSectionsPresentationHashPayload,
  ROUTE_SECTIONS_MAX_GEOMETRY_POINT_COUNT,
  ROUTE_SECTIONS_MAX_SECTION_COUNT,
  type RouteSectionsEvidenceInput,
} from '@/lib/iceland-routes/routeSections'

const POINT_A = { lat: 64, lon: -21 }
const POINT_B = { lat: 64.01, lon: -20.99 }
const POINT_C = { lat: 64.02, lon: -20.98 }

function evidence(
  overrides: Partial<RouteSectionsEvidenceInput> = {},
): RouteSectionsEvidenceInput {
  return {
    routeDistanceM: 1_000,
    assessedDistanceM: 1_000,
    unassessedDistanceM: 0,
    surface: { pavedM: 800, gravelM: 200, mixedM: 0, unknownM: 0 },
    direction: { authoritativeM: 0, inferredM: 0, legacyM: 1_000 },
    gravelPortions: [
      {
        startDistanceM: 200,
        endDistanceM: 300,
        distanceM: 100,
        geometry: [POINT_A, POINT_B],
        roadNumber: '1',
        roadName: 'Official road',
      },
      {
        startDistanceM: 700,
        endDistanceM: 800,
        distanceM: 100,
        // The route doubles back over the same geography. Do not merge or dedupe it.
        geometry: [POINT_B, POINT_A],
        roadNumber: '1',
        roadName: 'Official road',
      },
    ],
    inferredDirectionPortions: [],
    ...overrides,
  }
}

describe('route-sections presentation contract', () => {
  it('preserves exact ordered gravel portions and marks legacy direction unavailable', () => {
    const result = buildRouteSectionsData(evidence())

    expect(result).toEqual({
      coverage: {
        status: 'complete',
        routeDistanceM: 1_000,
        assessedDistanceM: 1_000,
        unassessedDistanceM: 0,
      },
      surface: {
        pavedM: 800,
        gravelM: 200,
        mixedM: 0,
        unknownM: 0,
        gravelSections: [
          {
            startDistanceM: 200,
            endDistanceM: 300,
            distanceM: 100,
            geometry: [POINT_A, POINT_B],
            roadNumber: '1',
            roadName: 'Official road',
          },
          {
            startDistanceM: 700,
            endDistanceM: 800,
            distanceM: 100,
            geometry: [POINT_B, POINT_A],
            roadNumber: '1',
            roadName: 'Official road',
          },
        ],
      },
      direction: { status: 'unavailable' },
    })
  })

  it('coalesces only contiguous gravel portions with the same normalized road labels', () => {
    const result = buildRouteSectionsData(evidence({
      gravelPortions: [
        {
          startDistanceM: 200,
          endDistanceM: 300.4,
          distanceM: 100.4,
          geometry: [POINT_A, POINT_B],
          roadNumber: ' 1 ',
          roadName: ' Official road ',
        },
        {
          startDistanceM: 300.4,
          endDistanceM: 400,
          distanceM: 99.6,
          geometry: [POINT_B, POINT_C],
          roadNumber: '1',
          roadName: 'Official road',
        },
      ],
    }))

    expect(result?.surface.gravelSections).toEqual([{
      startDistanceM: 200,
      endDistanceM: 400,
      distanceM: 200,
      geometry: [POINT_A, POINT_B, POINT_C],
      roadNumber: '1',
      roadName: 'Official road',
    }])
    expect(result?.surface.gravelM).toBe(200)
  })

  it.each([
    {
      name: 'route offsets have a gap',
      second: { startDistanceM: 301, endDistanceM: 401, geometry: [POINT_B, POINT_C] },
    },
    {
      name: 'official geometry endpoints do not meet',
      second: { startDistanceM: 300, endDistanceM: 400, geometry: [POINT_A, POINT_C] },
    },
    {
      name: 'road labels differ',
      second: {
        startDistanceM: 300,
        endDistanceM: 400,
        geometry: [POINT_B, POINT_C],
        roadName: 'Another official road',
      },
    },
  ])('keeps adjacent-looking gravel portions separate when $name', ({ second }) => {
    const result = buildRouteSectionsData(evidence({
      gravelPortions: [
        {
          startDistanceM: 200,
          endDistanceM: 300,
          distanceM: 100,
          geometry: [POINT_A, POINT_B],
          roadNumber: '1',
          roadName: 'Official road',
        },
        {
          distanceM: 100,
          roadNumber: '1',
          roadName: 'Official road',
          ...second,
        },
      ],
    }))

    expect(result?.surface.gravelSections).toHaveLength(2)
  })

  it('coalesces inferred-direction portions independently from surface portions', () => {
    const inferredPortions = [
      {
        startDistanceM: 400,
        endDistanceM: 500,
        distanceM: 100,
        geometry: [POINT_A, POINT_B],
        roadNumber: '1',
      },
      {
        startDistanceM: 500,
        endDistanceM: 600,
        distanceM: 100,
        geometry: [POINT_B, POINT_C],
        roadNumber: '1',
      },
    ]
    const result = buildRouteSectionsData(evidence({
      direction: { authoritativeM: 800, inferredM: 200, legacyM: 0 },
      inferredDirectionPortions: inferredPortions,
    }))

    expect(result?.direction).toEqual({
      status: 'verified',
      authoritativeM: 800,
      inferredM: 200,
      inferredSections: [{
        startDistanceM: 400,
        endDistanceM: 600,
        distanceM: 200,
        geometry: [POINT_A, POINT_B, POINT_C],
        roadNumber: '1',
      }],
    })
    expect(result?.surface.gravelSections).toHaveLength(2)
  })

  it('exposes inferred sections only when direction evidence covers the complete route', () => {
    const inferredPortion = {
      startDistanceM: 400,
      endDistanceM: 600,
      distanceM: 200,
      geometry: [POINT_A, POINT_B],
    }
    const verified = buildRouteSectionsData(evidence({
      direction: { authoritativeM: 800, inferredM: 200, legacyM: 0 },
      inferredDirectionPortions: [inferredPortion],
    }))

    expect(verified?.direction).toEqual({
      status: 'verified',
      authoritativeM: 800,
      inferredM: 200,
      inferredSections: [inferredPortion],
    })

    const legacy = buildRouteSectionsData(evidence({
      direction: { authoritativeM: 799, inferredM: 200, legacyM: 1 },
      inferredDirectionPortions: [inferredPortion],
    }))
    expect(legacy?.direction).toEqual({ status: 'unavailable' })
    expect(legacy?.direction).not.toHaveProperty('inferredSections')

    const incompleteInference = buildRouteSectionsData(evidence({
      direction: { authoritativeM: 800, inferredM: 200, legacyM: 0 },
      inferredDirectionPortions: [{ ...inferredPortion, distanceM: 100, endDistanceM: 500 }],
    }))
    expect(incompleteInference?.direction).toEqual({ status: 'unavailable' })

    const emptyFourMetreInference = buildRouteSectionsData(evidence({
      direction: { authoritativeM: 996, inferredM: 4, legacyM: 0 },
      inferredDirectionPortions: [],
    }))
    expect(emptyFourMetreInference?.direction).toEqual({ status: 'unavailable' })
  })

  it('labels unassessed connector distance as partial without hiding exact surface truth', () => {
    const result = buildRouteSectionsData(evidence({
      assessedDistanceM: 900,
      unassessedDistanceM: 100,
      surface: { pavedM: 700, gravelM: 200, mixedM: 0, unknownM: 0 },
      direction: { authoritativeM: 0, inferredM: 0, legacyM: 900 },
    }))

    expect(result?.coverage).toEqual({
      status: 'partial',
      routeDistanceM: 1_000,
      assessedDistanceM: 900,
      unassessedDistanceM: 100,
    })
    expect(result?.surface.gravelSections).toHaveLength(2)
    expect(result?.direction).toEqual({ status: 'unavailable' })
  })

  it('accepts an exact section end inside the integer route-total rounding band', () => {
    const result = buildRouteSectionsData(evidence({
      gravelPortions: [{
        startDistanceM: 800,
        endDistanceM: 1_000.4,
        distanceM: 200.4,
        geometry: [POINT_B, POINT_A],
      }],
    }))

    expect(result?.surface.gravelSections[0]).toMatchObject({
      endDistanceM: 1_000.4,
      distanceM: 200.4,
    })
  })

  it('fails closed for inconsistent totals instead of truncating or repairing them', () => {
    expect(buildRouteSectionsData(evidence({
      surface: { pavedM: 810, gravelM: 190, mixedM: 0, unknownM: 0 },
    }))).toBeNull()

    expect(buildRouteSectionsData(evidence({
      assessedDistanceM: 999,
      unassessedDistanceM: 0,
    }))).toBeNull()

    expect(buildRouteSectionsData(evidence({
      surface: { pavedM: 996, gravelM: 4, mixedM: 0, unknownM: 0 },
      gravelPortions: [],
    }))).toBeNull()
  })

  it('rejects an oversized raw section list before otherwise-safe coalescing', () => {
    const sectionCount = ROUTE_SECTIONS_MAX_SECTION_COUNT + 1
    const points = Array.from({ length: sectionCount + 1 }, (_, index) => ({
      lat: 64,
      lon: -21 + index / 100_000,
    }))
    const portions = Array.from({ length: sectionCount }, (_, index) => ({
      startDistanceM: index,
      endDistanceM: index + 1,
      distanceM: 1,
      geometry: [points[index], points[index + 1]],
    }))
    expect(buildRouteSectionsData({
      routeDistanceM: sectionCount,
      assessedDistanceM: sectionCount,
      unassessedDistanceM: 0,
      surface: { pavedM: 0, gravelM: sectionCount, mixedM: 0, unknownM: 0 },
      direction: { authoritativeM: 0, inferredM: 0, legacyM: sectionCount },
      gravelPortions: portions,
      inferredDirectionPortions: [],
    })).toBeNull()
  })

  it('applies the raw geometry-point bound before coalescing removes a shared endpoint', () => {
    const firstPointCount = Math.floor(ROUTE_SECTIONS_MAX_GEOMETRY_POINT_COUNT / 2)
    const secondPointCount = ROUTE_SECTIONS_MAX_GEOMETRY_POINT_COUNT - firstPointCount + 1
    const firstGeometry = Array.from({ length: firstPointCount }, (_, index) => (
      index === firstPointCount - 1 ? POINT_B : POINT_A
    ))
    const secondGeometry = Array.from({ length: secondPointCount }, (_, index) => (
      index === 0 ? POINT_B : POINT_C
    ))

    expect(buildRouteSectionsData(evidence({
      gravelPortions: [
        {
          startDistanceM: 200,
          endDistanceM: 300,
          distanceM: 100,
          geometry: firstGeometry,
          roadNumber: '1',
        },
        {
          startDistanceM: 300,
          endDistanceM: 400,
          distanceM: 100,
          geometry: secondGeometry,
          roadNumber: '1',
        },
      ],
    }))).toBeNull()
  })

  it('strictly parses, verifies and deep-copies only a ready response for the expected identity', async () => {
    const data = buildRouteSectionsData(evidence())
    expect(data).not.toBeNull()
    const routeIdentity = 'a'.repeat(64)
    const presentationHash = createHash('sha256')
      .update(routeSectionsPresentationHashPayload(routeIdentity, data!))
      .digest('base64url')
    const response = {
      status: 'ready',
      schemaVersion: 1,
      routeIdentity,
      presentationHash,
      data,
    }

    const parsed = parseRouteSectionsResponse(response, routeIdentity)
    expect(parsed).toEqual(response)
    expect(parsed).not.toBe(response)
    expect(parsed?.data).not.toBe(data)
    expect(parsed?.data.surface.gravelSections[0].geometry).not.toBe(
      data?.surface.gravelSections[0].geometry,
    )
    expect(await routeSectionsPresentationHashMatches(parsed!)).toBe(true)
    expect(await routeSectionsPresentationHashMatches({
      ...parsed!,
      presentationHash: 'B'.repeat(43),
    })).toBe(false)
  })

  it('rejects mismatched identity/hash, extra keys and non-strict coordinates', () => {
    const data = buildRouteSectionsData(evidence())!
    const routeIdentity = 'a'.repeat(64)
    const response = {
      status: 'ready',
      schemaVersion: 1,
      routeIdentity,
      presentationHash: 'B'.repeat(43),
      data,
    }

    expect(parseRouteSectionsResponse(response, 'b'.repeat(64))).toBeNull()
    expect(parseRouteSectionsResponse({ ...response, presentationHash: 'short' }, routeIdentity)).toBeNull()
    expect(parseRouteSectionsResponse({ ...response, clientSections: [] }, routeIdentity)).toBeNull()

    const coordinateWithExtraTruth = structuredClone(response)
    ;(coordinateWithExtraTruth.data.surface.gravelSections[0].geometry[0] as Record<string, unknown>)
      .sourceObjectId = 123
    expect(parseRouteSectionsResponse(coordinateWithExtraTruth, routeIdentity)).toBeNull()
  })

  it('applies section bounds while parsing untrusted ready JSON', () => {
    const routeIdentity = 'a'.repeat(64)
    const sectionCount = ROUTE_SECTIONS_MAX_SECTION_COUNT + 1
    const portions = Array.from({ length: sectionCount }, (_, index) => ({
      startDistanceM: index,
      endDistanceM: index + 1,
      distanceM: 1,
      geometry: [POINT_A, POINT_B],
    }))
    const response = {
      status: 'ready',
      schemaVersion: 1,
      routeIdentity,
      presentationHash: 'B'.repeat(43),
      data: {
        coverage: {
          status: 'complete',
          routeDistanceM: sectionCount,
          assessedDistanceM: sectionCount,
          unassessedDistanceM: 0,
        },
        surface: {
          pavedM: 0,
          gravelM: sectionCount,
          mixedM: 0,
          unknownM: 0,
          gravelSections: portions,
        },
        direction: { status: 'unavailable' },
      },
    }
    expect(parseRouteSectionsResponse(response, routeIdentity)).toBeNull()
  })

  it('requires exact section sums while parsing untrusted ready JSON', () => {
    const data = buildRouteSectionsData(evidence())!
    const routeIdentity = 'a'.repeat(64)
    const response = {
      status: 'ready',
      schemaVersion: 1,
      routeIdentity,
      presentationHash: 'B'.repeat(43),
      data,
    }

    expect(parseRouteSectionsResponse({
      ...response,
      data: {
        ...data,
        surface: {
          pavedM: 996,
          gravelM: 4,
          mixedM: 0,
          unknownM: 0,
          gravelSections: [],
        },
      },
    }, routeIdentity)).toBeNull()

    expect(parseRouteSectionsResponse({
      ...response,
      data: {
        ...data,
        direction: {
          status: 'verified',
          authoritativeM: 996,
          inferredM: 4,
          inferredSections: [],
        },
      },
    }, routeIdentity)).toBeNull()
  })

  it.each([null, true, 1, 'ready', [], {}, { status: 'ready' }])(
    'never throws for malformed client JSON: %j',
    value => {
      expect(parseRouteSectionsResponse(value, 'a'.repeat(64))).toBeNull()
    },
  )
})
