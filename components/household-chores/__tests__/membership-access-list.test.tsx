import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  HouseholdChoreMembershipItem,
  HouseholdChoreMembershipsView,
} from '@/lib/household-chores/contracts'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/household-chores/actions', () => ({
  deleteHouseholdChoreCircleAction: vi.fn(),
  leaveHouseholdChoreCircleAction: vi.fn(),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => ({
    'common.keep': 'Halda hringnum',
    'membership.confirmDelete': 'Eyða hringnum varanlega',
    'membership.deleteCircle': 'Eyða hring',
    'membership.deleteDisclosure': 'Öllum gögnum hringsins verður eytt varanlega.',
    'membership.heading': 'Aðildirnar þínar',
    'membership.leave': 'Yfirgefa hring',
    'membership.pendingEmpty': 'Engin boð bíða.',
    'membership.pendingHeading': 'Boð sem bíða',
    'membership.typeReference': `Sláðu inn ${values?.reference}`,
    'membershipType.child': 'Barn',
    'membershipType.member': 'Fullur meðlimur',
  }[key] ?? key),
}))

import { MembershipAccessList } from '@/components/household-chores/MembershipAccessList'

const base: HouseholdChoreMembershipItem = {
  circleId: '10000000-0000-4000-8000-000000000001',
  circleName: 'Heima',
  displayReference: 'ABCDEFGH',
  membershipType: 'member',
  membershipStatus: 'active',
  circleVersion: '3',
  membershipVersion: '2',
  canLeave: true,
  canDeleteCircle: false,
}

function renderMembership(membership: HouseholdChoreMembershipItem) {
  const view: HouseholdChoreMembershipsView = {
    memberships: [membership],
    pendingInvitations: [],
  }
  return render(<MembershipAccessList view={view} contentAvailable={false} />)
}

describe('Household Chores own membership controls', () => {
  it('shows leave but not delete when another full member remains', () => {
    renderMembership(base)
    expect(screen.getByRole('button', { name: 'Yfirgefa hring' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Eyða hring' })).not.toBeInTheDocument()
  })

  it('shows delete but not leave for the last full member', () => {
    renderMembership({ ...base, canLeave: false, canDeleteCircle: true })
    expect(screen.queryByRole('button', { name: 'Yfirgefa hring' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eyða hring' })).toBeEnabled()
  })

  it('lets a child leave and never shows circle deletion', () => {
    renderMembership({ ...base, membershipType: 'child' })
    expect(screen.getByRole('button', { name: 'Yfirgefa hring' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Eyða hring' })).not.toBeInTheDocument()
  })

  it('clears the typed deletion reference on Escape before reopening', () => {
    renderMembership({ ...base, canLeave: false, canDeleteCircle: true })

    const trigger = screen.getByRole('button', { name: 'Eyða hring' })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('alertdialog', { name: 'Eyða hring' })
    const input = screen.getByLabelText('Sláðu inn ABCDEFGH')
    fireEvent.change(input, { target: { value: 'ABCDEFGH' } })
    expect(screen.getByRole('button', { name: 'Eyða hringnum varanlega' })).toBeEnabled()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog', { name: 'Eyða hring' })).not.toBeInTheDocument()
    const reopenedTrigger = screen.getByRole('button', { name: 'Eyða hring' })
    expect(reopenedTrigger).toHaveFocus()

    fireEvent.click(reopenedTrigger)
    expect(screen.getByLabelText('Sláðu inn ABCDEFGH')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Eyða hringnum varanlega' })).toBeDisabled()
  })
})
