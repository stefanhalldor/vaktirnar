import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import generatedDirectory from '@/lib/places/officialPlaceDirectory.generated.json'
import {
  assertConsistentOfficialPostalLocalityRecords,
  buildDeterministicOfficialPlaceDirectory,
  serializeOfficialPlaceDirectory,
} from '../../scripts/official-place-directory-identity.mjs'

function legacyV2Input() {
  return {
    schemaVersion: 2,
    generatedAt: `${generatedDirectory.retrievedDate}T00:00:00.000Z`,
    sources: Object.fromEntries(Object.entries(generatedDirectory.sources).map(([key, source]) => [
      key,
      {
        dataset: source.dataset,
        metadataUrl: source.metadataUrl,
        dataUrl: source.dataUrl,
        featureCount: source.featureCount,
        contentSha256: source.contentSha256,
      },
    ])),
    settlements: generatedDirectory.settlements,
    postalLocalities: Object.fromEntries(
      Object.entries(generatedDirectory.postalLocalities).map(([postalCode, locality]) => [
        postalCode,
        {
          name: locality.name,
          classification: locality.classification,
          sourceId: locality.sourceId,
          correctedAt: locality.correctedAt,
        },
      ]),
    ),
  }
}

describe('official place directory deterministic generator core', () => {
  it('regenerates the checked-in artifact byte-for-byte from the same offline input', () => {
    const input = legacyV2Input()
    const first = buildDeterministicOfficialPlaceDirectory(input)
    const second = buildDeterministicOfficialPlaceDirectory(input)
    const checkedIn = readFileSync(
      'lib/places/officialPlaceDirectory.generated.json',
      'utf8',
    )

    expect(serializeOfficialPlaceDirectory(second)).toBe(serializeOfficialPlaceDirectory(first))
    expect(serializeOfficialPlaceDirectory(first)).toBe(checkedIn)
  })

  it('canonicalizes equivalent feature, source and identity input ordering', () => {
    const permuted = {
      ...legacyV2Input(),
      sources: {
        postal: legacyV2Input().sources.postal,
        is50v: legacyV2Input().sources.is50v,
        hagstofa: legacyV2Input().sources.hagstofa,
      },
      settlements: [...generatedDirectory.settlements]
        .reverse()
        .map(settlement => ({
          ...settlement,
          aliases: [...settlement.aliases].reverse(),
          postalCodes: [...settlement.postalCodes].reverse(),
          is50vIds: [...settlement.is50vIds].reverse(),
        })),
      postalLocalities: Object.fromEntries(
        Object.entries(legacyV2Input().postalLocalities).reverse(),
      ),
    }

    expect(serializeOfficialPlaceDirectory(
      buildDeterministicOfficialPlaceDirectory(permuted),
    )).toBe(serializeOfficialPlaceDirectory(
      buildDeterministicOfficialPlaceDirectory(legacyV2Input()),
    ))
  })

  it('records one retrieval date for each immutable source content version', () => {
    const snapshot = buildDeterministicOfficialPlaceDirectory(legacyV2Input())

    expect(Object.values(snapshot.sources).every(source => (
      source.retrievedDate === snapshot.retrievedDate
      && /^[a-f0-9]{64}$/.test(source.contentSha256)
    ))).toBe(true)
  })

  it('fails closed on classification and source provenance drift', () => {
    const invalidClassification = legacyV2Input()
    invalidClassification.postalLocalities['101'] = {
      ...invalidClassification.postalLocalities['101'],
      classification: 'Urban',
    }
    expect(() => buildDeterministicOfficialPlaceDirectory(invalidClassification))
      .toThrow('postal_101_classification_invalid')

    const invalidProvenance = legacyV2Input()
    invalidProvenance.sources.postal = {
      ...invalidProvenance.sources.postal,
      contentSha256: 'not-a-content-hash',
    }
    expect(() => buildDeterministicOfficialPlaceDirectory(invalidProvenance))
      .toThrow('postal_provenance_invalid')
  })

  it('does not re-date offline source content or hide source-date drift', () => {
    const differentDate = generatedDirectory.retrievedDate === '2026-07-28'
      ? '2026-07-27'
      : '2000-01-01'
    const sourceDatedInput = {
      ...legacyV2Input(),
      retrievedDate: generatedDirectory.retrievedDate,
      sources: Object.fromEntries(Object.entries(generatedDirectory.sources).map(([key, source]) => [
        key,
        { ...source },
      ])),
    }

    expect(() => buildDeterministicOfficialPlaceDirectory(sourceDatedInput, {
      retrievedDate: differentDate,
    })).toThrow('retrieved_date_override_mismatch')

    const driftedSourceInput = {
      ...sourceDatedInput,
      sources: {
        ...sourceDatedInput.sources,
        postal: {
          ...sourceDatedInput.sources.postal,
          retrievedDate: differentDate,
        },
      },
    }
    expect(() => buildDeterministicOfficialPlaceDirectory(driftedSourceInput))
      .toThrow('postal_retrieved_date_mismatch')
  })

  it('fails closed on ambiguous duplicate postal polygon identity', () => {
    const record = {
      name: 'Prófunarstaður',
      classification: 'Dreifbýli',
      sourceId: 'official-postal-source',
    }
    expect(() => assertConsistentOfficialPostalLocalityRecords('999', [
      record,
      { ...record, classification: 'Þéttbýli' },
    ])).toThrow('postal_classification_conflict_999')
    expect(() => assertConsistentOfficialPostalLocalityRecords('999', [
      record,
      { ...record, sourceId: 'different-official-source' },
    ])).toThrow('postal_source_identity_conflict_999')
  })
})
