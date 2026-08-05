'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import {
  BOOKKEEPING_FILING_METHODS,
  BOOKKEEPING_PATH,
} from './constants'
import type { BookkeepingActionError, BookkeepingActionResult } from './contracts'
import { guardBookkeepingAccess } from './guard'
import {
  AddBookkeepingVatRegistrationSchema,
  CreateBookkeepingEntitySchema,
  CreateBookkeepingPeriodSchema,
  RecordBookkeepingFilingSchema,
  RecordBookkeepingPaymentSchema,
  ReopenBookkeepingPeriodSchema,
  SaveBookkeepingEntrySchema,
  SetBookkeepingEntryReviewStateSchema,
  SetBookkeepingEntrySettlementStateSchema,
  SetBookkeepingPeriodReadySchema,
  VoidBookkeepingEntrySchema,
} from './validation'

type JsonRecord = Record<string, unknown>

const nullableTrimmed = (max: number) => z.string().trim().max(max)
  .nullable()
  .optional()
  .transform((value) => value || null)

const CreateBookkeepingWorkspaceSchema = CreateBookkeepingEntitySchema.extend({
  details_confirmed: z.literal(true),
  vat_registration: z.object({
    vat_number: z.string().trim().min(1).max(40),
    label: nullableTrimmed(120),
    filing_method: z.enum(BOOKKEEPING_FILING_METHODS),
    details_confirmed: z.literal(true),
  }).strict(),
}).strict()

function resultObject(data: unknown): JsonRecord {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as JsonRecord
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') return data[0] as JsonRecord
  return {}
}

function rpcError(error: { message?: string; code?: string } | null): never {
  if (!error) throw new Error('bookkeeping_save_failed')
  throw new Error(error.message || error.code || 'bookkeeping_save_failed')
}

function actionError(error: unknown): BookkeepingActionError {
  if (error instanceof z.ZodError) {
    const fieldErrors = error.flatten().fieldErrors
    return {
      code: 'invalid_input',
      message: 'invalid_input',
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors)
          .filter(([, messages]) => messages !== undefined)
          .map(([field, messages]) => [field, messages ?? []]),
      ),
    }
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('not_allowed') || message.includes('access_denied')) {
    return { code: 'access_denied', message: 'access_denied' }
  }
  if (message.includes('not_found')) return { code: 'not_found', message: 'not_found' }
  if (message.includes('locked')) return { code: 'period_locked', message: 'period_locked' }
  if (message.includes('not_ready') || message.includes('blocked')) {
    return { code: 'period_not_ready', message: 'period_not_ready' }
  }
  if (message.includes('conflict') || message.includes('version')) {
    return { code: 'conflict', message: 'conflict' }
  }
  if (message.includes('duplicate_request')) {
    return { code: 'duplicate_request', message: 'duplicate_request' }
  }
  if (message.includes('invalid') || message.includes('required') || message.includes('mismatch')) {
    return { code: 'invalid_input', message: 'invalid_input' }
  }
  return { code: 'unexpected_error', message: 'unexpected_error' }
}

function failed<T>(error: unknown): BookkeepingActionResult<T> {
  return { ok: false, error: actionError(error) }
}

function revalidateBookkeeping(periodId?: string, entryId?: string): void {
  revalidatePath(BOOKKEEPING_PATH)
  revalidatePath('/auth-mvp/heim')
  if (periodId) revalidatePath(`${BOOKKEEPING_PATH}/timabil/${periodId}`)
  if (entryId && periodId) {
    revalidatePath(`${BOOKKEEPING_PATH}/timabil/${periodId}/faerslur/${entryId}/breyta`)
  }
}

function requiredId(value: unknown, key: string): string {
  const parsed = typeof value === 'string' ? value : ''
  if (!parsed) throw new Error(`bookkeeping_${key}_invalid`)
  return parsed
}

