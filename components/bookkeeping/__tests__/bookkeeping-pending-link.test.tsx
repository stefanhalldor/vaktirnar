import React, { forwardRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(
    function MockLink({ href, children, ...props }, ref) {
      return <a ref={ref} href={typeof href === 'string' ? href : undefined} {...props}>{children}</a>
    },
  ),
}))

import { BookkeepingPendingLink } from '@/components/bookkeeping/BookkeepingPendingLink'

describe('BookkeepingPendingLink', () => {
  it('shows an immediate busy state and prevents duplicate navigation clicks', () => {
    render(
      <BookkeepingPendingLink href="/auth-mvp/heim" ariaLabel="Heim" className="link">
        Heim
      </BookkeepingPendingLink>,
    )

    const link = screen.getByRole('link', { name: 'Heim' })
    fireEvent.click(link)

    expect(link).toHaveAttribute('aria-busy', 'true')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('Heim')).not.toBeInTheDocument()

    expect(fireEvent.click(link)).toBe(false)
  })

  it('does not enter a pending state for a modified click', () => {
    render(
      <BookkeepingPendingLink href="/auth-mvp/heim" ariaLabel="Heim" className="link">
        Heim
      </BookkeepingPendingLink>,
    )

    const link = screen.getByRole('link', { name: 'Heim' })
    fireEvent.click(link, { ctrlKey: true })

    expect(link).not.toHaveAttribute('aria-busy')
    expect(screen.getByText('Heim')).toBeInTheDocument()
  })
})
