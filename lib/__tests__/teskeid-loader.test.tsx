import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

function mockMatchMedia(prefersReducedMotion = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: prefersReducedMotion && query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

beforeEach(() => {
  mockMatchMedia(false)
})

afterEach(() => {
  vi.useRealTimers()
})

const defaultProps = {
  ideaTitles: ['Lánað og skilað', 'Viðburðir', 'Útgjöld'],
  loadingLabel: 'Hleður Teskeið',
  fallbackIdeaTitle: 'Allt í Teskeið',
}

describe('TeskeidLoader', () => {
  it('renders role="status" with loadingLabel', () => {
    render(React.createElement(TeskeidLoader, defaultProps))
    expect(screen.getByRole('status', { name: 'Hleður Teskeið' })).toBeDefined()
  })

  it('renders TeskeidLogo as decorative (no img role)', () => {
    render(React.createElement(TeskeidLoader, defaultProps))
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the first title initially', () => {
    render(React.createElement(TeskeidLoader, defaultProps))
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })

  it('trims, deduplicates and filters empty strings', () => {
    render(React.createElement(TeskeidLoader, {
      ...defaultProps,
      ideaTitles: ['  Lánað og skilað  ', 'Lánað og skilað', '', '  '],
    }))
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    expect(screen.getAllByText('Lánað og skilað')).toHaveLength(1)
  })

  it('shows fallbackIdeaTitle when ideaTitles is empty', () => {
    render(React.createElement(TeskeidLoader, { ...defaultProps, ideaTitles: [] }))
    expect(screen.getByText('Allt í Teskeið')).toBeDefined()
  })

  it('shows fallbackIdeaTitle when ideaTitles contains only whitespace', () => {
    render(React.createElement(TeskeidLoader, { ...defaultProps, ideaTitles: ['   ', ''] }))
    expect(screen.getByText('Allt í Teskeið')).toBeDefined()
  })

  it('cycles title after intervalMs', () => {
    vi.useFakeTimers()
    render(React.createElement(TeskeidLoader, { ...defaultProps, intervalMs: 1000 }))
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Viðburðir')).toBeDefined()
  })

  it('does not cycle title when prefers-reduced-motion is active', () => {
    mockMatchMedia(true)
    vi.useFakeTimers()
    render(React.createElement(TeskeidLoader, { ...defaultProps, intervalMs: 1000 }))
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })
})
