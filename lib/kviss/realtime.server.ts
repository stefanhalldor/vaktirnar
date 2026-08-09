import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'

export async function notifyKvissInvalidation(topic: string | null, revision?: number): Promise<void> {
  if (!topic || process.env.KVISS_REALTIME_ENABLED !== 'true') return
  const admin = getAdmin()
  const channel = admin.channel(topic)
  try {
    await channel.send({
      type: 'broadcast', event: 'invalidate',
      payload: revision === undefined ? { kind: 'invalidate' } : { kind: 'invalidate', revision },
    })
  } catch {
    // Broadcast is deliberately lossy. HTTP projections and polling remain authoritative.
  } finally {
    await admin.removeChannel(channel).catch(() => undefined)
  }
}
