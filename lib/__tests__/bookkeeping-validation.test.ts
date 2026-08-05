import { describe, expect, it } from 'vitest'
import {
  CreateBookkeepingEntitySchema,
  CreateBookkeepingPeriodSchema,
  RecordBookkeepingFilingSchema,
  ReopenBookkeepingPeriodSchema,
  SaveBookkeepingEntrySchema,
  SetBookkeepingEntrySettlementStateSchema,
  type SaveBookkeepingEntryInput,
} from '@/lib/bookkeeping'

const requestId = '11111111-1111-4111-8111-111111111111'
const entityId = '22222222-2222-4222-8222-222222222222'
const registrationId = '33333333-3333-4333-8333-333333333333'
const periodId = '44444444-4444-4444-8444-444444444444'
const entryId = '55555555-5555-4555-8555-555555555555'

function validEntryInput(): SaveBookkeepingEntryInput {
  return {
    request_id: requestId,
    entity_id: entityId,
    vat_registration_id: registrationId,
    period_id: periodId,
    entry_id: null,
    expected_version: null,
    type: 'sale' as const,
    document_date: '2026-05-01',
    reporting_date: '2026-05-01',
    counterparty: 'Prófun ehf.',
    description: 'Prófunarsala',
    document_type: 'invoice',
    document_reference: 'INV-1',
    duplicate_reference_confirmed: false,
    currency: 'ISK' as const,
    source_type: 'manual',
    source_id: null,
    source_reference: null,
    review_state: 'reviewed' as const,
    original_document_preserved: true,
    business_purpose_confirmed: true,
    seller_vat_registration_confirmed: null,
    special_cases: {
      foreign_service: 'not_applicable' as const,
      import: 'not_applicable' as const,
      mixed_use: 'not_applicable' as const,
      uncertain_deductibility: 'not_applicable' as const,
    },
    special_case_resolution_note: null,
    note: null,
    lines: [{
      client_key: 'line-1',
      line_id: null,
      category_code: null,
      description: null,
      vat_treatment: 'taxable_24' as const,
      currency: 'ISK' as const,
      amount_includes_vat: true,
      gross_minor: 124_000,
      net_minor: 100_000,
      vat_minor: 24_000,
      input_vat_deductibility: 'not_applicable' as const,
      deductible_vat_minor: 0,
      manual_vat_override: false,
      manual_vat_override_reason: null,
      exempt_turnover_confirmed: false,
    }],
  }
}

