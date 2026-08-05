import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAdmin,
  mockGuardBookkeepingAccess,
  mockRevalidatePath,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockGuardBookkeepingAccess: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/bookkeeping/guard', () => ({
  guardBookkeepingAccess: mockGuardBookkeepingAccess,
}))

import {
  addBookkeepingVatRegistration,
  createBookkeepingEntity,
  createBookkeepingPeriod,
  recordBookkeepingFiling,
  recordBookkeepingPayment,
  reopenBookkeepingPeriod,
  saveBookkeepingEntry,
  setBookkeepingEntryReviewState,
  setBookkeepingEntrySettlementState,
  setBookkeepingPeriodReady,
  voidBookkeepingEntry,
} from '@/lib/bookkeeping/actions'
import {
  getBookkeepingDashboard,
  getBookkeepingEntry,
  getBookkeepingPeriod,
} from '@/lib/bookkeeping/repository.server'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const ENTITY_ID = '20000000-0000-4000-8000-000000000001'
const REGISTRATION_ID = '30000000-0000-4000-8000-000000000001'
const PERIOD_ID = '40000000-0000-4000-8000-000000000001'
const ENTRY_ID = '50000000-0000-4000-8000-000000000001'
const REQUEST_ID = '60000000-0000-4000-8000-000000000001'

function entryInput(overrides: Record<string, unknown> = {}) {
  return {
    request_id: REQUEST_ID,
    entity_id: ENTITY_ID,
    vat_registration_id: REGISTRATION_ID,
    period_id: PERIOD_ID,
    entry_id: null,
    expected_version: null,
    type: 'purchase',
    document_date: '2026-06-30',
    reporting_date: '2026-06-30',
    counterparty: 'Viðkvæmur mótaðili ehf.',
    description: 'Tvær VSK-línur',
    document_type: 'invoice',
    document_reference: 'PRIVATE-REF-85000',
    duplicate_reference_confirmed: false,
    currency: 'ISK',
    source_type: 'manual',
    source_id: null,
    source_reference: null,
    review_state: 'reviewed',
    original_document_preserved: true,
    business_purpose_confirmed: true,
    seller_vat_registration_confirmed: true,
    special_cases: {
      foreign_service: 'not_applicable',
      import: 'not_applicable',
      mixed_use: 'not_applicable',
      uncertain_deductibility: 'not_applicable',
    },
    special_case_resolution_note: null,
    note: 'Einkabókhaldsathugasemd',
    lines: [
      {
        client_key: 'line-24',
        line_id: null,
        category_code: 'software',
        description: '24 prósent',
        vat_treatment: 'taxable_24',
        currency: 'ISK',
        amount_includes_vat: true,
        gross_minor: 124_000,
        net_minor: 100_000,
        vat_minor: 24_000,
        input_vat_deductibility: 'fully_deductible',
        deductible_vat_minor: 24_000,
        manual_vat_override: false,
        manual_vat_override_reason: null,
        exempt_turnover_confirmed: false,
      },
      {
        client_key: 'line-11',
        line_id: null,
        category_code: 'other',
        description: '11 prósent',
        vat_treatment: 'taxable_11',
        currency: 'ISK',
        amount_includes_vat: true,
        gross_minor: 111_000,
        net_minor: 100_000,
        vat_minor: 11_000,
        input_vat_deductibility: 'fully_deductible',
        deductible_vat_minor: 11_000,
        manual_vat_override: false,
        manual_vat_override_reason: null,
        exempt_turnover_confirmed: false,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGuardBookkeepingAccess.mockResolvedValue({ user: { id: ACTOR_ID } })
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
  mockRpc.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bookkeeping server guard boundary', () => {
  it('lets every mutation guard redirect escape instead of converting it to an action error', async () => {
    const redirectSignal = new Error('NEXT_REDIRECT')
    mockGuardBookkeepingAccess.mockRejectedValue(redirectSignal)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mutations = [
      createBookkeepingEntity,
      addBookkeepingVatRegistration,
      createBookkeepingPeriod,
      saveBookkeepingEntry,
      setBookkeepingEntryReviewState,
      setBookkeepingEntrySettlementState,
      voidBookkeepingEntry,
      setBookkeepingPeriodReady,
      recordBookkeepingFiling,
      reopenBookkeepingPeriod,
      recordBookkeepingPayment,
    ] as const

    for (const mutation of mutations) {
      await expect(mutation(undefined)).rejects.toBe(redirectSignal)
    }

    expect(mockGuardBookkeepingAccess).toHaveBeenCalledTimes(mutations.length)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })
})

describe('bookkeeping actor-scoped repository boundary', () => {
  it('uses only actor-scoped RPC reads and returns null for absent detail rows', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'bookkeeping_get_dashboard') {
        return { data: { entities: [] }, error: null }
      }
      return { data: null, error: null }
    })

    await expect(getBookkeepingDashboard(ACTOR_ID)).resolves.toEqual({ entities: [] })
    await expect(getBookkeepingPeriod(ACTOR_ID, PERIOD_ID)).resolves.toBeNull()
    await expect(getBookkeepingEntry(ACTOR_ID, ENTRY_ID)).resolves.toBeNull()

    expect(mockRpc.mock.calls).toEqual([
      ['bookkeeping_get_dashboard', { p_actor_id: ACTOR_ID }],
      ['bookkeeping_get_period', { p_actor_id: ACTOR_ID, p_period_id: PERIOD_ID }],
      ['bookkeeping_get_entry', { p_actor_id: ACTOR_ID, p_entry_id: ENTRY_ID }],
    ])
  })

  it('collapses not_allowed and not_found detail responses to the same null result', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: { private: true }, error: { message: 'not_allowed' } })
      .mockResolvedValueOnce({ data: { private: true }, error: { message: 'not_found' } })

    await expect(getBookkeepingPeriod(ACTOR_ID, PERIOD_ID)).resolves.toBeNull()
    await expect(getBookkeepingEntry(ACTOR_ID, ENTRY_ID)).resolves.toBeNull()
  })
})

