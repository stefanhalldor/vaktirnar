import type { ScopedChatTransport } from '@/components/chat/ScopedChatPanel'

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
}
