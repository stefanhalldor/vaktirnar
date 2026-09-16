import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), dismiss: vi.fn(), saveExchange: vi.fn(), refresh: vi.fn(), replace: vi.fn() }))
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string, values?: Record<string, string | number>) =>
  key + (values?.count !== undefined ? ` (${values.count})` : values?.amount !== undefined ? ` ${values.amount}` : values?.remaining !== undefined ? ` ${values.remaining}/${values.total}` : values?.proportion !== undefined ? ` ${values.proportion} ${values.quantity}` : '') }))
vi.mock('@/lib/receipt-split/actions', () => ({ mutateSplitV2: mocks.mutate, setSplitItemDismissed: mocks.dismiss, saveSplitExchange: mocks.saveExchange, openSplitImage: vi.fn() }))
import { SplitBoardV2 } from '../SplitBoardV2'
import type { SplitViewV2 } from '@/lib/receipt-split/view-v2'
const id = '00000000-0000-4000-8000-000000000001'; const self = '00000000-0000-4000-8000-000000000002'
const other = '00000000-0000-4000-8000-000000000003'
const view: SplitViewV2 = { id, contractVersion: 2, quantityScale: 3000, sourceContractVersion: 1,
  state: 'sharing', deleteScope: null, reviewSaved: true, version: 3, title: 'Dinner', currency: 'EUR', incurredOn: '2026-09-15',
  receiptTotalMinor: 2000, isOwner: true, imageAvailable: false, inviteToken: 'a'.repeat(64),
  members: [{ token: self, name: 'Anna', isSelf: true }],
  items: [{ id, kind: 'item', description: 'Wine', originalDescription: 'Wine', explanation: 'Red wine bottle', explanationNeedsReview: false,
    quantityUnits: 3000, itemRevision: 1, totalMinor: 1000 }], claims: [], dismissedItemIds: [] }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.mutate.mockResolvedValue({ ok: true, data: { id } })
  mocks.dismiss.mockResolvedValue({ ok: true, data: { id } })
  mocks.saveExchange.mockResolvedValue({ ok: true, data: { id } })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})
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
  it('switches fully claimed items into the settled status and participant filtering keeps all co-claimants visible', () => {
    const full = { ...view, claims: [{ itemId: id, memberToken: self, quantityUnits: 3000 }] }
    render(<SplitBoardV2 view={full} />)
    expect(screen.queryByRole('article', { name: 'Wine' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /settled/ }))
    expect(screen.getByRole('article', { name: 'Wine' })).toBeInTheDocument()
  })
  it('shows every co-claimant on an item while filtering the list to one participant', () => {
    render(<SplitBoardV2 view={{ ...view,
      members: [...view.members, { token: other, name: 'Bjarni', isSelf: false }],
      items: [{ ...view.items[0], quantityUnits: 6000 }],
      claims: [{ itemId: id, memberToken: self, quantityUnits: 1500 }, { itemId: id, memberToken: other, quantityUnits: 1500 }],
    }} />)
    fireEvent.click(screen.getByRole('button', { name: /Anna/ }))
    const row = screen.getByRole('article', { name: 'Wine' })
    expect(within(row).getByText('Anna · ½')).toBeInTheDocument()
    expect(within(row).getByText('Bjarni · ½')).toBeInTheDocument()
  })
  it('accepts a seventh as a visible normalized proportion and supports rest and personal dismissal', async () => {
    render(<SplitBoardV2 view={view} />)
    const row = screen.getByRole('article', { name: 'Wine' })
    fireEvent.click(within(row).getByText('otherQuantity'))
    fireEvent.change(within(row).getByLabelText('myProportion'), { target: { value: '1/7' } })
    expect(within(row).getByText(/normalizedProportion/)).toHaveTextContent('14.3%')
    fireEvent.click(within(row).getByRole('button', { name: 'saveProportion' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ command: 'claim', quantityUnits: 429 })))
    fireEvent.click(within(row).getByRole('button', { name: 'takeRest' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ command: 'claim', quantityUnits: 3000 })))
    fireEvent.click(within(row).getByRole('button', { name: 'notMine' }))
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith(expect.objectContaining({ itemId: id, dismissed: true })))
  })
  it('keeps personal not-mine items only in a drawer at the bottom of outstanding', () => {
    render(<SplitBoardV2 view={{ ...view, dismissedItemIds: [id] }} />)
    expect(screen.queryByRole('article', { name: 'Wine' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /notMineTitle/ }))
    expect(screen.getByRole('article', { name: 'Wine' })).toBeInTheDocument()
  })
  it('saves the review while confirming even when it was not saved separately', async () => {
    render(<SplitBoardV2 view={{ ...view, state: 'review', reviewSaved: false, inviteToken: null }} />)
    const confirms = screen.getAllByRole('button', { name: 'confirm' })
    const itemsHeading = screen.getByText('reviewItems')
    const addItem = screen.getByRole('button', { name: 'add' })
    expect(confirms).toHaveLength(2)
    expect(confirms[0].compareDocumentPosition(itemsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(confirms[1].compareDocumentPosition(addItem) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(confirms[0]).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'save' })).not.toBeInTheDocument()
    fireEvent.click(confirms[0])
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ command: 'confirm_review', version: 3 })))
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })
  it('hides matched-total copy but keeps mismatch guidance and amount visible', () => {
    const matched = { ...view, state: 'review' as const, inviteToken: null, receiptTotalMinor: 1000 }
    const { rerender } = render(<SplitBoardV2 view={matched} />)
    expect(screen.queryByText('matched')).not.toBeInTheDocument()
    expect(screen.queryByText('reviewHelp')).not.toBeInTheDocument()
    for (const confirm of screen.getAllByRole('button', { name: 'confirm' })) {
      expect(confirm.closest('section')).not.toHaveClass('border')
      expect(confirm.closest('section')).not.toHaveClass('p-4')
    }

    rerender(<SplitBoardV2 view={{ ...matched, receiptTotalMinor: 2000 }} />)
    expect(screen.getByText(/missing EUR 10/)).toBeInTheDocument()
    expect(screen.getAllByText('reviewHelp')).toHaveLength(2)
    for (const confirm of screen.getAllByRole('button', { name: 'confirm' })) {
      expect(confirm.closest('section')).toHaveClass('border', 'p-4')
    }
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
  it('reveals a locally generated QR canvas for the current share link', async () => {
    render(<SplitBoardV2 view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'showQr' }))
    expect(await screen.findByLabelText('qrLabel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'hideQr' })).toHaveAttribute('aria-expanded', 'true')
  })
  it('shows every participant in both currencies and lets any member save an arbitrary currency code', async () => {
    render(<SplitBoardV2 view={{ ...view, isOwner: false,
      members: [{ token: self, name: 'Anna', isSelf: true }, { token: other, name: 'Bjarni', isSelf: false }],
      claims: [{ itemId: id, memberToken: self, quantityUnits: 1500 }, { itemId: id, memberToken: other, quantityUnits: 1500 }],
    }} />)
    fireEvent.click(screen.getByRole('button', { name: 'conversion' }))
    fireEvent.change(screen.getByLabelText('targetCurrency'), { target: { value: 'pln' } })
    fireEvent.change(screen.getByLabelText('exchangeRate'), { target: { value: '4,5' } })
    expect(screen.getByLabelText('targetCurrency')).toHaveValue('PLN')
    expect(screen.getAllByText('EUR 5')).toHaveLength(2)
    expect(screen.getAllByText('PLN 22.5')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'saveExchange' }))
    await waitFor(() => expect(mocks.saveExchange).toHaveBeenCalledWith(expect.objectContaining({
      id, version: 3, currency: 'PLN', rate: '4.5',
    })))
  })
})