describe('bookkeeping input validation', () => {
  it('accepts a narrowly scoped ISK entity and normalizes optional blanks', () => {
    const parsed = CreateBookkeepingEntitySchema.parse({
      request_id: requestId,
      display_name: '  Gervifyrirtæki  ',
      legal_name: '',
      legal_identifier: null,
      default_currency: 'ISK',
      details_confirmed: true,
    })
    expect(parsed.display_name).toBe('Gervifyrirtæki')
    expect(parsed.legal_name).toBeNull()
    expect(CreateBookkeepingEntitySchema.safeParse({
      ...parsed,
      default_currency: 'EUR',
    }).success).toBe(false)
  })

  it('validates general bimonthly dates and real ISO calendar dates', () => {
    expect(CreateBookkeepingPeriodSchema.safeParse({
      request_id: requestId,
      entity_id: entityId,
      vat_registration_id: registrationId,
      filing_method: 'general_bimonthly',
      starts_on: '2026-05-01',
      ends_on: '2026-06-30',
      due_on: '2026-08-05',
      period_dates_confirmed: true,
    }).success).toBe(true)
    expect(CreateBookkeepingPeriodSchema.safeParse({
      request_id: requestId,
      entity_id: entityId,
      vat_registration_id: registrationId,
      filing_method: 'general_bimonthly',
      starts_on: '2026-05-01',
      ends_on: '2026-06-31',
      due_on: '2026-08-05',
      period_dates_confirmed: true,
    }).success).toBe(false)
  })

  it('accepts a structurally valid multi-line entry and requires update versions', () => {
    const input = validEntryInput()
    input.lines.push({
      ...input.lines[0],
      client_key: 'line-2',
      vat_treatment: 'taxable_11',
      gross_minor: 111_000,
      net_minor: 100_000,
      vat_minor: 11_000,
    })
    expect(SaveBookkeepingEntrySchema.safeParse(input).success).toBe(true)
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      entry_id: entryId,
      expected_version: null,
    }).success).toBe(false)
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      entry_id: entryId,
      expected_version: 3,
    }).success).toBe(true)
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      entry_id: entryId,
      expected_version: 0,
    }).success).toBe(false)
  })

  it('allows unresolved draft classifications while leaving them for readiness', () => {
    const input = validEntryInput()
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      review_state: 'unreviewed',
      lines: [{
        ...input.lines[0],
        vat_treatment: 'needs_review',
        gross_minor: 100_000,
        net_minor: 100_000,
        vat_minor: 0,
      }],
    }).success).toBe(true)

    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      type: 'purchase',
      review_state: 'unreviewed',
      seller_vat_registration_confirmed: false,
      lines: [{
        ...input.lines[0],
        input_vat_deductibility: 'needs_review',
      }],
    }).success).toBe(true)
  })

  it('rejects amount invariants, wrong deduction semantics and duplicate client keys', () => {
    const input = validEntryInput()
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      lines: [{ ...input.lines[0], gross_minor: 123_999 }],
    }).success).toBe(false)
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      lines: [{
        ...input.lines[0],
        input_vat_deductibility: 'fully_deductible',
        deductible_vat_minor: 24_000,
      }],
    }).success).toBe(false)
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      lines: [input.lines[0], { ...input.lines[0] }],
    }).success).toBe(false)
    const maximumLine = {
      ...input.lines[0],
      vat_treatment: 'outside_scope' as const,
      gross_minor: Number.MAX_SAFE_INTEGER,
      net_minor: Number.MAX_SAFE_INTEGER,
      vat_minor: 0,
    }
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      lines: [maximumLine, { ...maximumLine, client_key: 'line-2' }],
    }).success).toBe(false)
  })

  it('requires an explained manual invoice-VAT override', () => {
    const input = validEntryInput()
    const override = {
      ...input.lines[0],
      net_minor: 100_001,
      vat_minor: 23_999,
      manual_vat_override: true,
    }
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      lines: [override],
    }).success).toBe(false)
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      lines: [{ ...override, manual_vat_override_reason: 'Samkvæmt fylgiskjali' }],
    }).success).toBe(true)
    expect(SaveBookkeepingEntrySchema.safeParse({
      ...input,
      lines: [{
        ...input.lines[0],
        manual_vat_override: false,
        manual_vat_override_reason: 'Úrelt skýring',
      }],
    }).success).toBe(false)
  })

  it('validates independent entry-settlement CAS state', () => {
    const valid = {
      request_id: requestId,
      entity_id: entityId,
      entry_id: entryId,
      expected_settlement_version: 0,
      settlement_state: 'settled',
    }
    expect(SetBookkeepingEntrySettlementStateSchema.safeParse(valid).success).toBe(true)
    expect(SetBookkeepingEntrySettlementStateSchema.safeParse({
      ...valid,
      expected_settlement_version: -1,
    }).success).toBe(false)
    expect(SetBookkeepingEntrySettlementStateSchema.safeParse({
      ...valid,
      settlement_state: 'paid',
    }).success).toBe(false)
  })

  it('requires F=D-E and explains a reported filing mismatch', () => {
    const valid = {
      request_id: requestId,
      entity_id: entityId,
      period_id: periodId,
      expected_version: 2,
      submitted_on: '2026-08-05',
      due_on: '2026-08-05',
      fields: { A: 100_000, B: 0, C: 0, D: 24_000, E: 4_000, F: 20_000 },
      reported_result_minor: 20_000,
      result_mismatch_reason: null,
      confirmation_reference: null,
      note: null,
      payment_state: 'unpaid',
      paid_on: null,
    }
    expect(RecordBookkeepingFilingSchema.safeParse(valid).success).toBe(true)
    expect(RecordBookkeepingFilingSchema.safeParse({
      ...valid,
      fields: { ...valid.fields, F: 19_999 },
    }).success).toBe(false)
    expect(RecordBookkeepingFilingSchema.safeParse({
      ...valid,
      reported_result_minor: 19_999,
    }).success).toBe(false)
    expect(RecordBookkeepingFilingSchema.safeParse({
      ...valid,
      reported_result_minor: 19_999,
      result_mismatch_reason: 'Tala á skattur.is var önnur',
    }).success).toBe(true)
  })

  it('requires a non-empty audit reason to reopen a period', () => {
    expect(ReopenBookkeepingPeriodSchema.safeParse({
      request_id: requestId,
      entity_id: entityId,
      period_id: periodId,
      expected_version: 4,
      reason: '  ',
    }).success).toBe(false)
  })
})
