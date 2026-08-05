import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (rawKey: string, values?: Record<string, string>) => {
    const key = rawKey.replace(/^teskeid\.expenses\./, '')
    const translations: Record<string, string> = {
      'expenseForm.stepNavAriaLabel': 'Skref við skráningu útgjalds',
      'expenseForm.steps.details': 'Útgjald',
      'expenseForm.steps.people': 'Aðilar',
      'expenseForm.steps.split': 'Skipting',
      'expenseForm.steps.review': 'Yfirferð',
      'expenseForm.stepUnavailable': 'Veldu eða stofnaðu útgjald fyrst',
      'expenseForm.stepCompleted': 'Lokið, opna til að breyta',
      'expenseForm.stepEditUnavailable': 'Ekki er hægt að breyta þessu útgjaldi',
      'expenseForm.openingStep': 'Opna {step}...',
    }
    let result = translations[key] ?? key
    for (const [name, value] of Object.entries(values ?? {})) {
      result = result.replace(`{${name}}`, value)
    }
    return result
  },
}))

import { ExpenseFlowNav } from '@/components/expenses/ExpenseFlowNav'

beforeEach(() => vi.clearAllMocks())

describe('ExpenseFlowNav', () => {
  it('marks saved review current and routes completed steps to exact edit deep links', async () => {
    render(<ExpenseFlowNav context="saved" expenseId="expense-1" canEdit />)

    const nav = screen.getByRole('navigation', { name: 'Skref við skráningu útgjalds' })
    expect(within(nav).getByRole('button', { name: 'Yfirferð' })).toHaveAttribute('aria-current', 'step')
    expect(within(nav).getByRole('button', { name: /Útgjald.*Lokið, opna til að breyta/ })).toBeEnabled()

    await act(async () => {
      fireEvent.click(within(nav).getByRole('button', { name: /Skipting/ }))
    })

    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1/breyta?step=split',
    )
  })

  it('keeps prior steps truly disabled when the saved expense cannot be edited', () => {
    render(<ExpenseFlowNav context="saved" expenseId="expense-1" canEdit={false} />)

    const nav = screen.getByRole('navigation', { name: 'Skref við skráningu útgjalds' })
    expect(within(nav).getByRole('button', { name: /Útgjald/ })).toBeDisabled()
    expect(within(nav).getByRole('button', { name: /Aðilar/ })).toBeDisabled()
    expect(within(nav).getByRole('button', { name: /Skipting/ })).toBeDisabled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
