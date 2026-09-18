import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ availability: vi.fn(), prepare: vi.fn(), upload: vi.fn(), extract: vi.fn(), mutate: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) } }) }))
vi.mock('@/lib/receipt-split/actions', () => ({ getSplitImageAvailability: mocks.availability, prepareSplitImage: mocks.prepare, extractSplitImage: mocks.extract, mutateSplit: mocks.mutate }))
import { SplitImport } from '../SplitImport'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.availability.mockResolvedValue({ ok: true, data: { available: true } })
})

describe('receipt image availability', () => {
  it('disables image selection during the read without blocking JSON', async () => {
    let resolve!: (value: unknown) => void
    mocks.availability.mockReturnValue(new Promise(r => { resolve = r }))
    render(<SplitImport />)
    expect(screen.getByLabelText('image')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'image' })).toBeDisabled()
    expect(screen.getByText('quotaChecking')).toBeInTheDocument()
    expect(screen.getByLabelText('json')).toBeEnabled()
    await act(async () => resolve({ ok: true, data: { available: true } }))
    expect(screen.getByLabelText('image')).toBeEnabled()
  })
  it.each([['quota', 'quotaRecovery'], ['capacity', 'capacityRecovery'], ['failed', 'quotaUnavailable'], ['login', 'login']])('blocks %s with an accurate explanation and leaves option two usable', async (error, text) => {
    mocks.availability.mockResolvedValue({ ok: false, error })
    render(<SplitImport />)
    expect(await screen.findByText(text)).toBeInTheDocument()
    if (error === 'quota') {
      expect(screen.queryByLabelText('image')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'image' })).not.toBeInTheDocument()
      expect(screen.getByText('methodOne')).toBeInTheDocument()
      expect(screen.getByText('methodOne').closest('section')).toContainElement(screen.getByText('quotaRecovery'))
      for (const key of ['methodHelp', 'teskeidMethod', 'teskeidMethodHelp', 'imageHelp', 'providerNotice']) {
        expect(screen.queryByText(key)).not.toBeInTheDocument()
      }
      expect(screen.queryByRole('button', { name: 'quotaRetry' })).not.toBeInTheDocument()
    } else {
      expect(screen.getByLabelText('image')).toBeDisabled()
      expect(screen.getByRole('button', { name: 'image' })).toBeDisabled()
    }
    fireEvent.change(screen.getByLabelText('json'), { target: { value: '{}' } })
    expect(screen.getByRole('button', { name: 'create' })).toBeEnabled()
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.extract).not.toHaveBeenCalled()
  })
  it('recovers from an unknown status without claiming quota exhaustion', async () => {
    mocks.availability.mockRejectedValueOnce(new Error('offline'))
    render(<SplitImport />)
    expect(await screen.findByText('quotaUnavailable')).toBeInTheDocument()
    expect(screen.queryByText('quotaRecovery')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'quotaRetry' }))
    await waitFor(() => expect(screen.getByLabelText('image')).toBeEnabled())
  })
  it('refreshes a stale status when returning to the tab', async () => {
    render(<SplitImport />)
    await waitFor(() => expect(screen.getByLabelText('image')).toBeEnabled())
    mocks.availability.mockResolvedValue({ ok: false, error: 'quota' })
    fireEvent(window, new Event('focus'))
    expect(await screen.findByText('quotaRecovery')).toBeInTheDocument()
    expect(screen.queryByLabelText('image')).not.toBeInTheDocument()
  })
  it('does not upload if quota became exhausted after the initial check', async () => {
    render(<SplitImport />)
    await waitFor(() => expect(screen.getByLabelText('image')).toBeEnabled())
    mocks.prepare.mockResolvedValue({ ok: false, error: 'quota' })
    mocks.availability.mockResolvedValue({ ok: false, error: 'quota' })
    fireEvent.change(screen.getByLabelText('image'), { target: { files: [new File(['image'], 'bill.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'image' }))
    expect(await screen.findByText('quotaRecovery')).toBeInTheDocument()
    expect(mocks.prepare).toHaveBeenCalledOnce()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.extract).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it('does not check quota in the saved JSON recovery flow', () => {
    render(<SplitImport id="saved" recoveryReason="quota" />)
    expect(screen.getByText('quotaRecovery')).toBeInTheDocument()
    expect(mocks.availability).not.toHaveBeenCalled()
  })
  it('preserves a non-quota preparation error after availability refreshes', async () => {
    render(<SplitImport />)
    await waitFor(() => expect(screen.getByLabelText('image')).toBeEnabled())
    mocks.prepare.mockResolvedValue({ ok: false, error: 'failed' })
    fireEvent.change(screen.getByLabelText('image'), { target: { files: [new File(['image'], 'bill.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'image' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('failed')
    await waitFor(() => expect(screen.getByLabelText('image')).toBeEnabled())
    expect(screen.getByRole('alert')).toHaveTextContent('failed')
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})
