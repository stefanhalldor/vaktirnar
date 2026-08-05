import type { BookkeepingFilingMethod } from './constants'
import { BookkeepingDomainError } from './domain-error'
import type {
  BookkeepingEntity,
  BookkeepingEntry,
  BookkeepingEntryLine,
  BookkeepingPeriod,
  BookkeepingVatRegistration,
  BookkeepingVatSummary,
} from './types'
import {
  assertVatSummaryInternalConsistency,
  computeVatSummary,
  isPurchaseEntryType,
  validateVatLine,
} from './vat'

export type BookkeepingReadinessBlockerCode =
  | 'entity_details_unconfirmed'
  | 'vat_registration_inactive'
  | 'vat_registration_details_unconfirmed'
  | 'period_dates_unconfirmed'
  | 'period_dates_invalid'
  | 'live_form_not_compared'
  | 'tenant_mismatch'
  | 'entry_outside_period'
  | 'entry_has_no_lines'
  | 'entry_unreviewed'
  | 'entry_needs_review'
  | 'unsupported_currency'
  | 'line_invalid'
  | 'vat_treatment_needs_review'
  | 'input_deductibility_needs_review'
  | 'exempt_turnover_unconfirmed'
  | 'input_document_reference_missing'
  | 'input_original_document_unconfirmed'
  | 'input_business_purpose_unconfirmed'
  | 'input_seller_vat_registration_unconfirmed'
  | 'manual_override_reason_missing'
  | 'duplicate_document_reference'
  | 'foreign_service_unresolved'
  | 'import_unresolved'
  | 'mixed_use_unresolved'
  | 'uncertain_deductibility_unresolved'
  | 'special_case_resolution_note_missing'
  | 'summary_inconsistent'

export interface BookkeepingReadinessBlocker {
  code: BookkeepingReadinessBlockerCode
  entryId?: string
  lineId?: string
  field?: string
  /** Stable domain detail code; never source-document content. */
  detailCode?: string
}

export interface BookkeepingPeriodReadinessContext {
  entity: BookkeepingEntity
  registration: BookkeepingVatRegistration
  period: BookkeepingPeriod
  entries: readonly BookkeepingEntry[]
  /** Optional independently loaded summary for server/read-model verification. */
  summary?: BookkeepingVatSummary
}

export interface BookkeepingPeriodReadiness {
  isReady: boolean
  blockers: readonly BookkeepingReadinessBlocker[]
  blockerCounts: Readonly<Partial<Record<BookkeepingReadinessBlockerCode, number>>>
}

function isIsoDate(value: string | null): value is string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function dateParts(value: string): { year: number; month: number; day: number } {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  }
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isValidPeriodForFilingMethod(
  startsOn: string,
  endsOn: string,
  dueOn: string | null,
  filingMethod: BookkeepingFilingMethod,
): boolean {
  if (!isIsoDate(startsOn) || !isIsoDate(endsOn) || startsOn > endsOn) return false
  if (dueOn !== null && (!isIsoDate(dueOn) || dueOn <= endsOn)) return false

  const start = dateParts(startsOn)
  const end = dateParts(endsOn)
  if (filingMethod === 'general_bimonthly') {
    const expectedEndMonth = start.month === 12 ? 1 : start.month + 1
    const expectedEndYear = start.month === 12 ? start.year + 1 : start.year
    return start.day === 1
      && start.month % 2 === 1
      && end.year === expectedEndYear
      && end.month === expectedEndMonth
      && end.day === lastDayOfMonth(end.year, end.month)
  }
  if (filingMethod === 'monthly') {
    return start.day === 1
      && start.year === end.year
      && start.month === end.month
      && end.day === lastDayOfMonth(end.year, end.month)
  }
  if (filingMethod === 'annual') {
    return start.month === 1
      && start.day === 1
      && end.year === start.year
      && end.month === 12
      && end.day === 31
  }
  // Agricultural and custom periods need explicit confirmation, handled by
  // `periodDatesConfirmed`; their boundaries are not inferred as tax advice.
  return true
}

function addBlocker(
  blockers: BookkeepingReadinessBlocker[],
  seen: Set<string>,
  blocker: BookkeepingReadinessBlocker,
): void {
  const key = [
    blocker.code,
    blocker.entryId ?? '',
    blocker.lineId ?? '',
    blocker.field ?? '',
    blocker.detailCode ?? '',
  ].join('|')
  if (seen.has(key)) return
  seen.add(key)
  blockers.push(blocker)
}

