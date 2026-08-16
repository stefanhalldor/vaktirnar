import { describe, expect, it } from 'vitest'
import { expenseInvitationRecipientProjection } from '@/lib/expenses/invitation-visibility'

describe('event-derived expense invitation visibility', () => {
  it('never projects the current recipient email for an event-derived member', () => {
    expect(expenseInvitationRecipientProjection({
      canManage: true,
      isEventDerivedMember: true,
      recipientEmail: 'old-address@example.is',
    })).toEqual({})
    expect(expenseInvitationRecipientProjection({
      canManage: true,
      isEventDerivedMember: true,
      recipientEmail: 'changed-address@example.is',
    })).toEqual({})
  })

  it('preserves the existing owner label for ordinary expense invitations', () => {
    expect(expenseInvitationRecipientProjection({
      canManage: true,
      isEventDerivedMember: false,
      recipientEmail: 'ordinary-guest@example.is',
    })).toEqual({ recipientLabel: 'ordinary-guest@example.is' })
  })

  it('does not project recipient email to a non-manager', () => {
    expect(expenseInvitationRecipientProjection({
      canManage: false,
      isEventDerivedMember: false,
      recipientEmail: 'private@example.is',
    })).toEqual({})
  })
})
