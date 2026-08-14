import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VegagerdinStationDetail } from '@/components/weather/VegagerdinStationDetail'

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: { time?: string }) => ({
    vegagerdinDetailProvider: 'Nýjustu upplýsingar frá Vegagerðinni',
    vegagerdinDetailClose: 'Loka stöðvarupplýsingum',
    vegagerdinDetailStaleAction: `Opna á umferdin.is því gögnin hér að neðan eru frá kl. ${values?.time ?? ''}`,
    vegagerdinDetailLoading: 'Sæki nýjustu stöðvarupplýsingar…',
    vegagerdinDetailUnavailable: 'Ekki tókst að sækja stöðvarupplýsingar.',
    roadMapPrototypeVegagerdinOpenUmferdin: 'Opna á umferdin.is',
  } satisfies Record<string, string>)[key] ?? key,
}))

describe('VegagerdinStationDetail', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T10:40:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('attributes the station information to Vegagerðin', () => {
    render(
      <VegagerdinStationDetail
        detail={null}
        loading
        fallbackStationId="12"
        fallbackName="Hafnarfjall"
        fallbackMeasuredAtIso="2026-08-13T10:35:00Z"
        onClose={() => {}}
      />,
    )

    expect(screen.getByText('Nýjustu upplýsingar frá Vegagerðinni')).toBeInTheDocument()
  })

  it('keeps the exact Umferðin station link available while stale detail is loading', () => {
    render(
      <VegagerdinStationDetail
        detail={null}
        loading
        fallbackStationId="12"
        fallbackName="Hafnarfjall"
        fallbackMeasuredAtIso="2026-08-13T10:10:00Z"
        onClose={() => {}}
      />,
    )

    expect(screen.getByRole('link', { name: /Opna á umferdin\.is/i })).toHaveAttribute(
      'href',
      'https://umferdin.is/vedurstodvar/12',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Sæki nýjustu stöðvarupplýsingar')
  })

  it('closes on Escape and exposes a focused 40px close control', () => {
    const onClose = vi.fn()
    render(
      <VegagerdinStationDetail
        detail={null}
        loading
        fallbackStationId="12"
        fallbackName="Hafnarfjall"
        fallbackMeasuredAtIso="2026-08-13T10:35:00Z"
        onClose={onClose}
      />,
    )

    const close = screen.getByRole('button', { name: 'Loka stöðvarupplýsingum' })
    expect(close).toHaveClass('h-10', 'w-10')
    expect(close).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