export async function createBookkeepingEntity(
  input: unknown,
): Promise<BookkeepingActionResult<{ entityId: string; registrationId: string }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = CreateBookkeepingWorkspaceSchema.parse(input)
    const { data, error } = await getAdmin().rpc('bookkeeping_create_entity', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_display_name: value.display_name,
      p_legal_name: value.legal_name,
      p_legal_identifier: value.legal_identifier,
      p_default_currency: value.default_currency,
      p_entity_details_confirmed: value.details_confirmed,
      p_vat_number: value.vat_registration.vat_number,
      p_vat_label: value.vat_registration.label,
      p_filing_method: value.vat_registration.filing_method,
      p_registration_details_confirmed: value.vat_registration.details_confirmed,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const entityId = requiredId(result.entity_id, 'entity')
    const registrationId = requiredId(result.registration_id, 'registration')
    revalidateBookkeeping()
    return { ok: true, data: { entityId, registrationId } }
  } catch (error) {
    console.error('[bookkeeping] create workspace failed')
    return failed(error)
  }
}

export async function addBookkeepingVatRegistration(
  input: unknown,
): Promise<BookkeepingActionResult<{ entityId: string; registrationId: string }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = AddBookkeepingVatRegistrationSchema.extend({
      details_confirmed: z.literal(true),
    }).parse(input)
    const { data, error } = await getAdmin().rpc('bookkeeping_add_vat_registration', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_entity_id: value.entity_id,
      p_vat_number: value.vat_number,
      p_label: value.label,
      p_filing_method: value.filing_method,
      p_details_confirmed: value.details_confirmed,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const registrationId = requiredId(result.registration_id, 'registration')
    revalidateBookkeeping()
    return { ok: true, data: { entityId: value.entity_id, registrationId } }
  } catch (error) {
    console.error('[bookkeeping] add VAT registration failed')
    return failed(error)
  }
}

export async function createBookkeepingPeriod(
  input: unknown,
): Promise<BookkeepingActionResult<{ periodId: string }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = CreateBookkeepingPeriodSchema.parse(input)
    if (!value.period_dates_confirmed) throw new Error('bookkeeping_period_confirmation_required')
    const { data, error } = await getAdmin().rpc('bookkeeping_create_period', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_entity_id: value.entity_id,
      p_registration_id: value.vat_registration_id,
      p_filing_method: value.filing_method,
      p_starts_on: value.starts_on,
      p_ends_on: value.ends_on,
      p_due_on: value.due_on,
      p_period_dates_confirmed: value.period_dates_confirmed,
    })
    if (error) rpcError(error)
    const periodId = requiredId(resultObject(data).period_id, 'period')
    revalidateBookkeeping(periodId)
    return { ok: true, data: { periodId } }
  } catch (error) {
    console.error('[bookkeeping] create period failed')
    return failed(error)
  }
}

function entryPayload(value: z.infer<typeof SaveBookkeepingEntrySchema>): JsonRecord {
  return {
    entity_id: value.entity_id,
    vat_registration_id: value.vat_registration_id,
    period_id: value.period_id,
    entry_id: value.entry_id,
    expected_version: value.expected_version,
    type: value.type,
    document_date: value.document_date,
    reporting_date: value.reporting_date,
    counterparty: value.counterparty,
    description: value.description,
    document_type: value.document_type,
    document_reference: value.document_reference,
    duplicate_reference_confirmed: value.duplicate_reference_confirmed,
    currency: value.currency,
    source_type: value.source_type,
    source_id: value.source_id,
    source_reference: value.source_reference,
    review_state: value.review_state,
    original_document_preserved: value.original_document_preserved,
    business_purpose_confirmed: value.business_purpose_confirmed,
    seller_vat_registration_confirmed: value.seller_vat_registration_confirmed,
    special_cases: value.special_cases,
    special_case_resolution_note: value.special_case_resolution_note,
    note: value.note,
    lines: value.lines.map((line) => ({
      client_key: line.client_key,
      line_id: line.line_id,
      category_code: line.category_code,
      description: line.description,
      vat_treatment: line.vat_treatment,
      currency: line.currency,
      amount_includes_vat: line.amount_includes_vat,
      gross_minor: line.gross_minor,
      net_minor: line.net_minor,
      vat_minor: line.vat_minor,
      input_vat_deductibility: line.input_vat_deductibility,
      deductible_vat_minor: line.deductible_vat_minor,
      manual_vat_override: line.manual_vat_override,
      manual_vat_override_reason: line.manual_vat_override_reason,
      exempt_turnover_confirmed: line.exempt_turnover_confirmed,
    })),
  }
}

