import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseMemberView } from '@/lib/expenses/contracts'

const mocks = vi.hoisted(() => ({
  bind: vi.fn(),
  dispute: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock('@/lib/expenses/actions', () => ({
  bindExpenseMemberEventIdentity: mocks.bind,
  disputeExpenseClaim: mocks.dispute,
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const short = key.replace(/^teskeid\.expenses\./, '')
    const translations: Record<string, string> = {
      'identity.linkTeskeidUser': 'Tengja við Teskeiðarnotanda',
      'identity.eventPickerTitle': 'Veldu þátttakanda',
      'identity.eventPickerDescription': `Núverandi þátttakendur í ${values?.event ?? ''}`,
      'identity.unknownUser': 'Teskeiðarnotandi',
      'identity.binding': 'Tengi...',
      'claim.trigger': 'Ég kannast ekki við þetta',
      'claim.confirmTitle': 'Kannastu ekki við kröfuna?',
      'claim.confirmBody': 'Krafan verður merkt til yfirferðar.',
      'claim.confirmAction': 'Merkja til yfirferðar',
      'claim.saving': 'Vista...',
      'claim.disputedTitle': 'Þarf yfirferð',
      'claim.disputedBody': 'Þú hefur merkt að þú kannist ekki við kröfuna.',
      'common.cancel': 'Hætta við',
      'common.close': 'Loka',
    }
    return translations[short] ?? short
  },
}))

import { ExpenseClaimDisputeControl } from '@/components/expenses/ExpenseClaimDisputeControl'
import { ExpenseEventIdentityPicker } from '@/components/expenses/ExpenseEventIdentityPicker'

const expenseId = '10000000-0000-4000-8000-000000000001'
const memberId = '20000000-0000-4000-8000-000000000001'
const participantId = '30000000-0000-4000-8000-000000000001'
const requestId = '40000000-0000-4000-8000-000000000001'

const guest: ExpenseMemberView = {
  id: memberId,
  displayName: 'Stebbishj',
  role: 'member',
  status: 'active',
  isSelf: false,
  isRegistered: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId)
  mocks.bind.mockResolvedValue({ ok: true, data: { memberId } })
  mocks.dispute.mockResolvedValue({ ok: true, data: { memberId, status: 'disputed' } })
})

describe('Expense identity and claim controls', () => {
  it('binds a legacy guest only to a server-projected current Event candidate', async () => {
    render(<ExpenseEventIdentityPicker
      expenseId={expenseId}
      financialVersion={8}
      member={guest}
      source={{
        eventId: '50000000-0000-4000-8000-000000000001',
        eventName: 'Tester',
        candidates: [{ eventParticipantId: participantId, displayName: 'Stebbishj' }],
      }}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Tengja við Teskeiðarnotanda' }))
    expect(screen.getByText('Núverandi þátttakendur í Tester')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('@')
    fireEvent.click(screen.getByRole('button', { name: 'Stebbishj' }))

    await waitFor(() => expect(mocks.bind).toHaveBeenCalledWith({
      expense_id: expenseId,
      member_id: memberId,
      event_participant_id: participantId,
      expected_financial_version: 8,
      request_id: requestId,
    }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('records a stable-request dispute and then refreshes canonical state', async () => {
    render(<ExpenseClaimDisputeControl
      expenseId={expenseId}
      memberId={memberId}
      financialVersion={8}
      disputed={false}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Ég kannast ekki við þetta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Merkja til yfirferðar' }))

    await waitFor(() => expect(mocks.dispute).toHaveBeenCalledWith({
      expense_id: expenseId,
      member_id: memberId,
      expected_financial_version: 8,
      request_id: requestId,
    }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('shows disputed state without adding a resolution workflow', () => {
    render(<ExpenseClaimDisputeControl
      expenseId={expenseId}
      memberId={memberId}
      financialVersion={9}
      disputed
    />)
    expect(screen.getByRole('status')).toHaveTextContent('Þarf yfirferð')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(document.body.textContent?.toLowerCase()).not.toContain('leysa')
  })
})
