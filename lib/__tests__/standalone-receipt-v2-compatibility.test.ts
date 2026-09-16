import { describe, expect, it } from 'vitest'
import { parseSplitExtractionV2, parseSplitExtractionV2Text, splitEditV2Schema } from '@/lib/receipt-split/contracts-v2'
const old = { title: 'Wine', currency: 'EUR', incurred_on: '2026-09-15', receipt_total_minor: 1200,
  items: [{ kind: 'item', description: 'Wine', quantity_milli: 1000, total_minor: 1000, confidence_basis_points: 10000, needs_review: false }] }
describe('prepared v2 boundary compatibility', () => {
  it('converts legacy milli exactly and keeps reference total separate', () => {
    const next = parseSplitExtractionV2(old)
    expect(next).toMatchObject({ contract_version: 2, quantity_scale: 3000, receipt_total_minor: 1200 })
    expect(next.items[0]).toMatchObject({ quantity_units: 3000, total_minor: 1000 })
    expect(next.items[0]).not.toHaveProperty('quantity_milli')
    expect(parseSplitExtractionV2(next)).toEqual(next)
  })
  it('accepts optional explanation without requiring an image or a new provider call', () => {
    const next = parseSplitExtractionV2({ ...old, items: [{ ...old.items[0], explanation: 'Bottle', explanation_needs_review: true }] })
    expect(next.items[0]).toMatchObject({ explanation: 'Bottle', explanation_needs_review: true })
    expect(parseSplitExtractionV2Text(JSON.stringify(old)).items[0]).not.toHaveProperty('explanation')
  })
  it('rejects ambiguous version/scale combinations and mixed units', () => {
    expect(() => parseSplitExtractionV2({ ...old, quantity_scale: 3000 })).toThrow()
    expect(() => parseSplitExtractionV2({ ...old, contract_version: 1 })).toThrow()
    const next = parseSplitExtractionV2(old)
    expect(() => parseSplitExtractionV2({ ...next, quantity_scale: 1000 })).toThrow()
    expect(() => parseSplitExtractionV2({ ...next, items: [{ ...next.items[0], quantity_milli: 1000 }] })).toThrow()
  })
  it('preserves 0.333 without pretending it is an exact third; keeps zeros and validates adjustments', () => {
    expect(parseSplitExtractionV2({ ...old, items: [{ ...old.items[0], quantity_milli: 333, total_minor: 0 }] }).items[0])
      .toMatchObject({ quantity_units: 999, total_minor: 0 })
    expect(() => parseSplitExtractionV2({ ...old, items: [{ ...old.items[0], kind: 'tax', quantity_milli: 333 }] })).toThrow()
    expect(() => parseSplitExtractionV2({ ...old, incurred_on: '2026-02-30' })).toThrow()
  })
  it('requires explicit v2 and a line revision for stale-price protection and forbids client actor spoofing', () => {
    const uuid = '00000000-0000-4000-8000-000000000001'
    const value = { contractVersion: 2, quantityScale: 3000, command: 'claim', id: uuid, itemId: uuid,
      requestId: uuid, itemRevision: 1, previousUnits: 0, quantityUnits: 1000 }
    expect(splitEditV2Schema.safeParse(value).success).toBe(true)
    expect(splitEditV2Schema.safeParse({ ...value, actorId: uuid }).success).toBe(false)
    expect(splitEditV2Schema.safeParse({ ...value, itemRevision: undefined }).success).toBe(false)
    expect(splitEditV2Schema.safeParse({ ...value, contractVersion: undefined }).success).toBe(false)
  })
})
