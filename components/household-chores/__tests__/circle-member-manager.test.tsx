import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HouseholdChoreManagedParticipant,
  HouseholdChoreMemberCircleView,
} from '@/lib/household-chores/contracts'

const mocks = vi.hoisted(() => ({
  archiveParticipant: vi.fn(),
  cancelInvitation: vi.fn(),
  changeMembershipType: vi.fn(),
  createInvitation: vi.fn(),
  createParticipant: vi.fn(),
  loadInviteCandidates: vi.fn(),
  linkParticipant: vi.fn(),
  reactivateParticipant: vi.fn(),
  removeMember: vi.fn(),
  renameCircle: vi.fn(),
  renameParticipant: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}))

vi.mock('@/lib/household-chores/actions', () => ({
  archiveHouseholdChoreParticipantAction: mocks.archiveParticipant,
  cancelHouseholdChoreInvitationAction: mocks.cancelInvitation,
  changeHouseholdChoreMembershipTypeAction: mocks.changeMembershipType,
  createHouseholdChoreInvitationAction: mocks.createInvitation,
  createHouseholdChoreParticipantAction: mocks.createParticipant,
  linkHouseholdChoreParticipantAction: mocks.linkParticipant,
  reactivateHouseholdChoreParticipantAction: mocks.reactivateParticipant,
  removeHouseholdChoreMemberAction: mocks.removeMember,
  renameHouseholdChoreCircleAction: mocks.renameCircle,
  renameHouseholdChoreParticipantAction: mocks.renameParticipant,
}))

