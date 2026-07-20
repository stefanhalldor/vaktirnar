import { describe, it, expect } from 'vitest'
import {
  ICELAND_ROAD_CAUTIONS,
  ICELAND_ROAD_INTELLIGENCE_ALTERNATIVES,
  resolveRoadIntelligence,
} from '@/lib/iceland-routes'

const ASCII_SLUG_RE = /^[a-z0-9-]+$/

describe('Road Intelligence static registry', () => {
  it('keeps alternative and caution IDs ASCII slug-safe and unique', () => {
    const alternativeIds = ICELAND_ROAD_INTELLIGENCE_ALTERNATIVES.map(a => a.id)
    const cautionIds = ICELAND_ROAD_CAUTIONS.map(c => c.id)

    expect(new Set(alternativeIds).size).toBe(alternativeIds.length)
    expect(new Set(cautionIds).size).toBe(cautionIds.length)

    for (const id of [...alternativeIds, ...cautionIds]) {
      expect(ASCII_SLUG_RE.test(id), `ID "${id}" is not ASCII slug-safe`).toBe(true)
    }
  })

  it('marks all first-pass alternatives as unverified drafts', () => {
    for (const alternative of ICELAND_ROAD_INTELLIGENCE_ALTERNATIVES) {
      expect(alternative.verified).toBe(false)
    }
  })
})

describe('resolveRoadIntelligence', () => {
  it('resolves Reykjavík to Egilsstaðir with east alternatives and cautions', () => {
    const result = resolveRoadIntelligence('reykjavik', 'egilsstadir')

    expect(result.status).toBe('resolved')
    expect(result.source).toBe('teskeid_registry')
    expect(result.confidence).toBe('draft')
    expect(result.routeFamilyId).toBe('capital-east-iceland')
    expect(result.alternatives.map(a => a.id)).toEqual([
      'rvk-east-via-hellisheidi',
      'rvk-east-sleppa-oxi',
      'rvk-east-um-firdi',
    ])
    expect(result.cautions.map(c => c.id)).toEqual(expect.arrayContaining([
      'hellisheidi-vindnaemt',
      'oxi-fjallvegur',
    ]))
  })

  it('resolves bidirectionally for Egilsstaðir to Reykjavík', () => {
    const forward = resolveRoadIntelligence('reykjavik', 'egilsstadir')
    const reverse = resolveRoadIntelligence('egilsstadir', 'reykjavik')

    expect(reverse.status).toBe('resolved')
    expect(reverse.routeFamilyId).toBe(forward.routeFamilyId)
    expect(reverse.alternatives.map(a => a.id)).toEqual(forward.alternatives.map(a => a.id))
  })

  it('accepts display labels with Icelandic letters, not only route-memory keys', () => {
    const result = resolveRoadIntelligence('Reykjavík', 'Ísafjörður')

    expect(result.status).toBe('resolved')
    expect(result.routeFamilyId).toBe('capital-westfjords')
    expect(result.alternatives.map(a => a.id)).toEqual(['rvk-isafjordur-via-holmavik'])
  })

  it('resolves Reykjavík to Akureyri to the north family', () => {
    const result = resolveRoadIntelligence('reykjavik', 'akureyri')

    expect(result.status).toBe('resolved')
    expect(result.routeFamilyId).toBe('capital-north-iceland')
    expect(result.alternatives.map(a => a.id)).toEqual(['rvk-akureyri-hringvegurinn'])
  })

  it('normalizes aliases with spaces before matching', () => {
    const result = resolveRoadIntelligence('Reykjavík', 'Vík í Mýrdal')

    expect(result.status).toBe('resolved')
    expect(result.routeFamilyId).toBe('capital-south-coast')
    expect(result.alternatives).toEqual([])
  })

  it('returns unknown for route pairs outside the first static registry slice', () => {
    expect(resolveRoadIntelligence('akureyri', 'egilsstadir').status).toBe('unknown')
    expect(resolveRoadIntelligence('reykjavik', 'þykkvabæjarklaustur').status).toBe('unknown')
  })
})
