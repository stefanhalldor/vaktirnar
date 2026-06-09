import { createHash } from 'crypto'
import type { LoanItem } from './types'

function getTodayReykjavik(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
}

export function computeRecentReadKey(userId: string, loan: LoanItem): string {
  const today = getTodayReykjavik()
  const overdue = !!loan.due_at && !loan.returned_at && loan.due_at < today
  const payload = [
    userId,
    loan.id,
    loan.item_name,
    loan.loaned_at,
    loan.due_at ?? '',
    loan.returned_at ?? '',
    loan.my_role,
    overdue ? '1' : '0',
  ].join('|')
  return createHash('sha256').update(payload).digest('hex').slice(0, 32)
}
