import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { InvitationDecisionButtons } from '@/components/teskeid/InvitationDecisionButtons'

describe('InvitationDecisionButtons', () => {
  it('calls the explicit accept and decline handlers', () => {
    const onAccept = vi.fn()
    const onDecline = vi.fn()

    render(
      <InvitationDecisionButtons
        acceptLabel="Þekki málið"
        declineLabel="Kannast ekki við þetta"
        isPending={false}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Þekki málið' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kannast ekki við þetta' }))

    expect(onAccept).toHaveBeenCalledOnce()
    expect(onDecline).toHaveBeenCalledOnce()
  })

  it('disables both decisions and exposes a busy state while pending', () => {
    const { container } = render(
      <InvitationDecisionButtons
        acceptLabel="Samþykkja"
        declineLabel="Hafna"
        isPending
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Samþykkja' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Hafna' })).toBeDisabled()
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
  })

  it('announces the supplied domain error without owning its text', () => {
    render(
      <InvitationDecisionButtons
        acceptLabel="Samþykkja"
        declineLabel="Hafna"
        isPending={false}
        error="Ekki tókst að vista"
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Ekki tókst að vista')
  })
})
