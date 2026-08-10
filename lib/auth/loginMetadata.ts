import type { Metadata } from 'next'
import { resolveSafeLoginNext } from '@/lib/auth/loginNext'

const TESKEID_ORIGIN = 'https://teskeid.is'
const SAFE_LOGIN_PATH = '/innskraning'

type LoginMetadataCopy = {
  title: string
  description: string
}

export function resolveLoginOpenGraphUrl(next: string | null | undefined): string {
  const safeNext = resolveSafeLoginNext(next)
  return `${TESKEID_ORIGIN}${safeNext ?? SAFE_LOGIN_PATH}`
}

export function buildLoginMetadata(
  next: string | null | undefined,
  copy: LoginMetadataCopy,
): Metadata {
  const url = resolveLoginOpenGraphUrl(next)

  return {
    title: copy.title,
    description: copy.description,
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title: copy.title,
      description: copy.description,
      url,
      siteName: 'Teskeið',
      locale: 'is_IS',
      type: 'website',
      images: [
        {
          url: '/opengraph-image.png',
          width: 1200,
          height: 630,
          alt: 'Allt í Teskeið',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.title,
      description: copy.description,
      images: ['/opengraph-image.png'],
    },
  }
}
