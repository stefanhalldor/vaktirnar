import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), prepare: vi.fn(), extract: vi.fn(), upload: vi.fn(), writeText: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), join: vi.fn(), preview: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string, values?: Record<string,string | number>) => key + (values?.quantity !== undefined ? ' ' + values.quantity : values?.amount !== undefined ? ' ' + values.amount : '') }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) } }) }))
vi.mock('@/lib/receipt-split/actions', () => ({
  mutateSplit: mocks.mutate, prepareSplitImage: mocks.prepare, extractSplitImage: mocks.extract,
  joinSplit: mocks.join, previewSplitInvite: mocks.preview, openSplitImage: vi.fn(),
}))
import { SplitImport } from '../SplitImport'
import { SplitBoard } from '../SplitBoard'
import { SplitJoin } from '../SplitJoin'
import type { SplitView } from '@/lib/receipt-split/contracts'

const id = '00000000-0000-4000-8000-000000000001'
const anna = '00000000-0000-4000-8000-000000000002'
const bob = '00000000-0000-4000-8000-000000000003'
const itemId = '00000000-0000-4000-8000-000000000004'
const view: SplitView = { id, title: 'Coffee', state: 'sharing', version: 3, currency: 'EUR', incurredOn: '2026-09-15',
  totalMinor: 1600, isOwner: false, imageAvailable: false, inviteToken: null, deleteScope: null, reviewSaved: true,
  members: [{ token: anna, name: 'Anna', isSelf: true }, { token: bob, name: 'Bob', isSelf: false }],
  items: [{ id: itemId, kind: 'item', description: 'Espresso', quantityMilli: 4000, totalMinor: 1600 }],
  claims: [{ itemId, memberToken: anna, quantityMilli: 1000 }] }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.mutate.mockResolvedValue({ ok: true, data: { id } })
  mocks.prepare.mockResolvedValue({ ok: true, data: { path: 'receipt.jpg', token: 'upload-token' } })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.extract.mockResolvedValue({ ok: true, data: { id } })
  mocks.writeText.mockResolvedValue(undefined)
  mocks.preview.mockResolvedValue({ ok: true, data: { title: 'Dinner at Milan' } })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.writeText } })
  sessionStorage.clear()
  history.replaceState({}, '', '/')
})
describe('standalone receipt UI', () => {
  it('presents Teskeið and another AI app as two separate import options', () => {
    render(<SplitImport />)
    expect(screen.getByRole('heading', { name: 'teskeidMethod' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'otherAiMethod' })).toBeInTheDocument()
    expect(screen.getByText('methodOne')).toBeInTheDocument()
    expect(screen.getByText('methodTwo')).toBeInTheDocument()
  })
  it('promotes each import action only when its own input is ready', () => {
    render(<SplitImport />)
    const imageAction = screen.getByRole('button', { name: 'image' })
    const jsonAction = screen.getByRole('button', { name: 'create' })
    expect(imageAction).toBeDisabled()
    expect(imageAction).toHaveClass('bg-background')
    expect(jsonAction).toBeDisabled()
    expect(jsonAction).toHaveClass('bg-background')

    fireEvent.change(screen.getByLabelText('image'), {
      target: { files: [new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' })] },
    })
    expect(imageAction).toBeEnabled()
    expect(imageAction).toHaveClass('bg-primary')

    fireEvent.change(screen.getByLabelText('json'), { target: { value: '{"title":"Coffee"}' } })
    expect(jsonAction).toBeEnabled()
    expect(jsonAction).toHaveClass('bg-primary')
  })
  it('adds a missing line in review without changing the receipt total', async () => {
    render(<SplitBoard view={{ ...view, state: 'review', isOwner: true, claims: [], totalMinor: 2000 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'addItem' }))
    const form = within(screen.getByRole('group', { name: 'newItem' }))
    fireEvent.change(form.getByLabelText('description'), { target: { value: 'Cake' } })
    fireEvent.change(form.getByLabelText('amount'), { target: { value: '4' } })
    fireEvent.click(form.getByRole('button', { name: 'addItem' }))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'newItem' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('total')).toHaveValue('20')
    expect(screen.queryByText(/missingAmount/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled())
    const payload = JSON.parse(mocks.mutate.mock.calls[0][0].text)
    expect(payload.receipt_total_minor).toBe(2000)
    expect(payload.items).toHaveLength(2)
    expect(payload.items[1]).toMatchObject({ description: 'Cake', total_minor: 400, quantity_milli: 1000 })
  })
  it('preserves a failed shared addition and retries the same request without replacing claims', async () => {
    mocks.mutate.mockResolvedValue({ ok: false, error: 'failed' })
    render(<SplitBoard view={{ ...view, isOwner: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'addItem' }))
    const form = within(screen.getByRole('group', { name: 'newItem' }))
    fireEvent.change(form.getByLabelText('description'), { target: { value: 'Cake' } })
    fireEvent.change(form.getByLabelText('amount'), { target: { value: '4.5' } })
    fireEvent.click(form.getByRole('button', { name: 'addItem' }))
    await form.findByRole('alert')
    fireEvent.click(form.getByRole('button', { name: 'addItem' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2))
    expect(mocks.mutate.mock.calls[1][0]).toEqual(mocks.mutate.mock.calls[0][0])
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ command: 'add_item', description: 'Cake', quantity: 1000, amount: 450 })
    expect(mocks.mutate.mock.calls[0][0]).not.toHaveProperty('claims')
    expect(screen.getByText('Anna · 1')).toBeInTheDocument()
    expect(form.getByLabelText('amount')).toHaveValue('4.5')
  })
  it('offers shared additions only to the owner', () => {
    render(<SplitBoard view={view} />)
    expect(screen.queryByRole('button', { name: 'addItem' })).not.toBeInTheDocument()
  })
  it('shows compact review values and updates missing/excess amounts before saving', () => {
    render(<SplitBoard view={{ ...view, state: 'review', isOwner: true, claims: [], totalMinor: 2000 }} />)
    expect(screen.getByLabelText('quantity')).toHaveValue('4')
    expect(screen.getByLabelText('amount')).toHaveValue('16')
    expect(screen.getByLabelText('total')).toHaveValue('20')
    expect(screen.getByText(/missingAmount EUR\s*4/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '20.5' } })
    expect(screen.getByText(/excessAmount EUR\s*0.5/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '20' } })
    expect(screen.queryByText(/excessAmount|missingAmount/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '' } })
    expect(screen.getByText('mismatch')).toBeInTheDocument()
  })
  it('submits JSON without a selected file, navigates within Splitta, and never prepares an image', async () => {
    render(<SplitImport />)
    fireEvent.change(screen.getByLabelText('json'), { target: { value: '{"title":"Coffee"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/auth-mvp/splitta-reikningnum/' + id))
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ command: 'create', text: '{"title":"Coffee"}' }))
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.extract).not.toHaveBeenCalled()
  })
  it('copies the hidden AI prompt without showing a prompt drawer or textarea', async () => {
    render(<SplitImport />)
    expect(screen.getByText('copyPromptHelp')).toBeInTheDocument()
    expect(screen.queryByText('manualTitle')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('manualTitle')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'copyPrompt' }))
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('manualPromptText'))
    expect(screen.getByRole('button', { name: 'copiedPrompt' })).toBeInTheDocument()
  })
  it('shows the canonical loader throughout receipt image analysis', async () => {
    let finishExtraction: ((value: { ok: true; data: { id: string } }) => void) | undefined
    mocks.extract.mockImplementation(() => new Promise(resolve => { finishExtraction = resolve }))
    render(<SplitImport />)
    const file = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('image'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'image' }))
    expect(await screen.findByRole('status', { name: 'analyzingLabel' })).toBeInTheDocument()
    await waitFor(() => expect(mocks.extract).toHaveBeenCalledWith(expect.any(String)))
    expect(screen.getByRole('status', { name: 'analyzingLabel' })).toBeInTheDocument()
    finishExtraction?.({ ok: true, data: { id } })
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expect.stringMatching(/^\/auth-mvp\/splitta-reikningnum\//)))
  })
  it('routes an exhausted daily allowance to the saved split and recommends option two', async () => {
    mocks.extract.mockResolvedValue({ ok: false, error: 'quota' })
    const first = render(<SplitImport />)
    const file = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('image'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'image' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/auth-mvp\/splitta-reikningnum\/.*\?reason=quota$/),
    ))
    first.unmount()
    render(<SplitImport id={id} recoveryReason="quota" />)
    expect(screen.getByText('quotaRecovery')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'copyPrompt' })).toBeInTheDocument()
  })
  it('keeps JSON and reuses request IDs after a failed response', async () => {
    mocks.mutate.mockResolvedValue({ ok: false, error: 'failed' })
    render(<SplitImport />)
    fireEvent.change(screen.getByLabelText('json'), { target: { value: '{"title":"Coffee"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2))
    expect(mocks.mutate.mock.calls[0][0]).toEqual(mocks.mutate.mock.calls[1][0])
    expect(screen.getByLabelText('json')).toHaveValue('{"title":"Coffee"}')
  })
  it('shows one of four espresso claimed and lets the current user take another', async () => {
    render(<SplitBoard view={view} />)
    expect(screen.getByText('remaining: 3 / 4')).toBeInTheDocument()
    expect(screen.getByText('Anna · 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'take 1' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ command: 'claim', itemId, previous: 1000, quantity: 2000 })))
    expect(mocks.mutate.mock.calls[0][0]).not.toHaveProperty('memberToken')
  })
  it('uses canonical multi-select and clear behavior to filter participants', () => {
    render(<SplitBoard view={view} />)
    fireEvent.click(screen.getByRole('button', { name: /Bob ·/ }))
    expect(screen.queryByText('Espresso')).not.toBeInTheDocument()
    expect(screen.getByText('noItems')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Anna ·/ }))
    expect(screen.getByText('Espresso')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByText('Espresso')).toBeInTheDocument()
  })
  it('keeps zero-price lines in their own editable review step', async () => {
    render(<SplitBoard view={{ ...view, state: 'review', isOwner: true, claims: [],
      items: [...view.items, { id: bob, kind: 'item', description: 'Birthday cake', quantityMilli: 1000, totalMinor: 0 }] }} />)
    const group = screen.getByRole('group', { name: 'zeroTitle' })
    expect(group).toHaveTextContent('zeroHelp')
    const amount = group.querySelector('input[inputmode="decimal"]:last-of-type')
    expect(amount).toBeTruthy()
    const allAmounts = screen.getAllByLabelText('amount')
    fireEvent.change(allAmounts[0], { target: { value: '4.50' } })
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled())
    const saved = JSON.parse(mocks.mutate.mock.calls[0][0].text)
    expect(saved.items.find((i: {description: string}) => i.description === 'Birthday cake').total_minor).toBe(450)
  })
  it('removes the bearer fragment and preserves it across the login round trip', async () => {
    const token = 'a'.repeat(64)
    history.replaceState({}, '', '/splitt#' + token)
    mocks.join.mockResolvedValue({ ok: false, error: 'login' })
    render(<SplitJoin />)
    await waitFor(() => expect(location.hash).toBe(''))
    expect(sessionStorage.getItem('teskeid:pending-split-invite')).toBe(token)
    expect(await screen.findByText('Dinner at Milan')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'joinYes' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/innskraning?next=%2Fsplitt'))
    expect(sessionStorage.getItem('teskeid:pending-split-join')).toBe('yes')
  })
})
