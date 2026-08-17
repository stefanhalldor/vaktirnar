import { describe, expect, it } from 'vitest'
import {
  EXPENSE_EVENT_TYPE_TO_KEY,
  parseRecentEventRow,
} from '@/lib/recent-events/display'
import type { ExpenseRecentEventType } from '@/lib/expenses/events'
import type { RecentEventRow } from '@/lib/recent-events/types'

const EXPENSE_EVENT_TYPES: ExpenseRecentEventType[] = [
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
  'expense_member_invitation_received',
  'expense_member_invitation_accepted',
  'expense_member_invitation_declined',
  'expense_member_invitation_cancelled',
  'expense_identity_bound',
  'expense_claim_disputed',
]

function row(overrides: Partial<RecentEventRow> = {}): RecentEventRow {
  return {
    id: 1,
    user_id: 'user-uuid',
    source: 'expenses',
    event_type: 'expense_created',
    entity_type: 'expense',
    entity_id: 'expense-uuid',
    event_key: 'expenses:activity:activity-uuid',
    payload: { expenseTitle: '  Kvöldmatur  ', actorUserId: 'actor-uuid' },
    href: '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-uuid',
    occurred_at: '2026-08-04T00:00:00Z',
    ack_at: null,
    ...overrides,
  }
}

describe('recent event source parsing', () => {
  it('has a localized display key for every consent-aware expense event type', () => {
    expect(Object.keys(EXPENSE_EVENT_TYPE_TO_KEY).sort()).toEqual([...EXPENSE_EVENT_TYPES].sort())
  })

  it('rejects unknown sources and mismatched source/event pairs', () => {
    expect(parseRecentEventRow(row({ source: 'unknown' }))).toBeNull()
    expect(parseRecentEventRow(row({ source: 'loans' }))).toBeNull()
  })

  it('accepts only the scoped Event invitation shape and rebuilds its local href', () => {
    const invitationId = '30000000-0000-4000-8000-000000000001'
    const parsed = parseRecentEventRow(row({
      source: 'events',
      event_type: 'event_attendance_invitation_received',
      entity_type: 'attendance_invitation',
      entity_id: invitationId,
      payload: {
        eventName: '  Kvisskvöld  ',
        inviterDisplayName: '  Anna  ',
        recipientEmail: 'private@example.is',
      },
      href: 'https://example.com/leak',
    }))

    expect(parsed).toMatchObject({
      source: 'events',
      entity_id: invitationId,
      payload: { eventName: 'Kvisskvöld', inviterDisplayName: 'Anna' },
      href: `/auth-mvp/vidburdir/bod/thattaka/${invitationId}`,
    })
    expect(parseRecentEventRow(row({
      source: 'events',
      event_type: 'event_attendance_invitation_received',
      entity_type: 'event',
      entity_id: invitationId,
      payload: { eventName: 'Kvisskvöld' },
    }))).toBeNull()
  })

  it('accepts private identity and dispute notifications without actor ids', () => {
    for (const eventType of ['expense_identity_bound', 'expense_claim_disputed'] as const) {
      const parsed = parseRecentEventRow(row({
        event_type: eventType,
        payload: { expenseTitle: '  Kvöldmatur  ', recipientEmail: 'private@example.is' },
      }))
      expect(parsed).toMatchObject({
        event_type: eventType,
        payload: { expenseTitle: 'Kvöldmatur' },
      })
      expect(JSON.stringify(parsed)).not.toContain('private@example.is')
    }
  })

  it('rejects a consent invitation event with the wrong entity type', () => {
    expect(parseRecentEventRow(row({
      event_type: 'expense_group_invitation_received',
      entity_type: 'expense_group',
      payload: { groupTitle: 'Ferð', actorUserId: 'actor-uuid' },
    }))).toBeNull()
  })

  it('whitelists and normalizes the expense payload', () => {
    const parsed = parseRecentEventRow(row({
      payload: {
        expenseTitle: '  Kvöldmatur  ',
        actorUserId: 'actor-uuid',
        amountMinor: 12_300,
        note: 'private',
        paymentSnapshot: { accountNumber: '0000-00-000000' },
      },
    }))

    expect(parsed?.source).toBe('expenses')
    expect(parsed?.payload).toEqual({ expenseTitle: 'Kvöldmatur', actorUserId: 'actor-uuid' })
  })

  it('keeps identity-invitation payloads free of guest and ledger details', () => {
    const parsed = parseRecentEventRow(row({
      event_type: 'expense_member_invitation_received',
      entity_type: 'expense_member_invitation',
      payload: {
        groupTitle: 'Afmælisgjöf',
        actorUserId: 'actor-uuid',
        guestDisplayName: 'Einkanafn',
        recipientEmail: 'recipient@example.is',
        amountMinor: 85_000,
      },
    }))

    expect(parsed?.payload).toEqual({
      groupTitle: 'Afmælisgjöf',
      actorUserId: 'actor-uuid',
    })
  })

  it('keeps legacy loan payload behavior while dropping malformed change entries', () => {
    const parsed = parseRecentEventRow(row({
      source: 'loans',
      event_type: 'loan_updated',
      entity_type: 'loan',
      payload: {
        itemName: 'Bók',
        newRole: 'borrower',
        changes: [
          { field: 'note', changeType: 'added', newValue: 'Nýtt' },
          { field: 'secret', changeType: 'changed', newValue: 'leak' },
        ],
      },
      href: 'javascript:alert(1)',
    }))

    expect(parsed?.source).toBe('loans')
    if (parsed?.source !== 'loans') throw new Error('expected loan event')
    expect(parsed.payload).toEqual({
      itemName: 'Bók',
      newRole: 'borrower',
      changes: [{ field: 'note', changeType: 'added', newValue: 'Nýtt' }],
    })
    expect(parsed.href).toBe('/auth-mvp/lanad-og-skilad')
  })
})
