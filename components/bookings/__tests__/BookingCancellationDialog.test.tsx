import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { BookingCancellationDialog } from '../BookingCancellationDialog'

describe('BookingCancellationDialog', () => {
  it('requires one of the three typed provider reasons and closes only after success', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    render(<BookingCancellationDialog audience="provider" pending={false} onConfirm={onConfirm} />)

    const trigger = screen.getByRole('button', { name: 'workflow.cancel.open' })
    await userEvent.click(trigger)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    const confirm = screen.getByRole('button', { name: 'workflow.cancel.confirm' })
    expect(confirm).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', {
      name: 'workflow.cancellationReasons.provider_unavailable',
    }))
    await userEvent.click(confirm)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onConfirm).toHaveBeenCalledWith('provider_unavailable')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('shows no reason choice to a customer and delegates server-forced reason as null', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    render(<BookingCancellationDialog audience="customer" pending={false} onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'workflow.cancel.open' }))
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'workflow.cancel.confirm' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(null))
  })

  it('keeps the dialog open after a rejected mutation', async () => {
    render(
      <BookingCancellationDialog
        audience="customer"
        pending={false}
        onConfirm={vi.fn().mockResolvedValue(false)}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'workflow.cancel.open' }))
    await userEvent.click(screen.getByRole('button', { name: 'workflow.cancel.confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('workflow.cancel.failed')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes on Escape without mutation and returns focus to the trigger', async () => {
    const onConfirm = vi.fn()
    render(<BookingCancellationDialog audience="customer" pending={false} onConfirm={onConfirm} />)
    const trigger = screen.getByRole('button', { name: 'workflow.cancel.open' })
    await userEvent.click(trigger)

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