function hasDeductibleInputVat(line: BookkeepingEntryLine): boolean {
  return line.inputVatDeductibility === 'fully_deductible'
    || line.inputVatDeductibility === 'partially_deductible'
}

function addLineBlockers(
  blockers: BookkeepingReadinessBlocker[],
  seen: Set<string>,
  entry: BookkeepingEntry,
  line: BookkeepingEntryLine,
): void {
  for (const issue of validateVatLine(entry.type, line)) {
    if (issue.code === 'vat_treatment_needs_review') {
      addBlocker(blockers, seen, {
        code: 'vat_treatment_needs_review',
        entryId: entry.id,
        lineId: line.id,
        field: issue.field,
      })
    } else if (
      issue.code === 'deductibility_needs_review'
      || issue.code === 'purchase_deductibility_required'
    ) {
      addBlocker(blockers, seen, {
        code: 'input_deductibility_needs_review',
        entryId: entry.id,
        lineId: line.id,
        field: issue.field,
      })
    } else if (issue.code === 'manual_override_reason_required') {
      addBlocker(blockers, seen, {
        code: 'manual_override_reason_missing',
        entryId: entry.id,
        lineId: line.id,
        field: issue.field,
      })
    } else {
      addBlocker(blockers, seen, {
        code: 'line_invalid',
        entryId: entry.id,
        lineId: line.id,
        field: issue.field,
        detailCode: issue.code,
      })
    }
  }

  if (line.vatTreatment === 'exempt_turnover' && !line.exemptTurnoverConfirmed) {
    addBlocker(blockers, seen, {
      code: 'exempt_turnover_unconfirmed',
      entryId: entry.id,
      lineId: line.id,
    })
  }

  if (isPurchaseEntryType(entry.type) && hasDeductibleInputVat(line)) {
    if (!entry.documentReference?.trim()) {
      addBlocker(blockers, seen, {
        code: 'input_document_reference_missing',
        entryId: entry.id,
        lineId: line.id,
      })
    }
    if (!entry.evidence.originalDocumentPreserved) {
      addBlocker(blockers, seen, {
        code: 'input_original_document_unconfirmed',
        entryId: entry.id,
        lineId: line.id,
      })
    }
    if (!entry.evidence.businessPurposeConfirmed) {
      addBlocker(blockers, seen, {
        code: 'input_business_purpose_unconfirmed',
        entryId: entry.id,
        lineId: line.id,
      })
    }
    if (entry.evidence.sellerVatRegistrationConfirmed !== true) {
      addBlocker(blockers, seen, {
        code: 'input_seller_vat_registration_unconfirmed',
        entryId: entry.id,
        lineId: line.id,
      })
    }
  }
}

function duplicateDocumentKey(entry: BookkeepingEntry): string | null {
  const reference = entry.documentReference?.trim()
  if (!reference) return null
  const counterparty = entry.counterparty?.trim().replace(/\s+/g, ' ').toUpperCase() ?? ''
  const documentType = entry.documentType?.trim().toUpperCase() ?? ''
  return [entry.type, counterparty, documentType, reference.toUpperCase()].join('|')
}

function addDuplicateReferenceBlockers(
  blockers: BookkeepingReadinessBlocker[],
  seen: Set<string>,
  entries: readonly BookkeepingEntry[],
): void {
  const groups = new Map<string, BookkeepingEntry[]>()
  for (const entry of entries) {
    if (entry.voidedAt !== null) continue
    const key = duplicateDocumentKey(entry)
    if (!key) continue
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    for (const entry of group) {
      if (!entry.duplicateReferenceConfirmed) {
        addBlocker(blockers, seen, {
          code: 'duplicate_document_reference',
          entryId: entry.id,
        })
      }
    }
  }
}

function summariesEqual(
  left: BookkeepingVatSummary,
  right: BookkeepingVatSummary,
): boolean {
  return left.fields.A === right.fields.A
    && left.fields.B === right.fields.B
    && left.fields.C === right.fields.C
    && left.fields.D === right.fields.D
    && left.fields.E === right.fields.E
    && left.fields.F === right.fields.F
    && left.outputVat24Minor === right.outputVat24Minor
    && left.outputVat11Minor === right.outputVat11Minor
    && left.inputVat24Minor === right.inputVat24Minor
    && left.inputVat11Minor === right.inputVat11Minor
}

