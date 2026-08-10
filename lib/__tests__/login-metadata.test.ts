import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildLoginMetadata,
  resolveLoginOpenGraphUrl,
} from '@/lib/auth/loginMetadata'

const expenseDeepLink =
  '/auth-mvp/utlagt-og-endurgreitt/hopar/5ae3e9b9-bbde-48d4-8c4a-4c957f83edb9'

describe('privacy-safe login metadata', () => {
  it('preserves the exact allowed UL deep link', () => {
    expect(resolveLoginOpenGraphUrl(expenseDeepLink)).toBe(
      `https://teskeid.is${expenseDeepLink}`,
    )
  })

  it('preserves an allowed query string', () => {
    const next = `${expenseDeepLink}?from=messenger&returnTo=%2Fauth-mvp%2Fheim`
    expect(resolveLoginOpenGraphUrl(next)).toBe(`https://teskeid.is${next}`)
  })

  it.each([
    undefined,
    null,
    '',
    'https://evil.example/auth-mvp/heim',
    '//evil.example/auth-mvp/heim',
    '/admin',
  ])('falls back to the login URL for unsafe next=%s', (next) => {
    expect(resolveLoginOpenGraphUrl(next)).toBe('https://teskeid.is/innskraning')
  })

  it('uses generic noindex metadata without private UL fields', () => {
    const metadata = buildLoginMetadata(expenseDeepLink, {
      title: 'Innskráning | Teskeið',
      description: 'Margar litlar hversdagslausnir á einum stað. Einn aðgangur.',
    })

    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.title).toBe('Innskráning | Teskeið')
    expect(metadata.description).toBe(
      'Margar litlar hversdagslausnir á einum stað. Einn aðgangur.',
    )
    expect(metadata.openGraph).toMatchObject({
      url: `https://teskeid.is${expenseDeepLink}`,
      title: 'Innskráning | Teskeið',
      description: 'Margar litlar hversdagslausnir á einum stað. Einn aðgangur.',
    })
    expect(metadata.twitter).toMatchObject({
      title: 'Innskráning | Teskeið',
      description: 'Margar litlar hversdagslausnir á einum stað. Einn aðgangur.',
    })
  })

  it('does not advertise the homepage as every route og:url or fetch UL metadata', () => {
    const rootLayout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8')
    const loginPage = readFileSync(join(process.cwd(), 'app/innskraning/page.tsx'), 'utf8')
    const metadataImplementation = loginPage.slice(
      loginPage.indexOf('export async function generateMetadata'),
      loginPage.indexOf('export default async function'),
    )

    expect(rootLayout).not.toMatch(/openGraph:\s*\{[\s\S]*?url:\s*['"]https:\/\/teskeid\.is['"]/)
    expect(metadataImplementation).toContain('buildLoginMetadata(next')
    expect(metadataImplementation).not.toMatch(/createClient|repository|expense|utlagt/i)
  })
})
