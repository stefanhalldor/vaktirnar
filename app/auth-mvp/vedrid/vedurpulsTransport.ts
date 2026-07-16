import type { ScopedChatTransport } from '@/components/chat/ScopedChatPanel'
import { createClient } from '@/lib/supabase/client'

export const VEDURPULS_TRANSPORT: ScopedChatTransport = {
  async loadMessages(threadId, opts) {
    const params = new URLSearchParams({ threadId, limit: String(opts?.limit ?? 10) })
    if (opts?.before) params.set('before', opts.before)
    const res = await fetch(`/api/auth-mvp/vedurpuls/messages?${params}`)
    if (!res.ok) throw new Error('load failed')
    return res.json()
  },
  async markRead(threadId) {
    await fetch('/api/auth-mvp/vedurpuls/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId }),
    })
  },
  async sendMessage(threadId, body) {
    const res = await fetch('/api/auth-mvp/vedurpuls/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, body }),
    })
    if (!res.ok) throw new Error('send failed')
    return res.json()
  },

  subscribe(threadId, onNewMessage) {
    // NOTE: This subscription requires `teskeid_chat_messages` to be added to the
    // Supabase Realtime publication and appropriate RLS/grants to be in place.
    // Without that config the channel subscribes silently but delivers no events;
    // polling in ScopedChatPanel continues as fallback. Do not add broad grants to
    // "fix" this without a dedicated security review (see TODO-086 v334 handoff).
    const client = createClient()
    const channel = client
      .channel(`vedurpuls:thread:${threadId}`)
      .on(
        'postgres_changes' as const,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'teskeid_chat_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        // Re-fetch from server rather than trusting the realtime payload —
        // ensures RLS, hidden/deleted state, and author display are applied correctly.
        () => { onNewMessage() },
      )
      .subscribe()

    return () => { client.removeChannel(channel) }
  },
}