const translations: Record<string, string> = {
  'common.formerMember': 'Fyrrverandi meðlimur',
  'common.cancel': 'Hætta við',
  'common.keep': 'Hætta við',
  'common.saving': 'Vista…',
  'errors.invalid_input': 'Farðu yfir reitina og reyndu aftur.',
  'errors.save_failed': 'Ekki tókst að vista.',
  'invitation.accessHeading': 'Aðgangurinn sem býðst',
  'manage.accessSheetDescription': 'Veldu aðgang.',
  'manage.accessSheetTitle': 'Aðgangur að hringnum',
  'manage.addToCircle': 'Bæta í hringinn',
  'manage.addParticipant': 'Bæta við þátttakanda',
  'manage.allPeople': 'Öll',
  'manage.archiveDisclosure': 'Ef þú geymir {name} falla öll opin verk viðkomandi niður án stiga.',
  'manage.archiveParticipant': 'Setja í geymslu',
  'manage.archivedParticipantsHeading': 'Í geymslu',
  'manage.cancelInvite': 'Hætta við boð',
  'manage.cancelInviteDisclosure': 'Boðið verður afturkallað og veitir engan aðgang.',
  'manage.candidatesLoadFailed': 'Ekki tókst að sækja fleiri tengsl.',
  'manage.closedTestHelper': 'Verkefnin eru í lokuðum prófunum. Aðeins gjaldgengt fólk birtist.',
  'manage.continue': 'Halda áfram',
  'manage.changeType': 'Breyta aðgangstegund',
  'manage.childSummary': 'Sér sameiginlega yfirlitið og getur lokið eigin verkum.',
  'manage.demoteDisclosure': 'Viðkomandi missir strax stjórnunaraðgerðir.',
  'manage.filterPeople': 'Sía fólk',
  'manage.invite': 'Bjóða í hring',
  'manage.inviteCandidate': 'Veldu tengdan notanda',
  'manage.inviteSentNotice': 'Boðið bíður svars.',
  'manage.loadingCandidates': 'Sæki…',
  'manage.linkGuest': 'Tengja við Teskeiðarnotanda',
  'manage.linkEmail': 'Netfang Teskeiðarnotanda',
  'manage.linkEmailPlaceholder': 'nafn@daemi.is',
  'manage.sendLinkInvite': 'Senda samþykkisboð',
  'manage.resendLinkInvite': 'Senda boð aftur',
  'manage.cancelLinkInvite': 'Hætta við tengingu',
  'manage.linkInviteCancelledNotice': 'Tengiboðið var afturkallað.',
  'manage.linkInviteSentNotice': 'Boðið bíður nú samþykkis inni í Teskeið.',
  'manage.linkInviteDeliveryIssue': 'Ekki tókst að staðfesta birtingu.',
  'manage.linkEmailNotAvailable': 'Netfangið hefur ekki aðgang að lokuðu prófunum.',
  'manage.chooseAccessType': 'Veldu aðgangstegund.',
  'manage.manageAccess': 'Stjórna aðgangi',
  'manage.makeChild': 'Merkja sem barn',
  'manage.makeMember': 'Gera að fullum meðlimi',
  'manage.manualNamePlaceholder': 'Nafn',
  'manage.memberSummary': 'Sér og stjórnar öllum verkum og aðgangi.',
  'manage.membersHeading': 'Meðlimir með aðgang',
  'manage.noInvitablePeople': 'Enginn sem þú getur boðið inn fannst hér.',
  'manage.noPeople': 'Enginn er skráður í hringinn.',
  'manage.noActiveParticipants': 'Enginn virkur þátttakandi.',
  'manage.nextCandidates': 'Næstu',
  'manage.participantAddedNotice': 'Þátttakandanum var bætt við.',
  'manage.renameParticipant': 'Breyta nafni',
  'manage.renameParticipantTitle': 'Breyta nafni þátttakanda',
  'manage.renameParticipantDisclosure': 'Eldri saga heldur eldra nafni.',
  'manage.saveParticipantName': 'Vista nafn',
  'manage.participantRenamedNotice': 'Nafninu var breytt.',
  'manage.participantAccessDisclosure': 'Skráningin veitir engan aðgang að hringnum.',
  'manage.participantConfirmation': 'Þetta veitir ekki aðgang að appinu.',
  'manage.participantDisclosure': 'Nafnið verður sýnilegt öllum meðlimum.',
  'manage.participantName': 'Nafn',
  'manage.participantSheetTitle': 'Aðeins verkefni og stig',
  'manage.peopleHeading': 'Fólk í hringnum',
  'manage.pickerDescription': 'Veldu hvernig þú vilt bæta við.',
  'manage.pendingHeading': 'Boð sem bíða',
  'manage.promoteDisclosure': 'Viðkomandi fær strax fulla stjórn.',
  'manage.previousCandidates': 'Fyrri',
  'manage.reactivateDisclosure': '{name} verður virkur aftur án eldri stigagilda.',
  'manage.reactivateParticipant': 'Virkja aftur',
  'manage.removeDisclosure': 'Aðgangur endar strax og opin verk falla niður án stiga.',
  'manage.removeMember': 'Fjarlægja aðgang',
  'manage.saveName': 'Vista heiti',
  'manage.searchPeople': 'Leita',
  'manage.searchPeoplePlaceholder': 'Leita að nafni',
  'manage.circleSettingsHeading': 'Stillingar hrings',
  'manage.sendInvite': 'Senda boð',
  'manage.sourceLabel': 'Leið til að bæta við',
  'manage.sourceManual': 'Skrá nafn',
  'manage.sourceRelationships': 'Úr Tengslum',
  'manage.statusArchived': 'Í geymslu',
  'manage.statusChildAccess': 'Barn með aðgang',
  'manage.statusFullAccess': 'Fullur aðgangur',
  'manage.statusParticipantOnly': 'Aðeins verkefni og stig',
  'manage.statusPending': 'Boð bíður',
  'manage.you': 'Þú',
  'membership.pendingEmpty': 'Engin boð bíða.',
  'membershipType.child': 'Barn',
  'membershipType.member': 'Fullur meðlimur',
  'circleForm.name': 'Heiti hrings',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    let value = translations[key] ?? key
    for (const [name, replacement] of Object.entries(values ?? {})) {
      value = value.replace(`{${name}}`, String(replacement))
    }
    return value
  },
}))

import { CircleMemberManager } from '@/components/household-chores/CircleMemberManager'
import { CircleRenameForm } from '@/components/household-chores/CircleRenameForm'

const CIRCLE_ID = '10000000-0000-4000-8000-000000000001'
const RELATIONSHIP_ID = '20000000-0000-4000-8000-000000000001'
const MEMBERSHIP_ID = '30000000-0000-4000-8000-000000000001'
const PARTICIPANT_ID = '40000000-0000-4000-8000-000000000001'
const REQUEST_ID = '50000000-0000-4000-8000-000000000001'
const UNUSED_RETRY_ID = '50000000-0000-4000-8000-000000000002'

