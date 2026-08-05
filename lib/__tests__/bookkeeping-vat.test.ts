import { describe, expect, it } from 'vitest'
import {
  computeVatSummary,
  formatVatSummaryForCopy,
  traceEntriesForField,
  type BookkeepingEntry,
  type BookkeepingEntryLine,
} from '@/lib/bookkeeping'

const timestamp = '2026-06-15T12:00:00.000Z'

function makeLine(
  id: string,
  overrides: Partial<BookkeepingEntryLine> = {},
): BookkeepingEntryLine {
  return {
    id,
    entryId: 'entry-1',
    categoryCode: null,
    description: null,
    vatTreatment: 'taxable_24',
    currency: 'ISK',
    amountIncludesVat: true,
    grossMinor: 124_000,
    netMinor: 100_000,
    vatMinor: 24_000,
    inputVatDeductibility: 'not_applicable',
    deductibleVatMinor: 0,
    manualVatOverride: false,
    manualVatOverrideReason: null,
    exemptTurnoverConfirmed: false,
    ...overrides,
  }
}

function makeEntry(
  id: string,
  overrides: Partial<BookkeepingEntry> = {},
): BookkeepingEntry {
  const lines = overrides.lines ?? [makeLine(`${id}-line`, { entryId: id })]
  return {
    id,
    entityId: 'entity-1',
    vatRegistrationId: 'registration-1',
    periodId: 'period-1',
    type: 'sale',
    documentDate: '2026-06-15',
    reportingDate: '2026-06-15',
    counterparty: 'Prófun ehf.',
    description: 'Prófunarfærsla',
    documentType: 'invoice',
    documentReference: id,
    duplicateReferenceConfirmed: false,
    currency: 'ISK',
    sourceType: 'manual',
    sourceId: null,
    sourceReference: null,
    reviewState: 'reviewed',
    evidence: {
      originalDocumentPreserved: false,
      businessPurposeConfirmed: false,
      sellerVatRegistrationConfirmed: null,
    },
    specialCases: {
      foreignService: 'not_applicable',
      import: 'not_applicable',
      mixedUse: 'not_applicable',
      uncertainDeductibility: 'not_applicable',
    },
    specialCaseResolutionNote: null,
    version: 1,
    settlementState: 'open',
    settlementVersion: 0,
    settledAt: null,
    voidedAt: null,
    lines,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

describe('bookkeeping VAT summary', () => {
  it('keeps A-F identical when only operational settlement changes', () => {
    const open = makeEntry('sale')
    const settled = makeEntry('sale', {
      settlementState: 'settled',
      settlementVersion: 1,
      settledAt: timestamp,
    })
    expect(computeVatSummary([settled])).toEqual(computeVatSummary([open]))
  })

  it('maps canonical 24% and 11% sales to A, B and stored output VAT D', () => {
    const summary = computeVatSummary([
      makeEntry('sale-24'),
      makeEntry('sale-11', {
        lines: [makeLine('sale-11-line', {
          entryId: 'sale-11',
          vatTreatment: 'taxable_11',
          grossMinor: 111_000,
          netMinor: 100_000,
          vatMinor: 11_000,
        })],
      }),
    ])

    expect(summary.fields).toEqual({
      A: 100_000,
      B: 100_000,
      C: 0,
      D: 35_000,
      E: 0,
      F: 35_000,
    })
    expect(summary.outputVat24Minor).toBe(24_000)
    expect(summary.outputVat11Minor).toBe(11_000)
  })

  it('supports mixed-rate lines and traces each field back to line and entry IDs', () => {
    const entry = makeEntry('mixed', {
      lines: [
        makeLine('mixed-24', { entryId: 'mixed' }),
        makeLine('mixed-11', {
          entryId: 'mixed',
          vatTreatment: 'taxable_11',
          grossMinor: 55_500,
          netMinor: 50_000,
          vatMinor: 5_500,
        }),
      ],
    })
    const summary = computeVatSummary([entry])

    expect(summary.fields.A).toBe(100_000)
    expect(summary.fields.B).toBe(50_000)
    expect(summary.fields.D).toBe(29_500)
    expect(traceEntriesForField(summary, 'D').map((trace) => trace.lineId))
      .toEqual(['mixed-24', 'mixed-11'])
    expect(traceEntriesForField(summary, 'F')).toHaveLength(2)
  })

  it('puts only confirmed exempt turnover into C and excludes outside-scope values', () => {
    const summary = computeVatSummary([makeEntry('zero-rates', {
      lines: [
        makeLine('confirmed-c', {
          entryId: 'zero-rates',
          vatTreatment: 'exempt_turnover',
          grossMinor: 80_000,
          netMinor: 80_000,
          vatMinor: 0,
          exemptTurnoverConfirmed: true,
        }),
        makeLine('unconfirmed-c', {
          entryId: 'zero-rates',
          vatTreatment: 'exempt_turnover',
          grossMinor: 20_000,
          netMinor: 20_000,
          vatMinor: 0,
        }),
        makeLine('outside', {
          entryId: 'zero-rates',
          vatTreatment: 'outside_scope',
          grossMinor: 500_000,
          netMinor: 500_000,
          vatMinor: 0,
        }),
      ],
    })])

    expect(summary.fields.C).toBe(80_000)
    expect(summary.fields.A).toBe(0)
    expect(summary.fields.B).toBe(0)
    expect(summary.fields.D).toBe(0)
    expect(traceEntriesForField(summary, 'C').map((trace) => trace.lineId))
      .toEqual(['confirmed-c'])
  })

  it('includes only evidenced deductible input VAT in E', () => {
    const deductibleLine = makeLine('purchase-line', {
      entryId: 'purchase',
      inputVatDeductibility: 'fully_deductible',
      deductibleVatMinor: 24_000,
    })
    const evidenced = makeEntry('purchase', {
      type: 'purchase',
      evidence: {
        originalDocumentPreserved: true,
        businessPurposeConfirmed: true,
        sellerVatRegistrationConfirmed: true,
      },
      lines: [deductibleLine],
    })
    const noEvidence = makeEntry('purchase-no-evidence', {
      type: 'purchase',
      lines: [makeLine('purchase-no-evidence-line', {
        entryId: 'purchase-no-evidence',
        inputVatDeductibility: 'fully_deductible',
        deductibleVatMinor: 24_000,
      })],
    })
    const nonDeductible = makeEntry('purchase-non-deductible', {
      type: 'purchase',
      evidence: evidenced.evidence,
      lines: [makeLine('purchase-non-deductible-line', {
        entryId: 'purchase-non-deductible',
        inputVatDeductibility: 'not_deductible',
      })],
    })

    const summary = computeVatSummary([evidenced, noEvidence, nonDeductible])
    expect(summary.fields.E).toBe(24_000)
    expect(summary.inputVat24Minor).toBe(24_000)
    expect(summary.fields.F).toBe(-24_000)
    expect(traceEntriesForField(summary, 'E').map((trace) => trace.entryId))
      .toEqual(['purchase'])
  })

  it('applies credit signs to sales and purchases', () => {
    const sale = makeEntry('sale')
    const salesCredit = makeEntry('sales-credit', { type: 'sales_credit' })
    const purchase = makeEntry('purchase', {
      type: 'purchase',
      evidence: {
        originalDocumentPreserved: true,
        businessPurposeConfirmed: true,
        sellerVatRegistrationConfirmed: true,
      },
      lines: [makeLine('purchase-line', {
        entryId: 'purchase',
        inputVatDeductibility: 'fully_deductible',
        deductibleVatMinor: 24_000,
      })],
    })
    const purchaseCredit = makeEntry('purchase-credit', {
      ...purchase,
      id: 'purchase-credit',
      type: 'purchase_credit',
      documentReference: 'purchase-credit',
      lines: [makeLine('purchase-credit-line', {
        entryId: 'purchase-credit',
        inputVatDeductibility: 'fully_deductible',
        deductibleVatMinor: 24_000,
      })],
    })

    expect(computeVatSummary([sale, salesCredit, purchase, purchaseCredit]).fields)
      .toEqual({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 })
  })

  it('sums stored invoice VAT rather than recomputing D from aggregate A', () => {
    const summary = computeVatSummary([makeEntry('override', {
      lines: [makeLine('override-line', {
        entryId: 'override',
        netMinor: 100_001,
        vatMinor: 23_999,
        manualVatOverride: true,
        manualVatOverrideReason: 'VSK samkvæmt frumgagni',
      })],
    })])

    expect(summary.fields.A).toBe(100_001)
    expect(summary.fields.D).toBe(23_999)
    expect(summary.fields.F).toBe(23_999)
  })

  it('excludes unreviewed and voided entries and copies plain A-F integers', () => {
    const summary = computeVatSummary([
      makeEntry('reviewed'),
      makeEntry('unreviewed', { reviewState: 'unreviewed' }),
      makeEntry('voided', { voidedAt: timestamp }),
    ])
    expect(summary.fields.A).toBe(100_000)
    expect(formatVatSummaryForCopy(summary)).toBe(
      'A\t100000\nB\t0\nC\t0\nD\t24000\nE\t0\nF\t24000',
    )
  })
})
