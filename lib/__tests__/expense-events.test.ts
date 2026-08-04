import { describe, expect, it } from 'vitest'
import {
  EXPENSES_PATH,
  ExpenseDomainError,
  buildExpenseRecentEventProjections,
} from '@/lib/expenses'
import type { ExpenseDomainErrorCode } from '@/lib/expenses/domain-error'
import type { ExpenseRecentEventType } from '@/lib/expenses/events'

function expectDomainError(run: () => unknown, code: ExpenseDomainErrorCode): void {
  try {
    run()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ExpenseDomainError)
    expect((error as ExpenseDomainError).code).toBe(code)
  }
}

function build(eventType: ExpenseRecentEventType) {
  const isExpense = eventType.startsWith('expense_') && !eventType.startsWith('expense_group_') && !eventType.startsWith('expense_repayment_')
  return buildExpenseRecentEventProjections({
    activityId: `activity-${eventType}`,
    eventType,
    entityId: `entity-${eventType}`,
    actorUserId: 'actor',
    authorizedRecipientUserIds: ['recipient', 'actor', 'recipient'],
    ...(isExpense ? { expenseTitle: 'Kvöldmatur' } : { groupTitle: 'Spánarferðin' }),
  })
}

describe('expense Nýlegt projection contract', () => {
  it.each<ExpenseRecentEventType>([
    'expense_created',
    'expense_updated',
    'expense_cancelled',
    'expense_group_member_added',
    'expense_group_member_removed',
    'expense_group_invitation_received',
    'expense_group_invitation_accepted',
    'expense_group_invitation_declined',
    'expense_group_member_left',
    'expense_group_settling',
    'expense_group_settled',
    'expense_repayment_reported',
    'expense_repayment_confirmed',
    'expense_repayment_rejected',
    'expense_repayment_cancelled',
  ])('creates a sanitized, deduplicated projection for %s', (eventType) => {
    const rows = build(eventType)
    expect(rows.map((row) => row.userId)).toEqual(['actor', 'recipient'])
    expect(rows[0]!.initiallyRead).toBe(true)
    expect(rows[1]!.initiallyRead).toBe(false)
    expect(rows.every((row) => row.source === 'expenses')).toBe(true)
    expect(rows.every((row) => row.href.startsWith(`${EXPENSES_PATH}/`))).toBe(true)
    expect(rows.every((row) => row.updateOnConflict === false)).toBe(true)
    expect(Object.keys(rows[0]!.payload).sort()).toEqual(
      eventType === 'expense_created' || eventType === 'expense_updated' || eventType === 'expense_cancelled'
        ? ['actorUserId', 'expenseTitle']
        : ['actorUserId', 'groupTitle'],
    )
  })

  it('uses an immutable activity key for every projected fact', () => {
    for (const eventType of [
      'expense_created',
      'expense_updated',
      'expense_cancelled',
      'expense_group_member_added',
      'expense_group_member_removed',
      'expense_group_invitation_received',
      'expense_group_invitation_accepted',
      'expense_group_invitation_declined',
      'expense_group_member_left',
      'expense_group_settling',
      'expense_group_settled',
      'expense_repayment_reported',
      'expense_repayment_confirmed',
      'expense_repayment_rejected',
      'expense_repayment_cancelled',
    ] as const) {
      const row = build(eventType)[0]!
      expect(row.eventKey).toBe(`expenses:activity:activity-${eventType}`)
      expect(row.updateOnConflict).toBe(false)
    }
  })

  it('cannot let an out-of-order repayment retry overwrite a newer lifecycle event', () => {
    const rows = ([
      'expense_repayment_reported',
      'expense_repayment_confirmed',
      'expense_repayment_rejected',
      'expense_repayment_cancelled',
    ] as const).map((eventType) => buildExpenseRecentEventProjections({
      activityId: `activity-${eventType}`,
      eventType,
      entityId: 'repayment-1',
      actorUserId: 'actor',
      authorizedRecipientUserIds: ['recipient'],
      groupTitle: 'Ferðin',
    })[0]!)
    expect(new Set(rows.map((row) => row.eventKey)).size).toBe(4)
    expect(rows.every((row) => row.updateOnConflict === false)).toBe(true)
    expect(buildExpenseRecentEventProjections({
      activityId: 'activity-expense_repayment_reported',
      eventType: 'expense_repayment_reported',
      entityId: 'repayment-1',
      actorUserId: 'actor',
      authorizedRecipientUserIds: ['recipient'],
      groupTitle: 'Ferðin',
    })[0]!.eventKey).toBe(rows[0]!.eventKey)
  })

  it('keeps settling and settled as separately idempotent activities', () => {
    const settling = buildExpenseRecentEventProjections({
      activityId: 'activity-1', eventType: 'expense_group_settling', entityId: 'group-1',
      actorUserId: 'actor', authorizedRecipientUserIds: ['recipient'], groupTitle: 'Ferðin',
    })[0]!
    const settled = buildExpenseRecentEventProjections({
      activityId: 'activity-2', eventType: 'expense_group_settled', entityId: 'group-1',
      actorUserId: 'actor', authorizedRecipientUserIds: ['recipient'], groupTitle: 'Ferðin',
    })[0]!
    expect(settling.eventKey).toBe('expenses:activity:activity-1')
    expect(settled.eventKey).toBe('expenses:activity:activity-2')
    expect(settling.updateOnConflict).toBe(false)
    expect(settled.updateOnConflict).toBe(false)
  })

  it('supports a repayment for a one-off expense without requiring a group', () => {
    const row = buildExpenseRecentEventProjections({
      activityId: 'activity-one-off',
      eventType: 'expense_repayment_reported',
      entityId: 'repayment-one-off',
      actorUserId: 'actor',
      authorizedRecipientUserIds: ['recipient'],
      expenseTitle: 'Kvöldmatur',
    })[0]!
    expect(row.entityType).toBe('expense_repayment')
    expect(row.payload).toEqual({ expenseTitle: 'Kvöldmatur', actorUserId: 'actor' })
  })

  it('uses an invitation-only deep-link before membership is accepted', () => {
    const row = build('expense_group_invitation_received')[1]!
    expect(row.entityType).toBe('expense_group_invitation')
    expect(row.href).toContain('/bod/')
    expect(row.href).not.toContain('/hopar/')
  })

  it('never accepts unbounded or missing display snapshots', () => {
    expectDomainError(
      () => buildExpenseRecentEventProjections({
        activityId: 'activity', eventType: 'expense_created', entityId: 'expense',
        actorUserId: 'actor', authorizedRecipientUserIds: [], expenseTitle: ' '.repeat(3),
      }),
      'event_projection_invalid',
    )
    expectDomainError(
      () => buildExpenseRecentEventProjections({
        activityId: 'activity', eventType: 'expense_group_settled', entityId: 'group',
        actorUserId: 'actor', authorizedRecipientUserIds: [], groupTitle: 'x'.repeat(201),
      }),
      'event_projection_invalid',
    )
  })

  it('does not expose amounts, notes, participant IDs, receipts or payment details', () => {
    const serialized = JSON.stringify(build('expense_created'))
    for (const forbidden of [
      'amountMinor', 'currency', 'note', 'participant', 'receipt', 'accountNumber', 'email',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
