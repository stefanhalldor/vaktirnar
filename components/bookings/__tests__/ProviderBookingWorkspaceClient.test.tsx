import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderBookingWorkspaceView } from '@/lib/bookings/contracts'

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, unknown>) => values?.state ? `${key}:${values.state}` : key,
}))

import { ProviderBookingWorkspaceClient } from '../ProviderBookingWorkspaceClient'

const workspace: ProviderBookingWorkspaceView = {
  profiles: [{
    id: 'profile-id',
    slug: 'kvissbador',
    displayName: 'Kvissbador',
    description: null,
    websiteUrl: null,
  }],
  services: [],
  requests: [],
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ProviderBookingWorkspaceClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('converts a provider percentage to integer basis points', async () => {
    const savedWorkspace: ProviderBookingWorkspaceView = {
      ...workspace,
      services: [{
        id: 'service-id',
        businessProfileId: 'profile-id',
        revision: 1,
        title: 'Kvissveisla',
        summary: 'Fyrir hópa',
        timezone: 'Atlantic/Reykjavik',
        signedInDiscountBps: 1025,
        status: 'draft',
        updatedAt: '2026-08-11T16:00:00.000Z',
      }],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, data: savedWorkspace.services[0] }))
      .mockResolvedValueOnce(response(savedWorkspace))
    vi.stubGlobal('fetch', fetchMock)

    render(<ProviderBookingWorkspaceClient initialWorkspace={workspace} />)
    await userEvent.type(screen.getByLabelText('provider.serviceTitle'), 'Kvissveisla')
    await userEvent.type(screen.getByLabelText('provider.summary'), 'Fyrir hópa')
    await userEvent.type(screen.getByLabelText('provider.discount'), '10.25')
    await userEvent.click(screen.getByRole('button', { name: 'provider.save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      action: 'upsertService',
      businessProfileId: 'profile-id',
      signedInDiscountBps: 1025,
      timezone: 'Atlantic/Reykjavik',
    })
    expect(screen.getByRole('status')).toHaveTextContent('provider.draftSaved')
    expect(screen.getByText('provider.serviceStatus.draft', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'provider.guideTitle' })).toBeInTheDocument()
    expect(screen.getByText('provider.guideDraftIntro')).toBeInTheDocument()
    expect(screen.getByText('provider.guidePublishStep')).toBeInTheDocument()
    expect(screen.getByText('provider.guideShareStep')).toBeInTheDocument()
    expect(screen.getByText('provider.guideInboxStep')).toBeInTheDocument()
  })

  it('confirms that saved changes to a published service remain public', async () => {
    const publishedWorkspace: ProviderBookingWorkspaceView = {
      ...workspace,
      services: [{
        id: 'service-id',
        businessProfileId: 'profile-id',
        revision: 2,
        title: 'Kvissveisla',
        summary: 'Fyrir hópa',
        timezone: 'Atlantic/Reykjavik',
        signedInDiscountBps: null,
        status: 'published',
        updatedAt: '2026-08-11T16:00:00.000Z',
      }],
    }
    const savedWorkspace: ProviderBookingWorkspaceView = {
      ...publishedWorkspace,
      services: [{ ...publishedWorkspace.services[0]!, revision: 3, summary: 'Ný opinber lýsing' }],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, data: savedWorkspace.services[0] }))
      .mockResolvedValueOnce(response(savedWorkspace))
    vi.stubGlobal('fetch', fetchMock)

    render(<ProviderBookingWorkspaceClient initialWorkspace={publishedWorkspace} />)
    const summary = screen.getByLabelText(/provider.summary/)
    await userEvent.clear(summary)
    await userEvent.type(summary, 'Ný opinber lýsing')
    await userEvent.click(screen.getByRole('button', { name: 'provider.save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('provider.publishedChangesSaved')
    expect(screen.getByText('provider.guidePublishedIntro')).toBeInTheDocument()
    expect(screen.queryByText('provider.guidePublishStep')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /provider.openBookingPage/ })).toHaveAttribute('href', '/bokanir/kvissbador')
  })

  it('renders a small operational inbox instead of analytics', () => {
    render(<ProviderBookingWorkspaceClient initialWorkspace={{
      ...workspace,
      requests: [{
        publicId: 'request-id',
        businessProfileSlug: 'kvissbador',
        providerDisplayName: 'Kvissbador',
        serviceTitle: 'Kvissveisla',
        status: 'requested',
        requestedDate: '2026-09-20',
        requestedTime: '18:30',
        timezone: 'Atlantic/Reykjavik',
        contactName: 'Anna',
        createdAt: '2026-08-11T16:00:00.000Z',
        lastMessageAt: null,
      }],
    }} />)

    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('provider.inboxTitle')).toBeInTheDocument()
    expect(screen.queryByText(/analytics/i)).not.toBeInTheDocument()
  })

  it('treats an entered zero-percent discount as disabled', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, data: {} }))
      .mockResolvedValueOnce(response(workspace))
    vi.stubGlobal('fetch', fetchMock)

    render(<ProviderBookingWorkspaceClient initialWorkspace={workspace} />)
    await userEvent.type(screen.getByLabelText('provider.serviceTitle'), 'Kvissveisla')
    await userEvent.type(screen.getByLabelText('provider.summary'), 'Fyrir hópa')
    await userEvent.type(screen.getByLabelText('provider.discount'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'provider.save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).signedInDiscountBps).toBeNull()
  })

  it('saves without a short description and explains that it is public', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, data: {} }))
      .mockResolvedValueOnce(response(workspace))
    vi.stubGlobal('fetch', fetchMock)

    render(<ProviderBookingWorkspaceClient initialWorkspace={workspace} />)
    await userEvent.type(screen.getByLabelText(/provider.summary/), '   ')
    await userEvent.type(screen.getByLabelText('provider.serviceTitle'), 'Kvissveisla')
    expect(screen.getByText('provider.summaryHint')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'provider.save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      title: 'Kvissveisla',
      summary: '',
    })
  })

  it('shows action-specific feedback while publishing', async () => {
    const draftWorkspace: ProviderBookingWorkspaceView = {
      ...workspace,
      services: [{
        id: 'service-id',
        businessProfileId: 'profile-id',
        revision: 1,
        title: 'Kvissveisla',
        summary: 'Fyrir hópa',
        timezone: 'Atlantic/Reykjavik',
        signedInDiscountBps: null,
        status: 'draft',
        updatedAt: '2026-08-11T16:00:00.000Z',
      }],
    }
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)

    render(<ProviderBookingWorkspaceClient initialWorkspace={draftWorkspace} />)
    await userEvent.click(await screen.findByRole('button', { name: 'provider.publish' }))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'provider.publishing' })).toBeDisabled()
  })
})
