import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { PublicQuizAdCard } from '@/components/kviss/PublicQuizAdCard'
import isMessages from '@/messages/is.json'

describe('PublicQuizAdCard', () => {
  it('is clearly disclosed, escapes text and uses a privacy-safe direct link', () => {
    const { container } = render(
      <NextIntlClientProvider locale="is" messages={{ kviss: isMessages.kviss }}>
        <PublicQuizAdCard ad={{
          disclosure: 'Auglýsing', advertiserName: '<script>owner</script>',
          advertiserDomain: 'example.com', placement: 'public_quiz_lobby',
          headline: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>',
          ctaLabel: 'Skoða', destinationUrl: 'https://example.com/book',
        }} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Auglýsing')).toBeInTheDocument()
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    const link = screen.getByRole('link', { name: 'Skoða' })
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer')
    expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(link).toHaveAttribute('href', 'https://example.com/book')
  })

  it('collapses completely when no approved ad is available', () => {
    const { container } = render(
      <NextIntlClientProvider locale="is" messages={{ kviss: isMessages.kviss }}>
        <PublicQuizAdCard ad={null} />
      </NextIntlClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
