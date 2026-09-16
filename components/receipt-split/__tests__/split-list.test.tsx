import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ remove: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: Record<string, string>) => values?.title ? `${key}:${values.title}` : key }))
vi.mock('@/lib/receipt-split/actions', () => ({ deleteSplitFromList: mocks.remove }))
import { SplitList } from '../SplitList'

const owner = { id: '00000000-0000-4000-8000-000000000001', title: 'Dinner', state: 'sharing' as const, incurredOn: '2026-09-16', version: 4, isOwner: true }
const member = { ...owner, id: '00000000-0000-4000-8000-000000000002', title: 'Shared', isOwner: false }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  mocks.remove.mockResolvedValue({ ok: true, data: { id: owner.id } })
})

describe('receipt split list deletion', () => {
  it('shows deletion only to the owner and refreshes after success', async () => {
    render(<SplitList splits={[owner, member]} formattedDates={{ [owner.id]: '16 Sep 2026', [member.id]: '16 Sep 2026' }} />)
    expect(screen.getByRole('button', { name: 'deleteFromList:Dinner' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'deleteFromList:Shared' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'deleteFromList:Dinner' }))
    expect(window.confirm).toHaveBeenCalledWith('deleteListConfirm:Dinner')
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(expect.objectContaining({ id: owner.id, version: 4 })))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  })
})
