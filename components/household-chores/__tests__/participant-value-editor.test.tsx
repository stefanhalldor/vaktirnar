import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  setValue: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock('@/lib/household-chores/actions', () => ({
  setHouseholdChoreParticipantValueAction: mocks.setValue,
}))

const translations: Record<string, string> = {
  'common.formerMember': 'Fyrrverandi meðlimur',
  'common.saving': 'Vista…',
  'definitions.enableToSet': 'Virkjaðu þátttakandann til að stilla stig.',
  'definitions.pointsHeading': 'Þátttakendur og stig',
  'definitions.pointsHint': 'Veldu hverjir mega taka verkefnið að sér og hversu mörg stig þeir fá.',
  'definitions.pointsLabel': 'Stig',
  'definitions.savePoints': 'Vista stig',
  'errors.save_failed': 'Ekki tókst að vista.',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translations[key] ?? key,
}))

import { ParticipantValueEditor } from '@/components/household-chores/ParticipantValueEditor'

const REQUEST_ID = '10000000-0000-4000-8000-000000000001'
const CIRCLE_ID = '20000000-0000-4000-8000-000000000001'
const DEFINITION_ID = '30000000-0000-4000-8000-000000000001'
const PARTICIPANT_ID = '40000000-0000-4000-8000-000000000001'

describe('ParticipantValueEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(REQUEST_ID)
    mocks.setValue.mockResolvedValue({ ok: true, data: { resourceId: PARTICIPANT_ID } })
  })

  it('lets a full member activate a participant and set points immediately', async () => {
    render(
      <ParticipantValueEditor
        circleId={CIRCLE_ID}
        definitionId={DEFINITION_ID}
        definitionVersion="2"
        values={[{
          participantId: PARTICIPANT_ID,
          label: 'Berglind',
          identityMarker: 'current',
          participantStatus: 'active',
          participantVersion: '3',
          valueStatus: 'missing',
          valueVersion: '0',
          points: null,
        }]}
      />,
    )

    expect(screen.getByText('Veldu hverjir mega taka verkefnið að sér og hversu mörg stig þeir fá.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Berglind' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Stig' }), {
      target: { value: '8' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vista stig' }))

    await waitFor(() => expect(mocks.setValue).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      circleId: CIRCLE_ID,
      definitionId: DEFINITION_ID,
      participantId: PARTICIPANT_ID,
      expectedDefinitionVersion: '2',
      expectedValueVersion: '0',
      points: 8,
      active: true,
    }))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
