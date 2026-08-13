import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

describe('advertiser application security contracts', () => {
  it('keeps advertiser and Kviss entitlements exact and independent', () => {
    const featureApi = source('app/api/admin/feature-access/route.ts')
    const guard = source('lib/loans/guard.ts')
    const capabilities = source('app/api/auth-mvp/capabilities/route.ts')
    expect(featureApi).toContain("'kviss', 'auglysandi', 'bokanir'")
    expect(guard).toContain("featureKey === 'auglysandi'")
    expect(guard).toContain("checkPerUserAccess(email, 'auglysandi')")
    expect(capabilities).toContain("checkFeatureAccess(user.id, user.email, 'kviss')")
    expect(capabilities).toContain("checkFeatureAccess(user.id, user.email, 'auglysandi')")
    expect(capabilities).toContain("checkFeatureAccess(user.id, user.email, 'bokanir')")
    expect(capabilities).toContain('{ kviss, advertiser, bookings }')
  })

  it('projects bounded DTOs instead of returning internal advertiser rows', () => {
    const repository = source('lib/advertiser/repository.server.ts')
    const ownerApi = source('app/api/auth-mvp/advertiser/route.ts')
    const adminApi = source('app/api/admin/advertiser/route.ts')
    const boundedJson = source('lib/advertiser/http.server.ts')
    expect(repository).not.toContain("select('*')")
    expect(repository).not.toContain('created_by')
    expect(repository).not.toContain('reviewed_by')
    expect(repository).toContain('parseSnapshot')
    expect(repository).toContain('advertiserDomain(destinationUrl)')
    expect(ownerApi).toContain("NextResponse.json({ ok: true }")
    expect(adminApi).toContain("NextResponse.json({ ok: true }")
    expect(ownerApi).not.toContain('NextResponse.json({ data')
    expect(adminApi).not.toContain('NextResponse.json({ data')
    expect(ownerApi).toContain('readBoundedAdvertiserJson(request, 16_384)')
    expect(adminApi).toContain('readBoundedAdvertiserJson(request, 4_096)')
    expect(boundedJson).toContain('bytes > maxBytes')
  })

  it('keeps public delivery fail-soft, no-store and segment-exact', () => {
    const publicApi = source('app/api/kviss/public/ad/route.ts')
    const repository = source('lib/advertiser/repository.server.ts')
    const middleware = source('middleware.ts')
    expect(publicApi).toContain("'Cache-Control': 'private, no-store'")
    expect(publicApi).toContain("process.env.PUBLIC_QUIZ_ADS_ENABLED !== 'true'")
    expect(repository).toContain('return null')
    expect(middleware).toContain('(?:lookup|join|session|answer|chat|ad)$')
    expect(middleware).not.toContain('chat|ad)(?:/')
  })

  it('places review under the authenticated admin segment with a loading state', () => {
    const adminPage = source('app/(admin)/admin/advertiser/page.tsx')
    const adminLoading = source('app/(admin)/admin/advertiser/loading.tsx')
    const ownerLoading = source('app/auth-mvp/auglysandi/loading.tsx')
    expect(adminPage).toContain('requireAdmin')
    expect(adminPage).toContain('AdvertiserReviewClient')
    expect(adminLoading).toContain('AdvertiserLoading')
    expect(ownerLoading).toContain('AdvertiserLoading')
  })

  it('keeps Icelandic and English advertiser message keys in parity', () => {
    const isMessages = JSON.parse(source('messages/is.json')) as { advertiser: Record<string, unknown> }
    const enMessages = JSON.parse(source('messages/en.json')) as { advertiser: Record<string, unknown> }
    expect(Object.keys(isMessages.advertiser).sort()).toEqual(Object.keys(enMessages.advertiser).sort())
  })
})
