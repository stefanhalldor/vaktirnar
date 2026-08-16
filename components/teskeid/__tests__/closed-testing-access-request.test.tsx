import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requestAccess: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const copy: Record<string, string> = {
      'features.utlagt-og-endurgreitt': 'Expenses and repayments',
      body: '{feature} is in closed testing.',
      request: 'Request access',
      requesting: 'Sending request…',
      requested: 'Your request has been sent.',
      error: 'The request could not be sent.',
      title: 'In closed testing',
    }
    return (copy[key] ?? key).replace('{feature}', values?.feature ?? '')
  },
}))

vi.mock('@/lib/teskeid/featureAccessRequest.actions', () => ({
  requestClosedTestingAccess: mocks.requestAccess,
}))

import { ClosedTestingAccessRequest } from '@/components/teskeid/ClosedTestingAccessRequest'

describe('ClosedTestingAccessRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requestAccess.mockResolvedValue({ ok: true, status: 'requested' })
  })

  it('explains closed testing and submits only the allowlisted feature id once', async () => {
    render(<ClosedTestingAccessRequest featureId="utlagt-og-endurgreitt" />)

    expect(screen.getByText('Expenses and repayments is in closed testing.')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Request access' })
    expect(button).toHaveClass('min-h-11')

    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
    })

    await waitFor(() => expect(mocks.requestAccess).toHaveBeenCalledOnce())
    expect(mocks.requestAccess).toHaveBeenCalledWith({
      feature_id: 'utlagt-og-endurgreitt',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Your request has been sent.')
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument()
  })

  it('refreshes the current server surface when access is already enabled', async () => {
    mocks.requestAccess.mockResolvedValueOnce({ ok: true, status: 'already_enabled' })
    render(<ClosedTestingAccessRequest featureId="utlagt-og-endurgreitt" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Request access' }))
    })

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
  })

  it('announces a failed request and lets the person retry', async () => {
    mocks.requestAccess.mockResolvedValueOnce({ ok: false, error: 'send_failed' })
    render(<ClosedTestingAccessRequest featureId="utlagt-og-endurgreitt" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Request access' }))
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('The request could not be sent.')
    expect(screen.getByRole('button', { name: 'Request access' })).toBeEnabled()
  })
})