describe('bookkeeping entry action contract', () => {
  it('sends only the independent settlement CAS contract and curates the result', async () => {
    mockRpc.mockResolvedValue({
      data: {
        entry_id: ENTRY_ID,
        period_id: PERIOD_ID,
        settlement_state: 'settled',
        settlement_version: 3,
        settled_at: '2026-08-05T07:00:00.000Z',
        gross_minor: 124_000,
      },
      error: null,
    })

    const result = await setBookkeepingEntrySettlementState({
      request_id: REQUEST_ID,
      entity_id: ENTITY_ID,
      entry_id: ENTRY_ID,
      expected_settlement_version: 2,
      settlement_state: 'settled',
    })

    expect(mockRpc).toHaveBeenCalledWith('bookkeeping_set_entry_settlement_state', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_entry_id: ENTRY_ID,
      p_expected_settlement_version: 2,
      p_settlement_state: 'settled',
    })
    expect(result).toEqual({
      ok: true,
      data: {
        periodId: PERIOD_ID,
        entryId: ENTRY_ID,
        settlementState: 'settled',
        settlementVersion: 3,
        settledAt: '2026-08-05T07:00:00.000Z',
      },
    })
  })

  it('maps bounded multi-line JSON for both create and versioned update and curates results', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          entry_id: ENTRY_ID,
          period_id: PERIOD_ID,
          version: 1,
          counterparty_name: 'must not escape',
          gross_minor: 235_000,
          document_reference: 'must not escape',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          entry_id: ENTRY_ID,
          period_id: PERIOD_ID,
          version: 8,
          internal_payload: { financials: 'must not escape' },
        },
        error: null,
      })

    const created = await saveBookkeepingEntry(entryInput())
    const createCall = mockRpc.mock.calls[0]!
    expect(createCall[0]).toBe('bookkeeping_create_entry')
    expect(createCall[1]).toEqual({
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_period_id: PERIOD_ID,
      p_entry: expect.objectContaining({
        entity_id: ENTITY_ID,
        vat_registration_id: REGISTRATION_ID,
        period_id: PERIOD_ID,
        entry_id: null,
        expected_version: null,
        type: 'purchase',
        counterparty: 'Viðkvæmur mótaðili ehf.',
        document_reference: 'PRIVATE-REF-85000',
        original_document_preserved: true,
        business_purpose_confirmed: true,
        seller_vat_registration_confirmed: true,
        special_cases: {
          foreign_service: 'not_applicable',
          import: 'not_applicable',
          mixed_use: 'not_applicable',
          uncertain_deductibility: 'not_applicable',
        },
        lines: [
          {
            client_key: 'line-24',
            line_id: null,
            category_code: 'software',
            description: '24 prósent',
            vat_treatment: 'taxable_24',
            currency: 'ISK',
            amount_includes_vat: true,
            gross_minor: 124_000,
            net_minor: 100_000,
            vat_minor: 24_000,
            input_vat_deductibility: 'fully_deductible',
            deductible_vat_minor: 24_000,
            manual_vat_override: false,
            manual_vat_override_reason: null,
            exempt_turnover_confirmed: false,
          },
          {
            client_key: 'line-11',
            line_id: null,
            category_code: 'other',
            description: '11 prósent',
            vat_treatment: 'taxable_11',
            currency: 'ISK',
            amount_includes_vat: true,
            gross_minor: 111_000,
            net_minor: 100_000,
            vat_minor: 11_000,
            input_vat_deductibility: 'fully_deductible',
            deductible_vat_minor: 11_000,
            manual_vat_override: false,
            manual_vat_override_reason: null,
            exempt_turnover_confirmed: false,
          },
        ],
      }),
    })
    expect(created).toEqual({
      ok: true,
      data: { periodId: PERIOD_ID, entryId: ENTRY_ID, version: 1 },
    })
    expect(Object.keys(created.ok ? created.data : {}).sort()).toEqual([
      'entryId', 'periodId', 'version',
    ])

    const updateRequestId = '60000000-0000-4000-8000-000000000002'
    const updated = await saveBookkeepingEntry(entryInput({
      request_id: updateRequestId,
      entry_id: ENTRY_ID,
      expected_version: 7,
    }))
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'bookkeeping_update_entry', {
      p_actor_id: ACTOR_ID,
      p_request_id: updateRequestId,
      p_entry_id: ENTRY_ID,
      p_expected_version: 7,
      p_entry: expect.objectContaining({
        entity_id: ENTITY_ID,
        vat_registration_id: REGISTRATION_ID,
        period_id: PERIOD_ID,
        entry_id: ENTRY_ID,
        expected_version: 7,
        type: 'purchase',
        lines: expect.arrayContaining([
          expect.objectContaining({ vat_treatment: 'taxable_24' }),
          expect.objectContaining({ vat_treatment: 'taxable_11' }),
        ]),
      }),
    })
    expect(updated).toEqual({
      ok: true,
      data: { periodId: PERIOD_ID, entryId: ENTRY_ID, version: 8 },
    })
  })
})

