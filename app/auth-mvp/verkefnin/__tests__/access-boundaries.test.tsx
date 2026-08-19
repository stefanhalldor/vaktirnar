import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  canUse: vi.fn(),
  guardAccess: vi.fn(),
  guardSession: vi.fn(),
  loadInvitation: vi.fn(),
  loadMemberships: vi.fn(),
  noStore: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
}))

vi.mock('next/cache', () => ({ unstable_noStore: mocks.noStore }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock('@/lib/household-chores/guard', () => ({
  canUseHouseholdChores: mocks.canUse,
  guardHouseholdChoreAccess: mocks.guardAccess,
  guardHouseholdChoreSession: mocks.guardSession,
}))
vi.mock('@/lib/household-chores/repository.server', () => ({
  HouseholdChoreRepositoryError: class HouseholdChoreRepositoryError extends Error {
    code: string

    constructor(code: string) {
      super(code)
      this.code = code
    }
  },
  loadHouseholdChoreInvitationPreview: mocks.loadInvitation,
  loadHouseholdChoreMemberships: mocks.loadMemberships,
}))
vi.mock('@/components/household-chores/CircleInvitationConsent', () => ({
  CircleInvitationConsent: () => null,
}))
vi.mock('@/components/household-chores/MembershipAccessList', () => ({
  MembershipAccessList: () => null,
}))
vi.mock('@/app/auth-mvp/verkefnin/HouseholdChoreShell', () => ({
  HouseholdChoreShell: ({ children }: { children: React.ReactNode }) => children,
}))

import HouseholdChoreContentLayout from '@/app/auth-mvp/verkefnin/(content)/layout'
import HouseholdChoreMembershipsPage from '@/app/auth-mvp/verkefnin/adild/page'
import HouseholdChoreInvitationPage from '@/app/auth-mvp/verkefnin/bod/[invitationId]/page'
import HouseholdChoresLayout from '@/app/auth-mvp/verkefnin/layout'

const USER_ID = '10000000-0000-4000-8000-000000000001'
const INVITATION_ID = '20000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guardSession.mockResolvedValue({ user: { id: USER_ID } })
  mocks.guardAccess.mockResolvedValue({ user: { id: USER_ID } })
  mocks.canUse.mockResolvedValue(false)
  mocks.loadMemberships.mockResolvedValue({ memberships: [], pendingInvitations: [] })
  mocks.loadInvitation.mockResolvedValue({
    invitationId: INVITATION_ID,
    circleName: 'Heima',
    displayReference: 'ABC123',
    inviterLabel: 'Anna',
    requestedType: 'member',
    version: '3',
    expiresAt: '2026-08-25T00:00:00.000Z',
    acceptAvailable: true,
  })
})

describe('Household Chores route access boundaries', () => {
  it('keeps the outer route session-only so consent and membership recovery remain reachable', async () => {
    const children = <p>children</p>
    const layout = await HouseholdChoresLayout({ children }) as React.ReactElement<{
      children: React.ReactNode
      pendingFallback: React.ReactNode
    }>

    expect(layout.props.children).toBe(children)
    expect(layout.props.pendingFallback).toBeTruthy()

    expect(mocks.guardSession).toHaveBeenCalledOnce()
    expect(mocks.guardAccess).not.toHaveBeenCalled()
    expect(mocks.canUse).not.toHaveBeenCalled()
  })

  it('full-gates the content route group before rendering its children', async () => {
    const children = <p>children</p>
    const layout = await HouseholdChoreContentLayout({ children }) as React.ReactElement<{
      children: React.ReactNode
      loadingLabel: string
    }>

    expect(layout.props.children).toBe(children)
    expect(layout.props.loadingLabel).toBe('loading')

    expect(mocks.guardAccess).toHaveBeenCalledOnce()
    expect(mocks.guardSession).not.toHaveBeenCalled()
  })

  it('lets a signed-in recipient inspect or decline an invitation but seals acceptance with current access', async () => {
    const page = await HouseholdChoreInvitationPage({
      params: Promise.resolve({ invitationId: INVITATION_ID }),
    }) as React.ReactElement<{ children: React.ReactElement<{
      acceptAvailable: boolean
      invitation: { invitationId: string }
    }> }>

    expect(mocks.guardSession).toHaveBeenCalledOnce()
    expect(mocks.guardAccess).not.toHaveBeenCalled()
    expect(mocks.loadInvitation).toHaveBeenCalledWith(USER_ID, INVITATION_ID)
    expect(mocks.canUse).toHaveBeenCalledWith({ id: USER_ID })
    expect(page.props.children.props.invitation.invitationId).toBe(INVITATION_ID)
    expect(page.props.children.props.acceptAvailable).toBe(false)
  })

  it('keeps membership exit/recovery session-only and withholds content links when access is off', async () => {
    const page = await HouseholdChoreMembershipsPage() as React.ReactElement<{
      children: React.ReactElement<{ contentAvailable: boolean }>
    }>

    expect(mocks.guardSession).toHaveBeenCalledOnce()
    expect(mocks.guardAccess).not.toHaveBeenCalled()
    expect(mocks.loadMemberships).toHaveBeenCalledWith(USER_ID)
    expect(mocks.canUse).toHaveBeenCalledWith({ id: USER_ID })
    expect(page.props.children.props.contentAvailable).toBe(false)
  })
})
