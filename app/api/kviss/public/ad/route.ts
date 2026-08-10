import { NextRequest, NextResponse } from 'next/server'
import { AD_PLACEMENTS } from '@/lib/advertiser/contracts'
import { resolvePublicQuizAd } from '@/lib/advertiser/repository.server'

export async function GET(request: NextRequest) {
  // A pause or entitlement revoke must take effect on the next refresh.
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  if (process.env.KVISS_ENABLED !== 'true' || process.env.PUBLIC_QUIZ_ADS_ENABLED !== 'true') {
    return NextResponse.json({ ad: null }, { headers })
  }
  const placement = request.nextUrl.searchParams.get('placement')
  if (!AD_PLACEMENTS.includes(placement as (typeof AD_PLACEMENTS)[number])) {
    return NextResponse.json({ ad: null }, { headers })
  }
  return NextResponse.json({ ad: await resolvePublicQuizAd(placement as (typeof AD_PLACEMENTS)[number]) }, { headers })
}