describe('final SQL98 setup and filing RPC contracts', () => {
  it('creates entity and first VAT registration atomically with both confirmations', async () => {
    mockRpc.mockResolvedValue({
      data: {
        entity_id: ENTITY_ID,
        registration_id: REGISTRATION_ID,
        legal_identifier: 'must not escape',
      },
      error: null,
    })

    const result = await createBookkeepingEntity({
      request_id: REQUEST_ID,
      display_name: 'Prófunarbókhald',
      legal_name: 'Prófun ehf.',
      legal_identifier: '000000-0000',
      default_currency: 'ISK',
      details_confirmed: true,
      vat_registration: {
        vat_number: '123456',
        label: 'Aðalstarfsemi',
        filing_method: 'general_bimonthly',
        details_confirmed: true,
      },
    })

    expect(mockRpc).toHaveBeenCalledWith('bookkeeping_create_entity', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_display_name: 'Prófunarbókhald',
      p_legal_name: 'Prófun ehf.',
      p_legal_identifier: '000000-0000',
      p_default_currency: 'ISK',
      p_entity_details_confirmed: true,
      p_vat_number: '123456',
      p_vat_label: 'Aðalstarfsemi',
      p_filing_method: 'general_bimonthly',
      p_registration_details_confirmed: true,
    })
    expect(result).toEqual({
      ok: true,
      data: { entityId: ENTITY_ID, registrationId: REGISTRATION_ID },
    })
    expect(Object.keys(result.ok ? result.data : {}).sort()).toEqual([
      'entityId', 'registrationId',
    ])
  })

  it('adds a VAT registration with the exact final filing-method signature', async () => {
    const secondRegistrationId = '30000000-0000-4000-8000-000000000002'
    mockRpc.mockResolvedValue({
      data: {
        registration_id: secondRegistrationId,
        vat_number: 'must not escape',
      },
      error: null,
    })

    const result = await addBookkeepingVatRegistration({
      request_id: REQUEST_ID,
      entity_id: ENTITY_ID,
      vat_number: '654321',
      label: 'Önnur starfsemi',
      filing_method: 'monthly',
      details_confirmed: true,
    })

    expect(mockRpc).toHaveBeenCalledWith('bookkeeping_add_vat_registration', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_entity_id: ENTITY_ID,
      p_vat_number: '654321',
      p_label: 'Önnur starfsemi',
      p_filing_method: 'monthly',
      p_details_confirmed: true,
    })
    expect(result).toEqual({
      ok: true,
      data: { entityId: ENTITY_ID, registrationId: secondRegistrationId },
    })
  })

  it('creates a period with explicit tenant, filing method, boundaries and confirmation', async () => {
    mockRpc.mockResolvedValue({
      data: {
        period_id: PERIOD_ID,
        internal_registration_snapshot: 'must not escape',
      },
      error: null,
    })

    const result = await createBookkeepingPeriod({
      request_id: REQUEST_ID,
      entity_id: ENTITY_ID,
      vat_registration_id: REGISTRATION_ID,
      filing_method: 'general_bimonthly',
      starts_on: '2026-05-01',
      ends_on: '2026-06-30',
      due_on: '2026-08-05',
      period_dates_confirmed: true,
    })

    expect(mockRpc).toHaveBeenCalledWith('bookkeeping_create_period', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_entity_id: ENTITY_ID,
      p_registration_id: REGISTRATION_ID,
      p_filing_method: 'general_bimonthly',
      p_starts_on: '2026-05-01',
      p_ends_on: '2026-06-30',
      p_due_on: '2026-08-05',
      p_period_dates_confirmed: true,
    })
    expect(result).toEqual({ ok: true, data: { periodId: PERIOD_ID } })
  })

  it('records a filing with the exact immutable A-F snapshot payload', async () => {
    const fields = {
      A: 100_000,
      B: 50_000,
      C: 0,
      D: 29_500,
      E: 9_500,
      F: 20_000,
    }
    mockRpc.mockResolvedValue({
      data: {
        period_id: PERIOD_ID,
        version: 5,
        filing_snapshot: { counterparty_name: 'must not escape' },
      },
      error: null,
    })

    const result = await recordBookkeepingFiling({
      request_id: REQUEST_ID,
      entity_id: ENTITY_ID,
      period_id: PERIOD_ID,
      expected_version: 4,
      submitted_on: '2026-08-05',
      due_on: '2026-08-05',
      fields,
      reported_result_minor: 20_000,
      result_mismatch_reason: null,
      confirmation_reference: 'SKATTUR-CONFIRMATION',
      note: 'Skil skráð handvirkt',
      payment_state: 'unpaid',
      paid_on: null,
    })

    expect(mockRpc).toHaveBeenCalledWith('bookkeeping_record_filing', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_period_id: PERIOD_ID,
      p_expected_version: 4,
      p_submitted_on: '2026-08-05',
      p_due_on: '2026-08-05',
      p_fields: fields,
      p_reported_result_minor: 20_000,
      p_result_mismatch_reason: null,
      p_confirmation_reference: 'SKATTUR-CONFIRMATION',
      p_note: 'Skil skráð handvirkt',
      p_payment_status: 'unpaid',
      p_paid_on: null,
    })
    expect(result).toEqual({
      ok: true,
      data: { periodId: PERIOD_ID, version: 5 },
    })
    expect(Object.keys(result.ok ? result.data : {}).sort()).toEqual(['periodId', 'version'])
  })
})