export async function saveBookkeepingEntry(
  input: unknown,
): Promise<BookkeepingActionResult<{ periodId: string; entryId: string; version: number }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = SaveBookkeepingEntrySchema.parse(input)
    const payload = entryPayload(value)
    const admin = getAdmin()
    const response = value.entry_id
      ? await admin.rpc('bookkeeping_update_entry', {
        p_actor_id: user.id,
        p_request_id: value.request_id,
        p_entry_id: value.entry_id,
        p_expected_version: value.expected_version,
        p_entry: payload,
      })
      : await admin.rpc('bookkeeping_create_entry', {
        p_actor_id: user.id,
        p_request_id: value.request_id,
        p_period_id: value.period_id,
        p_entry: payload,
      })
    if (response.error) rpcError(response.error)
    const result = resultObject(response.data)
    const entryId = requiredId(result.entry_id, 'entry')
    const periodId = requiredId(result.period_id, 'period')
    const version = Number(result.version)
    if (!Number.isSafeInteger(version)) throw new Error('bookkeeping_version_invalid')
    revalidateBookkeeping(periodId, entryId)
    return { ok: true, data: { periodId, entryId, version } }
  } catch (error) {
    console.error('[bookkeeping] save entry failed')
    return failed(error)
  }
}

export async function setBookkeepingEntryReviewState(
  input: unknown,
): Promise<BookkeepingActionResult<{ periodId: string; entryId: string; version: number }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = SetBookkeepingEntryReviewStateSchema.parse(input)
    const { data, error } = await getAdmin().rpc('bookkeeping_set_entry_review_status', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_entry_id: value.entry_id,
      p_expected_version: value.expected_version,
      p_review_status: value.review_state,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const periodId = requiredId(result.period_id, 'period')
    const version = Number(result.version)
    if (!Number.isSafeInteger(version)) throw new Error('bookkeeping_version_invalid')
    revalidateBookkeeping(periodId, value.entry_id)
    return { ok: true, data: { periodId, entryId: value.entry_id, version } }
  } catch (error) {
    console.error('[bookkeeping] set review state failed')
    return failed(error)
  }
}

export async function setBookkeepingEntrySettlementState(
  input: unknown,
): Promise<BookkeepingActionResult<{
  periodId: string
  entryId: string
  settlementState: 'open' | 'settled'
  settlementVersion: number
  settledAt: string | null
}>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = SetBookkeepingEntrySettlementStateSchema.parse(input)
    const { data, error } = await getAdmin().rpc('bookkeeping_set_entry_settlement_state', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_entry_id: value.entry_id,
      p_expected_settlement_version: value.expected_settlement_version,
      p_settlement_state: value.settlement_state,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const periodId = requiredId(result.period_id, 'period')
    const entryId = requiredId(result.entry_id, 'entry')
    const settlementVersion = Number(result.settlement_version)
    const settlementState = result.settlement_state
    if (!Number.isSafeInteger(settlementVersion) || settlementVersion < 0) {
      throw new Error('bookkeeping_version_invalid')
    }
    if (settlementState !== 'open' && settlementState !== 'settled') {
      throw new Error('bookkeeping_settlement_state_invalid')
    }
    const settledAt = typeof result.settled_at === 'string' ? result.settled_at : null
    revalidateBookkeeping(periodId, entryId)
    return {
      ok: true,
      data: { periodId, entryId, settlementState, settlementVersion, settledAt },
    }
  } catch (error) {
    console.error('[bookkeeping] set entry settlement state failed')
    return failed(error)
  }
}