function memberView(): HouseholdChoreMemberCircleView {
  return {
    viewerType: 'member',
    circle: {
      circleId: CIRCLE_ID,
      name: 'Heima',
      displayReference: 'ABC123',
      version: '4',
      memberCount: 1,
    },
    participants: [],
    definitions: [],
    openAssignments: [],
    recentAssignments: [],
    pointTotals: [],
    memberships: [{
      membershipId: MEMBERSHIP_ID,
      participantId: PARTICIPANT_ID,
      label: 'Anna',
      identityMarker: 'current',
      membershipType: 'child',
      status: 'active',
      version: '7',
      isViewer: false,
    }],
    pendingInvitations: [],
  }
}

const activeParticipant: HouseholdChoreManagedParticipant = {
  participantId: PARTICIPANT_ID,
  label: 'Aron',
  identityMarker: 'current',
  status: 'active',
  version: '3',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(REQUEST_ID)
  mocks.archiveParticipant.mockResolvedValue({ ok: true, data: { resourceId: PARTICIPANT_ID } })
  mocks.cancelInvitation.mockResolvedValue({ ok: true, data: { resourceId: 'invite' } })
  mocks.changeMembershipType.mockResolvedValue({ ok: true, data: { resourceId: MEMBERSHIP_ID } })
  mocks.createInvitation.mockResolvedValue({ ok: true, data: { resourceId: 'invite' } })
  mocks.createParticipant.mockResolvedValue({ ok: true, data: { resourceId: PARTICIPANT_ID } })
  mocks.loadInviteCandidates.mockResolvedValue({
    ok: true,
    data: { items: [], hasMore: false, nextCursor: null },
  })
  mocks.linkParticipant.mockResolvedValue({ ok: true, data: { resourceId: 'invite' } })
  mocks.reactivateParticipant.mockResolvedValue({ ok: true, data: { resourceId: PARTICIPANT_ID } })
  mocks.removeMember.mockResolvedValue({ ok: true, data: { resourceId: MEMBERSHIP_ID } })
  mocks.renameCircle.mockResolvedValue({ ok: true, data: { resourceId: CIRCLE_ID } })
  mocks.renameParticipant.mockResolvedValue({ ok: true, data: { resourceId: PARTICIPANT_ID } })
})

