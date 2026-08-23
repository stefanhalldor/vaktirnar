import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  mockHouseholdSync,
  mockGetUnread,
  mockExpenseSync,
  mockEventSync,
} = vi.hoisted(() => ({
  mockHouseholdSync: vi.fn(),
  mockGetUnread: vi.fn(),
  mockExpenseSync: vi.fn(),
  mockEventSync: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'is'),
  getTranslations: vi.fn(async () => (
    key: string,
    params?: Record<string, string>,
  ) => params ? `${key}:${JSON.stringify(params)}` : key),
}))

vi.mock('@/lib/household-chores/recent.server', () => ({
  syncHouseholdChoreRecentEvents: mockHouseholdSync,
}))

vi.mock('@/lib/recent-events/access.server', () => ({
  expenseActivityIdFromEventKey: vi.fn(() => null),
  resolveExpenseRecentEventTargets: vi.fn(async () => new Map()),
  resolveRecentEventSourceAccess: vi.fn(),
  syncEventAttendanceInvitationEvents: mockEventSync,
  syncExpenseMemberInvitationEvents: mockExpenseSync,
}))

vi.mock('@/lib/recent-events/helpers.server', () => ({
  getUnreadRecentEventsForUser: mockGetUnread,
  recordRecentEvent: vi.fn(),
}))

import { loadRecentEventInbox } from '@/lib/recent-events/inbox.server'
import type { RecentEventSourceAccess } from '@/lib/recent-events/access.server'
import type { RecentEventRow } from '@/lib/recent-events/types'

const USER = { id: 'user-uuid', email: 'user@example.is' }
const MEMBERSHIP_EVENT_ID = '50000000-0000-4000-8000-000000000001'
const EVENT_INVITATION_ID = '60000000-0000-4000-8000-000000000001'
const EVENT_ID = '70000000-0000-4000-8000-000000000001'

const ACCESS: RecentEventSourceAccess = {
  loansEnabled: false,
  expensesEnabled: true,
  eventInvitationsEnabled: false,
  householdChoresInboxEnabled: true,
  sources: ['expenses', 'heimilisverkin'],
}

function expenseRow(): RecentEventRow {
  return {
    id: 1,
    user_id: USER.id,
    source: 'expenses',
    event_type: 'expense_created',
    entity_type: 'expense',
    entity_id: 'expense-id',
    event_key: 'expenses:activity:not-a-uuid',
    payload: { expenseTitle: 'Matur', actorUserId: 'actor-id' },
    href: '/auth-mvp/utlagt-og-endurgreitt',
    occurred_at: '2026-08-18T08:00:00Z',
    ack_at: null,
  }
}

function householdRow(): RecentEventRow {
  return {
    id: 2,
    user_id: USER.id,
    source: 'heimilisverkin',
    event_type: 'household_chore_membership_removed',
    entity_type: 'household_chore_membership_event',
    entity_id: MEMBERSHIP_EVENT_ID,
    event_key: `household:membership:${MEMBERSHIP_EVENT_ID}`,
    payload: {
      circle_name: 'Heimilið okkar',
      display_reference: 'ABC23456',
      actor_label: 'Anna',
    },
    href: 'https://evil.invalid/private@example.is',
    occurred_at: '2026-08-18T09:00:00Z',
    ack_at: null,
  }
}

function eventInvitationRow(): RecentEventRow {
  return {
    id: 3,
    user_id: USER.id,
    source: 'events',
    event_type: 'event_attendance_invitation_received',
    entity_type: 'attendance_invitation',
    entity_id: EVENT_INVITATION_ID,
    event_key: `events:attendance-invitation:${EVENT_INVITATION_ID}:received`,
    payload: { eventName: 'Kvisskvöld', inviterDisplayName: 'Anna' },
    href: '/auth-mvp/vidburdir/80000000-0000-4000-8000-000000000001',
    occurred_at: '2026-08-18T10:00:00Z',
    ack_at: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExpenseSync.mockResolvedValue(true)
  mockEventSync.mockResolvedValue({ ok: true, targets: new Map() })
  mockGetUnread.mockResolvedValue([expenseRow(), householdRow()])
})

describe('Household Chores recent inbox synchronization', () => {
  it('suppresses only Household rows when its reconciliation fails', async () => {
    mockHouseholdSync.mockResolvedValue(false)

    const inbox = await loadRecentEventInbox(USER, { access: ACCESS })

    expect(inbox.ok).toBe(true)
    expect(inbox.rows.map((row) => row.source)).toEqual(['expenses'])
    expect(inbox.unreadBySource).toEqual({ expenses: 1 })
    expect(mockGetUnread).toHaveBeenCalledWith(USER.id, ['expenses', 'heimilisverkin'])
  })

  it('renders a reconciled Household row with trusted local navigation and no email', async () => {
    mockHouseholdSync.mockResolvedValue(true)

    const inbox = await loadRecentEventInbox(USER, { access: ACCESS })
    const household = inbox.rows.find((row) => row.source === 'heimilisverkin')

    expect(inbox.unreadBySource).toEqual({ expenses: 1, heimilisverkin: 1 })
    expect(household).toMatchObject({
      href: '/auth-mvp/verkefnin/adild',
      viewHref: '/auth-mvp/verkefnin/adild',
      isDeleted: false,
    })
    expect(JSON.stringify(household)).not.toContain('private@example.is')
  })
})

describe('Event invitation recent inbox synchronization', () => {
  it('uses only the current preview-authorized Event target, never a stored stale UUID href', async () => {
    mockGetUnread.mockResolvedValue([eventInvitationRow()])
    mockEventSync.mockResolvedValue({
      ok: true,
      targets: new Map([[EVENT_INVITATION_ID, `/auth-mvp/vidburdir/${EVENT_ID}`]]),
    })

    const inbox = await loadRecentEventInbox(USER, {
      access: {
        ...ACCESS,
        eventInvitationsEnabled: true,
        sources: ['events'],
      },
    })

    expect(inbox.rows).toHaveLength(1)
    expect(inbox.rows[0]).toMatchObject({
      href: `/auth-mvp/vidburdir/${EVENT_ID}`,
      viewHref: `/auth-mvp/vidburdir/${EVENT_ID}`,
    })
    expect(JSON.stringify(inbox.rows[0])).not.toContain(
      '80000000-0000-4000-8000-000000000001',
    )
  })
})
