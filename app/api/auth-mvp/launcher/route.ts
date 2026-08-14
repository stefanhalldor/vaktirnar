import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTeskeidLauncherFeature, resolveTeskeidLauncher } from '@/lib/teskeid/launcher.server'
import { verifyTeskeidLauncherCommitProof } from '@/lib/teskeid/launcherCommitProof.server'
import { isTeskeidLauncherId } from '@/lib/teskeid/launcherCatalog'
import { recordTeskeidLauncherOpen } from '@/lib/teskeid/launcherUsage.server'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff',
}
const MAX_BODY_BYTES = 256

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS })
}

async function authenticatedUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id && user.email ? user : null
}

function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

interface LauncherCommitBody {
  featureId: unknown
  commitProof: unknown
}

async function readLauncherCommit(request: Request): Promise<LauncherCommitBody | null> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null
    const value = JSON.parse(text) as { featureId?: unknown; commitProof?: unknown }
    return value && typeof value === 'object'
      ? { featureId: value.featureId, commitProof: value.commitProof }
      : null
  } catch {
    return null
  }
}

export async function GET() {
  const user = await authenticatedUser()
  if (!user) return privateJson({ error: 'unauthorized' }, 401)
  const launcher = await resolveTeskeidLauncher(user)
  return privateJson({
    featureIds: launcher.featureIds,
    agentCollaborationAvailable: launcher.agentCollaborationAvailable,
    usageAvailable: launcher.usageAvailable,
  })
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return privateJson({ error: 'forbidden' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return privateJson({ error: 'unsupported_media_type' }, 415)
  }
  const user = await authenticatedUser()
  if (!user) return privateJson({ error: 'unauthorized' }, 401)
  const commit = await readLauncherCommit(request)
  if (!commit || !isTeskeidLauncherId(commit.featureId)) {
    return privateJson({ error: 'invalid_feature' }, 400)
  }
  if (!verifyTeskeidLauncherCommitProof(user.id, commit.commitProof)) {
    return privateJson({ error: 'stale_session' }, 403)
  }
  if (!await canAccessTeskeidLauncherFeature(user, commit.featureId)) {
    return privateJson({ error: 'not_found' }, 404)
  }

  await recordTeskeidLauncherOpen(user.id, commit.featureId)
  // Usage is deliberately best-effort. A missing SQL71 table must never block navigation.
  return new NextResponse(null, { status: 204, headers: PRIVATE_HEADERS })
}
