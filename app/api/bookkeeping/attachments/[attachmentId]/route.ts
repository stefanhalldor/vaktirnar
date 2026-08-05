import { NextResponse } from 'next/server'
import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { BookkeepingIdSchema } from '@/lib/bookkeeping/validation'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params
  if (!BookkeepingIdSchema.safeParse(attachmentId).success) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  try {
    const { user } = await guardBookkeepingAccess()
    const admin = getAdmin()
    const lookup = await admin.rpc('bookkeeping_get_attachment_for_download', {
      p_actor_id: user.id,
      p_attachment_id: attachmentId,
    })
    if (lookup.error || !lookup.data || typeof lookup.data !== 'object') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const metadata = Array.isArray(lookup.data) ? lookup.data[0] : lookup.data
    if (!metadata || typeof metadata !== 'object') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const record = metadata as Record<string, unknown>
    if (typeof record.bucket_id !== 'string' || typeof record.object_path !== 'string') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const signed = await admin.storage.from(record.bucket_id).createSignedUrl(record.object_path, 60)
    if (signed.error || !signed.data?.signedUrl) {
      return NextResponse.json({ error: 'unexpected_error' }, { status: 500 })
    }
    const response = NextResponse.redirect(signed.data.signedUrl, 302)
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
}
