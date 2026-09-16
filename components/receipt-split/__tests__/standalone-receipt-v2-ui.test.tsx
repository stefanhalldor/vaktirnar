import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), refresh: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string, values?: Record<string, string | number>) =>
  key + (values?.count !== undefined ? ` (${values.count})` : values?.amount !== undefined ? ` ${values.amount}` : values?.remaining !== undefined ? ` ${values.remaining}/${values.total}` : '') }))
vi.mock('@/lib/receipt-split/actions', () => ({ mutateSplitV2: mocks.mutate, openSplitImage: vi.fn() }))
import { SplitBoardV2 } from '../SplitBoardV2'
import type { SplitViewV2 } from '@/lib/receipt-split/view-v2'
const id = '00000000-0000-4000-8000-000000000001'; const self = '00000000-0000-4000-8000-000000000002'
const view: SplitViewV2 = { id, contractVersion: 2, quantityScale: 3000, sourceContractVersion: 1,
  state: 'sharing', deleteScope: null, reviewSaved: true, version: 3, title: 'Dinner', currency: 'EUR', incurredOn: '2026-09-15',
  receiptTotalMinor: 2000, isOwner: true, imageAvailable: false, inviteToken: 'a'.repeat(64),
  members: [{ token: self, name: 'Anna', isSelf: true }],
  items: [{ id, kind: 'item', description: 'Wine', originalDescription: 'Wine', explanation: 'Red wine bottle', explanationNeedsReview: false,
    quantityUnits: 3000, itemRevision: 1, totalMinor: 1000 }], claims: [] }
beforeEach(() => { vi.clearAllMocks(); mocks.mutate.mockResolvedValue({ ok: true, data: { id } }) })
describe('live standalone v2 board', () => {
  it('shows separate reference/line totals and sends an exact half claim', async () => {
    render(<SplitBoardV2 view={view} />)
    expect(screen.getByText(/missing EUR 10/)).toBeInTheDocument()
    expect(screen.getByText('Red wine bottle')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('article', { name: 'Wine' })).getByRole('button', { name: '½' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      command: 'claim', quantityUnits: 1500, previousUnits: 0, itemRevision: 1, contractVersion: 2, quantityScale: 3000,
    })))
  })
  it('keeps fully claimed items collapsed but participant filtering reveals them', () => {
    const full = { ...view, claims: [{ itemId: id, memberToken: self, quantityUnits: 3000 }] }
    render(<SplitBoardV2 view={full} />)
    expect(screen.queryByRole('article', { name: 'Wine' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Anna/ }))
    expect(screen.getByRole('article', { name: 'Wine' })).toBeInTheDocument()
  })
  it('saves the review while confirming even when it was not saved separately', async () => {
    render(<SplitBoardV2 view={{ ...view, state: 'review', reviewSaved: false, inviteToken: null }} />)
    const confirm = screen.getByRole('button', { name: 'confirm' })
    expect(confirm).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'save' })).not.toBeInTheDocument()
    fireEvent.click(confirm)
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ command: 'confirm_review', version: 3 })))
  })
  it('edits the receipt total inline during review and keeps the sharing toggle', () => {
    const { rerender } = render(<SplitBoardV2 view={{ ...view, state: 'review', inviteToken: null }} />)
    expect(screen.getByLabelText('receiptTotal')).toHaveValue('20')
    expect(screen.queryByRole('button', { name: 'editReceipt' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('receiptTotal'), { target: { value: '21' } })
    expect(screen.getByRole('button', { name: 'saveReceipt' })).toBeInTheDocument()
    rerender(<SplitBoardV2 view={view} />)
    expect(screen.getByRole('button', { name: 'editReceipt' })).toBeInTheDocument()
  })
  it('shows a simple review row with the receipt name, explanation, and inline quantity and amount', async () => {
    const reviewItem = { ...view.items[0], originalDescription: 'Chocolate Cake', description: 'Chocolate Cake', explanation: 'Súkkulaðikaka', quantityUnits: 3000, totalMinor: 1300 }
    render(<SplitBoardV2 view={{ ...view, state: 'review', inviteToken: null, items: [reviewItem] }} />)
    const row = screen.getByRole('article', { name: 'Chocolate Cake' })
    expect(screen.getByText('reviewItems')).toBeInTheDocument()
    expect(screen.queryByText(/doneTitle/)).not.toBeInTheDocument()
    expect(screen.queryByText('remainingTitle')).not.toBeInTheDocument()
    expect(within(row).getByText('Súkkulaðikaka')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'edit' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '½' })).not.toBeInTheDocument()
    expect(within(row).getByLabelText('quantity')).toHaveValue('1')
    expect(within(row).getByLabelText('lineAmount')).toHaveValue('13')
    fireEvent.change(within(row).getByLabelText('quantity'), { target: { value: '2' } })
    fireEvent.change(within(row).getByLabelText('lineAmount'), { target: { value: '26' } })
    fireEvent.click(within(row).getByRole('button', { name: 'saveLine' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      command: 'edit_item', itemId: id, quantityUnits: 6000, totalMinor: 2600,
    })))
  })
  it('keeps the existing claim controls after splitting starts', () => {
    render(<SplitBoardV2 view={view} />)
    const row = screen.getByRole('article', { name: 'Wine' })
    expect(within(row).getByRole('button', { name: 'edit' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '½' })).toBeInTheDocument()
  })
})
