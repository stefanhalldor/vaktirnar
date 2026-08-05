import type { BookkeepingPeriodState } from './constants'
import { failBookkeepingDomain } from './domain-error'

export function isBookkeepingPeriodEditable(state: BookkeepingPeriodState): boolean {
  return state === 'draft' || state === 'review'
}

export function assertBookkeepingPeriodEditable(state: BookkeepingPeriodState): void {
  if (!isBookkeepingPeriodEditable(state)) {
    failBookkeepingDomain('period_locked', { state })
  }
}

export function assertBookkeepingReopenReason(reason: string): string {
  if (typeof reason !== 'string' || !reason.trim()) {
    failBookkeepingDomain('reopen_reason_required')
  }
  return reason.trim()
}
