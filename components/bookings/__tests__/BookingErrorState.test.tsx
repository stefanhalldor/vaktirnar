import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('../BookingShell', () => ({
  BookingShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { BookingErrorState } from '../BookingErrorState'

describe('BookingErrorState', () => {
  it('shows immediate pending feedback while retrying the route', async () => {
    const reset = vi.fn()
    render(<BookingErrorState reset={reset} providerHref="/" />)

    await userEvent.click(screen.getByRole('button', { name: 'retry' }))

    expect(reset).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'loading' })).toBeDisabled()
  })
})
