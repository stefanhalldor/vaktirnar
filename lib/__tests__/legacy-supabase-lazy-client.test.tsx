import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

describe('legacy Supabase client lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.createClient.mockClear()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl

    if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey
  })

  it('does not construct a client while route modules are imported', async () => {
    await Promise.all([
      import('@/lib/store'),
      import('@/components/landing/VaktSuggestionForm'),
      import('@/components/landing/WaitlistForm'),
    ])

    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('fails at request time when runtime configuration is missing', async () => {
    const { getLegacySupabaseClient } = await import('@/lib/supabase')

    expect(() => getLegacySupabaseClient()).toThrow(
      'Supabase URL and anon key are required at request time',
    )
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('releases legacy landing forms from loading when configuration is missing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const [{ VaktSuggestionForm }, { WaitlistForm }] = await Promise.all([
      import('@/components/landing/VaktSuggestionForm'),
      import('@/components/landing/WaitlistForm'),
    ])

    const suggestion = render(
      <VaktSuggestionForm
        placeholder="Tillaga"
        emailPlaceholder="Netfang"
        buttonLabel="Senda"
        successMessage="Takk"
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Tillaga'), { target: { value: 'Prófa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Senda' }))
    await waitFor(() => expect(screen.getByText(/Eitthvað fór úrskeiðis/)).toBeVisible())
    suggestion.unmount()

    render(
      <WaitlistForm
        product="test"
        locale="is"
        placeholder="Netfang"
        buttonLabel="Skrá"
        successMessage="Takk"
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Netfang'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Skrá' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Skrá' })).toBeEnabled())

    expect(mocks.createClient).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('creates and reuses one client after runtime configuration is available', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    const { getLegacySupabaseClient } = await import('@/lib/supabase')

    const first = getLegacySupabaseClient()
    const second = getLegacySupabaseClient()

    expect(first).toBe(second)
    expect(mocks.createClient).toHaveBeenCalledOnce()
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-anon-key',
    )
  })
})
