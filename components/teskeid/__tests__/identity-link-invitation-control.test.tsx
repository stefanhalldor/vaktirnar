import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  IdentityLinkInvitationControl,
  type IdentityLinkInvitationDeliveryResult,
} from '@/components/teskeid/IdentityLinkInvitationControl'

const copy = {
  triggerLabel: 'Tengja við Teskeiðarnotanda',
  emailLabel: 'Netfang fyrir Önnu',
  emailPlaceholder: 'nafn@daemi.is',
  submitLabel: 'Senda boð',
  submittingLabel: 'Sendi boð...',
  entryCancelLabel: 'Hætta við',
  resendLabel: 'Senda boð aftur',
  resendPendingLabel: 'Sendi aftur...',
  cancelInvitationLabel: 'Afturkalla boð',
  cancellingLabel: 'Afturkalla...',
  cancelInvitationConfirm: 'Viltu afturkalla boðið?',
  cancelledNotice: 'Boðið hefur verið afturkallað.',
  sentNotice: 'Boðið hefur verið sent.',
  deliveryIssueNotice: 'Boðið var vistað en sendingin er óviss.',
  genericError: 'Ekki tókst að vista.',
  linkedLabel: 'Tengt við Teskeiðarnotanda',
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('IdentityLinkInvitationControl', () => {
  it('renders only the explicitly selected hidden or linked state', () => {
    const { rerender } = render(
      <IdentityLinkInvitationControl
        state="hidden"
        partyLabel="Anna"
        copy={copy}
      />,
    )

    expect(screen.queryByRole('group', { name: 'Anna' })).toBeNull()

    rerender(
      <IdentityLinkInvitationControl
        state="linked"
        partyLabel="Anna"
        copy={copy}
      />,
    )

    expect(screen.getByText('Tengt við Teskeiðarnotanda')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens a mobile-safe native email step without owning domain identifiers', () => {
    const onInvite = vi.fn()
    render(
      <IdentityLinkInvitationControl
        state="eligible"
        partyLabel="Anna"
        copy={copy}
        presentation="compact"
        onInvite={onInvite}
      />,
    )

    const trigger = screen.getByRole('button', { name: copy.triggerLabel })
    expect(trigger).toHaveClass('min-h-11')
    fireEvent.click(trigger)

    const group = screen.getByRole('group', { name: 'Anna' })
    const input = screen.getByRole('textbox', { name: copy.emailLabel })
    expect(group).toHaveClass('w-full', 'basis-full', 'min-w-0')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('inputmode', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toHaveAttribute('maxlength', '320')
    expect(input).toBeRequired()
    expect(input).toHaveClass('text-base', 'w-full')

    fireEvent.change(input, { target: { value: 'ekki-netfang' } })
    expect(input).toBeInvalid()
    expect(onInvite).not.toHaveBeenCalled()
  })

  it('guards a synchronous double submit and preserves success feedback after closing the form', async () => {
    let resolveInvite!: (result: IdentityLinkInvitationDeliveryResult) => void
    const onInvite = vi.fn(() => new Promise<IdentityLinkInvitationDeliveryResult>((resolve) => {
      resolveInvite = resolve
    }))
    const onCompleted = vi.fn()
    const onPendingChange = vi.fn()
    const { rerender } = render(
      <IdentityLinkInvitationControl
        state="eligible"
        partyLabel="Anna"
        copy={copy}
        onInvite={onInvite}
        onCompleted={onCompleted}
        onPendingChange={onPendingChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: copy.triggerLabel }))
    const input = screen.getByRole('textbox', { name: copy.emailLabel })
    fireEvent.change(input, { target: { value: '  anna@example.is  ' } })
    const form = input.closest('form')
    expect(form).not.toBeNull()

    await act(async () => {
      fireEvent.submit(form!)
      fireEvent.submit(form!)
    })

    expect(onInvite).toHaveBeenCalledOnce()
    expect(onInvite).toHaveBeenCalledWith('anna@example.is')
    expect(screen.getByRole('button', { name: copy.submittingLabel })).toBeDisabled()
    expect(input).toBeDisabled()

    await act(async () => {
      resolveInvite({ ok: true, delivery: 'sent' })
    })

    expect(await screen.findByRole('status')).toHaveTextContent(copy.sentNotice)
    expect(screen.queryByRole('textbox', { name: copy.emailLabel })).toBeNull()
    const staleTrigger = screen.getByRole('button', { name: copy.triggerLabel })
    expect(staleTrigger).toBeDisabled()
    expect(screen.getByRole('group', { name: 'Anna' })).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(staleTrigger)
    expect(onInvite).toHaveBeenCalledOnce()
    expect(onCompleted).toHaveBeenCalledWith('invite')
    expect(onPendingChange).toHaveBeenNthCalledWith(1, true)
    expect(onPendingChange).toHaveBeenLastCalledWith(false)

    rerender(
      <IdentityLinkInvitationControl
        state="eligible"
        partyLabel="Anna"
        copy={copy}
        resetKey={1}
        onInvite={onInvite}
        onCompleted={onCompleted}
        onPendingChange={onPendingChange}
      />,
    )
    await waitFor(() => expect(
      screen.getByRole('button', { name: copy.triggerLabel }),
    ).toBeEnabled())
    expect(screen.getByRole('status')).toHaveTextContent(copy.sentNotice)
  })

  it('bounds the successful invite lock when controlled props remain stale', async () => {
    vi.useFakeTimers()
    const onInvite = vi.fn().mockResolvedValue({ ok: true, delivery: 'sent' })
    render(
      <IdentityLinkInvitationControl
        state="eligible"
        partyLabel="Anna"
        copy={copy}
        onInvite={onInvite}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: copy.triggerLabel }))
    const input = screen.getByRole('textbox', { name: copy.emailLabel })
    fireEvent.change(input, { target: { value: 'anna@example.is' } })
    await act(async () => {
      fireEvent.submit(input.closest('form')!)
    })

    expect(screen.getByRole('button', { name: copy.triggerLabel })).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(screen.getByRole('button', { name: copy.triggerLabel })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent(copy.sentNotice)
  })

  it('announces and focuses allowlisted adapter errors while keeping the email editable', async () => {
    const onInvite = vi.fn().mockResolvedValue({
      ok: false,
      safeErrorMessage: 'Þetta boð er ekki lengur tiltækt.',
    })
    render(
      <IdentityLinkInvitationControl
        state="eligible"
        partyLabel="Anna"
        copy={copy}
        onInvite={onInvite}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: copy.triggerLabel }))
    const input = screen.getByRole('textbox', { name: copy.emailLabel })
    fireEvent.change(input, { target: { value: 'anna@example.is' } })
    fireEvent.submit(input.closest('form')!)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Þetta boð er ekki lengur tiltækt.')
    await waitFor(() => expect(alert).toHaveFocus())
    expect(input).toBeEnabled()
  })

  it('maps thrown mutations to generic copy without exposing exception details', async () => {
    const onInvite = vi.fn().mockRejectedValue(new Error('private@example.is'))
    const { container } = render(
      <IdentityLinkInvitationControl
        state="eligible"
        partyLabel="Anna"
        copy={copy}
        onInvite={onInvite}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: copy.triggerLabel }))
    const input = screen.getByRole('textbox', { name: copy.emailLabel })
    fireEvent.change(input, { target: { value: 'anna@example.is' } })
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.genericError)
    expect(container.textContent).not.toContain('private@example.is')
  })

  it('supports compact resend/cancel lifecycle, confirmation and uncertain delivery', async () => {
    const onResend = vi.fn().mockResolvedValue({ ok: true, delivery: 'uncertain' })
    const onCancel = vi.fn().mockResolvedValue({ ok: true })
    const onCompleted = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { rerender } = render(
      <IdentityLinkInvitationControl
        state="pending"
        partyLabel="Anna"
        copy={copy}
        presentation="compact"
        onResend={onResend}
        onCancel={onCancel}
        onCompleted={onCompleted}
      />,
    )

    const resendButton = screen.getByRole('button', { name: copy.resendLabel })
    const cancelButton = screen.getByRole('button', { name: copy.cancelInvitationLabel })
    expect(resendButton).toHaveClass('size-11', 'min-h-11')
    expect(cancelButton).toHaveClass('size-11', 'min-h-11')

    await act(async () => {
      fireEvent.click(resendButton)
    })
    expect(onResend).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent(copy.deliveryIssueNotice)
    expect(onCompleted).toHaveBeenCalledWith('resend')

    fireEvent.click(cancelButton)
    expect(confirm).toHaveBeenCalledWith(copy.cancelInvitationConfirm)
    expect(onCancel).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await act(async () => {
      fireEvent.click(cancelButton)
    })
    expect(onCancel).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent(copy.cancelledNotice)
    expect(onCompleted).toHaveBeenLastCalledWith('cancel')
    expect(screen.getByRole('button', { name: copy.cancelInvitationLabel })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: copy.cancelInvitationLabel }))
    expect(onCancel).toHaveBeenCalledOnce()

    rerender(
      <IdentityLinkInvitationControl
        state="eligible"
        partyLabel="Anna"
        copy={copy}
        onInvite={vi.fn().mockResolvedValue({ ok: true, delivery: 'sent' })}
      />,
    )
    await waitFor(() => expect(
      screen.getByRole('button', { name: copy.triggerLabel }),
    ).toBeEnabled())
    expect(screen.getByRole('status')).toHaveTextContent(copy.cancelledNotice)
  })
})
