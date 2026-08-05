import 'server-only'

import { getAdmin } from '@/lib/supabase/admin'
import {
  BOOKKEEPING_FILING_METHODS,
  BOOKKEEPING_INPUT_VAT_DEDUCTIBILITY,
  BOOKKEEPING_PERIOD_STATES,
  BOOKKEEPING_REVIEW_STATES,
  BOOKKEEPING_SPECIAL_CASE_STATES,
  BOOKKEEPING_VAT_TREATMENTS,
  VAT_REPORT_FIELDS,
  type BookkeepingFilingMethod,
  type BookkeepingInputVatDeductibility,
  type BookkeepingPeriodState,
  type BookkeepingReviewState,
  type BookkeepingSpecialCaseState,
  type BookkeepingVatTreatment,
  type VatReportField,
} from './constants'
import { evaluatePeriodReadiness, type BookkeepingPeriodReadiness } from './readiness'
import type {
  BookkeepingDashboardView,
  BookkeepingEntity,
  BookkeepingEntry,
  BookkeepingEntryLine,
  BookkeepingFilingSnapshot,
  BookkeepingPeriod,
  BookkeepingPeriodDashboardSummary,
  BookkeepingPeriodView,
  BookkeepingVatRegistration,
  BookkeepingVatSummary,
  VatTraceItem,
} from './types'
import { computeVatSummary } from './vat'

type JsonRecord = Record<string, unknown>

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('bookkeeping_load_invalid')
  }
  return value as JsonRecord
}

function optionalObject(value: unknown): JsonRecord | null {
  return value === null || value === undefined ? null : object(value)
}

function array(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('bookkeeping_load_invalid')
  return value
}

function string(value: unknown, fallback?: string): string {
  if (typeof value === 'string') return value
  if (fallback !== undefined) return fallback
  throw new Error('bookkeeping_load_invalid')
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value)
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function integer(value: unknown, fallback?: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^-?\d+$/.test(value)
      ? Number(value)
      : Number.NaN
  if (Number.isSafeInteger(parsed)) return parsed
  if (fallback !== undefined) return fallback
  throw new Error('bookkeeping_load_invalid')
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback
}

function resultObject(data: unknown): JsonRecord {
  if (Array.isArray(data)) return object(data[0])
  return object(data)
}

function throwOnRpcError(error: { message?: string; code?: string } | null, operation: string): void {
  if (!error) return
  console.error(`[bookkeeping] ${operation} failed`)
  throw new Error('bookkeeping_load_failed')
}

function mapEntity(rawValue: unknown, actorUserId: string): BookkeepingEntity {
  const raw = object(rawValue)
  return {
    id: string(raw.id),
    ownerUserId: string(raw.ownerUserId ?? raw.owner_user_id ?? raw.created_by, actorUserId),
    displayName: string(raw.displayName ?? raw.display_name),
    legalName: nullableString(raw.legalName ?? raw.legal_name),
    // Stored server-side for traceability, but deliberately omitted from read RPC payloads.
    legalIdentifier: null,
    defaultCurrency: 'ISK',
    detailsConfirmed: bool(raw.detailsConfirmed ?? raw.details_confirmed, true),
    createdAt: string(raw.createdAt ?? raw.created_at, new Date(0).toISOString()),
    updatedAt: string(raw.updatedAt ?? raw.updated_at, string(raw.createdAt ?? raw.created_at, new Date(0).toISOString())),
  }
}

function mapRegistration(rawValue: unknown): BookkeepingVatRegistration {
  const raw = object(rawValue)
  return {
    id: string(raw.id),
    entityId: string(raw.entityId ?? raw.entity_id),
    vatNumber: string(raw.vatNumber ?? raw.vat_number),
    label: nullableString(raw.label),
    filingMethod: enumValue(
      raw.filingMethod ?? raw.filing_method ?? raw.filing_cadence,
      BOOKKEEPING_FILING_METHODS,
      'other',
    ),
    detailsConfirmed: bool(raw.detailsConfirmed ?? raw.details_confirmed, true),
    active: bool(raw.active, true),
    createdAt: string(raw.createdAt ?? raw.created_at, new Date(0).toISOString()),
    updatedAt: string(raw.updatedAt ?? raw.updated_at, string(raw.createdAt ?? raw.created_at, new Date(0).toISOString())),
  }
}

