'use client'

import { Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { usePathname, useSearchParams } from 'next/navigation'
import { isSafeBookingLoginNext } from '@/lib/auth/loginNext'

const PRIVATE_BOOKING_PATHS = [
  /^\/bokanir(?:\/|$)/,
  /^\/auth-mvp\/bokanir\/fyrirspurn\/[^/]+\/?$/,
]

/**
 * Public booking intake and private booking details deliberately contain no
 * third-party analytics. This keeps a bearer fragment out of scripts already
 * mounted on the provider page before it is exchanged.
 */
function RouteAwareAnalytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (PRIVATE_BOOKING_PATHS.some(pattern => pattern.test(pathname))) return null
  if (
    (pathname === '/innskraning' || pathname === '/auth-mvp/minn-profill')
    && isSafeBookingLoginNext(searchParams.get('next'))
  ) return null
  return <Analytics />
}

export function TeskeidAnalytics() {
  return (
    <Suspense fallback={null}>
      <RouteAwareAnalytics />
    </Suspense>
  )
}
