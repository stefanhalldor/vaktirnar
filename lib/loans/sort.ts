import type { LoanItem } from '@/lib/loans/types'

/**
 * Sort loans by loaned_at DESC, then id DESC as deterministic tie-breaker.
 */
export function sortLoansForHome(items: LoanItem[]): LoanItem[] {
  return [...items].sort((a, b) => {
    if (a.loaned_at !== b.loaned_at) return b.loaned_at.localeCompare(a.loaned_at)
    return b.id.localeCompare(a.id)
  })
}
