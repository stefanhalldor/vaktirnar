import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { refreshRoadGraphSnapshot } from '@/lib/iceland-routes/roadGraphRefresh.server'
import { readActiveRoadGraphSnapshotMetadata } from '@/lib/iceland-routes/roadGraphSnapshotStore.server'
import {
  parseRoadGraphRuntimeBuildContractV1,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
} from '@/lib/iceland-routes/roadGraphSnapshotFormat'

export const runtime = 'nodejs'
export const maxDuration = 300

const NO_STORE = { 'Cache-Control': 'private, no-store' }

async function authorizeAdmin() {
  const supabase = await createClient()
  return await requireAdmin(supabase)
}

/** Safe operational projection. Storage pointers, hashes and source metadata stay server-only. */
export async function GET() {
  const auth = await authorizeAdmin()
  if (auth.error) return auth.error
  try {
    const metadata = await readActiveRoadGraphSnapshotMetadata()
    if (!metadata) {
      return NextResponse.json({ status: 'missing' }, { headers: NO_STORE })
    }
    const contract = parseRoadGraphRuntimeBuildContractV1(
      metadata.validation.runtimeBuildContract,
    )
    const policyFingerprint = contract?.policyFingerprint ?? null
    return NextResponse.json({
      status: 'ready',
      snapshotId: metadata.id,
      policyFingerprint,
      isV4: policyFingerprint === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
      goldenRoutePassCount: metadata.goldenRoutePassCount,
      goldenRouteTotalCount: metadata.goldenRouteTotalCount,
      promotedAtIso: metadata.promotedAtIso,
    }, { headers: NO_STORE })
  } catch {
    return NextResponse.json(
      { status: 'error' },
      { status: 503, headers: NO_STORE },
    )
  }
}

/** Manual bootstrap/refresh for an authenticated Teskeið admin. */
export async function POST() {
  const auth = await authorizeAdmin()
  if (auth.error) return auth.error

  const result = await refreshRoadGraphSnapshot('admin')
  return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 })
}
