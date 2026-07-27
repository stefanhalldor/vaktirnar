import { describe, expect, it, vi } from 'vitest'
import {
  HAGSTOFA_MUNICIPALITY_API_URL,
  MUNICIPALITY_NAMES_2026,
  loadMunicipalityNames,
  parseHagstofaMunicipalityMetadata,
} from '@/lib/places/municipalities'

function validMetadata() {
  const entries = Object.entries(MUNICIPALITY_NAMES_2026)
  return {
    variables: [
      { code: 'Ár', values: ['2026'], valueTexts: ['2026'] },
      {
        code: 'Sveitarfélag',
        values: ['9999', ...entries.map(([code]) => code)],
        valueTexts: ['Alls', ...entries.map(([, name]) => name)],
      },
    ],
  }
}

describe('Hagstofa municipality metadata', () => {
  it('keeps a substantial checked-in 2026 last-known-good directory', () => {
    expect(Object.keys(MUNICIPALITY_NAMES_2026).length).toBeGreaterThanOrEqual(50)
    expect(MUNICIPALITY_NAMES_2026).toMatchObject({
      '0000': 'Reykjavíkurborg',
      '7300': 'Fjarðabyggð',
      '7400': 'Múlaþing',
    })
    expect(MUNICIPALITY_NAMES_2026).not.toHaveProperty('9999')
  })

  it('parses complete PxWeb metadata and excludes the aggregate row', () => {
    const parsed = parseHagstofaMunicipalityMetadata(validMetadata())

    expect(parsed).not.toBeNull()
    expect(parsed).toMatchObject(MUNICIPALITY_NAMES_2026)
    expect(parsed).not.toHaveProperty('9999')
    expect(Object.isFrozen(parsed)).toBe(true)
  })

  it.each([
    null,
    {},
    { variables: [] },
    { variables: [{ code: 'Sveitarfélag', values: ['0000'], valueTexts: [] }] },
    { variables: [{ code: 'Sveitarfélag', values: ['0000'], valueTexts: ['Reykjavíkurborg'] }] },
  ])('rejects partial or structurally invalid metadata', (metadata) => {
    expect(parseHagstofaMunicipalityMetadata(metadata)).toBeNull()
  })
})

describe('municipality directory loading', () => {
  it('uses validated Hagstofa metadata when the official endpoint succeeds', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(validMetadata()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const result = await loadMunicipalityNames({ fetchImpl })

    expect(result.source).toBe('hagstofa')
    expect(result.names).toMatchObject(MUNICIPALITY_NAMES_2026)
    expect(fetchImpl).toHaveBeenCalledWith(HAGSTOFA_MUNICIPALITY_API_URL, expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    }))
  })

  it.each([
    ['HTTP failure', vi.fn(async () => new Response('unavailable', { status: 503 }))],
    ['network failure', vi.fn(async () => { throw new Error('network detail') })],
    ['invalid official metadata', vi.fn(async () => new Response(JSON.stringify({ variables: [] }), { status: 200 }))],
  ])('falls back to the checked-in 2026 directory on %s', async (_label, fetchImpl) => {
    const result = await loadMunicipalityNames({ fetchImpl })

    expect(result).toEqual({ names: MUNICIPALITY_NAMES_2026, source: 'static' })
  })
})
