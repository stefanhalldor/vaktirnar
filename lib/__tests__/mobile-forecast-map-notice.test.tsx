import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileForecastMapNotice } from '@/components/weather/MobileForecastMapNotice'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    mobileForecastMapNoticeTitle: 'Við erum að fínpússa Spákortið',
    mobileForecastMapNoticeBody: 'Það er aðeins í boði í tölvu í bili á meðan við lögum það betur að minni skjám.',
    mobileForecastMapNoticeAction: 'Skoða spágögn',
  } satisfies Record<string, string>)[key] ?? key,
}))

describe('MobileForecastMapNotice', () => {
  it('announces the mobile state and opens forecast data through its action', () => {
    const onViewData = vi.fn()
    render(<MobileForecastMapNotice onViewData={onViewData} />)

    expect(screen.getByRole('status', {
      name: 'Við erum að fínpússa Spákortið',
    })).toBeInTheDocument()
    expect(screen.getByText(/aðeins í boði í tölvu/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skoða spágögn' }))
    expect(onViewData).toHaveBeenCalledTimes(1)
  })
})