function mapPeriod(rawValue: unknown): BookkeepingPeriod {
  const raw = object(rawValue)
  return {
    id: string(raw.id),
    entityId: string(raw.entityId ?? raw.entity_id),
    vatRegistrationId: string(raw.vatRegistrationId ?? raw.vat_registration_id ?? raw.registration_id),
    startsOn: string(raw.startsOn ?? raw.starts_on ?? raw.period_start),
    endsOn: string(raw.endsOn ?? raw.ends_on ?? raw.period_end),
    dueOn: nullableString(raw.dueOn ?? raw.due_on ?? raw.due_date),
    state: enumValue(raw.state ?? raw.status, BOOKKEEPING_PERIOD_STATES, 'draft'),
    periodDatesConfirmed: bool(raw.periodDatesConfirmed ?? raw.period_dates_confirmed ?? raw.registration_confirmed),
    liveFormCompared: bool(raw.liveFormCompared ?? raw.live_form_compared ?? raw.live_form_confirmed),
    version: integer(raw.version, 1),
    submittedAt: nullableString(raw.submittedAt ?? raw.submitted_at),
    reopenedAt: nullableString(raw.reopenedAt ?? raw.reopened_at),
    reopenReason: nullableString(raw.reopenReason ?? raw.reopen_reason),
    createdAt: string(raw.createdAt ?? raw.created_at, new Date(0).toISOString()),
    updatedAt: string(raw.updatedAt ?? raw.updated_at, string(raw.createdAt ?? raw.created_at, new Date(0).toISOString())),
  }
}

function specialCaseState(
  value: unknown,
  resolved: boolean,
): BookkeepingSpecialCaseState {
  if (typeof value === 'string' && BOOKKEEPING_SPECIAL_CASE_STATES.includes(value as BookkeepingSpecialCaseState)) {
    return value as BookkeepingSpecialCaseState
  }
  return bool(value) ? (resolved ? 'resolved' : 'unresolved') : 'not_applicable'
}

function mapEntryLine(rawValue: unknown, entryId: string): BookkeepingEntryLine {
  const raw = object(rawValue)
  return {
    id: string(raw.id),
    entryId: string(raw.entryId ?? raw.entry_id, entryId),
    categoryCode: nullableString(raw.categoryCode ?? raw.category_code ?? raw.category),
    description: nullableString(raw.description),
    vatTreatment: enumValue(
      raw.vatTreatment ?? raw.vat_treatment,
      BOOKKEEPING_VAT_TREATMENTS,
      'needs_review',
    ),
    currency: 'ISK',
    amountIncludesVat: bool(raw.amountIncludesVat ?? raw.amount_includes_vat, true),
    grossMinor: integer(raw.grossMinor ?? raw.gross_minor),
    netMinor: integer(raw.netMinor ?? raw.net_minor),
    vatMinor: integer(raw.vatMinor ?? raw.vat_minor),
    inputVatDeductibility: enumValue(
      raw.inputVatDeductibility ?? raw.input_vat_deductibility ?? raw.input_deductibility,
      BOOKKEEPING_INPUT_VAT_DEDUCTIBILITY,
      'needs_review',
    ),
    deductibleVatMinor: integer(raw.deductibleVatMinor ?? raw.deductible_vat_minor, 0),
    manualVatOverride: bool(raw.manualVatOverride ?? raw.manual_vat_override ?? raw.manual_override),
    manualVatOverrideReason: nullableString(
      raw.manualVatOverrideReason ?? raw.manual_vat_override_reason ?? raw.override_reason,
    ),
    exemptTurnoverConfirmed: bool(raw.exemptTurnoverConfirmed ?? raw.exempt_turnover_confirmed),
  }
}