export async function voidBookkeepingEntry(
  input: unknown,
): Promise<BookkeepingActionResult<{ periodId: string; entryId: string }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = VoidBookkeepingEntrySchema.parse(input)
    const { data, error } = await getAdmin().rpc('bookkeeping_void_entry', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_entry_id: value.entry_id,
      p_expected_version: value.expected_version,
      p_reason: value.reason,
    })
    if (error) rpcError(error)
    const periodId = requiredId(resultObject(data).period_id, 'period')
    revalidateBookkeeping(periodId, value.entry_id)
    return { ok: true, data: { periodId, entryId: value.entry_id } }
  } catch (error) {
    console.error('[bookkeeping] void entry failed')
    return failed(error)
  }
}

export async function setBookkeepingPeriodReady(
  input: unknown,
): Promise<BookkeepingActionResult<{ periodId: string; version: number }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = SetBookkeepingPeriodReadySchema.parse(input)
    const { data, error } = await getAdmin().rpc('bookkeeping_set_period_ready', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_period_id: value.period_id,
      p_expected_version: value.expected_version,
      p_live_form_confirmed: value.live_form_confirmed,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const version = Number(result.version)
    if (!Number.isSafeInteger(version)) throw new Error('bookkeeping_version_invalid')
    revalidateBookkeeping(value.period_id)
    return { ok: true, data: { periodId: value.period_id, version } }
  } catch (error) {
    console.error('[bookkeeping] mark period ready failed')
    return failed(error)
  }
}

export async function recordBookkeepingFiling(
  input: unknown,
): Promise<BookkeepingActionResult<{ periodId: string; version: number }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = RecordBookkeepingFilingSchema.parse(input)
    const { data, error } = await getAdmin().rpc('bookkeeping_record_filing', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_period_id: value.period_id,
      p_expected_version: value.expected_version,
      p_submitted_on: value.submitted_on,
      p_due_on: value.due_on,
      p_fields: value.fields,
      p_reported_result_minor: value.reported_result_minor,
      p_result_mismatch_reason: value.result_mismatch_reason,
      p_confirmation_reference: value.confirmation_reference,
      p_note: value.note,
      p_payment_status: value.payment_state,
      p_paid_on: value.paid_on,
    })
    if (error) rpcError(error)
    const version = Number(resultObject(data).version)
    if (!Number.isSafeInteger(version)) throw new Error('bookkeeping_version_invalid')
    revalidateBookkeeping(value.period_id)
    return { ok: true, data: { periodId: value.period_id, version } }
  } catch (error) {
    console.error('[bookkeeping] record filing failed')
    return failed(error)
  }
}

export async function reopenBookkeepingPeriod(
  input: unknown,
): Promise<BookkeepingActionResult<{ periodId: string; version: number }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = ReopenBookkeepingPeriodSchema.parse(input)
    const { data, error } = await getAdmin().rpc('bookkeeping_reopen_period', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_period_id: value.period_id,
      p_expected_version: value.expected_version,
      p_reason: value.reason,
    })
    if (error) rpcError(error)
    const version = Number(resultObject(data).version)
    if (!Number.isSafeInteger(version)) throw new Error('bookkeeping_version_invalid')
    revalidateBookkeeping(value.period_id)
    return { ok: true, data: { periodId: value.period_id, version } }
  } catch (error) {
    console.error('[bookkeeping] reopen period failed')
    return failed(error)
  }
}

export async function recordBookkeepingPayment(
  input: unknown,
): Promise<BookkeepingActionResult<{ periodId: string; version: number }>> {
  const { user } = await guardBookkeepingAccess()
  try {
    const value = RecordBookkeepingPaymentSchema.parse(input)
    const { data, error } = await getAdmin().rpc('bookkeeping_record_payment', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_period_id: value.period_id,
      p_expected_version: value.expected_version,
      p_payment_status: value.payment_state,
      p_paid_on: value.paid_on,
    })
    if (error) rpcError(error)
    const version = Number(resultObject(data).version)
    if (!Number.isSafeInteger(version)) throw new Error('bookkeeping_version_invalid')
    revalidateBookkeeping(value.period_id)
    return { ok: true, data: { periodId: value.period_id, version } }
  } catch (error) {
    console.error('[bookkeeping] record payment failed')
    return failed(error)
  }
}
