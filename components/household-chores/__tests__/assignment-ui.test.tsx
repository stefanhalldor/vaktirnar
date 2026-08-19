import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdChoreManagedDefinition } from '@/lib/household-chores/contracts'

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  cancel: vi.fn(),
  cancelOwn: vi.fn(),
  complete: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  repeat: vi.fn(),
  replace: vi.fn(),
  undo: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}))

vi.mock('@/lib/household-chores/actions', () => ({
  assignHouseholdChoreAction: mocks.assign,
  cancelHouseholdChoreAssignmentAction: mocks.cancel,
  cancelOwnHouseholdChoreAssignmentAction: mocks.cancelOwn,
  completeHouseholdChoreAssignmentAction: mocks.complete,
  repeatHouseholdChoreAssignmentAction: mocks.repeat,
  undoHouseholdChoreCompletionAction: mocks.undo,
}))

const translations: Record<string, string> = {
  'assign.definition': 'Heimilisverk',
  'assign.empty': 'Engin verk.',
  'assign.noEligibleParticipants': 'Enginn getur tekið verkið.',
  'assign.participant': 'Þátttakandi',
  'assign.points': '{count} stig',
  'assign.submit': 'Úthluta',
  'assignment.cancel': 'Hætta við verk',
  'assignment.cancelDisclosure': 'Verkið fellur niður og gefur engin stig.',
  'assignment.complete': 'Merkja lokið',
  'assignment.confirmCancel': 'Já, hætta við verk',
  'assignment.keep': 'Halda verki opnu',
  'assignment.repeat': 'Úthluta aftur',
  'assignment.undo': 'Afturkalla verklok',
  'assignment.undoDisclosure': 'Stigin eru dregin frá og verkið opnast aðeins aftur ef það er hægt.',
  'assignment.confirmUndo': 'Já, afturkalla verklok',
  'assignment.keepCompletion': 'Halda verklokum',
  'assignment.undoNotReopenedInactive': 'Stigin voru dregin frá því þátttakandinn er ekki virkur.',
  'assignment.undoNotReopenedCap': 'Stigin voru dregin frá því hámarki opinna verka var náð.',
  'common.saving': 'Vista…',
  'errors.save_failed': 'Ekki tókst að vista.',
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

import { ChoreAssignmentActions } from '@/components/household-chores/ChoreAssignmentActions'
import { ChoreAssignmentForm } from '@/components/household-chores/ChoreAssignmentForm'

const CIRCLE_ID = '10000000-0000-4000-8000-000000000001'
const FIRST_DEFINITION_ID = '20000000-0000-4000-8000-000000000001'
const SECOND_DEFINITION_ID = '20000000-0000-4000-8000-000000000002'
const PARTICIPANT_ID = '30000000-0000-4000-8000-000000000001'
const ASSIGNMENT_ID = '40000000-0000-4000-8000-000000000001'
const REQUEST_ID = '50000000-0000-4000-8000-000000000001'
const UNUSED_RETRY_ID = '50000000-0000-4000-8000-000000000002'

const definitions: HouseholdChoreManagedDefinition[] = [
  {
    definitionId: FIRST_DEFINITION_ID,
    title: 'Ryksuga',
    description: null,
    materials: null,
    status: 'active',
    version: '4',
  },
  {
    definitionId: SECOND_DEFINITION_ID,
    title: 'Taka úr vél',
    description: null,
    materials: null,
    status: 'active',
    version: '8',
  },
]

const eligibleValues = [{
  participantId: PARTICIPANT_ID,
  label: 'Aron',
  points: 7,
  valueVersion: '3',
}]

function renderAssignmentForm() {
  return render(
    <ChoreAssignmentForm
      circleId={CIRCLE_ID}
      definitions={definitions}
      selectedDefinition={definitions[0]}
      eligibleValues={eligibleValues}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(REQUEST_ID)
  mocks.assign.mockResolvedValue({
    ok: true,
    data: { resourceId: ASSIGNMENT_ID, version: '1', status: 'open' },
  })
  mocks.cancel.mockResolvedValue({ ok: true, data: { resourceId: ASSIGNMENT_ID } })
  mocks.cancelOwn.mockResolvedValue({ ok: true, data: { resourceId: ASSIGNMENT_ID } })
  mocks.complete.mockResolvedValue({ ok: true, data: { resourceId: ASSIGNMENT_ID } })
  mocks.repeat.mockResolvedValue({ ok: true, data: { resourceId: ASSIGNMENT_ID } })
  mocks.undo.mockResolvedValue({ ok: true, data: { resourceId: ASSIGNMENT_ID } })
})

describe('Household Chores assignment UI', () => {
  it('switches definition through a replace transition and clears the stale participant choice', () => {
    renderAssignmentForm()

    expect(screen.getByRole('button', { name: 'Úthluta' })).toBeEnabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Heimilisverk' }), {
      target: { value: SECOND_DEFINITION_ID },
    })

    expect(mocks.replace).toHaveBeenCalledWith(
      `/auth-mvp/verkefnin/${CIRCLE_ID}/utdeila?definitionId=${SECOND_DEFINITION_ID}`,
    )
    expect(screen.getByRole('button', { name: 'Úthluta' })).toBeDisabled()
    expect(mocks.assign).not.toHaveBeenCalled()
  })

  it('blocks a double submit while the first assignment request is unresolved', async () => {
    let resolveAssignment: ((value: unknown) => void) | undefined
    mocks.assign.mockReturnValueOnce(new Promise((resolve) => {
      resolveAssignment = resolve
    }))
    renderAssignmentForm()

    const submit = screen.getByRole('button', { name: 'Úthluta' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(mocks.assign).toHaveBeenCalledOnce()
    expect(mocks.assign).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      definitionId: FIRST_DEFINITION_ID,
      participantId: PARTICIPANT_ID,
      expectedDefinitionVersion: '4',
      expectedValueVersion: '3',
    })

    await act(async () => {
      resolveAssignment?.({
        ok: true,
        data: { resourceId: ASSIGNMENT_ID, version: '1', status: 'open' },
      })
    })
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(
      `/auth-mvp/verkefnin/${CIRCLE_ID}/framkvaemdir/${ASSIGNMENT_ID}`,
    ))
  })

  it('retries an uncertain assignment with the original request id', async () => {
    const uuidMock = vi.mocked(globalThis.crypto.randomUUID)
    uuidMock.mockReset()
    uuidMock.mockReturnValueOnce(REQUEST_ID).mockReturnValue(UNUSED_RETRY_ID)
    mocks.assign
      .mockRejectedValueOnce(new Error('transport failed'))
      .mockResolvedValueOnce({
        ok: true,
        data: { resourceId: ASSIGNMENT_ID, version: '1', status: 'open' },
      })
    renderAssignmentForm()

    fireEvent.click(screen.getByRole('button', { name: 'Úthluta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að vista.')
    fireEvent.click(screen.getByRole('button', { name: 'Úthluta' }))

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(2))
    expect(mocks.assign.mock.calls[0][0].requestId).toBe(REQUEST_ID)
    expect(mocks.assign.mock.calls[1][0].requestId).toBe(REQUEST_ID)
    expect(uuidMock).toHaveBeenCalledOnce()
  })

  it('routes child cancellation through the exact-own action and exposes no member-only actions', async () => {
    render(
      <ChoreAssignmentActions
        state={{
          circleId: CIRCLE_ID,
          assignmentId: ASSIGNMENT_ID,
          version: '2',
          canComplete: true,
          canCancelAsMember: false,
          canCancelOwn: true,
          canUndo: false,
          repeatContext: null,
        }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Merkja lokið' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Afturkalla verklok' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Úthluta aftur' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hætta við verk' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAttribute('aria-describedby', 'assignment-cancel-disclosure')
    fireEvent.click(screen.getByRole('button', { name: 'Já, hætta við verk' }))

    await waitFor(() => expect(mocks.cancelOwn).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      assignmentId: ASSIGNMENT_ID,
      expectedVersion: '2',
    }))
    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it('routes full-member cancellation through the member action', async () => {
    render(
      <ChoreAssignmentActions
        state={{
          circleId: CIRCLE_ID,
          assignmentId: ASSIGNMENT_ID,
          version: '5',
          canComplete: true,
          canCancelAsMember: true,
          canCancelOwn: false,
          canUndo: false,
          repeatContext: null,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hætta við verk' }))
    fireEvent.click(screen.getByRole('button', { name: 'Já, hætta við verk' }))

    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      assignmentId: ASSIGNMENT_ID,
      expectedVersion: '5',
    }))
    expect(mocks.cancelOwn).not.toHaveBeenCalled()
  })

  it('keeps the committed undo outcome visible after refreshed actions disappear', async () => {
    mocks.undo.mockResolvedValueOnce({
      ok: true,
      data: {
        resourceId: ASSIGNMENT_ID,
        reopenOutcome: 'cancelled',
        reopenReason: 'undo_not_reopened',
      },
    })
    const baseState = {
      circleId: CIRCLE_ID,
      assignmentId: ASSIGNMENT_ID,
      version: '6',
      canComplete: false,
      canCancelAsMember: false,
      canCancelOwn: false,
      repeatContext: null,
    } as const
    const { rerender } = render(
      <ChoreAssignmentActions state={{ ...baseState, canUndo: true }} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Afturkalla verklok' }))
    expect(screen.getByRole('alertdialog', { name: 'Afturkalla verklok' })).toHaveTextContent(
      'Stigin eru dregin frá',
    )
    expect(mocks.undo).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('alertdialog', { name: 'Afturkalla verklok' }), {
      key: 'Escape',
    })
    expect(screen.queryByRole('alertdialog', { name: 'Afturkalla verklok' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Afturkalla verklok' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Afturkalla verklok' }))
    fireEvent.click(screen.getByRole('button', { name: 'Já, afturkalla verklok' }))
    expect(await screen.findByRole('status')).toHaveTextContent('þátttakandinn er ekki virkur')

    rerender(<ChoreAssignmentActions state={{ ...baseState, canUndo: false }} />)
    expect(screen.getByRole('status')).toHaveTextContent('þátttakandinn er ekki virkur')
  })

  it('explains when undo cannot reopen because the open-chore cap was reached', async () => {
    mocks.undo.mockResolvedValueOnce({
      ok: true,
      data: {
        resourceId: ASSIGNMENT_ID,
        reopenOutcome: 'cancelled',
        reopenReason: 'cap_not_reopened',
      },
    })

    render(
      <ChoreAssignmentActions
        state={{
          circleId: CIRCLE_ID,
          assignmentId: ASSIGNMENT_ID,
          version: '6',
          canComplete: false,
          canCancelAsMember: false,
          canCancelOwn: false,
          canUndo: true,
          repeatContext: null,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Afturkalla verklok' }))
    fireEvent.click(screen.getByRole('button', { name: 'Já, afturkalla verklok' }))
    expect(await screen.findByRole('status')).toHaveTextContent('hámarki opinna verka var náð')
  })
})
