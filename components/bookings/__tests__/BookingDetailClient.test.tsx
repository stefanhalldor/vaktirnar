import { Suspense, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookingDetailView } from '@/lib/bookings/contracts'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))
vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (
    values?.percent ? `${key}:${values.percent}` : key
  ),
}))
vi.mock('../BookingChatPanel', () => ({
  BookingChatPanel: () => <div data-testid="booking-chat" />,
}))

import { BookingDetailClient } from '../BookingDetailClient'

function detail(overrides: Partial<BookingDetailView> = {}): BookingDetailView {
  return {
    publicId: '11111111-1111-4111-8111-111111111111',
    businessProfileSlug: 'kvissbador',
    provider: { displayName: 'Kvissbador', websiteUrl: null },
    service: { title: 'Kvissveisla', summary: 'Fyrir hópa', timezone: 'Atlantic/Reykjavik' },
    lifecycleStatus: 'requested',
    workflowState: {
      audience: 'customer',
      systemLabelKey: 'new_request',
      label: null,
      attentionSide: 'provider',
      semanticKind: 'active',
    },
    cancellationReason: null,
    accessMode: 'link',
    revision: 1,
    accessVersion: 1,
    requested: {
      date: '2026-09-20',
      time: '18:30',
      timezone: 'Atlantic/Reykjavik',
      startsAtUtc: '2026-09-20T18:30:00.000Z',
    },
    contact: {
      name: 'Anna',
      email: 'anna@example.com',
      phone: null,
      message: 'Við erum tuttugu.',
    },
    discount: { eligibleBps: 1000, appliedBps: null },
    createdAt: '2026-08-11T16:00:00.000Z',
    cancelledAt: null,
    permissions: {
      actorKind: 'guest',
      signedIn: false,
      canCancel: true,
      canClaim: false,
      canManageMembers: false,
      canMessage: true,
      canTransition: false,
    },
    members: [],
    activity: [],
    messages: [],
    ...overrides,
  }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function providerDetailWithTarget(): BookingDetailView {
  return detail({
    workflowState: {
      audience: 'provider',
      workflowId: '33333333-3333-4333-8333-333333333333',
      versionId: '44444444-4444-4444-8444-444444444444',
      stateId: '55555555-5555-4555-8555-555555555555',
      logicalKey: 'new_request',
      systemLabelKey: 'new_request',
      label: null,
      attentionSide: 'provider',
      semanticKind: 'active',
      allowedNextStates: [{
        stateId: '22222222-2222-4222-8222-222222222222',
        logicalKey: 'under_review',
        systemLabelKey: 'under_review',
        label: null,
        attentionSide: 'provider',
        semanticKind: 'active',
      }],
    },
    permissions: {
      actorKind: 'provider',
      signedIn: true,
      canCancel: true,
      canClaim: false,
      canManageMembers: false,
      canMessage: true,
      canTransition: true,
    },
  })
}

describe('BookingDetailClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    refreshMock.mockReset()
    window.history.replaceState(
      null,
      '',
      '/bokanir/kvissbador/fyrirspurn/11111111-1111-4111-8111-111111111111',
    )
  })

  it('clears an access fragment when the existing HttpOnly cookie authorizes SSR directly', async () => {
    window.history.replaceState(
      null,
      '',
      '/bokanir/kvissbador/fyrirspurn/11111111-1111-4111-8111-111111111111#access=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
    )

    render(<BookingDetailClient initialView={detail()} />)

    await waitFor(() => expect(window.location.hash).toBe(''))
    expect(window.location.pathname).toContain('/bokanir/kvissbador/fyrirspurn/')
  })

  it('warns an anonymous link-holder and asks them to sign in before claiming', () => {
    render(<BookingDetailClient initialView={detail()} />)

    expect(screen.queryByText('discount.claimOffer:10')).not.toBeInTheDocument()
    expect(screen.getByText('claim.linkModeBody')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'claim.signIn' })).toHaveAttribute(
      'href',
      '/innskraning?next=%2Fbokanir%2Fkvissbador%2Ffyrirspurn%2F11111111-1111-4111-8111-111111111111',
    )
    expect(screen.queryByRole('button', { name: 'claim.confirm' })).not.toBeInTheDocument()
  })

  it('does not show an applied discount before calculator support is available', () => {
    render(<BookingDetailClient initialView={detail({
      discount: { eligibleBps: 1000, appliedBps: 1000 },
    })} />)

    expect(screen.queryByText('discount.applied:10')).not.toBeInTheDocument()
  })

  it('claims atomically with multiple additional emails after verified sign-in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true, data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    render(<BookingDetailClient initialView={detail({
      permissions: {
        actorKind: 'guest',
        signedIn: true,
        canCancel: true,
        canClaim: true,
        canManageMembers: false,
        canMessage: true,
        canTransition: false,
      },
    })} />)

    await userEvent.type(screen.getByLabelText(/claim.additionalEmails/), 'jon@example.com, sara@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'claim.confirm' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      action: 'claim',
      expectedAccessVersion: 1,
      additionalEmails: ['jon@example.com', 'sara@example.com'],
    })
    expect(refreshMock).toHaveBeenCalledOnce()
  })

  it('keeps stale mutation controls disabled while the authoritative refresh is pending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true, data: {} }))
    vi.stubGlobal('fetch', fetchMock)

    let beginRefresh: () => void = () => undefined
    let refreshReady = false
    let releaseRefresh: () => void = () => undefined
    const refreshGate = new Promise<void>(resolve => {
      releaseRefresh = () => {
        refreshReady = true
        resolve()
      }
    })

    function RefreshGate({ active }: { active: boolean }) {
      if (active && !refreshReady) throw refreshGate
      return null
    }

    function Harness() {
      const [refreshing, setRefreshing] = useState(false)
      beginRefresh = () => setRefreshing(true)
      return (
        <Suspense fallback={<div>refresh-fallback</div>}>
          <BookingDetailClient initialView={detail({
            permissions: {
              actorKind: 'guest',
              signedIn: true,
              canCancel: true,
              canClaim: true,
              canManageMembers: false,
              canMessage: true,
              canTransition: false,
            },
          })} />
          <RefreshGate active={refreshing} />
        </Suspense>
      )
    }

    refreshMock.mockImplementation(() => beginRefresh())
    render(<Harness />)

    const claim = screen.getByRole('button', { name: 'claim.confirm' })
    await userEvent.click(claim)
    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce())
    expect(claim).toBeDisabled()

    await userEvent.click(claim)
    expect(fetchMock).toHaveBeenCalledOnce()

    releaseRefresh()
    await waitFor(() => expect(claim).toBeEnabled())
  })

  it('does not offer removal of the last active owner', () => {
    render(<BookingDetailClient initialView={detail({
      accessMode: 'members',
      permissions: {
        actorKind: 'member',
        signedIn: true,
        canCancel: true,
        canClaim: false,
        canManageMembers: true,
        canMessage: true,
        canTransition: false,
      },
      members: [{
        id: '22222222-2222-4222-8222-222222222222',
        emailCanonical: 'owner@example.com',
        isSelf: true,
        role: 'owner',
        status: 'active',
        createdAt: '2026-08-11T16:00:00.000Z',
        revokedAt: null,
      }],
    })} />)

    expect(screen.getByText('members.lastOwner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'members.revoke' })).not.toBeInTheDocument()
  })

  it('does not silently omit additional members beyond the server limit', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<BookingDetailClient initialView={detail({
      permissions: {
        actorKind: 'guest',
        signedIn: true,
        canCancel: true,
        canClaim: true,
        canManageMembers: false,
        canMessage: true,
        canTransition: false,
      },
    })} />)

    const emails = Array.from({ length: 10 }, (_, index) => `person${index}@example.com`).join(', ')
    await userEvent.type(screen.getByLabelText(/claim.additionalEmails/), emails)
    await userEvent.click(screen.getByRole('button', { name: 'claim.confirm' }))

    expect(screen.getByText('claim.tooManyEmails')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows only the customer label and never provider transition targets to customers', () => {
    render(<BookingDetailClient initialView={detail()} />)

    expect(screen.getByText('workflow.systemLabels.new_request.customer')).toBeInTheDocument()
    expect(screen.queryByLabelText('workflow.statusPanel.nextState')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('target-state')
  })

  it('moves a provider booking only to a server-projected target', async () => {
    const targetStateId = '22222222-2222-4222-8222-222222222222'
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true, data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    render(<BookingDetailClient providerContext initialView={detail({
      workflowState: {
        audience: 'provider',
        workflowId: '33333333-3333-4333-8333-333333333333',
        versionId: '44444444-4444-4444-8444-444444444444',
        stateId: '55555555-5555-4555-8555-555555555555',
        logicalKey: 'new_request',
        systemLabelKey: 'new_request',
        label: null,
        attentionSide: 'provider',
        semanticKind: 'active',
        allowedNextStates: [{
          stateId: targetStateId,
          logicalKey: 'under_review',
          systemLabelKey: 'under_review',
          label: null,
          attentionSide: 'provider',
          semanticKind: 'active',
        }],
      },
      permissions: {
        actorKind: 'provider',
        signedIn: true,
        canCancel: true,
        canClaim: false,
        canManageMembers: false,
        canMessage: true,
        canTransition: true,
      },
    })} />)

    await userEvent.selectOptions(screen.getByLabelText('workflow.statusPanel.nextState'), targetStateId)
    await userEvent.click(screen.getByRole('button', { name: 'workflow.statusPanel.change' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      action: 'transitionWorkflow',
      expectedRevision: 1,
      targetStateId,
    })
  })

  it('renders confirmed as a real workflow state and keeps the old unconfirmed copy away', () => {
    render(<BookingDetailClient initialView={detail({
      workflowState: {
        audience: 'customer',
        systemLabelKey: 'confirmed',
        label: null,
        attentionSide: 'none',
        semanticKind: 'confirmed',
      },
    })} />)

    expect(screen.getByText('workflow.systemLabels.confirmed.customer')).toBeInTheDocument()
    expect(screen.queryByText('detail.notConfirmed')).not.toBeInTheDocument()
  })

  it('lets a provider select a typed cancellation reason with no free-text field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true, data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    render(<BookingDetailClient providerContext initialView={detail({
      workflowState: {
        audience: 'provider',
        workflowId: '33333333-3333-4333-8333-333333333333',
        versionId: '44444444-4444-4444-8444-444444444444',
        stateId: '55555555-5555-4555-8555-555555555555',
        logicalKey: 'new_request',
        systemLabelKey: 'new_request',
        label: null,
        attentionSide: 'provider',
        semanticKind: 'active',
        allowedNextStates: [],
      },
      permissions: {
        actorKind: 'provider',
        signedIn: true,
        canCancel: true,
        canClaim: false,
        canManageMembers: false,
        canMessage: true,
        canTransition: true,
      },
    })} />)

    await userEvent.click(screen.getByRole('button', { name: 'workflow.cancel.open' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', {
      name: 'workflow.cancellationReasons.provider_unavailable',
    }))
    await userEvent.click(screen.getByRole('button', { name: 'workflow.cancel.confirm' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      action: 'cancel',
      reason: 'provider_unavailable',
    })
  })

  it('uses one pending lock so a transition and cancellation cannot race', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    const targetStateId = '22222222-2222-4222-8222-222222222222'
    render(<BookingDetailClient providerContext initialView={detail({
      workflowState: {
        audience: 'provider',
        workflowId: '33333333-3333-4333-8333-333333333333',
        versionId: '44444444-4444-4444-8444-444444444444',
        stateId: '55555555-5555-4555-8555-555555555555',
        logicalKey: 'new_request',
        systemLabelKey: 'new_request',
        label: null,
        attentionSide: 'provider',
        semanticKind: 'active',
        allowedNextStates: [{
          stateId: targetStateId,
          logicalKey: 'under_review',
          systemLabelKey: 'under_review',
          label: null,
          attentionSide: 'provider',
          semanticKind: 'active',
        }],
      },
      permissions: {
        actorKind: 'provider',
        signedIn: true,
        canCancel: true,
        canClaim: false,
        canManageMembers: false,
        canMessage: true,
        canTransition: true,
      },
    })} />)

    await userEvent.selectOptions(screen.getByLabelText('workflow.statusPanel.nextState'), targetStateId)
    await userEvent.click(screen.getByRole('button', { name: 'workflow.statusPanel.change' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'workflow.cancel.open' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'workflow.cancel.open' }))
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('refreshes authoritative targets after a workflow transition conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: false, error: 'conflict' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    render(<BookingDetailClient providerContext initialView={providerDetailWithTarget()} />)

    await userEvent.selectOptions(
      screen.getByLabelText('workflow.statusPanel.nextState'),
      '22222222-2222-4222-8222-222222222222',
    )
    await userEvent.click(screen.getByRole('button', { name: 'workflow.statusPanel.change' }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce())
    expect(screen.getByRole('alert')).toHaveTextContent('errors.conflict')
  })

  it('refreshes authoritative cancellation state after a revision conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: false, error: 'conflict' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    render(<BookingDetailClient initialView={detail()} />)

    await userEvent.click(screen.getByRole('button', { name: 'workflow.cancel.open' }))
    await userEvent.click(screen.getByRole('button', { name: 'workflow.cancel.confirm' }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce())
    expect(screen.getByText('errors.conflict')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