describe('Household Chores member management', () => {
  it('stages an eligible Relationship candidate, requires a type and submits no private label', async () => {
    render(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{
          items: [{ relationshipId: RELATIONSHIP_ID, label: 'Bjarni' }],
          hasMore: false,
          nextCursor: null,
        }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta í hringinn' }))
    expect(screen.getByText(/lokuðum prófunum/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bjarni/ }))

    const dialog = await screen.findByRole('dialog')
    const fullMember = within(dialog).getByRole('radio', { name: /Fullur meðlimur/ })
    const child = within(dialog).getByRole('radio', { name: /Barn/ })
    const submit = within(dialog).getByRole('button', { name: 'Senda boð' })
    expect(fullMember).not.toBeChecked()
    expect(child).not.toBeChecked()
    expect(submit).toBeDisabled()
    fireEvent.click(child)
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(mocks.createInvitation).toHaveBeenCalledOnce()
    expect(mocks.createInvitation).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      relationshipId: RELATIONSHIP_ID,
      requestedType: 'child',
    })
    expect(JSON.stringify(mocks.createInvitation.mock.calls[0])).not.toContain('Bjarni')
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
  })

  it('keeps candidate pagination bounded, adapter-owned and duplicate-safe', async () => {
    const nextRelationshipId = '20000000-0000-4000-8000-000000000002'
    const cursor = { label: 'Bjarni', relationshipId: RELATIONSHIP_ID }
    let resolvePage: ((value: unknown) => void) | undefined
    mocks.loadInviteCandidates.mockReturnValueOnce(new Promise((resolve) => {
      resolvePage = resolve
    }))

    render(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{
          items: [{ relationshipId: RELATIONSHIP_ID, label: 'Bjarni' }],
          hasMore: true,
          nextCursor: cursor,
        }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta í hringinn' }))
    const next = screen.getByRole('button', { name: 'Næstu' })
    fireEvent.click(next)
    fireEvent.click(next)
    expect(mocks.loadInviteCandidates).toHaveBeenCalledOnce()
    expect(mocks.loadInviteCandidates).toHaveBeenCalledWith(cursor)
    await waitFor(() => expect(next).toBeDisabled())

    await act(async () => {
      resolvePage?.({
        ok: true,
        data: {
          items: [{ relationshipId: nextRelationshipId, label: 'Cecilia' }],
          hasMore: false,
          nextCursor: null,
        },
      })
    })

    expect(await screen.findByRole('button', { name: /Cecilia/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bjarni/ })).not.toBeInTheDocument()
    expect(mocks.createInvitation).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Fyrri' })).toBeEnabled()
  })

  it('releases a rejected invite lock and replays the same request id', async () => {
    const cursor = { label: 'Bjarni', relationshipId: RELATIONSHIP_ID }
    let rejectInvitation: ((reason?: unknown) => void) | undefined
    const uuidMock = vi.mocked(globalThis.crypto.randomUUID)
    uuidMock.mockReset()
    uuidMock.mockReturnValueOnce(REQUEST_ID).mockReturnValue(UNUSED_RETRY_ID)
    mocks.createInvitation
      .mockReturnValueOnce(new Promise((_resolve, reject) => {
        rejectInvitation = reject
      }))
      .mockResolvedValueOnce({ ok: true, data: { resourceId: 'invite' } })

    const { rerender } = render(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{
          items: [{ relationshipId: RELATIONSHIP_ID, label: 'Bjarni' }],
          hasMore: true,
          nextCursor: cursor,
        }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta í hringinn' }))
    fireEvent.click(screen.getByRole('button', { name: /Bjarni/ }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /Barn/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Senda boð' }))
    fireEvent.focus(window)
    expect(mocks.refresh).not.toHaveBeenCalled()

    rerender(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{
          items: [{ relationshipId: RELATIONSHIP_ID, label: 'Bjarni' }],
          hasMore: true,
          nextCursor: cursor,
        }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    await act(async () => {
      rejectInvitation?.(new Error('transport failed'))
    })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ekki tókst að vista.')

    rerender(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{
          items: [{ relationshipId: RELATIONSHIP_ID, label: 'Bjarni' }],
          hasMore: true,
          nextCursor: cursor,
        }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )
    dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Senda boð' }))
    await waitFor(() => expect(mocks.createInvitation).toHaveBeenCalledTimes(2))
    expect(mocks.createInvitation.mock.calls[0][0].requestId).toBe(REQUEST_ID)
    expect(mocks.createInvitation.mock.calls[1][0].requestId).toBe(REQUEST_ID)
    expect(uuidMock).toHaveBeenCalledOnce()
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
  })

  it('keeps manual name available with no candidate and never turns it into an invitation', async () => {
    render(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{ items: [], hasMore: false, nextCursor: null }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    expect(screen.queryByText('Enginn gjaldgengur tengdur notandi fannst.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bæta í hringinn' }))
    expect(screen.getByText('Enginn sem þú getur boðið inn fannst hér.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skrá nafn' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nafn' }), {
      target: { value: '  A\u0301ron  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Halda áfram' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Þetta veitir ekki aðgang að appinu.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bæta við þátttakanda' }))

    await waitFor(() => expect(mocks.createParticipant).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      label: 'Áron',
    }))
    expect(mocks.createInvitation).not.toHaveBeenCalled()
  })

  it('treats manual entry as name-only and rejects email-shaped shared labels', () => {
    render(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{ items: [], hasMore: false, nextCursor: null }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bæta í hringinn' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skrá nafn' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nafn' }), {
      target: { value: 'someone@example.is' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Halda áfram' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Farðu yfir reitina og reyndu aftur.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mocks.createParticipant).not.toHaveBeenCalled()
    expect(mocks.createInvitation).not.toHaveBeenCalled()
  })

  it('closes the picker before confirmation and restores focus without overlapping dialogs', async () => {
    render(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{
          items: [{ relationshipId: RELATIONSHIP_ID, label: 'Bjarni' }],
          hasMore: false,
          nextCursor: null,
        }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Bæta í hringinn' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: /Bjarni/ }))
    let dialog = await screen.findByRole('dialog')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(within(dialog).getByText('Veldu aðgang.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Hætta við' }).at(-1)!)
    await waitFor(() => expect(trigger).toHaveFocus())

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Skrá nafn' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nafn' }), { target: { value: 'Birta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Halda áfram' }))
    dialog = await screen.findByRole('dialog')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(within(dialog).getByText('Þetta veitir ekki aðgang að appinu.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Hætta við' }).at(-1)!)
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('deduplicates accepted participants by participantId and shows unified statuses', () => {
    const view = memberView()
    view.participants = [
      { ...activeParticipant, label: 'Anna' },
      {
        participantId: '40000000-0000-4000-8000-000000000002',
        label: 'Birta',
        identityMarker: 'current',
        status: 'active',
        version: '1',
      },
      {
        participantId: '40000000-0000-4000-8000-000000000003',
        label: 'Daði',
        identityMarker: 'current',
        status: 'archived',
        version: '2',
      },
    ]
    view.pendingInvitations = [{
      invitationId: '60000000-0000-4000-8000-000000000001',
      inviteeLabel: 'Edda',
      requestedType: 'member',
      version: '1',
      expiresAt: '2026-08-20T00:00:00Z',
      participantId: null,
    }]

    render(
      <CircleMemberManager
        view={view}
        inviteCandidates={{ items: [], hasMore: false, nextCursor: null }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Fólk í hringnum' })).toBeInTheDocument()
    expect(screen.getAllByText('Anna')).toHaveLength(1)
    expect(screen.getByText('Barn með aðgang')).toBeInTheDocument()
    expect(screen.getByText('Boð bíður · Fullur meðlimur')).toBeInTheDocument()
    expect(screen.getByText('Aðeins verkefni og stig')).toBeInTheDocument()
    expect(screen.getByText('Í geymslu')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Þátttakendur í verkum' })).not.toBeInTheDocument()
  })

  it('renames a guest and reuses the shared consent flow to link the same participant', async () => {
    const view = memberView()
    const guest = {
      ...activeParticipant,
      participantId: '40000000-0000-4000-8000-000000000009',
    }
    view.participants = [guest]
    render(
      <CircleMemberManager
        view={view}
        inviteCandidates={{ items: [], hasMore: false, nextCursor: null }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Breyta nafni' }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nafn' }), {
      target: { value: 'Aron nýr' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vista nafn' }))
    await waitFor(() => expect(mocks.renameParticipant).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      participantId: guest.participantId,
      expectedVersion: '3',
      label: 'Aron nýr',
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Tengja við Teskeiðarnotanda' }))
    fireEvent.click(screen.getByRole('radio', { name: /Barn/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Netfang Teskeiðarnotanda' }), {
      target: { value: 'aron@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Senda samþykkisboð' }))
    await waitFor(() => expect(mocks.linkParticipant).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      participantId: guest.participantId,
      expectedVersion: '3',
      recipientEmail: 'aron@example.com',
      requestedType: 'child',
    }))
    expect(await screen.findByText('Boðið bíður nú samþykkis inni í Teskeið.')).toBeInTheDocument()
  })

  it('shows the promotion consequence before changing type and leaves the admin route', async () => {
    render(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{ items: [], hasMore: false, nextCursor: null }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stjórna aðgangi' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Viðkomandi fær strax fulla stjórn.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gera að fullum meðlimi' }))

    await waitFor(() => expect(mocks.changeMembershipType).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      membershipId: MEMBERSHIP_ID,
      expectedVersion: '7',
      newType: 'member',
    }))
    expect(mocks.replace).toHaveBeenCalledWith(`/auth-mvp/verkefnin/${CIRCLE_ID}`)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('allows own demotion but never exposes own removal', async () => {
    const view = memberView()
    view.memberships = [{
      ...view.memberships[0],
      membershipType: 'member',
      label: 'Stebbi',
      isViewer: true,
    }]

    render(
      <CircleMemberManager
        view={view}
        inviteCandidates={{ items: [], hasMore: false, nextCursor: null }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    expect(screen.getByText(/Þú/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stjórna aðgangi' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Fjarlægja aðgang' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merkja sem barn' }))

    await waitFor(() => expect(mocks.changeMembershipType).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      membershipId: MEMBERSHIP_ID,
      expectedVersion: '7',
      newType: 'child',
    }))
    expect(mocks.removeMember).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith(`/auth-mvp/verkefnin/${CIRCLE_ID}`)
  })

  it('retries a rejected membership change with its original request id', async () => {
    const uuidMock = vi.mocked(globalThis.crypto.randomUUID)
    uuidMock.mockReset()
    uuidMock.mockReturnValueOnce(REQUEST_ID).mockReturnValue(UNUSED_RETRY_ID)
    mocks.changeMembershipType
      .mockRejectedValueOnce(new Error('transport failed'))
      .mockResolvedValueOnce({ ok: true, data: { resourceId: MEMBERSHIP_ID } })

    render(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{ items: [], hasMore: false, nextCursor: null }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stjórna aðgangi' }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gera að fullum meðlimi' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ekki tókst að vista.')

    dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gera að fullum meðlimi' }))
    await waitFor(() => expect(mocks.changeMembershipType).toHaveBeenCalledTimes(2))
    expect(mocks.changeMembershipType.mock.calls[0][0].requestId).toBe(REQUEST_ID)
    expect(mocks.changeMembershipType.mock.calls[1][0].requestId).toBe(REQUEST_ID)
    expect(uuidMock).toHaveBeenCalledOnce()
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce())
  })

  it('does not archive until the full consequence disclosure is confirmed', async () => {
    const view = memberView()
    view.memberships = []
    view.participants = [activeParticipant]
    render(
      <CircleMemberManager
        view={view}
        inviteCandidates={{ items: [], hasMore: false, nextCursor: null }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Setja í geymslu' }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Ef þú geymir Aron/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByText('Hætta við').closest('button')!)
    expect(mocks.archiveParticipant).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Setja í geymslu' }))
    dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Setja í geymslu' }))

    await waitFor(() => expect(mocks.archiveParticipant).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      participantId: PARTICIPANT_ID,
      expectedVersion: '3',
    }))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('retries a rejected participant creation with its original request id', async () => {
    const uuidMock = vi.mocked(globalThis.crypto.randomUUID)
    uuidMock.mockReset()
    uuidMock.mockReturnValueOnce(REQUEST_ID).mockReturnValue(UNUSED_RETRY_ID)
    mocks.createParticipant
      .mockRejectedValueOnce(new Error('transport failed'))
      .mockResolvedValueOnce({ ok: true, data: { resourceId: PARTICIPANT_ID } })

    render(
      <CircleMemberManager
        view={memberView()}
        inviteCandidates={{ items: [], hasMore: false, nextCursor: null }}
        loadInviteCandidates={mocks.loadInviteCandidates}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bæta í hringinn' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skrá nafn' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nafn' }), {
      target: { value: 'Aron' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Halda áfram' }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ekki tókst að vista.')

    dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bæta við þátttakanda' }))
    await waitFor(() => expect(mocks.createParticipant).toHaveBeenCalledTimes(2))
    expect(mocks.createParticipant.mock.calls[0][0].requestId).toBe(REQUEST_ID)
    expect(mocks.createParticipant.mock.calls[1][0].requestId).toBe(REQUEST_ID)
    expect(uuidMock).toHaveBeenCalledOnce()
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
  })

  it('makes circle rename reachable with the exact current version', async () => {
    render(<CircleRenameForm circleId={CIRCLE_ID} initialName="Heima" version="4" />)

    const input = screen.getByRole('textbox', { name: 'Heiti hrings' })
    const save = screen.getByRole('button', { name: 'Vista heiti' })
    expect(save).toBeDisabled()
    fireEvent.change(input, { target: { value: 'Sumarbústaður' } })
    fireEvent.click(save)

    await waitFor(() => expect(mocks.renameCircle).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      expectedVersion: '4',
      name: 'Sumarbústaður',
    }))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