export function evaluatePeriodReadiness(
  context: BookkeepingPeriodReadinessContext,
): BookkeepingPeriodReadiness {
  const { entity, registration, period, entries } = context
  const blockers: BookkeepingReadinessBlocker[] = []
  const seen = new Set<string>()

  if (!entity.detailsConfirmed) {
    addBlocker(blockers, seen, { code: 'entity_details_unconfirmed' })
  }
  if (!registration.active) {
    addBlocker(blockers, seen, { code: 'vat_registration_inactive' })
  }
  if (!registration.detailsConfirmed) {
    addBlocker(blockers, seen, { code: 'vat_registration_details_unconfirmed' })
  }
  if (!period.periodDatesConfirmed) {
    addBlocker(blockers, seen, { code: 'period_dates_unconfirmed' })
  }
  if (!isValidPeriodForFilingMethod(
    period.startsOn,
    period.endsOn,
    period.dueOn,
    registration.filingMethod,
  )) {
    addBlocker(blockers, seen, { code: 'period_dates_invalid' })
  }
  if (!period.liveFormCompared) {
    addBlocker(blockers, seen, { code: 'live_form_not_compared' })
  }
  if (
    registration.entityId !== entity.id
    || period.entityId !== entity.id
    || period.vatRegistrationId !== registration.id
  ) {
    addBlocker(blockers, seen, { code: 'tenant_mismatch' })
  }

  for (const entry of entries) {
    if (entry.voidedAt !== null) continue
    if (
      entry.entityId !== entity.id
      || entry.vatRegistrationId !== registration.id
      || entry.periodId !== period.id
    ) {
      addBlocker(blockers, seen, { code: 'tenant_mismatch', entryId: entry.id })
    }
    if (entry.currency !== 'ISK') {
      addBlocker(blockers, seen, { code: 'unsupported_currency', entryId: entry.id })
    }
    if (
      !isIsoDate(entry.reportingDate)
      || entry.reportingDate < period.startsOn
      || entry.reportingDate > period.endsOn
    ) {
      addBlocker(blockers, seen, { code: 'entry_outside_period', entryId: entry.id })
    }
    if (entry.lines.length === 0) {
      addBlocker(blockers, seen, { code: 'entry_has_no_lines', entryId: entry.id })
    }
    if (entry.reviewState === 'unreviewed') {
      addBlocker(blockers, seen, { code: 'entry_unreviewed', entryId: entry.id })
    } else if (entry.reviewState === 'needs_review') {
      addBlocker(blockers, seen, { code: 'entry_needs_review', entryId: entry.id })
    }

    for (const line of entry.lines) addLineBlockers(blockers, seen, entry, line)

    const specialCaseEntries = [
      ['foreign_service_unresolved', entry.specialCases.foreignService],
      ['import_unresolved', entry.specialCases.import],
      ['mixed_use_unresolved', entry.specialCases.mixedUse],
      ['uncertain_deductibility_unresolved', entry.specialCases.uncertainDeductibility],
    ] as const
    for (const [code, state] of specialCaseEntries) {
      if (state === 'unresolved') addBlocker(blockers, seen, { code, entryId: entry.id })
    }
    if (
      specialCaseEntries.some(([, state]) => state === 'resolved')
      && !entry.specialCaseResolutionNote?.trim()
    ) {
      addBlocker(blockers, seen, {
        code: 'special_case_resolution_note_missing',
        entryId: entry.id,
      })
    }
  }

  addDuplicateReferenceBlockers(blockers, seen, entries)

  try {
    const computed = computeVatSummary(entries)
    assertVatSummaryInternalConsistency(computed)
    if (context.summary) {
      assertVatSummaryInternalConsistency(context.summary)
      if (!summariesEqual(computed, context.summary)) {
        addBlocker(blockers, seen, { code: 'summary_inconsistent' })
      }
    }
  } catch (error) {
    if (!(error instanceof BookkeepingDomainError)) throw error
    addBlocker(blockers, seen, {
      code: 'summary_inconsistent',
      detailCode: error.code,
    })
  }

  const blockerCounts: Partial<Record<BookkeepingReadinessBlockerCode, number>> = {}
  for (const blocker of blockers) {
    blockerCounts[blocker.code] = (blockerCounts[blocker.code] ?? 0) + 1
  }
  return { isReady: blockers.length === 0, blockers, blockerCounts }
}
