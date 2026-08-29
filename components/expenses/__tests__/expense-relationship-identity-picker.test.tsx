import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ bind: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => ({
  'teskeid.expenses.identity.linkTeskeidUser': 'Tengja við Teskeiðarnotanda',
  'teskeid.expenses.identity.relationshipPickerDescription': 'Veldu staðfest Tengsl.',
  'teskeid.expenses.identity.binding': 'Tengi...',
  'teskeid.expenses.common.cancel': 'Hætta við',
}[key] ?? key) }))
vi.mock('@/lib/expenses/actions', () => ({ bindExpenseMemberRelationshipIdentity: mocks.bind }))
vi.mock('@/components/expenses/request-id', () => ({ useExpenseMutationRequestIds: () => ({ forPayload: () => '60000000-0000-4000-8000-000000000001', succeeded: vi.fn() }) }))
import { ExpenseRelationshipIdentityPicker } from '@/components/expenses/ExpenseRelationshipIdentityPicker'
const props = { expenseId: '40000000-0000-4000-8000-000000000001', memberId: '20000000-0000-4000-8000-000000000002', financialVersion: 7,
  candidates: [{ relationshipId: '71000000-0000-4000-8000-000000000001', displayName: 'Mamma' }] }
describe('ExpenseRelationshipIdentityPicker', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.bind.mockResolvedValue({ ok: true, data: {} }) })
  it('shows the named action directly and sends only opaque exact IDs', async () => {
    render(<ExpenseRelationshipIdentityPicker {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tengja við Teskeiðarnotanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mamma' }))
    await waitFor(() => expect(mocks.bind).toHaveBeenCalledTimes(1))
    expect(mocks.bind).toHaveBeenCalledWith({ expense_id: props.expenseId, member_id: props.memberId,
      relationship_id: props.candidates[0]!.relationshipId, expected_financial_version: 7,
      request_id: '60000000-0000-4000-8000-000000000001' })
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  })
  it('locks candidates while pending and prevents double submit', async () => {
    let release!: () => void
    mocks.bind.mockReturnValue(new Promise((resolve) => { release = () => resolve({ ok: true, data: {} }) }))
    render(<ExpenseRelationshipIdentityPicker {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tengja við Teskeiðarnotanda' }))
    const candidate = screen.getByRole('button', { name: 'Mamma' })
    fireEvent.click(candidate); fireEvent.click(candidate)
    await waitFor(() => expect(candidate).toBeDisabled()); expect(mocks.bind).toHaveBeenCalledTimes(1)
    release()
  })
})
