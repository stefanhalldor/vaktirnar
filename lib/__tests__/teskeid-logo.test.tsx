/**
 * Component tests for components/teskeid/TeskeidLogo.tsx (canonical production component)
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'

describe('TeskeidLogo — size and viewBox', () => {
  it('renders at default size 160', () => {
    const { container } = render(<TeskeidLogo />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('160')
  })

  it('uses the requested width while preserving 1200:1223 aspect ratio', () => {
    const { container } = render(<TeskeidLogo size={320} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('320')
    expect(Number(svg?.getAttribute('height'))).toBeCloseTo(326.13, 1)
  })

  it('preserves canonical viewBox regardless of size', () => {
    const { container } = render(<TeskeidLogo size={32} />)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1200 1223')
  })

  it('applies className to the svg element', () => {
    const { container } = render(<TeskeidLogo className="my-logo" />)
    expect(container.querySelector('svg.my-logo')).not.toBeNull()
  })
})

describe('TeskeidLogo — showBackground', () => {
  it('renders a background rect when showBackground=true (default)', () => {
    const { container } = render(<TeskeidLogo />)
    expect(container.querySelector('rect')).not.toBeNull()
  })

  it('omits the background rect when showBackground=false', () => {
    const { container } = render(<TeskeidLogo showBackground={false} />)
    expect(container.querySelector('rect')).toBeNull()
  })

  it('still renders both paths when showBackground=false', () => {
    const { container } = render(<TeskeidLogo showBackground={false} />)
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })
})

describe('TeskeidLogo — accessibility: decorative=false (default)', () => {
  it('has role="img" with accessible title', () => {
    render(<TeskeidLogo />)
    expect(screen.getByRole('img', { name: 'Teskeið.is logo' })).toBeDefined()
  })

  it('renders a <title> with "Teskeið.is logo"', () => {
    const { container } = render(<TeskeidLogo />)
    expect(container.querySelector('title')?.textContent).toBe('Teskeið.is logo')
  })

  it('aria-labelledby matches the title id', () => {
    const { container } = render(<TeskeidLogo />)
    const svg = container.querySelector('svg')
    const title = container.querySelector('title')
    const labelledBy = svg?.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(title?.getAttribute('id')).toBe(labelledBy)
  })

  it('does not set aria-hidden', () => {
    const { container } = render(<TeskeidLogo />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBeNull()
  })
})

describe('TeskeidLogo — accessibility: decorative=true', () => {
  it('sets aria-hidden="true"', () => {
    const { container } = render(<TeskeidLogo decorative />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('does not set role', () => {
    const { container } = render(<TeskeidLogo decorative />)
    expect(container.querySelector('svg')?.getAttribute('role')).toBeNull()
  })

  it('does not render a <title>', () => {
    const { container } = render(<TeskeidLogo decorative />)
    expect(container.querySelector('title')).toBeNull()
  })
})