describe('bookkeeping generic error privacy', () => {
  it('returns and logs only stable errors, never database or ledger payloads', async () => {
    const secretParts = [
      'Viðkvæmur mótaðili ehf.',
      'PRIVATE-REF-85000',
      '235000',
      'Einkabókhaldsathugasemd',
      'raw_database_policy_detail',
    ]
    const databaseMessage = secretParts.join(' | ')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValueOnce({
      data: { raw_financial_payload: entryInput() },
      error: { message: databaseMessage, code: 'XX000' },
    })

    const actionResult = await saveBookkeepingEntry(entryInput())
    expect(actionResult).toEqual({
      ok: false,
      error: { code: 'unexpected_error', message: 'unexpected_error' },
    })

    mockRpc.mockResolvedValueOnce({
      data: { raw_financial_payload: entryInput() },
      error: { message: databaseMessage, code: 'XX000' },
    })
    await expect(getBookkeepingDashboard(ACTOR_ID))
      .rejects.toThrow('bookkeeping_load_failed')

    const exposed = JSON.stringify({ actionResult, logs: consoleError.mock.calls })
    for (const secret of secretParts) expect(exposed).not.toContain(secret)
    expect(consoleError.mock.calls).toEqual([
      ['[bookkeeping] save entry failed'],
      ['[bookkeeping] dashboard query failed'],
    ])
  })
})
