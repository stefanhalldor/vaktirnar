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
  it('renders PLN receipt amounts and review controls without currency errors', () => {
    render(<SplitBoardV2 view={{ ...view, currency: 'PLN', sourceContractVersion: 2,
      state: 'review', inviteToken: null }} />)
    expect(screen.getByText(/missing PLN 10/)).toBeInTheDocument()
    expect(screen.getAllByText(/PLN/).length).toBeGreaterThan(0)
    expect(screen.getByRole('article', { name: 'Wine' })).toBeInTheDocument()
  })
  it('shows separate reference/line totals and sends an exact half claim', async () => {
    render(<SplitBoardV2 view={view} />)
    expect(screen.getByText(/missing EUR 10/)).toBeInTheDocument()
    expect(screen.getByText('Red wine bottle')).toBeInTheDocument()
    const row = within(screen.getByRole('article', { name: 'Wine' }))
    fireEvent.click(row.getByText('otherQuantity'))
    fireEvent.click(row.getByRole('button', { name: 'fraction' }))
    fireEvent.change(row.getByLabelText('fractionNumerator'), { target: { value: '1' } })
    fireEvent.change(row.getByLabelText('fractionDenominator'), { target: { value: '2' } })
    fireEvent.click(row.getByRole('button', { name: 'saveProportion' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      command: 'claim', quantityUnits: 1500, previousUnits: 0, itemRevision: 1, contractVersion: 2, quantityScale: 3000, inputMode: 'fraction', fractionNumerator: 1, fractionDenominator: 2,
    })))
  })
  it('keeps slider movement local until release and marks quantity taken by others as unavailable', async () => {
    render(<SplitBoardV2 view={{ ...view,
      members: [...view.members, { token: other, name: 'Bjarni', isSelf: false }],
      items: [{ ...view.items[0], quantityUnits: 39000 }],
      claims: [{ itemId: id, memberToken: other, quantityUnits: 9000, inputMode: 'quantity' as const, fractionNumerator: null, fractionDenominator: null }],
    }} />)
    const row = within(screen.getByRole('article', { name: 'Wine' }))
    const slider = row.getByRole('slider', { name: 'sliderLabel' })
    expect(slider).toHaveAttribute('max', '10')
    expect(row.queryByText('sliderLabel')).not.toBeInTheDocument()
    const remaining = row.getByText('remaining 10/13')
    const claimant = row.getByText('Bjarni · 3')
    expect(claimant.compareDocumentPosition(remaining) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(remaining.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.getByText('takenByOthers')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '4.26' } })
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(slider).toHaveValue('4.5')
    fireEvent.pointerUp(slider)
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1))
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ command: 'claim', quantityUnits: 13500, inputMode: 'quantity' }))
  })
  it('shows the persisted fraction until slider use switches the claim back to quantity', async () => {
    render(<SplitBoardV2 view={{ ...view,
      items: [{ ...view.items[0], quantityUnits: 12000 }],
      claims: [{ itemId: id, memberToken: self, quantityUnits: 2400, inputMode: 'fraction' as const, fractionNumerator: 2, fractionDenominator: 10 }],
    }} />)
    const row = within(screen.getByRole('article', { name: 'Wine' }))
    const slider = row.getByRole('slider', { name: 'sliderLabel' })
    expect(slider).toHaveValue('0.8')
    expect(slider).toHaveAttribute('step', 'any')
    const valueBelowThumb = row.getAllByText('2/10').find(element => element.tagName === 'SPAN')
    expect(valueBelowThumb).toHaveStyle({ left: 'calc(20% + 4.8px)' })
    fireEvent.change(slider, { target: { value: '1.26' } })
    expect(row.getByText('1½')).toBeInTheDocument()
    expect(mocks.mutate).not.toHaveBeenCalled()
    fireEvent.pointerUp(slider)
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      command: 'claim', quantityUnits: 4500, inputMode: 'quantity',
    })))
  })
  it('starts with no status selected and lets either status be selected and cleared', () => {
    const full = { ...view, claims: [{ itemId: id, memberToken: self, quantityUnits: 3000, inputMode: 'quantity' as const, fractionNumerator: null, fractionDenominator: null }] }
    render(<SplitBoardV2 view={full} />)
    const outstanding = screen.getByRole('button', { name: /outstanding/ })
    const settled = screen.getByRole('button', { name: /settled/ })
    expect(outstanding).toHaveAttribute('aria-pressed', 'false')
    expect(settled).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('article', { name: 'Wine' })).toBeInTheDocument()
    fireEvent.click(settled)
    expect(settled).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(settled)
    expect(settled).toHaveAttribute('aria-pressed', 'false')
  })
  it('includes partially claimed items in both status views and shows the matching amount', () => {
    const partial = { ...view, claims: [{ itemId: id, memberToken: self, quantityUnits: 1500, inputMode: 'quantity' as const, fractionNumerator: null, fractionDenominator: null }] }
    render(<SplitBoardV2 view={partial} />)
    fireEvent.click(screen.getByRole('button', { name: /settled/ }))
    expect(within(screen.getByRole('article', { name: 'Wine' })).getByText('EUR 5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /settled/ }))
    fireEvent.click(screen.getByRole('button', { name: /outstanding/ }))
    expect(within(screen.getByRole('article', { name: 'Wine' })).getByText('EUR 5')).toBeInTheDocument()
  })
  it('shows every co-claimant on an item while filtering the list to one participant', () => {
    render(<SplitBoardV2 view={{ ...view,
      members: [...view.members, { token: other, name: 'Bjarni', isSelf: false }],
      items: [{ ...view.items[0], quantityUnits: 6000 }],
      claims: [{ itemId: id, memberToken: self, quantityUnits: 1500, inputMode: 'quantity' as const, fractionNumerator: null, fractionDenominator: null }, { itemId: id, memberToken: other, quantityUnits: 1500, inputMode: 'quantity' as const, fractionNumerator: null, fractionDenominator: null }],
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
    fireEvent.click(within(row).getByRole('button', { name: 'percent' }))
    expect(within(row).getByLabelText('myPercentage')).toHaveAttribute('inputmode', 'decimal')
    expect(within(row).getByLabelText('myPercentage')).toHaveValue('')
    expect(within(row).getByLabelText('myPercentage')).toHaveAttribute('placeholder', '0')
    fireEvent.click(within(row).getByRole('button', { name: 'fraction' }))
    expect(within(row).getByLabelText('fractionNumerator')).toHaveAttribute('inputmode', 'numeric')
    expect(within(row).getByLabelText('fractionDenominator')).toHaveAttribute('inputmode', 'numeric')
    expect(within(row).getByLabelText('fractionNumerator')).toHaveValue('')
    expect(within(row).getByLabelText('fractionNumerator')).toHaveAttribute('placeholder', '0')
    expect(within(row).getByLabelText('fractionDenominator')).toHaveValue('')
    expect(within(row).getByLabelText('fractionDenominator')).toHaveAttribute('placeholder', '7')
    fireEvent.change(within(row).getByLabelText('fractionNumerator'), { target: { value: '1' } })
    fireEvent.change(within(row).getByLabelText('fractionDenominator'), { target: { value: '7' } })
    expect(within(row).getByText(/normalizedProportion/)).toHaveTextContent('14.3%')
    fireEvent.click(within(row).getByRole('button', { name: 'saveProportion' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ command: 'claim', quantityUnits: 429, inputMode: 'fraction', fractionNumerator: 1, fractionDenominator: 7 })))
    fireEvent.click(within(row).getByRole('button', { name: 'takeRest' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ command: 'claim', quantityUnits: 3000, inputMode: 'quantity' })))
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
    expect(within(row).getByRole('slider', { name: 'sliderLabel' })).toBeInTheDocument()
    fireEvent.click(within(row).getByText('otherQuantity'))
    expect(within(row).getByRole('button', { name: 'quantity' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'percent' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'fraction' })).toBeInTheDocument()
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
      claims: [{ itemId: id, memberToken: self, quantityUnits: 1500, inputMode: 'quantity' as const, fractionNumerator: null, fractionDenominator: null }, { itemId: id, memberToken: other, quantityUnits: 1500, inputMode: 'quantity' as const, fractionNumerator: null, fractionDenominator: null }],
    }} />)
    expect(screen.getByRole('button', { name: 'add' })).toBeInTheDocument()
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