function mapEntry(rawValue: unknown, suppliedLines?: unknown[]): BookkeepingEntry {
  const raw = object(rawValue)
  const entryId = string(raw.id)
  const specialCases = optionalObject(raw.specialCases)
  const evidence = optionalObject(raw.evidence)
  const resolved = bool(raw.specialCaseResolved ?? raw.special_case_resolved)
  const lines = suppliedLines ?? array(raw.lines)
  return {
    id: entryId,
    entityId: string(raw.entityId ?? raw.entity_id),
    vatRegistrationId: string(raw.vatRegistrationId ?? raw.vat_registration_id ?? raw.registration_id),
    periodId: string(raw.periodId ?? raw.period_id),
    type: enumValue(raw.type ?? raw.entry_type, ['sale', 'purchase', 'sales_credit', 'purchase_credit'] as const, 'purchase'),
    documentDate: string(raw.documentDate ?? raw.document_date),
    reportingDate: string(raw.reportingDate ?? raw.reporting_date),
    counterparty: nullableString(raw.counterparty ?? raw.counterparty_name),
    description: string(raw.description),
    documentType: nullableString(raw.documentType ?? raw.document_type),
    documentReference: nullableString(raw.documentReference ?? raw.document_reference),
    duplicateReferenceConfirmed: bool(raw.duplicateReferenceConfirmed ?? raw.duplicate_reference_confirmed),
    currency: 'ISK',
    sourceType: string(raw.sourceType ?? raw.source_type, 'manual'),
    sourceId: nullableString(raw.sourceId ?? raw.source_id),
    sourceReference: nullableString(raw.sourceReference ?? raw.source_reference),
    reviewState: enumValue(
      raw.reviewState ?? raw.review_state ?? raw.review_status,
      BOOKKEEPING_REVIEW_STATES,
      'unreviewed',
    ),
    evidence: {
      originalDocumentPreserved: bool(evidence?.originalDocumentPreserved ?? raw.original_document_preserved ?? raw.source_document_retained),
      businessPurposeConfirmed: bool(evidence?.businessPurposeConfirmed ?? raw.business_purpose_confirmed),
      sellerVatRegistrationConfirmed: (evidence?.sellerVatRegistrationConfirmed ?? raw.seller_vat_registration_confirmed) === null
        || (evidence?.sellerVatRegistrationConfirmed ?? raw.seller_vat_registration_confirmed) === undefined
        ? null
        : bool(evidence?.sellerVatRegistrationConfirmed ?? raw.seller_vat_registration_confirmed ?? raw.seller_vat_registered),
    },
    specialCases: {
      foreignService: specialCaseState(specialCases?.foreignService ?? raw.foreign_service, resolved),
      import: specialCaseState(specialCases?.import ?? raw.import ?? raw.imported_goods, resolved),
      mixedUse: specialCaseState(specialCases?.mixedUse ?? raw.mixed_use, resolved),
      uncertainDeductibility: specialCaseState(specialCases?.uncertainDeductibility ?? raw.uncertain_deductibility, resolved),
    },
    specialCaseResolutionNote: nullableString(raw.specialCaseResolutionNote ?? raw.special_case_resolution_note),
    note: nullableString(raw.note),
    version: integer(raw.version, 1),
    settlementState: enumValue(
      raw.settlementState ?? raw.settlement_state,
      ['open', 'settled'] as const,
      'open',
    ),
    settlementVersion: integer(raw.settlementVersion ?? raw.settlement_version, 0),
    settledAt: nullableString(raw.settledAt ?? raw.settled_at),
    voidedAt: nullableString(raw.voidedAt ?? raw.voided_at),
    lines: lines.map((line) => mapEntryLine(line, entryId)),
    createdAt: string(raw.createdAt ?? raw.created_at, new Date(0).toISOString()),
    updatedAt: string(raw.updatedAt ?? raw.updated_at, string(raw.createdAt ?? raw.created_at, new Date(0).toISOString())),
  }
}

function emptyTraces(): Record<VatReportField, VatTraceItem[]> {
  return { A: [], B: [], C: [], D: [], E: [], F: [] }
}

function emptyVatSummary(): BookkeepingVatSummary {
  return {
    currency: 'ISK',
    fields: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
    outputVat24Minor: 0,
    outputVat11Minor: 0,
    inputVat24Minor: 0,
    inputVat11Minor: 0,
    traces: emptyTraces(),
  }
}

function mapSummary(value: unknown): BookkeepingVatSummary {
  const raw = optionalObject(value)
  if (!raw) return emptyVatSummary()
  const fieldSource = optionalObject(raw.fields) ?? raw
  const fields = Object.fromEntries(VAT_REPORT_FIELDS.map((field) => [
    field,
    integer(fieldSource[field] ?? fieldSource[`${field.toLowerCase()}_minor`], 0),
  ])) as Record<VatReportField, number>
  return {
    currency: 'ISK',
    fields,
    outputVat24Minor: integer(raw.outputVat24Minor ?? raw.output_vat_24_minor, 0),
    outputVat11Minor: integer(raw.outputVat11Minor ?? raw.output_vat_11_minor, 0),
    inputVat24Minor: integer(raw.inputVat24Minor ?? raw.input_vat_24_minor, 0),
    inputVat11Minor: integer(raw.inputVat11Minor ?? raw.input_vat_11_minor, 0),
    traces: emptyTraces(),
  }
}

