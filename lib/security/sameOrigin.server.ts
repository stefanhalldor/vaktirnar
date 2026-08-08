import 'server-only'

import type { NextRequest } from 'next/server'

export function assertSameOriginJsonMutation(request: NextRequest): boolean {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim()
  if (contentType !== 'application/json') return false
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return false
  const origin = request.headers.get('origin')
  if (!origin) return process.env.NODE_ENV !== 'production'
  try {
    return new URL(origin).origin === request.nextUrl.origin
  } catch {
    return false
  }
}
