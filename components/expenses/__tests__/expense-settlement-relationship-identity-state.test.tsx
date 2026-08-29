import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseSettlementParticipantRow } from '@/components/expenses/ExpenseSettlementParticipantList'

vi.mock('next-intl', () => ({ useLocale: () => 'is' }))
vi.mock('@/components/expenses/i18n.client', () => ({
  useExpenseTranslations: () => (key: string) => ({
    'identity.relationshipUnavailable': 'Ekki tókst að sækja tengslavalkosti. Reyndu aftur síðar.',
    'expense.settlementFilters.outstanding': 'Ógreitt',
    'expenseForm.guestMarker': 'gestur',
    'expenseForm.participantShare': 'Hlutur',
  }[key] ?? key),
}))
vi.mock('@/components/expenses/ExpenseRepaymentDialog', () => ({ ExpenseRepaymentDialog: () => null }))
vi.mock('@/components/expenses/ExpenseRepaymentStatusLines', () => ({ ExpenseRepaymentStatusLines: () => null }))
vi.mock('@/components/expenses/ExpenseSettlementIdentityActions', () => ({ ExpenseSettlementIdentityActions: () => null }))
vi.mock('@/components/expenses/ExpenseShareCollaboratorPicker', () => ({ ExpenseShareCollaboratorPicker: () => null }))
vi.mock('@/components/expenses/ExpenseRelationshipIdentityPicker', () => ({
  ExpenseRelationshipIdentityPicker: ({ candidates }: { candidates: Array<{ displayName: string }> }) => (
    <div data-testid="relationship-picker">{candidates[0]?.displayName}</div>
  ),
}))

import { ExpenseSettlementParticipantList } from '@/components/expenses/ExpenseSettlementParticipantList'

const memberId = '20000000-0000-4000-8000-000000000002'
const expenseId = '40000000-0000-4000-8000-000000000001'
const row: ExpenseSettlementParticipantRow = {
  id: 'settlement-row',
  name: 'Gestur',
  isSelf: false,
  currency: 'ISK',
  shareAmountMinor: 1000,
  paymentAmountMinor: null,
  category: 'outstanding',
  remainingAmountMinor: 1000,
  actionableRemainingAmountMinor: 1000,
  actionTransfer: null,
  identities: [{
    id: memberId,
    displayName: 'Gestur',
    role: 'member',
    status: 'active',
    isSelf: false,
    isRegistered: false,
  }],
  isShared: false,
  canAddCollaborator: false,
  expenseId,
  shareMemberId: memberId,
}

const baseProps = {
  rows: [row],
  groupId: '30000000-0000-4000-8000-000000000001',
  initialDate: '2026-08-29',
  participantOptions: [],
  participantOptionsError: false,
  canLinkGuests: false,
  canRenameGuests: false,
  financialVersion: 7,
}

describe('Expense settlement Relationship identity state', () => {
  it('shows one nontechnical message and no picker when management is unavailable', () => {
    render(<ExpenseSettlementParticipantList
      {...baseProps}
      relationshipIdentityManagementState={{ status: 'unavailable' }}
    />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Ekki tókst að sækja tengslavalkosti. Reyndu aftur síðar.',
    )
    expect(screen.queryByTestId('relationship-picker')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(memberId)
    expect(document.body.textContent).not.toContain(expenseId)
  })

  it('keeps authoritative absence quiet', () => {
    render(<ExpenseSettlementParticipantList
      {...baseProps}
      relationshipIdentityManagementState={{ status: 'absent' }}
    />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByTestId('relationship-picker')).not.toBeInTheDocument()
  })

  it('renders exact candidates only for available management', () => {
    render(<ExpenseSettlementParticipantList
      {...baseProps}
      relationshipIdentityManagementState={{
        status: 'available',
        management: {
          expenseId,
          financialVersion: 7,
          members: [{
            memberId,
            candidates: [{
              relationshipId: '71000000-0000-4000-8000-000000000001',
              displayName: 'Mamma',
            }],
          }],
        },
      }}
    />)

    expect(screen.getByTestId('relationship-picker')).toHaveTextContent('Mamma')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
