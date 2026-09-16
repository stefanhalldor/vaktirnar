import 'server-only'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { listReceiptAiExemptions, setReceiptAiExemption } from '@/lib/receipt-split/ai-quota.server'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const mutationSchema = z.object({
  email: z.string().trim().email().max(320),
  enabled: z.boolean(),
  note: z.string().trim().max(240).default(''),
}).strict()

export async function GET() {
  const auth = await requireAdmin(await createClient())
  if (auth.error) return auth.error
  if (!auth.user) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
  try {
    return NextResponse.json({ items: await listReceiptAiExemptions() }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(await createClient())
  if (auth.error) return auth.error
  if (!auth.user) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: NO_STORE })
  try {
    const item = await setReceiptAiExemption({ adminUserId: auth.user.id, ...parsed.data })
    return NextResponse.json({ item }, { headers: NO_STORE })
  } catch (error) {
    const missing = error instanceof Error && error.message === 'receipt_ai_user_not_found'
    return NextResponse.json({ error: missing ? 'notFound' : 'failed' }, { status: missing ? 404 : 503, headers: NO_STORE })
  }
}
