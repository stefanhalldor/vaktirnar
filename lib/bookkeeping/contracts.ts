import type {
  BookkeepingDashboardView,
  BookkeepingEntity,
  BookkeepingEntry,
  BookkeepingFilingSnapshot,
  BookkeepingPeriod,
  BookkeepingPeriodView,
  BookkeepingVatRegistration,
} from './types'

export type BookkeepingActionErrorCode =
  | 'access_denied'
  | 'feature_disabled'
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'duplicate_request'
  | 'period_locked'
  | 'period_not_ready'
  | 'unexpected_error'

export interface BookkeepingActionError {
  code: BookkeepingActionErrorCode
  /** Translation key or stable domain code. Never a database error string. */
  message: string
  fieldErrors?: Readonly<Record<string, readonly string[]>>
}

export type BookkeepingActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: BookkeepingActionError }

export interface BookkeepingReadRepository {
  listDashboard(): Promise<BookkeepingDashboardView>
  getPeriod(periodId: string): Promise<BookkeepingPeriodView | null>
}

/** Stable mutation result shapes; transport and persistence stay server-only. */
export interface BookkeepingMutationResults {
  createEntity: BookkeepingEntity
  addVatRegistration: BookkeepingVatRegistration
  createPeriod: BookkeepingPeriod
  saveEntry: BookkeepingEntry
  setEntryReviewState: BookkeepingEntry
  setEntrySettlementState: {
    entryId: string
    settlementState: BookkeepingEntry['settlementState']
    settlementVersion: number
    settledAt: string | null
  }
  setPeriodReady: BookkeepingPeriod
  recordFiling: { period: BookkeepingPeriod; snapshot: BookkeepingFilingSnapshot }
  reopenPeriod: BookkeepingPeriod
}
