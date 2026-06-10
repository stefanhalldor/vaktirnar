/**
 * Behavior tests for components/loans/LoanForm.tsx
 *
 * Focuses on submit-state lifecycle:
 *   - button disabled immediately on submit
 *   - button stays disabled after successful action (isSubmitting never reset)
 *   - button re-enabled and error shown after failed action result
 *   - button re-enabled and error shown after thrown action
 *   - cancel button disabled while saving
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { act } from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockBack = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn(), back: mockBack }),
}))

vi.mock('next-intl', () => ({
  useTranslations: vi.fn().mockImplementation(() => {
    const T: Record<string, string> = {
      save: 'Vista',
      saving: 'Vista...',
      cancel: 'Hætta við',
      loanedAt: 'Lánað þann',
      dueDateOptional: 'Skila fyrir (valkvæmt)',
      clearDueDate: 'Hreinsa',
      noteOptional: 'Athugasemd (valkvæmt)',
      itemName: 'Hlutur',
      recipientEmailOptional: 'Netfang (valkvæmt)',
      creatorRoleLender: 'Ég lánaði',
      creatorRoleBorrowed: 'Ég fékk lánað',
      'errors.saveFailed': 'Villa við vistun',
      'errors.recipientUnavailable': 'Netfang ekki til',
      'errors.rateLimited': 'Of margar tilraunir',
    }
    return (key: string) => T[key] ?? key
  }),
}))

vi.mock('@/components/loans/LoanDateField', () => ({
  LoanDateField: ({ label, value, onChange, required }: {
    label: string
    value: string
    onChange: (v: string) => void
    required?: boolean
  }) =>
    React.createElement('input', {
      'aria-label': label,
      value,
      required,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    }),
}))

import { LoanForm } from '@/components/loans/LoanForm'
import type { ActionResult } from '@/lib/loans/actions'

// ── Helpers ───────────────────────────────────────────────────────────────────

function submitButton() {
  return screen.getByRole('button', { name: /Vista/i })
}

function cancelButton() {
  return screen.getByRole('button', { name: 'Hætta við' })
}

function fillItemName(value = 'Bók') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Hlutur' }), {
    target: { value },
  })
}

function submitForm() {
  fireEvent.submit(document.querySelector('form')!)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoanForm — submit button state', () => {
  it('disables submit and cancel immediately on submit', async () => {
    // action never resolves during this test — simulates slow network
    const action = vi.fn(() => new Promise<ActionResult>(() => {}))

    render(React.createElement(LoanForm, { action }))
    fillItemName()

    await act(async () => {
      submitForm()
    })

    expect(submitButton()).toHaveProperty('disabled', true)
    expect(cancelButton()).toHaveProperty('disabled', true)
  })

  it('shows saving label while submitting', async () => {
    const action = vi.fn(() => new Promise<ActionResult>(() => {}))

    render(React.createElement(LoanForm, { action }))
    fillItemName()

    await act(async () => {
      submitForm()
    })

    expect(submitButton().textContent).toBe('Vista...')
  })

  it('keeps submit disabled after successful action result', async () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({ ok: true }))

    render(React.createElement(LoanForm, { action }))
    fillItemName()

    await act(async () => {
      submitForm()
    })

    // isSubmitting stays true — component is waiting for router navigation
    expect(submitButton()).toHaveProperty('disabled', true)
    expect(mockPush).toHaveBeenCalledWith('/auth-mvp/lanad-og-skilad')
  })

  it('re-enables submit and cancel after failed action result', async () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: false,
      error: 'save_failed',
    }))

    render(React.createElement(LoanForm, { action }))
    fillItemName()

    await act(async () => {
      submitForm()
    })

    await waitFor(() => {
      expect(submitButton()).toHaveProperty('disabled', false)
    })
    expect(cancelButton()).toHaveProperty('disabled', false)
    expect(submitButton().textContent).toBe('Vista')
  })

  it('shows error message after failed action result', async () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: false,
      error: 'save_failed',
    }))

    render(React.createElement(LoanForm, { action }))
    fillItemName()

    await act(async () => {
      submitForm()
    })

    await waitFor(() => {
      expect(screen.getByText('Villa við vistun')).toBeDefined()
    })
  })

  it('re-enables submit after thrown action', async () => {
    const action = vi.fn(async (): Promise<ActionResult> => {
      throw new Error('network error')
    })

    render(React.createElement(LoanForm, { action }))
    fillItemName()

    await act(async () => {
      submitForm()
    })

    await waitFor(() => {
      expect(submitButton()).toHaveProperty('disabled', false)
    })
  })

  it('shows error message after thrown action', async () => {
    const action = vi.fn(async (): Promise<ActionResult> => {
      throw new Error('network error')
    })

    render(React.createElement(LoanForm, { action }))
    fillItemName()

    await act(async () => {
      submitForm()
    })

    await waitFor(() => {
      expect(screen.getByText('Villa við vistun')).toBeDefined()
    })
  })

  it('does not submit twice if submit is clicked while saving', async () => {
    const action = vi.fn(() => new Promise<ActionResult>(() => {}))

    render(React.createElement(LoanForm, { action }))
    fillItemName()

    await act(async () => {
      submitForm()
    })

    // Try submitting again while still saving
    await act(async () => {
      submitForm()
    })

    expect(action).toHaveBeenCalledTimes(1)
  })
})