function mapReadiness(value: unknown): BookkeepingPeriodReadiness {
  const raw = optionalObject(value)
  if (!raw) return { isReady: false, blockers: [], blockerCounts: {} }
  const blockers = array(raw.blockers).flatMap((candidate) => {
    if (typeof candidate === 'string') return [{ code: candidate }]
    const blocker = optionalObject(candidate)
    if (!blocker || typeof blocker.code !== 'string') return []
    return [{
      code: blocker.code,
      entryId: nullableString(blocker.entry_id ?? blocker.entryId) ?? undefined,
      lineId: nullableString(blocker.line_id ?? blocker.lineId) ?? undefined,
      field: nullableString(blocker.field) ?? undefined,
      detailCode: nullableString(blocker.detail_code ?? blocker.detailCode) ?? undefined,
    }]
  }) as BookkeepingPeriodReadiness['blockers']
  const blockerCounts = Object.fromEntries(
    blockers.map((blocker) => [
      blocker.code,
      blockers.filter((candidate) => candidate.code === blocker.code).length,
    ]),
  ) as BookkeepingPeriodReadiness['blockerCounts']
  return {
    isReady: bool(raw.ready ?? raw.is_ready ?? raw.isReady, blockers.length === 0),
    blockers,
    blockerCounts,
  }
}

function mapFiling(value: unknown, periodId: string): BookkeepingFilingSnapshot | null {
  const raw = optionalObject(value)
  if (!raw) return null
  const fields = mapSummary(raw.summary ?? raw.fields ?? raw).fields
  return {
    periodId,
    fields,
    submittedOn: string(raw.submittedOn ?? raw.submitted_on),
    dueOn: nullableString(raw.dueOn ?? raw.due_on),
    reportedResultMinor: integer(raw.reportedResultMinor ?? raw.reported_result_minor ?? raw.recorded_result_minor),
    resultMismatchReason: nullableString(raw.resultMismatchReason ?? raw.result_mismatch_reason),
    confirmationReference: nullableString(raw.confirmationReference ?? raw.confirmation_reference),
    note: nullableString(raw.note),
    paymentState: enumValue(raw.paymentState ?? raw.payment_state ?? raw.payment_status, ['unpaid', 'paid', 'credit'] as const, 'unpaid'),
    paidOn: nullableString(raw.paidOn ?? raw.paid_on),
  }
}

function mapDashboardPeriod(value: unknown): BookkeepingPeriodDashboardSummary {
  const raw = object(value)
  const period = mapPeriod(raw.period ?? raw)
  return {
    period,
    entryCount: integer(raw.entryCount ?? raw.entry_count, 0),
    summary: mapSummary(raw.summary),
    readiness: mapReadiness(raw.readiness),
    filing: mapFiling(raw.filing ?? raw.latest_filing, period.id),
  }
}

export async function getBookkeepingDashboard(actorUserId: string): Promise<BookkeepingDashboardView> {
  const { data, error } = await getAdmin().rpc('bookkeeping_get_dashboard', {
    p_actor_id: actorUserId,
  })
  throwOnRpcError(error, 'dashboard query')
  const root = resultObject(data ?? { entities: [] })
  return {
    entities: array(root.entities).map((candidate) => {
      const raw = object(candidate)
      const entity = mapEntity(raw.entity ?? raw, actorUserId)
      return {
        entity,
        registrations: array(raw.registrations).map(mapRegistration),
        periods: array(raw.periods).map(mapDashboardPeriod),
      }
    }),
  }
}

export async function getBookkeepingPeriod(
  actorUserId: string,
  periodId: string,
): Promise<BookkeepingPeriodView | null> {
  const { data, error } = await getAdmin().rpc('bookkeeping_get_period', {
    p_actor_id: actorUserId,
    p_period_id: periodId,
  })
  if (error) {
    const message = error.message?.toLowerCase() ?? ''
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    throwOnRpcError(error, 'period query')
  }
  if (!data) return null
  const raw = resultObject(data)
  const entity = mapEntity(raw.entity, actorUserId)
  const registration = mapRegistration(raw.registration)
  const period = mapPeriod(raw.period)
  const entries = array(raw.entries).map((entry) => mapEntry(entry))
  const summary = computeVatSummary(entries)
  const persistedSummary = raw.summary === undefined || raw.summary === null
    ? summary
    : mapSummary(raw.summary)
  const readiness = evaluatePeriodReadiness({
    entity,
    registration,
    period,
    entries,
    summary: persistedSummary,
  })
  return {
    entity,
    registration,
    period,
    entries,
    summary,
    readiness,
    filing: mapFiling(raw.filing ?? raw.latest_filing, period.id),
  }
}

export async function getBookkeepingEntry(
  actorUserId: string,
  entryId: string,
): Promise<BookkeepingEntry | null> {
  const { data, error } = await getAdmin().rpc('bookkeeping_get_entry', {
    p_actor_id: actorUserId,
    p_entry_id: entryId,
  })
  if (error) {
    const message = error.message?.toLowerCase() ?? ''
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    throwOnRpcError(error, 'entry query')
  }
  if (!data) return null
  const raw = resultObject(data)
  return mapEntry(raw.entry ?? raw, array(raw.lines ?? object(raw.entry ?? raw).lines))
}
