import { describe, expect, it } from 'vitest'
import { expenseInvitationRecipientProjection } from '@/lib/expenses/invitation-visibility'

describe('source-neutral expense invitation visibility', () => {
  it('masks every manager-visible recipient without retaining provenance', () => {
    expect(expenseInvitationRecipientProjection({
      canManage: true,
      recipientEmail: 'old-address@example.is',
    })).toEqual({ recipientLabel: 'o***@example.is' })
    expect(expenseInvitationRecipientProjection({
      canManage: true,
      recipientEmail: 'changed-address@example.is',
    })).toEqual({ recipientLabel: 'c***@example.is' })
  })

  it('does not project recipient email to a non-manager', () => {
    expect(expenseInvitationRecipientProjection({
      canManage: false,
      recipientEmail: 'private@example.is',
    })).toEqual({})
  })

  it('fails closed for an invalid recipient shape', () => {
    expect(expenseInvitationRecipientProjection({
      canManage: true,
      recipientEmail: 'not-an-email',
    })).toEqual({})
    expect(expenseInvitationRecipientProjection({
      canManage: true,
      recipientEmail: 'a@example.is@private.invalid',
    })).toEqual({})
  })
})
