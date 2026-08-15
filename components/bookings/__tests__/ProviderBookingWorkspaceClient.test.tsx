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
  facets: { states: [], attention: [] },
}

const workflow = {
  id: '00000000-0000-4000-8000-000000000010',
  revision: 1,
  activeVersionId: '00000000-0000-4000-8000-000000000011',
  activeVersionNumber: 1,
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
        workflow,
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
        workflow,
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
        lifecycleStatus: 'requested',
        cancellationReason: null,
        workflowState: {
          workflowId: workflow.id,
          logicalKey: 'new_request',
          systemLabelKey: 'new_request',
          label: null,
          attentionSide: 'provider',
          semanticKind: 'active',
        },
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

  it('filters by stable workflow key and keeps cancelled rows out of attention facets', async () => {
    const active = {
      publicId: '00000000-0000-4000-8000-000000000020',
      businessProfileSlug: 'kvissbador',
      providerDisplayName: 'Kvissbador',
      serviceTitle: 'Kvissveisla',
      lifecycleStatus: 'requested' as const,
      cancellationReason: null,
      workflowState: {
        workflowId: workflow.id,
        logicalKey: 'new_request',
        systemLabelKey: 'new_request' as const,
        label: null,
        attentionSide: 'provider' as const,
        semanticKind: 'active' as const,
      },
      requestedDate: '2026-09-20',
      requestedTime: '18:30',
      timezone: 'Atlantic/Reykjavik',
      contactName: 'Anna',
      createdAt: '2026-08-11T16:00:00.000Z',
      lastMessageAt: null,
    }
    const cancelled = {
      ...active,
      publicId: '00000000-0000-4000-8000-000000000021',
      contactName: 'Bjarni',
      lifecycleStatus: 'cancelled' as const,
      cancellationReason: 'customer_cancelled' as const,
      workflowState: null,
    }
    const olderPinnedVersion = {
      ...active,
      publicId: '00000000-0000-4000-8000-000000000022',
      contactName: 'Dóra',
      workflowState: {
        ...active.workflowState,
        systemLabelKey: null,
        label: 'Eldra heiti',
      },
    }
    const initialWorkspace: ProviderBookingWorkspaceView = {
      ...workspace,
      requests: [active, olderPinnedVersion, cancelled],
      facets: {
        states: [{
          key: `${workflow.id}:new_request`,
          workflowId: workflow.id,
          logicalKey: 'new_request',
          systemLabelKey: 'new_request',
          label: null,
          count: 2,
        }],
        attention: [{ attentionSide: 'provider', count: 2 }],
      },
    }
    const filteredWorkspace = { ...initialWorkspace, requests: [active, olderPinnedVersion] }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(filteredWorkspace))
      .mockResolvedValueOnce(response(initialWorkspace))
      .mockResolvedValueOnce(response(filteredWorkspace))
    vi.stubGlobal('fetch', fetchMock)
    render(<ProviderBookingWorkspaceClient initialWorkspace={initialWorkspace} />)

    await userEvent.selectOptions(
      screen.getByLabelText('provider.filters.state'),
      `${workflow.id}:new_request`,
    )
    await waitFor(() => expect(screen.queryByText('Bjarni')).not.toBeInTheDocument())
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/bookings/provider?workflowId=${workflow.id}&stateLogicalKey=new_request`,
    )
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Dóra')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('provider.filters.state'), 'all')
    await screen.findByText('Bjarni')

    await userEvent.selectOptions(screen.getByLabelText('provider.filters.attention'), 'provider')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/bookings/provider?attentionSide=provider')
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Dóra')).toBeInTheDocument()
    expect(screen.queryByText('Bjarni')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'workflow.statusPanel.cancelled.provider' }))
      .not.toBeInTheDocument()
  })

  it('shows pending and retry feedback when a server-side filter fails', async () => {
    const active = {
      publicId: '00000000-0000-4000-8000-000000000020',
      businessProfileSlug: 'kvissbador',
      providerDisplayName: 'Kvissbador',
      serviceTitle: 'Kvissveisla',
      lifecycleStatus: 'requested' as const,
      cancellationReason: null,
      workflowState: {
        workflowId: workflow.id,
        logicalKey: 'new_request',
        systemLabelKey: 'new_request' as const,
        label: null,
        attentionSide: 'provider' as const,
        semanticKind: 'active' as const,
      },
      requestedDate: '2026-09-20',
      requestedTime: '18:30',
      timezone: 'Atlantic/Reykjavik',
      contactName: 'Anna',
      createdAt: '2026-08-11T16:00:00.000Z',
      lastMessageAt: null,
    }
    const initialWorkspace: ProviderBookingWorkspaceView = {
      ...workspace,
      requests: [active],
      facets: {
        states: [{
          key: `${workflow.id}:new_request`,
          workflowId: workflow.id,
          logicalKey: 'new_request',
          systemLabelKey: 'new_request',
          label: null,
          count: 1,
        }],
        attention: [{ attentionSide: 'provider', count: 1 }],
      },
    }
    let rejectRequest!: (reason?: unknown) => void
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { rejectRequest = reject }))
      .mockResolvedValueOnce(response(initialWorkspace))
    vi.stubGlobal('fetch', fetchMock)
    render(<ProviderBookingWorkspaceClient initialWorkspace={initialWorkspace} />)

    await userEvent.selectOptions(screen.getByLabelText('provider.filters.attention'), 'provider')
    expect(screen.getByRole('status')).toHaveTextContent('provider.filters.loading')
    expect(screen.getByLabelText('provider.filters.attention')).toBeDisabled()
    rejectRequest(new Error('offline'))
    expect(await screen.findByRole('alert')).toHaveTextContent('provider.filters.error')

    await userEvent.click(screen.getByRole('button', { name: 'provider.filters.retry' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('provider.filters.error')).not.toBeInTheDocument())
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
        workflow,
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
