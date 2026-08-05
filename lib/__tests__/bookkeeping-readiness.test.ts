import { describe, expect, it } from 'vitest'
import {
  assertBookkeepingPeriodEditable,
  assertBookkeepingReopenReason,
  BookkeepingDomainError,
  computeVatSummary,
  evaluatePeriodReadiness,
  isValidPeriodForFilingMethod,
  type BookkeepingEntity,
  type BookkeepingEntry,
  type BookkeepingEntryLine,
  type BookkeepingPeriod,
  type BookkeepingPeriodReadinessContext,
  type BookkeepingVatRegistration,
} from '@/lib/bookkeeping'

const timestamp = '2026-06-15T12:00:00.000Z'

function line(overrides: Partial<BookkeepingEntryLine> = {}): BookkeepingEntryLine {
  return {
    id: 'line-1',
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

function entry(overrides: Partial<BookkeepingEntry> = {}): BookkeepingEntry {
  return {
    id: 'entry-1',
    entityId: 'entity-1',
    vatRegistrationId: 'registration-1',
    periodId: 'period-1',
    type: 'sale',
    documentDate: '2026-05-01',
    reportingDate: '2026-05-01',
    counterparty: 'Gerviviðskiptavinur',
    description: 'Prófun',
    documentType: 'invoice',
    documentReference: 'INV-1',
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
    lines: [line()],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

const entityValue: BookkeepingEntity = {
  id: 'entity-1',
  ownerUserId: 'user-1',
  displayName: 'Gervifyrirtæki',
  legalName: null,
  legalIdentifier: null,
  defaultCurrency: 'ISK',
  detailsConfirmed: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const registrationValue: BookkeepingVatRegistration = {
  id: 'registration-1',
  entityId: 'entity-1',
  vatNumber: 'TEST-VSK',
  label: null,
  filingMethod: 'general_bimonthly',
  detailsConfirmed: true,
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const periodValue: BookkeepingPeriod = {
  id: 'period-1',
  entityId: 'entity-1',
  vatRegistrationId: 'registration-1',
  startsOn: '2026-05-01',
  endsOn: '2026-06-30',
  dueOn: '2026-08-05',
  state: 'review',
  periodDatesConfirmed: true,
  liveFormCompared: true,
  version: 1,
  submittedAt: null,
  reopenedAt: null,
  reopenReason: null,
  createdAt: timestamp,
  updatedAt: timestamp,
}

function context(
  overrides: Partial<BookkeepingPeriodReadinessContext> = {},
): BookkeepingPeriodReadinessContext {
  return {
    entity: entityValue,
    registration: registrationValue,
    period: periodValue,
    entries: [entry()],
    ...overrides,
  }
}

function blockerCodes(value: BookkeepingPeriodReadinessContext): string[] {
  return evaluatePeriodReadiness(value).blockers.map((blocker) => blocker.code)
}

describe('bookkeeping period readiness', () => {
  it('accepts a reviewed May-June period with confirmed setup', () => {
    expect(evaluatePeriodReadiness(context())).toEqual({
      isReady: true,
      blockers: [],
      blockerCounts: {},
    })
  })

  it('keeps filing readiness independent of operational settlement', () => {
    const open = evaluatePeriodReadiness(context({ entries: [entry()] }))
    const settled = evaluatePeriodReadiness(context({ entries: [entry({
      settlementState: 'settled',
      settlementVersion: 1,
      settledAt: timestamp,
    })] }))
    expect(settled).toEqual(open)
  })

  it('validates supported filing period boundaries without guessing custom periods', () => {
    expect(isValidPeriodForFilingMethod(
      '2026-05-01', '2026-06-30', '2026-08-05', 'general_bimonthly',
    )).toBe(true)
    expect(isValidPeriodForFilingMethod(
      '2026-05-02', '2026-06-30', '2026-08-05', 'general_bimonthly',
    )).toBe(false)
    expect(isValidPeriodForFilingMethod(
      '2026-05-01', '2026-05-31', '2026-07-05', 'monthly',
    )).toBe(true)
    expect(isValidPeriodForFilingMethod(
      '2026-01-01', '2026-12-31', null, 'annual',
    )).toBe(true)
    expect(isValidPeriodForFilingMethod(
      '2026-04-10', '2026-04-20', null, 'other',
    )).toBe(true)
  })

  it('blocks unconfirmed setup, unreviewed entries and out-of-period reporting dates', () => {
    const value = context({
      entity: { ...entityValue, detailsConfirmed: false },
      registration: { ...registrationValue, detailsConfirmed: false },
      period: { ...periodValue, periodDatesConfirmed: false, liveFormCompared: false },
      entries: [entry({ reviewState: 'unreviewed', reportingDate: '2026-07-01' })],
    })
    expect(blockerCodes(value)).toEqual(expect.arrayContaining([
      'entity_details_unconfirmed',
      'vat_registration_details_unconfirmed',
      'period_dates_unconfirmed',
      'live_form_not_compared',
      'entry_outside_period',
      'entry_unreviewed',
    ]))
  })

  it('blocks unconfirmed C and incomplete input-VAT evidence', () => {
    const exempt = entry({
      id: 'exempt',
      lines: [line({
        id: 'exempt-line',
        entryId: 'exempt',
        vatTreatment: 'exempt_turnover',
        grossMinor: 10_000,
        netMinor: 10_000,
        vatMinor: 0,
      })],
    })
    const purchase = entry({
      id: 'purchase',
      type: 'purchase',
      documentReference: null,
      lines: [line({
        id: 'purchase-line',
        entryId: 'purchase',
        inputVatDeductibility: 'fully_deductible',
        deductibleVatMinor: 24_000,
      })],
    })
    const codes = blockerCodes(context({ entries: [exempt, purchase] }))
    expect(codes).toEqual(expect.arrayContaining([
      'exempt_turnover_unconfirmed',
      'input_document_reference_missing',
      'input_original_document_unconfirmed',
      'input_business_purpose_unconfirmed',
      'input_seller_vat_registration_unconfirmed',
    ]))
  })

  it('blocks unexplained VAT overrides and every unresolved special case', () => {
    const special = entry({
      lines: [line({
        netMinor: 100_001,
        vatMinor: 23_999,
        manualVatOverride: true,
      })],
      specialCases: {
        foreignService: 'unresolved',
        import: 'unresolved',
        mixedUse: 'unresolved',
        uncertainDeductibility: 'unresolved',
      },
    })
    const codes = blockerCodes(context({ entries: [special] }))
    expect(codes).toEqual(expect.arrayContaining([
      'manual_override_reason_missing',
      'foreign_service_unresolved',
      'import_unresolved',
      'mixed_use_unresolved',
      'uncertain_deductibility_unresolved',
    ]))
  })

  it('requires a note for a resolved special case', () => {
    const codes = blockerCodes(context({
      entries: [entry({
        specialCases: {
          foreignService: 'resolved',
          import: 'not_applicable',
          mixedUse: 'not_applicable',
          uncertainDeductibility: 'not_applicable',
        },
      })],
    }))
    expect(codes).toContain('special_case_resolution_note_missing')
  })

  it('blocks unexplained duplicates but accepts an explicit acknowledgement', () => {
    const first = entry({ id: 'entry-1' })
    const second = entry({
      id: 'entry-2',
      lines: [line({ id: 'line-2', entryId: 'entry-2' })],
    })
    expect(blockerCodes(context({ entries: [first, second] })))
      .toContain('duplicate_document_reference')

    expect(blockerCodes(context({
      entries: [
        { ...first, duplicateReferenceConfirmed: true },
        { ...second, duplicateReferenceConfirmed: true },
      ],
    }))).not.toContain('duplicate_document_reference')
  })

  it('detects a stale or independently inconsistent persisted summary', () => {
    const entries = [entry()]
    const summary = computeVatSummary(entries)
    const staleSummary = {
      ...summary,
      fields: { ...summary.fields, A: summary.fields.A + 1 },
    }
    expect(blockerCodes(context({ entries, summary: staleSummary })))
      .toContain('summary_inconsistent')
  })

  it('locks ready/submitted/paid periods and requires an audit reason to reopen', () => {
    expect(() => assertBookkeepingPeriodEditable('draft')).not.toThrow()
    expect(() => assertBookkeepingPeriodEditable('review')).not.toThrow()
    expect(() => assertBookkeepingPeriodEditable('ready'))
      .toThrow(BookkeepingDomainError)
    expect(() => assertBookkeepingPeriodEditable('submitted'))
      .toThrow(BookkeepingDomainError)
    expect(() => assertBookkeepingPeriodEditable('paid'))
      .toThrow(BookkeepingDomainError)
    expect(assertBookkeepingReopenReason('  Leiðrétting á fylgiskjali  '))
      .toBe('Leiðrétting á fylgiskjali')
    expect(() => assertBookkeepingReopenReason('  ')).toThrow(BookkeepingDomainError)
  })
})
