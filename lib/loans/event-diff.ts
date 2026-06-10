import type { LoanFieldChange } from '@/lib/recent-events/types'

export function computeLoanChanges(
  before: { item_name: string | null; note: string | null; loaned_at?: string | null; due_at?: string | null },
  after:  { item_name: string | null; note: string | null; loaned_at?: string | null; due_at?: string | null },
): LoanFieldChange[] {
  const changes: LoanFieldChange[] = []

  if (before.item_name !== after.item_name) {
    changes.push({ field: 'item_name', changeType: 'changed', oldValue: before.item_name, newValue: after.item_name })
  }

  if ('loaned_at' in after && before.loaned_at !== after.loaned_at) {
    changes.push({ field: 'loaned_at', changeType: 'changed', oldValue: before.loaned_at ?? null, newValue: after.loaned_at ?? null })
  }

  if ('due_at' in after) {
    const beforeDue = before.due_at ?? null
    const afterDue = after.due_at ?? null
    if (beforeDue !== afterDue) {
      if (beforeDue === null) {
        changes.push({ field: 'due_at', changeType: 'added', newValue: afterDue })
      } else if (afterDue === null) {
        changes.push({ field: 'due_at', changeType: 'removed', oldValue: beforeDue })
      } else {
        changes.push({ field: 'due_at', changeType: 'changed', oldValue: beforeDue, newValue: afterDue })
      }
    }
  }

  const beforeNote = before.note ?? null
  const afterNote = after.note ?? null
  if (beforeNote !== afterNote) {
    if (beforeNote === null) {
      changes.push({ field: 'note', changeType: 'added', newValue: afterNote })
    } else if (afterNote === null) {
      changes.push({ field: 'note', changeType: 'removed', oldValue: beforeNote })
    } else {
      changes.push({ field: 'note', changeType: 'changed', oldValue: beforeNote, newValue: afterNote })
    }
  }

  return changes
}
